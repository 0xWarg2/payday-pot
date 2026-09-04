import { Box, Eye, FigureSvg, Label, Lock } from "./primitives";

const ID = "encrypted-vs-public";
const ENC = ["your deposit", "your balance", "your odds in the draw", "whether you won", "what you won"];
const PUB = ["your address", "when you acted", "how many savers there are", "the prize amount", "the rules and the code"];

/** Hai cột, năm hàng: ổ khoá bên trái, con mắt bên phải. */
export function EncryptedVsPublic() {
  const colW = 330;
  const x1 = 20;
  const x2 = 370;
  const y0 = 16;
  const rowH = 34;
  const H = 60 + ENC.length * rowH;
  return (
    <FigureSvg id={ID} title="What stays encrypted versus what is public on chain" width={720} height={H + 10}>
      <Box x={x1} y={y0} w={colW} h={H - 10} tone="encrypted" />
      <Box x={x2} y={y0} w={colW} h={H - 10} />
      <Label x={x1 + 16} y={y0 + 22} tone="fg" size={12} weight={600}>
        ENCRYPTED · only you can open
      </Label>
      <Label x={x2 + 16} y={y0 + 22} tone="fg" size={12} weight={600}>
        PUBLIC · anyone can read
      </Label>
      {ENC.map((t, i) => {
        const y = y0 + 48 + i * rowH;
        return (
          <g key={t}>
            <Lock x={x1 + 16} y={y - 8} />
            <Label x={x1 + 40} y={y} tone="fg" size={13}>
              {t}
            </Label>
          </g>
        );
      })}
      {PUB.map((t, i) => {
        const y = y0 + 48 + i * rowH;
        return (
          <g key={t}>
            <Eye x={x2 + 15} y={y - 5} />
            <Label x={x2 + 40} y={y} tone="fg" size={13}>
              {t}
            </Label>
          </g>
        );
      })}
    </FigureSvg>
  );
}
