import { Arrow, Box, FigureSvg, Label, Line, Lock } from "./primitives";

const ID = "round-lifecycle";
const PHASES = [
  { title: "Open", pub: "deposits, addresses" },
  { title: "Closing", pub: "cursor 8 of 32" },
  { title: "Drawing", pub: "seed requested" },
  { title: "Settled", pub: "round settled" },
] as const;

/** Bốn pha của một vòng; dưới mỗi pha là thứ public, hàng cuối là thứ vẫn sealed. */
export function RoundLifecycle() {
  const w = 140;
  const gap = 40;
  const x0 = 20;
  const y = 40;
  const h = 52;
  return (
    <FigureSvg id={ID} title="A round moves through Open, Closing, Drawing and Settled; amounts, weights, seed and winner stay sealed throughout" width={720} height={216}>
      <Label x={x0} y={18}>one round · fixed length · then the next one opens</Label>
      {PHASES.map((p, i) => {
        const x = x0 + i * (w + gap);
        return (
          <g key={p.title}>
            <Box x={x} y={y} w={w} h={h} />
            <Label x={x + w / 2} y={y + h / 2} anchor="middle" tone="fg" size={13} weight={500}>
              {p.title}
            </Label>
            <Label x={x + w / 2} y={y + h + 18} anchor="middle" size={11}>
              public
            </Label>
            <Label x={x + w / 2} y={y + h + 34} anchor="middle" size={11} tone="fg">
              {p.pub}
            </Label>
            {i < PHASES.length - 1 && <Arrow id={ID} x1={x + w + 4} y1={y + h / 2} x2={x + w + gap - 4} y2={y + h / 2} />}
          </g>
        );
      })}
      <Line x1={x0} y1={150} x2={700} y2={150} dashed />
      <Box x={x0} y={164} w={680} h={36} tone="encrypted" />
      <Lock x={x0 + 14} y={175} />
      <Label x={x0 + 38} y={182} tone="fg" size={12}>
        sealed in every phase: each saver&rsquo;s amount and weight, the seed, who won, what they won
      </Label>
    </FigureSvg>
  );
}
