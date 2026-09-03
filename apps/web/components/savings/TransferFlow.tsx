"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { toPotError, type PotError } from "@payday-pot/sdk";
import { getPayDayPotDeployment } from "@payday-pot/shared";

import { Button } from "@/components/ui/Button";
import { EncryptedBadge } from "@/components/ui/Card";
import { ErrorPanel, NoticeBanner } from "@/components/ui/ErrorPanel";
import { Field } from "@/components/ui/Field";
import { CUSDC_ADDRESS } from "@/lib/chain/tokens";
import { EncryptCancelled, encryptAmount, type EncryptPhase } from "@/lib/fhevm/encrypt";
import { formatAmount, parseAmount } from "@/lib/format";
import { potReadsStore } from "@/lib/pot/reads";
import { checkDeposit, submitDeposit, submitWithdraw } from "@/lib/savings/actions";
import {
  INITIAL_TRANSFER_STATE,
  STAGE_COPY,
  transferReducer,
  type TransferState,
} from "@/lib/savings/machine";
import { useStore } from "@/lib/store/external-store";
import { connectWallet, switchToSepolia } from "@/lib/wallet/connect";
import { useWriteGate } from "@/lib/wallet/use-write-gate";
import { walletStore } from "@/lib/wallet/store";
import { EncryptProgress } from "./EncryptProgress";
import { ReviewDialog } from "./ReviewDialog";

/**
 * Một lần chuyển tiền, từ ô nhập đến khi số dư được đọc lại từ chain.
 *
 * Deposit và withdraw dùng CÙNG component vì chúng là cùng một chuỗi trạng thái;
 * khác biệt duy nhất có thật là proof bind vào đâu — deposit vào **token**
 * (người gửi là holder gọi `confidentialTransferAndCall`), withdraw vào **pot**.
 * Sai chỗ này thì chain từ chối sau mười giây mã hoá, nên địa chỉ đi kèm proof
 * và được kiểm ở tầng SDK.
 *
 * Trật tự các bước không phải để cho đẹp: **pre-flight bằng plaintext TRƯỚC khi
 * mã hoá**. ERC-7984 clamp về encrypted zero thay vì revert, nên một deposit
 * "thành công" có thể đã chuyển đúng 0 mà không có tín hiệu nào. Đọc trước thì
 * ta chặn được bằng câu người dùng hiểu; đọc sau thì ta chỉ còn cách đoán.
 */
export function TransferFlow({ kind }: { kind: "deposit" | "withdraw" }) {
  const wallet = useStore(walletStore);
  const reads = useStore(potReadsStore);
  const gate = useWriteGate();
  const account = wallet.address;

  const [state, dispatch] = useReducer(transferReducer, INITIAL_TRANSFER_STATE);
  const [amount, setAmount] = useState("");
  const [encryptPhase, setEncryptPhase] = useState<EncryptPhase>("starting");
  const inputRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const lastRun = useRef<(() => void) | null>(null);

  // Đổi ví hoặc rời trang giữa luồng: bỏ hết state trong bộ nhớ. Một draft của
  // ví trước còn nằm trên màn hình của ví sau là rò rỉ, dù nó chưa đi đâu cả.
  useEffect(() => {
    abort.current?.abort();
    dispatch({ type: "RESET" });
    setAmount("");
  }, [account]);
  useEffect(() => () => abort.current?.abort(), []);

  let parsed: bigint | null = null;
  let parseError: string | null = null;
  try {
    if (amount.trim() !== "") parsed = parseAmount(amount);
  } catch (e) {
    parseError = (e as Error).message;
  }

  const isDeposit = kind === "deposit";
  const perUserCap = reads.config?.perUserCap ?? null;
  const busy = state.stage !== "form" && state.stage !== "blocked" && state.stage !== "done";

  /** Chuỗi checking → encrypting → review. Chưa mở ví ở bất kỳ bước nào. */
  function start(draft: bigint): void {
    lastRun.current = () => start(draft);
    const controller = new AbortController();
    abort.current = controller;
    dispatch({ type: "CHECK", draft });

    void (async () => {
      try {
        if (isDeposit) {
          const blocked = await checkDeposit({ account: account!, amount: draft });
          if (blocked) {
            dispatch({ type: "BLOCK", error: blocked });
            return;
          }
        }
        if (controller.signal.aborted) return;

        dispatch({ type: "ENCRYPT" });
        setEncryptPhase("starting");
        const encrypted = await encryptAmount({
          // Deposit đi qua token, withdraw đi vào pot — xem đầu file. Địa chỉ
          // pot lấy từ manifest chứ không từ `reads`: `reads.config` là kết quả
          // của một lần đọc RPC có thể chưa xong hoặc đã hỏng, và không có lý
          // do gì để một luồng rút tiền phụ thuộc vào một cái poll.
          contractAddress: isDeposit ? CUSDC_ADDRESS : getPayDayPotDeployment().address,
          account: account!,
          amount: draft,
          onPhase: setEncryptPhase,
          signal: controller.signal,
        });
        dispatch({ type: "ENCRYPTED", encrypted });
      } catch (e) {
        if (e instanceof EncryptCancelled) return;
        dispatch({ type: "FAIL", error: toPotError(e) });
      }
    })();
  }

  function submit(): void {
    if (!account || !state.encrypted) return;
    const encrypted = state.encrypted;
    dispatch({ type: "SUBMIT" });
    lastRun.current = null; // Không có "retry" cho một tx đã ký — xem R11.

    void (async () => {
      try {
        const onHash = (txHash: string): void => dispatch({ type: "HASH", txHash });
        if (isDeposit) await submitDeposit(account, encrypted, { onHash });
        else await submitWithdraw(account, encrypted, { onHash });
        // `CONFIRMED` xoá draft khỏi state — từ đây màn hình không còn số nào để
        // echo, kể cả nếu ta muốn. `submit*` đã đọc lại chain xong.
        dispatch({ type: "CONFIRMED" });
        dispatch({ type: "SYNCED" });
        setAmount("");
      } catch (e) {
        dispatch({ type: "FAIL", error: toPotError(e) });
      }
    })();
  }

  function cancel(): void {
    abort.current?.abort();
    dispatch({ type: "CANCEL" });
  }

  const handlers = {
    retry: () => lastRun.current?.(),
    "edit-amount": () => {
      dispatch({ type: "EDIT" });
      inputRef.current?.focus();
    },
    "switch-network": () => void switchToSepolia().catch(() => {}),
    "connect-wallet": () => void connectWallet().catch(() => {}),
    "get-test-assets": () => {
      window.location.hash = "#assets";
    },
    "wait-for-epoch": () => {
      window.location.href = "/app";
    },
  };

  if (state.stage === "done") {
    return <TransferDone kind={kind} onAgain={() => dispatch({ type: "RESET" })} />;
  }

  return (
    <div className="flex flex-col gap-5">
      {state.stage === "review" && state.draft !== null ? (
        <ReviewDialog
          kind={kind}
          amount={state.draft}
          account={account}
          busy={false}
          onConfirm={submit}
          onCancel={cancel}
        />
      ) : null}

      {state.stage === "encrypting" ? <EncryptProgress phase={encryptPhase} onCancel={cancel} /> : null}

      {state.stage === "checking" ? (
        <p role="status" className="text-fg-muted text-[13px]">
          {STAGE_COPY.checking.detail}
        </p>
      ) : null}

      {state.stage === "submitting" || state.stage === "confirming" || state.stage === "syncing" ? (
        <NoticeBanner
          tone="privacy"
          title={STAGE_COPY[state.stage].label}
          detail={STAGE_COPY[state.stage].detail}
        />
      ) : null}

      {state.error ? <ErrorPanel error={state.error} handlers={handlers} onDismiss={() => dispatch({ type: "EDIT" })} /> : null}

      {state.stage === "form" || state.stage === "blocked" ? (
        <div className="max-w-[320px]">
          <Field
            label={isDeposit ? "Amount to deposit" : "Amount to withdraw"}
            inputRef={inputRef}
            inputMode="decimal"
            placeholder="100"
            value={amount}
            suffix="USDC"
            error={parseError}
            hint={
              isDeposit && perUserCap !== null
                ? `Up to ${formatAmount(perUserCap)} USDC per wallet in this pool.`
                : isDeposit
                  ? null
                  : "This screen cannot read your balance, so it cannot check this number for you — the pool will."
            }
            onChange={(e) => {
              setAmount(e.currentTarget.value);
              dispatch({ type: "EDIT" });
            }}
          />
        </div>
      ) : null}

      {state.stage === "form" || state.stage === "blocked" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!gate.ready || parsed === null || parsed <= 0n || busy}
            title={gate.reason ?? undefined}
            onClick={() => parsed !== null && account && start(parsed)}
          >
            {isDeposit ? "Continue to review" : "Review withdrawal"}
          </Button>
          <span className="text-fg-muted flex items-center gap-2 text-[13px]">
            <EncryptedBadge>Encrypted before signing</EncryptedBadge>
            {STAGE_COPY.form.detail}
          </span>
        </div>
      ) : null}

      {!isDeposit ? (
        <p className="text-fg-muted max-w-[68ch] text-[13px] leading-relaxed">
          Withdrawing a specific amount needs it encrypted first, which takes about ten seconds. If you want everything
          out, use <span className="text-fg font-medium">Withdraw everything</span> below — it needs no encryption and
          no reveal.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Sau khi xong. Chú ý cái KHÔNG có ở đây: con số vừa nhập.
 *
 * Non-negotiable #2 nói accounting phải dùng số thực sự được chuyển. Vế UI của
 * nó là màn hình này — nếu ta in lại "Đã gửi 100 USDC" thì trong trường hợp
 * clamp về zero ta vừa nói dối người dùng bằng chính con số họ gõ. Nên: xác
 * nhận việc đã xảy ra, chỉ đường tới chỗ đọc số dư thật, hết.
 */
function TransferDone({ kind, onAgain }: { kind: "deposit" | "withdraw"; onAgain: () => void }) {
  return (
    <div className="border-success/30 bg-success/5 rounded-card border p-4">
      <p className="text-[14px] font-semibold">
        {kind === "deposit" ? "Deposit confirmed on Sepolia" : "Withdrawal confirmed on Sepolia"}
      </p>
      <p className="text-fg-muted mt-2 max-w-[68ch] text-[13px] leading-relaxed">
        Your position has been read back from the pool and is encrypted again. This screen deliberately does not repeat
        the amount you typed — the number that counts is the one the pool actually credited, and only a fresh reveal can
        show it to you.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          data-cta
          href="/app"
          className="rounded-control bg-action text-on-action inline-flex items-center px-4 text-[14px] font-medium"
        >
          Reveal my position
        </a>
        <Button variant="ghost" onClick={onAgain}>
          {kind === "deposit" ? "Make another deposit" : "Withdraw again"}
        </Button>
      </div>
    </div>
  );
}
