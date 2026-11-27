/**
 * Shared by the TV guide cards (its names are used by the other src/ files): the programmes of the EPG integrations,
 * i18n helpers, the base card (header, tap / hold), the mini card, the visual editor and the common styles. Same base
 * as ha-room-card.
 * https://github.com/juju35/ha-tv-guide-card
 */
export const RC_VERSION = "__VERSION__";

export const RC_HOLD_MS = 500;
export const RC_MOVE_PX = 8;
// A held arrow key repeats some 30 times a second: one brightness step every RC_REPEAT_MS at most.
export const RC_REPEAT_MS = 150;
