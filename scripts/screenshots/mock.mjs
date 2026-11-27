// The mock home of the screenshots and animations: five invented channels, each read through another source — an
// XMLTV EPG sensor pair, a Programme TNT FR sensor, an EPG (open-epg) sensor, a calendar and a sensor written by hand —
// and a living-room television tuned to the first one. The clock is fixed, so that a capture only changes when the
// card does: Friday 27 November 2026, at 21:40 (on air) or 18:30 (before the evening).
const st = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes, last_changed: "2026-11-27T00:00:00Z" });
const at = (h, m, d = 27) => new Date(2026, 10, d, h, m).getTime();
const iso = (h, m, d) => new Date(at(h, m, d)).toISOString();

// `scene`: live (the evening has begun), later (before prime time), none (no programme in the guide).
const SCENES = {
  live: { now: at(21, 40) },
  later: { now: at(18, 30) },
  none: { now: at(21, 40) },
};

export const nowOf = (scene) => SCENES[scene].now;

// The page's clock and the card's callApi, as script source: window.Date fixed at the scene's time, window.__api
// answering the calendar requests from the events put on the hass object (`this.__calendar`).
export const pageScript = (scene) => `(() => {
  const N = ${SCENES[scene].now};
  const R = Date;
  window.Date = class extends R {
    constructor(...a) { super(...(a.length ? a : [N])); }
    static now() { return N; }
  };
  window.__api = async function () { return this.__calendar || []; };
})();`;

const CALENDAR = [
  { summary: "Seasonal Cooking", description: "Magazine", start: { dateTime: iso(20, 55) }, end: { dateTime: iso(22, 30) } },
  { summary: "Quiz Night", description: "Game show", start: { dateTime: iso(22, 30) }, end: { dateTime: iso(23, 30) } },
];

export const CHANNELS = [
  { epg: ["sensor.xmltv_channel_one_current", "sensor.xmltv_channel_one_upcoming"], name: "Channel One", media_content_id: "channel-one" },
  { epg: "sensor.programme_tnt_fr_channel_two", media_content_id: "channel-two" },
  { epg: "sensor.epg_channel_three", media_content_id: "channel-three" },
  { epg: "calendar.channel_four", name: "Channel Four", media_content_id: "channel-four" },
  { epg: "sensor.tv_channel_five", name: "Channel Five", media_content_id: "channel-five" },
];

export const states = (scene) => {
  const off = scene === "none";
  const s = (id, attrs, state = "on") => st(id, off ? "unavailable" : state, off ? {} : attrs);
  return {
    "sensor.xmltv_channel_one_current": s("sensor.xmltv_channel_one_current", { title: "The Evening Travellers", start: iso(21, 10), end: iso(23, 5), description: "A road movie across the mountains.", category: ["Movie"] }, "The Evening Travellers"),
    "sensor.xmltv_channel_one_upcoming": s("sensor.xmltv_channel_one_upcoming", { title: "Late Night Talk", start: iso(23, 5), end: iso(0, 15, 28), category: ["Talk show"] }, "Late Night Talk"),
    "sensor.programme_tnt_fr_channel_two": s("sensor.programme_tnt_fr_channel_two", {
      channel_id: "ChannelTwo.test",
      channel_name: "Channel Two",
      channel_icon: null,
      current: { title: "Wild Coastlines", category: "Documentaire", start: iso(21, 5), stop: iso(22, 40) },
      next: { title: "Night News", category: "Journal", start: iso(22, 40), stop: iso(23, 0) },
    }, "Wild Coastlines"),
    "sensor.epg_channel_three": s("sensor.epg_channel_three", {
      channel_display_name: "Channel Three",
      today: {
        "21:10": { title: "Coastal Brigade", desc: "Season 3, episode 4", start: "21:10", end: "22:00" },
        "22:00": { title: "Coastal Brigade", desc: "Season 3, episode 5", start: "22:00", end: "22:55" },
      },
    }, "Coastal Brigade"),
    "calendar.channel_four": st("calendar.channel_four", "on", { friendly_name: "Channel Four" }),
    "sensor.tv_channel_five": s("sensor.tv_channel_five", {
      programmes: [
        { title: "Cup Final", genre: "sport", start: iso(21, 0), end: iso(23, 0) },
        { title: "Match Highlights", genre: "sport", start: iso(23, 0), end: iso(23, 45) },
      ],
    }),
    "media_player.living_room_tv": st("media_player.living_room_tv", "playing", { friendly_name: "Living room TV", media_channel: "Channel One" }),
  };
};

export const setup = (s) => ({
  hass: {
    language: "en",
    locale: { language: "en" },
    entities: {
      "sensor.xmltv_channel_one_current": { platform: "xmltv_epg" },
      "sensor.programme_tnt_fr_channel_two": { platform: "programme_tnt_fr" },
      "sensor.epg_channel_three": { platform: "epg" },
    },
    states: states(s.scene),
    // The card's calendar requests: the same events whatever the range.
    __calendar: s.scene === "none" ? [] : CALENDAR,
  },
  config: { channels: CHANNELS, player: "media_player.living_room_tv", ...s.config },
  open: s.open,
});
