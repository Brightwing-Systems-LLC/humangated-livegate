/* SPDX-License-Identifier: MIT
 * HumanGated LiveGate — MIT (c) Brightwing Systems, LLC
 *
 * The reviewer-facing surface: a FAB, a pin, a comment.
 *
 * Everything lives in one <hg-livegate> element and its shadow root. We add
 * no stylesheet to the host page, no global, no attribute on their elements,
 * and — outside pin mode — not one listener on their document or window.
 * Pin mode adds exactly one, a `keydown` on window for Escape, which neither
 * preventDefaults nor stops propagation so their own shortcuts keep working
 * while it is up.
 *
 * The element picker deliberately does not listen on the host document. It
 * puts a catcher of its own on top and asks `document.elementsFromPoint` what
 * is underneath. Their click handlers are never invoked and never suppressed;
 * they simply do not see the event, which is what happens under any modal.
 */

import { cssPath, describe, pageUrl, viewport } from "./anchor.js";
import { detail } from "./transport.js";
import { CSS } from "./styles.js";

const HOST_STYLE =
  "all:initial;position:fixed;top:0;left:0;width:0;height:0;overflow:visible;" +
  "z-index:2147483647;pointer-events:none";

function h(tag, attrs, kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "text") el.textContent = v;
      else if (k === "on") for (const t in v) el.addEventListener(t, v[t]);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  if (kids) for (const k of kids) if (k) el.appendChild(k);
  return el;
}

function str(v) {
  return typeof v === "string" ? v : "";
}
function arr(v) {
  return Array.isArray(v) ? v : [];
}

function clock(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/* The contract fixes the response shapes but not the element shapes inside
   `options` and `questions`, so both readers are deliberately tolerant: a
   bare string, or an object under any of the obvious key names. */
function readOptions(list) {
  return arr(list).map((o, i) => {
    if (typeof o === "string") return { key: o, label: o, body: "" };
    const src = o || {};
    const key = str(src.key) || str(src.id) || str(src.value) || String.fromCharCode(97 + i);
    return {
      key,
      label: str(src.label) || str(src.title) || str(src.name) || key,
      body: str(src.body) || str(src.text) || str(src.description),
    };
  });
}

function readQuestions(list) {
  return arr(list).map((q, i) => {
    const id = "q" + (i + 1);
    if (typeof q === "string") return { id, label: q, type: "text", options: [], required: false };
    const src = q || {};
    // The server's vocabulary is `qtype` over text|scale|bool|pick with the
    // labels under `choices`. Reading only `type`/`options` silently degraded
    // every typed question to a textarea — and a `pick` answered as free text
    // is DROPPED by the server, because it validates against the declared
    // choices. Working by accident (scale, bool) was worse than failing.
    const kind = str(src.qtype) || str(src.type);
    const type =
      kind === "pick" || kind === "choice" ? "choice"
      : kind === "scale" ? "scale"
      : kind === "bool" ? "bool"
      : "text";
    return {
      id: str(src.id) || str(src.key) || str(src.name) || id,
      label: str(src.label) || str(src.prompt) || str(src.question) || id,
      type,
      options: readOptions(src.choices && src.choices.length ? src.choices : src.options),
      required: src.required === true,
    };
  });
}

/**
 * @param {object} ctx {session, cfg, request, onDead}
 */
export function mount(ctx) {
  const s = ctx.session;
  const sels = ctx.cfg.redact.concat(arr(s.redact));
  const typed = s.kind === "choice" || s.kind === "form";

  const host = document.createElement("hg-livegate");
  host.setAttribute("data-hg-redact", "");
  host.style.cssText = HOST_STYLE;
  // Open, not closed. Closed would isolate us marginally better and would
  // also stop the customer inspecting, in their own devtools, on their own
  // page, what we put there. This is code they are meant to audit.
  const root = host.attachShadow({ mode: "open" });
  root.appendChild(h("style", { text: CSS }));

  const stage = h("div", { class: "r" });
  root.appendChild(stage);

  let pinned = null; // the element the reviewer picked
  let escBound = null;
  let noteTimer = 0;
  let live = true;

  const fab = h("button", {
    class: "fab",
    type: "button",
    "aria-label": "Leave a note on this page",
    text: "＋ Comment",
    on: { click: onFab },
  });
  stage.appendChild(fab);

  /* ── pin mode ──────────────────────────────────────────────────────── */

  const ring = h("div", { class: "ring" });
  /* The pick fires on `click`, not `pointerdown`, and that ordering is
     load-bearing: tearing the catcher down mid-gesture would let the pointerup
     and the click that follow land on the customer's page, so pinning a
     button would also press it. `click` is the last event of the gesture, so
     by the time we remove the catcher there is nothing left to leak. */
  const catcher = h("div", {
    class: "catch",
    on: {
      pointermove: (e) => preview(e.clientX, e.clientY),
      pointerdown: (e) => preview(e.clientX, e.clientY),
      pointerleave: () => ring.remove(),
      click: (e) => {
        e.preventDefault();
        e.stopPropagation();
        const el = pointAt(e.clientX, e.clientY);
        if (!el) return;
        pinned = el;
        stopPinning();
        openComposer();
      },
    },
  });
  const hint = h("div", { class: "hint" }, [
    h("span", { text: "Tap the part of the page you mean." }),
    h("button", { type: "button", text: "Cancel", on: { click: stopPinning } }),
  ]);

  function pointAt(x, y) {
    let els = [];
    if (document.elementsFromPoint) els = document.elementsFromPoint(x, y) || [];
    else if (document.elementFromPoint) {
      const one = document.elementFromPoint(x, y);
      if (one) els = [one];
    }
    for (const el of els) {
      if (!el || el === host || el === document.documentElement) continue;
      return el;
    }
    return null;
  }

  function preview(x, y) {
    const el = pointAt(x, y);
    if (!el) return ring.remove();
    const r = el.getBoundingClientRect();
    ring.style.cssText =
      "left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px";
    if (!ring.parentNode) stage.insertBefore(ring, catcher);
  }

  function startPinning() {
    if (catcher.parentNode) return;
    stage.appendChild(catcher);
    stage.appendChild(hint);
    fab.setAttribute("data-on", "1");
    fab.textContent = "✕ Cancel";
    escBound = (e) => {
      if (e.key === "Escape") stopPinning();
    };
    window.addEventListener("keydown", escBound);
  }

  function stopPinning() {
    ring.remove();
    catcher.remove();
    hint.remove();
    fab.removeAttribute("data-on");
    fab.textContent = "＋ Comment";
    if (escBound) {
      window.removeEventListener("keydown", escBound);
      escBound = null;
    }
  }

  function onFab() {
    if (!live) return;
    if (catcher.parentNode) return stopPinning();
    if (scrim.parentNode) return;
    // A free-text review is about a place on the page, so pin first. A typed
    // ask already knows its question; making the reviewer point at something
    // before they can answer it is a toll booth.
    if (typed) openComposer();
    else startPinning();
  }

  /* ── the card ──────────────────────────────────────────────────────── */

  const card = h("div", { class: "card", role: "dialog", "aria-modal": "true" });
  const scrim = h("div", {
    class: "scrim",
    on: {
      // Same reason as the catcher: close on the click, never mid-gesture.
      click: (e) => {
        if (e.target === scrim) closeCard();
      },
    },
  }, [card]);

  function openCard() {
    if (!scrim.parentNode) stage.appendChild(scrim);
  }
  function closeCard() {
    scrim.remove();
    card.replaceChildren();
  }

  /* The ask travels with the artifact — a reviewer must be able to see the
     question on the page, not only in the email they opened it from. The
     declared sentence and the consequence capsule are the intro's job; the
     composer keeps only the question, so a phone-sized sheet is mostly the
     box they came to type in. */
  function askHeader(full) {
    return [
      h("p", { class: "eyebrow", text: "Someone asked you to look at this" }),
      s.objective ? h("p", { class: "q", text: "“" + s.objective + "”" }) : null,
      full && s.declared ? h("p", { class: "declared", text: s.declared }) : null,
      full && s.capsule
        ? h("div", { class: "cap" }, [
            h("b", { text: "What your answer sets off" }),
            document.createTextNode("“" + s.capsule + "”"),
          ])
        : null,
    ].filter(Boolean);
  }

  function whoLine() {
    const p = h("p", { class: "meta" });
    p.appendChild(document.createTextNode("commenting as "));
    p.appendChild(h("b", { text: s.reviewer || "you" }));
    p.appendChild(document.createTextNode(" · this link works until " + clock(s.expires_at)));
    return p;
  }

  /* First thing a reviewer sees on this page. It is the only place we can
     tell them what the overlay can and cannot see, and the only place they
     can find out before they use it. */
  function openIntro() {
    card.replaceChildren();
    card.append(
      ...askHeader(true),
      whoLine(),
      h("p", { class: "fine" }, [
        document.createTextNode(
          "This overlay only sends what you point at. It never reads what is typed " +
            "into forms, never touches your session on this site, and disappears when " +
            "the link expires."
        ),
      ]),
      h("div", { class: "row" }, [
        h("button", {
          class: "btn go",
          type: "button",
          text: s.action || "Start",
          on: {
            click: () => {
              s.intro = true;
              ctx.remember(s);
              closeCard();
            },
          },
        }),
      ])
    );
    openCard();
  }

  function anchorRow() {
    if (!pinned) {
      return h("div", { class: "pinned" }, [
        h("code", { text: "nothing pinned" }),
        h("button", {
          type: "button",
          text: "Pin an element",
          on: {
            click: () => {
              closeCard();
              startPinning();
            },
          },
        }),
      ]);
    }
    return h("div", { class: "pinned" }, [
      h("code", { text: cssPath(pinned) || "the page" }),
      h("button", {
        type: "button",
        text: "Re-pin",
        on: {
          click: () => {
            pinned = null;
            closeCard();
            startPinning();
          },
        },
      }),
    ]);
  }

  function openComposer() {
    if (!live) return;
    if (!s.intro) return openIntro();

    card.replaceChildren();
    const err = h("p", { class: "err" });
    const send = h("button", { class: "btn go", type: "button", text: "Send" });
    const body = h("textarea", {
      rows: "4",
      placeholder: "What did you notice?",
      "aria-label": "Your note",
    });

    let collect;

    if (s.kind === "choice") {
      const opts = readOptions(s.options);
      const group = h("fieldset", {}, [h("legend", { text: s.objective || "Pick one" })]);
      opts.forEach((o, i) => {
        group.appendChild(
          h("label", { class: "opt" }, [
            h("input", { type: "radio", name: "hg-choice", value: o.key }),
            h("span", {}, [
              h("span", { class: "name", text: o.label }),
              o.body ? h("span", { class: "body", text: o.body }) : null,
            ]),
          ])
        );
      });
      body.setAttribute("placeholder", "Why? (optional, but it is the useful part)");
      card.append(...askHeader(false), group, body);
      collect = () => {
        const picked = card.querySelector("input[name=hg-choice]:checked");
        if (!picked) return { error: "Pick one of them first." };
        return { payload: { kind: "choice", choice: picked.value, because: body.value.trim() } };
      };
    } else if (s.kind === "form") {
      const qs = readQuestions(s.questions);
      const fields = [];
      qs.forEach((q, i) => {
        const name = "hg-q" + i;
        if (q.type === "choice") {
          const group = h("fieldset", {}, [
            h("legend", { text: q.label + (q.required ? " *" : "") }),
          ]);
          q.options.forEach((o) => {
            group.appendChild(
              h("label", { class: "opt" }, [
                h("input", { type: "radio", name, value: o.key }),
                h("span", {}, [
                  h("span", { class: "name", text: o.label }),
                  o.body ? h("span", { class: "body", text: o.body }) : null,
                ]),
              ])
            );
          });
          card.appendChild(group);
          fields.push({ q, read: () => (card.querySelector("input[name=" + name + "]:checked") || {}).value || "" });
        } else if (q.type === "scale" || q.type === "bool") {
          // Radios, not a textarea. The server takes "4" or "yes" as readily as
          // 4 or true, so the wire shape is the easy half; the point is that a
          // reviewer must not have to GUESS the accepted words.
          const values = q.type === "scale"
            ? ["1", "2", "3", "4", "5"]
            : ["yes", "no"];
          const group = h("fieldset", { class: "inline" }, [
            h("legend", { text: q.label + (q.required ? " *" : "") }),
          ]);
          values.forEach((v) => {
            group.appendChild(
              h("label", { class: "opt opt--inline" }, [
                h("input", { type: "radio", name, value: v }),
                h("span", { class: "name", text: v === "yes" ? "Yes" : v === "no" ? "No" : v }),
              ])
            );
          });
          card.appendChild(group);
          fields.push({ q, read: () => (card.querySelector("input[name=" + name + "]:checked") || {}).value || "" });
        } else {
          const ta = h("textarea", { rows: "3", "aria-label": q.label });
          card.appendChild(
            h("fieldset", {}, [h("legend", { text: q.label + (q.required ? " *" : "") }), ta])
          );
          fields.push({ q, read: () => ta.value.trim() });
        }
      });
      card.prepend(...askHeader(false));
      collect = () => {
        const answers = {};
        for (const f of fields) {
          const v = f.read();
          if (!v && f.q.required) return { error: "“" + f.q.label + "” still needs an answer." };
          if (v) answers[f.q.id] = v;
        }
        if (!Object.keys(answers).length) return { error: "Answer at least one question." };
        return { payload: { kind: "form", answers } };
      };
    } else {
      card.append(...askHeader(false), body);
      collect = () => {
        const v = body.value.trim();
        if (!v) return { error: "Write something first." };
        return { payload: { kind: "comment", body: v } };
      };
    }

    card.append(
      anchorRow(),
      h("div", { class: "row" }, [
        h("button", { class: "btn ghost", type: "button", text: "Cancel", on: { click: closeCard } }),
        send,
      ]),
      err
    );
    send.addEventListener("click", () => submit(collect, send, err));
    openCard();
    if (body.isConnected) body.focus();
  }

  async function submit(collect, send, err) {
    err.textContent = "";
    const got = collect();
    if (got.error) {
      err.textContent = got.error;
      return;
    }
    send.setAttribute("disabled", "");
    send.textContent = "Sending…";

    // Everything only a live page knows. The anchor is re-read now rather
    // than at pin time so its rect reflects where the page actually is.
    const payload = Object.assign({}, got.payload, {
      anchor: pinned ? describe(pinned, sels) : null,
      url: pageUrl(),
      viewport: viewport(),
      release: s.release,
    });

    let res;
    try {
      res = await ctx.request("/api/livegate/responses", { token: s.session, body: payload });
    } catch {
      return fail(send, err, "Couldn’t reach HumanGated. Your note is still here — try Send again.");
    }
    if (res.ok) {
      pinned = null;
      closeCard();
      say("Sent — thank you.");
      return;
    }
    if (res.status === 401 || res.status === 403 || res.status === 410) {
      return ctx.onDead(await detail(res, "Your review link has expired."));
    }
    fail(send, err, await detail(res, "Couldn’t save that. Try Send again."));
  }

  function fail(send, err, msg) {
    send.removeAttribute("disabled");
    send.textContent = "Send";
    err.textContent = msg;
  }

  /* ── the small stuff ───────────────────────────────────────────────── */

  function say(msg) {
    const note = h("div", { class: "note" }, [h("div", { text: msg })]);
    note.appendChild(
      h("button", { type: "button", "aria-label": "Dismiss", text: "×", on: { click: () => note.remove() } })
    );
    stage.appendChild(note);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => note.remove(), 6000);
  }

  /** The end of the session, said out loud. It never renews itself. */
  function expired(msg) {
    live = false;
    stopPinning();
    closeCard();
    fab.remove();
    stage.appendChild(
      h("div", { class: "note" }, [
        h("div", {}, [
          h("b", { text: "Your review session ended. " }),
          document.createTextNode(
            (msg || "") + " Open the link from your inbox again to pick up where you left off."
          ),
        ]),
        h("button", { type: "button", "aria-label": "Dismiss", text: "×", on: { click: destroy } }),
      ])
    );
    clearTimeout(noteTimer);
    noteTimer = setTimeout(destroy, 45000);
  }

  function destroy() {
    live = false;
    stopPinning();
    clearTimeout(noteTimer);
    noteTimer = 0;
    host.remove();
  }

  (document.body || document.documentElement).appendChild(host);
  if (!s.intro) openIntro();

  return { destroy, expired, host, root };
}
