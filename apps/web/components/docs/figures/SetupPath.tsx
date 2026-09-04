import { Arrow, Box, FigureSvg, Label, Lock } from "./primitives";

const ID = "setup-path";
const STOPS = [
  { title: "Wallet", tag: "public" },
  { title: "Sepolia", tag: "public" },
  { title: "Test USDC", tag: "public" },
  { title: "Shield", tag: "amount public" },
  { title: "Deposit", tag: "encrypted" },
] as const;

/** Năm chặng setup; bốn chặng đầu là giao dịch thường, chỉ chặng cuối mã hoá. */
export function SetupPath() {
  const w = 116;
  const gap = 30;
  const x0 = 20;
  const y = 44;
  const h = 56;
  return (
    <FigureSvg id={ID} title="Setup path: wallet, Sepolia, test USDC, shield, then an encrypted deposit" width={720} height={170}>
      <Label x={x0} y={18}>5 steps · about two minutes</Label>
      {STOPS.map((s, i) => {
        const x = x0 + i * (w + gap);
        const last = i === STOPS.length - 1;
        return (
          <g key={s.title}>
            <Box x={x} y={y} w={w} h={h} tone={last ? "encrypted" : i === 3 ? "action" : "neutral"} />
            <Label x={x + w / 2} y={y + h / 2} anchor="middle" tone="fg" size={13} weight={500}>
              {s.title}
            </Label>
            {last && <Lock x={x + w - 20} y={y + 6} />}
            <Label x={x + w / 2} y={y + h + 22} anchor="middle" size={11}>
              {s.tag}
            </Label>
            {!last && <Arrow id={ID} x1={x + w + 4} y1={y + h / 2} x2={x + w + gap - 4} y2={y + h / 2} />}
          </g>
        );
      })}
      <Label x={x0} y={150} size={11}>
        Only the deposit amount is encrypted. The shield step&rsquo;s amount is a normal transaction and stays public.
      </Label>
    </FigureSvg>
  );
}
