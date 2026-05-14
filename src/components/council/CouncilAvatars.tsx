"use client";

import { Avatar, type SageKey } from "@/components/ui/Avatar";
import { useStore } from "@/lib/store";

type Member = {
  key: SageKey;
  initials: string;
  name: string;
  /** Subtle "this sage just did something" cue. Static for now. */
  active?: boolean;
};

const COUNCIL: Member[] = [
  { key: "em",  initials: "EM", name: "El Empirista" },
  { key: "sis", initials: "SI", name: "El Sistémico", active: true },
  { key: "pra", initials: "PR", name: "El Práctico" },
  { key: "cri", initials: "CR", name: "El Crítico" },
];

/**
 * The four council heads in the topbar. Clicking any one of them
 * opens the Lectura overlay with that sage pre-selected — turning
 * the previously-decorative avatars into shortcuts to interrogate
 * a text from each sage's voice.
 */
export function CouncilAvatars() {
  const view = useStore((s) => s.view);
  const openLectura = useStore((s) => s.openLectura);
  const canInterrogate = view === "editor";

  return (
    <div className="flex items-center" title="El consejo · click para interrogar">
      {COUNCIL.map((sage, i) => {
        const sharedClasses =
          (i > 0 ? "-ml-2 " : "") +
          (canInterrogate
            ? "cursor-pointer transition-transform hover:scale-110 hover:z-[1]"
            : "");
        const avatar = (
          <Avatar
            sage={sage.key}
            initials={sage.initials}
            active={sage.active}
            title={
              canInterrogate
                ? `${sage.name} · interrogar texto`
                : sage.name
            }
            className={sharedClasses}
          />
        );
        if (!canInterrogate) return <span key={sage.key}>{avatar}</span>;
        return (
          <button
            key={sage.key}
            type="button"
            onClick={() => openLectura(sage.key)}
            aria-label={`Interrogar como ${sage.name}`}
            className="bg-transparent border-0 p-0"
          >
            {avatar}
          </button>
        );
      })}
    </div>
  );
}
