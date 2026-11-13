/**
 * P5 regression tests — revenue fixes & liability tracking.
 *
 * Run with: npx tsx scripts/test-p5-fixes.ts   (or: npm run test:p5)
 *
 * G1 — a member moving from PG1 to PG2 never rewrites the past: the rent they
 *      paid in PG1 stays in PG1's books, and the rent they pay in PG2 is
 *      PG2's. Payments recorded before the branch was kept fall back to the
 *      member's current PG, exactly as they always did.
 * G2 — an electricity bill that covers two months is shared over the two
 *      months; no month carries the whole cost.
 * G3 — a part-paid water can bill says PART PAID, never PAID.
 * G5 — the liability card covers security deposits, advance rent credits and
 *      unrecovered staff advances.
 */
import * as XLSX from 'xlsx';
import {
  canSettlementStatus,
  ebBillMonths,
  ebBillShare,
  expensesFor,
  liabilities,
  pnlFor,
  rentCollected,
} from '../src/app/store/selectors';
import type { AppState, EbBill, Member, Staff } from '../src/app/store/types';
import { seedSampleState } from '../src/app/store/seed';
import { buildWorkbook } from '../src/modules/excel-sync/export';
import { applyWorkbook } from '../src/modules/excel-sync/import';
import { loadXlsx } from '../src/modules/excel-sync/xlsx-lazy';
import { currentMonthKey, monthKey, todayISO } from '../src/shared/lib/dates';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

const CURR = currentMonthKey();
const PREV = (() => {
  const [y, m] = CURR.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();
const BEFORE_PREV = (() => {
  const [y, m] = PREV.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

function member(over: Partial<Member> = {}): Member {
  return {
    id: 'm1',
    name: 'Asha Rao',
    occupation: 'Student',
    mobile: '9000000001',
    govtId: '[Aadhaar Redacted]',
    homeAddress: 'Chennai',
    branch: 'PG1',
    floor: 'First',
    roomCode: 'F101',
    bedIndex: 1,
    billingType: 'monthly',
    startDate: `${PREV}-01`,
    monthlyRent: 5000,
    advance: { amount: 0, mode: 'Cash', cash: 0, upi: 0, card: 0, date: `${PREV}-01` },
    payments: [],
    status: 'active',
    ...over,
  };
}

function staff(over: Partial<Staff> = {}): Staff {
  return {
    id: 'stf1',
    name: 'Cook',
    role: 'Cook',
    mobile: '9845012345',
    branch: 'PG1',
    salary: 12000,
    joinDate: `${PREV}-01`,
    ...over,
  };
}

function bill(over: Partial<EbBill> = {}): EbBill {
  return {
    id: 'eb1',
    meterId: 'meter_PG1_1',
    branch: 'PG1',
    cycle: 'Oct–Nov',
    amount: 5000,
    paidDate: `${PREV}-05`,
    mode: 'Cash',
    ...over,
  };
}

console.log(`=== G1. Moving a member to another PG never rewrites the past (${PREV}) ===`);
{
  // Asha lived in PG1, paid October's rent there, and has now moved to PG2.
  const moved = member({
    branch: 'PG2',
    payments: [
      // Paid while she was in PG1 — stamped with the PG it was collected for.
      { id: 'pay_old', date: `${PREV}-05`, cycleKey: `${PREV}-01`, cash: 5000, upi: 0, card: 0, branch: 'PG1' },
      // Paid after the move — this is PG2's income.
      { id: 'pay_new', date: `${CURR}-05`, cycleKey: `${CURR}-01`, cash: 5000, upi: 0, card: 0, branch: 'PG2' },
    ],
  });
  const state: AppState = { ...seedSampleState(), members: [moved] };

  check('PG1 keeps the rent collected in PG1', rentCollected(state, 'PG1', PREV).total, 5000);
  check('PG2 did not take PG1’s old rent', rentCollected(state, 'PG2', PREV).total, 0);
  check('PG2 gets the rent collected after the move', rentCollected(state, 'PG2', CURR).total, 5000);
  check('PG1 gets nothing from after the move', rentCollected(state, 'PG1', CURR).total, 0);
  check('the branch total is the whole truth', rentCollected(state, 'ALL', PREV).total, 5000);

  // A payment recorded before the branch was kept belongs to the member's
  // current PG — the old behaviour, kept exactly.
  const legacy = member({
    branch: 'PG2',
    payments: [{ id: 'pay_legacy', date: `${PREV}-05`, cycleKey: `${PREV}-01`, cash: 5000, upi: 0, card: 0 }],
  });
  const legacyState: AppState = { ...seedSampleState(), members: [legacy] };
  check('an old payment follows the member’s current PG', rentCollected(legacyState, 'PG2', PREV).total, 5000);
  check('and does not appear in the old PG', rentCollected(legacyState, 'PG1', PREV).total, 0);

  // A voided payment is still money that was never received.
  const voided = member({
    branch: 'PG2',
    payments: [
      { id: 'pay_void', date: `${PREV}-05`, cycleKey: `${PREV}-01`, cash: 5000, upi: 0, card: 0, branch: 'PG1', voidedAt: `${CURR}-02` },
    ],
  });
  const voidedState: AppState = { ...seedSampleState(), members: [voided] };
  check('a voided payment counts for nothing', rentCollected(voidedState, 'PG1', PREV).total, 0);
}

console.log('\n=== G2. An electricity bill that covers two months is shared over them ===');
{
  const twoMonths = bill({ serviceMonth: PREV, paidDate: `${PREV}-05` });
  const state: AppState = { ...seedSampleState(), ebBills: [twoMonths] };
  check('the cycle covers the month before and the month itself', ebBillMonths(state, twoMonths), [BEFORE_PREV, PREV]);
  check('each month carries its share', expensesFor(state, 'PG1', PREV).byCategory['EB Electricity'], 2500);
  check('and so does the month before it', expensesFor(state, 'PG1', BEFORE_PREV).byCategory['EB Electricity'], 2500);
  check('but a month the bill does not cover carries nothing', expensesFor(state, 'PG1', CURR).byCategory['EB Electricity'], 0);

  // The shares always add up to the bill — no rupee is lost or invented.
  const total =
    ebBillShare(state, twoMonths, PREV) + ebBillShare(state, twoMonths, BEFORE_PREV);
  check('the shares add up to the bill', total, 5000);

  // An odd amount: the extra rupee goes to the earliest month.
  const odd = bill({ amount: 5001, serviceMonth: PREV });
  const oddState: AppState = { ...seedSampleState(), ebBills: [odd] };
  check('the odd rupee lands on the earliest month', ebBillShare(oddState, odd, BEFORE_PREV), 2501);
  check('and the last month takes the rest', ebBillShare(oddState, odd, PREV), 2500);
  check(
    'and the bill still adds up',
    ebBillShare(oddState, odd, BEFORE_PREV) + ebBillShare(oddState, odd, PREV),
    5001,
  );

  // A bill saved before service months existed keeps the month it was paid in
  // as the last month of the cycle.
  const legacyBill = bill({ paidDate: `${PREV}-06` });
  const legacyState: AppState = { ...seedSampleState(), ebBills: [legacyBill] };
  check('an old bill still lands in the month it was paid', expensesFor(legacyState, 'PG1', PREV).byCategory['EB Electricity'], 2500);
  check('and the month before it carries its share', expensesFor(legacyState, 'PG1', BEFORE_PREV).byCategory['EB Electricity'], 2500);

  // A meter that bills every month keeps the whole cost in its month.
  const monthly = bill({
    id: 'eb_monthly',
    meterId: 'meter_PG1_2',
    amount: 3000,
    serviceMonth: PREV,
  });
  monthly.paidDate = `${PREV}-05`;
  const monthlyState: AppState = {
    ...seedSampleState(),
    ebMeters: [
      { id: 'meter_PG1_2', branch: 'PG1', label: 'EB Meter 2', consumerNo: 'PG1-EB-0002', cycleMonths: 1 },
      ...seedSampleState().ebMeters.filter((m) => m.id !== 'meter_PG1_2'),
    ],
    ebBills: [monthly],
  };
  check('a one-month meter keeps the whole bill in its month', expensesFor(monthlyState, 'PG1', PREV).byCategory['EB Electricity'], 3000);
  check('and nothing lands in another month', expensesFor(monthlyState, 'PG1', BEFORE_PREV).byCategory['EB Electricity'], 0);
}

console.log('\n=== G3. A part-paid can bill says PART PAID, never PAID ===');
{
  const base = seedSampleState();
  const withCans: AppState = {
    ...base,
    waterCans: [{ id: 'can1', date: `${CURR}-01`, branch: 'PG1', count: 10 }],
    canRate: 20,
  };
  check('the bill is 10 cans at ₹20', canSettlementStatus(withCans, 'PG1', CURR).bill, 200);

  const nothing = canSettlementStatus(withCans, 'PG1', CURR);
  check('nothing paid means NOT PAID', nothing.status, 'unpaid');
  check('and the whole bill is owed', nothing.due, 200);

  const part: AppState = {
    ...withCans,
    canSettlements: [{ id: 'cst1', monthKey: CURR, branch: 'PG1', date: `${CURR}-05`, cash: 100, upi: 0, card: 0 }],
  };
  const partStatus = canSettlementStatus(part, 'PG1', CURR);
  check('half paid is PART PAID, not PAID', partStatus.status, 'partial');
  check('and the rest is still owed', partStatus.due, 100);

  const full: AppState = {
    ...withCans,
    canSettlements: [{ id: 'cst2', monthKey: CURR, branch: 'PG1', date: `${CURR}-05`, cash: 200, upi: 0, card: 0 }],
  };
  const fullStatus = canSettlementStatus(full, 'PG1', CURR);
  check('paid in full is PAID', fullStatus.status, 'paid');
  check('and nothing is owed', fullStatus.due, 0);

  // A settlement saved before the PG was recorded covers every PG.
  const legacy: AppState = {
    ...withCans,
    canSettlements: [{ id: 'cst3', monthKey: CURR, date: `${CURR}-05`, cash: 200, upi: 0, card: 0 }],
  };
  check('an old settlement still covers the PG', canSettlementStatus(legacy, 'PG1', CURR).status, 'paid');
}

console.log('\n=== G5. Total liabilities & advances held ===');
{
  const depositor = member({
    id: 'm1',
    advance: { amount: 4000, mode: 'Cash', cash: 4000, upi: 0, card: 0, date: `${CURR}-01` },
  });
  // Paid ₹7,000 against a ₹5,000 rent: ₹2,000 is rent received in advance.
  const overpayer = member({
    id: 'm2',
    name: 'Bimal Das',
    branch: 'PG1',
    startDate: `${CURR}-01`,
    monthlyRent: 5000,
    payments: [{ id: 'pay_m2', date: `${CURR}-05`, cycleKey: `${CURR}-01`, cash: 7000, upi: 0, card: 0, branch: 'PG1' }],
  });
  const state: AppState = {
    ...seedSampleState(),
    members: [depositor, overpayer],
    staff: [staff()],
    // ₹20,000 given to a person who earns ₹12,000 a month: ₹12,000 is taken
    // back by this month's salary, ₹8,000 is still with them.
    staffAdvances: [{ id: 'sa1', staffId: 'stf1', date: `${CURR}-10`, amount: 20000, mode: 'Cash' }],
  };

  const owed = liabilities(state, 'ALL');
  check('the security deposits are counted', owed.deposits, 4000);
  check('the advance rent is counted', owed.advanceRent, 2000);
  check('the unrecovered staff advance is counted', owed.staffAdvances, 8000);
  check('the total is the sum of the three', owed.total, 14000);

  // The dashboard card reads the same numbers.
  const pnl = pnlFor(state, 'ALL', CURR);
  check('the profit and loss carries the same total', pnl.liabilities.total, 14000);
  check('the old advance field still means the deposits', pnl.advanceHeld, 4000);

  // One PG's liabilities never leak into another PG's.
  const pg1Only = liabilities(state, 'PG1');
  check('PG1 still has all of it', pg1Only.total, 14000);
  const pg2Only = liabilities(state, 'PG2');
  check('PG2 holds none of it', pg2Only.total, 0);
}

console.log('\n=== G1. The PG a payment belongs to survives an Excel backup ===');
{
  await loadXlsx();
  const base = seedSampleState();
  const state: AppState = {
    ...base,
    members: [
      member({
        payments: [
          { id: 'pay_x1', date: `${PREV}-05`, cycleKey: `${PREV}-01`, cash: 5000, upi: 0, card: 0, branch: 'PG1' },
        ],
      }),
    ],
  };
  const bytes = XLSX.write(buildWorkbook(state), { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  const restored = applyWorkbook(XLSX.read(bytes, { type: 'buffer' }), base);
  const restoredPayment = restored.members.find((m) => m.id === 'm1')?.payments[0];
  check('the payment still knows its PG', restoredPayment?.branch, 'PG1');
  check('and the books still agree', rentCollected(restored, 'PG1', PREV).total, 5000);

  // A file saved before the column existed must not clear what is on the device.
  const legacyFile = buildWorkbook(state);
  const sheet = legacyFile.Sheets['Rent_Payments'];
  delete sheet['L1'];
  for (let r = 2; r <= 10; r += 1) delete sheet[`L${r}`];
  const legacyRestored = applyWorkbook(XLSX.read(XLSX.write(legacyFile, { bookType: 'xlsx', type: 'buffer' }), { type: 'buffer' }), state);
  check('an old file leaves the PG on the payment alone', legacyRestored.members.find((m) => m.id === 'm1')?.payments[0]?.branch, 'PG1');
}

console.log('');
if (failures === 0) {
  console.log('ALL TESTS PASSED');
} else {
  console.log(`${failures} TEST(S) FAILED`);
  process.exit(1);
}
