/**
 * Cái mà việc tài trợ **không** cho bạn.
 *
 * Đây không phải một đoạn marketing. Trực giác mặc định của bất kỳ ai từng dùng
 * một dashboard doanh nghiệp là "tôi trả tiền thì tôi xem được số liệu", và trực
 * giác đó ở đây sai theo hướng nguy hiểm — nếu employer tin mình xem được, họ sẽ
 * hứa điều đó với nhân viên. Nên nói ra tường minh, ở đúng trang họ đứng, bằng
 * bốn câu phủ định cụ thể chứ không phải một chữ "private".
 *
 * Bốn dòng dưới đây là sự thật ở tầng contract, không phải chính sách của UI:
 * không có `FHE.allow` nào cấp cho `EMPLOYER` trên principal/TWAB/winnings, và
 * winner được chọn bằng randomness onchain mà keeper cũng không đưa vào được.
 */
export function NegativePermissionNotice() {
  return (
    <div className="border-privacy/30 bg-privacy-subtle rounded-card border p-4">
      <p className="text-[15px] font-semibold tracking-tight">What sponsoring does not give you</p>
      <ul className="text-fg-muted mt-3 flex list-none flex-col gap-2 text-[13px] leading-relaxed">
        <li>
          <span className="text-fg font-medium">You cannot read any employee&rsquo;s balance.</span> The contract grants
          the sponsor address no access to a saver&rsquo;s principal, and there is no admin path that adds one.
        </li>
        <li>
          <span className="text-fg font-medium">You cannot read anyone&rsquo;s odds.</span> Time-weighted balances are
          encrypted per person and never decrypted on chain, not even to run the draw.
        </li>
        <li>
          <span className="text-fg font-medium">You cannot see who won.</span> Winnings stay encrypted and claiming costs
          the same for a winner and a non-winner, so the transactions do not tell you either.
        </li>
        <li>
          <span className="text-fg font-medium">You cannot pick the winner.</span> The draw uses randomness generated on
          chain, once per round, with no reroll — nobody supplies a seed, a weight, or a name.
        </li>
      </ul>
      <p className="text-fg-muted mt-3 max-w-[70ch] text-[13px] leading-relaxed">
        The prize you put up is public, and only that. It is your money rather than anyone&rsquo;s savings, and a prize
        nobody can verify is not much of a prize.
      </p>
    </div>
  );
}
