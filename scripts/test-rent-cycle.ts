/**
 * Rent-cycle model tests (run with: npx tsx scripts/test-rent-cycle.ts)
 *
 * Checks the rule the owner asked about: "if a person pays the full amount for
 * the month and it becomes the next month, how does the app know?" — plus the
 * carry-forward, old-debt and pay-in-advance behaviour.
 */
import { rentPosition, payableCycles, cycleAt, rentLedger } from '../src/entities/member/rent';
import type { Member, RentPayment } from '../src/app/store/types';
import { uid } from '../src/shared/lib/format';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

function member(startDate: string, monthlyRent: number): Member {
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
  };
}

function pay(m: Member, cycleKey: string, amount: number, date: string): Member {
  const p: RentPayment = { id: uid('pay'), date, cycleKey, cash: amount, upi: 0, card: 0 };
  return { ...m, payments: [...m.payments, p] };
}

console.log('--- 1. Month rolls over, a fully paid member becomes due again ---');
{
  const m = member('2026-10-18', 5000);
  const paid = pay(m, '2026-10-18', 5000, '2026-10-20');
  check('paid in October', rentPosition(paid, '2026-10-20').status, 'paid');
  check('paid in October — balance', rentPosition(paid, '2026-10-20').balance, 0);
  check('on 17 Nov still paid', rentPosition(paid, '2026-11-17').status, 'paid');
  const nov = rentPosition(paid, '2026-11-18');
  check('on 18 Nov cycle starts', nov.cycleStart, '2026-11-18');
  check('on 18 Nov balance is the full rent', nov.balance, 5000);
  check('on 18 Nov status', nov.status, 'unpaid');
}

console.log('\n--- 2. Extra money carries over to the next month by itself ---');
{
  const m = member('2026-10-18', 5000);
  const paid = pay(m, '2026-10-18', 7000, '2026-10-20');
  const oct = rentPosition(paid, '2026-10-25');
  check('October rent fully settled', oct.balance, 0);
  check('October credit held', oct.credit, 2000);
  const nov = rentPosition(paid, '2026-11-18');
  check('November credit applied automatically', nov.paid, 2000);
  check('November remaining balance', nov.balance, 3000);
  check('November credit left over', nov.credit, 0);
  check('November status', nov.status, 'partial');
}

console.log('\n--- 3. Unpaid rent from an older month is not forgotten ---');
{
  // The owner recorded the June payment, then nothing since. Every month
  // from June onwards is therefore known to the app and its arrears count.
  const m = member('2026-06-18', 5000);
  const withJune = pay(m, '2026-06-18', 5000, '2026-06-20');
  const nov = rentPosition(withJune, '2026-11-20');
  check('November balance', nov.balance, 5000);
  check('older months unpaid', nov.olderDue, 20000);
  check('total due', nov.totalDue, 25000);
  check('status is not "paid"', nov.status !== 'paid', true);
}

console.log('\n--- 3b. Arrears are claimed from the joining date, not from the first payment ---');
{
  // Joined on 1 May and never paid. The bed was occupied from 1 May, so every
  // month from May onwards is owed. A missing payment record means "not
  // written down yet", never "this month was free" — and the app must never
  // invent a debt for a month before the member was even in the PG.
  const m = member('2026-05-01', 8500);
  const nov = rentPosition(m, '2026-11-12');
  check('current month is claimed', nov.balance, 8500);
  check('older months claimed', nov.olderDue, 51000);
  check('total due', nov.totalDue, 59500);
  check('status is not "paid"', nov.status !== 'paid', true);
  check('ledger starts at the joining date', rentLedger(m, '2026-11-12')[0].cycleStart, '2026-05-01');
}

console.log('\n--- 4. The owner can record money for next month in advance ---');
{
  const m = member('2026-10-18', 5000);
  const nextKey = cycleAt(m, 1, '2026-11-15').cycleKey;
  const paid = pay(m, nextKey, 5000, '2026-11-15');
  check('next month is prepaid', rentPosition(paid, '2026-11-15').prepaid, 5000);
  check('current month is still due', rentPosition(paid, '2026-11-15').balance, 5000);
  const dec = rentPosition(paid, '2026-11-18');
  check('when next month starts it is settled', dec.balance, 0);
  check('but October is still owed', dec.olderDue, 5000);
  check('total still owing', dec.totalDue, 5000);
}

console.log('\n--- 5. The payment screen offers the months that are open ---');
{
  const m = member('2026-06-18', 5000);
  const anchored = pay(m, '2026-06-18', 5000, '2026-06-20');
  const cycles = payableCycles(anchored, '2026-11-20');
  check('older open month is offered', cycles.some((c) => c.kind === 'older'), true);
  check('current month is offered', cycles.some((c) => c.kind === 'current'), true);
  check('next month is offered', cycles.some((c) => c.kind === 'next'), true);
}
console.log('\n--- 6. Paying an old month clears the old debt ---');
{
  const m = member('2026-10-18', 5000);
  // A June payment anchors the ledger, so October is a known open month.
  const anchored = pay(m, '2026-10-18', 5000, '2026-11-20');
  const pos = rentPosition(anchored, '2026-11-20');
  check('older months unpaid now', pos.olderDue, 0);
  check('current month still due', pos.balance, 5000);
  check('total due', pos.totalDue, 5000);
}

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
