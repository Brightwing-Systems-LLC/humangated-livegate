/* SPDX-License-Identifier: MIT
 *
 * "Grants annotation, never access." The testable form (wire contract §5.1):
 * the overlay makes no request to any origin but ours, and reads nothing
 * from the host page that resembles a credential.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { env, fresh, CFG, sessionBody, settle, tap } from "./helpers/env.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const URL_ = "https://staging.acme.com/checkout?hg=tok";
const PAGE = "<!doctype html><body><p id=t>Total due</p></body>";

test("every request in a full session goes to the configured API and nowhere else", async (t) => {
  const spy = env({ url: URL_, html: PAGE });
  t.after(spy.restore);
  spy.reply(200, sessionBody());
  spy.reply(200, { ok: true });
  spy.reply(200, { ok: true });

  const mod = await fresh();
  await mod.arm(CFG);
  const root = spy.root();
  root.querySelector(".card .btn.go").click();

  for (const note of ["first note", "second note"]) {
    root.querySelector(".fab").click();
    spy.point(spy.doc.getElementById("t"));
    tap(spy, 5, 5);
    root.querySelector(".card textarea").value = note;
    const n = spy.fetches.length;
    root.querySelector(".card .btn.go").click();
    await settle(() => spy.fetches.length > n);
  }

  assert.equal(spy.fetches.length, 3);
  for (const call of spy.fetches) {
    assert.equal(new URL(call.url).origin, "https://api.humangated.ai", call.url);
    assert.equal(call.init.credentials, "omit");
    assert.equal(call.init.redirect, "error");
    assert.deepEqual(Object.keys(call.init.headers).sort(), (call.init.headers.Authorization ? ["Authorization", "Content-Type"] : ["Content-Type"]));
  }
  assert.equal(spy.fetches[1].init.headers.Authorization, "Bearer hgs_live_abc", "the session rides in a header, never a query param");
  assert.equal(spy.fetches[1].url.includes("hgs_live_abc"), false);
  assert.equal(spy.cookieReads, 0, "their cookies were never read");
  assert.equal(spy.localStorageReads, 0, "their localStorage was never read");
});

test("the transport refuses an off-origin URL outright", async (t) => {
  const spy = env({ url: URL_ });
  t.after(spy.restore);
  const { transport, OffOrigin } = await fresh("transport.js");
  const request = transport("https://api.humangated.ai");

  for (const bad of [
    "https://evil.example/steal",
    "//evil.example/steal",
    "https://api.humangated.ai.evil.example/x",
    "http://api.humangated.ai/x",
  ]) {
    await assert.rejects(() => request(bad), OffOrigin, bad);
  }
  assert.equal(spy.fetches.length, 0, "and it refuses before calling fetch");

  const ok = await request("/api/livegate/session", { body: {} });
  assert.ok(ok);
  assert.equal(spy.fetches.length, 1);
});

test("the host page's own fetch and XHR are left exactly as they were", async (t) => {
  const spy = env({ url: URL_, html: PAGE });
  t.after(spy.restore);
  spy.reply(200, sessionBody());

  const beforeFetch = globalThis.fetch;
  const beforeXHR = spy.win.XMLHttpRequest;
  const beforeProtos = [
    Object.getOwnPropertyNames(spy.win.Element.prototype).length,
    Object.getOwnPropertyNames(spy.win.Document.prototype).length,
  ];

  const mod = await fresh();
  await mod.arm(CFG);

  assert.equal(globalThis.fetch, beforeFetch, "fetch not patched");
  assert.equal(spy.win.XMLHttpRequest, beforeXHR, "XHR not patched");
  assert.deepEqual(
    [
      Object.getOwnPropertyNames(spy.win.Element.prototype).length,
      Object.getOwnPropertyNames(spy.win.Document.prototype).length,
    ],
    beforeProtos,
    "no prototype patching"
  );
  const globals = Object.keys(spy.win).filter((k) => /humangated|livegate|hg_/i.test(k));
  assert.deepEqual(globals, [], "the npm entry adds no global at all");
});

test("the CDN build adds exactly one namespaced global", async (t) => {
  const spy = env({ url: "https://staging.acme.com/checkout" });
  t.after(spy.restore);

  const mod = await fresh("cdn.js");
  assert.equal(mod.__esModule, undefined);
  assert.deepEqual(Object.keys(spy.win.HumanGated || {}), ["livegate"]);
  assert.equal(typeof spy.win.HumanGated.livegate.arm, "function");
  assert.equal(spy.fetches.length, 0, "and it is still dormant");
});

test("the source itself never mentions the things we promise not to do", () => {
  const forbidden = [
    [/\blocalStorage\b/, "localStorage — a review session must not outlive the tab"],
    [/document\.cookie|\.cookie\s*=/, "cookies — theirs or ours"],
    [/XMLHttpRequest/, "XMLHttpRequest"],
    [/(window|globalThis)\.fetch\s*=/, "patching fetch"],
    [/\.prototype\.\w+\s*=/, "patching a prototype"],
    [/toDataURL|getImageData|html2canvas|createObjectURL/, "anything that could rasterise the page"],
    [/navigator\.sendBeacon|new\s+Image\s*\(/, "a beacon"],
    [/document\.write|innerHTML\s*=/, "innerHTML on someone else's page"],
  ];
  for (const file of readdirSync(SRC).filter((f) => f.endsWith(".js"))) {
    const text = readFileSync(join(SRC, file), "utf8");
    // Comments talk about these on purpose; only code counts.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const [re, why] of forbidden) {
      assert.equal(re.test(code), false, `${file} mentions ${why}`);
    }
  }
});

test("form control values are never read anywhere near the host page", () => {
  // overlay.js reads .value, but only from fields it created inside its own
  // shadow root. The two modules that touch the customer's DOM must not.
  for (const file of ["redact.js", "anchor.js"]) {
    const code = readFileSync(join(SRC, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.equal(/\.value\b/.test(code), false, `${file} reads a value`);
  }
});
