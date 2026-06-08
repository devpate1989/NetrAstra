// `tsc` only compiles .ts files — static assets like the Devanagari fonts
// embedded by reportPdf.service.ts (resolved relative to __dirname at runtime,
// so they must live alongside the compiled .js in dist/) need to be copied
// into dist/ manually after each build. Plain Node so it works on every OS.
const fs = require("fs");
const path = require("path");

const src = path.resolve(__dirname, "..", "src", "assets");
const dest = path.resolve(__dirname, "..", "dist", "assets");

if (fs.existsSync(src)) {
  fs.cpSync(src, dest, { recursive: true });
  console.log(`Copied ${src} -> ${dest}`);
}
