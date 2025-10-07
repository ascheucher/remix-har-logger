// tests/harLogger.test.ts
import { describe, it, expect, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { logHarEntry } from "../src/index.js";

const TMP_DIR = path.resolve("./tmp-tests");

async function createTestDir(testName: string): Promise<string> {
  const testDir = path.join(TMP_DIR, randomUUID());
  await fs.mkdir(testDir, { recursive: true });
  await fs.writeFile(path.join(testDir, testName), "", "utf8");
  return testDir;
}

afterAll(async () => {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
});

describe("logHarEntry basic tests", () => {
  it("logs a basic request as JSONL", async () => {
    const testDir = await createTestDir("logs-a-basic-request-as-JSONL");
    const jsonlPath = path.join(testDir, "entries.jsonl");

    const req = new Request("https://example.com/api?x=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ foo: "bar" })
    });

    await logHarEntry(req, null, { jsonlPath });

    const file = await fs.readFile(jsonlPath, "utf8");
    const lines = file.trim().split("\n");
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.request.method).toBe("POST");
    expect(entry.request.url).toContain("example.com");
    expect(entry.request.postData.text).toContain('"foo":"bar"');
  });

  it("creates a HAR file with multiple entries", async () => {
    const testDir = await createTestDir("creates-a-HAR-file-with-multiple-entries");
    const harPath = path.join(testDir, "entries.har");

    const req1 = new Request("https://a.test/path", { method: "GET" });
    const req2 = new Request("https://b.test/path?z=9", { method: "POST", body: "x=1" });

    await logHarEntry(req1, null, { harFilePath: harPath });
    await logHarEntry(req2, null, { harFilePath: harPath });

    const harJson = JSON.parse(await fs.readFile(harPath, "utf8"));
    expect(harJson.log.entries.length).toBe(2);
  });

  it("logs response body if includeResponse is true", async () => {
    const testDir = await createTestDir("logs-response-body-if-includeResponse-is-true");
    const jsonlPath = path.join(testDir, "entries.jsonl");

    const req = new Request("https://foo.bar/test", { method: "GET" });
    const res = new Response(JSON.stringify({ hi: "there" }), {
      headers: { "content-type": "application/json" }
    });

    await logHarEntry(req, res, {
      includeResponse: true,
      jsonlPath
    });

    const file = await fs.readFile(jsonlPath, "utf8");
    const entry = JSON.parse(file.trim().split("\n")[0]);
    expect(entry.response.content.text).toContain("hi");
  });

  it("handles binary request bodies gracefully", async () => {
    const testDir = await createTestDir("handles-binary-request-bodies-gracefully");
    const jsonlPath = path.join(testDir, "entries.jsonl");

    const buf = new Uint8Array([0, 1, 2, 3, 4]);
    const req = new Request("https://bin.test/upload", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: buf
    });

    await logHarEntry(req, null, { jsonlPath });
    const file = await fs.readFile(jsonlPath, "utf8");
    const entry = JSON.parse(file.trim().split("\n")[0]);
    expect(entry.request.postData.encoding).toBe("base64");
  });
});
