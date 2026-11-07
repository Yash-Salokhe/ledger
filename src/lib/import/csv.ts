/**
 * Small, strict CSV reader (RFC 4180 + the quirks real broker exports have):
 * quoted fields with embedded commas, quotes and newlines; CRLF or LF; a UTF-8 BOM;
 * comma, semicolon or tab delimiters (detected from the header line).
 */
export function detectDelimiter(text: string): "," | ";" | "\t" {
  const head = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const counts = { ",": 0, ";": 0, "\t": 0 } as Record<"," | ";" | "\t", number>;
  let q = false;
  for (const ch of head) {
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch as "," | ";" | "\t"]++;
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as "," | ";" | "\t");
}

export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [], field = "", i = 0, quoted = false;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === "") { quoted = true; i++; continue; }
    if (ch === delimiter) { row.push(field); field = ""; i++; continue; }
    if (ch === "\r" || ch === "\n") {
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
      row = [];
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch; i++;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
  return rows;
}

/** Parses numbers like "1,234.50", "1 234,50", "(12.5)", "-0.5", "₹1,200". Returns NaN when unsure. */
export function parseNumber(raw: string): number {
  let s = raw.trim().replace(/[₹$€£¥\s]/g, "");
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  // Decimal comma only when unambiguous: "1.234,56" or "12,5" — but "1,200" (3 digits after) is thousands.
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,(\d{1,2}|\d{4,})$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return neg ? -n : n;
}

/**
 * Parses timestamps from exports: ISO, "2026.10.14 09:30:05" (MT5), "2026-10-14 09:30:05",
 * "14-10-2026 09:30" / "14/10/2026" (day-first, as in Indian brokers). Naive times are read in `tz`.
 */
export function parseDate(raw: string, tz: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) { const d = new Date(s); return isNaN(+d) ? null : d; }
  let m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  let y: number, mo: number, d: number, h = 0, mi = 0, se = 0;
  if (m) { [y, mo, d] = [+m[1], +m[2], +m[3]]; h = +(m[4] ?? 0); mi = +(m[5] ?? 0); se = +(m[6] ?? 0); }
  else {
    m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    [d, mo, y] = [+m[1], +m[2], +m[3]]; h = +(m[4] ?? 0); mi = +(m[5] ?? 0); se = +(m[6] ?? 0);
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  return zonedToUtc(y, mo, d, h, mi, se, tz);
}

/** Wall-clock time in `tz` → UTC instant (handles DST by correcting with the zone's offset). */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, se: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, se);
  const offset = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}
