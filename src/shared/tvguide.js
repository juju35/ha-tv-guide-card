// ── TV guide ─────────────────────────────────────────────────────────────────
// The programmes of each channel come from its `epg` entities, read by one adapter per source:
// - XMLTV EPG (shadow578/homeassistant_xmltv-epg, platform xmltv_epg): one sensor per channel and mode (current,
//   upcoming, prime time), the programme in its attributes (title, start, end, description, category);
// - Programme TNT FR (cyclope205/programme-tnt-fr): one sensor per channel, `current`, `next`, `prime_time` and
//   `second_part` objects (title, start, stop, category, poster), `channel_name` and `channel_icon`;
// - EPG (yohaybn/HomeAssistant-EPG, open-epg.com): `today` / `tomorrow` schedules of programmes whose start and end
//   are "HH:MM", the programme on air and the next one in the attributes, `channel_display_name`, `channel_icon`;
// - What's On TV (janfajessen/What-s-On-TV---EPG-TV-Guide---Home-Assistant, platform whatson_tv): one sensor per
//   channel, its `schedule` (title, start, end, description, image; ISO times), `next_title`, `channel_name`,
//   `channel_icon`;
// - Freeview EPG Splitter (elyobelyob/freely_tv_guide_new): a REST sensor per channel whose `event` list holds
//   { name, startTime (s since 1970), duration (min), description } and whose `channel` is { name, logo };
// - netdaemon-epg (mutzl/netdaemon-epg): `sensor.epg_<provider>_<station>`, its state the title on air with
//   `BeginTime` (local short time), `Duration` (min), `Genre`, `Description`, `Station` and the `Upcoming` title;
// - a calendar (its events, asked over the REST API): an XMLTV guide turned into a calendar, say;
// - any other sensor: a list attribute (`programmes`, `programs`, `epg`, `schedule`, `events`) or its state as the
//   programme on air with its `start` and `end` (a template or REST sensor written by hand).
// Each programme is brought down to { title, start, end, genre, desc, image } (start and end in ms); the genre, when
// not given, is found in its text.
export const TV_GENRES = ["movie", "series", "sport", "kids", "news", "documentary", "show"];
export const TV_MATCH = {
  movie: /\bfilms?\b|movie|cinéma|cinema|\bkino|spielfilm|película|pelicula|\bfilme\b|фильм|фільм|филм|ταινία|játékfilm/i,
  series: /séries?|series|serie|feuilleton|sitcom|épisode|episode|folge|staffel|episodio|aflevering|odcinek|сериал|серіал|sorozat|seriál|nadaljevank|seriāl|σειρά|serial|\bsaison\s*\d|\bseason\s*\d/i,
  sport: /sport|football|soccer|rugby|tennis|basket|cyclisme|cycling|fußball|fútbol|calcio|voetbal|piłka|futebol|футбол|labdarúg|fotbal|nogomet|futbol|ποδόσφαιρ|fotboll|fodbold|\bmatchs?\b|grand prix|formula|olymp/i,
  kids: /kids|enfants?|jeunesse|dessins? animés?|cartoon|animation|kinder|infantil|bambini|ragazzi|kinderen|dzieci|crianças|детск|мульт|дитяч|gyerek|dět|deti|otroci|bērn|παιδικ|copii|børn|barn/i,
  news: /\bnews\b|journal|actualités?|\binfo\b|nachrichten|tagesschau|noticias|telediario|notizie|telegiornale|\btg\b|nieuws|journaal|wiadomości|notícias|telejornal|новост|новин|híradó|zprávy|správy|poročila|ziņas|ειδήσεις|știri|nyheder|nyheter|вести/i,
  documentary: /documentaire|documentary|docu|reportage|dokumentar|dokumentation|documental|documentario|dokument|документ|dokumentum|dokumentārn|ντοκιμαντέρ|documentar/i,
};

// The genre of a programme from its own field, else from its title and description; "show" when nothing matches.
export const tvGenre = (given, text) => {
  const g = String(given ?? "").toLowerCase();
  if (TV_GENRES.includes(g)) return g;
  const t = `${given ?? ""} ${text ?? ""}`;
  return TV_GENRES.slice(0, -1).find((k) => TV_MATCH[k].test(t)) || "show";
};

// A time as ms: an ISO date-time, a date (local midnight), "HH:MM" or "h:mm AM/PM" on the day `base` (ms, local midnight), seconds
// or ms since 1970, a Date, a calendar's { dateTime } / { date }. null when it is none of them.
export const tvTime = (v, base) => {
  if (v == null || v === "") return null;
  if (typeof v === "object" && !(v instanceof Date)) return tvTime(v.dateTime ?? v.date, base);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "number" || /^\d+$/.test(String(v))) {
    const n = Number(v);
    return n < 1e11 ? n * 1000 : n;
  }
  const s = String(v).trim();
  const hm = /^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*([ap])?\.?\s*m?\.?$/i.exec(s);
  if (hm) {
    if (base == null) return null;
    const ap = hm[3]?.toLowerCase();
    const h = ap ? (Number(hm[1]) % 12) + (ap === "p" ? 12 : 0) : Number(hm[1]);
    const d = new Date(base);
    d.setHours(h, Number(hm[2]), 0, 0);
    return d.getTime();
  }
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (d) return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])).getTime();
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
};

// A duration in minutes: a number, "90", or ISO 8601 ("PT1H30M"); null when it is none of them.
export const tvMinutes = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v))) return Number(v);
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(String(v).trim());
  return m && m[0].length > 2 ? Number(m[1] || 0) * 60 + Number(m[2] || 0) + Number(m[3] || 0) / 60 : null;
};

// An image usable as is: a web address, an absolute path or a data URI (the relative paths some feeds give point
// into their own repository and would not load).
export const tvImage = (v) => (typeof v === "string" && /^(https?:\/\/|\/|data:image\/)/i.test(v) ? v : null);

// One programme from a list item (sensor attributes) or a calendar event; null without a title or a start.
// `base`: the day (local midnight) of "HH:MM" times; an end earlier than the start is on the next day.
export const tvProgramme = (p, base) => {
  if (!p || typeof p !== "object") return null;
  const title = p.title ?? p.Title ?? p.summary ?? p.name ?? p.programme ?? p.program;
  const start = tvTime(p.start ?? p.start_time ?? p.startTime ?? p.begin ?? p.begin_time ?? p.BeginTime ?? p.from, base);
  if (!title || start == null) return null;
  let end = tvTime(p.end ?? p.end_time ?? p.endTime ?? p.stop ?? p.until ?? p.to, base);
  const dur = tvMinutes(p.duration ?? p.Duration);
  if (end == null && dur) end = start + dur * 60000;
  if (end != null && end <= start && base != null) end += 86400000;
  const desc = String(p.description ?? p.Description ?? p.desc ?? p.synopsis ?? p.subtitle ?? p.sub_title ?? "");
  const cat = Array.isArray(p.category) ? p.category[0] : p.category;
  const genre = tvGenre(p.genre ?? p.Genre ?? cat ?? p.categories?.[0], `${title} ${desc}`);
  return { title: String(title), start, end: end != null && end > start ? end : null, genre, desc, image: tvImage(p.poster ?? p.image ?? p.icon) };
};

// Sorted by start; a programme without an end ends when the next one starts.
// Programmes found twice (the same start in two sources) are kept once.
export const tvSchedule = (list, base) => {
  const seen = new Set();
  const out = (Array.isArray(list) ? list : [])
    .map((p) => tvProgramme(p, base))
    .filter((p) => p && !seen.has(p.start) && seen.add(p.start));
  out.sort((a, b) => a.start - b.start);
  for (let i = 0; i < out.length; i++) out[i].end ??= out[i + 1]?.start ?? out[i].start + 3600000;
  return out;
};

const TV_LISTS = ["programmes", "programs", "epg", "schedule", "events", "event"];
// Programme TNT FR's programme objects.
const TV_SLOTS = ["current", "next", "prime_time", "second_part"];

// The programmes of a sensor, whatever the integration behind it (see the top of this file). `today`: local midnight.
export const tvFromEntity = (st, today) => {
  if (!st || ["unavailable", "unknown", ""].includes(st.state)) return [];
  const a = st.attributes || {};
  const key = TV_LISTS.find((k) => Array.isArray(a[k]));
  if (key) return tvSchedule(a[key], today);
  // EPG (open-epg): today's and tomorrow's schedules, keyed by time.
  if (a.today && typeof a.today === "object") {
    const day = (v, d) => (Array.isArray(v) ? v : Object.values(v || {})).map((p) => tvProgramme(p, d));
    const list = [...day(a.today, today), ...day(a.tomorrow, today + 86400000)].filter(Boolean);
    return tvSchedule(list.map((p) => ({ ...p })), today);
  }
  const slots = TV_SLOTS.filter((k) => a[k] && typeof a[k] === "object");
  if (slots.length) return tvSchedule(slots.map((k) => a[k]), today);
  const now = { ...a, title: a.title ?? a.Title ?? a.media_title ?? st.state };
  // The next programme: EPG's next_program_*, What's On TV's next_*, or netdaemon-epg's `Upcoming` title alone
  // (it starts when the one on air ends).
  const nextTitle = a.next_program_title ?? a.next_title ?? a.Upcoming ?? a.upcoming;
  let next = null;
  if (nextTitle) {
    next = { title: nextTitle, start: a.next_program_start_time ?? a.next_start, end: a.next_program_end_time ?? a.next_end, desc: a.next_program_desc ?? a.next_description };
    if (next.start == null) next.start = tvProgramme(now, today)?.end ?? null;
  }
  return tvSchedule(next ? [now, next] : [now], today);
};

// The programmes of a channel: those of each of its entities (a channel may have an XMLTV EPG sensor per mode),
// merged. `calendars`: the events already fetched, by calendar.
export const tvChannelSchedule = (hass, ids, calendars, today) =>
  tvSchedule(
    ids.flatMap((id) => (id.startsWith("calendar.") ? (calendars?.[id] ?? []) : tvFromEntity(hass.states[id], today))),
    today,
  );

// The programme on at `at` (or, failing that, the next one to start within 6 h), and the one after it.
export const tvPick = (list, at) => {
  const i = list.findIndex((p) => p.start <= at && at < p.end);
  const j = i >= 0 ? i : list.findIndex((p) => p.start > at && p.start - at <= 6 * 3600000);
  return j < 0 ? { prog: null, next: null } : { prog: list[j], next: list[j + 1] ?? null };
};

// Today's prime time from "HH:MM" (or "HH:MM:SS"), 21:00 when unset or not a time.
export const tvPrimeAt = (value, now) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ""));
  const [h, mi] = m && Number(m[1]) < 24 && Number(m[2]) < 60 ? [Number(m[1]), Number(m[2])] : [21, 0];
  const d = new Date(now);
  d.setHours(h, mi, 0, 0);
  return d.getTime();
};

// The `channels` of the config: an entity id, or { epg (an entity or a list), name, number, logo, and what the play
// button does: media_content_id (+ media_content_type) or source on the player, or script / action (+ data) }.
// The name and the logo default to the entity's (the integrations' channel_name, channel_display_name, channel_icon,
// Freeview EPG Splitter's `channel` object, netdaemon-epg's `Station`).
export const tvChannels = (hass, list) =>
  (Array.isArray(list) ? list : [])
    .map((c, i) => {
      const ch = typeof c === "string" ? { epg: c } : c && typeof c === "object" ? c : null;
      if (!ch) return null;
      const ids = (Array.isArray(ch.epg) ? ch.epg : [ch.epg]).filter((id) => typeof id === "string" && id.includes("."));
      const a = hass?.states?.[ids[0]]?.attributes || {};
      const co = a.channel && typeof a.channel === "object" ? a.channel : null;
      const name = String(ch.name ?? a.channel_name ?? a.channel_display_name ?? co?.name ?? (co ? null : a.channel) ?? a.Station ?? a.friendly_name ?? ids[0] ?? "");
      if (!name) return null;
      const logo = ch.logo ?? tvImage(a.channel_icon) ?? tvImage(co?.logo) ?? tvImage(a.entity_picture);
      return { ...ch, ids, key: String(i), name, number: ch.number ?? i + 1, logo: logo ?? null };
    })
    .filter(Boolean);

// The Intl formats, made once per language and options (a render formats many times).
export const tvIntlCache = new Map();
export const tvIntl = (lang, opts) => {
  const key = `${lang}|${JSON.stringify(opts)}`;
  if (!tvIntlCache.has(key)) tvIntlCache.set(key, new Intl.DateTimeFormat(lang, opts));
  return tvIntlCache.get(key);
};

// The clock format of the HA profile (`locale.time_format`): "12" / "24", else the language's own ("language"), else
// the system's ("system"). 12-hour times drop the leading zero (9:10 PM), 24-hour ones keep it (09:10).
export const tvTimeOptions = (lang, timeFormat) => {
  let h12;
  if (timeFormat === "12") h12 = true;
  else if (timeFormat === "24") h12 = false;
  else h12 = tvIntl(timeFormat === "system" ? undefined : lang, { hour: "numeric" }).resolvedOptions().hour12 === true;
  return h12 ? { hour: "numeric", minute: "2-digit", hour12: true } : { hour: "2-digit", minute: "2-digit", hour12: false };
};
