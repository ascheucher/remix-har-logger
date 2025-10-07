// src/index.ts
import fs from "fs";
import { promisify } from "util";

const fsReadFile = promisify(fs.readFile);
const fsWriteFile = promisify(fs.writeFile);
const fsAppendFile = promisify(fs.appendFile);
const fsAccess = promisify(fs.access);

export type NameValue = { name: string; value: string };

export interface LogOptions {
  jsonlPath?: string;
  harFilePath?: string;
  maxBodyChars?: number;
  includeResponse?: boolean;
  creatorName?: string;
  creatorVersion?: string;
}

const DEFAULTS: Required<LogOptions> = {
  jsonlPath: "./har-entries.jsonl",
  harFilePath: "",
  maxBodyChars: 100_000,
  includeResponse: false,
  creatorName: "remix-har-logger",
  creatorVersion: "1.0.0"
};

function isNodeRuntime(): boolean {
  return typeof process !== "undefined" && !!(process as any).versions?.node;
}

function headersToArray(headers: Headers | Record<string, string | string[] | undefined>): NameValue[] {
  const out: NameValue[] = [];
  if (headers instanceof Headers) {
    for (const [k, v] of headers.entries()) out.push({ name: k, value: v });
  } else {
    for (const k of Object.keys(headers)) {
      const v = (headers as any)[k];
      if (Array.isArray(v)) {
        for (const vv of v) out.push({ name: k, value: String(vv) });
      } else if (v !== undefined) {
        out.push({ name: k, value: String(v) });
      }
    }
  }
  return out;
}

function queryToArray(url: URL): NameValue[] {
  const out: NameValue[] = [];
  for (const [k, v] of url.searchParams.entries()) out.push({ name: k, value: v });
  return out;
}

function isProbablyText(mime?: string) {
  if (!mime) return false;
  const t = mime.split(";")[0].trim().toLowerCase();
  return (
    t.startsWith("text/") ||
    t === "application/json" ||
    t === "application/javascript" ||
    t === "application/xml" ||
    t.endsWith("+json") ||
    t.endsWith("+xml")
  );
}

function maybeTruncate(text: string, maxChars: number) {
  if (!text) return text;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n...[truncated ${text.length - maxChars} chars]`;
}

/**
 * Build a HAR "entry" object for the provided request and optional response.
 */
export async function logHarEntry(
  request: Request,
  response?: Response | null,
  opts?: LogOptions
): Promise<void> {
  const cfg: Required<LogOptions> = { ...DEFAULTS, ...(opts ?? {}) } as Required<LogOptions>;

  // Clone request to safely read the body without consuming caller's stream
  let reqClone: Request = request;
  try {
    if (typeof (request as any).clone === "function") reqClone = (request as any).clone();
  } catch {
    reqClone = request;
  }

  const startedDateTime = new Date().toISOString();
  const url = new URL(request.url);
  const method = request.method;
  const httpVersion = "HTTP/1.1";

  // Read request body (if any)
  let reqBodyText: string | null = null;
  let reqBodyBase64: string | null = null;
  try {
    const contentType = request.headers.get("content-type") ?? undefined;
    const buf = await reqClone.arrayBuffer().catch(() => null);
    if (buf && buf.byteLength > 0) {
      const uint8 = new Uint8Array(buf);
      if (isProbablyText(contentType)) {
        reqBodyText = new TextDecoder("utf-8", { fatal: false }).decode(uint8);
        reqBodyText = maybeTruncate(reqBodyText, cfg.maxBodyChars);
      } else {
        // binary -> base64
        reqBodyBase64 = Buffer.from(uint8).toString("base64");
      }
    }
  } catch {
    // reading body failed; leave as null
  }

  const harRequest: any = {
    method,
    url: request.url,
    httpVersion,
    cookies: [],
    headers: headersToArray(request.headers),
    queryString: queryToArray(url),
    headersSize: -1,
    bodySize: -1
  };

  if (reqBodyText !== null) {
    harRequest.postData = {
      mimeType: request.headers.get("content-type") || "application/octet-stream",
      text: reqBodyText
    };
  } else if (reqBodyBase64 !== null) {
    harRequest.postData = {
      mimeType: request.headers.get("content-type") || "application/octet-stream",
      text: reqBodyBase64,
      encoding: "base64"
    };
  }

  // Build response object if requested and provided
  let harResponse: any = null;
  if (response && cfg.includeResponse) {
    let respClone = response;
    try {
      if (typeof (response as any).clone === "function") respClone = (response as any).clone();
    } catch {
      respClone = response;
    }

    const status = response.status;
    const statusText = response.statusText;
    const respHeaders = headersToArray(response.headers);
    let respBodyText: string | null = null;
    let respBodyBase64: string | null = null;
    try {
      const buf = await respClone.arrayBuffer().catch(() => null);
      if (buf && buf.byteLength > 0) {
        const contentType = response.headers.get("content-type") ?? undefined;
        const uint8 = new Uint8Array(buf);
        if (isProbablyText(contentType)) {
          respBodyText = new TextDecoder("utf-8", { fatal: false }).decode(uint8);
          respBodyText = maybeTruncate(respBodyText, cfg.maxBodyChars);
        } else {
          respBodyBase64 = Buffer.from(uint8).toString("base64");
        }
      }
    } catch {
      // ignore
    }

    harResponse = {
      status,
      statusText,
      httpVersion,
      headers: respHeaders,
      cookies: [],
      content: {
        size: respBodyBase64 ? Buffer.from(respBodyBase64, "base64").length : (respBodyText ? respBodyText.length : 0),
        mimeType: response.headers.get("content-type") || "application/octet-stream",
        text: respBodyText ?? respBodyBase64 ?? "",
        encoding: respBodyBase64 ? "base64" : undefined
      },
      redirectURL: response.headers.get("location") || "",
      headersSize: -1,
      bodySize: -1
    };
  }

  const entry = {
    startedDateTime,
    time: 0,
    request: harRequest,
    response: harResponse ?? {
      status: 0,
      statusText: "",
      httpVersion,
      headers: [],
      cookies: [],
      content: { size: 0, mimeType: "", text: "" },
      redirectURL: "",
      headersSize: -1,
      bodySize: -1
    },
    cache: {},
    timings: { send: 0, wait: 0, receive: 0 },
    serverIPAddress: "",
    connection: ""
  };

  const jsonlLine = JSON.stringify(entry) + "\n";

  try {
    if (isNodeRuntime()) {
      await fsAppendFile(cfg.jsonlPath, jsonlLine, { encoding: "utf8" });
    } else {
      // Edge or other runtime: write to console (or adapt to send to a logging endpoint)
      // eslint-disable-next-line no-console
      console.log("[harLogger] entry (jsonl)", entry);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[harLogger] failed to append jsonl:", (e as Error).message);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  }

  if (cfg.harFilePath && isNodeRuntime()) {
    try {
      const harRoot = {
        log: {
          version: "1.2",
          creator: {
            name: cfg.creatorName,
            version: cfg.creatorVersion
          },
          entries: [] as any[]
        }
      };

      let current = harRoot;
      try {
        await fsAccess(cfg.harFilePath, fs.constants.F_OK);
        const raw = await fsReadFile(cfg.harFilePath, { encoding: "utf8" });
        const parsed = JSON.parse(raw);
        if (parsed && parsed.log && Array.isArray(parsed.log.entries)) {
          current = parsed;
        }
      } catch {
        // create new
      }

      current.log.entries.push(entry);
      await fsWriteFile(cfg.harFilePath, JSON.stringify(current, null, 2), { encoding: "utf8" });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[harLogger] failed to update .har file:", (e as Error).message);
    }
  }
}
