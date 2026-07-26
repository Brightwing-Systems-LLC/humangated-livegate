/* SPDX-License-Identifier: MIT
 *
 * "A visitor who is not a reviewer must be indistinguishable, to themselves
 * and to us, from a visitor on a page with no script at all."
 */
import test from "node:test";
import assert from "node:assert/strict";
import { env, fresh, CFG, sessionBody } from "./helpers/env.mjs";

test("no ?hg= and no session: nothing happens at all", async (t) => {
  const spy = env({ url: "https://staging.acme.com/checkout" });
  t.after(spy.restore);

  const before = spy.doc.documentElement.outerHTML;
  const mod = await fresh();
  const result = mod.arm(CFG);

  assert.equal(result, null, "arm() is dormant");
  assert.equal(spy.fetches.length, 0, "no network");
  assert.equal(spy.listeners.length, 0, "no listeners on window or document");
  assert.equal(spy.timers, 0, "no timers");
  assert.equal(spy.replaceStates.length, 0, "the URL was not touched");
  assert.equal(spy.doc.querySelector("hg-livegate"), null, "no DOM");
  assert.equal(spy.doc.documentElement.outerHTML, before, "the page is byte-identical");
  assert.equal(spy.cookieReads, 0, "no cookie read");
  assert.equal(spy.localStorageReads, 0, "localStorage untouched");
  assert.equal(spy.win.sessionStorage.length, 0, "nothing written to sessionStorage");
});

test("an unrelated query string is not a grant", async (t) => {
  const spy = env({ url: "https://staging.acme.com/checkout?utm_source=email&hgx=1" });
  t.after(spy.restore);

  const mod = await fresh();
  assert.equal(mod.arrived, false);
  assert.equal(mod.arm(CFG), null);
  assert.equal(spy.replaceStates.length, 0, "we do not rewrite URLs we have no business in");
  assert.equal(spy.fetches.length, 0);
});

test("a session for another origin is not a session", async (t) => {
  const spy = env({ url: "https://staging.acme.com/checkout" });
  t.after(spy.restore);

  const stale = Object.assign(sessionBody(), { origin: "https://acme.com", release: null, intro: true });
  spy.win.sessionStorage.setItem("hg.lg." + CFG.siteKey, JSON.stringify(stale));

  const mod = await fresh();
  assert.equal(mod.arm(CFG), null, "dormant");
  assert.equal(spy.win.sessionStorage.getItem("hg.lg." + CFG.siteKey), null, "and cleaned up");
  assert.equal(spy.fetches.length, 0);
  assert.equal(spy.doc.querySelector("hg-livegate"), null);
});

test("an expired session is not a session, and never renews itself", async (t) => {
  const spy = env({ url: "https://staging.acme.com/checkout" });
  t.after(spy.restore);

  const dead = Object.assign(
    sessionBody({ expires_at: new Date(Date.now() - 1000).toISOString() }),
    { origin: "https://staging.acme.com", release: null, intro: true }
  );
  spy.win.sessionStorage.setItem("hg.lg." + CFG.siteKey, JSON.stringify(dead));

  const mod = await fresh();
  assert.equal(mod.arm(CFG), null);
  assert.equal(spy.fetches.length, 0, "an expired session does not try to refresh itself");
  assert.equal(spy.win.sessionStorage.getItem("hg.lg." + CFG.siteKey), null);
});

test("a misconfigured install is dormant, not noisy", async (t) => {
  const spy = env({ url: "https://staging.acme.com/checkout" });
  t.after(spy.restore);

  const mod = await fresh();
  assert.equal(mod.arm({}), null, "no site key");
  assert.equal(mod.arm({ siteKey: "k", api: "http://api.example.com" }), null, "plain http off-loopback");
  assert.equal(mod.arm({ siteKey: "k", api: "not a url" }), null);
  assert.equal(spy.fetches.length, 0);
  assert.equal(spy.timers, 0);
});
