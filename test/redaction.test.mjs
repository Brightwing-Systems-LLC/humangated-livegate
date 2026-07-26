/* SPDX-License-Identifier: MIT
 *
 * The gate from the wire contract, §5.3: "a page full of card numbers
 * produces a payload containing none of them."
 */
import test from "node:test";
import assert from "node:assert/strict";
import { env, fresh, CFG, sessionBody, settle, tap } from "./helpers/env.mjs";

const CARDS = [
  "4111111111111111", // typed into a text input
  "4242424242424242", // typed into a textarea
  "4000056655665556", // a selected <option>
  "5555555555554444", // inside [data-hg-redact]
  "6011111111111117", // inside the site's own .card-number selector
  "3782822463100050", // bare text nobody marked up
  "4917 6100 0000 0000", // and the way people actually type them
];

const PAGE = `<!doctype html><html><body><section id="checkout">
  <h1>Order total</h1>
  <label>Card <input id="cc" type="text" value="${CARDS[0]}"></label>
  <textarea id="note">${CARDS[1]}</textarea>
  <select id="saved"><option value="${CARDS[2]}">${CARDS[2]}</option></select>
  <div data-hg-redact>Cardholder ${CARDS[3]}</div>
  <div class="card-number">${CARDS[4]}</div>
  <p id="plain">Charged to ${CARDS[5]} today</p>
  <p id="spaced">Backup ${CARDS[6]}</p>
</section></body></html>`;

const GRANT_URL = "https://staging.acme.com/checkout?session=SECRET_HOST_TOKEN&hg=tok";

async function pinAndSend(spy, selector, text) {
  const mod = await fresh();
  await mod.arm(CFG);
  const root = spy.root();
  root.querySelector(".card .btn.go").click(); // intro
  root.querySelector(".fab").click(); // pin mode
  spy.point(spy.doc.querySelector(selector));
  tap(spy);
  root.querySelector(".card textarea").value = text;
  root.querySelector(".card .btn.go").click();
  await settle(() => spy.fetches.length === 2);
  return JSON.parse(spy.fetches[1].init.body);
}

test("a page full of card numbers produces a payload containing none of them", async (t) => {
  const spy = env({ url: GRANT_URL, html: PAGE });
  t.after(spy.restore);
  spy.reply(200, sessionBody());
  spy.reply(200, { ok: true });

  const body = await pinAndSend(spy, "#checkout", "The total looks wrong on mobile.");
  const wire = JSON.stringify(body);

  for (const card of CARDS) {
    assert.equal(wire.includes(card), false, `leaked ${card}`);
    assert.equal(wire.includes(card.replace(/\D/g, "")), false, `leaked ${card} unspaced`);
  }

  // Not just absent — replaced by something the reader can see was replaced.
  assert.match(body.anchor.text, /\[input\]/);
  assert.match(body.anchor.text, /\[textarea\]/);
  assert.match(body.anchor.text, /\[select\]/);
  assert.match(body.anchor.text, /\[redacted\]/);
  assert.match(body.anchor.text, /Order total/, "and the useful text still comes through");
});

test("the reviewer's own words are never touched", async (t) => {
  const spy = env({ url: GRANT_URL, html: PAGE });
  t.after(spy.restore);
  spy.reply(200, sessionBody());
  spy.reply(200, { ok: true });

  const verbatim = "  Card 4111111111111111 renders as 411111…, which is fine.  ";
  const body = await pinAndSend(spy, "#plain", verbatim);
  assert.equal(body.body, verbatim.trim(), "verbatim capture is the product");
});

test("pinning inside a redacted subtree yields nothing readable", async (t) => {
  const spy = env({ url: GRANT_URL, html: PAGE });
  t.after(spy.restore);
  spy.reply(200, sessionBody());
  spy.reply(200, { ok: true });

  const body = await pinAndSend(spy, "[data-hg-redact]", "this bit");
  assert.equal(body.anchor.text, "[redacted]", "descending into it one element at a time is not a loophole");
});

test("the host page's query string never goes on the wire", async (t) => {
  const spy = env({ url: GRANT_URL, html: PAGE });
  t.after(spy.restore);
  spy.reply(200, sessionBody());
  spy.reply(200, { ok: true });

  const body = await pinAndSend(spy, "#checkout", "note");
  assert.equal(body.url, "https://staging.acme.com/checkout");
  assert.equal(body.url.includes("SECRET_HOST_TOKEN"), false);
  assert.equal(body.url.includes("?"), false, "a query string on someone else's app can be a credential");
  assert.match(body.viewport, /^\d+x\d+$/);
});

test("no screenshot is taken, and there is no code here that could take one", async (t) => {
  const spy = env({ url: GRANT_URL, html: PAGE });
  t.after(spy.restore);
  spy.reply(200, sessionBody({ screenshots: true }));
  spy.reply(200, { ok: true });

  const body = await pinAndSend(spy, "#checkout", "note");
  for (const k of Object.keys(body)) {
    assert.equal(/shot|image|png|webp|canvas|data:/i.test(k + JSON.stringify(body[k])), false, k);
  }
});

test("redaction is a property of the modules, not of the flow", async (t) => {
  const spy = env({ url: "https://staging.acme.com/x", html: PAGE });
  t.after(spy.restore);
  const { textOf, scrub, forbidden, MASK } = await fresh("redact.js");

  const el = spy.doc.getElementById("checkout");
  const text = textOf(el, [".card-number", "[data-pii]"]);
  for (const card of CARDS) assert.equal(text.includes(card), false);

  assert.equal(scrub("call 4111111111111111 now"), "call " + MASK + " now");
  assert.equal(scrub("apartment 4B, 2024"), "apartment 4B, 2024", "short numbers are left alone");
  assert.equal(forbidden(spy.doc.querySelector("[data-hg-redact]"), []), true);
  assert.equal(forbidden(spy.doc.getElementById("plain"), []), false);

  // The cap is the "we capture what they pointed at, not the page" rule.
  assert.ok(textOf(spy.doc.body, []).length <= 320);
});
