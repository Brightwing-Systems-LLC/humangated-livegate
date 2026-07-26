/* SPDX-License-Identifier: MIT
 *
 * A resolve hook that propagates a parent module's query string to its
 * relative imports, so `import("../src/index.js?t=7")` loads a whole fresh
 * copy of the graph — including grant.js, whose module body is the thing
 * under test in half of these files.
 */
export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL;
  if (parent && (specifier.startsWith("./") || specifier.startsWith("../"))) {
    const q = new URL(parent).search;
    if (q && !specifier.includes("?")) return nextResolve(specifier + q, context);
  }
  return nextResolve(specifier, context);
}
