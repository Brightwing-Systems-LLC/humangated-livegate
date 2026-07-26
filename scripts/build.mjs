/* SPDX-License-Identifier: MIT
 * Build both shapes, and the SRI hash that pins the CDN one.
 *
 * esbuild is the only build-time dependency and it fetches nothing. The SRI
 * hash comes out of node:crypto, so a customer can reproduce it from a clone
 * without trusting our CDN listing.
 */
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const banner = `/*! @humangated/livegate ${pkg.version} | MIT | https://github.com/Brightwing-Systems-LLC/humangated-livegate */`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = {
  bundle: true,
  target: ["es2020"],
  legalComments: "none",
  banner: { js: banner },
  logLevel: "warning",
};

// npm: unminified ESM. A lockfile pin is only auditable if the pinned thing
// is readable.
await build({
  ...common,
  entryPoints: [join(root, "src/index.js")],
  outfile: join(dist, "livegate.mjs"),
  format: "esm",
  minify: false,
});

// npm, minified, for anyone who wants to ship it as-is.
await build({
  ...common,
  entryPoints: [join(root, "src/index.js")],
  outfile: join(dist, "livegate.min.mjs"),
  format: "esm",
  minify: true,
});

// CDN: one IIFE, self-arming from its own script tag.
await build({
  ...common,
  entryPoints: [join(root, "src/cdn.js")],
  outfile: join(dist, "livegate.js"),
  format: "iife",
  minify: true,
});

const rows = [];
for (const name of ["livegate.mjs", "livegate.min.mjs", "livegate.js"]) {
  const bytes = readFileSync(join(dist, name));
  rows.push({
    name,
    raw: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes).length,
    sri: "sha384-" + createHash("sha384").update(bytes).digest("base64"),
  });
}

const cdn = rows.find((r) => r.name === "livegate.js");
const url = `https://cdn.humangated.ai/lg/${pkg.version}/livegate.js`;

writeFileSync(
  join(dist, "INTEGRITY.txt"),
  [
    `@humangated/livegate ${pkg.version}`,
    "",
    "Immutable, version-pinned, with the hash to prove it. Reproduce with:",
    "  npm ci && npm run build && cat dist/INTEGRITY.txt",
    "",
    `<script src="${url}"`,
    `        integrity="${cdn.sri}"`,
    '        crossorigin="anonymous"',
    '        data-hg-site="hg_live_…"></script>',
    "",
    ...rows.map((r) => `${r.name}  ${r.raw} B raw  ${r.gzip} B gzip  ${r.brotli} B brotli\n  ${r.sri}`),
    "",
  ].join("\n")
);

for (const r of rows) {
  console.log(`${r.name.padEnd(18)} ${String(r.raw).padStart(7)} B  gzip ${String(r.gzip).padStart(6)} B`);
}
console.log(`\nSRI (${url})\n  ${cdn.sri}`);

// The size promise is part of the product: this runs on other people's
// production pages. Fail the build rather than let it drift.
const BUDGET = 15 * 1024;
if (cdn.gzip > BUDGET) {
  console.error(`\nlivegate.js is ${cdn.gzip} B gzipped, over the ${BUDGET} B budget.`);
  process.exit(1);
}
