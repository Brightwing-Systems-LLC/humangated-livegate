/* SPDX-License-Identifier: MIT
 * HumanGated LiveGate — MIT (c) Brightwing Systems, LLC
 *
 * What the reviewer pointed at: a selector, some redacted text, a rectangle.
 *
 * Anchors are best-effort by construction. A customer's DOM can deploy
 * mid-review and a client-side route change can invalidate the selector, so
 * every response also carries `url` and `release` and the server treats the
 * anchor as a hint, not an address (wire contract §7).
 */

import { forbidden, textOf, MASK } from "./redact.js";

const IDENT = /^[A-Za-z][\w-]*$/;
// Utility and hashed class names are noise in a selector a human has to read,
// and the hashed ones do not survive the next build anyway.
const HASHED = /\d{4,}|^[a-z]{1,2}\d|^(?:css|sc|jsx|emotion|tw)-/i;

function esc(s) {
  return String(s).replace(/[^\w-]/g, (c) => "\\" + c);
}

function unique(doc, sel) {
  try {
    return doc.querySelectorAll(sel).length === 1;
  } catch {
    return false;
  }
}

function classPart(el) {
  const raw = typeof el.className === "string" ? el.className : "";
  const keep = [];
  for (const c of raw.split(/\s+/)) {
    if (!c || !IDENT.test(c) || HASHED.test(c) || c.length > 32) continue;
    keep.push("." + esc(c));
    if (keep.length === 2) break;
  }
  return keep.join("");
}

function nth(el) {
  let i = 1;
  for (let s = el.previousElementSibling; s; s = s.previousElementSibling) {
    if (s.tagName === el.tagName) i++;
  }
  return i;
}

/** A short, readable, reasonably specific path. Never guaranteed stable. */
export function cssPath(el) {
  const doc = el.ownerDocument;
  const parts = [];
  let node = el;
  let depth = 0;

  while (node && node.nodeType === 1 && depth < 6) {
    if (node.id && IDENT.test(node.id) && unique(doc, "#" + esc(node.id))) {
      parts.unshift("#" + esc(node.id));
      break;
    }
    let part = node.tagName.toLowerCase() + classPart(node);
    const i = nth(node);
    if (i > 1) part += ":nth-of-type(" + i + ")";
    parts.unshift(part);
    node = node.parentElement;
    depth++;
  }
  return parts.join(" > ").slice(0, 240);
}

export function rectOf(el) {
  let r;
  try {
    r = el.getBoundingClientRect();
  } catch {
    return null;
  }
  const sx = window.scrollX || 0;
  const sy = window.scrollY || 0;
  return {
    x: Math.round(r.left + sx),
    y: Math.round(r.top + sy),
    w: Math.round(r.width),
    h: Math.round(r.height),
  };
}

/**
 * The page location we are willing to send.
 *
 * Path only. The query string on someone else's app is a common home for
 * session tokens, signed links and reset codes, and we have no way to tell a
 * useful `?q=shoes` from a dangerous `?token=`. A hash is kept only when it
 * looks like a client-side route.
 */
export function pageUrl() {
  const l = window.location;
  const hash = /^#\/?[\w-]/.test(l.hash || "") ? l.hash : "";
  return l.origin + l.pathname + hash;
}

export function viewport() {
  return (window.innerWidth || 0) + "x" + (window.innerHeight || 0);
}

/** @returns {{css:string, text:string, rect:object|null}|null} */
export function describe(el, sels) {
  if (!el || el.nodeType !== 1) return null;
  return {
    css: cssPath(el),
    text: forbidden(el, sels) ? MASK : textOf(el, sels),
    rect: rectOf(el),
  };
}
