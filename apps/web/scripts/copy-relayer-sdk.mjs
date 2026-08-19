// Copy prebundled relayer-sdk (UMD + WASM + worker) vào public/ ROOT.
// Lý do root: worker threads của SDK fetch /workerHelpers.js theo origin root,
// không theo thư mục script. Chạy tự động ở predev/prebuild — files nằm trong .gitignore.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../node_modules/@zama-fhe/relayer-sdk/bundle");
const dst = join(here, "../public");
mkdirSync(dst, { recursive: true });

// .cjs đổi thành .js để tránh MIME sai khi serve
copyFileSync(join(src, "relayer-sdk-js.umd.cjs"), join(dst, "relayer-sdk-js.umd.js"));
for (const f of ["workerHelpers.js", "tfhe_bg.wasm", "kms_lib_bg.wasm"]) {
  copyFileSync(join(src, f), join(dst, f));
}
console.log("relayer-sdk bundle copied -> public/ (root)");
