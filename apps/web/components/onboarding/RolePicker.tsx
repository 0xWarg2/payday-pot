"use client";

import { useId, useState } from "react";

import { GuideLink } from "@/components/onboarding/GuideLink";
import { Button } from "@/components/ui/Button";
import type { Role } from "@/lib/onboarding/role";

const ROLES: { value: Role; title: string; body: string; foot: string }[] = [
  {
    value: "employee",
    title: "I want to save",
    body: "Deposit, stay encrypted, maybe win. Withdraw any time.",
    foot: "Most people are here",
  },
  {
    value: "employer",
    title: "I want to sponsor a prize",
    body: "Fund a round's prize. See the pot, never a balance.",
    foot: "For employers and community sponsors",
  },
];

/**
 * Radio thật, không phải `div` gắn `onClick`.
 *
 * Một `<fieldset>` + hai `<input type="radio">` cho ta mũi tên lên/xuống, một
 * điểm dừng tab duy nhất cho cả nhóm, và cách đọc "2 of 2 selected" — tất cả
 * miễn phí. Mọi bản dựng lại bằng `role="radio"` thủ công đều phải viết lại
 * từng thứ đó, và thường quên ít nhất một.
 *
 * Vai trò là một **góc nhìn**, không phải quyền: chọn "employer" không mở ra
 * khả năng đọc gì thêm — ACL nằm onchain và ở đó employer không có quyền đọc
 * principal/TWAB/winnings của ai cả (non-negotiable #3).
 */
export function RolePicker({ value, onSubmit }: { value: Role | null; onSubmit: (role: Role) => void }) {
  const [selected, setSelected] = useState<Role | null>(value);
  const name = useId();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) onSubmit(selected);
      }}
    >
      <fieldset className="border-0 p-0">
        <legend className="sr-only">How are you joining?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((role) => {
            const checked = selected === role.value;
            return (
              <label
                key={role.value}
                className={[
                  "rounded-card flex cursor-pointer flex-col gap-2 border p-5 transition-colors duration-(--duration-hover) ease-(--ease-ui)",
                  "focus-within:outline-fg focus-within:outline-2 focus-within:outline-offset-2",
                  checked ? "border-fg bg-surface" : "border-border-default bg-surface hover:bg-subtle",
                ].join(" ")}
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name={name}
                    value={role.value}
                    checked={checked}
                    onChange={() => setSelected(role.value)}
                    className="accent-action size-[18px]"
                  />
                  <span className="text-[17px] font-semibold tracking-tight">{role.title}</span>
                </span>
                <span className="text-fg-muted text-[14px] leading-relaxed">{role.body}</span>
                <span className="text-fg-muted mt-auto pt-2 text-[12px]">{role.foot}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6">
        <Button type="submit" disabled={selected === null}>
          Continue
        </Button>
        <p className="text-fg-muted mt-3 text-[13px]">
          Switch views any time. <GuideLink href="/docs/get-started" />
        </p>
      </div>
    </form>
  );
}
