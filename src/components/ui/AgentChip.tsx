import { identityOf, type AuthorId } from "@/lib/agent-identity";

type AgentChipProps = {
  author: AuthorId;
  /** Show the name beside the icon. */
  showName?: boolean;
  size?: number;
  /** Draw the icon inside a filled circle of this diameter (px). */
  badge?: number;
  className?: string;
};

/** Icon (and optionally the name) of an agent, drawn from `identityOf`. Never initials. */
export function AgentChip({
  author,
  showName = false,
  size = 16,
  badge,
  className = "",
}: AgentChipProps) {
  const id = identityOf(author);
  const Icon = id.Icon;
  const inner = (
    <span
      className={`inline-flex items-center gap-[6px] ${badge ? "" : className}`}
      style={{ color: id.ink }}
      aria-label={showName ? undefined : id.name}
    >
      <Icon size={size} />
      {showName ? (
        <span className="font-sans text-[12px] font-semibold leading-[16px]">{id.name}</span>
      ) : null}
    </span>
  );
  if (!badge) return inner;
  return (
    <span
      className={`grid place-items-center rounded-full flex-none ${id.chipClass} ${className}`}
      style={{ width: badge, height: badge }}
    >
      {inner}
    </span>
  );
}
