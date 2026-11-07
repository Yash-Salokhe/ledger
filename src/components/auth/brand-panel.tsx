import "./brand-panel.css";
import { LedgerMark } from "@/components/ledger-mark";

const NAV = ["Journal", "Performance", "Weekly review", "Calendar", "Playbook"];
const PAIRS = [
  { sym: "GBPUSD", pnl: "+$2,367.56", up: true },
  { sym: "NIFTY", pnl: "+₹48,210", up: true },
  { sym: "NAS100", pnl: "−$462.40", up: false },
];
const FIGURES = [
  { label: "Win rate", value: "41.0%" },
  { label: "Profit factor", value: "1.25" },
  { label: "Expectancy", value: "+$29.10", tone: "profit" },
  { label: "Plan adherence", value: "72%", meter: 72 },
];
// Calendar intensity tokens (dark): profit-1..3, loss-1..3, empty.
const CAL = ["#244e46", "#18302c", "#422527", "#1d3d37", "#232323", "#244e46", "#552c2f", "#1d3d37", "#18302c", "#33201f"];

/**
 * Approved login hero: one line of type and the real product, in perspective,
 * cropped off-canvas with a faint citron light. Purely decorative (aria-hidden),
 * CSS-only animation (one settle + one line draw), respects reduced motion.
 */
export function BrandPanel() {
  return (
    <section className="lg-bp-panel" aria-label="Ledger">
      <div className="lg-bp-glow" aria-hidden />
      <div className="lg-bp-copy">
        <div className="flex items-center gap-2.5">
          <LedgerMark size={22} />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">Ledger</span>
        </div>
        <h2 className="lg-bp-headline">Trade with intent.</h2>
      </div>

      <div className="lg-bp-stage" aria-hidden>
        <div className="lg-bp-screen">
          <aside className="lg-bp-side">
            <div className="flex items-center gap-2 px-2 pb-[18px]">
              <LedgerMark size={18} />
              <span className="text-[15px] font-bold">Ledger</span>
            </div>
            <div className="lg-bp-navActive">
              Dashboard <span className="size-1.5 rounded-full bg-citron" />
            </div>
            {NAV.map((n) => (
              <div key={n} className="lg-bp-nav">{n}</div>
            ))}
          </aside>

          <div className="lg-bp-main">
            <div className="flex items-center justify-between">
              <span className="text-[22px] font-bold tracking-[-0.02em]">Dashboard</span>
              <span className="lg-bp-newTrade">New trade</span>
            </div>

            <div className="flex gap-2">
              {PAIRS.map((p) => (
                <span key={p.sym} className="lg-bp-chip">
                  {p.sym} <span className="num" style={{ color: p.up ? "#5bbfb1" : "#ee8588" }}>{p.pnl}</span>
                </span>
              ))}
            </div>

            <div className="lg-bp-grid">
              <div className="lg-bp-balance">
                <span className="text-xs font-semibold text-citron-900">Account balance</span>
                <span className="num lg-bp-balanceValue">
                  $11,134<span style={{ color: "#6e6503" }}>.79</span>
                </span>
                <span className="lg-bp-delta">+11.35% all time</span>
                <svg viewBox="0 0 400 110" className="mt-1.5 h-[110px] w-full">
                  <line x1="0" y1="62" x2="400" y2="62" stroke="#928a0f" strokeOpacity=".35" strokeDasharray="3 5" />
                  <path
                    className="lg-bp-equity"
                    d="M0 62 L16 34 L30 40 L52 36 L70 48 L90 44 L112 56 L130 60 L146 38 L170 44 L188 52 L206 64 L224 70 L240 58 L262 62 L280 70 L298 54 L316 50 L334 40 L352 30 L374 24 L400 14"
                    fill="none" stroke="#2d2700" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"
                  />
                  <circle className="lg-bp-equityDot" cx="400" cy="14" r="4" fill="#141413" />
                </svg>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {FIGURES.map((f) => (
                  <div key={f.label} className="lg-bp-figure">
                    <span className="text-[11px] text-[#9b9b9b]">{f.label}</span>
                    <span className="num text-[22px] font-bold" style={f.tone ? { color: "#5bbfb1" } : undefined}>{f.value}</span>
                    {f.meter ? (
                      <span className="h-1 overflow-hidden rounded bg-[#2d2d2d]">
                        <span className="block h-full bg-citron" style={{ width: `${f.meter}%` }} />
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="lg-bp-calendar">
              <span className="text-[13px] font-semibold">October</span>
              <div className="grid grid-cols-10 gap-1.5">
                {CAL.map((c, i) => <span key={i} className="h-[34px] rounded-[7px]" style={{ background: c }} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
