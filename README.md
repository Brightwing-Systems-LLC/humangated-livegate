# HumanGated LiveGate

**The review overlay for a running app.** A small JS package you install once in
a base template. It is **completely dormant by default** — it wakes for one
named reviewer, one open ask, a couple of hours, and only because they arrived
holding a grant.

> **Status: in development.** The npm package is not published yet. Ask a human
> to look at a live URL today with [`hgd-ask`](https://github.com/Brightwing-Systems-LLC/humangated-skills)
> and the `live_url` artifact kind — the reviewer opens the page and responds in
> their inbox, with no overlay. This repo is where the overlay lands.

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

## Why it is MIT

It is code that runs on your machines and your customers' browsers. You should
be able to read all of it, pin it in a lockfile, and audit it without asking us.
Both shapes will ship: a CDN build with immutable version-pinned URLs and
published SRI, and an npm package for production with no runtime fetch from us.

## License

MIT © Brightwing Systems, LLC. The HumanGated name and brand are not part of the
MIT grant. See [humangated.ai](https://humangated.ai).
