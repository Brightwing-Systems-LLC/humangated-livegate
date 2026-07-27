# HumanGated LiveGate

**The review overlay for a running app.** A small JS package you install once in
a base template. It is **completely dormant by default** — it wakes for one
named reviewer, one open ask, a couple of hours, and only because they arrived
holding a grant.

Zero runtime dependencies. **8 KB gzipped.** MIT.

> **Status: verified in a real browser at 390px, not yet published.** 41 tests,
> 8 KB gzipped, zero runtime dependencies. The composer traps and restores
> focus, a failed exchange and a non-persisting session both say so out loud,
> and an expired session is re-checked lazily rather than trusted to a timer a
> backgrounded tab may never fire.
>
> **Known limits:** shadow DOM and cross-origin iframes anchor to the host
> element rather than being refused with an explanation; `replaceState` is
> untested against an SPA router that re-renders on it; no screenshots in v1.
> Nothing is published to npm or a CDN.

## Installing

The API origin is **required** — there is no default, because a default that
points at the wrong host fails when a reviewer arrives rather than when you
install it.

```html
<script src="https://cdn.humangated.ai/lg/1.0.0/livegate.js"
        integrity="sha384-…" crossorigin="anonymous"
        data-hg-site="hg_live_…"
        data-hg-api="https://humangated.ai"></script>
```

```js
import { arm } from "@humangated/livegate";
arm({ siteKey: "hg_live_…", api: "https://humangated.ai", release: "abc123f" });
```

Your dashboard renders the exact snippet, with your key and your origin already
filled in. You will also need `connect-src` for the API origin and `script-src`
for the CDN in your CSP.

## What this is not

It is not an always-on feedback widget. That is a different product in a crowded
market, and it is deliberately not what this does. LiveGate is **outbound**: an
agent initiates, a third party who has no account responds, a workflow resumes.
The activation mechanism is the whole point.

## Four things this will never do

1. **Grant annotation, never access.** If the page is behind a login, you provide
   the way in. This is never an authentication bypass — and that is a claim your
   security review is welcome to test.
2. **Redact by default.** Inputs masked, `data-hg-redact` honoured, screenshots
   opt-in per site. The line between a review tool and an accidental data
   processor is drawn here.
3. **Leak a token into your analytics.** The grant is single-use, short-TTL, and
   removed from the URL with `history.replaceState` before anything else runs —
   so it cannot reach a screenshot, a referrer, or your logs.
4. **Phone home on a page nobody is reviewing.** Dormant means dormant.

## Install

### npm (production)

```js
import { arm } from "@humangated/livegate";

arm({ siteKey: "hg_live_7f3a…", release: __GIT_SHA__ });
```

Lockfile-pinned, auditable, and it fetches nothing from us at runtime.

### CDN (fastest to try; fine for staging)

```html
<script src="https://cdn.humangated.ai/lg/1.0.0/livegate.js"
        integrity="sha384-…"
        crossorigin="anonymous"
        data-hg-site="hg_live_7f3a…"
        data-hg-release="abc123f"></script>
```

Version-pinned and immutable. The current hash is in `dist/INTEGRITY.txt`, and
you can regenerate it yourself from a clone rather than trusting our listing:

```
npm ci && npm run build && cat dist/INTEGRITY.txt
```

### Your CSP

The one thing you have to add. Say it here rather than letting your team find it
in a console:

```
connect-src https://humangated.ai
```

No `script-src` change is needed for the npm build. The CDN build needs
`script-src https://cdn.humangated.ai`.

## The public API

```js
arm(options) → null | Promise<handle | null>
```

Returns `null` **synchronously** when there is nothing to wake for — no `?hg=`
in the URL and no live session in `sessionStorage`. That is the ordinary case
and it costs one string read. Otherwise it returns a promise for a handle.

| Option | | |
|---|---|---|
| `siteKey` | required | Public. Identifies an origin, authorises nothing. Safe in page source. |
| `release` | recommended | Commit SHA or tag. Every response is pinned to it, so the agent can say "Mike's note was against `abc123f`, you have since shipped `def456a`." |
| `api` | **required** — no default | The **only** origin this package will ever contact. |
| `redact` | `[]` | Extra CSS selectors to blank, on top of the site config the server sends. |

```js
const gate = await arm({ siteKey, release });
// gate === null            → an ordinary visitor, or a refused link
// gate.active              → true until it expires or you tear it down
// gate.reviewer            → "mike@partner.co"
// gate.request_uuid        → the ask this session answers
// gate.kind                → "review" | "choice" | "form"
// gate.expires_at          → ISO 8601
// gate.teardown()          → remove everything, clear the session, stop
```

`disarm()` is the same as `gate.teardown()` without holding the handle.
`version` is the package version. The CDN build additionally exposes
`window.HumanGated.livegate` — one namespaced global, merged rather than
replaced, and the only thing this package writes to your global scope.

## What it does to your page

Deliberately, exhaustively:

- **Dormant:** nothing. No request, no node, no listener, no timer. It reads
  `location.search`, finds no `hg=`, and returns.
- **Awake:** one `<hg-livegate>` element on `<body>`, everything inside an open
  shadow root, `pointer-events: none` except its own controls. No stylesheet is
  added to your page, no CSS variable is set on your `:root`, no padding is
  added to your `body`, no attribute is set on any of your elements.
- **Listeners on your window or document:** none, except while the reviewer is
  actively pinning an element — then exactly one `keydown` on `window`, for
  Escape, which neither calls `preventDefault` nor stops propagation, so your
  own shortcuts keep working. It is removed the moment pinning ends.
- **Timers:** one, for the session's expiry.
- **Never:** `fetch` or `XMLHttpRequest` patched, a prototype touched,
  `document.cookie` read or written, `localStorage` touched, a request to any
  origin but `api`.

The element picker does not listen on your document. It puts a transparent
catcher inside its own shadow root and asks `document.elementsFromPoint` what is
underneath, so your click handlers are never invoked and never suppressed.

## What it sends

Only when the reviewer taps Send, and only this:

```json
{
  "kind": "comment",
  "body": "<verbatim, never touched>",
  "anchor": {"css": "#checkout .total", "text": "Total due [input]", "rect": {"x":0,"y":0,"w":0,"h":0}},
  "url": "https://staging.acme.com/checkout",
  "viewport": "390x844",
  "release": "abc123f"
}
```

- `body` is the reviewer's own words, byte for byte. Nothing in this package
  rewrites them.
- `anchor.text` is the redacted text of the one element they pointed at, capped
  at 320 characters. Not the page.
- `url` is **origin + path only**. Your query string is dropped, always — we
  cannot tell a useful `?q=shoes` from a dangerous `?token=`, so we assume the
  second. A `#/route`-shaped hash is kept.

### Redaction

Three rules, in order of how much they matter:

1. **Form control values are never read.** Not "read and masked" — there is no
   `.value` access on your DOM anywhere in this package. An `input`, `textarea`
   or `select` serialises as `[input]` / `[textarea]` / `[select]`, whatever is
   in it. CI asserts this about the source, not just about the output.
2. **`[data-hg-redact]` subtrees, and anything matching your `redact`
   selectors, are replaced whole** with `[redacted]`, never descended into.
   Pinning something *inside* a redacted subtree redacts the whole anchor —
   reading it one element at a time is not a loophole.
3. **Anything that survives is scrubbed of 12–19 digit runs**, spaces and
   dashes included, because rules 1 and 2 depend on you having marked things up
   and one day you will not have.

**Screenshots: none.** `screenshots: true` from the server is read and stored,
and there is still no code path in this package that can rasterise your page.
There is no `<canvas>`, no `toDataURL`, no image library — CI greps for them.
When capture ships it will be a separate, explicitly-enabled module.

### Storage

`sessionStorage`, keyed by site key. **Not `localStorage`** — a review session
must not outlive the tab. **Not a cookie** — nothing we do should add a cookie
to someone else's domain. The session token travels in an
`Authorization: Bearer` header, never a query parameter.

## Expiry

At `expires_at` the overlay removes its listeners, clears the session, tells the
reviewer their link needs re-opening from their inbox, and removes itself. It
never renews. There is no code path that could: a new session needs a new
grant, and a new grant needs the link in their inbox.

## Known limits

Said plainly rather than half-supported:

- **Shadow DOM and cross-origin iframes are out of reach for anchoring.** The
  picker resolves to the shadow host or the frame element.
- **SPA route changes.** An anchor captured on `/checkout` may not resolve after
  a client-side navigation. Every response records `url`; v1 does not attempt
  re-anchoring across routes.
- **A DOM that deploys mid-review.** `release` makes it detectable, not solvable.
- **Anchor rects are document coordinates** (`x`/`y` include scroll offset) in
  CSS pixels, alongside a separate `viewport`.

## Develop

```
npm ci
npm test        # jsdom, no browser, ~0.5s
npm run build   # both shapes, sizes, and the SRI hash
```

The suite is organised around the properties, not the functions:
`dormancy`, `wake`, `redaction`, `expiry`, `origin`, `anchor`.

## Why it is MIT

It is code that runs on your machines and your customers' browsers. You should
be able to read all of it, pin it in a lockfile, and audit it without asking us.
Both shapes ship: a CDN build with immutable version-pinned URLs and published
SRI, and an npm package for production with no runtime fetch from us.

## License

MIT © Brightwing Systems, LLC. The HumanGated name and brand are not part of the
MIT grant. See [humangated.ai](https://humangated.ai).
