/* SPDX-License-Identifier: MIT
 * HumanGated LiveGate — MIT (c) Brightwing Systems, LLC
 *
 * The public entry point.
 *
 * `./grant.js` is imported first and imports nothing itself, so the very
 * first code this bundle runs is `history.replaceState` taking `?hg=` out of
 * the URL. Everything below happens after that, including reading the config.
 *
 * Dormant is the default and it is cheap: with no `?hg=` and no live session
 * in sessionStorage, `arm()` returns `null` having made no request, added no
 * node, bound no listener and set no timer.
 */

import { grant } from "./grant.js";
import { resolve, fromScript } from "./config.js";
import { transport, detail } from "./transport.js";
import * as store from "./session.js";
import { mount } from "./overlay.js";

export const version = "1.0.0";

/* Whether this page view arrived holding a grant — useful when someone is
   debugging an install. The token itself is never exported, never put on a
   global, and never written anywhere except the one request that spends it. */
export const arrived = grant !== null;

// setTimeout clamps anything past this to 1ms, which would tear the overlay
// down immediately. A session is ~2h, so this only guards against a server
// sending something absurd.
const MAX_DELAY = 2147483647;

let armed = null;

function begin(cfg, session) {
  if (armed) return armed.handle;

  const request = transport(cfg.apiOrigin);
  const state = { cfg, session, timer: 0, ui: null };

  state.ui = mount({
    cfg,
    session,
    request,
    remember: (s) => store.save(cfg.siteKey, s),
    onDead: (msg) => end(msg),
    // Truthy the moment the clock has run out, however long the tab was
    // asleep. The overlay asks before it opens and before it sends.
    expired: () => store.msLeft(session) <= 0,
  });

  /* At expires_at the overlay tears itself down and says so. It does not
     renew, and there is no code path here that could: a new session needs a
     new grant, and a new grant needs the link in their inbox
     (wire contract §6). */
  function end(msg) {
    clearTimeout(state.timer);
    store.clear(cfg.siteKey);
    state.handle.active = false;
    state.ui.expired(msg || "");
    if (armed === state) armed = null;
  }

  /* A backgrounded tab cannot be trusted to fire its timer on time — browsers
     throttle them hard and Safari can suspend them outright, so the overlay can
     still look live on a dead session.

     The obvious fix is a `visibilitychange` listener, and it is the wrong one:
     this package promises not one listener on the customer's document outside
     pin mode, and that promise is worth more than the convenience. So the
     overlay re-checks the clock LAZILY instead — before it opens the composer
     and again before it sends — via `expired()` below. That covers the harm
     exactly, because the harm is writing a note and losing it at submit. */
  state.handle = {
    active: true,
    reviewer: session.reviewer,
    request_uuid: session.request_uuid,
    kind: session.kind,
    expires_at: session.expires_at,
    teardown() {
      clearTimeout(state.timer);
      state.handle.active = false;
      state.ui.destroy();
      store.clear(cfg.siteKey);
      if (armed === state) armed = null;
    },
  };
  armed = state;
  state.timer = setTimeout(() => end(""), Math.min(Math.max(store.msLeft(session), 0), MAX_DELAY));
  return state.handle;
}

async function wake(cfg, token) {
  const request = transport(cfg.apiOrigin);
  let res;
  try {
    res = await request("/api/livegate/session", {
      body: { handoff: token, site_key: cfg.siteKey, release: cfg.release },
    });
  } catch {
    // No response at all — offline, DNS, a CSP that blocks connect-src. This
    // used to show nothing whatsoever, which reads as "the link is broken" and
    // sends the reviewer away. Naming it is the difference between a retry and
    // a lost review.
    notice(
      "Couldn't reach HumanGated to open your review. Check your connection " +
      "and reload this page — your link is still good."
    );
    return null;
  }
  if (!res.ok) {
    // A refusal is a dead end, not a retry: the handoff is single-use and
    // already spent. Say so where the reviewer is standing, because the
    // alternative is a page that looks exactly like it worked.
    notice(await detail(res, "This review link is no longer valid."));
    return null;
  }
  let body;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  const session = store.adopt(body, cfg);
  if (!session) return null;
  const persisted = store.save(cfg.siteKey, session);
  const gate = begin(cfg, session);
  if (!persisted) {
    notice(
      "Your review is open, but this browser won't remember it if you " +
      "navigate away — finish on this page, or reopen the link from your inbox."
    );
  }
  return gate;
}

/** A dead-link message, in its own throwaway shadow root. */
function notice(msg) {
  const host = document.createElement("hg-livegate");
  host.setAttribute("data-hg-redact", "");
  host.style.cssText =
    "all:initial;position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;" +
    "font:14px/1.5 -apple-system,system-ui,sans-serif";
  const root = host.attachShadow({ mode: "open" });
  const box = document.createElement("div");
  box.style.cssText =
    "max-width:420px;margin:0 auto;background:#131519;color:#e9e7e0;border:1px solid #2a2e35;" +
    "border-left:3px solid #ff4b31;border-radius:10px;padding:12px 14px;display:flex;gap:10px";
  const text = document.createElement("div");
  text.style.cssText = "flex:1";
  text.textContent = msg + " Open the link from your inbox again for a fresh one.";
  const x = document.createElement("button");
  x.type = "button";
  x.textContent = "×";
  x.setAttribute("aria-label", "Dismiss");
  x.style.cssText =
    "flex:none;min-width:44px;min-height:44px;background:none;border:0;color:#8f96a0;font:18px/1 inherit;cursor:pointer";
  x.addEventListener("click", () => host.remove());
  box.append(text, x);
  root.appendChild(box);
  (document.body || document.documentElement).appendChild(host);
}

/**
 * Wake the overlay if — and only if — this visitor is a reviewer.
 *
 * Returns `null`, synchronously, when there is nothing to wake for: no
 * `?hg=` and no live session. Otherwise a Promise for the handle (which may
 * still resolve to `null` if the server refuses the handoff).
 *
 *   const gate = await arm({ siteKey, release });   // null on an ordinary visit
 *
 * @param {{siteKey:string, release?:string, api?:string, redact?:string[]}} opts
 * @returns {Promise<object|null>|null}
 */
export function arm(opts) {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  if (armed) return Promise.resolve(armed.handle);

  const cfg = resolve(opts);
  if (!cfg) return null;

  if (grant) return wake(cfg, grant);

  const session = store.load(cfg.siteKey);
  if (!session) return null; // dormant, and that is the whole of it
  return Promise.resolve(begin(cfg, session));
}

/** Remove the overlay, clear the session, and stop. */
export function disarm() {
  if (armed) armed.handle.teardown();
}

/** Auto-arm from our own <script data-hg-site="…"> tag. Used by the CDN build. */
export function armFromTag(el) {
  const opts = fromScript(el);
  return opts.siteKey ? arm(opts) : null;
}
