/* SPDX-License-Identifier: MIT
 * HumanGated LiveGate — MIT (c) Brightwing Systems, LLC
 *
 * The session: one reviewer, one ask, one origin, about two hours.
 *
 * sessionStorage, keyed by site key. Not localStorage — a review session must
 * not outlive the tab. Not a cookie — nothing we do should add a cookie to
 * someone else's domain (wire contract §2).
 *
 * We store a whitelist of the fields the contract defines and nothing else,
 * so a future server field cannot quietly become client state.
 */

const PREFIX = "hg.lg.";

export function storeKey(siteKey) {
  return PREFIX + siteKey;
}

function str(v) {
  return typeof v === "string" ? v : "";
}
function arr(v) {
  return Array.isArray(v) ? v : [];
}

/** Build the stored session from the exchange response. */
export function adopt(payload, cfg) {
  const p = payload || {};
  if (!str(p.session) || !str(p.expires_at)) return null;
  if (!Number.isFinite(Date.parse(p.expires_at))) return null;
  return {
    session: p.session,
    expires_at: p.expires_at,
    reviewer: str(p.reviewer),
    request_uuid: str(p.request_uuid),
    objective: str(p.objective),
    declared: str(p.declared),
    capsule: str(p.capsule),
    action: str(p.action),
    kind: str(p.kind) || "review",
    options: arr(p.options),
    questions: arr(p.questions),
    screenshots: p.screenshots === true,
    redact: arr(p.redact).filter((s) => typeof s === "string" && s.trim()),
    // Ours, not the server's.
    origin: window.location.origin,
    release: cfg.release,
    intro: false,
  };
}

export function msLeft(s) {
  const at = Date.parse(s && s.expires_at);
  return Number.isFinite(at) ? at - Date.now() : -1;
}

export function load(siteKey) {
  let raw = null;
  try {
    raw = window.sessionStorage.getItem(storeKey(siteKey));
  } catch {
    return null;
  }
  if (!raw) return null;

  let s = null;
  try {
    s = JSON.parse(raw);
  } catch {
    /* fall through to the clear below */
  }
  // An origin check as well as an expiry check: sessionStorage is already
  // origin-scoped, but a session that outlived a hostname change is a session
  // pointed at the wrong page.
  if (!s || !str(s.session) || s.origin !== window.location.origin || msLeft(s) <= 0) {
    clear(siteKey);
    return null;
  }
  return s;
}

/** True when the last `save` could not persist. The reviewer is told once —
    silently losing their session on the next click is the kind of failure
    people blame themselves for. */
export function save(siteKey, s) {
  try {
    window.sessionStorage.setItem(storeKey(siteKey), JSON.stringify(s));
    return true;
  } catch {
    /* Safari private mode, quota, a paranoid CSP. The overlay works fine right
       now and will simply not survive a navigation — which is worth saying,
       because the reviewer is about to click something. */
    return false;
  }
}

export function clear(siteKey) {
  try {
    window.sessionStorage.removeItem(storeKey(siteKey));
  } catch {
    /* nothing to do and nothing to say */
  }
}
