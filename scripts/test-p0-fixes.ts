/**
 * P0 regression tests for the two critical accounting fixes (GND-01, GND-02).
 *
 * Run with: npx tsx scripts/test-p0-fixes.ts
 *
 * GND-01 — the rent ledger must claim every month from the member's joining
 *          date, whether or not a payment was ever recorded for it.
 * GND-02 — rent already collected must stay in the month it was collected in,
 *          even after the member vacates the PG.
 *
 * These tests describe the *correct* financial behaviour and must never be
 * weakened to make a build pass.
 */
import { rentPosition, payableCycles, rentLedger } from '../src/entities/member/rent';
import { defaulters, rentCollected, totalPendingRent, pnlFor } from '../src/app/store/selectors';
import type { AppState, Member } from '../src/app/store/types';
import { uid } from '../src/shared/lib/format';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

function member(startDate: string, monthlyRent: number, over: Partial<Member> = {}): Member {
  return {
    id: 'm1',
    name: 'Test Member',
    occupation: 'Student',
    mobile: '9845012345',
    govtId: '[Aadhaar Redacted]',
    homeAddress: '',
    branch: 'PG1',
    floor: 'Ground',
    roomCode: 'G1',
    bedIndex: 1,
    billingType: 'monthly',
    startDate,
    monthlyRent,
    advance: { amount: 0, mode: 'Cash', cash: 0, upi: 0, card: 0, date: startDate },
    payments: [],
    status: 'active',
    ...over,
  };
}

function baseState(): AppState {
  return {
    version: 2,
    rooms: [],
    members: [],
    maintenance: [],
    waterCans: [],
    canRate: 20,
    canSettlements: [],
    waterTankers: [],
    ebMeters: [],
    ebBills: [],
    leasePayments: [],
    catering: [],
    staff: [],
    staffAdvances: [],
    staffPayouts: [],
    wifi: [],
    wifiRecharges: [],
    provisionChips: [],
    provisionExpenses: [],
  };
}

console.log('=== GND-01. Arrears accrue from the joining date ===');
{
  // Joined 1 May 2026, nothing ever paid. Seven cycles are owed by 12 Nov.
  const m = member('2026-05-01', 8500);
  const pos = rentPosition(m, '2026-11-12');
  check('every month from the joining date is claimed', pos.totalDue, 7 * 8500);
  check('older months are shown separately', pos.olderDue, 6 * 8500);
  check('the running month is the balance', pos.balance, 8500);
  check('status is not "paid"', pos.status !== 'paid', true);
}
{
  // Joined 1 May, first payment only on 1 Nov. The five earlier months are
  // still owed — the first payment must not act as an amnesty.
  const m = member('2026-05-01', 7500);
  m.payments.push({ id: uid('pay'), date: '2026-11-01', cycleKey: '2026-11-01', cash: 7500, upi: 0, card: 0 });
  const pos = rentPosition(m, '2026-11-12');
  check('arrears before the first payment are still claimed', pos.olderDue, 6 * 7500);
  check('the paid month is settled', pos.balance, 0);
  check('total due', pos.totalDue, 6 * 7500);
}
{
  // The payment screen must offer every historical month so the owner can
  // back-date the payments he made in cash but never wrote down.
  const m = member('2026-05-01', 8500);
  const cycles = payableCycles(m, '2026-11-12');
  const older = cycles.filter((c) => c.kind === 'older').map((c) => c.cycleKey);
  check('every unpaid historical month is offered', older, [
    '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01',
  ]);
  check('the running month is offered', cycles.some((c) => c.kind === 'current'), true);
  check('the next month is offered', cycles.some((c) => c.kind === 'next'), true);
}
{
  // Paying one historical month clears exactly that month and nothing else.
  const m = member('2026-05-01', 8500);
  m.payments.push({ id: uid('pay'), date: '2026-07-15', cycleKey: '2026-07-01', cash: 8500, upi: 0, card: 0 });
  const pos = rentPosition(m, '2026-11-12');
  check('July is settled', pos.ledger.find((r) => r.cycleKey === '2026-07-01')?.gap, 0);
  check('June is still owed', pos.ledger.find((r) => r.cycleKey === '2026-06-01')?.gap, 8500);
  check('total due falls by exactly one month', pos.totalDue, 6 * 8500);
}
{
  // No debt is invented for a month before the member was in the PG.
  const m = member('2026-05-01', 8500);
  const ledger = rentLedger(m, '2026-11-12');
  check('the ledger starts on the joining date', ledger[0].cycleStart, '2026-05-01');
  check('no cycle exists before the joining date', ledger.some((r) => r.cycleStart < '2026-05-01'), false);
}
{
  // A member who left: cycles stop at the exit date, arrears stop growing.
  const m = member('2026-05-01', 8500, {
    status: 'vacated',
    vacatedOn: '2026-08-20',
    settlement: { exitDate: '2026-08-20', maintenanceDeduction: 0, pendingRentDeduction: 0, refund: 0, refundMode: 'Cash', recordedOn: '2026-08-20' },
  });
  const ledger = rentLedger(m, '2026-11-12');
  check('the last cycle covers the leaving date', ledger[ledger.length - 1].cycleStart, '2026-08-01');
  check('no cycle after the leaving date', ledger.some((r) => r.cycleStart > '2026-08-01'), false);
  check('arrears stop at the leaving date', rentPosition(m, '2026-11-12').totalDue, 4 * 8500);
}
{
  // The defaulter list and the dashboard pick the arrears up.
  const m = member('2026-05-01', 8500);
  const state = { ...baseState(), members: [m] };
  const rows = defaulters(state, 'ALL', '2026-11-12');
  check('the member is on the defaulter list', rows.length, 1);
  check('the balance shown is the full arrears', rows[0].balance, 7 * 8500);
  check('dashboard pending rent', totalPendingRent(state, 'ALL', '2026-11-12'), 7 * 8500);
}

console.log('\n=== GND-02. Money already collected stays in the month it was collected ===');
{
  // Paid in October, left the PG in November. October must keep the ₹10,500.
  const m = member('2026-06-01', 10500, { id: 'mR', name: 'Rakesh' });
  m.payments.push({ id: uid('pay'), date: '2026-10-05', cycleKey: '2026-10-05', cash: 10500, upi: 0, card: 0 });
  const vacated = {
    ...m,
    status: 'vacated' as const,
    vacatedOn: '2026-11-02',
    settlement: { exitDate: '2026-11-02', maintenanceDeduction: 500, pendingRentDeduction: 0, refund: 7500, refundMode: 'Cash' as const, recordedOn: '2026-11-02' },
  };
  const state: AppState = {
    ...baseState(),
    members: [vacated],
    maintenance: [{ id: uid('mnt'), date: '2026-11-02', branch: 'PG1', amount: 500, memberId: 'mR', memberName: 'Rakesh' }],
  };
  check('October rent is still counted after vacating', rentCollected(state, 'ALL', '2026-10').total, 10500);
  check('October cash split survives', rentCollected(state, 'ALL', '2026-10').cash, 10500);
  check('November rent is zero', rentCollected(state, 'ALL', '2026-11').total, 0);
  check('October revenue is on the dashboard', pnlFor(state, 'ALL', '2026-10').rent.total, 10500);
  check('maintenance stays in the month it was deducted', pnlFor(state, 'ALL', '2026-11').maintenance, 500);
  check('October carries no maintenance', pnlFor(state, 'ALL', '2026-10').maintenance, 0);
}
{
  // Revenue is a pure cash-flow sum: only the month the money arrived counts.
  const m = member('2026-06-01', 5000);
  m.payments.push({ id: uid('pay'), date: '2026-10-09', cycleKey: '2026-10-01', cash: 2000, upi: 3000, card: 0 });
  const state: AppState = { ...baseState(), members: [m] };
  check('cash counted', rentCollected(state, 'ALL', '2026-10').cash, 2000);
  check('upi counted', rentCollected(state, 'ALL', '2026-10').upi, 3000);
  check('total counted', rentCollected(state, 'ALL', '2026-10').total, 5000);
  check('nothing lands in the neighbouring month', rentCollected(state, 'ALL', '2026-09').total, 0);
  check('branch filter still works', rentCollected(state, 'PG2', '2026-10').total, 0);
}
{
  // A member who left still counts for the month they left.
  const m = member('2026-06-01', 5000, { status: 'vacated', vacatedOn: '2026-10-15' });
  m.payments.push({ id: uid('pay'), date: '2026-10-09', cycleKey: '2026-10-01', cash: 5000, upi: 0, card: 0 });
  const state: AppState = { ...baseState(), members: [m] };
  check('October revenue kept after leaving in the same month', rentCollected(state, 'ALL', '2026-10').total, 5000);
}

console.log('\n=== Records are preserved: nothing is rewritten by the ledger ===');
{
  const m = member('2026-05-01', 8500);
  m.payments.push({ id: 'pay_keep_1', date: '2026-11-01', cycleKey: '2026-11-01', cash: 8500, upi: 0, card: 0 });
  const before = JSON.stringify(m);
  rentPosition(m, '2026-11-12');
  payableCycles(m, '2026-11-12');
  rentLedger(m, '2026-11-12');
  check('the member record is untouched', JSON.stringify(m), before);
}

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
