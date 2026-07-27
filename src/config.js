/* SPDX-License-Identifier: MIT
 * HumanGated LiveGate — MIT (c) Brightwing Systems, LLC
 *
 * Where we are allowed to talk to, and who is asking.
 *
 * The site key is public: it names an origin and authorises nothing (wire
 * contract §2). The API origin is resolved once, here, and every request is
 * checked against it — see transport.js.
 */

/* There is deliberately NO default API origin.
   
   There used to be one — `https://api.humangated.ai`, taken from the wire
   contract — and that host does not exist. `/api/livegate/*` is served from the
   application origin. An install that leaned on the default would have looked
   perfectly fine until the moment a reviewer arrived, and then failed on every
   request, on a customer's production page, with our name on it.
   
   A wrong default fails at review time. A missing one fails at install time,
   where somebody is already looking. So the origin must be stated. */

function text(v) {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

function selectors(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim());
}

// Plain http is allowed only against a loopback host, so a customer can run
// the whole thing on their laptop without us pretending that is production.
function loopback(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
}

/**
 * @returns {{siteKey:string, release:string|null, apiOrigin:string, redact:string[]}|null}
 */
export function resolve(opts) {
  const o = opts || {};
  const siteKey = text(o.siteKey);
  if (!siteKey) return null;

  const given = text(o.api);
  if (!given) return null;   // stated, or nothing happens — see above
  let api;
  try {
    api = new URL(given);
  } catch {
    return null;
  }
  if (api.protocol !== "https:" && !(api.protocol === "http:" && loopback(api.hostname))) return null;

  return {
    siteKey,
    release: text(o.release) || null,
    apiOrigin: api.origin,
    redact: selectors(o.redact),
  };
}

/** Read the install options off our own <script> tag. */
export function fromScript(el) {
  if (!el || !el.getAttribute) return {};
  return {
    siteKey: el.getAttribute("data-hg-site"),
    release: el.getAttribute("data-hg-release"),
    api: el.getAttribute("data-hg-api"),
  };
}
