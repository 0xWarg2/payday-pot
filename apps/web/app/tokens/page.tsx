/**
 * Design-token reference — dev-only, không có trong nav, không phải màn hình
 * sản phẩm. Tồn tại để token §14.2 được NHÌN THẤY chứ không chỉ được khai báo:
 * cyan (privacy) và green (success) rất dễ bị dùng lẫn nhau, và lẫn một lần là
 * user tưởng giá trị mã hoá đã mở khoá.
 */

const SURFACES = [
  ["canvas", "bg-canvas"],
  ["surface", "bg-surface"],
  ["subtle", "bg-subtle"],
  ["fg", "bg-fg"],
  ["fg-muted", "bg-fg-muted"],
  ["border-default", "bg-border-default"],
] as const;

const ACTION = [
  ["action", "bg-action"],
  ["action-hover", "bg-action-hover"],
  ["action-active", "bg-action-active"],
  ["on-action", "bg-on-action"],
] as const;

const SEMANTIC = [
  ["privacy — encrypted, NOT success", "bg-privacy"],
  ["privacy-subtle", "bg-privacy-subtle"],
  ["success — confirmed", "bg-success"],
  ["warning — public / linkable", "bg-warning"],
  ["danger — destructive", "bg-danger"],
] as const;

const DRAW = [
  ["draw-canvas", "bg-draw-canvas"],
  ["draw-surface", "bg-draw-surface"],
  ["draw-border", "bg-draw-border"],
  ["draw-violet", "bg-draw-violet"],
] as const;

function Swatches({ title, items }: { title: string; items: readonly (readonly [string, string])[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[20px] font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(([name, cls]) => (
          <div key={name} className="border-border-default overflow-hidden rounded-control border">
            <div className={`${cls} h-16`} />
            <div className="bg-surface px-3 py-2 font-mono text-[12px]">{name}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Tokens() {
  return (
    <main className="mx-auto flex max-w-[1000px] flex-col gap-10 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-[32px] font-semibold tracking-tight">Design tokens</h1>
        <p className="text-fg-muted text-[14px]">
          Source of truth: IMPLEMENTATION_PLAN §14. Components never hardcode a brand colour.
        </p>
      </header>

      <Swatches title="Surfaces" items={SURFACES} />
      <Swatches title="Action — chartreuse is for the primary action only" items={ACTION} />
      <Swatches title="Semantic" items={SEMANTIC} />
      <Swatches title="Draw Room — a separate context, not a dark mode" items={DRAW} />

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Numerals</h2>
        <div className="border-border-default bg-surface flex flex-col gap-2 rounded-card border p-5">
          <p className="tabular text-[24px]">tabular · 1,234.56 · 00:11:22</p>
          <p className="text-[24px]">proportional · 1,234.56 · 00:11:22</p>
          <p className="text-fg-muted text-[14px]">
            Money and countdowns use the tabular row, otherwise digits shift on every tick and the
            value reads as if it is still loading.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Radius</h2>
        <div className="flex flex-wrap gap-4">
          {(
            [
              ["control · 12px", "rounded-control"],
              ["card · 20px", "rounded-card"],
              ["sheet · 24px", "rounded-sheet"],
            ] as const
          ).map(([label, cls]) => (
            <div key={label} className={`border-border-default bg-surface border px-5 py-6 font-mono text-[12px] ${cls}`}>
              {label}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
