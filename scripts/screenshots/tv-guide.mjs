// Renders the TV guide cards with mock channels and saves the README screenshots.
// Usage: npm install && npm run build && node scripts/screenshots/tv-guide.mjs
// Captures (light and -dark): tv-live, tv-later, tv-none, tv-series, tv-narrow, tv-mini-live, tv-mini-zoom,
// tv-mini-later; the GIFs (scripts/screenshots/animations.mjs): tv-live, tv-mini-live.
import { pair, shoot } from "./harness.mjs";
import { pageScript, setup } from "./mock.mjs";

// Stills: animations: false stops the screen and the glow, so a capture only changes when the card does.
const still = (file, s) => pair(file, { ...s, config: { animations: false, ...s.config } });
for (const scene of ["live", "later", "none"]) {
  await shoot({ prefix: "tv", tag: "tv-guide-card", shots: still(scene, { scene }), setup, ws: pageScript(scene) });
}
await shoot({ prefix: "tv", tag: "tv-guide-card", shots: still("series", { scene: "live", open: '.gp[data-genre="series"]' }), setup, ws: pageScript("live") });
await shoot({ prefix: "tv", tag: "tv-guide-card", shots: still("narrow", { scene: "live", width: 300 }), setup, ws: pageScript("live") });
await shoot({ prefix: "tv-mini", tag: "tv-guide-mini-card", shots: [...still("live", { scene: "live" }), ...still("zoom", { scene: "live", open: ".zoom" })], setup, ws: pageScript("live") });
await shoot({ prefix: "tv-mini", tag: "tv-guide-mini-card", shots: still("later", { scene: "later" }), setup, ws: pageScript("later") });
