/* SPDX-License-Identifier: MIT
 * HumanGated LiveGate — MIT (c) Brightwing Systems, LLC
 *
 * The CDN build's entry. Reads its own <script> tag and arms.
 *
 * One namespaced global, `window.HumanGated`, merged rather than replaced so
 * two copies of this file on one page cannot clobber each other. Nothing
 * else is written to the host page's global scope, and no prototype is
 * touched anywhere in this package.
 */

import { arm, disarm, armFromTag, version } from "./index.js";

// currentScript is only correct while the script is executing, so it is read
// here and nowhere later.
const tag = typeof document !== "undefined" ? document.currentScript : null;

if (typeof window !== "undefined") {
  const ns = (window.HumanGated = window.HumanGated || {});
  ns.livegate = ns.livegate || { arm, disarm, version };
}

armFromTag(tag);
