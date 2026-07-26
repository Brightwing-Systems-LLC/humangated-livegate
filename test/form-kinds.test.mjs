/* SPDX-License-Identifier: MIT
 *
 * The server's question vocabulary, rendered.
 *
 * This file exists because of a real cross-repo mismatch. The server declares
 * questions as `{key, prompt, qtype, choices}` over text|scale|bool|pick; the
 * overlay originally read `{type, options}` over text|choice, so every typed
 * question silently became a textarea — and a `pick` answered as free text is
 * DROPPED by the server, which validates against the declared choices.
 *
 * The scale and bool cases were worse than broken: they "worked" if the
 * reviewer happened to type 4 or yes, and recorded nothing if they typed "four"
 * or "yep". A control whose syntax the reviewer has to guess is a trap.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { env, fresh, CFG, sessionBody, settle } from "./helpers/env.mjs";

const GRANT_URL = "https://staging.acme.com/checkout?hg=handoff_tok_123";

const QUESTIONS = [
  { key: "a", prompt: "Does the total read clearly?", qtype: "bool" },
  { key: "b", prompt: "How confident are you in the tone?", qtype: "scale" },
  { key: "c", prompt: "Which opening works better?", qtype: "pick",
    choices: ["We are sorry", "Let us fix this"] },
  { key: "d", prompt: "Anything you would cut?", qtype: "text" },
];

async function formPage(t) {
  const spy = env({ url: GRANT_URL });
  t.after(spy.restore);
  spy.reply(200, sessionBody({ kind: "form", questions: QUESTIONS, action: "Answer four questions" }));
  const mod = await fresh();
  const gate = await mod.arm(CFG);
  return { spy, mod, gate };
}


/** Intro card -> dismiss -> FAB -> composer. The same three taps a reviewer makes. */
async function openComposer(root) {
  const action = [...root.querySelectorAll("button")].find((b) => !b.classList.contains("fab"));
  if (action) action.click();
  root.querySelector("button.fab").click();
  await settle(() => root.querySelector("fieldset"));
}

function shadowRoot(spy) {
  const host = spy.win.document.querySelector("[data-humangated]")
    || [...spy.win.document.body.children].find((n) => n.shadowRoot);
  return host && host.shadowRoot;
}

test("every declared qtype renders its own control, never a textarea", async (t) => {
  const { spy } = await formPage(t);
  await settle(() => shadowRoot(spy));
  const root = shadowRoot(spy);
  await openComposer(root);

  const radios = (n) => root.querySelectorAll(`input[name="${n}"][type="radio"]`).length;
  assert.equal(radios("hg-q0"), 2, "bool -> yes/no");
  assert.equal(radios("hg-q1"), 5, "scale -> 1..5");
  assert.equal(radios("hg-q2"), 2, "pick -> one radio per DECLARED choice");
  assert.equal(radios("hg-q3"), 0, "text stays free text");
  assert.ok(root.querySelectorAll("textarea").length >= 1);
});

test("the prompt is what the reviewer reads, and the choices are the declared ones", async (t) => {
  const { spy } = await formPage(t);
  await settle(() => shadowRoot(spy));
  const root = shadowRoot(spy);
  await openComposer(root);

  const text = root.textContent;
  assert.match(text, /Does the total read clearly/);
  assert.match(text, /How confident are you/);
  assert.match(text, /Which opening works better/);
  assert.match(text, /We are sorry/);
  assert.match(text, /Let us fix this/);
});
