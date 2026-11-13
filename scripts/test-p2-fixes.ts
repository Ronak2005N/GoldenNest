/**
 * P2 regression tests for the business-logic refinements.
 *
 * Run with: npx tsx scripts/test-p2-fixes.ts   (or: npm run test:p2)
 *
 * GND-11 — a staff member who joins or leaves part-way through a month is paid
 *          for the days they actually worked.
 * GND-27 — an electricity bill that has arrived but is unpaid is a liability,
 *          and its cost belongs to the month the power was used.
 * GND-18 — a Wi-Fi recharge is charged what the owner actually paid, not the
 *          monthly rate.
 * GND-12 — a cost shared by all PGs is divided between them, never counted in
 *          full in every single branch.
 */
import {
  staffSalaryForMonth,
  staffLedgers,
  expensesFor,
  pnlFor,
  unpaidEbBills,
  ebOutstanding,
  ebServiceMonth,
  ebStatus,
  allocateShared,
  branchesInUse,
} from '../src/app/store/selectors';
import type { AppState, EbBill, Staff } from '../src/app/store/types';
import { seedSampleState } from '../src/app/store/seed';
import { wifiPlanPrice } from '../src/pages/WifiPage';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

function staff(over: Partial<Staff> = {}): Staff {
  return {
    id: 'stf1',
    name: 'Cook',
    role: 'Cook',
    mobile: '9845012345',
    branch: 'PG1',
    salary: 12000,
    ...over,
  };
}

function bill(over: Partial<EbBill> = {}): EbBill {
  return {
    id: 'b1',
    meterId: 'meter_PG1_1',
    branch: 'PG1',
    cycle: 'Oct–Nov',
    amount: 5000,
    paidDate: '2026-11-05',
    mode: 'Cash',
    ...over,
  };
}

console.log('=== GND-11. A part month of work is paid as a part month ===');
{
  // Joins on the 28th of a 30-day month → 3 days of work.
  check('joined on the 28th', staffSalaryForMonth(staff({ joinDate: '2026-11-28' }), '2026-11'), 1200);
  // Leaves on the 10th of a 31-day month → 10 days of work.
  check('left on the 10th', staffSalaryForMonth(staff({ leftDate: '2026-10-10' }), '2026-10'), Math.round((12000 * 10) / 31));
  // Joined and left in the same month.
  check(
    'joined on the 1st, left on the 15th',
    staffSalaryForMonth(staff({ joinDate: '2026-11-01', leftDate: '2026-11-15' }), '2026-11'),
    Math.round((12000 * 15) / 30),
  );
  // A whole month.
  check('a full month', staffSalaryForMonth(staff({ joinDate: '2026-01-05' }), '2026-11'), 12000);
  // Legacy staff with no dates at all: the full month, exactly as before.
  check('legacy staff without dates', staffSalaryForMonth(staff(), '2026-11'), 12000);
  // Months before they joined and after they left.
  check('before they joined', staffSalaryForMonth(staff({ joinDate: '2026-11-28' }), '2026-10'), 0);
  check('after they left', staffSalaryForMonth(staff({ leftDate: '2026-10-10' }), '2026-11'), 0);
  // The month they left is still paid.
  check('the month they left', staffSalaryForMonth(staff({ leftDate: '2026-10-31' }), '2026-10'), 12000);
}
{
  // The profit and loss uses the pro-rated salary.
  const state: AppState = { ...seedSampleState(), staff: [staff({ joinDate: '2026-11-28' })] };
  const accrued = expensesFor(state, 'ALL', '2026-11').byCategory['Staff Salary'];
  check('the P&L accrues 3 days of salary', accrued, 1200);
}
{
  // The payroll ledger shows the same number, with what is still to be paid.
  const state: AppState = {
    ...seedSampleState(),
    staff: [staff({ joinDate: '2026-11-28' })],
    staffAdvances: [{ id: 'sa1', staffId: 'stf1', date: '2026-11-29', amount: 200, mode: 'Cash' }],
    staffPayouts: [{ id: 'sp1', staffId: 'stf1', date: '2026-11-29', amount: 100, mode: 'Cash' }],
  };
  const rows = staffLedgers(state, 'ALL', '2026-11');
  check('one row for the cook', rows.length, 1);
  check('the pro-rated salary', rows[0].salary, 1200);
  check('it is marked as a part month', rows[0].partialMonth, true);
  check('the advance is counted', rows[0].advances, 200);
  check('the payment is counted', rows[0].paid, 100);
  check('the balance still to be paid', rows[0].remaining, 900);
}

console.log('\n=== GND-27. An electricity bill that is not paid is still a liability ===');
{
  const unpaid = bill({ status: 'unpaid', paidDate: '', mode: undefined, serviceMonth: '2026-11' });
  check('an unpaid bill is not paid', ebStatus(unpaid), 'unpaid');
  check('the whole amount is outstanding', ebOutstanding(unpaid), 5000);
  check('it belongs to the month the power was used', ebServiceMonth(unpaid), '2026-11');

  const state: AppState = { ...seedSampleState(), ebBills: [unpaid] };
  check('the cost shows in that month', expensesFor(state, 'PG1', '2026-11').byCategory['EB Electricity'], 5000);
  check('and not in the next month', expensesFor(state, 'PG1', '2026-12').byCategory['EB Electricity'], 0);
  const owing = unpaidEbBills(state, 'PG1', '2026-11');
  check('it is a liability', owing.total, 5000);
  check('one bill is outstanding', owing.count, 1);
  check('the dashboard shows the liability', pnlFor(state, 'ALL', '2026-11', '2026-11-13').unpaidEb, 5000);
}
{
  const partial = bill({ status: 'partial', paidAmount: 2000, serviceMonth: '2026-11' });
  check('a part-paid bill has the rest outstanding', ebOutstanding(partial), 3000);
  const state: AppState = { ...seedSampleState(), ebBills: [partial] };
  check('the liability is the unpaid part', unpaidEbBills(state, 'PG1', '2026-11').total, 3000);
}
{
  // A bill for a later month is not a liability of an earlier month.
  const later = bill({ status: 'unpaid', paidDate: '', mode: undefined, serviceMonth: '2026-12' });
  const state: AppState = { ...seedSampleState(), ebBills: [later] };
  check('not counted for November', unpaidEbBills(state, 'PG1', '2026-11').total, 0);
  check('counted for December', unpaidEbBills(state, 'PG1', '2026-12').total, 5000);
}
{
  // Legacy bills (saved before the status field existed) stay exactly as they
  // were: paid, in the month they were paid.
  const legacy = bill({ paidDate: '2026-10-06' });
  check('a legacy bill is paid', ebStatus(legacy), 'paid');
  check('nothing is outstanding', ebOutstanding(legacy), 0);
  check('it keeps the month it was paid in', ebServiceMonth(legacy), '2026-10');
  const state: AppState = { ...seedSampleState(), ebBills: [legacy] };
  check('the cost is in the month it was paid', expensesFor(state, 'PG1', '2026-10').byCategory['EB Electricity'], 5000);
  check('and no liability', unpaidEbBills(state, 'PG1', '2026-11').total, 0);
}

console.log('\n=== GND-12. A shared cost is shared, not repeated in every branch ===');
{
  const state: AppState = {
    ...seedSampleState(),
    provisionExpenses: [
      { id: 'pv1', date: '2026-11-05', branch: 'ALL', item: 'Vegetables', amount: 10000, mode: 'Cash' },
    ],
  };
  const pg1 = expensesFor(state, 'PG1', '2026-11').byCategory['Daily Provisions'];
  const pg2 = expensesFor(state, 'PG2', '2026-11').byCategory['Daily Provisions'];
  const pg3 = expensesFor(state, 'PG3', '2026-11').byCategory['Daily Provisions'];
  const all = expensesFor(state, 'ALL', '2026-11').byCategory['Daily Provisions'];
  check('the combined view shows the whole amount', all, 10000);
  check('no branch carries the whole amount', Math.max(pg1, pg2, pg3) < 10000, true);
  check('the branches add up to the whole amount', pg1 + pg2 + pg3, 10000);
  check('every branch carries a share', pg1 > 0 && pg2 > 0 && pg3 > 0, true);
}
{
  // The split is exact — no rupee is lost or invented.
  const state: AppState = {
    ...seedSampleState(),
    provisionExpenses: [
      { id: 'pv1', date: '2026-11-05', branch: 'ALL', item: 'Vegetables', amount: 10001, mode: 'Cash' },
    ],
  };
  const shares = allocateShared(state, 10001);
  const total = shares.PG1 + shares.PG2 + shares.PG3 + shares.PG4;
  check('the shares add up exactly', total, 10001);
  check('the branches in use are the running ones', branchesInUse(state).length >= 3, true);
}
{
  // A cost that belongs to one branch is never shared out.
  const state: AppState = {
    ...seedSampleState(),
    provisionExpenses: [
      { id: 'pv1', date: '2026-11-05', branch: 'PG1', item: 'Gas', amount: 1150, mode: 'Cash' },
    ],
  };
  check('PG1 carries it in full', expensesFor(state, 'PG1', '2026-11').byCategory['Daily Provisions'], 1150);
  check('PG2 carries none of it', expensesFor(state, 'PG2', '2026-11').byCategory['Daily Provisions'], 0);
}

console.log('\n=== GND-18. A recharge costs what the owner paid, not the monthly rate ===');
{
  const w = {
    id: 'wifi1',
    label: 'PG1 Wi-Fi',
    branch: 'PG1' as const,
    ssid: 'GN_PG1',
    password: 'x',
    monthlyAmount: 899,
    expiryDate: '2026-12-01',
    validityDays: 30,
    planPrices: [
      { days: 30, amount: 899 },
      { days: 365, amount: 8000 },
    ],
  };
  check('the monthly plan keeps its price', wifiPlanPrice(w, 30), 899);
  check('a yearly plan has its own price', wifiPlanPrice(w, 365), 8000);
  check('a plan with no known price falls back to the monthly rate', wifiPlanPrice(w, 90), 899);
  // A connection saved before plan prices existed behaves exactly as before.
  const legacy = { ...w, planPrices: undefined };
  check('a legacy connection keeps the monthly rate', wifiPlanPrice(legacy, 365), 899);
}
{
  // The recharge is recorded with the amount the owner entered, so the
  // expense in the books is the real cost of the plan.
  const state: AppState = {
    ...seedSampleState(),
    wifi: [
      {
        id: 'wifi1',
        label: 'PG1 Wi-Fi',
        branch: 'PG1',
        ssid: 'GN_PG1',
        password: 'x',
        monthlyAmount: 899,
        expiryDate: '2026-12-01',
        validityDays: 365,
        planPrices: [{ days: 365, amount: 8000 }],
      },
    ],
    wifiRecharges: [
      { id: 'wr1', wifiId: 'wifi1', date: '2026-11-20', amount: 8000, mode: 'UPI' },
    ],
  };
  check('the yearly plan is expensed at its real price', expensesFor(state, 'PG1', '2026-11').byCategory['Wi-Fi Recharges'], 8000);
}

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
