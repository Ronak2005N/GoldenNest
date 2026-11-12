import type { Member } from '../../app/store/types';
import { addDays, addMonths, inclusiveDays, longDate, todayISO } from '../../shared/lib/dates';

export type RentStatus = 'paid' | 'partial' | 'unpaid';

export interface CycleInfo {
  /** Key that groups payments belonging to this cycle. */
  cycleKey: string;
  /** Total rent due for the cycle. */
  due: number;
  cycleStart: string;
  cycleEnd: string;
  /** Human line: "18 Oct 2026 to 17 Nov 2026". */
  label: string;
}

/** Date-to-date monthly cycle: joins on the 18th → cycle runs 18th to next month's 18th. */
export function currentCycle(member: Member, today = todayISO()): CycleInfo {
  if (member.billingType === 'daily') {
    const start = member.startDate;
    const end = member.endDate || today;
    const days = inclusiveDays(start, end);
    const rate = member.dailyRate ?? 500;
    return {
      cycleKey: 'daily',
      due: days * rate,
      cycleStart: start,
      cycleEnd: end,
      label: `${longDate(start)} to ${longDate(end)} · ${days} days × ₹${rate}/day`,
    };
  }

  const start0 = member.startDate;
  let cycleStart = start0;
  // Walk forward month by month until the next cycle would start after "today".
  for (let i = 0; i < 600; i++) {
    const next = addMonths(cycleStart, 1);
    if (next <= today) cycleStart = next;
    else break;
  }
  const nextCycle = addMonths(cycleStart, 1);
  const cycleEnd = addDays(nextCycle, -1);
  const rent = member.monthlyRent ?? 0;
  return {
    cycleKey: cycleStart,
    due: rent,
    cycleStart,
    cycleEnd,
    label: `${longDate(cycleStart)} to ${longDate(cycleEnd)}`,
  };
}

export function paidInCycle(member: Member, cycleKey: string): number {
  return member.payments
    .filter((p) => p.cycleKey === cycleKey)
    .reduce((n, p) => n + p.cash + p.upi + p.card, 0);
}

export interface RentPosition extends CycleInfo {
  paid: number;
  balance: number;
  status: RentStatus;
}

export function rentPosition(member: Member, today = todayISO()): RentPosition {
  const cycle = currentCycle(member, today);
  const paid = paidInCycle(member, cycle.cycleKey);
  const balance = Math.max(0, cycle.due - paid);
  const status: RentStatus = balance <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  return { ...cycle, paid, balance, status };
}

export const RENT_STATUS_TEXT: Record<RentStatus, string> = {
  paid: 'PAID IN FULL',
  partial: 'PARTIAL — BALANCE DUE',
  unpaid: 'UNPAID',
};

export function isDefaulter(member: Member, today = todayISO()): boolean {
  return member.status === 'active' && rentPosition(member, today).balance > 0;
}

/** Refundable advance = Advance Paid − Maintenance Deduction − Unpaid Rent. */
export function netRefund(advance: number, maintenance: number, pendingRent: number): number {
  return Math.max(0, advance - maintenance - pendingRent);
}
