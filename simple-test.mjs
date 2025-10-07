import { logHarEntry } from "./dist/index.js";

const req = new Request("https://example.com/foo?x=1", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ hello: "world" })
});

await logHarEntry(req, null, { jsonlPath: "./logs/test-jsonl.jsonl" });
console.log("done");
