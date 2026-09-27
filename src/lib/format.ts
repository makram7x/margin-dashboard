// Display formatting. Kept separate from the model so numbers stay raw until the last moment.

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("en", { minimumFractionDigits: min, maximumFractionDigits: max });

const int = nf(0, 0);
const one = nf(1, 1);
const two = nf(2, 2);

export const DASH = "—";

/** AED 2,400,000 (or "2.4M" compact, for tiles and chart axes). */
export function aed(n: number | null | undefined, opts: { compact?: boolean; unit?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  let body: string;
  if (opts.compact && abs >= 1_000_000) body = `${nf(0, 2).format(abs / 1_000_000)}M`;
  else if (opts.compact && abs >= 10_000) body = `${nf(0, 1).format(abs / 1_000)}K`;
  else body = int.format(Math.round(abs));
  return `${sign}${opts.unit === false ? "" : "AED "}${body}`;
}

export function hours(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  return Math.abs(n) >= 1000 ? int.format(n) : one.format(n);
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  const s = nf(digits, digits).format(Math.abs(n) * 100);
  return `${n < 0 ? "−" : ""}${s}%`;
}

/**
 * Project names are proposal filenames: "Meridian-Website-UIUXdesign-Development-14012025-COMMERCIAL.pdf".
 * Show "Meridian Website UI/UX design Development" instead; the ref code stays alongside it.
 */
export function projectDisplayName(raw: string): string {
  const cleaned = raw
    .replace(/\.(pdf|docx?|xlsx?)$/i, "")
    .replace(/[-_ ]?commercial$/i, "")
    .replace(/[-_ ]\d{6,8}(?=[-_ ]|$)/g, "")
    .replace(/uiuxdesign/gi, "UI/UX design")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || raw;
}

export function rate(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  return two.format(n);
}
