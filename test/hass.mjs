// A mock Home Assistant: the five channels of the screenshots (scripts/screenshots/mock.mjs), one per source, the
// calendar answered by callApi and recorded in `hass.api`. The day is fixed by the tests (NOW): Friday 27 November
// 2026, 21:40 local time (BEFORE: 18:30, before prime time).
import { CHANNELS, nowOf, setup } from "../scripts/screenshots/mock.mjs";

export { CHANNELS };
export const NOW = nowOf("live");
export const BEFORE = nowOf("later");
export const at = (h, m, d = 27) => new Date(2026, 10, d, h, m).getTime();

export const makeHass = ({ scene = "live", ...overrides } = {}) => {
  const { hass } = setup({ scene });
  const out = { ...hass, themes: { darkMode: false }, api: [], calls: [], ...overrides };
  out.callApi = async (method, path) => {
    out.api.push([method, path]);
    return out.__calendar;
  };
  out.callService = async (domain, service, data) => {
    out.calls.push([domain, service, data]);
  };
  return out;
};
