# Remix HAR Logger

[The ChatGPT Chat](https://chatgpt.com/c/68e4cf3b-1cf4-8328-bbb1-b204877aa386)

## How to use

For Shopify Remix apps, do following:

### Install it

```bash
pnpm set registry https://verdaccio.hill.eremite.cc
pnpm install remix-har-logger
```

### log from entry/server.tsx

app/entry.server.tsx

```TypeScript

import { logHarEntry } from "remix-har-logger";
import path from "path"
import fs from "fs/promises"

...

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {

  // Add the logging

  // create an empty file, to paste the client requests in HAR format
  const clientLogFileName = "har-entries-client-summit-sku-steward-v3-85-3.har"
  await fs.writeFile(path.resolve(clientLogFileName), "", { flag: "w" })

  // log the requests received by the server
  const serverLogFileName = "har-entries-server-summit-sku-steward-v3-85-3"
  await logHarEntry(request, null, {
    jsonlPath: `${serverLogFileName}.jsonl`,
    harFilePath: `${serverLogFileName}.har`
  });

  ...
```

### Split the .har files

To be able to compare the single requests between client & server, use the *split_har.sh* script:

```bash
for har in *.har  
do
./split_har.sh $har
done
```

To make the client .har files a bit more convenient, it also strips the *_initiator* nodes, to get rid of the JavaScript stack traces.

### Compare the requests

Look into the files to see which belong together and compare them with our favorite diff tool (e.g. VSC, Beyond Compare, ...)

## Redaction & filtering

recommended quick additionsL

If you want to avoid logging Authorization or cookies by default, modify src/index.ts before the write step to sanitize headers. 

Example helper:

```
function redactHeaderArray(arr: NameValue[]) {
  const out = arr.map(h => {
    if (h.name.toLowerCase() === "authorization" || h.name.toLowerCase() === "cookie") {
      return { name: h.name, value: "[REDACTED]" };
    }
    return h;
  });
  return out;
}
```

Then apply to `harRequest.headers = redactHeaderArray(harRequest.headers)` and `harResponse.headers = redactHeaderArray(harResponse.headers)`.

You can also add a `filter?: (req: Request) => boolean` option to `LogOptions` and early return when `filter(request) === false`.

## If you prefer a bundled single-file ESM (optional)

If you want one single JS file instead of `dist/*` small files, add Rollup or esbuild to bundle. Example with `esbuild`:

`npm i -D esbuild`

Add script:

`"build:bundle": "esbuild src/index.ts --bundle --platform=node --target=node16 --outfile=dist/index.js --format=esm"`

This bundles into one `dist/index.js`. Still generate types with `tsc --emitDeclarationOnly`.
