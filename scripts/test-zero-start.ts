/**
 * The zero start.
 *
 * Run with: npx tsx scripts/test-zero-start.ts   (or: npm run test:zero)
 *
 * A brand-new device — and the "Start From Zero" button — must leave the app
 * with nothing in it: zero net profit, no members, nobody who has left,
 * nothing paid, nothing unpaid. The setup (rooms, EB meters, Wi-Fi
 * connections, the item buttons) stays, so the app is ready to use at once.
 */
import {
  defaulters,
  expensesFor,
  pnlFor,
  pendingRent,
  provisionCreditBalances,
  rentCollected,
  unpaidEbBills,
  unpaidWaterBills,
  vacatedDefaulters,
} from '../src/app/store/selectors';
import { emptyState, seedSampleState } from '../src/app/store/seed';
import { migrateState } from '../src/app/store/migrate';
import { zeroedState } from '../src/app/store/zero';
import type { AppState } from '../src/app/store/types';
import { currentMonthKey } from '../src/shared/lib/dates';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

const key = currentMonthKey();
const zero = emptyState();

console.log('=== A brand-new device starts with nothing in it ===');
{
  check('net profit is zero', pnlFor(zero, 'ALL', key).net, 0);
  check('revenue is zero', pnlFor(zero, 'ALL', key).revenue, 0);
  check('total expenses are zero', expensesFor(zero, 'ALL', key).total, 0);
  check('every expense line is zero', Object.values(expensesFor(zero, 'ALL', key).byCategory).every((v) => v === 0), true);
  check('no rent was collected', rentCollected(zero, 'ALL', key).total, 0);
  check('no member is on the list', zero.members.length, 0);
  check('nobody owes rent', pendingRent(zero, 'ALL').total, 0);
  check('there are no defaulters', defaulters(zero, 'ALL').length, 0);
  check('nobody who has left owes anything', vacatedDefaulters(zero, 'ALL').length, 0);
  check('no electricity is owed', unpaidEbBills(zero, 'ALL', key).total, 0);
  check('no water is owed', unpaidWaterBills(zero, 'ALL', key).total, 0);
  check('no supplier credit is outstanding', provisionCreditBalances(zero, 'ALL').length, 0);
  check('no staff', zero.staff.length, 0);
  check('no staff advances', zero.staffAdvances.length, 0);
  check('no staff payouts', zero.staffPayouts.length, 0);
  check('no water cans', zero.waterCans.length, 0);
  check('no can settlements', zero.canSettlements.length, 0);
  check('no tankers', zero.waterTankers.length, 0);
  check('no EB bills', zero.ebBills.length, 0);
  check('no lease payments', zero.leasePayments.length, 0);
  check('no catering', zero.catering.length, 0);
  check('no Wi-Fi recharges', zero.wifiRecharges.length, 0);
  check('no provisions', zero.provisionExpenses.length, 0);
  check('no supplier payments', zero.provisionSettlements.length, 0);
  check('no closed months', zero.closedMonths.length, 0);
  check('no maintenance collected', zero.maintenance.length, 0);
}

console.log('\n=== The setup survives, so the app is ready to use ===');
{
  check('the rooms are there', zero.rooms.length, 48);
  check('the EB meters are there', zero.ebMeters.length, 14);
  check('the Wi-Fi connections are there', zero.wifi.length, 14);
  check('the item buttons are there', zero.provisionChips.length, 11);
  check('the can rate is there', zero.canRate, 20);
}

console.log('\n=== “Start From Zero” clears the data and keeps the setup ===');
{
  const used: AppState = {
    ...seedSampleState(),
    members: [
      {
        id: 'm1',
        name: 'Ravi',
        occupation: 'Student',
        mobile: '9845000011',
        govtId: '[Aadhaar Redacted]',
        homeAddress: '',
        branch: 'PG1',
        floor: 'Ground',
        roomCode: 'G1',
        bedIndex: 1,
        billingType: 'monthly',
        startDate: '2026-10-18',
        monthlyRent: 6000,
        advance: { amount: 2000, mode: 'Cash', cash: 2000, upi: 0, card: 0, date: '2026-10-18' },
        payments: [
          { id: 'p1', date: '2026-11-02', cycleKey: '2026-10-18', cash: 6000, upi: 0, card: 0 },
        ],
        status: 'active',
      },
    ],
    wifi: [
      {
        id: 'w_owner',
        label: 'My own Wi-Fi',
        branch: 'PG1',
        ssid: 'OWNER_SSID',
        password: 'OWNER_PASSWORD',
        monthlyAmount: 799,
        expiryDate: '2026-12-01',
      },
    ],
    closedMonths: [{ monthKey: '2026-10', closedAt: '2026-11-01' }],
  };

  const cleared = zeroedState(used);
  check('the member is gone', cleared.members.length, 0);
  check('the payment is gone with them', cleared.members.every((m) => m.payments.length === 0), true);
  check('pending rent is zero', pendingRent(cleared, 'ALL').total, 0);
  check('the net profit is zero', pnlFor(cleared, 'ALL', key).net, 0);
  check('the expenses are zero', expensesFor(cleared, 'ALL', key).total, 0);
  check('the closed month is gone', cleared.closedMonths.length, 0);
  check('the demo water rows are gone', cleared.waterCans.length, 0);
  check('the demo lease is gone', cleared.leasePayments.length, 0);
  check('the demo provisions are gone', cleared.provisionExpenses.length, 0);

  check("the owner's own Wi-Fi connection is kept", cleared.wifi.some((w) => w.id === 'w_owner'), true);
  check('its password is untouched', cleared.wifi.find((w) => w.id === 'w_owner')?.password, 'OWNER_PASSWORD');
  check('the rooms are kept', cleared.rooms.length, used.rooms.length);
  check('the EB meters are kept', cleared.ebMeters.length, used.ebMeters.length);
  check('the item buttons are kept', cleared.provisionChips.length, used.provisionChips.length);
}

console.log('\n=== An existing browser is moved to empty books ===');
{
  // The old browser file may contain the demo rows that were visible before.
  // The one-time move must keep only the setup and clear every rupee.
  const legacy = migrateState(seedSampleState());
  const cleared = zeroedState(legacy);
  check('the old demo expenses are cleared', expensesFor(cleared, 'ALL', key).total, 0);
  check('the old demo provisions are cleared', cleared.provisionExpenses.length, 0);
  check('the old demo EB bills are cleared', cleared.ebBills.length, 0);
  check('the old demo leases are cleared', cleared.leasePayments.length, 0);
  check('the old demo catering is cleared', cleared.catering.length, 0);
  check('the setup is carried across', cleared.rooms.length, legacy.rooms.length);
  check('the Wi-Fi setup is carried across', cleared.wifi.length, legacy.wifi.length);
}

console.log('\n=== Every PG and every month is empty after the clear ===');
{
  // The owner's own backup: real members, payments, expenses in several months.
  const used = seedSampleState();
  const withEverything: AppState = {
    ...used,
    members: [
      {
        id: 'm1',
        name: 'Ravi',
        occupation: 'Student',
        mobile: '9845000011',
        govtId: '[Aadhaar Redacted]',
        homeAddress: '',
        branch: 'PG1',
        floor: 'Ground',
        roomCode: 'G1',
        bedIndex: 1,
        billingType: 'monthly',
        startDate: '2026-09-18',
        monthlyRent: 6000,
        advance: { amount: 2000, mode: 'Cash', cash: 2000, upi: 0, card: 0, date: '2026-09-18' },
        payments: [
          { id: 'p1', date: '2026-10-02', cycleKey: '2026-10-18', cash: 6000, upi: 0, card: 0, branch: 'PG1' },
          { id: 'p2', date: '2026-11-02', cycleKey: '2026-11-18', cash: 6000, upi: 0, card: 0, branch: 'PG1' },
        ],
        status: 'active',
      },
    ],
  };
  const cleared = zeroedState(withEverything);

  const months: string[] = [];
  for (let i = 0; i < 24; i += 1) {
    const d = new Date(2026, 10 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const branches = ['ALL', 'PG1', 'PG2', 'PG3', 'PG4'] as const;

  let dirty = 0;
  for (const m of months) {
    for (const b of branches) {
      const p = pnlFor(cleared, b, m);
      if (p.revenue !== 0 || p.expenses.total !== 0 || p.net !== 0) {
        dirty += 1;
        console.log(`   ${m} ${b}: revenue=${p.revenue} expenses=${p.expenses.total}`);
      }
    }
  }
  check('no PG and no month has revenue or expenses left', dirty, 0);
  check('the pending rent is zero everywhere', pendingRent(cleared, 'ALL').total, 0);
  check('the unpaid electricity is zero', unpaidEbBills(cleared, 'ALL', key).total, 0);
  check('the unpaid water is zero', unpaidWaterBills(cleared, 'ALL', key).total, 0);
  check('there is no supplier credit left', provisionCreditBalances(cleared, 'ALL').length, 0);
  check('no member is left', cleared.members.length, 0);
  check('no staff is left', cleared.staff.length, 0);
  check('no water can row is left', cleared.waterCans.length, 0);
  check('no EB bill is left', cleared.ebBills.length, 0);
  check('no lease payment is left', cleared.leasePayments.length, 0);
  check('no catering row is left', cleared.catering.length, 0);
  check('no Wi-Fi recharge is left', cleared.wifiRecharges.length, 0);
  check('no provision row is left', cleared.provisionExpenses.length, 0);
  check('no closed month is left', cleared.closedMonths.length, 0);
  check('the setup is still there', cleared.rooms.length, 48);
}

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
