/** Indian rupee formatting with lakh/crore grouping. */
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function money(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  return `₹${inr.format(v)}`;
}

export function num(n: number): string {
  return inr.format(Math.round(Number.isFinite(n) ? n : 0));
}

/** Plain digits only — forgiving about spaces and dashes typed by elderly users. */
export function digitsOnly(v: string): string {
  return v.replace(/\D/g, '');
}

export function isValidMobile(v: string): boolean {
  return digitsOnly(v).length === 10;
}

export function splitTotal(s: { cash: number; upi: number; card: number }): number {
  return (s.cash || 0) + (s.upi || 0) + (s.card || 0);
}

export function emptySplit(): { cash: number; upi: number; card: number } {
  return { cash: 0, upi: 0, card: 0 };
}

export function splitLine(s: { cash: number; upi: number; card: number }): string {
  return `Cash ${money(s.cash)} · UPI ${money(s.upi)} · Card ${money(s.card)}`;
}

let counter = 0;
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}_${Math.random().toString(36).slice(2, 7)}`;
}
