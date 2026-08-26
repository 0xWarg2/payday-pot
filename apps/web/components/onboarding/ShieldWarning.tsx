/**
 * Cảnh báo bắt buộc trước khi ký `wrap` (kickoff §5 #8).
 *
 * `wrap(address,uint256)` nhận amount **plaintext**. Con số đó nằm trong
 * calldata vĩnh viễn — nó là điểm duy nhất trong toàn bộ luồng mà một số tiền
 * của người dùng lộ ra, và nó lộ ngay tại biên giới đi vào vùng mã hoá.
 *
 * Vị trí của component này là một phần của yêu cầu, không phải chi tiết trình
 * bày: nó phải nằm **trên** nút ký. Đặt dưới thì nó không còn là cảnh báo nữa,
 * nó là lời xin lỗi.
 *
 * Đoạn giảm nhẹ ở cuối là thật và đáng tiền: số đem wrap không cần bằng số đem
 * gửi. Wrap một con số tròn, gửi bao nhiêu tuỳ ý — phần công khai lúc đó không
 * còn nói gì về vị thế trong pool nữa.
 */
export function ShieldWarning() {
  return (
    <div className="border-warning/40 rounded-card border bg-[color-mix(in_srgb,var(--color-warning)_7%,white)] p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="bg-warning mt-1.5 size-2 shrink-0 rounded-full" />
        <div>
          <p className="text-[15px] font-semibold tracking-tight">This one amount will be public</p>
          <p className="text-fg-muted mt-1.5 max-w-[64ch] text-[14px] leading-relaxed">
            Shielding is the doorway into the encrypted side, and the doorway itself is in the open: the amount in the
            box above goes into the transaction as plain text and stays readable on chain forever. Everything after
            this — what you deposit, your balance, your odds, your winnings — is encrypted.
          </p>
          <p className="text-fg-muted mt-3 max-w-[64ch] text-[14px] leading-relaxed">
            You can shield more than you plan to deposit. Shield a round number, deposit whatever you like out of it,
            and the public number stops saying anything about your position in the pool.
          </p>
        </div>
      </div>
    </div>
  );
}
