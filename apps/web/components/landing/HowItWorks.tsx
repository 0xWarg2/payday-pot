const STEPS = [
  {
    title: "Deposit whatever you want",
    body: "Your deposit is encrypted before it leaves your browser. The pool adds it to your position without ever learning the number — not at deposit time, not later.",
  },
  {
    title: "Your weight builds while it sits",
    body: "Odds are proportional to how much you held and for how long, not to how much you deposited on the last day. Depositing early and leaving it alone is what wins.",
  },
  {
    title: "The round closes and one winner is drawn",
    body: "Balances are frozen, on-chain randomness is drawn exactly once, and the pool scans the encrypted weights to pick a winner. Nobody, including the pool, learns who won from watching.",
  },
  {
    title: "The winner claims — everyone else keeps everything",
    body: "The prize lands as an encrypted balance only the winner can read. Every other saver's deposit is untouched, because the prize was never taken from them in the first place.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-6 py-14 sm:py-20">
      <h2 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-[34px]">How a round works</h2>
      <ol className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2">
        {STEPS.map((step, i) => (
          <li key={step.title} className="border-border-default border-t pt-5">
            <span className="text-fg-muted tabular text-[13px]">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-2 text-[18px] font-semibold tracking-tight">{step.title}</h3>
            <p className="text-fg-muted mt-2 text-[15px] leading-relaxed">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
