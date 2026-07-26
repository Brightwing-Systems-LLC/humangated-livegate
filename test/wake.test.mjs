/* SPDX-License-Identifier: MIT
 *
 * Waking: the token leaves the URL before anything else happens, and the
 * session lands in sessionStorage and nowhere else.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { env, fresh, CFG, sessionBody, settle } from "./helpers/env.mjs";

const GRANT_URL = "https://staging.acme.com/checkout?utm_source=email&hg=handoff_tok_123";

test("replaceState strips ?hg= before the exchange — and before arm() is even called", async (t) => {
  const spy = env({ url: GRANT_URL });
  t.after(spy.restore);
  spy.reply(200, sessionBody());

  const mod = await fresh();

  // The module body did it on import. No network yet.
  assert.deepEqual(spy.order, ["replaceState"]);
  assert.equal(spy.win.location.search, "?utm_source=email", "the rest of their query survives");
  assert.equal(spy.win.location.href.includes("handoff_tok_123"), false);
  assert.equal(mod.arrived, true);

  await mod.arm(CFG);
  assert.deepEqual(spy.order, ["replaceState", "fetch"], "strip, then exchange. Never the other way.");
});

test("the exchange is exactly what the contract says", async (t) => {
  const spy = env({ url: GRANT_URL });
  t.after(spy.restore);
  spy.reply(200, sessionBody());

  const mod = await fresh();
  const gate = await mod.arm(CFG);

  const call = spy.fetches[0];
  assert.equal(call.url, "https://api.humangated.ai/api/livegate/session");
  assert.equal(call.init.method, "POST");
  assert.deepEqual(JSON.parse(call.init.body), {
    handoff: "handoff_tok_123",
    site_key: "hg_live_7f3a",
    release: "abc123f",
  });
  assert.equal(call.init.credentials, "omit", "we do not want their cookies");
  assert.equal(call.init.redirect, "error", "a redirect is how a request leaves an origin");
  assert.equal(call.init.headers.Authorization, undefined, "the handoff is the credential here");

  assert.equal(gate.active, true);
  assert.equal(gate.reviewer, "mike@partner.co");
});

test("the session goes to sessionStorage, not localStorage and not a cookie", async (t) => {
  const spy = env({ url: GRANT_URL });
  t.after(spy.restore);
  spy.reply(200, sessionBody());

  const mod = await fresh();
  await mod.arm(CFG);

  const raw = spy.win.sessionStorage.getItem("hg.lg.hg_live_7f3a");
  assert.ok(raw, "stored under the site key");
  assert.equal(JSON.parse(raw).session, "hgs_live_abc");
  assert.equal(spy.win.localStorage.length, 0, "localStorage empty");
  assert.equal(spy.cookieReads, 0, "document.cookie never read or written");
});

test("the overlay mounts in a shadow root and leaves the page alone", async (t) => {
  const spy = env({
    url: GRANT_URL,
    html: "<!doctype html><html><head></head><body><main id=m>hello</main></body></html>",
  });
  t.after(spy.restore);
  spy.reply(200, sessionBody());

  const mod = await fresh();
  await mod.arm(CFG);

  const host = spy.host();
  assert.ok(host, "one host element");
  assert.ok(host.shadowRoot, "and everything is inside its shadow root");
  assert.equal(spy.doc.querySelectorAll("hg-livegate").length, 1);
  assert.equal(spy.doc.getElementById("m").outerHTML, '<main id="m">hello</main>', "their DOM untouched");
  assert.equal(spy.doc.head.querySelector("style"), null, "no stylesheet added to the page");
  assert.equal(spy.doc.body.getAttribute("style"), null, "no body padding, no layout shift");
  // Nothing on their window or document until the reviewer starts pinning.
  assert.deepEqual(spy.listeners, []);

  const root = spy.root();
  assert.match(root.textContent, /Does the new checkout read right\?/, "the ask travels with the page");
  assert.match(root.textContent, /mike@partner\.co/);
});

test("pin mode adds one Escape listener and takes it back", async (t) => {
  const spy = env({ url: GRANT_URL, html: "<!doctype html><body><p id=t>Total due</p></body>" });
  t.after(spy.restore);
  spy.reply(200, sessionBody());

  const mod = await fresh();
  await mod.arm(CFG);
  const root = spy.root();

  root.querySelector(".card .btn.go").click(); // dismiss the intro
  root.querySelector(".fab").click();

  assert.deepEqual(
    spy.listeners.map((l) => l.target + ":" + l.type),
    ["window:keydown"],
    "one listener, on window, for Escape"
  );

  spy.win.dispatchEvent(new spy.win.KeyboardEvent("keydown", { key: "Escape" }));
  assert.deepEqual(spy.listeners, [], "and it is removed when pin mode ends");
  assert.equal(root.querySelector(".catch"), null);
});

test("a refused handoff says so instead of pretending it worked", async (t) => {
  const spy = env({ url: GRANT_URL });
  t.after(spy.restore);
  spy.reply(410, { detail: "That link has already been used." });

  const mod = await fresh();
  const gate = await mod.arm(CFG);

  assert.equal(gate, null);
  assert.equal(spy.win.sessionStorage.length, 0, "nothing stored");
  assert.equal(spy.fetches.length, 1, "and no retry — the handoff is single-use");
  const host = spy.host();
  assert.match(host.shadowRoot.textContent, /already been used/);
  assert.match(host.shadowRoot.textContent, /inbox/);
});

test("a second arm() does not open a second overlay", async (t) => {
  const spy = env({ url: GRANT_URL });
  t.after(spy.restore);
  spy.reply(200, sessionBody());

  const mod = await fresh();
  const a = await mod.arm(CFG);
  const b = await mod.arm(CFG);
  assert.equal(a, b);
  assert.equal(spy.doc.querySelectorAll("hg-livegate").length, 1);
  assert.equal(spy.fetches.length, 1);
});

test("a typed choice ask renders options instead of a text box", async (t) => {
  const spy = env({ url: GRANT_URL });
  t.after(spy.restore);
  spy.reply(
    200,
    sessionBody({
      kind: "choice",
      objective: "Which checkout reads better?",
      options: [
        { key: "a", label: "One page", body: "Everything at once." },
        { key: "b", label: "Two steps", body: "Address, then payment." },
      ],
    })
  );

  const mod = await fresh();
  await mod.arm(CFG);
  const root = spy.root();
  root.querySelector(".card .btn.go").click(); // intro
  root.querySelector(".fab").click(); // a typed ask opens straight into the question

  const opts = root.querySelectorAll("input[name=hg-choice]");
  assert.equal(opts.length, 2);
  assert.match(root.querySelector(".card").textContent, /Two steps/);

  opts[1].checked = true;
  root.querySelector(".card textarea").value = "Fewer fields on the first screen.";
  root.querySelectorAll(".card .btn.go")[0].click();

  await settle(() => spy.fetches.length === 2);
  const body = JSON.parse(spy.fetches[1].init.body);
  assert.equal(body.kind, "choice");
  assert.equal(body.choice, "b");
  assert.equal(body.because, "Fewer fields on the first screen.");
  assert.equal(body.release, "abc123f", "every response is pinned to a release");
});
