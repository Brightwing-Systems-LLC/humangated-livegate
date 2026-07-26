/* SPDX-License-Identifier: MIT
 * HumanGated LiveGate — MIT (c) Brightwing Systems, LLC
 *
 * Redaction, which is the line between a review tool and an accidental data
 * processor (ask-lifecycle §3, non-negotiable 3).
 *
 * Three rules, in order of how much they matter:
 *
 *   1. We never read a form control's value. Not "we read it and mask it" —
 *      there is no `.value` access anywhere in this package. An input is
 *      serialised as the token `[input]`, whatever is typed into it. That
 *      makes the promise a property of the code rather than of a filter that
 *      could be wrong.
 *   2. `[data-hg-redact]` subtrees, and anything matching the site's own
 *      `redact` selectors, are replaced whole. Not descended into.
 *   3. Whatever survives is passed through a long-digit scrub, because the
 *      first two rules depend on the customer having marked things up, and
 *      the customer will occasionally not have.
 *
 * Rule 3 applies only to text we lifted off the page. The reviewer's own
 * words are never touched by anything in this file — verbatim capture is the
 * product (ask-lifecycle §5).
 */

export const MASK = "[redacted]";

const OPAQUE = {
  SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, HEAD: 1,
  SVG: 1, CANVAS: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, VIDEO: 1, AUDIO: 1,
};

const CONTROL = { INPUT: "[input]", TEXTAREA: "[textarea]", SELECT: "[select]" };

// 12–19 digits, tolerating the spaces and dashes people type card numbers
// with. Deliberately blunt: a long bare number in a page we are quoting is
// more likely to be an account identifier than something worth keeping.
const LONG_DIGITS = /\d(?:[ -]?\d){11,18}/g;

export function scrub(text) {
  return text.replace(LONG_DIGITS, MASK);
}

function matchesAny(el, sels) {
  for (let i = 0; i < sels.length; i++) {
    try {
      if (el.matches(sels[i])) return true;
    } catch {
      /* a bad selector in site config redacts nothing rather than throwing */
    }
  }
  return false;
}

/** Is this element itself off limits? */
export function marked(el, sels) {
  if (!el || el.nodeType !== 1) return false;
  if (el.hasAttribute && el.hasAttribute("data-hg-redact")) return true;
  return matchesAny(el, sels || []);
}

/**
 * Is this element, or any ancestor, off limits? Used before we capture an
 * anchor at all: pinning something inside a redacted subtree must not become
 * a way to read it one element at a time.
 */
export function forbidden(el, sels) {
  let node = el;
  while (node && node.nodeType === 1) {
    if (marked(node, sels)) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * The visible text of one element, redacted, capped.
 *
 * The cap is not a performance guard. "We capture what the reviewer pointed
 * at, not the page" (wire contract §6) needs a number, and this is it.
 */
export function textOf(root, sels, cap) {
  const limit = cap || 320;
  const sel = sels || [];
  const out = [];
  let n = 0;

  function push(s) {
    if (!s) return;
    out.push(s);
    n += s.length;
  }

  (function walk(node) {
    if (n >= limit || !node) return;
    if (node.nodeType === 3) {
      push(node.nodeValue);
      return;
    }
    if (node.nodeType !== 1) return;

    const tag = node.tagName;
    if (OPAQUE[tag]) return;
    if (CONTROL[tag]) {
      push(" " + CONTROL[tag] + " ");
      return;
    }
    if (marked(node, sel)) {
      push(" " + MASK + " ");
      return;
    }
    for (let c = node.firstChild; c && n < limit; c = c.nextSibling) walk(c);
  })(root);

  const flat = out.join("").replace(/\s+/g, " ").trim();
  return scrub(flat.slice(0, limit));
}
