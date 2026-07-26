/* SPDX-License-Identifier: MIT
 * HumanGated LiveGate — MIT (c) Brightwing Systems, LLC
 *
 * Every rule here lives inside our shadow root and nothing here escapes it.
 * We add no stylesheet to the host page, set no CSS custom property on their
 * `:root`, and never change their `body` padding — the overlay floats.
 *
 * Sizes are mobile-first: 390px is the design width, 44px is the touch floor,
 * and every text field is 16px so iOS does not zoom the page on focus.
 */

export const CSS = `
:host{all:initial}
*,*::before,*::after{box-sizing:border-box}
.r{position:fixed;inset:0;pointer-events:none;
   font:14px/1.5 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif;
   color:#e9e7e0;-webkit-tap-highlight-color:transparent}
button{font:inherit;cursor:pointer;border:0;background:none;color:inherit}

/* The picker's catcher covers the viewport, so the FAB — which is how you
   cancel out of it — has to sit above the thing it cancels. */
.fab{pointer-events:auto;position:absolute;right:16px;z-index:2;
  bottom:calc(16px + env(safe-area-inset-bottom,0px));
  min-height:48px;padding:0 18px;border-radius:26px;background:#ff4b31;color:#fff;
  font-weight:700;box-shadow:0 6px 22px rgba(0,0,0,.34);display:flex;align-items:center;gap:8px}
.fab:active{background:#e23d24}
.fab[data-on="1"]{background:#131519;box-shadow:0 0 0 2px #ff4b31,0 6px 22px rgba(0,0,0,.34)}

.catch{pointer-events:auto;position:absolute;inset:0;cursor:crosshair;z-index:1}
.ring{position:absolute;border:2px solid #ff4b31;background:rgba(255,75,49,.12);
  border-radius:4px;pointer-events:none;transition:all .06s linear;z-index:1}

.hint{pointer-events:auto;position:absolute;left:12px;right:12px;z-index:2;
  top:calc(12px + env(safe-area-inset-top,0px));background:#131519;
  border:1px solid #2a2e35;border-radius:10px;padding:10px 12px;display:flex;
  align-items:center;gap:10px;box-shadow:0 8px 26px rgba(0,0,0,.4)}
.hint span{flex:1;font-size:13px}
.hint button{min-height:44px;padding:0 12px;border-radius:8px;border:1px solid #3a3f48;font-size:13px}

.scrim{pointer-events:auto;position:absolute;inset:0;background:rgba(8,9,11,.6);
  display:flex;align-items:flex-end;justify-content:center;z-index:4}
@media(min-width:600px){.scrim{align-items:center}}

.card{pointer-events:auto;width:100%;max-width:440px;max-height:88vh;overflow:auto;
  background:#131519;border:1px solid #2a2e35;border-radius:16px 16px 0 0;
  padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));
  box-shadow:0 -10px 40px rgba(0,0,0,.5)}
@media(min-width:600px){.card{border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.5)}}

.eyebrow{font:700 10px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
  text-transform:uppercase;letter-spacing:.07em;color:#8f96a0;margin:0 0 4px}
h2{font:700 17px/1.3 inherit;margin:0 0 8px}
p{margin:0 0 12px}
.q{font-size:15px;line-height:1.45;margin:0 0 10px}
.declared{color:#c9cdd4;font-size:13px;margin:0 0 12px}
.cap{background:#2a2118;border-left:3px solid #d99b3f;border-radius:0 6px 6px 0;
  padding:8px 10px;color:#f0e6d6;font-size:13px;margin:0 0 14px}
.cap b{display:block;color:#d99b3f;font:700 10px/1.6 ui-monospace,monospace;
  text-transform:uppercase;letter-spacing:.06em}
.meta{color:#8f96a0;font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;
  word-break:break-word;margin:0 0 12px}
.meta b{color:#ff4b31;font-weight:700}

.pinned{display:flex;align-items:center;gap:8px;background:#1b1e24;border:1px solid #2a2e35;
  border-radius:9px;padding:8px 10px;margin:0 0 14px}
.pinned code{flex:1;min-width:0;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
  color:#c9cdd4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pinned button{flex:none;min-height:44px;padding:0 10px;border-radius:8px;
  border:1px solid #3a3f48;font-size:12px}

textarea,input[type=text]{width:100%;background:#0d0f12;color:#e9e7e0;border:1px solid #3a3f48;
  border-radius:9px;padding:11px;font:16px/1.45 inherit;resize:vertical}
textarea{min-height:104px}
textarea:focus,input[type=text]:focus{outline:2px solid #ff4b31;outline-offset:-1px;border-color:#ff4b31}

fieldset{border:0;margin:0 0 14px;padding:0}
legend{padding:0;font-size:14px;margin:0 0 8px}
.opt{display:flex;gap:10px;align-items:flex-start;background:#1b1e24;border:1px solid #2a2e35;
  border-radius:10px;padding:12px;margin:0 0 8px;min-height:44px;cursor:pointer}
.opt:has(input:checked){border-color:#ff4b31;background:#241a17}
.opt input{margin:2px 0 0;accent-color:#ff4b31;width:18px;height:18px;flex:none}
.opt .name{font-weight:700;display:block}
.opt .body{color:#c9cdd4;font-size:13px;display:block;margin-top:2px}

.row{display:flex;gap:10px;margin-top:14px}
.btn{flex:1;min-height:48px;border-radius:10px;font-weight:700}
.go{background:#ff4b31;color:#fff}
.go:active{background:#e23d24}
.go[disabled]{opacity:.55;cursor:default}
.ghost{background:transparent;border:1px solid #3a3f48;color:#e9e7e0}
.ghost:active{background:#2a2e35}
.err{color:#ffb1a2;font-size:13px;margin:10px 0 0}

.note{position:absolute;left:16px;right:16px;z-index:3;
  bottom:calc(76px + env(safe-area-inset-bottom,0px));
  margin:0 auto;max-width:420px;background:#131519;border:1px solid #2a2e35;border-left:3px solid #ff4b31;
  border-radius:10px;padding:11px 13px;font-size:13px;box-shadow:0 8px 26px rgba(0,0,0,.4);
  pointer-events:auto;display:flex;gap:10px;align-items:flex-start}
.note div{flex:1}
.note button{flex:none;min-height:44px;min-width:44px;color:#8f96a0;font-size:18px}
.fine{color:#8f96a0;font-size:12px;line-height:1.5;margin:12px 0 0}

fieldset.inline .opt--inline{display:inline-flex;align-items:center;gap:.4rem;
min-height:44px;padding:0 .7rem;margin:0 .4rem .4rem 0;border:1px solid var(--hg-rule);
border-radius:999px}
fieldset.inline .opt--inline:has(input:checked){border-color:var(--hg-go);
box-shadow:inset 0 0 0 1px var(--hg-go)}
`;
