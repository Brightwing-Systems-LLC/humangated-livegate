/* SPDX-License-Identifier: MIT
 *
 * "Two hours, then back to the inbox link. A session that renews itself is a
 * session that never ends." (wire contract §6)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { env, fresh, CFG, sessionBody, settle, tap } from "./helpers/env.mjs";

const NOW = new Date("2026-07-26T17:12:00Z");
const SOON = new Date("2026-07-26T19:12:00Z").toISOString(); // +2h
const URL_ = "https://staging.acme.com/checkout?hg=tok";

test("at expires_at it tears itself down and says the link needs re-opening", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const spy = env({ url: URL_, html: "<!doctype html><body><p id=t>Total</p></body>" });
  t.after(spy.restore);
  spy.reply(200, sessionBody({ expires_at: SOON }));

  const mod = await fresh();
  const gate = await mod.arm(CFG);
  const root = spy.root();

  root.querySelector(".card .btn.go").click();
  root.querySelector(".fab").click(); // leave it mid-interaction on purpose
  assert.equal(spy.listeners.length, 1);

  t.mock.timers.tick(2 * 3600 * 1000 + 1);

  assert.equal(gate.active, false);
  assert.equal(spy.win.sessionStorage.length, 0, "session cleared");
  assert.deepEqual(spy.listeners, [], "listeners removed");
  assert.equal(root.querySelector(".fab"), null, "the FAB is gone");
  assert.equal(root.querySelector(".catch"), null, "pin mode is gone");
  assert.match(root.textContent, /session ended/i);
  assert.match(root.textContent, /inbox/i, "and it points them back at the link");

  const before = spy.fetches.length;
  t.mock.timers.tick(10 * 60 * 1000);
  assert.equal(spy.fetches.length, before, "it never tries to renew");

  // The farewell card removes itself too.
  t.mock.timers.tick(45001);
  assert.equal(spy.doc.querySelector("hg-livegate"), null, "the DOM is gone");
});

test("a reload after expiry is an ordinary page view", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const spy = env({ url: URL_ });
  t.after(spy.restore);
  spy.reply(200, sessionBody({ expires_at: SOON }));

  const first = await fresh();
  await first.arm(CFG);
  t.mock.timers.tick(2 * 3600 * 1000 + 1);
  t.mock.timers.tick(45001);

  // Same tab, same sessionStorage, fresh module graph, no ?hg= this time.
  spy.order.length = 0;
  spy.fetches.length = 0;
  const again = await fresh();
  assert.equal(again.arm(CFG), null, "dormant");
  assert.equal(spy.fetches.length, 0);
  assert.equal(spy.doc.querySelector("hg-livegate"), null);
});

test("the server hanging up mid-session ends it the same way", async (t) => {
  const spy = env({ url: URL_, html: "<!doctype html><body><p id=t>Total</p></body>" });
  t.after(spy.restore);
  spy.reply(200, sessionBody());
  spy.reply(410, { detail: "This review closed while you were reading." });

  const mod = await fresh();
  const gate = await mod.arm(CFG);
  const root = spy.root();

  root.querySelector(".card .btn.go").click();
  root.querySelector(".fab").click();
  spy.point(spy.doc.getElementById("t"));
  tap(spy, 5, 5);
  root.querySelector(".card textarea").value = "one last thought";
  root.querySelector(".card .btn.go").click();

  await settle(() => gate.active === false);
  assert.equal(spy.win.sessionStorage.length, 0);
  assert.deepEqual(spy.listeners, []);
  assert.match(root.textContent, /closed while you were reading/);
});

test("teardown() is available to the host page and leaves nothing behind", async (t) => {
  const spy = env({ url: URL_ });
  t.after(spy.restore);
  spy.reply(200, sessionBody());

  const mod = await fresh();
  const gate = await mod.arm(CFG);
  assert.ok(spy.host());

  gate.teardown();
  assert.equal(spy.doc.querySelector("hg-livegate"), null);
  assert.equal(spy.win.sessionStorage.length, 0);
  assert.deepEqual(spy.listeners, []);
  assert.equal(gate.active, false);

  mod.disarm(); // idempotent
  assert.equal(spy.doc.querySelector("hg-livegate"), null);
});
