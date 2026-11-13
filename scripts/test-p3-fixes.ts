/**
 * P3 regression tests for the accounting and polish fixes.
 *
 * Run with: npx tsx scripts/test-p3-fixes.ts   (or: npm run test:p3)
 *
 * GND-29 — a staff advance that is bigger than the month's salary is not lost:
 *          the remainder carries over to the next month.
 * GND-47 — the money actually paid to the water can vendor is the water cost
 *          in the P&L, and a bill that has not been paid is a liability.
 */
import { staffLedgers, expensesFor, pnlFor, unpaidWaterBills } from '../src/app/store/selectors';
import type { AppState, Staff } from '../src/app/store/types';
import { seedSampleState } from '../src/app/store/seed';

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
    joinDate: '2026-01-01',
    ...over,
  };
}

console.log('=== GND-29. An advance that is too big carries over ===');
{
  // ₹15,000 taken in October against a ₹12,000 salary.
  const state: AppState = {
    ...seedSampleState(),
    staff: [staff()],
    staffAdvances: [{ id: 'sa1', staffId: 'stf1', date: '2026-10-05', amount: 15000, mode: 'Cash' }],
  };
  const oct = staffLedgers(state, 'ALL', '2026-10')[0];
  check('October deducts the salary it can', oct.advanceDeducted, 12000);
  check('October has nothing left to pay', oct.remaining, 0);

  const nov = staffLedgers(state, 'ALL', '2026-11')[0];
  check('the extra ₹3,000 is carried into November', nov.advanceCarried, 3000);
  check('November only deducts the ₹3,000', nov.advanceDeducted, 3000);
  check('November pays the rest of the salary', nov.remaining, 9000);

  const dec = staffLedgers(state, 'ALL', '2026-12')[0];
  check('and nothing is carried into December', dec.advanceCarried, 0);
  check('December is a full salary again', dec.remaining, 12000);
}
{
  // An advance that is smaller than the salary behaves exactly as before.
  const state: AppState = {
    ...seedSampleState(),
    staff: [staff()],
    staffAdvances: [{ id: 'sa1', staffId: 'stf1', date: '2026-10-05', amount: 3000, mode: 'Cash' }],
  };
  const oct = staffLedgers(state, 'ALL', '2026-10')[0];
  check('October pays salary minus advance', oct.remaining, 9000);
  check('nothing is carried over', oct.advanceCarried, 0);
  const nov = staffLedgers(state, 'ALL', '2026-11')[0];
  check('November is a full salary', nov.remaining, 12000);
}
{
  // An advance given in a month the salary was not paid still carries over.
  const state: AppState = {
    ...seedSampleState(),
    staff: [staff()],
    staffAdvances: [{ id: 'sa1', staffId: 'stf1', date: '2026-10-05', amount: 20000, mode: 'Cash' }],
  };
  const oct = staffLedgers(state, 'ALL', '2026-10')[0];
  check('October is fully covered', oct.remaining, 0);
  const nov = staffLedgers(state, 'ALL', '2026-11')[0];
  check('November carries the rest', nov.advanceCarried, 8000);
  check('November pays what is left', nov.remaining, 4000);
  const feb = staffLedgers(state, 'ALL', '2026-12')[0];
  check('December is clear again', feb.remaining, 12000);
}
{
  // The P&L follows the same rule.
  const state: AppState = {
    ...seedSampleState(),
    staff: [staff()],
    staffAdvances: [{ id: 'sa1', staffId: 'stf1', date: '2026-10-05', amount: 15000, mode: 'Cash' }],
  };
  check('the October payroll is a full month', expensesFor(state, 'ALL', '2026-10').byCategory['Staff Salary'], 12000);
  check('the November payroll is a full month', expensesFor(state, 'ALL', '2026-11').byCategory['Staff Salary'], 12000);
}

console.log('\n=== GND-47. Water: the vendor payment is the cash that left ===');
{
  // 100 cans in October, settled on 1 November.
  const state: AppState = {
    ...seedSampleState(),
    waterCans: [{ id: 'c1', date: '2026-10-05', branch: 'PG1', count: 100 }],
    canSettlements: [
      { id: 's1', monthKey: '2026-10', branch: 'PG1', date: '2026-11-01', cash: 2000, upi: 0, card: 0 },
    ],
  };
  check('the cash leaves in November', expensesFor(state, 'PG1', '2026-11').byCategory['Water Cans'], 2000);
  check('October has no cash out', expensesFor(state, 'PG1', '2026-10').byCategory['Water Cans'], 0);
  check('the bill was settled, so nothing is owed', unpaidWaterBills(state, 'PG1', '2026-11').total, 0);
  check('the P&L shows the cash', pnlFor(state, 'PG1', '2026-11', '2026-11-13').expenses.byCategory['Water Cans'], 2000);
}
{
  // A bill that has not been paid is money the PG still owes the vendor.
  const state: AppState = {
    ...seedSampleState(),
    waterCans: [{ id: 'c1', date: '2026-10-05', branch: 'PG1', count: 100 }],
    canSettlements: [],
  };
  check('no cash has gone out', expensesFor(state, 'PG1', '2026-11').byCategory['Water Cans'], 0);
  check('the bill of 2,000 is owed', unpaidWaterBills(state, 'PG1', '2026-11').total, 2000);
  check('one bill is outstanding', unpaidWaterBills(state, 'PG1', '2026-11').count, 1);
  check('the dashboard shows the liability', pnlFor(state, 'PG1', '2026-11', '2026-11-13').unpaidWater, 2000);
}
{
  // A part payment leaves the rest owed.
  const state: AppState = {
    ...seedSampleState(),
    waterCans: [{ id: 'c1', date: '2026-10-05', branch: 'PG1', count: 100 }],
    canSettlements: [
      { id: 's1', monthKey: '2026-10', branch: 'PG1', date: '2026-11-01', cash: 500, upi: 0, card: 0 },
    ],
  };
  check('the cash paid is the expense', expensesFor(state, 'PG1', '2026-11').byCategory['Water Cans'], 500);
  check('the rest of the bill is still owed', unpaidWaterBills(state, 'PG1', '2026-11').total, 1500);
}
{
  // An old settlement with no PG on it covers every PG — it is shared, not
  // counted in full in each branch.
  const state: AppState = {
    ...seedSampleState(),
    waterCans: [
      { id: 'c1', date: '2026-10-05', branch: 'PG1', count: 100 },
      { id: 'c2', date: '2026-10-05', branch: 'PG2', count: 100 },
    ],
    canSettlements: [
      { id: 's1', monthKey: '2026-10', date: '2026-11-01', cash: 4000, upi: 0, card: 0 },
    ],
  };
  const pg1 = expensesFor(state, 'PG1', '2026-11').byCategory['Water Cans'];
  const pg2 = expensesFor(state, 'PG2', '2026-11').byCategory['Water Cans'];
  const pg3 = expensesFor(state, 'PG3', '2026-11').byCategory['Water Cans'];
  const all = expensesFor(state, 'ALL', '2026-11').byCategory['Water Cans'];
  check('the combined view shows the whole payment', all, 4000);
  check('the branches share it', pg1 + pg2 + pg3, 4000);
  check('no branch carries the whole amount', Math.max(pg1, pg2, pg3) < 4000, true);
}
{
  // Tankers are unaffected: they are paid on the day they arrive.
  const state: AppState = {
    ...seedSampleState(),
    waterTankers: [{ id: 't1', date: '2026-11-02', branch: 'PG1', note: 'Tanker', cost: 1500, mode: 'Cash' }],
  };
  check('the tanker is an expense on the day it arrived', expensesFor(state, 'PG1', '2026-11').byCategory['Water Tankers'], 1500);
  check('and not in any other month', expensesFor(state, 'PG1', '2026-12').byCategory['Water Tankers'], 0);
}

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
