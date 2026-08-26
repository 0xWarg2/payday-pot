"use client";

import Link from "next/link";
import { useEffect, useId, useReducer, useRef } from "react";

import { AssetStep } from "@/components/onboarding/AssetStep";
import { ConnectStep } from "@/components/onboarding/ConnectStep";
import { ConsentStep } from "@/components/onboarding/ConsentStep";
import { NetworkStep } from "@/components/onboarding/NetworkStep";
import { ProgramStep } from "@/components/onboarding/ProgramStep";
import { ReviewStep } from "@/components/onboarding/ReviewStep";
import { RolePicker } from "@/components/onboarding/RolePicker";
import { Stepper } from "@/components/onboarding/Stepper";
import { SuccessStep } from "@/components/onboarding/SuccessStep";
import { isSepolia } from "@/lib/chain/rpc";
import { acceptConsent, consentStore, revokeConsent } from "@/lib/onboarding/consent";
import { INITIAL_PROGRESS, onboardingReducer } from "@/lib/onboarding/reducer";
import { clearRole, roleStore, setRole } from "@/lib/onboarding/role";
import { STEP_LABELS, type StepId, currentStep } from "@/lib/onboarding/steps";
import { useStore } from "@/lib/store/external-store";
import { walletStore } from "@/lib/wallet/store";

/** Bước lùi có nghĩa cho mỗi bước. `null` = không có gì để lùi về. */
const BACK_TO: Record<StepId, StepId | null> = {
  role: null,
  connect: "role",
  network: "role",
  program: "role",
  consent: "program",
  assets: "consent",
  review: "assets",
  done: null,
};

/**
 * Bộ điều phối onboarding.
 *
 * Bước hiện tại là **hàm** của (role, ví, mạng, consent, ba cờ cục bộ) — xem
 * `lib/onboarding/steps`. Component này không giữ con trỏ bước nào cả, nên
 * những chuyện như "đang ở bước 6 thì đổi ví sang mạng khác" tự xử lý đúng:
 * màn hình rơi về bước mạng, và rơi *về chỗ cũ* ngay khi mạng đúng trở lại,
 * không mất gì (§7, R8).
 *
 * Đi lùi vì thế không phải là `step -= 1` mà là **gỡ điều kiện** đã cho phép đi
 * tới — `clearRole`, `revokeConsent`, hoặc `rewind` trên reducer.
 */
export function OnboardingFlow() {
  const role = useStore(roleStore);
  const wallet = useStore(walletStore);
  const consent = useStore(consentStore);
  const [progress, dispatch] = useReducer(onboardingReducer, INITIAL_PROGRESS);

  const step = currentStep({
    role,
    connected: wallet.status === "connected" && wallet.address !== null,
    onSepolia: isSepolia(wallet.chainId),
    sawProgram: progress.sawProgram,
    consented: consent !== null,
    assetsReady: progress.assetsAcknowledged,
    reviewed: progress.reviewed,
  });

  const headingRef = useRef<HTMLHeadingElement>(null);
  const previous = useRef<StepId>(step);
  const interacted = useRef(false);
  const countId = useId();

  /**
   * §7: focus đi theo tiêu đề bước mới — nếu không, người dùng bàn phím bấm
   * Continue rồi vẫn đứng ở cuối trang cũ, và screen reader không đọc gì cả.
   *
   * `interacted` chặn đúng một trường hợp: lúc `loadRole()`/`restoreWallet()`
   * chạy xong ngay sau hydrate, bước nhảy vọt mà người dùng chưa hề chạm vào
   * gì. Giật focus khi ấy là cướp con trỏ khỏi thanh địa chỉ của họ.
   */
  useEffect(() => {
    if (previous.current !== step && interacted.current) headingRef.current?.focus();
    previous.current = step;
  }, [step]);

  function goBack(): void {
    const target = BACK_TO[step];
    if (target === null) return;
    if (target === "role") clearRole();
    if (target === "consent") revokeConsent();
    dispatch({ type: "rewind", to: target });
  }

  function onEdit(target: StepId): void {
    if (target === "role") clearRole();
    if (target === "connect") return;
    if (target === "consent") revokeConsent();
    dispatch({ type: "rewind", to: target });
  }

  return (
    <div
      onPointerDownCapture={() => {
        interacted.current = true;
      }}
      onKeyDownCapture={() => {
        interacted.current = true;
      }}
    >
      <Stepper current={step} countId={countId} />

      <h1
        ref={headingRef}
        tabIndex={-1}
        aria-describedby={countId}
        className="mt-5 text-[30px] leading-tight font-semibold tracking-tight outline-none sm:text-[38px]"
      >
        {STEP_LABELS[step]}
      </h1>

      <div className="mt-6">
        {step === "role" ? <RolePicker value={role} onSubmit={setRole} /> : null}
        {step === "connect" ? <ConnectStep /> : null}
        {step === "network" ? <NetworkStep /> : null}
        {step === "program" ? <ProgramStep onContinue={() => dispatch({ type: "ack", flag: "sawProgram" })} /> : null}
        {step === "consent" ? <ConsentStep onAccept={acceptConsent} /> : null}
        {step === "assets" ? (
          <AssetStep onContinue={() => dispatch({ type: "ack", flag: "assetsAcknowledged" })} />
        ) : null}
        {step === "review" && role ? (
          <ReviewStep role={role} onEdit={onEdit} onConfirm={() => dispatch({ type: "ack", flag: "reviewed" })} />
        ) : null}
        {step === "done" && role ? <SuccessStep role={role} /> : null}
      </div>

      <div className="border-border-default text-fg-muted mt-12 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-5 text-[13px]">
        {BACK_TO[step] ? (
          <button type="button" onClick={goBack} className="hover:text-fg min-h-0 min-w-0 underline underline-offset-4">
            Back
          </button>
        ) : null}
        <Link href="/docs/known-limitations" className="hover:text-fg underline underline-offset-4">
          Known limitations
        </Link>
        <span className="ml-auto">Sepolia testnet · no real money</span>
      </div>
    </div>
  );
}
