import { Arrow, Box, FigureSvg, Label, Line, Lock } from "./primitives";

const ID = "prize-source";

/** Sponsor → pot ở trên; hàng deposit có khoá ở dưới, KHÔNG có mũi tên nào đi lên. */
export function PrizeSource() {
  return (
    <FigureSvg id={ID} title="The prize is funded by a sponsor; savers' deposits are never spent on it" width={720} height={210}>
      <Box x={20} y={30} w={180} h={56} tone="action" />
      <Label x={110} y={50} anchor="middle" tone="fg" size={13} weight={500}>
        Sponsor
      </Label>
      <Label x={110} y={70} anchor="middle" size={11}>
        funds the prize, publicly
      </Label>
      <Arrow id={ID} x1={206} y1={58} x2={334} y2={58} />
      <Label x={270} y={44} anchor="middle" size={11}>
        public amount
      </Label>
      <Box x={340} y={30} w={180} h={56} tone="prize" />
      <Label x={430} y={50} anchor="middle" tone="fg" size={13} weight={500}>
        Prize pot
      </Label>
      <Label x={430} y={70} anchor="middle" size={11}>
        one winner per round
      </Label>
      <Label x={540} y={58} size={11}>
        unclaimed → rolls over
      </Label>

      <Line x1={20} y1={112} x2={700} y2={112} dashed />
      <Label x={700} y={124} anchor="end" size={11}>
        nothing crosses this line
      </Label>

      {[0, 1, 2, 3, 4].map((i) => {
        const x = 20 + i * 100;
        return (
          <g key={i}>
            <Box x={x} y={140} w={84} h={40} tone="encrypted" />
            <Lock x={x + 8} y={152} />
            <Label x={x + 30} y={160} tone="fg" size={11}>
              deposit
            </Label>
          </g>
        );
      })}
      <Label x={540} y={160} tone="fg" size={12} weight={500}>
        deposits — untouched
      </Label>
      <Label x={540} y={176} size={11}>
        withdraw all, any phase
      </Label>
    </FigureSvg>
  );
}
