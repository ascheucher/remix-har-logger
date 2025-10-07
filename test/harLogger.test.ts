// tests/harLogger.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { logHarEntry } from "../src/index.js";

const TMP_DIR = path.resolve("./tmp-tests");
const JSONL_PATH = path.join(TMP_DIR, "entries.jsonl");
const HAR_PATH = path.join(TMP_DIR, "entries.har");

beforeEach(async () => {
  // await fs.rm(TMP_DIR, { recursive: true, force: true });
  await fs.mkdir(TMP_DIR, { recursive: true });
});

afterAll(async () => {
  // await fs.rm(TMP_DIR, { recursive: true, force: true });
});

describe("logHarEntry basic tests", () => {
  it("logs a basic request as JSONL", async () => {
    const req = new Request("https://example.com/api?x=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ foo: "bar" })
    });

    await logHarEntry(req, null, { jsonlPath: JSONL_PATH });

    const file = await fs.readFile(JSONL_PATH, "utf8");
    const lines = file.trim().split("\n");
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.request.method).toBe("POST");
    expect(entry.request.url).toContain("example.com");
    expect(entry.request.postData.text).toContain('"foo":"bar"');
  });

  it("creates a HAR file with multiple entries", async () => {
    const req1 = new Request("https://a.test/path", { method: "GET" });
    const req2 = new Request("https://b.test/path?z=9", { method: "POST", body: "x=1" });

    await logHarEntry(req1, null, { harFilePath: HAR_PATH });
    await logHarEntry(req2, null, { harFilePath: HAR_PATH });

    const harJson = JSON.parse(await fs.readFile(HAR_PATH, "utf8"));
    expect(harJson.log.entries.length).toBe(2);
  });

  it("logs response body if includeResponse is true", async () => {
    const req = new Request("https://foo.bar/test", { method: "GET" });
    const res = new Response(JSON.stringify({ hi: "there" }), {
      headers: { "content-type": "application/json" }
    });

    await logHarEntry(req, res, {
      includeResponse: true,
      jsonlPath: JSONL_PATH
    });

    const file = await fs.readFile(JSONL_PATH, "utf8");
    const entry = JSON.parse(file.trim().split("\n")[0]);
    expect(entry.response.content.text).toContain("hi");
  });

  it("handles binary request bodies gracefully", async () => {
    const buf = new Uint8Array([0, 1, 2, 3, 4]);
    const req = new Request("https://bin.test/upload", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: buf
    });

    await logHarEntry(req, null, { jsonlPath: JSONL_PATH });
    const file = await fs.readFile(JSONL_PATH, "utf8");
    const entry = JSON.parse(file.trim().split("\n")[0]);
    expect(entry.request.postData.encoding).toBe("base64");
  });
});
