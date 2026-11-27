import assert from "node:assert/strict";
import { test } from "node:test";
import { at, BEFORE, CHANNELS, makeHass, NOW } from "./hass.mjs";
import { fakeNode, load } from "./load.mjs";

const tv = load({ now: NOW });
const json = (v) => JSON.parse(JSON.stringify(v));
const settle = () => new Promise((r) => setTimeout(r, 0));

// A card whose shadow root answers every selector with nodes recording their click listeners; the calendars fetched
// (callApi) before the test reads it.
const make = async (tag, config, hass = makeHass(), lib = tv) => {
  const card = new lib.cards[tag]();
  card.attachShadow();
  const nodes = {};
  card.shadowRoot.querySelector = (s) => (nodes[s] ||= fakeNode());
  card.setConfig({ type: `custom:${tag}`, ...config });
  card.hass = hass;
  await settle();
  await settle();
  return card;
};
const ALL = { channels: CHANNELS, player: "media_player.living_room_tv" };

test("both cards are registered, with their editors and a picker entry", () => {
  for (const tag of ["tv-guide-card", "tv-guide-mini-card"]) {
    assert.ok(tv.customElements.get(tag), tag);
    assert.ok(tv.customElements.get(`${tag}-editor`), `${tag}-editor`);
  }
  assert.deepEqual(json(tv.window.customCards.map((c) => c.type)), ["tv-guide-card", "tv-guide-mini-card"]);
  assert.deepEqual(json(tv.cards["tv-guide-card"].getStubConfig(makeHass())), {
    channels: ["sensor.xmltv_channel_one_current", "sensor.programme_tnt_fr_channel_two", "sensor.epg_channel_three"],
  });
  assert.deepEqual(json(tv.cards["tv-guide-card"].getStubConfig({ entities: {} })), {});
});

test("genres from the programme's category, else from its text, in several languages", () => {
  assert.equal(tv.tvGenre("Movie"), "movie");
  assert.equal(tv.tvGenre("sport"), "sport");
  assert.equal(tv.tvGenre("Documentaire"), "documentary");
  assert.equal(tv.tvGenre(null, "Coastal Brigade Season 3, episode 4"), "series");
  assert.equal(tv.tvGenre("Journal"), "news");
  assert.equal(tv.tvGenre("Spielfilm"), "movie");
  assert.equal(tv.tvGenre(null, "Quiz Night"), "show");
});

test("times: ISO, seconds, ms, a calendar's dateTime, HH:MM on a given day", () => {
  const t = at(21, 10);
  assert.equal(tv.tvTime(new Date(t).toISOString()), t);
  assert.equal(tv.tvTime(t / 1000), t);
  assert.equal(tv.tvTime(t), t);
  assert.equal(tv.tvTime({ dateTime: new Date(t).toISOString() }), t);
  assert.equal(tv.tvTime("21:10", at(0, 0)), t);
  assert.equal(tv.tvTime("21:10"), null, "no day for a bare time");
  assert.equal(tv.tvTime("tomorrow"), null);
});

test("adapters: XMLTV EPG, Programme TNT FR, EPG (open-epg), a hand-written sensor, a calendar", async () => {
  const h = makeHass();
  const today = at(0, 0);
  const titles = (ids, cal) => json(tv.tvChannelSchedule(h, ids, cal, today).map((p) => [p.title, p.genre, new Date(p.start).getHours(), new Date(p.end).getHours()]));
  assert.deepEqual(titles(["sensor.xmltv_channel_one_current", "sensor.xmltv_channel_one_upcoming"]), [
    ["The Evening Travellers", "movie", 21, 23],
    ["Late Night Talk", "show", 23, 0],
  ]);
  assert.deepEqual(titles(["sensor.programme_tnt_fr_channel_two"]), [
    ["Wild Coastlines", "documentary", 21, 22],
    ["Night News", "news", 22, 23],
  ]);
  assert.deepEqual(titles(["sensor.epg_channel_three"]), [
    ["Coastal Brigade", "series", 21, 22],
    ["Coastal Brigade", "series", 22, 22],
  ]);
  assert.deepEqual(titles(["sensor.tv_channel_five"]), [
    ["Cup Final", "sport", 21, 23],
    ["Match Highlights", "sport", 23, 23],
  ]);
  const cal = { "calendar.channel_four": tv.tvSchedule(h.__calendar) };
  assert.deepEqual(titles(["calendar.channel_four"], cal), [
    ["Seasonal Cooking", "show", 20, 22],
    ["Quiz Night", "show", 22, 23],
  ]);
  // A sensor whose state is the programme on air, with the next one in its attributes (EPG's top-level fields).
  h.states["sensor.now"] = { entity_id: "sensor.now", state: "Live Show", attributes: { start_time: "21:00", end_time: "22:00", next_program_title: "Later", next_program_start_time: "22:00", next_program_end_time: "23:00" } };
  assert.deepEqual(titles(["sensor.now"]), [
    ["Live Show", "show", 21, 22],
    ["Later", "show", 22, 23],
  ]);
  assert.deepEqual(titles(["sensor.missing"]), []);
});

test("an end before the start in HH:MM ends the next day; a programme without an end ends when the next one starts", () => {
  const [p] = tv.tvSchedule([{ title: "Late film", start: "23:30", end: "01:10" }], at(0, 0));
  assert.equal(p.end, at(1, 10, 28));
  const list = tv.tvSchedule([{ title: "A", start: at(20, 0) }, { title: "B", start: at(21, 0), end: at(22, 0) }]);
  assert.equal(list[0].end, at(21, 0));
});

test("channels: the name and the logo from the integration, else the entity", () => {
  const chans = tv.tvChannels(makeHass(), ["sensor.programme_tnt_fr_channel_two", { epg: "sensor.epg_channel_three", logo: "/local/three.png" }, { name: "No EPG" }, 42]);
  assert.deepEqual(json(chans.map((c) => [c.name, c.number, c.logo, c.ids])), [
    ["Channel Two", 1, null, ["sensor.programme_tnt_fr_channel_two"]],
    ["Channel Three", 2, "/local/three.png", ["sensor.epg_channel_three"]],
    ["No EPG", 3, null, []],
  ]);
});

test("prime time: HH:MM today, 21:00 when unset or not a time", () => {
  assert.equal(tv.tvPrimeAt("20:50", NOW), at(20, 50));
  assert.equal(tv.tvPrimeAt(undefined, NOW), at(21, 0));
  assert.equal(tv.tvPrimeAt("25:00", NOW), at(21, 0));
});

test("full card: tonight's programmes, on air with their progress, the playing channel marked", async () => {
  const hass = makeHass();
  const card = await make("tv-guide-card", ALL, hass);
  assert.equal(hass.api.length, 1);
  assert.match(hass.api[0][1], /^calendars\/calendar\.channel_four\?start=.+&end=.+/);
  const m = card._items;
  assert.deepEqual(
    json(m.rows.map((r) => [r.ch.name, r.prog.title, r.live, r.playing, r.pct])),
    [
      ["Channel One", "The Evening Travellers", true, true, 26],
      ["Channel Two", "Wild Coastlines", true, false, 37],
      ["Channel Three", "Coastal Brigade", true, false, 60],
      ["Channel Four", "Seasonal Cooking", true, false, 47],
      ["Channel Five", "Cup Final", true, false, 33],
    ],
  );
  assert.equal(m.state, "live");
  assert.deepEqual(json(m.genres), ["movie", "series", "sport", "documentary", "show"]);
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /<span class="bpt">Live<\/span>/);
  assert.match(html, /<div class="subt">Prime time · 09:00 PM<\/div>/);
  assert.match(html, /<span class="rk">Channel One · Movie · 09:10 PM – 11:05 PM<\/span><span class="rn">The Evening Travellers<\/span>/);
  assert.match(html, /Then Late Night Talk at 11:05 PM/);
  assert.match(html, /class="row t-movie live playing"/);
  assert.match(html, /aria-label="Play Channel One on Living room TV"/);
  assert.match(html, /<button class="pl" data-id="media_player.living_room_tv" data-k="pl">Living room TV<\/button>/);
  assert.match(html, /<ha-card class="lvl-live st-live">/);
});

test("before prime time: the evening's programmes, from their first start", async () => {
  const lib = load({ now: BEFORE });
  const card = await make("tv-guide-card", ALL, makeHass({ scene: "later" }), lib);
  const m = card._items;
  assert.equal(m.state, "later");
  assert.deepEqual(json(m.rows.map((r) => r.prog.title)), ["The Evening Travellers", "Wild Coastlines", "Coastal Brigade", "Seasonal Cooking", "Cup Final"]);
  assert.match(card.shadowRoot.innerHTML, /<span class="bpt">From 08:55 PM<\/span>/);
  const now = await make("tv-guide-card", { ...ALL, mode: "now" }, makeHass({ scene: "later" }), lib);
  assert.equal(now._items.state, "later", "nothing on the air at 18:30: the next programmes, within 6 h");
  const far = await make("tv-guide-card", { ...ALL, mode: "now" }, makeHass({ scene: "later" }), load({ now: at(9, 0) }));
  assert.equal(far._items.state, "none");
  assert.match(far.shadowRoot.innerHTML, /No programme in the guide/);
});

test("nothing: no channel, or no programme", async () => {
  const empty = await make("tv-guide-card", {});
  assert.match(empty.shadowRoot.innerHTML, /Add your channels/);
  const none = await make("tv-guide-card", ALL, makeHass({ scene: "none" }));
  assert.equal(none._items.state, "none");
  assert.match(none.shadowRoot.innerHTML, /<span class="bpt">Nothing on<\/span>/);
});

test("max_items, show_genres and the genre filter", async () => {
  const card = await make("tv-guide-card", { ...ALL, max_items: 2 });
  assert.deepEqual(json(card._items.rows.map((r) => r.ch.name)), ["Channel One", "Channel Two"]);
  const all = await make("tv-guide-card", ALL);
  assert.match(all.shadowRoot.innerHTML, /data-genre="series"/);
  const pills = [{ dataset: { genre: "series" }, addEventListener(_t, fn) { this.fn = fn; } }];
  all.shadowRoot.querySelectorAll = (s) => (s === ".gp" ? pills : []);
  all._bindAfter(all.shadowRoot);
  pills[0].fn();
  assert.deepEqual(json(all._items.shown.map((r) => r.ch.name)), ["Channel Three"]);
  assert.match(all.shadowRoot.innerHTML, /class="gp on t-series"/);
  const off = await make("tv-guide-card", { ...ALL, show_genres: false });
  assert.doesNotMatch(off.shadowRoot.innerHTML, /class="filters"/);
});

test("the play button: media on the player, a source, a script or an action", async () => {
  const hass = makeHass();
  const channels = [
    ...CHANNELS.slice(0, 1),
    { epg: "sensor.tv_channel_five", source: "HDMI 2" },
    { epg: "sensor.epg_channel_three", script: "script.zap_three" },
    { epg: "sensor.programme_tnt_fr_channel_two", action: "remote.send_command", data: { entity_id: "remote.box", command: "2" } },
  ];
  const card = await make("tv-guide-card", { ...ALL, channels }, hass);
  for (const r of card._items.rows) card._play(r.ch);
  assert.deepEqual(json(hass.calls), [
    ["media_player", "play_media", { entity_id: "media_player.living_room_tv", media_content_id: "channel-one", media_content_type: "channel" }],
    ["media_player", "select_source", { entity_id: "media_player.living_room_tv", source: "HDMI 2" }],
    ["script", "turn_on", { entity_id: "script.zap_three" }],
    ["remote", "send_command", { entity_id: "remote.box", command: "2" }],
  ]);
  const none = await make("tv-guide-card", { channels: CHANNELS });
  assert.doesNotMatch(none.shadowRoot.innerHTML, /class="play"/, "no player: no play button");
});

test("the rows and the player open their details", async () => {
  const card = await make("tv-guide-card", ALL);
  const events = [];
  card.dispatchEvent = (e) => events.push(e.detail?.entityId);
  const rows = [{ dataset: { id: "sensor.epg_channel_three" }, addEventListener(_type, fn) { this.fn = fn; } }];
  card.shadowRoot.querySelectorAll = (s) => (s.includes(".rmain[data-id]") ? rows : []);
  card._bindAfter(card.shadowRoot);
  rows[0].fn();
  assert.deepEqual(events, ["sensor.epg_channel_three"]);
});

test("mini card: the programme to watch, when it ends, the channel and the times", async () => {
  const card = await make("tv-guide-mini-card", ALL);
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /<ha-card class="lvl-live st-live bn">/);
  assert.match(html, /<div class="title">The Evening Travellers<\/div>/);
  assert.match(html, /<span class="bpt">Ends 11:05 PM<\/span>/);
  assert.match(html, /<button class="subt evt"[^>]*>Channel One · 09:10 PM – 11:05 PM<\/button>/);
  card._zoomed = true;
  card._sig = null;
  card._render();
  assert.match(card.shadowRoot.innerHTML, /class="rows"/);
});

test("other languages: French texts and times", async () => {
  const card = await make("tv-guide-card", { ...ALL, language: "fr" });
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /En direct/);
  assert.match(html, /Prime time · 21:00/);
  assert.match(html, /Channel One · Film · 21:10 – 23:05/);
});

test("translations: every language has every English key", () => {
  const en = Object.keys(tv.TV_I18N.en);
  for (const [lang, table] of Object.entries(tv.TV_I18N)) assert.deepEqual(en.filter((k) => !(k in table)), [], lang);
  assert.equal(Object.keys(tv.TV_I18N).length, 22);
});

test("the editor writes only what differs from the defaults", () => {
  const ed = new (tv.customElements.get("tv-guide-card-editor"))();
  ed.setConfig({ type: "custom:tv-guide-card" });
  ed.hass = makeHass();
  const form = ed.children[0];
  const names = form.schema.flatMap((s) => (s.schema ? s.schema.map((x) => x.name) : [s.name]));
  for (const n of ["player", "mode", "prime_time", "max_items", "show_genres", "illustration_theme", "channels", "language"]) assert.ok(names.includes(n), n);
  let out;
  ed.dispatchEvent = (e) => (out = e.detail.config);
  form.listeners["value-changed"]({ detail: { value: { type: "custom:tv-guide-card", mode: "tonight", max_items: 6, player: "media_player.living_room_tv" } } });
  assert.deepEqual(json(out), { type: "custom:tv-guide-card", player: "media_player.living_room_tv" });
});

test("the minute timer draws the card again", async () => {
  const card = await make("tv-guide-card", ALL);
  card.connectedCallback();
  card.shadowRoot.innerHTML = "";
  tv.window.tick();
  assert.match(card.shadowRoot.innerHTML, /class="rows"/);
  card.disconnectedCallback();
});
