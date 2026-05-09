"use client";

import {
  ArrowIcon,
  CursorIcon,
  GroupDashedIcon,
  MicIcon,
  StickyIcon,
  ZoomFit,
  ZoomMinus,
  ZoomPlus,
} from "@/components/ui/icons";

export type BoardTool = "select" | "postit" | "arrow" | "group";

type ToolbarProps = {
  active: BoardTool;
  onTool: (t: BoardTool) => void;
  onMicTeaser: () => void;
};

export function BoardToolbar({ active, onTool, onMicTeaser }: ToolbarProps) {
  return (
    <div className="absolute left-3.5 top-[60px] z-[3] flex flex-col gap-1 bg-paper-2 border border-rule-1 rounded-[8px] p-1 shadow-(--shadow-soft)">
      <ToolBtn label="seleccionar" active={active === "select"} onClick={() => onTool("select")}>
        <CursorIcon />
      </ToolBtn>
      <ToolBtn
        label="post-it (N)"
        active={active === "postit"}
        onClick={() => onTool("postit")}
      >
        <StickyIcon />
      </ToolBtn>
      <ToolBtn label="flecha / conexión" active={active === "arrow"} onClick={() => onTool("arrow")}>
        <ArrowIcon />
      </ToolBtn>
      <ToolBtn label="grupo" active={active === "group"} onClick={() => onTool("group")}>
        <GroupDashedIcon />
      </ToolBtn>
      <hr className="border-0 border-t border-rule-1 my-1 w-[80%]" />
      <ToolBtn label="dictar (sesión futura)" active={false} onClick={onMicTeaser}>
        <MicIcon />
      </ToolBtn>
    </div>
  );
}

function ToolBtn({
  children,
  active,
  label,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`w-[30px] h-[30px] rounded-[5px] border-0 cursor-pointer grid place-items-center ${
        active ? "bg-ink-1 text-paper" : "bg-transparent text-ink-2 hover:bg-paper-3 hover:text-ink-1"
      }`}
    >
      {children}
    </button>
  );
}

type ZoomProps = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
};

export function BoardZoom({ zoom, onZoomIn, onZoomOut, onZoomFit }: ZoomProps) {
  const pct = Math.round(zoom * 100);
  return (
    <div className="absolute right-3.5 top-[60px] z-[3] inline-flex items-center gap-0 bg-paper-2 border border-rule-1 rounded-[8px] shadow-(--shadow-soft) p-0.5">
      <ZoomBtn title="zoom-out" onClick={onZoomOut}>
        <ZoomMinus />
      </ZoomBtn>
      <span className="font-mono text-[11px] font-medium text-ink-2 px-2 tracking-[0.04em]">
        {pct}%
      </span>
      <ZoomBtn title="zoom-in" onClick={onZoomIn}>
        <ZoomPlus />
      </ZoomBtn>
      <ZoomBtn title="ajustar" onClick={onZoomFit}>
        <ZoomFit />
      </ZoomBtn>
    </div>
  );
}

function ZoomBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="w-[26px] h-[26px] rounded grid place-items-center bg-transparent text-ink-2 hover:bg-paper-3 cursor-pointer"
    >
      {children}
    </button>
  );
}
