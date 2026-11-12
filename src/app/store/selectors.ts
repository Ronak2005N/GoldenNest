import type { AppState, BranchFilter, ExpenseCategory, Member } from './types';
import { rentPosition } from '../../entities/member';
import { monthKey, todayISO } from '../../shared/lib/dates';

function inBranch<T extends { branch: string }>(rows: T[], branch: BranchFilter): T[] {
  return branch === 'ALL' ? rows : rows.filter((r) => r.branch === branch);
}

export function activeMembers(state: AppState, branch: BranchFilter): Member[] {
  return inBranch(state.members.filter((m) => m.status === 'active'), branch);
}

export function vacatedMembers(state: AppState, branch: BranchFilter): Member[] {
  return inBranch(state.members.filter((m) => m.status === 'vacated'), branch)
    .slice()
    .sort((a, b) => (b.vacatedOn || '').localeCompare(a.vacatedOn || ''));
}

export interface DefaultersRow {
  member: Member;
  due: number;
  paid: number;
  balance: number;
  cycleStart: string;
  cycleEnd: string;
  cycleLabel: string;
  status: 'partial' | 'unpaid';
}

export function defaulters(state: AppState, branch: BranchFilter, today = todayISO()): DefaultersRow[] {
  return activeMembers(state, branch)
    .map((m) => ({ m, pos: rentPosition(m, today) }))
    .filter((x) => x.pos.balance > 0)
    .map((x) => ({
      member: x.m,
      due: x.pos.due,
      paid: x.pos.paid,
      balance: x.pos.balance,
      cycleStart: x.pos.cycleStart,
      cycleEnd: x.pos.cycleEnd,
      cycleLabel: x.pos.label,
      status: x.pos.paid > 0 ? ('partial' as const) : ('unpaid' as const),
    }))
    .sort((a, b) => b.balance - a.balance);
}

export function totalPendingRent(state: AppState, branch: BranchFilter): number {
  return defaulters(state, branch).reduce((n, d) => n + d.balance, 0);
}

export function refundableAdvanceHeld(state: AppState, branch: BranchFilter): number {
  return activeMembers(state, branch).reduce((n, m) => n + (m.advance?.amount ?? 0), 0);
}

/** Rent collected in a month (payments dated in that month) with the Cash/UPI/Card split. */
export function rentCollected(
  state: AppState,
  branch: BranchFilter,
  key: string,
): { total: number; cash: number; upi: number; card: number } {
  let cash = 0;
  let upi = 0;
  let card = 0;
  for (const m of activeMembers(state, branch)) {
    for (const p of m.payments) {
      if (monthKey(p.date) === key) {
        cash += p.cash;
        upi += p.upi;
        card += p.card;
      }
    }
  }
  return { total: cash + upi + card, cash, upi, card };
}

export function maintenanceCollected(state: AppState, branch: BranchFilter, key: string): number {
  return inBranch(state.maintenance, branch)
    .filter((m) => monthKey(m.date) === key)
    .reduce((n, m) => n + m.amount, 0);
}

export interface ExpenseBreakdown {
  byCategory: Record<ExpenseCategory, number>;
  total: number;
}

/** Cash-and-accrual hybrid P&L: salaries accrue (always due), everything else counts when dated in the month. */
export function expensesFor(state: AppState, branch: BranchFilter, key: string): ExpenseBreakdown {
  const byCategory: Record<ExpenseCategory, number> = {
    'Owner Lease': 0,
    'EB Electricity': 0,
    'Water Cans': 0,
    'Water Tankers': 0,
    Catering: 0,
    'Staff Salary': 0,
    'Wi-Fi Recharges': 0,
    'Daily Provisions': 0,
  };

  for (const l of inBranch(state.leasePayments, branch)) {
    if (l.monthKey === key) byCategory['Owner Lease'] += l.amount;
  }
  for (const b of inBranch(state.ebBills, branch)) {
    if (monthKey(b.paidDate) === key) byCategory['EB Electricity'] += b.amount;
  }
  // Drinking water cans are accrued at month-end rate (settled separately).
  const cans = inBranch(state.waterCans, branch)
    .filter((c) => monthKey(c.date) === key)
    .reduce((n, c) => n + c.count, 0);
  byCategory['Water Cans'] = cans * state.canRate;
  for (const t of inBranch(state.waterTankers, branch)) {
    if (monthKey(t.date) === key) byCategory['Water Tankers'] += t.cost;
  }
  for (const c of inBranch(state.catering, branch)) {
    if (monthKey(c.date) === key) byCategory.Catering += c.cash + c.upi + c.card;
  }
  // Staff: full monthly payroll is due every month; advances/payouts are how it was handed over.
  byCategory['Staff Salary'] = inBranch(state.staff, branch).reduce((n, s) => n + s.salary, 0);
  const wifiIds = new Set(inBranch(state.wifi, branch).map((w) => w.id));
  for (const r of state.wifiRecharges) {
    if (wifiIds.has(r.wifiId) && monthKey(r.date) === key) byCategory['Wi-Fi Recharges'] += r.amount;
  }
  for (const p of state.provisionExpenses) {
    const branchOk = branch === 'ALL' || p.branch === 'ALL' || p.branch === branch;
    if (branchOk && monthKey(p.date) === key) byCategory['Daily Provisions'] += p.amount;
  }

  const total = Object.values(byCategory).reduce((n, v) => n + v, 0);
  return { byCategory, total };
}

export interface PnL {
  revenue: number;
  rent: { total: number; cash: number; upi: number; card: number };
  maintenance: number;
  pendingRent: number;
  expenses: ExpenseBreakdown;
  net: number;
  advanceHeld: number;
}

export function pnlFor(state: AppState, branch: BranchFilter, key: string): PnL {
  const rent = rentCollected(state, branch, key);
  const maintenance = maintenanceCollected(state, branch, key);
  const expenses = expensesFor(state, branch, key);
  return {
    revenue: rent.total + maintenance,
    rent,
    maintenance,
    pendingRent: totalPendingRent(state, branch),
    expenses,
    net: rent.total + maintenance - expenses.total,
    advanceHeld: refundableAdvanceHeld(state, branch),
  };
}
