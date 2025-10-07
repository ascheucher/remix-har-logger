# Remix HAR Logger

[The ChatGPT Chat](https://chatgpt.com/c/68e4cf3b-1cf4-8328-bbb1-b204877aa386)

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
