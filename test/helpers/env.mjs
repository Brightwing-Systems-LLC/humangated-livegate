/* SPDX-License-Identifier: MIT
 *
 * A jsdom page plus a set of tripwires.
 *
 * The tripwires are the point. Every promise this package makes is a promise
 * about something it does NOT do — no request off our origin, no listener on
 * a dormant page, no cookie read, no localStorage — and you cannot assert an
 * absence without instrumenting the thing that would be present.
 */
import { JSDOM, VirtualConsole } from "jsdom";

let seq = 0;

const BLANK = "<!doctype html><html><head></head><body></body></html>";

export function env(opts = {}) {
  const dom = new JSDOM(opts.html || BLANK, {
    url: opts.url || "https://staging.acme.com/checkout",
    // jsdom's CSS parser complains about `:has()`; that is not a test failure.
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;

  // jsdom's selector engine (nwsapi) lazily binds mouseover/mouseout on the
  // document the first time anything runs a CSS query. Force that now, before
  // the listener tripwire goes in, so its bookkeeping is not mistaken for
  // ours — the "no listeners" assertions have to mean something.
  w.document.querySelector("html");

  const spy = {
    listeners: [],
    timers: 0,
    fetches: [],
    order: [],
    cookieReads: 0,
    localStorageReads: 0,
    queue: [],
    points: [],
    replaceStates: [],
  };

  for (const [label, target] of [["window", w], ["document", w.document]]) {
    const add = target.addEventListener.bind(target);
    const rm = target.removeEventListener.bind(target);
    target.addEventListener = (type, fn, o) => {
      spy.listeners.push({ target: label, type, fn });
      return add(type, fn, o);
    };
    target.removeEventListener = (type, fn, o) => {
      const i = spy.listeners.findIndex((l) => l.target === label && l.type === type && l.fn === fn);
      if (i >= 0) spy.listeners.splice(i, 1);
      return rm(type, fn, o);
    };
  }

  const realReplace = w.history.replaceState.bind(w.history);
  w.history.replaceState = (...a) => {
    spy.order.push("replaceState");
    spy.replaceStates.push(a);
    return realReplace(...a);
  };

  Object.defineProperty(w.document, "cookie", {
    configurable: true,
    get() {
      spy.cookieReads++;
      return "";
    },
    set() {
      spy.cookieReads++;
    },
  });

  const realLocal = w.localStorage;
  try {
    Object.defineProperty(w, "localStorage", {
      configurable: true,
      get() {
        spy.localStorageReads++;
        return realLocal;
      },
    });
  } catch {
    /* if jsdom will not let us watch it, the source-hygiene test still does */
  }

  w.document.elementsFromPoint = () => spy.points;

  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
    setTimeout: globalThis.setTimeout,
    setInterval: globalThis.setInterval,
  };

  globalThis.window = w;
  globalThis.document = w.document;

  const pending = new Set();
  globalThis.setTimeout = function (...a) {
    spy.timers++;
    const id = prev.setTimeout.apply(globalThis, a);
    pending.add(id);
    return id;
  };
  globalThis.setInterval = function (...a) {
    spy.timers++;
    const id = prev.setInterval.apply(globalThis, a);
    pending.add(id);
    return id;
  };

  globalThis.fetch = async (url, init) => {
    spy.order.push("fetch");
    spy.fetches.push({ url: String(url), init: init || {} });
    const r = spy.queue.shift() || { status: 200, body: {} };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    };
  };

  spy.reply = (status, body) => spy.queue.push({ status, body });
  spy.point = (...els) => {
    spy.points = els;
  };
  spy.host = () => w.document.querySelector("hg-livegate");
  spy.root = () => {
    const h = spy.host();
    return h && h.shadowRoot;
  };
  spy.win = w;
  spy.doc = w.document;
  spy.dom = dom;

  spy.restore = () => {
    // The overlay's own short-lived timers (a toast, a farewell card) would
    // otherwise hold the test process open long after the assertions are done.
    for (const id of pending) {
      try {
        clearTimeout(id);
        clearInterval(id);
      } catch {
        /* a mocked timer id from node:test — already gone */
      }
    }
    pending.clear();
    Object.assign(globalThis, prev);
    dom.window.close();
  };

  return spy;
}

/** A whole fresh copy of the module graph, grant.js included. */
export function fresh(mod = "index.js") {
  return import(new URL(`../../src/${mod}?t=${++seq}`, import.meta.url).href);
}

/** A whole tap, in the order a browser dispatches it. */
export function tap(spy, x = 10, y = 10, el) {
  const node = el || spy.root().querySelector(".catch");
  for (const type of ["pointerdown", "pointerup", "click"]) {
    if (!node.isConnected) break;
    node.dispatchEvent(
      new spy.win.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true })
    );
  }
}

export async function settle(pred, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (pred()) return true;
    await Promise.resolve();
    await new Promise((r) => process.nextTick(r));
  }
  return pred();
}

export function sessionBody(over = {}) {
  return Object.assign(
    {
      session: "hgs_live_abc",
      expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
      reviewer: "mike@partner.co",
      request_uuid: "3f2a-0000",
      objective: "Does the new checkout read right?",
      declared: "Kay is holding this until Fri 5:00pm EDT, then continuing without it.",
      capsule: "",
      action: "Read and comment",
      kind: "review",
      options: [],
      questions: [],
      screenshots: false,
      redact: [".card-number", "[data-pii]"],
    },
    over
  );
}

export const CFG = {
  siteKey: "hg_live_7f3a",
  release: "abc123f",
  api: "https://api.humangated.ai",
};
