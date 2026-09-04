import type { ReactNode } from "react";

import type { FigureId } from "@/lib/docs/figures";

/**
 * Bộ nét chung cho mọi sơ đồ trong Docs.
 *
 * Màu CHỈ qua CSS variable — không hex — để hình đổi theo token của app và có
 * thể bê nguyên sang README sau. Nét 1.5 ở mọi đường; chữ mono 12px. Không có
 * `height` trên `<svg>`: viewBox + width 100% để hình co theo cột 720px.
 *
 * Bốn "tone" là bốn nghĩa, không phải bốn màu trang trí:
 *   neutral   — thứ ai cũng thấy (khung, mũi tên, địa chỉ, thời điểm)
 *   encrypted — thứ chỉ chủ ví mở được (số dư, trọng số, seed, cờ thắng)
 *   prize     — tiền giải, do sponsor nạp
 *   action    — việc BẠN làm (ký, bấm)
 */
export const STROKE = 1.5;

export const C = {
  fg: "var(--color-fg)",
  muted: "var(--color-fg-muted)",
  border: "var(--color-border-default)",
  surface: "var(--color-surface)",
  subtle: "var(--color-subtle)",
  encStroke: "color-mix(in srgb, var(--color-privacy) 55%, var(--color-fg-muted))",
  encFill: "var(--color-privacy-subtle)",
  prizeStroke: "color-mix(in srgb, var(--color-prize) 60%, var(--color-fg-muted))",
  prizeFill: "var(--color-prize-soft)",
  actionStroke: "color-mix(in srgb, var(--color-action) 55%, var(--color-fg-muted))",
  actionFill: "color-mix(in srgb, var(--color-action) 18%, var(--color-surface))",
} as const;

export type Tone = "neutral" | "encrypted" | "prize" | "action";

const TONE: Record<Tone, { stroke: string; fill: string }> = {
  neutral: { stroke: C.border, fill: C.surface },
  encrypted: { stroke: C.encStroke, fill: C.encFill },
  prize: { stroke: C.prizeStroke, fill: C.prizeFill },
  action: { stroke: C.actionStroke, fill: C.actionFill },
};

export function titleId(id: FigureId): string {
  return `fig-${id}-title`;
}
export function descId(id: FigureId): string {
  return `fig-${id}-desc`;
}
function markerId(id: FigureId): string {
  return `m-${id}`;
}

export function FigureSvg({
  id,
  title,
  width,
  height,
  children,
}: {
  id: FigureId;
  title: string;
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <svg
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      aria-labelledby={titleId(id)}
      aria-describedby={descId(id)}
      className="block h-auto w-full"
      style={{ maxWidth: 720, fontFamily: "var(--font-mono)" }}
    >
      <title id={titleId(id)}>{title}</title>
      <defs>
        <marker id={markerId(id)} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0 0 L8 4 L0 8 Z" fill={C.muted} />
        </marker>
      </defs>
      {children}
    </svg>
  );
}

export function Box({
  x,
  y,
  w,
  h,
  tone = "neutral",
  dashed = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: Tone;
  dashed?: boolean;
}) {
  const t = TONE[tone];
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={8}
      fill={t.fill}
      stroke={t.stroke}
      strokeWidth={STROKE}
      strokeDasharray={dashed ? "4 4" : undefined}
    />
  );
}

export function Arrow({ id, x1, y1, x2, y2 }: { id: FigureId; x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.muted} strokeWidth={STROKE} markerEnd={`url(#${markerId(id)})`} />;
}

export function Line({ x1, y1, x2, y2, dashed = false }: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.border} strokeWidth={STROKE} strokeDasharray={dashed ? "4 4" : undefined} />;
}

export function Label({
  x,
  y,
  children,
  tone = "muted",
  size = 12,
  anchor = "start",
  weight = 400,
}: {
  x: number;
  y: number;
  children: ReactNode;
  tone?: "muted" | "fg";
  size?: number;
  anchor?: "start" | "middle" | "end";
  weight?: 400 | 500 | 600;
}) {
  return (
    <text x={x} y={y} fill={tone === "fg" ? C.fg : C.muted} fontSize={size} fontWeight={weight} textAnchor={anchor} dominantBaseline="middle">
      {children}
    </text>
  );
}

/** Ổ khoá 12×14 — "chỉ chủ ví mở được". */
export function Lock({ x, y }: { x: number; y: number }) {
  return (
    <g fill="none" stroke={C.encStroke} strokeWidth={STROKE}>
      <rect x={x} y={y + 6} width={12} height={9} rx={2} fill={C.encFill} />
      <path d={`M${x + 2.5} ${y + 6} v-2.5 a3.5 3.5 0 0 1 7 0 v2.5`} />
    </g>
  );
}

/** Con mắt 14×9 — "ai cũng thấy". */
export function Eye({ x, y }: { x: number; y: number }) {
  return (
    <g fill="none" stroke={C.muted} strokeWidth={STROKE}>
      <path d={`M${x} ${y + 5} q7 -8 14 0 q-7 8 -14 0 z`} />
      <circle cx={x + 7} cy={y + 5} r={2} />
    </g>
  );
}

/** Chìa khoá — `struck` thì gạch chéo: có handle, không có quyền. */
export function Key({ x, y, struck = false }: { x: number; y: number; struck?: boolean }) {
  return (
    <g fill="none" stroke={C.muted} strokeWidth={STROKE}>
      <circle cx={x + 5} cy={y + 5} r={4} />
      <path d={`M${x + 8.5} ${y + 7.5} l9 9 M${x + 14} ${y + 13} l2.5 -2.5 M${x + 11} ${y + 10} l2.5 -2.5`} />
      {struck && <path d={`M${x - 2} ${y + 18} L${x + 20} ${y - 2}`} />}
    </g>
  );
}

/** Nét bút — "bạn ký". */
export function Sign({ x, y }: { x: number; y: number }) {
  return (
    <g fill="none" stroke={C.actionStroke} strokeWidth={STROKE}>
      <path d={`M${x} ${y + 12} c4 -10 6 -10 8 -2 c2 8 4 8 8 -4 c1 -3 3 -3 4 0`} />
      <path d={`M${x} ${y + 16} h20`} />
    </g>
  );
}
