"use client";

import type { Fuente, ReviewEvidence, ReviewProvenance } from "@/lib/storage/types";
import { verifyEvidence } from "../../sidecar/src/review-contract";

/** Literal provenance is distinct from whether a source supports a diagnosis. */
export function ReviewEvidenceDetails({ evidence, sources, provenance }: {
  evidence?: ReviewEvidence[] | null;
  sources?: Fuente[];
  provenance?: ReviewProvenance | null;
}) {
  const checked = verifyEvidence(evidence ?? undefined, sources ?? []);
  const model = typeof provenance?.resolvedModel === "string" ? provenance.resolvedModel : null;
  const requestedModel = typeof provenance?.requestedModel === "string" ? provenance.requestedModel : null;
  return (
    <details className="mt-2 border-t border-rule-1 pt-1.5 font-sans text-[11px] leading-relaxed text-ink-2" data-testid="review-evidence">
      <summary className="cursor-pointer text-ink-3">
        Fuentes y revisor {checked.some((item) => item.verification !== "verified") ? "· revisar evidencia" : ""}
      </summary>
      <p className="mt-1">Modelo: {model ?? "no registrado"}.</p>
      {!model && requestedModel ? <p>Solicitado: {requestedModel}. Sin resolución registrada.</p> : null}
      {checked.length === 0 ? <p className="mt-1 text-ink-3">Sin fragmentos de fuente registrados para esta anotación.</p> : (
        <ul className="mt-1 space-y-2 list-none p-0">
          {checked.map((item, index) => {
            const source = sources?.find((candidate) => candidate.id === item.sourceId);
            return (
              <li key={`${item.sourceId}:${index}`} className="border-l-2 border-rule-2 pl-2">
                <p className="font-medium">{source?.nombre ?? (item.sourceId || "Fuente no identificada")}</p>
                <p className={item.verification === "verified" ? "text-ink-3" : "text-seal"}>
                  {item.verification === "verified"
                    ? "El fragmento coincide con la fuente. Su apoyo al diagnóstico requiere revisión."
                    : item.verification === "missing_source"
                      ? "La fuente no está en la biblioteca actual."
                      : "El fragmento o su ubicación no coinciden con la fuente."}
                </p>
                {item.quote ? <blockquote className="my-1 font-serif text-[12px] whitespace-pre-wrap break-words">“{item.quote}”</blockquote> : null}
                <p className="text-ink-3">Relación propuesta: {item.relation === "supports" ? "apoya" : item.relation === "contradicts" ? "contradice" : "contexto"}.</p>
                {item.locator ? <p className="text-ink-3">Localizador propuesto: {item.locator} (no verificado).</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
