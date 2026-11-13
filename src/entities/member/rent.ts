import type { Member, RentPayment, RentRateChange } from '../../app/store/types';
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
  /** 0 = the cycle running right now, 1 = the next one, and so on. */
  offset: number;
}

/**
 * One line of the rent ledger — what was due, what was paid and what is
 * still open for one month-cycle.
 */
export interface CycleLedgerRow {
  cycleKey: string;
  label: string;
  cycleStart: string;
  cycleEnd: string;
  due: number;
  /** Money that covers this cycle once credit from earlier cycles is used. */
  paid: number;
  /** Money paid straight into this cycle. */
  direct: number;
  /** Still unpaid for this cycle. */
  gap: number;
  /**
   * False for a month the member was never in the PG for (before the joining
   * date). Nothing is claimed for those months — the app does not guess.
   * Every month from the joining date onwards is claimed, paid or not.
   */
  known: boolean;
  offset: number;
}

/**
 * The day the member's stay ended, when it has ended.
 *
 * Used to stop the cycle chain at the right place: a member who left on the
 * 2nd of November must not keep accruing rent cycles for the rest of time.
 */
function stayEndISO(member: Member): string | undefined {
  if (member.endDate) return member.endDate;
  if (member.status === 'vacated') {
    return member.vacatedOn || member.settlement?.exitDate || undefined;
  }
  return undefined;
}

/**
 * The rent rate in force on a given date.
 *
 * A cycle is priced with the rate that was in force when the cycle started:
 * raising the rent in November must never re-price a month that was already
 * paid and settled in October.
 *
 * Members saved before rent history existed have no history at all. For them
 * the single `monthlyRent` field is the rate for every cycle — exactly the
 * behaviour they had before, with no change to their history.
 */
export function rateForDate(member: Member, date: string): number {
  const history = sortedRentHistory(member);
  if (!history.length) return member.monthlyRent ?? 0;
  let applicable: number | undefined;
  for (const e of history) {
    if (e.fromDate <= date) applicable = e.amount;
  }
  if (applicable !== undefined) return applicable;
  // Before the first recorded rate: fall back to the earliest rate the app
  // knows about. An older rate can never create a phantom debt.
  return history[0].amount;
}

/** The rate this member is being charged today. */
export function currentRentRate(member: Member, today = todayISO()): number {
  return rateForDate(member, today);
}

/** The member's rent rates, oldest first. */
function sortedRentHistory(member: Member): RentRateChange[] {
  return [...(member.rentHistory ?? [])].sort((a, b) => a.fromDate.localeCompare(b.fromDate));
}

/**
 * Records a new rent rate with effect from a given date.
 *
 * Everything before that date keeps the rate it had. When a member has no
 * history yet, the rate they were on when they joined is recorded first, so
 * the months before the change are never re-priced.
 */
export function withRentChange(member: Member, fromDate: string, amount: number): Member {
  const today = todayISO();
  const start = member.startDate || today;
  // A change can never start before the member joined.
  const effective = !fromDate || fromDate < start ? start : fromDate;

  const history = sortedRentHistory(member).filter((e) => e.fromDate !== effective);
  if (!history.length && start !== effective) {
    // Seed the baseline with the rate that was in force when they joined.
    // A member whose rent was never recorded (0 or missing) gets the new
    // rate for the whole stay instead of a zero-rent past.
    history.push({ fromDate: start, amount: member.monthlyRent || amount });
  }
  history.push({ fromDate: effective, amount });
  history.sort((a, b) => a.fromDate.localeCompare(b.fromDate));

  return { ...member, monthlyRent: amount, rentHistory: history };
}

/**
 * The day rent started being due for this member.
 *
 * The joining date on the member's own record is the only trustworthy anchor:
 * from that day the bed was occupied and rent was due — whether or not the
 * app happens to hold a payment record for it. Only a member with no joining
 * date at all (a badly imported record) falls back to the first payment, and
 * failing that to today.
 */
function startOfStay(member: Member, today: string): string {
  if (member.startDate) return member.startDate;
  const firstPaid = member.payments
    .filter((p) => !p.voidedAt)
    .map((p) => p.date)
    .filter(Boolean)
    .sort()[0];
  return firstPaid || today;
}

/**
 * The chain of monthly cycles a member has lived through, oldest first.
 * Index 0 is the first cycle (starting on the joining date). The chain is
 * built by walking forward month by month exactly the way the app always has,
 * so every payment already recorded against a cycle key still lines up.
 *
 * The chain always starts at the joining date and ends at today — or at the
 * day the member left, if they have left. It is never shortened because a
 * payment is missing: an unpaid month is a month that is owed, not a month
 * that does not exist.
 */
export function cycleChain(member: Member, today = todayISO()): CycleInfo[] {
  if (member.billingType === 'daily') {
    const start = startOfStay(member, today);
    const end = member.endDate || stayEndISO(member) || today;
    const days = inclusiveDays(start, end);
    const rate = member.dailyRate ?? 500;
    return [
      {
        cycleKey: 'daily',
        due: days * rate,
        cycleStart: start,
        cycleEnd: end,
        label: `${longDate(start)} to ${longDate(end)} · ${days} days × ₹${rate}/day`,
        offset: 0,
      },
    ];
  }

  const out: CycleInfo[] = [];
  const endISO = stayEndISO(member);
  let cycleStart = startOfStay(member, today);
  for (let i = 0; i < 600; i++) {
    const next = addMonths(cycleStart, 1);
    out.push({
      cycleKey: cycleStart,
      // Each cycle carries the rent rate that was in force when it started.
      due: rateForDate(member, cycleStart),
      cycleStart,
      cycleEnd: addDays(next, -1),
      label: `${longDate(cycleStart)} to ${longDate(addDays(next, -1))}`,
      offset: out.length,
    });
    if (next > today) break;
    // The cycle that covers the leaving date is the last one: rent stops there.
    if (endISO && next > endISO) break;
    cycleStart = next;
  }
  return out;
}

/** Date-to-date monthly cycle: joins on the 18th → cycle runs 18th to next month's 18th. */
export function currentCycle(member: Member, today = todayISO()): CycleInfo {
  const chain = cycleChain(member, today);
  return chain[chain.length - 1];
}

/**
 * The cycle `offset` months from the one running right now.
 * offset 0 = current cycle, 1 = next cycle (for paying a month in advance).
 */
export function cycleAt(member: Member, offset: number, today = todayISO()): CycleInfo {
  const chain = cycleChain(member, today);
  const last = chain[chain.length - 1];
  if (offset <= 0 || member.billingType === 'daily') return last;
  // Extend the same chain the app always uses, so a payment booked against a
  // future cycle lands on exactly the key the app will look for later.
  let cycleStart = last.cycleStart;
  for (let i = 0; i < offset; i++) cycleStart = addMonths(cycleStart, 1);
  const next = addMonths(cycleStart, 1);
  return {
    cycleKey: cycleStart,
    // A future cycle is priced with the rate that will apply when it starts.
    due: rateForDate(member, cycleStart),
    cycleStart,
    cycleEnd: addDays(next, -1),
    label: `${longDate(cycleStart)} to ${longDate(addDays(next, -1))}`,
    offset: last.offset + offset,
  };
}

/**
 * Money received against a cycle.
 *
 * A voided (reversed) payment counts for nothing: the rent goes back to
 * unpaid and the money leaves the month's revenue. The payment itself is
 * never deleted — it stays on the record as an audit trail of the correction.
 *
 * When an "as of" day is given, only money that had actually been received by
 * that day counts. A rent paid in November for October did not exist at the
 * end of October, so it must not make October look settled.
 */
export function paidInCycle(member: Member, cycleKey: string, asOf?: string): number {
  return member.payments
    .filter((p) => p.cycleKey === cycleKey && !p.voidedAt)
    .filter((p) => !asOf || p.date <= asOf)
    .reduce((n, p) => n + p.cash + p.upi + p.card, 0);
}

/** Every payment of a member that still counts (voided ones are excluded). */
export function livePayments(member: Member): RentPayment[] {
  return member.payments.filter((p) => !p.voidedAt);
}

/**
 * The rent ledger for every cycle up to and including the one running now.
 *
 * Money is walked forward from the oldest cycle. Anything a member paid beyond
 * the rent of a finished cycle is carried into the next cycle automatically —
 * that is the advance rent which quietly reduces next month's balance without
 * anybody having to write anything when the date changes. Anything still
 * unpaid in an older cycle stays visible as an old debt instead of quietly
 * disappearing when the month rolls over.
 *
 * Every cycle from the joining date onwards is claimed. A month with no
 * payment recorded against it is simply unpaid — the ledger never treats a
 * missing payment record as "this month was free".
 *
 * When an "as of" day is given, only money received by that day counts, so a
 * past month shows exactly what was outstanding on its last day.
 */
export function rentLedger(member: Member, today = todayISO(), asOf?: string): CycleLedgerRow[] {
  return walkLedger(member, today, asOf).rows;
}

/** The ledger plus the money still left over after the newest cycle. */
function walkLedger(
  member: Member,
  today = todayISO(),
  asOf?: string,
): { rows: CycleLedgerRow[]; carry: number } {
  const chain = cycleChain(member, today);
  // The day the member actually moved in. If that day is after the month being
  // looked at, the member was not in the PG yet — nothing is claimed for them.
  const stayed = startOfStay(member, today);
  if (stayed > today) {
    return {
      rows: chain.map((c) => ({
        cycleKey: c.cycleKey,
        label: c.label,
        cycleStart: c.cycleStart,
        cycleEnd: c.cycleEnd,
        due: 0,
        paid: 0,
        direct: 0,
        gap: 0,
        known: false,
        offset: c.offset,
      })),
      carry: 0,
    };
  }
  if (member.billingType === 'daily') {
    const c = chain[0];
    const direct = paidInCycle(member, c.cycleKey, asOf);
    const paid = Math.min(c.due, direct);
    return {
      rows: [
        {
          cycleKey: c.cycleKey,
          label: c.label,
          cycleStart: c.cycleStart,
          cycleEnd: c.cycleEnd,
          due: c.due,
          paid,
          direct,
          gap: Math.max(0, c.due - paid),
          known: true,
          offset: 0,
        },
      ],
      carry: Math.max(0, direct - c.due),
    };
  }

  const rows: CycleLedgerRow[] = [];
  // The chain starts at the joining date, so the anchor is the member's own
  // record — every cycle in it is a month the member actually lived here.
  const knownFrom = anchorIndex(member, chain);

  let carry = 0;
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i];
    const direct = paidInCycle(member, c.cycleKey, asOf);
    const available = carry + direct;
    const paid = Math.min(c.due, available);
    carry = available - paid;
    const known = i >= knownFrom;
    rows.push({
      cycleKey: c.cycleKey,
      label: c.label,
      cycleStart: c.cycleStart,
      cycleEnd: c.cycleEnd,
      due: c.due,
      paid,
      direct,
      // A month with no payment recorded against it is unpaid in full.
      gap: known ? Math.max(0, c.due - paid) : 0,
      known,
      offset: i,
    });
  }
  return { rows, carry };
}

/**
 * The first cycle the app claims for this member.
 *
 * The anchor is the member's own joining date and nothing else. From the day
 * they joined the bed, rent was due every cycle until they left — the app
 * never invents a debt for a month before the member was even in the PG, and
 * it never forgives a debt for a month the member was here but has not paid.
 *
 * A missing payment record therefore means "not recorded yet", never "not owed".
 */
function anchorIndex(member: Member, chain: CycleInfo[]): number {
  if (!chain.length) return 0;
  const start = member.startDate;
  if (!start) return 0;
  for (let i = 0; i < chain.length; i++) {
    if (start >= chain[i].cycleStart && start <= chain[i].cycleEnd) return i;
  }
  return 0;
}

/** Money already received for a cycle that has not started yet. */
export function prepaidRent(member: Member, today = todayISO()): number {
  if (member.billingType === 'daily') return 0;
  let total = 0;
  for (let offset = 1; offset <= 6; offset++) {
    const c = cycleAt(member, offset, today);
    total += paidInCycle(member, c.cycleKey);
  }
  return total;
}

export interface RentPosition {
  cycleKey: string;
  cycleStart: string;
  cycleEnd: string;
  label: string;
  offset: number;
  /** Rent due for the cycle running right now. */
  due: number;
  /** Money settled against the cycle running right now. */
  paid: number;
  /** Still unpaid for the cycle running right now. */
  balance: number;
  status: RentStatus;
  /** Rent still unpaid from earlier cycles. */
  olderDue: number;
  /** Everything the member owes right now. */
  totalDue: number;
  /** Extra money paid beyond this cycle's rent — it will cut next month's bill. */
  credit: number;
  /** Money already paid for a cycle that has not started yet. */
  prepaid: number;
  ledger: CycleLedgerRow[];
}

/**
 * Where the member stands today.
 *
 * Money received for a month that has not started yet is kept apart so the
 * owner can see it was not forgotten — it is simply paid in advance.
 *
 * When an "as of" day is given, the position is measured on that day: only
 * money received by then is counted, so looking at an old month shows who
 * really owed money at the end of that month.
 */
export function rentPosition(member: Member, today = todayISO(), asOf?: string): RentPosition {
  const { rows: ledger, carry } = walkLedger(member, today, asOf);
  const current = ledger[ledger.length - 1];
  const olderDue = ledger.slice(0, ledger.length - 1).reduce((n, r) => n + r.gap, 0);
  const totalDue = olderDue + current.gap;
  const prepaid = prepaidRent(member, today);
  const status: RentStatus =
    totalDue <= 0 ? 'paid' : current.paid > 0 || olderDue > 0 ? 'partial' : 'unpaid';
  return {
    cycleKey: current.cycleKey,
    cycleStart: current.cycleStart,
    cycleEnd: current.cycleEnd,
    label: current.label,
    offset: current.offset,
    due: current.due,
    paid: current.paid,
    balance: current.gap,
    status,
    olderDue,
    totalDue,
    credit: carry,
    prepaid,
    ledger,
  };
}

/** A cycle the owner can still put money into. */
export interface PayableCycle extends CycleInfo {
  /** Money already paid against this cycle. */
  paid: number;
  /** Money still to be paid for this cycle. */
  gap: number;
  kind: 'older' | 'current' | 'next';
}

/**
 * Every cycle the owner might want to record a payment against:
 * months that are still open, the month running now, and the next month.
 *
 * "Still open" means every month from the joining date onwards that has not
 * been paid in full — including months from long ago whose payment the app
 * never received a record of. Those months can be paid (and back-dated) from
 * the payment screen, so an owner who paid in cash but forgot to write it down
 * can still put the books right.
 */
export function payableCycles(member: Member, today = todayISO()): PayableCycle[] {
  const out: PayableCycle[] = [];
  const ledger = rentLedger(member, today);
  const current = ledger[ledger.length - 1];

  for (let i = 0; i < ledger.length - 1; i++) {
    const row = ledger[i];
    if (row.known && row.gap > 0) {
      out.push({ ...row, paid: row.paid, gap: row.gap, kind: 'older' });
    }
  }

  out.push({ ...current, paid: current.paid, gap: current.gap, kind: 'current' });

  // A member who has left has no next month — only the months they actually
  // stayed for can be paid.
  if (member.billingType !== 'daily' && member.status !== 'vacated') {
    const next = cycleAt(member, 1, today);
    const direct = paidInCycle(member, next.cycleKey);
    out.push({
      ...next,
      paid: Math.min(next.due, direct),
      gap: Math.max(0, next.due - direct),
      kind: 'next',
    });
  }
  return out;
}

export const RENT_STATUS_TEXT: Record<RentStatus, string> = {
  paid: 'PAID IN FULL',
  partial: 'PARTIAL — BALANCE DUE',
  unpaid: 'UNPAID',
};

/**
 * The words to show for a member. A member whose month is settled but who
 * still owes an older month is not "part paid" — the money is simply due.
 */
export function rentStatusText(pos: RentPosition): string {
  if (pos.totalDue <= 0) return 'PAID IN FULL';
  if (pos.balance <= 0) return 'BALANCE DUE';
  return pos.paid > 0 ? 'PARTIAL — BALANCE DUE' : 'UNPAID';
}

/** A member is a defaulter when anything at all is still owed. */
export function isDefaulter(member: Member, today = todayISO()): boolean {
  return member.status === 'active' && rentPosition(member, today).totalDue > 0;
}

/** Refundable money = money held − Maintenance Deduction − Unpaid Rent. */
export function netRefund(held: number, maintenance: number, pendingRent: number): number {
  return Math.max(0, held - maintenance - pendingRent);
}
