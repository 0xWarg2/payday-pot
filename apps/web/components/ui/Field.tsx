"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: ReactNode;
  /** Thông điệp lỗi của riêng ô này. Không bao giờ chứa số tiền. */
  error?: string | null;
  suffix?: ReactNode;
  /**
   * Để recovery action `edit-amount` (R13/R15) đưa con trỏ về đúng ô vừa sai.
   * "Sửa số tiền" mà không tự focus thì trên mobile là bắt người dùng đi tìm
   * lại ô nhập giữa một màn hình vừa mọc thêm panel lỗi.
   */
  inputRef?: Ref<HTMLInputElement>;
}

export function Field({ label, hint, error, suffix, inputRef, className = "", ...rest }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-medium">
        {label}
      </label>
      <div
        className={`rounded-control border-border-default bg-surface flex items-center gap-2 border px-3 focus-within:outline-fg focus-within:outline-2 focus-within:outline-offset-2 ${
          error ? "border-danger" : ""
        }`}
      >
        <input
          {...rest}
          ref={inputRef}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined}
          // §14.3: 16px là sàn cứng trong form — nhỏ hơn thì iOS Safari tự zoom
          // khi focus và người dùng mất chỗ đang đứng trên trang.
          className={`tabular min-h-[44px] w-full bg-transparent text-[16px] outline-none ${className}`}
        />
        {suffix ? <span className="text-fg-muted shrink-0 text-[14px]">{suffix}</span> : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-fg-muted text-[13px]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-danger text-[13px]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
