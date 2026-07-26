/* SPDX-License-Identifier: MIT
 *
 * Anchors, and the typed asks that answer without one.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { env, fresh, CFG, sessionBody, settle, tap } from "./helpers/env.mjs";

const PAGE = `<!doctype html><html><body>
<main id="checkout">
  <div class="row"><span>a</span></div>
  <div class="row totals"><span id="due">Total due</span></div>
  <div class="row css-1x2y3z sc-9f8e7d"><span>hashed classes</span></div>
</main></body></html>`;

test("a css path prefers an id and stops there", async (t) => {
  const spy = env({ url: "https://staging.acme.com/checkout", html: PAGE });
  t.after(spy.restore);
  const { cssPath, pageUrl } = await fresh("anchor.js");

  assert.equal(cssPath(spy.doc.getElementById("due")), "#due");
  assert.equal(cssPath(spy.doc.getElementById("checkout")), "#checkout");
  assert.equal(
    cssPath(spy.doc.querySelector(".totals span")),
    "#due",
    "and it walks up only until it finds one"
  );
  assert.equal(pageUrl(), "https://staging.acme.com/checkout");
});

test("a css path without ids is positional, and skips build-hashed classes", async (t) => {
  const spy = env({ url: "https://staging.acme.com/checkout", html: PAGE });
  t.after(spy.restore);
  const { cssPath } = await fresh("anchor.js");

  const path = cssPath(spy.doc.querySelector(".css-1x2y3z span"));
  assert.equal(path, "#checkout > div.row:nth-of-type(3) > span");
  assert.equal(path.includes("css-1x2y3z"), false, "a class that changes every build is not an anchor");
  assert.equal(spy.doc.querySelectorAll(path).length, 1, "and it resolves back to one element");
});

test("a hash route is kept; a fragment that could be a token is not", async (t) => {
  for (const [url, expect] of [
    ["https://a.test/app#/checkout/step-2", "https://a.test/app#/checkout/step-2"],
    ["https://a.test/app#section", "https://a.test/app#section"],
    ["https://a.test/app#", "https://a.test/app"],
    ["https://a.test/app?tok=abc", "https://a.test/app"],
  ]) {
    const spy = env({ url });
    const { pageUrl } = await fresh("anchor.js");
    assert.equal(pageUrl(), expect, url);
    spy.restore();
  }
});

test("a form ask collects answers and refuses to send a half-answered one", async (t) => {
  const spy = env({ url: "https://staging.acme.com/checkout?hg=tok", html: PAGE });
  t.after(spy.restore);
  spy.reply(
    200,
    sessionBody({
      kind: "form",
      action: "Answer 2 questions",
      questions: [
        { id: "clarity", label: "Is the total clear?", type: "text", required: true },
        { id: "ship", label: "Ship it?", type: "choice", options: ["yes", "not yet"] },
      ],
    })
  );
  spy.reply(200, { ok: true });

  const mod = await fresh();
  await mod.arm(CFG);
  const root = spy.root();
  assert.match(root.textContent, /Answer 2 questions/, "the action label is the reviewer's CTA");
  root.querySelector(".card .btn.go").click();
  root.querySelector(".fab").click();

  const send = root.querySelector(".card .btn.go");
  send.click();
  await settle(() => root.querySelector(".err").textContent.length > 0);
  assert.match(root.querySelector(".err").textContent, /Is the total clear/);
  assert.equal(spy.fetches.length, 1, "nothing was sent");

  root.querySelectorAll(".card textarea")[0].value = "Not on mobile.";
  root.querySelectorAll("input[name=hg-q1]")[1].checked = true;
  send.click();
  await settle(() => spy.fetches.length === 2);

  const body = JSON.parse(spy.fetches[1].init.body);
  assert.equal(body.kind, "form");
  assert.deepEqual(body.answers, { clarity: "Not on mobile.", ship: "not yet" });
  assert.equal(body.anchor, null, "a typed ask does not force them to pin something");
  assert.equal(body.url, "https://staging.acme.com/checkout");
});

test("a failed send keeps the reviewer's words on screen", async (t) => {
  const spy = env({ url: "https://staging.acme.com/checkout?hg=tok", html: PAGE });
  t.after(spy.restore);
  spy.reply(200, sessionBody());
  spy.reply(500, { detail: "Something broke on our side." });
  spy.reply(200, { ok: true });

  const mod = await fresh();
  await mod.arm(CFG);
  const root = spy.root();
  root.querySelector(".card .btn.go").click();
  root.querySelector(".fab").click();
  spy.point(spy.doc.getElementById("due"));
  tap(spy);

  const ta = root.querySelector(".card textarea");
  ta.value = "the total is cut off";
  root.querySelector(".card .btn.go").click();
  await settle(() => root.querySelector(".err").textContent.length > 0);

  assert.match(root.querySelector(".err").textContent, /Something broke/);
  assert.equal(root.querySelector(".card textarea").value, "the total is cut off", "not lost");

  root.querySelector(".card .btn.go").click();
  await settle(() => spy.fetches.length === 3);
  assert.equal(JSON.parse(spy.fetches[2].init.body).body, "the total is cut off");
  assert.equal(root.querySelector(".card"), null, "and the card closes once it lands");
});

test("pinning a button does not also press it", async (t) => {
  const spy = env({
    url: "https://staging.acme.com/checkout?hg=tok",
    html: '<!doctype html><body><button id="pay">Pay now</button></body>',
  });
  t.after(spy.restore);
  spy.reply(200, sessionBody());
  spy.reply(200, { ok: true });

  const pay = spy.doc.getElementById("pay");
  let pressed = 0;
  for (const type of ["pointerdown", "pointerup", "click"]) {
    pay.addEventListener(type, () => pressed++);
  }

  const mod = await fresh();
  await mod.arm(CFG);
  const root = spy.root();
  root.querySelector(".card .btn.go").click();
  root.querySelector(".fab").click();
  spy.point(pay);
  tap(spy);

  assert.equal(pressed, 0, "the whole gesture stayed inside the overlay");
  assert.match(root.querySelector(".pinned code").textContent, /#pay/, "and it still got pinned");
});

test("site redaction selectors from arm() and from the server are both honoured", async (t) => {
  const spy = env({
    url: "https://staging.acme.com/checkout?hg=tok",
    html: '<!doctype html><body><div id="w"><b class="local">LOCALSECRET</b><b class="remote">REMOTESECRET</b>ok</div></body>',
  });
  t.after(spy.restore);
  spy.reply(200, sessionBody({ redact: [".remote"] }));
  spy.reply(200, { ok: true });

  const mod = await fresh();
  await mod.arm(Object.assign({}, CFG, { redact: [".local"] }));
  const root = spy.root();
  root.querySelector(".card .btn.go").click();
  root.querySelector(".fab").click();
  spy.point(spy.doc.getElementById("w"));
  tap(spy);
  root.querySelector(".card textarea").value = "x";
  root.querySelector(".card .btn.go").click();
  await settle(() => spy.fetches.length === 2);

  const text = JSON.parse(spy.fetches[1].init.body).anchor.text;
  assert.equal(text.includes("LOCALSECRET"), false);
  assert.equal(text.includes("REMOTESECRET"), false);
  assert.match(text, /ok/);
});
