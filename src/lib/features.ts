/**
 * Feature flags for UI affordances that are still on the roadmap.
 *
 * Each flag corresponds to a session in the build plan (see CLAUDE.md
 * / the Notion roadmap). When a session lands and the feature is
 * functional, flip the flag to `true` and the UI shows up.
 *
 * The placeholder UIs are kept in source — they're just gated — so
 * we don't lose the styles or the wiring.
 */
export const FEATURES = {
  /** Mesa Redonda — sage threaded conversation (sesión 5). */
  mesaRedonda: false,
  /** Pluma Roja — multi-pass critique with inline annotations (sesión 6). */
  plumaRoja: true,
  /** Benchmark — score strip at the bottom, derived from anotaciones (sesión 9). */
  benchmark: true,
  /** Generic "más" / overflow actions menu in the topbar. */
  topbarMore: false,
  /** Board "group" tool — currently aliases to select; real grouping is future. */
  boardGroup: false,
  /** Board microphone / dictation tool — needs voice integration. */
  boardMic: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;
