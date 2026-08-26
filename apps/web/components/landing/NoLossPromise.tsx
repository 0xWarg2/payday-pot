const PROMISES = [
  {
    title: "The prize is not your neighbour's money",
    body: "It is sponsored — an employer funds the prize for a round out of its own pocket. Nothing is skimmed from deposits to pay it, which is why losing a round costs you exactly nothing.",
  },
  {
    title: "Withdrawing always works",
    body: "In every phase of every round, including while the pool is paused and while a draw is in progress. There is no lock-up, no notice period, and no state in which the withdraw button is disabled.",
  },
  {
    title: "Nobody can take your deposit",
    body: "The contract cannot be upgraded and has no administrative path to move your principal. Pausing stops new deposits — that is all pausing can do.",
  },
] as const;

export function NoLossPromise() {
  return (
    <section className="py-14 sm:py-20">
      <h2 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-[34px]">
        Losing a round costs nothing
      </h2>
      <p className="text-fg-muted mt-3 max-w-[60ch] text-[16px] leading-relaxed">
        Prize savings only works if the &ldquo;no loss&rdquo; part is literally true. Here is what it rests on.
      </p>

      <div className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-3">
        {PROMISES.map((promise) => (
          <div key={promise.title} className="border-border-default border-t pt-5">
            <h3 className="text-[17px] font-semibold tracking-tight">{promise.title}</h3>
            <p className="text-fg-muted mt-2 text-[15px] leading-relaxed">{promise.body}</p>
          </div>
        ))}
      </div>

      <p className="text-fg-muted mt-8 max-w-[70ch] text-[13px] leading-relaxed">
        One caveat, stated plainly: the prize is sponsored, not generated. The contract exposes an adapter interface so
        a real yield source could fund it instead, but no yield source is connected in this build — so treat the prize
        as a working simulation of the settlement, not as return earned on your savings.
      </p>
    </section>
  );
}
