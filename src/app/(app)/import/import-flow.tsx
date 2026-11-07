"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, RotateCcw } from "lucide-react";
import { previewImport, commitImport, type ImportPreview, type ImportResult } from "@/lib/actions/import";
import type { Field, Mapping } from "@/lib/import/formats";

type Account = { id: string; name: string; currency: string };
type Inst = { id: string; symbol: string; exchange: string };
const FORMAT_LABEL = { mt5: "MetaTrader 5 positions", zerodha: "Zerodha tradebook", generic: "Generic CSV" } as const;
const FIELDS: { k: Field; label: string; required?: boolean }[] = [
  { k: "symbol", label: "Market / symbol", required: true }, { k: "side", label: "Side (buy/sell)", required: true },
  { k: "openedAt", label: "Open time", required: true }, { k: "quantity", label: "Quantity (lots, contracts or shares)", required: true },
  { k: "entry", label: "Entry price", required: true }, { k: "exit", label: "Exit price" }, { k: "closedAt", label: "Close time" },
  { k: "stop", label: "Stop" }, { k: "target", label: "Target" }, { k: "fees", label: "Fees / commission" }, { k: "pnl", label: "Net P&L" }, { k: "id", label: "Trade id" },
];

export function ImportFlow({ accounts, instruments }: { accounts: Account[]; instruments: Inst[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<"auto" | "mt5" | "zerodha" | "generic">("auto");
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [symbolMap, setSymbolMap] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [drag, setDrag] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const build = (f: File, over: { format?: string; mapping?: Mapping | null; symbolMap?: Record<string, string>; accountId?: string } = {}) => {
    const fd = new FormData();
    fd.set("accountId", over.accountId ?? accountId);
    fd.set("file", f);
    fd.set("format", over.format ?? format);
    const m = over.mapping === undefined ? mapping : over.mapping;
    if (m) fd.set("mapping", JSON.stringify(m));
    fd.set("symbolMap", JSON.stringify(over.symbolMap ?? symbolMap));
    return fd;
  };
  const runPreview = (f: File, over: Parameters<typeof build>[1] = {}) =>
    start(async () => {
      const p = await previewImport(build(f, over));
      setPreview(p);
      if (!("error" in p) && p.format === "generic" && !mapping) setMapping(p.mapping);
    });
  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f); setResult(null); setMapping(null); setSymbolMap({});
    runPreview(f, { mapping: null, symbolMap: {} });
  };
  const reset = () => { setFile(null); setPreview(null); setResult(null); setMapping(null); setSymbolMap({}); if (input.current) input.current.value = ""; };

  if (!accounts.length) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-xl border border-line bg-card p-8">
        <h2 className="text-lg font-bold">Add a trading account first</h2>
        <p className="text-[15px] text-fg-3">Imported trades go into an account, so Ledger knows the currency and starting balance.</p>
        <Link href="/settings" className="flex h-11 items-center rounded-md bg-fg px-4 text-sm font-semibold text-page">Add an account in Settings</Link>
      </section>
    );
  }

  if (result && !("error" in result)) {
    return (
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-start gap-4 rounded-xl border border-line bg-card p-8">
        <CheckCircle2 size={32} className="text-profit" aria-hidden />
        <h2 className="text-2xl font-bold tracking-[-0.02em]">{result.imported} trade{result.imported === 1 ? "" : "s"} imported</h2>
        <p className="text-[15px] text-fg-2">
          {[result.duplicates && `${result.duplicates} already in your journal`, result.skipped && `${result.skipped} skipped`, result.errors && `${result.errors} unreadable rows`].filter(Boolean).join(" · ") || "Nothing was skipped."}
        </p>
        <p className="text-sm text-fg-3">Imported trades arrive without a grade. Open each one to mark whether you followed your plan.</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/journal" className="flex h-11 items-center rounded-md bg-citron px-4 text-sm font-semibold text-[#141413]">Grade them in the Journal</Link>
          <button type="button" onClick={reset} className="flex h-11 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold"><RotateCcw size={14} aria-hidden />Import another file</button>
        </div>
      </motion.section>
    );
  }

  const p = preview && !("error" in preview) ? preview : null;
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-xl border border-line bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-semibold">Into account
            <select value={accountId} onChange={(e) => { const v = e.target.value; setAccountId(v); if (file) runPreview(file, { accountId: v }); }} className="h-12 rounded-md border border-line bg-card px-3 text-[15px] font-medium outline-none focus:border-citron-700">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">File type
            <select value={format} onChange={(e) => { const v = e.target.value as typeof format; setFormat(v); if (file) runPreview(file, { format: v, mapping: null }); }} className="h-12 rounded-md border border-line bg-card px-3 text-[15px] font-medium outline-none focus:border-citron-700">
              <option value="auto">Detect automatically</option>
              <option value="mt5">{FORMAT_LABEL.mt5}</option>
              <option value="zerodha">{FORMAT_LABEL.zerodha}</option>
              <option value="generic">{FORMAT_LABEL.generic}</option>
            </select>
          </label>
        </div>

        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${drag ? "border-citron-700 bg-citron-50" : "border-line-hover hover:bg-subtle"}`}>
          {pending ? <Loader2 size={28} className="animate-spin text-fg-3" aria-hidden /> : <FileUp size={28} className="text-fg-3" aria-hidden />}
          <span className="text-[15px] font-semibold">{file ? file.name : "Drop a CSV here, or choose a file"}</span>
          <span className="text-xs text-fg-3">MT5: History → Positions → Report (CSV). Zerodha: Console → Reports → Tradebook. Up to 5 MB.</span>
          <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {preview && "error" in preview ? <p role="alert" className="text-sm text-loss">{preview.error}</p> : null}
      </section>

      <AnimatePresence>
        {p && file ? (
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} aria-live="polite" className="flex flex-col gap-5 rounded-xl border border-line bg-card p-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-subtle px-3 py-1.5 font-semibold">{FORMAT_LABEL[p.format]}</span>
              <span className="rounded-full bg-profit-subtle px-3 py-1.5 font-semibold text-profit">{p.ready} ready</span>
              {p.duplicates ? <span className="rounded-full bg-subtle px-3 py-1.5 text-fg-2">{p.duplicates} already imported</span> : null}
              {p.errorCount ? <span className="rounded-full bg-loss-subtle px-3 py-1.5 text-loss">{p.errorCount} unreadable</span> : null}
              {p.unknownSymbols.length ? <span className="rounded-full bg-lucky-subtle px-3 py-1.5 text-lucky">{p.unknownSymbols.length} unknown market{p.unknownSymbols.length === 1 ? "" : "s"}</span> : null}
            </div>

            {p.format === "generic" && mapping ? (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-sm font-semibold">Match your columns</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {FIELDS.map((f) => (
                    <label key={f.k} className="flex items-center justify-between gap-3 text-sm">
                      <span className={f.required ? "font-semibold" : "text-fg-2"}>{f.label}</span>
                      <select value={mapping[f.k] ?? ""} onChange={(e) => { const m = { ...mapping, [f.k]: e.target.value === "" ? undefined : Number(e.target.value) }; setMapping(m); runPreview(file, { mapping: m }); }}
                        className="h-10 w-[180px] rounded-md border border-line bg-card px-2 text-sm outline-none focus:border-citron-700">
                        <option value="">{f.required ? "Choose…" : "Not in file"}</option>
                        {p.header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {p.unknownSymbols.length ? (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-sm font-semibold">Markets Ledger doesn&rsquo;t recognise</legend>
                {p.unknownSymbols.map((s) => (
                  <label key={s} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold">{s}</span>
                    <select value={symbolMap[s] ?? ""} onChange={(e) => { const m = { ...symbolMap, [s]: e.target.value }; setSymbolMap(m); runPreview(file, { symbolMap: m }); }}
                      className="h-10 w-[220px] rounded-md border border-line bg-card px-2 text-sm outline-none focus:border-citron-700">
                      <option value="">Choose a market…</option>
                      <option value="skip">Skip these trades</option>
                      {instruments.map((i) => <option key={i.id} value={i.id}>{i.symbol} · {i.exchange}</option>)}
                    </select>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {p.errors.length ? (
              <details className="rounded-lg bg-loss-subtle p-4 text-sm">
                <summary className="flex cursor-pointer items-center gap-2 font-semibold text-loss"><AlertTriangle size={15} aria-hidden />{p.errorCount} row{p.errorCount === 1 ? "" : "s"} can&rsquo;t be read and will be skipped</summary>
                <ul className="mt-2 flex flex-col gap-1 text-fg-2">{p.errors.map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}</ul>
              </details>
            ) : null}

            {p.sample.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <caption className="mb-2 text-left text-xs text-fg-3">First rows as Ledger reads them</caption>
                  <thead className="text-xs text-fg-3"><tr>{["Opened", "Market", "Side", "Qty", "Entry", "Exit", "P&L"].map((h) => <th key={h} scope="col" className="pb-2 text-left font-medium">{h}</th>)}</tr></thead>
                  <tbody>{p.sample.map((t, i) => (
                    <tr key={i} className="border-t border-line-subtle">
                      <td className="num py-2">{new Date(t.openedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="py-2 font-semibold">{t.symbol}</td><td className="py-2">{t.side === "long" ? "Buy" : "Sell"}</td>
                      <td className="num py-2">{t.qty}</td><td className="num py-2">{t.entry}</td><td className="num py-2">{t.exit ?? "Open"}</td>
                      <td className="num py-2">{t.pnl ?? "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : null}

            {result && "error" in result ? <p role="alert" className="text-sm text-loss">{result.error}</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={pending || p.ready === 0 || p.unknownSymbols.some((s) => !symbolMap[s])}
                onClick={() => start(async () => setResult(await commitImport(build(file))))}
                className="flex h-12 items-center gap-2 rounded-md bg-citron px-5 text-[15px] font-semibold text-[#141413] disabled:opacity-50">
                {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}Import {p.ready} trade{p.ready === 1 ? "" : "s"}
              </button>
              {p.unknownSymbols.some((s) => !symbolMap[s]) ? <span className="text-sm text-fg-3">Choose a market or Skip for each unknown symbol first.</span> : null}
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
