import type { AppState, ClosedMonth } from './types';
import { monthKey, monthLabel } from '../../shared/lib/dates';

/**
 * MONTH LOCKING — the tamper guard.
 *
 * A month the owner has closed is final: its books are signed off. Nothing can
 * be back-dated into it, no payment can be voided inside it and no expense in
 * it can be changed. The owner has to unlock the month first, and only if they
 * really mean to correct the past.
 *
 * Nothing is ever deleted by locking: the month is only marked as closed, and
 * the mark can be taken away again.
 */

/** True when the month has been closed by the owner. */
export function isMonthClosed(state: AppState, key: string): boolean {
  return (state.closedMonths ?? []).some((c) => c.monthKey === key);
}

/** The closed month a date falls in, when there is one. */
export function closedMonthForDate(state: AppState, dateISO: string): ClosedMonth | undefined {
  if (!dateISO) return undefined;
  return (state.closedMonths ?? []).find((c) => c.monthKey === monthKey(dateISO));
}

/**
 * The warning shown when a change would touch a closed month.
 *
 * Returns null when the month is open, so a page can simply ask before it
 * saves anything.
 */
export function monthLockMessage(
  state: AppState,
  dateISO: string,
  what: string,
): string | null {
  const closed = closedMonthForDate(state, dateISO);
  if (!closed) return null;
  return (
    `${monthLabel(closed.monthKey)} is closed — its books are final. ` +
    `Unlock the month first if you really need to ${what}.`
  );
}

/** Closes a month: its books become final. */
export function closeMonth(state: AppState, key: string, today: string): AppState {
  if (isMonthClosed(state, key)) return state;
  return {
    ...state,
    closedMonths: [...(state.closedMonths ?? []), { monthKey: key, closedAt: today }],
  };
}

/** Opens a month again so a correction can be made. */
export function openMonth(state: AppState, key: string): AppState {
  if (!isMonthClosed(state, key)) return state;
  return { ...state, closedMonths: (state.closedMonths ?? []).filter((c) => c.monthKey !== key) };
}

/** The closed months, newest first. */
export function closedMonthsSorted(state: AppState): ClosedMonth[] {
  return [...(state.closedMonths ?? [])].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}
