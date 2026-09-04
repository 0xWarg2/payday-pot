import type { ReactElement } from "react";

import type { FigureId } from "@/lib/docs/figures";

import { DrawScan } from "./DrawScan";
import { EncryptedVsPublic } from "./EncryptedVsPublic";
import { PrizeSource } from "./PrizeSource";
import { RoundLifecycle } from "./RoundLifecycle";
import { SetupPath } from "./SetupPath";
import { WhoCanDecrypt } from "./WhoCanDecrypt";

/** Thiếu một id ở đây là lỗi type — không có hình nào "quên vẽ" lọt ra trang. */
export const FIGURES: Record<FigureId, () => ReactElement> = {
  "setup-path": SetupPath,
  "round-lifecycle": RoundLifecycle,
  "encrypted-vs-public": EncryptedVsPublic,
  "prize-source": PrizeSource,
  "who-can-decrypt": WhoCanDecrypt,
  "draw-scan": DrawScan,
};
