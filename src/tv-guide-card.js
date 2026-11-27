/**
 * tv-guide-card / tv-guide-mini-card: tonight's programmes (or what is on now) on the favourite channels, from the
 * EPG integrations of Home Assistant, with a progress bar while on air and a play button that tunes the chosen player.
 * https://github.com/juju35/ha-tv-guide-card
 */

// One loop of the banner's animation (s): the picture on the screen changes, the glow breathes.
const TV_LOOP = 4;
// How often the calendars are fetched again (ms); the card itself is drawn again every minute (progress bars).
const TV_REFRESH = 15 * 60 * 1000;
const TV_TICK = 60 * 1000;

// ── Banner ───────────────────────────────────────────────────────────────────
// The illustrated header's scene: 200 × 80, drawn to the banner's right edge. A sofa and a television on its stand;
// on air, a picture changes on the screen and its light falls on the floor; before the evening, the time shows on the
// screen; with nothing to show, the screen is off. By night (the dark theme), a darker room.
const tvScene = ({ night, state, animate, time }) => {
  const body = night ? "#141022" : "#2a2340";
  const frame = `<rect x="88" y="8" width="104" height="60" rx="5" fill="${body}"/><rect x="132" y="68" width="16" height="4" fill="${body}"/>
    <rect x="112" y="72" width="56" height="4" rx="2" fill="${body}"/>`;
  const sofa = `<g fill="${night ? "#3b3157" : "#cbbcee"}"><rect x="4" y="46" width="70" height="20" rx="8"/><rect x="0" y="54" width="14" height="20" rx="6"/>
    <rect x="64" y="54" width="14" height="20" rx="6"/><rect x="10" y="60" width="58" height="14" rx="4"/></g>
    <rect x="18" y="40" width="20" height="14" rx="5" fill="${night ? "#6b5aa0" : "#a991e6"}"/>`;
  const fade = (values, delay = 0) =>
    animate ? `<animate attributeName="opacity" values="${values}" dur="${TV_LOOP}s" begin="${delay}s" repeatCount="indefinite"/>` : "";
  let screen;
  if (state === "live") {
    const scene = (sky, hill, sun, op, values) =>
      `<g opacity="${op}"><rect x="92" y="12" width="96" height="52" fill="${sky}"/><circle cx="120" cy="30" r="8" fill="${sun}"/>
        <path d="M92 64l26-20 18 12 14-10 38 18z" fill="${hill}"/>${fade(values)}</g>`;
    screen = `${scene("#7c4ddb", "#b49af0", "#c9b5f5", 1, "1;1;0;0;1")}${scene("#1c7ed6", "#74c0fc", "#ffe066", 0, "0;0;1;1;0")}
      <rect x="92" y="12" width="96" height="52" fill="#fff" opacity=".06"/>`;
  } else if (state === "later") {
    screen = `<rect x="92" y="12" width="96" height="52" fill="${night ? "#1b1f3a" : "#3b3a6b"}"/>
      <text x="140" y="44" text-anchor="middle" font-family="Roboto,sans-serif" font-size="15" font-weight="700" fill="#d0bfff">${rcEsc(time)}</text>`;
  } else {
    screen = `<rect x="92" y="12" width="96" height="52" fill="${night ? "#0b0a12" : "#1d1a2b"}"/><path d="M150 12h14l-34 52h-14z" fill="#fff" opacity=".05"/>`;
  }
  const glow =
    state === "live"
      ? `<path d="M96 76h88l14 4h-116z" fill="#b197fc" opacity="${night ? ".45" : ".25"}">${fade(night ? ".45;.25;.45" : ".25;.12;.25")}</path>`
      : "";
  return `${sofa}${glow}${frame}${screen}`;
};

// The mini card's television: a small screen at the right of the banner, in the same state as the full card's.
const tvSmall = ({ night, state, animate }) => {
  const body = night ? "#141022" : "#2a2340";
  const live = state === "live";
  const color = live ? "#7c4ddb" : state === "later" ? (night ? "#1b1f3a" : "#3b3a6b") : night ? "#0b0a12" : "#1d1a2b";
  const pulse = live && animate ? `<animate attributeName="fill" values="#7c4ddb;#1c7ed6;#7c4ddb" dur="${TV_LOOP}s" repeatCount="indefinite"/>` : "";
  return `<g transform="translate(130 14)"><rect width="56" height="38" rx="4" fill="${body}"/><rect x="4" y="4" width="48" height="30" fill="${color}">${pulse}</rect>
    ${live ? '<path d="M4 34l14-11 9 6 8-6 17 11z" fill="#d0bfff" opacity=".7"/>' : ""}
    <rect x="22" y="38" width="12" height="4" fill="${body}"/><rect x="14" y="42" width="28" height="3" rx="1.5" fill="${body}"/></g>`;
};

// The status pill's place, decided by measurement after each render and each new width (the same rule on every
// card): on the title row, right after the title, only when the whole title and the pill's whole label fit there;
// otherwise on its own line under the subtitle (clamped to one line). When the label is still cut there, or the text
// block leaves the banner or runs over its ground strip, the pill keeps its dot alone, on the title row (its label
// stays in title and aria-label). A card of 200 px or less shows the dot alone anyway (CSS), beside the title.
const tvPlacePill = (head, row, ground) => {
  if (!head) return;
  head.removeAttribute("data-wrap");
  head.removeAttribute("data-dot");
  const pill = row.querySelector(":scope > .bpill, :scope > .pill");
  const text = pill?.querySelector(".bpt, .pt");
  if (!text?.getBoundingClientRect || text.getBoundingClientRect().width <= 1) return;
  const name = row.querySelector(".title");
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  const title = name ? (name.scrollWidth > name.clientWidth ? name.scrollWidth : name.getBoundingClientRect().width) + gap : 0;
  if (title + pill.getBoundingClientRect().width <= row.getBoundingClientRect().width + 0.5) return;
  head.setAttribute("data-wrap", "");
  const box = row.parentElement.getBoundingClientRect();
  const frame = head.getBoundingClientRect();
  const out = ground && (box.bottom > ground.getBoundingClientRect().top + 0.5 || box.top < frame.top - 0.5);
  if (text.scrollWidth > text.clientWidth + 0.5 || out) {
    head.removeAttribute("data-wrap");
    head.setAttribute("data-dot", "");
  }
};

// ── Card ─────────────────────────────────────────────────────────────────────
class TvGuideCard extends RcCard {
  static tag = "tv-guide-card";
  static i18n = TV_I18N;
  static defaults = { mode: "tonight", prime_time: "21:00", max_items: 6, illustration: true, illustration_theme: "auto", show_subtitle: true, show_genres: true, animations: true };

  // The channels of the EPG integrations found in the home (a few of them), for the card picker's first config.
  static getStubConfig(hass) {
    const platforms = ["xmltv_epg", "programme_tnt_fr", "epg"];
    const ids = Object.keys(hass?.entities ?? {}).filter((id) => id.startsWith("sensor.") && platforms.includes(hass.entities[id].platform));
    return ids.length ? { channels: ids.slice(0, 4) } : {};
  }

  getCardSize() {
    return 2 + Math.min(this._items?.rows?.length ?? 3, 8);
  }

  connectedCallback() {
    super.connectedCallback?.();
    // Every minute: the progress bars move on, the programme on air changes, the calendars are fetched again in time.
    this._timer ??= setInterval(() => {
      this._sig = null;
      this._render();
    }, TV_TICK);
    if (typeof ResizeObserver !== "function") return;
    this._resize ??= new ResizeObserver((entries) => {
      const w = Math.round(entries.at(-1).contentRect.width);
      if (w === this._fitWidth) return;
      this._fitWidth = w;
      cancelAnimationFrame(this._fitFrame);
      this._fitFrame = requestAnimationFrame(() => this._fitPill());
    });
    this._resize.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    clearInterval(this._timer);
    this._timer = undefined;
    this._resize?.disconnect();
    this._fitWidth = undefined;
    if (this._fitFrame) cancelAnimationFrame(this._fitFrame);
  }

  // The calendars' events from 12 h ago to 24 h ahead, from Home Assistant's REST API.
  async _fetch(ids) {
    const h = this._hass;
    this._busy = true;
    const now = Date.now();
    const start = new Date(now - 12 * 3600000).toISOString();
    const end = new Date(now + 24 * 3600000).toISOString();
    try {
      const lists = await Promise.all(ids.map((id) => Promise.resolve(h.callApi("GET", `calendars/${id}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)).catch(() => [])));
      this._cal = { at: now, key: ids.join(","), lists: Object.fromEntries(ids.map((id, i) => [id, tvSchedule(lists[i])])) };
    } finally {
      this._busy = false;
    }
    this._sig = null;
    this._render();
  }

  _time(t) {
    try {
      return tvIntl(this._lang(), { hour: "2-digit", minute: "2-digit" }).format(new Date(t));
    } catch {
      return new Date(t).toTimeString().slice(0, 5);
    }
  }

  // The channels and the programme of each one: the one on at prime time (or now, once the evening has begun), or
  // the one on now with `mode: now`.
  _collect() {
    const h = this._hass;
    const c = this._config;
    const now = Date.now();
    const today = new Date(now).setHours(0, 0, 0, 0);
    const channels = tvChannels(h, c.channels);
    const cals = [...new Set(channels.flatMap((ch) => ch.ids.filter((id) => id.startsWith("calendar."))))];
    const cal = this._cal;
    if (cals.length && h.callApi && !this._busy && (!cal || cal.key !== cals.join(",") || now - cal.at > TV_REFRESH)) this._fetch(cals);
    const prime = tvPrimeAt(c.prime_time, now);
    const at = c.mode === "now" ? now : Math.max(now, prime);
    const player = c.player ? h.states[c.player] : null;
    const max = Math.max(1, Math.round(Number(c.max_items) || 6));
    const rows = channels.slice(0, max).map((ch) => {
      const { prog, next } = tvPick(tvChannelSchedule(h, ch.ids, cal?.lists, today), at);
      const live = !!prog && prog.start <= now && now < prog.end;
      const pl = ch.player ? h.states[ch.player] : player;
      const pa = pl?.attributes || {};
      const playing = !!pl && ["playing", "on", "paused"].includes(pl.state) && [pa.media_content_id, pa.media_channel, pa.media_title, pa.source].some((v) => v && [ch.media_content_id, ch.source, ch.name].includes(v));
      const playable = !!(ch.script || ch.action || ((ch.media_content_id || ch.source || (ch.jellyfin_channel != null && ch.jellyfin_channel !== false)) && (ch.player || c.player)));
      return { ch, prog, next, live, playing, playable, pct: live ? Math.round(((now - prog.start) / (prog.end - prog.start)) * 100) : 0 };
    });
    const genres = TV_GENRES.filter((g) => rows.some((r) => r.prog?.genre === g));
    if (this._genre && !genres.includes(this._genre)) this._genre = null;
    const shown = this._genre ? rows.filter((r) => r.prog?.genre === this._genre) : rows;
    const progs = rows.filter((r) => r.prog);
    const state = !channels.length || !progs.length ? "none" : progs.some((r) => r.live) ? "live" : "later";
    const first = progs.find((r) => r.playing) || progs.find((r) => r.live) || progs[0] || null;
    return {
      rows,
      shown,
      genres,
      first,
      state,
      prime,
      empty: !channels.length,
      start: progs.length ? Math.min(...progs.map((r) => r.prog.start)) : null,
      player: player ? { id: c.player, name: player.attributes?.friendly_name || c.player } : null,
      name: c.title || this._t("title"),
    };
  }

  _night() {
    const theme = this._config.illustration_theme;
    if (theme === "night" || theme === "day") return theme === "night";
    return this._dark();
  }

  _dark() {
    return !!this._hass.themes?.darkMode;
  }

  _animate() {
    if (this._config.animations === false) return false;
    try {
      return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return true;
    }
  }

  // The status: on air, from the first start, or nothing.
  _status(m) {
    if (m.state === "live") return this._t("st_live");
    if (m.state === "later") return this._t("st_from", { time: this._time(m.start) });
    return this._t("st_none");
  }

  // The illustrated header: the badge, the title, `sub` and the pill on the left, the living room at the right, a
  // 10 px floor strip edge to edge. `scene`: the room's drawing (the mini card draws its small television there).
  _banner(m, sub, scene, pill = "") {
    const c = this._config;
    const nav = c.navigation_path;
    const night = this._night();
    const chip = pill ? `<span class="bpill" title="${rcEsc(pill)}" aria-label="${rcEsc(pill)}"><span class="bdot"></span><span class="bpt">${rcEsc(pill)}</span></span>` : "";
    return `
      <div class="banner${night ? " night" : ""}">
        <div class="head${nav ? " nav" : ""}"${nav ? ' role="link" tabindex="0"' : ""}>
          <div class="badge"><ha-icon icon="${m.state === "live" ? "mdi:television-play" : "mdi:television-classic"}"></ha-icon></div>
          <div class="tt"><div class="trow"><div class="title">${rcEsc(m.name)}</div>${chip}</div>${sub}</div>
        </div>
        <svg class="room" viewBox="0 0 200 80" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">${scene}</svg>
        <div class="ground"></div>
      </div>`;
  }

  // The status pill's place, on the banner and on the classic header (see tvPlacePill).
  _fitPill() {
    for (const row of this.shadowRoot?.querySelectorAll?.(".trow") || []) {
      const banner = row.closest(".banner");
      tvPlacePill(banner || row.closest(".head"), row, banner?.querySelector(".ground"));
    }
  }

  _sub(m) {
    if (this._config.show_subtitle === false) return "";
    const text = this._config.mode === "now" ? this._t("sub_now") : this._t("sub_tonight", { time: this._time(m.prime) });
    return `<div class="subt">${rcEsc(text)}</div>`;
  }

  // The channel's logo (from the integration or the config), else its number on a tinted disc.
  _logo(ch) {
    return ch.logo
      ? `<span class="logo img"><img src="${rcEsc(ch.logo)}" alt="" loading="lazy"></span>`
      : `<span class="logo">${rcEsc(ch.number)}</span>`;
  }

  _row(r) {
    const { ch, prog, next } = r;
    const g = prog?.genre ?? "show";
    const kind = prog ? [ch.name, this._t(`g_${g}`), `${this._time(prog.start)} – ${this._time(prog.end)}`].join(" · ") : ch.name;
    const then = next ? `<span class="rx">${rcEsc(this._t("then_at", { title: next.title, time: this._time(next.start) }))}</span>` : "";
    const bar = r.live ? `<span class="rbar" aria-hidden="true"><span style="width:${Math.min(100, Math.max(2, r.pct))}%"></span></span>` : "";
    const label = this._t("play", { channel: ch.name, player: this._playerName(ch) });
    const play = r.playable
      ? `<button class="play" data-play="${rcEsc(ch.key)}" data-k="p${rcEsc(ch.key)}" title="${rcEsc(label)}" aria-label="${rcEsc(label)}"><ha-icon icon="${r.playing ? "mdi:television-play" : "mdi:play"}"></ha-icon></button>`
      : "";
    return `<div class="row t-${g}${r.live ? " live" : ""}${r.playing ? " playing" : ""}">
      <button class="rmain" data-k="r${rcEsc(ch.key)}"${ch.ids[0] ? ` data-id="${rcEsc(ch.ids[0])}"` : ""}>
        ${this._logo(ch)}
        <span class="rt"><span class="rk">${rcEsc(kind)}</span><span class="rn">${rcEsc(prog ? prog.title : this._t("no_info"))}</span>${bar}${then}</span>
      </button>${play}
    </div>`;
  }

  _playerName(ch) {
    const id = ch.player || this._config.player;
    return (id && this._hass.states[id]?.attributes?.friendly_name) || id || "";
  }

  // The genre pills: every genre on tonight, and "All"; only with two genres or more.
  _filters(m) {
    if (this._config.show_genres === false || m.genres.length < 2) return "";
    const pill = (g, label) =>
      `<button class="gp${(this._genre ?? null) === g ? " on" : ""}${g ? ` t-${g}` : ""}" data-genre="${g ?? ""}" data-k="g${g ?? ""}" aria-pressed="${(this._genre ?? null) === g}">${rcEsc(label)}</button>`;
    return `<div class="filters">${pill(null, this._t("all"))}${m.genres.map((g) => pill(g, this._t(`g_${g}`))).join("")}</div>`;
  }

  _draw(m) {
    const c = this._config;
    const dark = this._dark();
    const night = this._night();
    const parts = [m.shown.map((r) => [r.ch.key, r.prog, r.next, r.live, r.playing, r.pct]), m.state, m.genres, this._genre, m.player, dark, night];
    if (!this._changed(parts)) return;
    const status = this._status(m);
    const scene = tvScene({ night, state: m.state, animate: this._animate(), time: m.start ? this._time(m.start) : "" });
    const head =
      c.illustration !== false
        ? this._banner(m, this._sub(m), scene, status)
        : `<div class="head${c.navigation_path ? " nav" : ""}"${c.navigation_path ? ' role="link" tabindex="0"' : ""}>
            <div class="badge"><ha-icon icon="${m.state === "live" ? "mdi:television-play" : "mdi:television-classic"}"></ha-icon></div>
            <div class="tt"><div class="trow"><div class="title">${rcEsc(m.name)}</div><span class="pill"><span class="pt">${rcEsc(status)}</span></span></div>${this._sub(m)}</div>
          </div>`;
    const foot = m.player
      ? `<div class="foot"><span>${rcEsc(this._t("playing_on"))}</span><button class="pl" data-id="${rcEsc(m.player.id)}" data-k="pl">${rcEsc(m.player.name)}</button></div>`
      : "";
    const body = m.empty
      ? `<div class="box none">${rcEsc(this._t("no_channels"))}</div>`
      : m.state === "none"
        ? `<div class="box none">${rcEsc(this._t("nothing"))}</div>`
        : `${this._filters(m)}<div class="rows">${m.shown.map((r) => this._row(r)).join("")}</div>${foot}`;
    this._paint(m.state, head + body, "", ` st-${m.state}${dark ? " dk" : ""}`);
    this._fitPill();
  }

  _bindAfter(root) {
    for (const b of root.querySelectorAll(".rmain[data-id], .pl[data-id]") || []) b.addEventListener("click", () => rcMoreInfo(this, b.dataset.id));
    for (const b of root.querySelectorAll(".play[data-play]") || [])
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._play(this._items.rows.find((r) => r.ch.key === b.dataset.play)?.ch);
      });
    for (const b of root.querySelectorAll(".gp") || [])
      b.addEventListener("click", () => {
        this._genre = b.dataset.genre || null;
        this._sig = null;
        this._render();
      });
  }

  // The play button: the channel's script or action, else its media (or source, or JellyHA Live TV channel) on its
  // player or the card's.
  _play(ch) {
    if (!ch) return;
    const h = this._hass;
    if (ch.script) return rcCall(h, "script", "turn_on", { entity_id: ch.script });
    if (ch.action) {
      const [domain, service] = String(ch.action).split(".");
      return domain && service && rcCall(h, domain, service, ch.data || {});
    }
    const entity_id = ch.player || this._config.player;
    if (!entity_id) return;
    if (ch.media_content_id) return rcCall(h, "media_player", "play_media", { entity_id, media_content_id: ch.media_content_id, media_content_type: ch.media_content_type || "channel" });
    if (ch.source) return rcCall(h, "media_player", "select_source", { entity_id, source: ch.source });
    // JellyHA (zupancicmarko/JellyHA) tunes a Jellyfin Live TV channel by number, else by name (`true`: the row's).
    if (ch.jellyfin_channel != null && ch.jellyfin_channel !== false) {
      const v = ch.jellyfin_channel === true ? ch.name : ch.jellyfin_channel;
      const key = /^\d+([.-]\d+)?$/.test(String(v)) ? "channel_number" : "channel_name";
      return rcCall(h, "jellyha", "play_live_tv_channel", { entity_id, [key]: String(v) });
    }
  }

  static styles = `
    ha-card { --c: #ae3ec9; }
    ha-card.lvl-live { --c: #ae3ec9; } ha-card.lvl-later { --c: #1c7ed6; } ha-card.lvl-none { --c: var(--rc-idle); }
    .t-movie { --t: #ae3ec9; } .t-series { --t: #0c8599; } .t-sport { --t: #2f9e44; } .t-kids { --t: #e67700; }
    .t-news { --t: #1c7ed6; } .t-documentary { --t: #5c940d; } .t-show { --t: #d6336c; }
    .tt { flex: 1 1 0; min-width: 5ch; display: flex; flex-direction: column; }
    .tt .title { flex: none; }
    .subt { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :host([hide-title]) .head .tt { visibility: hidden; }
    .box { margin-top: 10px; border-radius: 12px; padding: 10px 12px; background: var(--secondary-background-color, rgba(127,127,127,.08)); }
    .none { font-size: 13px; color: var(--secondary-text-color); }
    .filters { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    .gp { all: unset; cursor: pointer; font-size: 12.5px; font-weight: 500; line-height: 18px; padding: 4px 11px; border-radius: 999px;
          color: var(--primary-text-color); border: 1px solid var(--divider-color, rgba(127,127,127,.25)); }
    .gp.on { --t: var(--c); color: color-mix(in srgb, var(--t) 60%, var(--primary-text-color, #212121));
             background: color-mix(in srgb, var(--t) 12%, transparent); border-color: color-mix(in srgb, var(--t) 40%, transparent); }
    .gp:hover { background: color-mix(in srgb, var(--rc-idle) 10%, transparent); }
    .gp:focus-visible, .rmain:focus-visible, .play:focus-visible, .pl:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    .rows { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .row { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 8px; border-radius: 12px;
           background: var(--secondary-background-color, rgba(127,127,127,.08)); border: 1px solid transparent; }
    .row.playing { background: color-mix(in srgb, var(--c) 9%, var(--secondary-background-color, transparent));
                   border-color: color-mix(in srgb, var(--c) 55%, transparent); }
    .rmain { all: unset; cursor: pointer; flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; border-radius: 8px; }
    .logo { flex: none; width: 44px; height: 44px; border-radius: 10px; display: grid; place-items: center; overflow: hidden;
            font-size: 14px; font-weight: 700; color: var(--primary-text-color); background: var(--card-background-color, #fff);
            box-shadow: inset 0 0 0 1px var(--divider-color, rgba(127,127,127,.25)); }
    .logo img { width: 80%; height: 80%; object-fit: contain; }
    .rt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .rk { font-size: 12px; font-weight: 600; color: color-mix(in srgb, var(--t) 60%, var(--primary-text-color, #212121));
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    ha-card.dk .rk { color: color-mix(in srgb, var(--t) 55%, #fff); }
    .rn { font-size: 14px; font-weight: 600; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rx { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rbar { display: block; height: 4px; border-radius: 2px; margin: 5px 0 2px; background: color-mix(in srgb, var(--rc-idle) 22%, transparent); }
    .rbar > span { display: block; height: 4px; border-radius: 2px; background: var(--rc-idle); }
    .row.playing .rbar > span { background: var(--c); }
    .row.playing .rbar { background: color-mix(in srgb, var(--c) 20%, transparent); }
    .play { all: unset; cursor: pointer; flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
            color: var(--secondary-text-color); box-shadow: inset 0 0 0 1px var(--divider-color, rgba(127,127,127,.3)); }
    .play ha-icon { --mdc-icon-size: 18px; }
    .row.playing .play { color: var(--c); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 45%, transparent); }
    .play:hover { background: color-mix(in srgb, var(--rc-idle) 12%, transparent); }
    .foot { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 12.5px; color: var(--secondary-text-color); }
    .pl { all: unset; cursor: pointer; font-size: 12.5px; font-weight: 600; padding: 5px 12px; border-radius: 999px; min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          color: color-mix(in srgb, var(--c) 60%, var(--primary-text-color, #212121)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 35%, transparent); }
    ha-card.dk .pl { color: color-mix(in srgb, var(--c) 45%, #fff); }
    @container (max-width: 340px) {
      .logo { width: 36px; height: 36px; font-size: 13px; }
      .rmain { gap: 10px; }
      .rx { display: none; }
    }
    /* Illustrated header (banner): 90 px, edge to edge, the title on a lilac living-room wall, the sofa and the
       television at the right, a 10 px carpet strip at the bottom. The badge's icon is in the status colour. */
    .banner { position: relative; display: flex; height: 90px; margin: -12px -12px 0; overflow: hidden;
              background: linear-gradient(180deg, #f3effc 0%, #e6ddf9 100%);
              --bt: #1c1533; --bs: #4a3f6b; --ic: color-mix(in srgb, var(--c) 85%, #10283f); --sw: min(200px, 56%); }
    .banner.night { background: linear-gradient(180deg, #1b1630 0%, #251d40 100%); --bt: #fff; --bs: rgba(255,255,255,.78); --ic: color-mix(in srgb, var(--c) 60%, #fff); }
    .st-none .banner { --ic: #6b7680; }
    .st-none .banner.night { --ic: #a7b0b8; }
    .banner .head { position: relative; z-index: 1; flex: 1; min-width: 0; height: 80px; box-sizing: border-box;
                    padding: 0 calc(var(--sw) + 4px) 0 14px; flex-wrap: nowrap; }
    .banner .head::after { content: none; }
    .banner .badge { position: relative; color: var(--ic); background: rgba(255,255,255,.7); box-shadow: inset 0 0 0 1px rgba(28,21,51,.12); }
    .banner.night .badge { background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); }
    .banner .title { color: var(--bt); }
    .banner .subt { color: var(--bs); font-size: 13px; }
    .banner .room { position: absolute; right: 0; bottom: 10px; width: var(--sw); height: calc(80px * var(--sk, 1)); }
    .banner .ground { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: repeating-linear-gradient(90deg, #c4b5ea 0 22px, #d2c6f0 22px 44px); }
    .banner.night .ground { background: repeating-linear-gradient(90deg, #352c54 0 22px, #3f355f 22px 44px); }
    /* The mini card's expand / collapse button: 24 px, frosted, 5 px from the banner's top right corner. */
    .banner .zoom { position: absolute; z-index: 2; top: 5px; right: 5px; width: 24px; height: 24px; margin: 0; color: #3c3360;
                    background: rgba(255,255,255,.55); box-shadow: inset 0 0 0 1px rgba(255,255,255,.7); backdrop-filter: blur(4px); }
    .banner.night .zoom { color: #fff; background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.2); }
    .banner .zoom:hover { background: rgba(255,255,255,.75); color: #3c3360; }
    .banner.night .zoom:hover { background: rgba(255,255,255,.22); color: #fff; }
    .banner .tt { min-width: 0; flex: 1 1 auto; }
    /* Status pill right after the title (see tvPlacePill). */
    .trow { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .trow > .title { flex: 0 1 auto; min-width: 0; }
    .trow > .bpill, .trow > .pill { flex: none; max-width: none; }
    :host([hide-title]) .trow .title { visibility: hidden; }
    .head:has(.trow) { flex-wrap: nowrap; }
    .head:has(.trow)::after { content: none; }
    .bpill { display: inline-flex; align-items: center; gap: 4px; min-width: 0; box-sizing: border-box; overflow: hidden;
             white-space: nowrap; padding: 1px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; line-height: 16px;
             background: color-mix(in srgb, var(--c) 18%, rgba(255,255,255,.78)); color: color-mix(in srgb, var(--c) 45%, #1c1533); }
    .banner.night .bpill { background: color-mix(in srgb, var(--c) 30%, rgba(8,8,24,.55)); color: color-mix(in srgb, var(--c) 30%, #ffffff); }
    .bdot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); flex: none; }
    .st-live .bdot { animation: rc-blink 2s ease-in-out infinite; }
    .bpt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    [data-wrap] .trow { display: contents; }
    [data-wrap] .trow > .bpill, [data-wrap] .trow > .pill { order: 9; align-self: flex-start; max-width: 100%; margin-top: 3px; }
    .banner[data-wrap] .trow > .bpill { max-width: calc(100cqw - 80px); }
    [data-wrap] .subt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    [data-dot] .bpill { padding: 0; background: none; }
    [data-dot] .bpt, [data-dot] .trow > .pill .pt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    [data-dot] .trow > .pill { padding: 0; width: 18px; height: 18px; justify-content: center; background: none; }
    [data-dot] .trow > .pill::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    @container (max-width: 200px) {
      .bpill { padding: 0; background: none; }
      .bpt, .trow > .pill .pt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
      .trow > .pill { padding: 0; width: 18px; height: 18px; justify-content: center; background: none; }
      .trow > .pill::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    }
    @media (prefers-reduced-motion: reduce) { .st-live .bdot { animation: none; } }
    /* The mini card: the banner alone. */
    ha-card.bn { padding: 0; }
    ha-card.bn > .banner { margin: 0; --sw: 72px; }
    /* Narrower cards: the living room is drawn smaller (75 %, 62 %, then 50 % of its height, its left part cropped). */
    @container (max-width: 420px) { .banner { --sw: 150px; --sk: .75; } }
    @container (max-width: 340px) { .banner { --sw: 112px; --sk: .62; } }
    @container (max-width: 260px) { .banner { --sw: 70px; --sk: .5; } }
    /* The mini card's television stays whole: it is drawn at the right, clear of the zoom button. */
    ha-card.bn > .banner .room { right: 34px; }
    @container (max-width: 340px) { ha-card.bn > .banner .room { display: none; } ha-card.bn > .banner .head { padding-right: 34px; } }
    /* The mini card's second line: the channel and the times, plain text cut with an ellipsis. */
    .banner .evt { all: unset; display: block; min-width: 0; color: var(--bs); font-size: 13px; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .banner .evt[data-id] { cursor: pointer; }
    .banner .evt:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; border-radius: 4px; }
  `;
}

// ── Editor ───────────────────────────────────────────────────────────────────
const tvSchema = (booleans) => (lang) => [
  { name: "title", selector: { text: {} } },
  { name: "navigation_path", selector: { navigation: {} } },
  { name: "player", selector: { entity: { domain: "media_player" } } },
  { name: "mode", selector: { select: { mode: "dropdown", options: ["tonight", "now"].map((value) => ({ value, label: rcT(TV_I18N, lang, `ed_mode_${value}`) })) } } },
  { name: "prime_time", selector: { time: {} } },
  { name: "max_items", selector: { number: { min: 1, max: 20, step: 1, mode: "box" } } },
  ...rcBooleans(...booleans),
  {
    name: "illustration_theme",
    selector: { select: { mode: "dropdown", options: ["auto", "day", "night"].map((value) => ({ value, label: rcT(TV_I18N, lang, `ed_theme_${value}`) })) } },
  },
  ...rcAdvanced(TV_I18N, lang, "channels", "language"),
];

const TV_HELPERS = ["title", "player", "prime_time", "max_items", "zoom", "channels", "language"];

const TvGuideCardEditor = rcEditor({
  card: TvGuideCard,
  helpers: TV_HELPERS,
  schema: tvSchema(["show_title", "show_subtitle", "show_genres", "illustration", "animations"]),
});

rcRegister(TvGuideCard, TvGuideCardEditor, "TV Guide Card", "Tonight's programmes on your channels, from the EPG integrations, with progress bars and a play button");

// ── Mini card ────────────────────────────────────────────────────────────────
// The programme to watch on two lines: its title and status, the channel and the times, and a small television at
// the right of the banner; the zoom button opens the full card in place.
class TvGuideMiniCard extends rcMini(TvGuideCard, "tv-guide-mini-card", "") {
  getCardSize() {
    return this._zoomed ? super.getCardSize() : 1;
  }

  _drawMini(m) {
    const night = this._night();
    const dark = this._dark();
    const r = m.first;
    if (!this._changed(["mini", r && [r.ch.key, r.prog, r.live, r.playing], m.state, night, dark])) return;
    const status = !r ? this._t("st_none") : r.live ? this._t("st_ends", { time: this._time(r.prog.end) }) : this._t("st_from", { time: this._time(r.prog.start) });
    const text = r ? `${r.ch.name} · ${this._time(r.prog.start)} – ${this._time(r.prog.end)}` : this._t(m.empty ? "no_channels" : "nothing");
    const id = r?.ch.ids[0];
    const line = `<button class="subt evt"${id ? ` data-id="${rcEsc(id)}"` : ""} title="${rcEsc(text)}">${rcEsc(text)}</button>`;
    const c = this._config;
    const scene = tvSmall({ night, state: m.state, animate: this._animate() });
    this.shadowRoot.innerHTML = `<style>${RC_BASE_STYLES}${this.constructor.styles}</style>
      <ha-card class="lvl-${m.state} st-${m.state} bn${dark ? " dk" : ""}">${this._banner({ ...m, name: r ? r.prog.title : m.name }, line, scene, status)}</ha-card>`;
    const root = this.shadowRoot;
    if (c.navigation_path) rcBindNav(root.querySelector(".head"), c.navigation_path);
    for (const el of root.querySelectorAll(".evt[data-id]")) el.addEventListener("click", () => rcMoreInfo(this, el.dataset.id));
    this._fitPill();
  }
}

const TvGuideMiniCardEditor = rcEditor({
  card: TvGuideMiniCard,
  helpers: TV_HELPERS,
  schema: tvSchema(["show_title", "show_subtitle", "show_genres", "illustration", "animations", "zoom"]),
});

rcRegister(TvGuideMiniCard, TvGuideMiniCardEditor, "TV Guide Mini Card", "The programme to watch on two lines: its title, the channel and the times, with a zoom to the full card");
