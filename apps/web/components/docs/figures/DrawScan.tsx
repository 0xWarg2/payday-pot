import { Arrow, Box, FigureSvg, Label, Lock } from "./primitives";

const ID = "draw-scan";
const GLYPH = "▪ ≥ ▪";

/** Một seed → hàng saver giống hệt nhau, cùng phép tính → một ô kết quả sealed. */
export function DrawScan() {
  const y = 44;
  const h = 48;
  const savers = 6;
  const sw = 52;
  const sgap = 12;
  const sx0 = 190;
  return (
    <FigureSvg id={ID} title="The draw scans every saver with the same encrypted operations; the result is sealed" width={720} height={170}>
      <Label x={20} y={18}>one seed · drawn once · same work for every saver</Label>
      <Box x={20} y={y} w={100} h={h} tone="encrypted" />
      <Lock x={30} y={y + 8} />
      <Label x={70} y={y + h / 2} anchor="middle" tone="fg" size={12}>
        seed
      </Label>
      <Arrow id={ID} x1={126} y1={y + h / 2} x2={sx0 - 6} y2={y + h / 2} />
      {Array.from({ length: savers }, (_, i) => {
        const x = sx0 + i * (sw + sgap);
        return (
          <g key={i}>
            <Box x={x} y={y} w={sw} h={h} />
            <Label x={x + sw / 2} y={y + h / 2} anchor="middle" tone="fg" size={12}>
              {GLYPH}
            </Label>
          </g>
        );
      })}
      <Arrow id={ID} x1={sx0 + savers * (sw + sgap) - sgap + 6} y1={y + h / 2} x2={620} y2={y + h / 2} />
      <Box x={626} y={y} w={74} h={h} tone="encrypted" />
      <Lock x={636} y={y + 8} />
      <Label x={672} y={y + h / 2} anchor="middle" tone="fg" size={12}>
        won?
      </Label>
      <Label x={sx0 + (savers * (sw + sgap) - sgap) / 2} y={y + h + 20} anchor="middle" size={11}>
        every saver, every operation, whether or not they hold the winning ticket
      </Label>
      <Label x={20} y={150} size={11}>
        Nothing about the winner leaks from gas, timing or scan order. Each saver opens their own flag.
      </Label>
    </FigureSvg>
  );
}
