"use client";

// The stamp in the toolbar, connected: reads the open essay and the run,
// shows the right state and opens the report card (or the review panel while
// a run is active). The only component with the scorebar test ids.

import { useEffect, useState } from "react";

import { CorrectionsPanel } from "@/components/review/CorrectionsPanel";
import { ReportCard } from "@/components/review/ReportCard";
import { Stamp } from "@/components/review/Stamp";
import { useReviewReading } from "@/components/review/useReviewResult";
import { Tooltip } from "@/components/ui/Tooltip";
import { useRegisterAnchor } from "@/components/ui/useAnchor";
import { startReview } from "@/lib/review/run";
import { defaultPasesForMode } from "@/lib/sages";
import { useStore } from "@/lib/store";

type View = null | { kind: "report" } | { kind: "corrections"; criterioId: string | null };

export function ScoreStamp() {
  const reading = useReviewReading();
  const essayId = useStore((s) => s.current?.id ?? null);
  const mode = useStore((s) => s.current?.mode ?? "academico");
  const running = useStore(
    (s) =>
      s.review !== null &&
      s.review.essayId === s.current?.id &&
      Object.values(s.review.passes).some((p) => p.status === "running"),
  );
  const openReview = useStore((s) => s.openReview);
  // A client can hide the stamp for the session; a new review or another essay brings it back.
  const hidden = useStore((s) => s.scorebarDismissed);
  const [view, setView] = useState<View>(null);
  const registerAnchor = useRegisterAnchor("stamp");
  const bump = useStore((s) => s.bumpReviewSurfaces);
  const surfaceOpen = view !== null;
  useEffect(() => {
    if (!surfaceOpen) return;
    bump(1);
    return () => bump(-1);
  }, [surfaceOpen, bump]);

  if (!reading || !essayId || hidden) return null;
  const { result, views } = reading;

  const hasNumber = result.overall !== null;
  // Never reviewed, nothing underlined, nothing running: no stamp at all.
  if (!running && !result.wasEvaluated && views.length === 0) return null;

  const tip = running
    ? "Revisando"
    : !hasNumber
      ? "Vuelve a revisar para ver tu nota."
      : result.isStale
        ? "El texto cambió desde la revisión."
        : null;

  const onClick = () => {
    if (running || !hasNumber) openReview();
    else setView((v) => (v ? null : { kind: "report" }));
  };

  const aria = running
    ? "Revisando el ensayo"
    : hasNumber
      ? `Nota del ensayo ${result.overall}${result.isStale ? ", desactualizada" : ""}`
      : "Ensayo sin nota";

  const stamp = (
    <button
      ref={registerAnchor}
      type="button"
      data-testid="scorebar"
      data-state={running ? "running" : !hasNumber ? "empty" : result.isStale ? "stale" : "score"}
      aria-label={aria}
      onClick={onClick}
      className="flex cursor-pointer flex-none items-center justify-center bg-transparent p-0 transition-transform duration-[120ms] active:scale-[0.97]"
    >
      <Stamp
        result={result}
        size="toolbar"
        running={running}
        testIds={{ number: "scorebar-overall", stale: "scorebar-stale" }}
      />
    </button>
  );

  return (
    <>
      {tip ? <Tooltip label={tip}>{stamp}</Tooltip> : stamp}
      <ReportCard
        open={view?.kind === "report"}
        onClose={() => setView(null)}
        onOpenCorrections={(criterioId) => setView({ kind: "corrections", criterioId })}
      />
      <CorrectionsPanel
        open={view?.kind === "corrections"}
        onClose={() => setView(null)}
        criterioId={view?.kind === "corrections" ? view.criterioId : null}
        onCriterioChange={(criterioId) => setView({ kind: "corrections", criterioId })}
        onReview={() => {
          setView(null);
          startReview(defaultPasesForMode(mode));
        }}
      />
    </>
  );
}
