import { Avatar, type SageKey } from "@/components/ui/Avatar";

type Sage = {
  key: SageKey;
  initials: string;
  name: string;
  active?: boolean;
};

const COUNCIL: Sage[] = [
  { key: "em",  initials: "EM", name: "El Empirista" },
  { key: "sis", initials: "SI", name: "El Sistémico", active: true },
  { key: "pra", initials: "PR", name: "El Práctico" },
  { key: "cri", initials: "CR", name: "El Crítico" },
];

export function CouncilAvatars() {
  return (
    <div className="flex items-center" title="El consejo">
      {COUNCIL.map((sage, i) => (
        <Avatar
          key={sage.key}
          sage={sage.key}
          initials={sage.initials}
          active={sage.active}
          title={sage.name}
          className={i > 0 ? "-ml-2" : ""}
        />
      ))}
    </div>
  );
}
