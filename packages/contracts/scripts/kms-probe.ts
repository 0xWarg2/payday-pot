/**
 * Probe độc lập, hai câu hỏi:
 *
 * 1. `userDecrypt` thất bại vì code của mình hay vì committee KMS của Zama?
 *    Chạy hoàn toàn NGOÀI trình duyệt — không Next build, không WASM path của
 *    web, không COOP/COEP, keypair sinh tại đây. Nếu vẫn chết đúng chỗ
 *    `Gao decoding failure … n=13 deg=4 #shares=9` thì là hạ tầng.
 * 2. Sau khi giải mã được, principal/twab/pendingPrize của từng participant
 *    thật ra đang là bao nhiêu — dùng để đối chiếu với UI, không phải để hiện
 *    ra đâu khác.
 *
 *   npx hardhat run scripts/kms-probe.ts --network sepolia
 *
 * Ví nào giải mã được là ví nào có ACL: script chỉ ký được bằng các signer của
 * MNEMONIC, nên participant ngoài mnemonic sẽ báo "no ACL" — đó là kết quả
 * ĐÚNG, không phải lỗi.
 */
import { ethers } from "hardhat";

const POT = "0x792c77D9A2052ED03aaB6B392364c3e17f52a035";
const EMPTY = /^0x0+$/;

function chain(e: unknown, depth = 0): string {
  if (depth > 6 || e === null || e === undefined) return "";
  const msg = e instanceof Error ? e.message : String(e);
  const next = e instanceof Error ? chain(e.cause, depth + 1) : "";
  return next ? `${msg} <- ${next}` : msg;
}

const isGao = (e: unknown) => /gao decoding|error reconstructing|occured during decryption/i.test(chain(e));

async function main() {
  const sdk = await import("@zama-fhe/relayer-sdk/node");
  const rpc =
    (ethers.provider as unknown as { _getConnection?: () => { url: string } })._getConnection?.().url ??
    "https://ethereum-sepolia-rpc.publicnode.com";
  const instance = await sdk.createInstance({ ...sdk.SepoliaConfig, network: rpc });

  const signers = await ethers.getSigners();
  const byAddress = new Map(await Promise.all(signers.map(async (s) => [await s.getAddress(), s] as const)));

  const pot = await ethers.getContractAt("PayDayPot", POT, signers[0]!);
  const count = Number(await pot.participantCount());
  console.log(`epoch #${await pot.currentEpochId()} · ${count} participant\n`);

  let gao = 0;
  let ok = 0;

  for (let i = 0; i < count; i += 1) {
    const user: string = await pot.participantAt(i);
    const signer = byAddress.get(user);
    const targets = {
      principal: (await pot.principalOf(user)) as string,
      twabArea: (await pot.twabAreaOf(user)) as string,
      pendingPrize: (await pot.pendingPrizeOf(user)) as string,
    };
    const live = Object.entries(targets).filter(([, h]) => !EMPTY.test(h));
    console.log(`#${i} ${user}${signer ? "" : "   (ngoài mnemonic — không ký được, bỏ qua)"}`);
    for (const [k, h] of Object.entries(targets)) console.log(`   ${k.padEnd(13)} ${EMPTY.test(h) ? "(chưa init)" : h}`);
    if (!signer || live.length === 0) {
      console.log("");
      continue;
    }

    const keypair = instance.generateKeypair();
    const start = Math.floor(Date.now() / 1000);
    const days = 1;
    const eip712 = instance.createEIP712(keypair.publicKey, [POT], start, days);
    const signature = await signer.signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: (eip712.types as Record<string, unknown>)["UserDecryptRequestVerification"] },
      eip712.message,
    );

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        const out = await instance.userDecrypt(
          live.map(([, h]) => ({ handle: h, contractAddress: POT })),
          keypair.privateKey,
          keypair.publicKey,
          signature.replace("0x", ""),
          [POT],
          user,
          start,
          days,
        );
        ok += 1;
        for (const [k, h] of live) {
          const raw = (out as Record<string, bigint>)[h];
          const scaled = k === "twabArea" ? `${raw}` : `${Number(raw) / 1e6} USDC`;
          console.log(`   → ${k.padEnd(13)} ${scaled}`);
        }
        console.log(`   (attempt ${attempt})\n`);
        break;
      } catch (e) {
        if (!isGao(e)) {
          console.log(`   → KHÔNG giải mã được, và KHÔNG phải lỗi KMS: ${chain(e)}\n`);
          break;
        }
        gao += 1;
        if (attempt === 6) console.log(`   → 6/6 lần đều Gao decoding failure — hạ tầng đang từ chối\n`);
      }
    }
  }

  console.log(`tổng kết: ${ok} lần giải mã xong · ${gao} lần bị KMS trả về bộ share không dựng lại được`);
}

main().catch((e) => {
  console.error(chain(e));
  process.exit(1);
});
