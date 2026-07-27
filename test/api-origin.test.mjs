/* SPDX-License-Identifier: MIT
 *
 * The API origin has to be stated. There is no default, on purpose.
 *
 * There used to be one — `https://api.humangated.ai`, copied faithfully out of
 * the wire contract — and that host does not exist. `/api/livegate/*` is served
 * from the application origin. An install leaning on the default would have
 * looked entirely fine until a reviewer actually arrived, and then failed on
 * every request, on a customer's production page, with our name on it.
 *
 * A wrong default fails at review time in front of the one person we cannot
 * afford to waste. A missing one fails at install time, where somebody is
 * already looking at it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { env, fresh, CFG, sessionBody } from "./helpers/env.mjs";

const GRANT_URL = "https://staging.acme.com/checkout?hg=handoff_tok_123";

test("no api origin means no overlay, and no request to guess with", async (t) => {
  const spy = env({ url: GRANT_URL });
  t.after(spy.restore);
  spy.reply(200, sessionBody());

  const mod = await fresh();
  const gate = await mod.arm({ siteKey: "hg_live_7f3a" });   // no `api`

  assert.equal(gate, null, "it refuses rather than inventing a host");
  assert.equal(spy.fetches.length, 0, "and it never guesses one over the wire");
});

test("a stated origin is the one used, whatever it is", async (t) => {
  const spy = env({ url: GRANT_URL });
  t.after(spy.restore);
  spy.reply(200, sessionBody());

  const mod = await fresh();
  await mod.arm({ ...CFG, api: "https://humangated.ai" });

  assert.equal(
    spy.fetches[0].url,
    "https://humangated.ai/api/livegate/session",
    "the app origin, which is where /api/livegate actually lives"
  );
});

test("a nonsense origin refuses instead of falling back", async (t) => {
  const spy = env({ url: GRANT_URL });
  t.after(spy.restore);
  const mod = await fresh();

  assert.equal(await mod.arm({ ...CFG, api: "not a url" }), null);
  assert.equal(await mod.arm({ ...CFG, api: "http://evil.example" }), null, "http off-loopback");
  assert.equal(spy.fetches.length, 0);
});
