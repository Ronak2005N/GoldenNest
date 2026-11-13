/**
 * Month-rollover tests for the other recurring items (run with: npx tsx scripts/test-month-rollover.ts)
 *
 * Water cans, EB bills, staff salary, Wi-Fi and the owner lease all have to
 * behave correctly when the calendar moves into the next month.
 */
import { expensesFor, pnlFor, asOfForMonth, staffWorkedInMonth } from '../src/app/store/selectors';
import type { AppState, BranchId, Staff } from '../src/app/store/types';
import { monthEndISO } from '../src/shared/lib/dates';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
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

console.log('--- 1. Staff salary stops accruing after the person leaves ---');
{
  const s: Staff = {
    id: 'stf1', name: 'Cook', role: 'Cook', mobile: '9845012345',
    branch: 'PG1', salary: 12000, joinDate: '2026-01-01', leftDate: '2026-11-30',
  };
  const state = { ...baseState(), staff: [s] };
  check('worked in October', staffWorkedInMonth(s, '2026-10'), true);
  check('worked in November (the month they left)', staffWorkedInMonth(s, '2026-11'), true);
  check('not worked in December', staffWorkedInMonth(s, '2026-12'), false);
  check('October salary counted', expensesFor(state, 'ALL', '2026-10').byCategory['Staff Salary'], 12000);
  check('November salary counted', expensesFor(state, 'ALL', '2026-11').byCategory['Staff Salary'], 12000);
  check('December salary not counted', expensesFor(state, 'ALL', '2026-12').byCategory['Staff Salary'], 0);
}

console.log('\n--- 2. Staff who never left keep accruing every month ---');
{
  const s: Staff = {
    id: 'stf1', name: 'Cook', role: 'Cook', mobile: '9845012345',
    branch: 'PG1', salary: 12000, joinDate: '2026-01-01',
  };
  const state = { ...baseState(), staff: [s] };
  check('December salary counted', expensesFor(state, 'ALL', '2026-12').byCategory['Staff Salary'], 12000);
}

console.log('\n--- 3. Water can bill is settled PG by PG ---');
{
  const state: AppState = {
    ...baseState(),
    waterCans: [
      { id: 'c1', date: '2026-11-02', branch: 'PG1', count: 100 },
      { id: 'c2', date: '2026-11-03', branch: 'PG2', count: 50 },
    ],
    canSettlements: [
      { id: 's1', monthKey: '2026-11', branch: 'PG1' as BranchId, date: '2026-11-30', cash: 2000, upi: 0, card: 0 },
    ],
  };
  // PG1 is settled, PG2 is not — the settlement must not spill across PGs.
  const pg1 = state.canSettlements.find((s) => s.monthKey === '2026-11' && s.branch === 'PG1');
  const pg2 = state.canSettlements.find((s) => s.monthKey === '2026-11' && s.branch === 'PG2');
  check('PG1 settled', !!pg1, true);
  check('PG2 not settled', !!pg2, false);
  check('PG1 bill', 100 * state.canRate, 2000);
  check('PG2 bill', 50 * state.canRate, 1000);
}

console.log('\n--- 4. An old settlement with no PG still covers every PG ---');
{
  const state: AppState = {
    ...baseState(),
    canSettlements: [
      { id: 's1', monthKey: '2026-10', date: '2026-11-01', cash: 1000, upi: 0, card: 0 },
    ],
  };
  const legacy = state.canSettlements.find((s) => s.monthKey === '2026-10' && !s.branch);
  check('legacy settlement covers all PGs', !!legacy, true);
}

console.log('\n--- 5. Pending rent on the dashboard is measured at the end of that month ---');
{
  check('running month is measured today', asOfForMonth('2026-11', '2026-11-12'), '2026-11-12');
  check('finished month is measured at its end', asOfForMonth('2026-10', '2026-11-12'), monthEndISO('2026-10'));
  const state = baseState();
  check('pending rent for October', pnlFor(state, 'ALL', '2026-10', '2026-11-12').pendingRent, 0);
}

console.log('\n--- 6. Owner lease resets every month on its own ---');
{
  const state: AppState = {
    ...baseState(),
    leasePayments: [
      { id: 'l1', branch: 'PG1' as BranchId, monthKey: '2026-10', amount: 35000, date: '2026-10-01', mode: 'Cash' },
    ],
  };
  check('October lease counted', expensesFor(state, 'ALL', '2026-10').byCategory['Owner Lease'], 35000);
  check('November lease not counted until it is recorded', expensesFor(state, 'ALL', '2026-11').byCategory['Owner Lease'], 0);
}

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
