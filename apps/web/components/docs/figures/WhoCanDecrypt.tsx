import { Arrow, Box, FigureSvg, Key, Label, Line, Sign } from "./primitives";

const ID = "who-can-decrypt";
const HANDLE = "0x9f…c2";

/** Trái: bạn + chữ ký → con số. Phải: keeper/sponsor/owner → vẫn chỉ handle. */
export function WhoCanDecrypt() {
  return (
    <FigureSvg id={ID} title="Only the wallet that owns a value can decrypt it; keeper, sponsor and owner only ever see the encrypted handle" width={720} height={190}>
      <Label x={20} y={18} tone="fg" size={12} weight={600}>
        YOU
      </Label>
      <Box x={20} y={40} w={110} h={44} tone="encrypted" />
      <Label x={75} y={62} anchor="middle" size={12}>
        {HANDLE}
      </Label>
      <Arrow id={ID} x1={136} y1={62} x2={190} y2={62} />
      <Sign x={196} y={50} />
      <Label x={206} y={86} anchor="middle" size={11}>
        sign
      </Label>
      <Arrow id={ID} x1={226} y1={62} x2={280} y2={62} />
      <Box x={286} y={40} w={110} h={44} tone="action" />
      <Label x={341} y={62} anchor="middle" tone="fg" size={13} weight={500}>
        1,250.00
      </Label>
      <Label x={20} y={112} size={11}>
        in your browser · five minutes · never stored
      </Label>

      <Line x1={430} y1={10} x2={430} y2={125} dashed />

      <Label x={456} y={18} tone="fg" size={12} weight={600}>
        KEEPER · SPONSOR · OWNER
      </Label>
      <Box x={456} y={40} w={110} h={44} tone="encrypted" />
      <Label x={511} y={62} anchor="middle" size={12}>
        {HANDLE}
      </Label>
      <Arrow id={ID} x1={572} y1={62} x2={616} y2={62} />
      <Key x={624} y={53} struck />
      <Label x={456} y={112} size={11}>
        no access rule grants them a key
      </Label>

      <Line x1={20} y1={140} x2={700} y2={140} />
      <Label x={20} y={162} size={11}>
        Same handle for everyone. Only the owning wallet&rsquo;s signature turns it into a number.
      </Label>
    </FigureSvg>
  );
}
