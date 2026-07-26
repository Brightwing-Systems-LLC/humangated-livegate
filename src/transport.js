/* SPDX-License-Identifier: MIT
 * HumanGated LiveGate — MIT (c) Brightwing Systems, LLC
 *
 * The only place in this package that makes a network request.
 *
 * "Grants annotation, never access" is testable precisely because this
 * function exists once and refuses anything that is not the configured API
 * origin. Three habits hold the line:
 *
 *   credentials: "omit"   — we do not want the customer's cookies and will
 *                           not accept them (wire contract §4).
 *   redirect: "error"     — a redirect is the one way a same-origin request
 *                           reaches a different origin without us asking.
 *   an explicit origin check on the resolved URL, so a caller passing an
 *                           absolute URL cannot route around it.
 *
 * We call the page's `fetch` by reference. We never patch it, and we never
 * touch XMLHttpRequest.
 */

export class OffOrigin extends Error {}

export function transport(apiOrigin) {
  return function request(path, opts) {
    const o = opts || {};
    let url;
    try {
      url = new URL(path, apiOrigin + "/");
    } catch {
      return Promise.reject(new OffOrigin("livegate: bad path"));
    }
    if (url.origin !== apiOrigin) {
      return Promise.reject(new OffOrigin("livegate: refused a request to " + url.origin));
    }

    const headers = { "Content-Type": "application/json" };
    if (o.token) headers.Authorization = "Bearer " + o.token;

    return fetch(url.href, {
      method: o.method || "POST",
      headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
  };
}

/** A 4xx from us always carries a `detail` a human could read. */
export async function detail(res, fallback) {
  try {
    const body = await res.json();
    if (body && typeof body.detail === "string" && body.detail.trim()) return body.detail.trim();
  } catch {
    /* not JSON; the fallback is the honest answer */
  }
  return fallback;
}
