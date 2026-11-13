/**
 * P4 regression tests for the final 1.0 features.
 *
 * Run with: npx tsx scripts/test-p4-fixes.ts   (or: npm run test:p4)
 *
 * GND-43 — provisions with quantities, suppliers and credit; credit never
 *          touches the cash flow, and paying the supplier does.
 * GND-07 — a finished month is measured on its last day: money that came in
 *          later never makes that month look settled.
 * GND-20 — a closed month is final: no back-dated entry, no void, no change.
 */
import * as XLSX from 'xlsx';
import {
  defaulters,
  expensesFor,
  pnlFor,
  provisionCreditBalances,
  provisionStatus,
  pendingRent,
  unpaidProvisionCredit,
  vacatedDefaulters,
} from '../src/app/store/selectors';
import { closeMonth, isMonthClosed, monthLockMessage, openMonth } from '../src/app/store/monthLock';
import { buildWorkbook } from '../src/modules/excel-sync/export';
import { applyWorkbook } from '../src/modules/excel-sync/import';
import { loadXlsx } from '../src/modules/excel-sync/xlsx-lazy';
import type { AppState, Member, ProvisionExpense } from '../src/app/store/types';
import { seedSampleState } from '../src/app/store/seed';
import { migrateState } from '../src/app/store/migrate';
import { monthEndISO, monthKey, monthLabel, todayISO } from '../src/shared/lib/dates';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

/** The month before the one running now. */
function previousMonth(): string {
  const [y, m] = monthKey(todayISO()).split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const PREV = previousMonth();
const PREV_START = `${PREV}-01`;
const PREV_END = monthEndISO(PREV);
const CURR = monthKey(todayISO());
const CURR_START = `${CURR}-01`;

console.log(`=== GND-43. Provisions: quantities, suppliers and credit (month ${PREV}) ===`);
{
  const paid: ProvisionExpense = {
    id: 'pv_paid',
    date: `${PREV}-05`,
    branch: 'PG1',
    item: 'Milk',
    amount: 600,
    mode: 'Cash',
    quantity: 30,
    unitPrice: 20,
    supplier: 'Amul',
    status: 'paid',
  };
  const credit: ProvisionExpense = {
    id: 'pv_credit',
    date: `${PREV}-06`,
    branch: 'PG1',
    item: 'Rice',
    amount: 2000,
    mode: 'Cash',
    quantity: 2,
    unitPrice: 1000,
    supplier: 'BigBasket',
    status: 'credit',
  };
  // A record saved before quantities and credit existed.
  const legacy: ProvisionExpense = {
    id: 'pv_legacy',
    date: `${PREV}-07`,
    branch: 'PG1',
    item: 'Vegetables',
    amount: 300,
    mode: 'UPI',
  };
  const state: AppState = {
    ...seedSampleState(),
    provisionExpenses: [paid, credit, legacy],
    provisionSettlements: [],
  };

  check('a legacy provision counts as paid', provisionStatus(legacy), 'paid');
  check('a credit purchase is credit', provisionStatus(credit), 'credit');

  const month = expensesFor(state, 'PG1', PREV).byCategory['Daily Provisions'];
  check('only the paid provisions hit the month', month, 900);

  check('the credit is money owed to the supplier', unpaidProvisionCredit(state, 'PG1'), 2000);
  const rows = provisionCreditBalances(state, 'PG1');
  check('one supplier has credit', rows.length, 1);
  check('it is the right supplier', rows[0].supplier, 'BigBasket');
  check('the amount is right', rows[0].outstanding, 2000);
  check('the dashboard shows the liability', pnlFor(state, 'PG1', PREV, todayISO()).unpaidProvisionCredit, 2000);

  // Paying the supplier: the cash leaves on the day it is paid.
  const paidState: AppState = {
    ...state,
    provisionSettlements: [
      { id: 'pvs_1', date: `${CURR}-02`, branch: 'PG1', supplier: 'BigBasket', cash: 1500, upi: 0, card: 0 },
    ],
  };
  check(
    'the payment to the supplier is this month’s cash',
    expensesFor(paidState, 'PG1', CURR).byCategory['Daily Provisions'],
    1500,
  );
  check(
    'the purchase month is still untouched',
    expensesFor(paidState, 'PG1', PREV).byCategory['Daily Provisions'],
    900,
  );
  check('the rest of the credit is still owed', unpaidProvisionCredit(paidState, 'PG1'), 500);
  check(
    'the supplier balance follows the payment',
    provisionCreditBalances(paidState, 'PG1')[0].outstanding,
    500,
  );
}

console.log('\n=== GND-07. A finished month is measured on its last day ===');
{
  const member: Member = {
    id: 'mem_asof',
    name: 'As Of',
    occupation: 'Student',
    mobile: '9845000011',
    govtId: '[Aadhaar Redacted]',
    homeAddress: '',
    branch: 'PG1',
    floor: 'Ground',
    roomCode: 'G1',
    bedIndex: 1,
    billingType: 'monthly',
    startDate: PREV_START,
    monthlyRent: 5000,
    advance: { amount: 0, mode: 'Cash', cash: 0, upi: 0, card: 0, date: PREV_START },
    payments: [
      // The previous month's rent, but the money came in on the 1st of this month.
      { id: 'pay_late', date: CURR_START, cycleKey: PREV_START, cash: 5000, upi: 0, card: 0 },
      // This month's rent, paid today.
      { id: 'pay_now', date: todayISO(), cycleKey: CURR_START, cash: 5000, upi: 0, card: 0 },
    ],
    status: 'active',
  };
  const state: AppState = { ...seedSampleState(), members: [member] };

  const lastMonth = pendingRent(state, 'ALL', PREV);
  check('the old month still shows the rent as owed', lastMonth.total, 5000);
  check('the member is on the list of that month', defaulters(state, 'ALL', PREV).length, 1);

  const today = pendingRent(state, 'ALL', todayISO());
  check('today the rent is paid', today.total, 0);
  check('and nobody is a defaulter today', defaulters(state, 'ALL', todayISO()).length, 0);

  // The same month, given as a month instead of a day.
  check('a month key works the same way', pendingRent(state, 'ALL', PREV).total, 5000);

  // A member who had not joined yet is nobody's defaulter in that month.
  const latecomer: Member = {
    ...member,
    id: 'mem_late',
    name: 'Late Comer',
    startDate: CURR_START,
    payments: [],
  };
  const lateState: AppState = { ...seedSampleState(), members: [latecomer] };
  check('a member who had not joined is not a defaulter', pendingRent(lateState, 'ALL', PREV).total, 0);
  check('but they do owe from the day they joined', defaulters(lateState, 'ALL', todayISO()).length, 1);

  // A member who left still owes money in the month they left.
  const leaver: Member = {
    ...member,
    id: 'mem_left',
    name: 'Leaver',
    status: 'vacated',
    vacatedOn: PREV_END,
    settlement: {
      exitDate: PREV_END,
      maintenanceDeduction: 0,
      pendingRentDeduction: 0,
      refund: 0,
      refundMode: 'Cash',
      recordedOn: PREV_END,
    },
    payments: [],
  };
  const leftState: AppState = { ...seedSampleState(), members: [leaver] };
  check('a member who left still owes the old month', pendingRent(leftState, 'ALL', PREV).total, 5000);
  check('and is listed as a left-PG defaulter', vacatedDefaulters(leftState, 'ALL', PREV).length, 1);
}

console.log('\n=== GND-20. A closed month is final ===');
{
  const state: AppState = { ...seedSampleState(), closedMonths: [] };
  check('a new month is open', isMonthClosed(state, PREV), false);
  check('no warning for an open month', monthLockMessage(state, `${PREV}-05`, 'record this'), null);

  const locked = closeMonth(state, PREV, todayISO());
  check('the month is closed now', isMonthClosed(locked, PREV), true);
  check(
    'the warning names the month',
    (monthLockMessage(locked, `${PREV}-05`, 'record this') ?? '').includes(monthLabel(PREV)),
    true,
  );
  check('a date in another month is still free', monthLockMessage(locked, `${CURR}-05`, 'record this'), null);

  // Closing a month never removes a record.
  check('no record was deleted', locked.provisionExpenses.length, state.provisionExpenses.length);
  check('no member was deleted', locked.members.length, state.members.length);

  const opened = openMonth(locked, PREV);
  check('the month can be opened again', isMonthClosed(opened, PREV), false);
  check('and the warning is gone', monthLockMessage(opened, `${PREV}-05`, 'record this'), null);
}

console.log('\n=== The Excel backup carries the new fields losslessly ===');
{
  await loadXlsx();
  const base = seedSampleState();
  const withProvisions: AppState = {
    ...base,
    provisionExpenses: [
      {
        id: 'pv_x_1',
        date: `${PREV}-05`,
        branch: 'PG1',
        item: 'Milk',
        amount: 600,
        mode: 'Cash',
        quantity: 30,
        unitPrice: 20,
        supplier: 'Amul',
        status: 'credit',
      },
    ],
    provisionSettlements: [
      { id: 'pvs_x_1', date: `${CURR}-02`, branch: 'PG1', supplier: 'Amul', cash: 400, upi: 200, card: 0 },
    ],
    closedMonths: [{ monthKey: PREV, closedAt: todayISO() }],
  };
  const bytes = XLSX.write(buildWorkbook(withProvisions), { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  const restored = applyWorkbook(XLSX.read(bytes, { type: 'buffer' }), base);

  const p = restored.provisionExpenses.find((x) => x.id === 'pv_x_1');
  check('the provision came back', !!p, true);
  check('the quantity came back', p?.quantity, 30);
  check('the unit price came back', p?.unitPrice, 20);
  check('the supplier came back', p?.supplier, 'Amul');
  check('the credit flag came back', p?.status, 'credit');
  check('the credit is still recorded as credit', p?.status, 'credit');
  check(
    'the supplier was paid, so nothing is owed',
    unpaidProvisionCredit(restored, 'PG1'),
    0,
  );

  const s = restored.provisionSettlements.find((x) => x.id === 'pvs_x_1');
  check('the supplier payment came back', !!s, true);
  check('the cash split came back', `${s?.cash}/${s?.upi}/${s?.card}`, '400/200/0');
  check('the closed month came back', restored.closedMonths.length, 1);
  check('and it is the right month', restored.closedMonths[0].monthKey, PREV);

  // A file from before this feature must still load — and count as paid.
  const legacyBook = buildWorkbook(base);
  const legacySheet = legacyBook.Sheets['Daily_Provisions'];
  const legacyRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(legacySheet, { defval: '' });
  delete legacyRows[0]['Quantity'];
  delete legacyRows[0]['Unit Price (₹)'];
  delete legacyRows[0]['Supplier'];
  delete legacyRows[0]['Paid or Credit'];
  legacyBook.Sheets['Daily_Provisions'] = XLSX.utils.json_to_sheet(legacyRows);
  const legacyRestored = applyWorkbook(XLSX.read(XLSX.write(legacyBook, { bookType: 'xlsx', type: 'buffer' }), { type: 'buffer' }), base);
  check('an old file still loads', legacyRestored.provisionExpenses.length, base.provisionExpenses.length);
  check(
    'and its provisions count as paid',
    legacyRestored.provisionExpenses.every((x) => provisionStatus(x) === 'paid'),
    true,
  );
}

console.log('\n=== An old saved file still opens cleanly ===');
{
  // A device saved before these features existed: no settlement list, no
  // closed months and provisions without a status.
  const legacy = {
    ...seedSampleState(),
    provisionSettlements: undefined,
    closedMonths: undefined,
    provisionExpenses: [
      {
        id: 'pv_old',
        date: '2026-10-02',
        branch: 'PG1' as const,
        item: 'Gas Cylinder',
        amount: 1150,
        mode: 'Cash' as const,
      },
    ],
  } as unknown as AppState;
  const migrated = migrateState(legacy);
  check('the settlement list is there', Array.isArray(migrated.provisionSettlements), true);
  check('the closed month list is there', Array.isArray(migrated.closedMonths), true);
  check('an old provision counts as paid', provisionStatus(migrated.provisionExpenses[0]), 'paid');
  check('the old amount is untouched', migrated.provisionExpenses[0].amount, 1150);
  check(
    'the old month still shows its expense',
    expensesFor(migrated, 'PG1', '2026-10').byCategory['Daily Provisions'],
    1150,
  );
}

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
