import type { AppState, BranchFilter, BranchId, ExpenseCategory, Member } from './types';
import { rentPosition } from '../../entities/member';
import { monthEndISO, monthKey, monthStartISO, todayISO } from '../../shared/lib/dates';

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
  olderDue: number;
  cycleStart: string;
  cycleEnd: string;
  cycleLabel: string;
  status: 'partial' | 'unpaid';
}

/**
 * The day arrears are measured on.
 *
 * The value may be a reporting month ('2026-10') or an exact day
 * ('2026-10-31'). A month is always measured on its last day.
 */
export function asOfDate(value: string): string {
  if (/^\d{4}-\d{2}$/.test(value)) return monthEndISO(value);
  return value;
}

/**
 * The day money received has to be counted from.
 *
 * A month that has been finished is frozen: a rent paid in November for
 * October did not exist on 31 October, so it must not make October look
 * settled. The month that is running right now is never frozen — everything
 * recorded so far counts, exactly as before.
 */
export function cutoffFor(day: string): string | undefined {
  const key = monthKey(day);
  if (day !== monthEndISO(key)) return undefined; // not the last day of a month
  if (key >= monthKey(todayISO())) return undefined; // the month is still running
  return day;
}

/**
 * Members who still owe rent. Everything unpaid is counted — the month
 * running now and any month left open from before, so an old debt never
 * quietly disappears when the month rolls over.
 *
 * When a past month is asked for, the position is measured on the last day of
 * that month: only money that had actually been received by then counts.
 */
export function defaulters(state: AppState, branch: BranchFilter, asOf = todayISO()): DefaultersRow[] {
  const day = asOfDate(asOf);
  const cutoff = cutoffFor(day);
  return activeMembers(state, branch)
    .map((m) => ({ m, pos: rentPosition(m, day, cutoff) }))
    .filter((x) => x.pos.totalDue > 0)
    .map((x) => ({
      member: x.m,
      due: x.pos.due,
      paid: x.pos.paid,
      balance: x.pos.totalDue,
      olderDue: x.pos.olderDue,
      cycleStart: x.pos.cycleStart,
      cycleEnd: x.pos.cycleEnd,
      cycleLabel: x.pos.label,
      status: x.pos.paid > 0 || x.pos.olderDue > 0 ? ('partial' as const) : ('unpaid' as const),
    }))
    .sort((a, b) => b.balance - a.balance);
}

export function totalPendingRent(state: AppState, branch: BranchFilter, asOf = todayISO()): number {
  return defaulters(state, branch, asOf).reduce((n, d) => n + d.balance, 0);
}

export interface VacatedDefaulterRow {
  member: Member;
  /** Everything still owed by this member. */
  due: number;
  /** Money already received against the months they stayed for. */
  paid: number;
  /** The last cycle of their stay. */
  cycleStart: string;
  cycleEnd: string;
  cycleLabel: string;
  /** The day they left the PG. */
  leftOn: string;
  /** What was returned to them when they left. */
  refund: number;
}

/**
 * Members who have left the PG but still owe money.
 *
 * A departing member's dues are a receivable the PG still holds — they must
 * not vanish when the bed is freed. They are deliberately kept apart from the
 * staying defaulters: no rent reminder is ever sent to someone who has left,
 * and the owner can see exactly who left without settling their balance.
 *
 * When a past month is asked for, the dues are measured on the last day of
 * that month — money that came in later does not settle that month.
 */
export function vacatedDefaulters(
  state: AppState,
  branch: BranchFilter,
  asOf = todayISO(),
): VacatedDefaulterRow[] {
  const day = asOfDate(asOf);
  const cutoff = cutoffFor(day);
  return vacatedMembers(state, branch)
    .map((m) => ({ m, pos: rentPosition(m, day, cutoff) }))
    .filter((x) => x.pos.totalDue > 0)
    .map((x) => ({
      member: x.m,
      due: x.pos.totalDue,
      paid: x.pos.ledger.reduce((n, r) => n + r.paid, 0),
      cycleStart: x.pos.cycleStart,
      cycleEnd: x.pos.cycleEnd,
      cycleLabel: x.pos.label,
      leftOn: x.m.vacatedOn || x.m.settlement?.exitDate || '',
      refund: x.m.settlement?.refund ?? 0,
    }))
    .sort((a, b) => b.due - a.due);
}

export interface PendingRentBreakdown {
  /** Owed by members who are still staying. */
  staying: number;
  /** Owed by members who have left the PG. */
  left: number;
  /** Everything the PG is owed. */
  total: number;
  stayingCount: number;
  leftCount: number;
}

/**
 * Everything the PG is owed, split by whether the member is still staying.
 *
 * The total is what the PG can actually collect, so it is the number shown
 * on the dashboard.
 *
 * The reporting month may be given as a month ('2026-10') or as an exact day.
 * A finished month is measured on its last day, so the number never changes
 * because somebody paid their rent late.
 */
export function pendingRent(
  state: AppState,
  branch: BranchFilter,
  asOf = todayISO(),
): PendingRentBreakdown {
  const stayingRows = defaulters(state, branch, asOf);
  const leftRows = vacatedDefaulters(state, branch, asOf);
  const staying = stayingRows.reduce((n, d) => n + d.balance, 0);
  const left = leftRows.reduce((n, d) => n + d.due, 0);
  return {
    staying,
    left,
    total: staying + left,
    stayingCount: stayingRows.length,
    leftCount: leftRows.length,
  };
}

/** True while the person was still working during the given month. */
export function staffWorkedInMonth(
  staff: AppState['staff'][number],
  key: string,
): boolean {
  const from = monthStartISO(key);
  const to = monthEndISO(key);
  if (staff.joinDate && staff.joinDate > to) return false;
  if (staff.leftDate && staff.leftDate < from) return false;
  return true;
}

/** How many days the given month has. */
function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * The salary a staff member earns in a month.
 *
 * Someone who joins on the 28th or leaves on the 10th is paid for the days
 * they actually worked — not a whole month. Staff saved before joining dates
 * were recorded work the full month, exactly as before.
 */
export function staffSalaryForMonth(
  staff: AppState['staff'][number],
  key: string,
): number {
  const from = monthStartISO(key);
  const to = monthEndISO(key);
  const days = daysInMonth(key);

  // Legacy staff with no dates at all: they worked the whole month.
  if (!staff.joinDate && !staff.leftDate) return staff.salary;

  let start = 1;
  let end = days;

  if (staff.joinDate) {
    if (staff.joinDate > to) return 0; // has not started yet
    if (staff.joinDate >= from) start = Number(staff.joinDate.slice(8, 10));
  }
  if (staff.leftDate) {
    if (staff.leftDate < from) return 0; // already left
    if (staff.leftDate <= to) end = Number(staff.leftDate.slice(8, 10));
  }
  if (end < start) return 0;

  const worked = end - start + 1;
  if (worked >= days) return staff.salary;
  return Math.round((staff.salary * worked) / days);
}

export interface StaffLedgerRow {
  staff: AppState['staff'][number];
  /** The fixed monthly salary. */
  baseSalary: number;
  /** What this person earns in the month shown (pro-rated for joining/leaving). */
  salary: number;
  /** True when the salary is smaller than the full month because of a join/leave. */
  partialMonth: boolean;
  /** Advances given in this month. */
  advances: number;
  /** An advance left over from an earlier month, still held by this person. */
  advanceCarried: number;
  /** The whole advance applied against this month's salary (carried + this month). */
  advanceDeducted: number;
  paid: number;
  /** What is still to be paid. */
  remaining: number;
}

/** The month after the given one (yyyy-mm). */
function nextMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Every month this person has worked, from their first month up to and
 * including the month asked for.
 */
function monthsUpTo(staff: AppState['staff'][number], key: string): string[] {
  const joined = staff.joinDate ? monthKey(staff.joinDate) : null;
  const first = joined && joined < key ? joined : key;
  const out: string[] = [];
  let cur = first;
  for (let i = 0; i < 600; i += 1) {
    out.push(cur);
    if (cur >= key) break;
    cur = nextMonthKey(cur);
  }
  return out;
}

/**
 * The payroll for a month — one row per person, with the salary they have
 * actually earned that month.
 *
 * An advance that was bigger than the month's salary is not lost: it stays
 * with the person and is taken off the next month's salary. The balance is
 * carried forward month by month, so a person who took ₹15,000 in a month
 * they earned ₹12,000 is only credited with the ₹3,000 left over in the
 * month that follows.
 */
export function staffLedgers(
  state: AppState,
  branch: BranchFilter,
  key: string,
): StaffLedgerRow[] {
  const advancesIn = (staffId: string, m: string) =>
    state.staffAdvances
      .filter((a) => a.staffId === staffId && monthKey(a.date) === m)
      .reduce((n, a) => n + a.amount, 0);
  const payoutsIn = (staffId: string, m: string) =>
    state.staffPayouts
      .filter((p) => p.staffId === staffId && monthKey(p.date) === m)
      .reduce((n, p) => n + p.amount, 0);

  return inBranch(state.staff, branch)
    .filter((s) => staffWorkedInMonth(s, key))
    .map((s) => {
      const salary = staffSalaryForMonth(s, key);

      // Walk the months this person has worked, carrying an advance that was
      // bigger than that month's salary into the month that follows.
      let held = 0;
      let advanceCarried = 0;
      let advanceDeducted = 0;
      let advances = 0;
      let paid = 0;
      for (const m of monthsUpTo(s, key)) {
        const monthSalary = staffSalaryForMonth(s, m);
        const monthAdvances = advancesIn(s.id, m);
        const monthPaid = payoutsIn(s.id, m);
        const carriedIn = held;
        held += monthAdvances;
        // The month's salary absorbs the advance as far as it goes.
        const absorbed = Math.min(held, monthSalary);
        held -= absorbed;
        if (m === key) {
          advances = monthAdvances;
          paid = monthPaid;
          advanceCarried = carriedIn;
          advanceDeducted = absorbed;
        }
      }

      const remaining = Math.max(0, salary - advanceDeducted - paid);
      return {
        staff: s,
        baseSalary: s.salary,
        salary,
        partialMonth: salary !== s.salary && salary > 0,
        advances,
        advanceCarried,
        advanceDeducted,
        paid,
        remaining,
      };
    });
}

/**
 * The branches that are actually running.
 *
 * A cost that belongs to "all PGs" is shared between the branches that are
 * open, so it is never counted once per branch.
 */
export function branchesInUse(state: AppState): BranchId[] {
  const used = new Set<BranchId>();
  for (const m of state.members) if (m.status === 'active') used.add(m.branch);
  for (const r of state.maintenance) used.add(r.branch);
  for (const c of state.catering) used.add(c.branch);
  for (const w of state.waterCans) used.add(w.branch);
  for (const t of state.waterTankers) used.add(t.branch);
  for (const l of state.leasePayments) used.add(l.branch);
  for (const b of state.ebBills) used.add(b.branch);
  for (const p of state.provisionExpenses) if (p.branch !== 'ALL') used.add(p.branch);
  const ordered: BranchId[] = ['PG1', 'PG2', 'PG3', 'PG4'];
  return ordered.filter((b) => used.has(b));
}

/**
 * Splits a shared ("All PGs") cost between the branches that are open.
 *
 * The shares always add up to the full amount — a rupee is never lost or
 * invented when the cost is divided.
 */
export function allocateShared(state: AppState, amount: number): Record<BranchId, number> {
  const out = { PG1: 0, PG2: 0, PG3: 0, PG4: 0 } as Record<BranchId, number>;
  const branches = branchesInUse(state);
  if (!branches.length || amount <= 0) return out;
  // Whole rupees only, and the shares always add up to the full amount — the
  // odd rupee is handed to the first branches so no rupee is lost or invented.
  const total = Math.round(amount);
  const base = Math.floor(total / branches.length);
  let remainder = total - base * branches.length;
  for (const b of branches) {
    const extra = remainder > 0 ? 1 : 0;
    out[b] = base + extra;
    remainder -= extra;
  }
  return out;
}

export function refundableAdvanceHeld(state: AppState, branch: BranchFilter): number {
  return activeMembers(state, branch).reduce((n, m) => n + (m.advance?.amount ?? 0), 0);
}

/* ------------------------------------------------------------------------------------
 * ELECTRICITY — bills are accrued when the power was used, paid or not.
 * ---------------------------------------------------------------------------------- */

/** The month a bill belongs to. Bills saved before this existed use the month they were paid. */
export function ebServiceMonth(bill: AppState['ebBills'][number]): string {
  if (bill.serviceMonth) return bill.serviceMonth;
  return monthKey(bill.paidDate);
}

/** Bills saved before the status field existed were paid. */
export function ebStatus(bill: AppState['ebBills'][number]): 'paid' | 'unpaid' | 'partial' {
  return bill.status ?? 'paid';
}

/** How much of a bill is still to be paid. */
export function ebOutstanding(bill: AppState['ebBills'][number]): number {
  const status = ebStatus(bill);
  if (status === 'unpaid') return bill.amount;
  if (status === 'partial') return Math.max(0, bill.amount - (bill.paidAmount ?? 0));
  return 0;
}

export interface UnpaidEbSummary {
  /** Money owed to the electricity board. */
  total: number;
  /** How many bills are not fully paid. */
  count: number;
  bills: AppState['ebBills'][number][];
}

/**
 * The water can bills that have not been paid to the vendor yet.
 *
 * The bill for a month is the cans delivered × the rate; a settlement carries
 * the month it settles. What is left over is money the PG still owes the can
 * vendor.
 */
export function unpaidWaterBills(
  state: AppState,
  branch: BranchFilter,
  key: string,
): { total: number; count: number } {
  const bills = new Map<string, number>();
  for (const c of inBranch(state.waterCans, branch)) {
    if (monthKey(c.date) > key) continue;
    bills.set(monthKey(c.date), (bills.get(monthKey(c.date)) ?? 0) + c.count);
  }
  // What has been paid to the vendor for each month's bill.
  const settled = new Map<string, number>();
  for (const s of state.canSettlements) {
    if (s.monthKey > key) continue;
    const amount = s.cash + s.upi + s.card;
    if (s.branch) {
      if (branch === 'ALL' || s.branch === branch) {
        settled.set(s.monthKey, (settled.get(s.monthKey) ?? 0) + amount);
      }
    } else {
      // An old settlement with no PG on it covered every PG.
      const share = branch === 'ALL' ? amount : allocateShared(state, amount)[branch];
      settled.set(s.monthKey, (settled.get(s.monthKey) ?? 0) + share);
    }
  }
  let total = 0;
  let count = 0;
  for (const [month, cans] of bills) {
    const owed = cans * state.canRate - (settled.get(month) ?? 0);
    if (owed > 0) {
      total += owed;
      count += 1;
    }
  }
  return { total, count };
}

/**
 * The electricity bills that have not been paid yet.
 *
 * A bill that has arrived but not been paid is money the PG still owes — a
 * liability, like unpaid rent. Bills for months after the one being looked at
 * are not counted: they have not been used yet.
 */export function unpaidEbBills(
  state: AppState,
  branch: BranchFilter,
  key: string,
): UnpaidEbSummary {
  const bills = inBranch(state.ebBills, branch)
    .filter((b) => ebOutstanding(b) > 0 && ebServiceMonth(b) <= key)
    .sort((a, b) => ebServiceMonth(a).localeCompare(ebServiceMonth(b)));
  return {
    total: bills.reduce((n, b) => n + ebOutstanding(b), 0),
    count: bills.length,
    bills,
  };
}

/* ------------------------------------------------------------------------------------
 * PROVISIONS — what was bought, from whom, and what is still on credit.
 * ---------------------------------------------------------------------------------- */

/**
 * Whether a provision was paid for on the spot.
 *
 * Records saved before this field existed were paid for in cash on the day —
 * they keep behaving exactly as they always did.
 */
export function provisionStatus(p: AppState['provisionExpenses'][number]): 'paid' | 'credit' {
  return p.status ?? 'paid';
}

export interface ProvisionCreditRow {
  /** The supplier the goods were bought from. */
  supplier: string;
  /** Goods bought from this supplier on credit. */
  bought: number;
  /** Money already paid to this supplier. */
  paid: number;
  /** What is still owed to this supplier. */
  outstanding: number;
  /** How many credit purchases are open with this supplier. */
  count: number;
}

/**
 * What is owed to each supplier for goods bought on credit.
 *
 * Goods bought on credit are not an expense in the month they were bought: no
 * money left the bank, so the cash flow must not show it. They stay a
 * liability until the supplier is paid — and the payment to the supplier is
 * what shows up in the profit and loss, exactly like the water can vendor.
 */
export function provisionCreditBalances(
  state: AppState,
  branch: BranchFilter,
): ProvisionCreditRow[] {
  const map = new Map<string, ProvisionCreditRow>();
  const rowFor = (supplier: string): ProvisionCreditRow => {
    const key = supplier.trim() || 'Supplier not recorded';
    let row = map.get(key);
    if (!row) {
      row = { supplier: key, bought: 0, paid: 0, outstanding: 0, count: 0 };
      map.set(key, row);
    }
    return row;
  };

  for (const p of state.provisionExpenses) {
    if (provisionStatus(p) !== 'credit') continue;
    let amount = 0;
    if (p.branch === 'ALL') {
      // A shared purchase is divided between the branches that are open.
      amount = branch === 'ALL' ? p.amount : allocateShared(state, p.amount)[branch];
    } else if (branch === 'ALL' || p.branch === branch) {
      amount = p.amount;
    }
    if (!amount) continue;
    const row = rowFor(p.supplier ?? '');
    row.bought += amount;
    row.count += 1;
  }

  for (const s of state.provisionSettlements ?? []) {
    const total = s.cash + s.upi + s.card;
    let amount = 0;
    if (s.branch === 'ALL') {
      amount = branch === 'ALL' ? total : allocateShared(state, total)[branch];
    } else if (branch === 'ALL' || s.branch === branch) {
      amount = total;
    }
    if (!amount) continue;
    rowFor(s.supplier).paid += amount;
  }

  const out = [...map.values()];
  for (const row of out) row.outstanding = Math.max(0, row.bought - row.paid);
  return out
    .filter((row) => row.bought > 0 || row.paid > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
}

/** The total still owed to suppliers for goods bought on credit. */
export function unpaidProvisionCredit(state: AppState, branch: BranchFilter): number {
  return provisionCreditBalances(state, branch).reduce((n, r) => n + r.outstanding, 0);
}

/**
 * Rent collected in a month (payments dated in that month) with the Cash/UPI/Card split.
 *
 * This is a pure cash-flow sum over *every* payment ever recorded — including
 * the payments of members who have since left the PG. Money that was received
 * belongs to the month it was received in, for good: a member vacating must
 * never erase rent that was already collected, otherwise the profit and loss
 * of a past month silently changes the day somebody moves out.
 *
 * Payments the owner has voided are skipped: reversed money was never received.
 */
export function rentCollected(
  state: AppState,
  branch: BranchFilter,
  key: string,
): { total: number; cash: number; upi: number; card: number } {
  let cash = 0;
  let upi = 0;
  let card = 0;
  for (const m of inBranch(state.members, branch)) {
    for (const p of m.payments) {
      // A voided payment is money that was never received: it counts for
      // nothing, in every month, for ever.
      if (p.voidedAt) continue;
      if (monthKey(p.date) === key) {
        cash += p.cash;
        upi += p.upi;
        card += p.card;
      }
    }
  }
  return { total: cash + upi + card, cash, upi, card };
}

/**
 * Maintenance kept back from vacated members, counted in the month it was
 * deducted (the date the member left). These rows are never deleted, so the
 * amount stays in the month it was earned, whatever happens to the member's
 * record afterwards.
 */
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
    // Electricity is accrued in the month the power was used, whether or not
    // the bill has been paid yet. Bills saved before service months existed
    // keep the month they were paid in.
    if (ebServiceMonth(b) === key) byCategory['EB Electricity'] += b.amount;
  }
  // Water: the cash actually paid to the can vendor in this month. The bill
  // is accrued from the cans delivered; the money leaves the bank when the
  // vendor is paid — so the expense line follows the cash, and the unpaid
  // bill is shown as a liability (see unpaidWaterBills).
  let canCash = 0;
  for (const s of state.canSettlements) {
    if (monthKey(s.date) !== key) continue;
    const amount = s.cash + s.upi + s.card;
    if (s.branch) {
      // A settlement for one PG belongs to that PG.
      if (branch === 'ALL' || s.branch === branch) canCash += amount;
    } else {
      // An old settlement with no PG on it covers every PG — it is shared
      // between them, never counted in full in each one.
      canCash += branch === 'ALL' ? amount : allocateShared(state, amount)[branch];
    }
  }
  byCategory['Water Cans'] = canCash;
  for (const t of inBranch(state.waterTankers, branch)) {
    if (monthKey(t.date) === key) byCategory['Water Tankers'] += t.cost;
  }
  for (const c of inBranch(state.catering, branch)) {
    if (monthKey(c.date) === key) byCategory.Catering += c.cash + c.upi + c.card;
  }
  // Staff: the salary they have earned that month, pro-rated when they joined
  // or left part-way through it.
  byCategory['Staff Salary'] = staffLedgers(state, branch, key).reduce((n, r) => n + r.salary, 0);
  const wifiIds = new Set(inBranch(state.wifi, branch).map((w) => w.id));
  for (const r of state.wifiRecharges) {
    if (wifiIds.has(r.wifiId) && monthKey(r.date) === key) byCategory['Wi-Fi Recharges'] += r.amount;
  }
  for (const p of state.provisionExpenses) {
    // Goods bought on credit are not paid for yet: no money left the bank, so
    // they must not touch this month's cash. They stay a liability until the
    // supplier is paid (see provisionCreditBalances).
    if (provisionStatus(p) === 'credit') continue;
    if (p.branch === 'ALL') {
      // A shared cost is divided between the branches that are open — it is
      // never counted in full in every single branch.
      if (monthKey(p.date) !== key) continue;
      if (branch === 'ALL') byCategory['Daily Provisions'] += p.amount;
      else byCategory['Daily Provisions'] += allocateShared(state, p.amount)[branch];
    } else if (branch === 'ALL' || p.branch === branch) {
      if (monthKey(p.date) === key) byCategory['Daily Provisions'] += p.amount;
    }
  }
  // Money paid to a supplier for goods bought on credit: this is the cash that
  // leaves the bank, so it is the expense of the month it was paid in.
  for (const s of state.provisionSettlements ?? []) {
    if (monthKey(s.date) !== key) continue;
    const total = s.cash + s.upi + s.card;
    if (s.branch === 'ALL') {
      if (branch === 'ALL') byCategory['Daily Provisions'] += total;
      else byCategory['Daily Provisions'] += allocateShared(state, total)[branch];
    } else if (branch === 'ALL' || s.branch === branch) {
      byCategory['Daily Provisions'] += total;
    }
  }

  const total = Object.values(byCategory).reduce((n, v) => n + v, 0);
  return { byCategory, total };
}

export interface PnL {
  revenue: number;
  rent: { total: number; cash: number; upi: number; card: number };
  maintenance: number;
  /** Everything the PG is owed — staying members and members who have left. */
  pendingRent: number;
  /** Of which: members who are still staying. */
  pendingRentStaying: number;
  /** Of which: members who have left without settling. */
  pendingRentLeft: number;
  expenses: ExpenseBreakdown;
  net: number;
  advanceHeld: number;
  /** Electricity bills that have arrived but are not paid yet. */
  unpaidEb: number;
  /** How many electricity bills are unpaid. */
  unpaidEbCount: number;
  /** Water can bills not yet paid to the vendor. */
  unpaidWater: number;
  /** Goods bought on credit that have not been paid to the supplier yet. */
  unpaidProvisionCredit: number;
}

/**
 * The day the month's pending rent is measured on.
 *
 * For the month that is running right now that is today. For a month that has
 * finished it is the last day of that month — so looking at October shows what
 * was still outstanding on 31 October, not what is outstanding today.
 */
export function asOfForMonth(key: string, today = todayISO()): string {
  if (key === monthKey(today)) return today;
  return monthEndISO(key);
}

export function pnlFor(state: AppState, branch: BranchFilter, key: string, today = todayISO()): PnL {
  const rent = rentCollected(state, branch, key);
  const maintenance = maintenanceCollected(state, branch, key);
  const expenses = expensesFor(state, branch, key);
  // Pending rent is measured on the day the month being looked at ended, and
  // it includes the dues of members who have left the PG but never settled.
  const owing = pendingRent(state, branch, asOfForMonth(key, today));
  const eb = unpaidEbBills(state, branch, key);
  const water = unpaidWaterBills(state, branch, key);
  const credit = unpaidProvisionCredit(state, branch);
  return {
    revenue: rent.total + maintenance,
    rent,
    maintenance,
    pendingRent: owing.total,
    pendingRentStaying: owing.staying,
    pendingRentLeft: owing.left,
    expenses,
    net: rent.total + maintenance - expenses.total,
    advanceHeld: refundableAdvanceHeld(state, branch),
    unpaidEb: eb.total,
    unpaidEbCount: eb.count,
    unpaidWater: water.total,
    unpaidProvisionCredit: credit,
  };
}
