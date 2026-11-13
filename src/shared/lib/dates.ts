/** Date helpers. All dates are ISO strings: yyyy-mm-dd (local, no timezone drift). */

export function todayISO(): string {
  const d = new Date();
  return toISO(d);
}

export function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** "18 November 2026" — written out, never relative-only (elderly-accessible rule). */
export function longDate(iso: string): string {
  if (!iso) return '—';
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "18 Nov 2026" — compact form for dense lists. */
export function shortDate(iso: string): string {
  if (!iso) return '—';
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function addMonths(iso: string, months: number): string {
  const d = parseISO(iso);
  const targetMonth = d.getMonth() + months;
  const day = d.getDate();
  const probe = new Date(d.getFullYear(), targetMonth, 1);
  const lastDay = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate();
  probe.setDate(Math.min(day, lastDay));
  return toISO(probe);
}

export function daysBetween(fromISO: string, toISOStr: string): number {
  const a = parseISO(fromISO).getTime();
  const b = parseISO(toISOStr).getTime();
  return Math.round((b - a) / 86400000);
}

/** Inclusive day count (joining 1st, leaving 3rd = 3 days). */
export function inclusiveDays(fromISO: string, toISOStr: string): number {
  return Math.max(1, daysBetween(fromISO, toISOStr) + 1);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7); // yyyy-mm
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function monthLabelShort(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
}

export function currentMonthKey(): string {
  return monthKey(todayISO());
}

/** First day of the month: "2026-11" → "2026-11-01". */
export function monthStartISO(key: string): string {
  return `${key}-01`;
}

/** Last day of the month: "2026-11" → "2026-11-30". */
export function monthEndISO(key: string): string {
  const [y, m] = key.split('-').map(Number);
  // Day 0 of the next month is the last day of this month.
  return toISO(new Date(y, m, 0));
}

/** How close a due date is. Used for Wi-Fi recharges and EB bills. */
export type DueStatus = 'overdue' | 'soon' | 'ok';

export function dueStatus(dueDate: string, today = todayISO(), soonDays = 5): DueStatus {
  if (!dueDate) return 'overdue';
  const days = daysBetween(today, dueDate);
  if (days < 0) return 'overdue';
  if (days <= soonDays) return 'soon';
  return 'ok';
}

/** Last `count` month keys ending at `endKey` (oldest first). */
export function lastMonths(endKey: string, count: number): string[] {
  const [y, m] = endKey.split('-').map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, (m || 1) - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function monthOptions(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
