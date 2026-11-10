/** Reviewed model candidates. A listed model is not a measured or accessible model. */
export type ReviewerProfile = { id: string; label: string; model?: string; description: string };
export const DEFAULT_REVIEWER_PROFILE = "runtime-baseline";
export const REVIEWER_PROFILES: readonly ReviewerProfile[] = [
  { id: DEFAULT_REVIEWER_PROFILE, label: "Actual, sin fijar", description: "Conserva el modelo predeterminado de Claude Code. Su identidad se registra al evaluar." },
  { id: "sonnet-5.5", label: "Sonnet 5.5, candidato", model: "claude-sonnet-5-5", description: "Candidato sin benchmark ni acceso de cuenta comprobado. No es el nuevo predeterminado." },
  { id: "opus-5.5", label: "Opus 5.5, candidato", model: "claude-opus-5-5", description: "Candidato sin benchmark ni acceso de cuenta comprobado. No es el nuevo predeterminado." },
];
export function getReviewerProfile(id = DEFAULT_REVIEWER_PROFILE): ReviewerProfile {
  const profile = REVIEWER_PROFILES.find((item) => item.id === id);
  if (!profile) throw new Error("Unknown reviewer profile. No model fallback was attempted.");
  return profile;
}
export const resolveReviewerProfile = getReviewerProfile;
