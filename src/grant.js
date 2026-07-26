/* SPDX-License-Identifier: MIT
 * HumanGated LiveGate — MIT (c) Brightwing Systems, LLC
 *
 * The handoff token, and getting it out of the URL.
 *
 * This module imports nothing, on purpose. ES module bodies run in import
 * order, so a module with no imports of its own is the first code in the
 * bundle — which is the only way to make "we remove ?hg= before anything
 * else runs" a fact about the build rather than a claim in a README.
 *
 * The token is in the URL for one hop between two servers. While it is there
 * it can reach a referrer header, an analytics beacon, a screenshot, or a
 * server log. So: strip first, then decide whether we even want it.
 *
 * If the strip fails, the grant is discarded. A grant we cannot hide is a
 * grant we would rather not hold.
 */

const PARAM = "hg";

function strip() {
  if (typeof window === "undefined") return null;
  const loc = window.location;
  const hist = window.history;
  if (!loc || !hist || typeof hist.replaceState !== "function") return null;

  const search = loc.search;
  if (!search || search.indexOf(PARAM + "=") === -1) return null;

  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const token = params.get(PARAM);
  if (!token) return null;

  params.delete(PARAM);
  const query = params.toString();
  const clean = loc.pathname + (query ? "?" + query : "") + loc.hash;

  try {
    // Their state object, not ours. We are removing a parameter, not
    // resetting the host page's history entry.
    hist.replaceState(hist.state, "", clean);
  } catch {
    return null;
  }
  return token;
}

/** The handoff token this page arrived with, already removed from the URL. */
export const grant = strip();
