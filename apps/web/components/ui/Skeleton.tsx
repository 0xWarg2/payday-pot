/**
 * Placeholder lúc đang tải.
 *
 * Chỉ dùng cho dữ liệu CÔNG KHAI đang bay về (prize, countdown, phase). Không
 * bao giờ dùng cho giá trị mã hoá: một giá trị bị che không phải là một giá trị
 * đang tải, và vẽ nó thành skeleton sẽ khiến người dùng ngồi đợi một thứ sẽ
 * không bao giờ tự đến (non-negotiable #8).
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`bg-subtle inline-block animate-pulse rounded-md ${className}`} />;
}

export function SkeletonText({ lines = 1, className = "" }: { lines?: number; className?: string }) {
  return (
    <span className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </span>
  );
}
