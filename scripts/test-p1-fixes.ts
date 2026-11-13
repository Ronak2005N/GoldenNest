/**
 * P1 regression tests for the rent-history and vacated-defaulter fixes.
 *
 * Run with: npx tsx scripts/test-p1-fixes.ts   (or: npm run test:p1)
 *
 * GND-06 — a rent change must never re-price the months before it. Every
 *          cycle keeps the rate that was in force when that cycle started.
 * GND-05 — a member who leaves owing money must stay visible as a receivable
 *          until it is settled, without being mixed into the reminders sent
 *          to members who are still staying.
 *
 * These tests describe the correct financial behaviour and must never be
 * weakened to make a build pass.
 */
import {
  rateForDate,
  currentRentRate,
  withRentChange,
  rentPosition,
  payableCycles,
  rentLedger,
} from '../src/entities/member/rent';
import { vacantBeds } from '../src/modules/members/ui/AddMemberModal';
import { applyWorkbook } from '../src/modules/excel-sync/import';
import { previewImport } from '../src/modules/excel-sync/preview';
import { buildWorkbook } from '../src/modules/excel-sync/export';
import { loadXlsx } from '../src/modules/excel-sync/xlsx-lazy';
import { seedSampleState } from '../src/app/store/seed';
import {
  defaulters,
  vacatedDefaulters,
  pendingRent,
  pnlFor,
  rentCollected,
} from '../src/app/store/selectors';
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

console.log('=== GND-06. A rent change keeps the price of the past ===');
{
  // Paid October at 5,000. Rent is raised to 8,000 from 1 November.
  const before = member('2026-10-18', 5000);
  before.payments.push({ id: uid('pay'), date: '2026-10-20', cycleKey: '2026-10-18', cash: 5000, upi: 0, card: 0 });
  const after = withRentChange(before, '2026-11-01', 8000);

  check('the current rate is the new one', currentRentRate(after, '2026-11-20'), 8000);
  check('the old rate applies to October', rateForDate(after, '2026-10-18'), 5000);
  check('the new rate applies to November', rateForDate(after, '2026-11-18'), 8000);

  const pos = rentPosition(after, '2026-11-20');
  const october = pos.ledger.find((r) => r.cycleKey === '2026-10-18');
  const november = pos.ledger.find((r) => r.cycleKey === '2026-11-18');
  check('October is still priced at 5,000', october?.due, 5000);
  check('October is still fully paid', october?.gap, 0);
  check('November is priced at 8,000', november?.due, 8000);
  check('November is unpaid', november?.gap, 8000);
  check('the total due is only the new month', pos.totalDue, 8000);
}
{
  // A member with no rent history (every member saved before this feature)
  // keeps exactly the behaviour they had: one rate for every cycle.
  const legacy = member('2026-10-18', 5000);
  check('legacy rate for October', rateForDate(legacy, '2026-10-18'), 5000);
  check('legacy rate for November', rateForDate(legacy, '2026-11-18'), 5000);
  check('legacy total due', rentPosition(legacy, '2026-11-20').totalDue, 10000);
}
{
  // The first change on a legacy member must not re-price their earlier
  // months: the old rate is recorded as the baseline from the joining date.
  const legacy = member('2026-05-01', 5000);
  const changed = withRentChange(legacy, '2026-11-01', 8000);
  check('baseline rate kept from the joining date', rateForDate(changed, '2026-05-01'), 5000);
  check('new rate from the change date', rateForDate(changed, '2026-11-01'), 8000);
  check('history has two entries', changed.rentHistory?.length, 2);
  check('history is oldest first', changed.rentHistory?.[0].fromDate, '2026-05-01');
  check('history ends with the new rate', changed.rentHistory?.[1].amount, 8000);
  const pos = rentPosition(changed, '2026-11-12');
  const may = pos.ledger.find((r) => r.cycleKey === '2026-05-01');
  check('May is still priced at 5,000', may?.due, 5000);
  check('May is unpaid', may?.gap, 5000);
}
{
  // A change can never start before the member joined.
  const m = member('2026-05-01', 5000);
  const changed = withRentChange(m, '2026-01-01', 8000);
  check('the change is clamped to the joining date', changed.rentHistory?.[0].fromDate, '2026-05-01');
  check('and the rate applies from there', rateForDate(changed, '2026-05-01'), 8000);
}
{
  // The record itself is never rewritten — the history is added alongside.
  const m = member('2026-10-18', 5000);
  const before = JSON.stringify(m);
  withRentChange(m, '2026-11-01', 8000);
  check('the original member record is untouched', JSON.stringify(m), before);
}

console.log('\n=== GND-05. Members who left with dues stay visible ===');
{
  // Stayed from May, paid only November, left on 2 November owing money.
  const left = member('2026-05-01', 5000, {
    id: 'mLeft',
    name: 'Rakesh',
    status: 'vacated',
    vacatedOn: '2026-11-02',
    settlement: {
      exitDate: '2026-11-02',
      maintenanceDeduction: 500,
      pendingRentDeduction: 0,
      refund: 7500,
      refundMode: 'Cash',
      recordedOn: '2026-11-02',
    },
  });
  left.payments.push({ id: uid('pay'), date: '2026-11-01', cycleKey: '2026-11-01', cash: 5000, upi: 0, card: 0 });
  const staying = member('2026-11-01', 7000, { id: 'mStay', name: 'Naveen' });
  staying.payments.push({ id: uid('pay'), date: '2026-11-05', cycleKey: '2026-11-01', cash: 7000, upi: 0, card: 0 });
  const state: AppState = { ...baseState(), members: [left, staying] };

  const leftRows = vacatedDefaulters(state, 'ALL', '2026-11-13');
  check('the departed member with dues is listed', leftRows.length, 1);
  check('it is the right member', leftRows[0].member.name, 'Rakesh');
  // Stayed 1 May to 2 November = 7 cycles of 5,000, one of them paid.
  check('the amount owed is shown', leftRows[0].due, 6 * 5000);
  check('the leaving date is shown', leftRows[0].leftOn, '2026-11-02');
  check('the refund given is shown', leftRows[0].refund, 7500);

  check('a settled departed member is not listed', (() => {
    const settled = member('2026-05-01', 5000, { status: 'vacated', vacatedOn: '2026-06-15' });
    for (const key of ['2026-05-01', '2026-06-01']) {
      settled.payments.push({ id: uid('pay'), date: key, cycleKey: key, cash: 5000, upi: 0, card: 0 });
    }
    const s2: AppState = { ...baseState(), members: [settled] };
    return vacatedDefaulters(s2, 'ALL', '2026-11-13').length;
  })(), 0);

  check('departed members are NOT in the staying defaulter list', defaulters(state, 'ALL', '2026-11-13').length, 0);
  check('the staying member is in the staying defaulter list', (() => {
    const owing = member('2026-11-01', 7000, { id: 'mStay', name: 'Naveen' });
    const s3: AppState = { ...baseState(), members: [owing] };
    return defaulters(s3, 'ALL', '2026-11-13').length;
  })(), 1);

  const owing = pendingRent(state, 'ALL', '2026-11-13');
  check('pending rent splits into staying and left', owing.staying + owing.left, owing.total);
  check('the departed dues are in the total', owing.left, 6 * 5000);
  check('the counts are reported', owing.leftCount, 1);
  check('the dashboard total includes the departed dues', pnlFor(state, 'ALL', '2026-11', '2026-11-13').pendingRent, 6 * 5000);
  check('the dashboard splits the two', pnlFor(state, 'ALL', '2026-11', '2026-11-13').pendingRentLeft, 6 * 5000);
}
{
  // A departed member who paid everything is not a defaulter.
  const clean = member('2026-05-01', 5000, { status: 'vacated', vacatedOn: '2026-06-15' });
  for (const key of ['2026-05-01', '2026-06-01']) {
    clean.payments.push({ id: uid('pay'), date: key, cycleKey: key, cash: 5000, upi: 0, card: 0 });
  }
  const state: AppState = { ...baseState(), members: [clean] };
  check('nothing pending for a settled departed member', vacatedDefaulters(state, 'ALL', '2026-11-13').length, 0);
  check('and the dashboard shows no pending rent', pnlFor(state, 'ALL', '2026-11', '2026-11-13').pendingRent, 0);
}
{
  // A departed member cannot be invoiced for a month they never lived in.
  const left = member('2026-05-01', 5000, { status: 'vacated', vacatedOn: '2026-06-15' });
  const cycles = payableCycles(left, '2026-11-13');
  check('no "next month" is offered to someone who has left', cycles.some((c) => c.kind === 'next'), false);
  check('only the months they stayed are offered', cycles.every((c) => c.cycleStart <= '2026-06-15'), true);
}
{
  // Settling the dues removes them from the list and puts the money into the
  // month it was received.
  const left = member('2026-05-01', 5000, { id: 'mLeft', status: 'vacated', vacatedOn: '2026-06-15' });
  const state: AppState = { ...baseState(), members: [left] };
  check('before settling', vacatedDefaulters(state, 'ALL', '2026-11-13')[0].due, 2 * 5000);
  const settled: Member = {
    ...left,
    payments: [
      { id: uid('pay'), date: '2026-11-20', cycleKey: '2026-05-01', cash: 5000, upi: 0, card: 0 },
      { id: uid('pay'), date: '2026-11-20', cycleKey: '2026-06-01', cash: 5000, upi: 0, card: 0 },
    ],
  };
  const state2: AppState = { ...baseState(), members: [settled] };
  check('after settling the dues are gone', vacatedDefaulters(state2, 'ALL', '2026-11-13').length, 0);
  check('and the money is counted in November revenue', rentCollected(state2, 'ALL', '2026-11').total, 10000);
}

console.log('\n=== The ledger keeps its price per cycle ===');
{
  const m = withRentChange(member('2026-10-18', 5000), '2026-11-01', 8000);
  const ledger = rentLedger(m, '2026-11-25');
  check('two cycles', ledger.length, 2);
  check('October priced at the old rate', ledger[0].due, 5000);
  check('November priced at the new rate', ledger[1].due, 8000);
}

console.log('\n=== GND-13. A wrong payment is voided, never deleted ===');
{
  // Paid ₹8,500 for October — the owner meant ₹5,800. The payment is voided.
  const m = member('2026-10-18', 5000);
  m.payments.push({ id: uid('pay'), date: '2026-10-20', cycleKey: '2026-10-18', cash: 8500, upi: 0, card: 0 });
  const before = rentPosition(m, '2026-10-25');
  check('October is paid', before.balance, 0);
  check('October shows as paid', before.status, 'paid');

  const voided: Member = {
    ...m,
    payments: m.payments.map((p) => ({ ...p, voidedAt: '2026-10-26', voidReason: 'Typed 8,500 instead of 5,800' })),
  };
  const after = rentPosition(voided, '2026-10-25');
  check('the rent goes back to unpaid', after.balance, 5000);
  check('the status is unpaid again', after.status, 'unpaid');
  check('the balance is the full rent', after.totalDue, 5000);
  check('the payment record is still there', voided.payments.length, 1);
  check('with the void date on it', voided.payments[0].voidedAt, '2026-10-26');
  check('and the reason', voided.payments[0].voidReason, 'Typed 8,500 instead of 5,800');
  check('the amount on the record is untouched', voided.payments[0].cash, 8500);
}
{
  // A voided payment leaves that month's revenue.
  const m = member('2026-10-18', 5000);
  m.payments.push({ id: uid('pay'), date: '2026-10-20', cycleKey: '2026-10-18', cash: 8500, upi: 0, card: 0 });
  const state: AppState = { ...baseState(), members: [m] };
  check('October revenue includes the payment', rentCollected(state, 'ALL', '2026-10').total, 8500);
  const voided: AppState = {
    ...baseState(),
    members: [{ ...m, payments: m.payments.map((p) => ({ ...p, voidedAt: '2026-10-26' })) }],
  };
  check('after voiding it is gone from the month', rentCollected(voided, 'ALL', '2026-10').total, 0);
  check('and other months are unaffected', rentCollected(voided, 'ALL', '2026-11').total, 0);
  check('the dashboard revenue follows', pnlFor(voided, 'ALL', '2026-10', '2026-10-31').rent.total, 0);
}
{
  // Voiding one payment does not touch the others.
  const m = member('2026-10-18', 5000);
  m.payments.push({ id: 'pay_a', date: '2026-10-20', cycleKey: '2026-10-18', cash: 3000, upi: 0, card: 0 });
  m.payments.push({ id: 'pay_b', date: '2026-10-22', cycleKey: '2026-10-18', cash: 2000, upi: 0, card: 0 });
  const voided: Member = {
    ...m,
    payments: m.payments.map((p) => (p.id === 'pay_a' ? { ...p, voidedAt: '2026-10-26' } : p)),
  };
  check('only the voided payment is ignored', rentPosition(voided, '2026-10-25').paid, 2000);
  check('the rest still counts', rentCollected({ ...baseState(), members: [voided] }, 'ALL', '2026-10').total, 2000);
}
{
  // A voided payment must not look like advance rent either.
  const m = member('2026-10-18', 5000);
  m.payments.push({ id: uid('pay'), date: '2026-11-15', cycleKey: '2026-11-18', cash: 5000, upi: 0, card: 0 });
  check('prepaid before voiding', rentPosition(m, '2026-11-15').prepaid, 5000);
  const voided: Member = {
    ...m,
    payments: m.payments.map((p) => ({ ...p, voidedAt: '2026-11-16' })),
  };
  check('prepaid after voiding', rentPosition(voided, '2026-11-15').prepaid, 0);
}

console.log('\n=== GND-38. Editing a member, moving a bed, fixing an old rent ===');
{
  // A member whose rent was never recorded (an old Excel row with an empty
  // "Monthly Rent" cell). Entering the rent prices their whole stay.
  const legacy = member('2026-06-01', 0, { id: 'mImran', status: 'vacated', vacatedOn: '2026-11-02' });
  legacy.monthlyRent = undefined;
  legacy.payments.push({ id: uid('pay'), date: '2026-11-01', cycleKey: '2026-11-01', cash: 6000, upi: 0, card: 0 });
  check('before the fix the rent is unknown', rentPosition(legacy, '2026-11-13').totalDue, 0);

  const fixed = withRentChange(legacy, '2026-06-01', 6000);
  check('the rent is recorded from the joining date', fixed.rentHistory?.length, 1);
  check('the rate is the one entered', fixed.rentHistory?.[0].amount, 6000);
  check('the whole stay is priced', fixed.rentHistory?.[0].fromDate, '2026-06-01');
  // Stayed 1 June to 2 November = 6 cycles of 6,000, one of them paid.
  check('their dues can now be calculated', rentPosition(fixed, '2026-11-13').totalDue, 5 * 6000);
  check('and they show up as a departed defaulter', vacatedDefaulters({ ...baseState(), members: [fixed] }, 'ALL', '2026-11-13').length, 1);
}
{
  // Moving a member to another bed frees the old bed immediately.
  const state = baseState();
  const rooms = [
    { id: 'r1', branch: 'PG1' as const, code: 'G1', floor: 'Ground' as const, sharing: 2 as const, ac: false, monthlyRent: 5000 },
    { id: 'r2', branch: 'PG1' as const, code: 'G2', floor: 'Ground' as const, sharing: 2 as const, ac: false, monthlyRent: 5000 },
  ];
  const mover = member('2026-10-18', 5000, { roomCode: 'G1', bedIndex: 1 });
  const withMember: AppState = { ...state, rooms, members: [mover] };
  check('the old bed is taken', vacantBeds(withMember, 'PG1', 'G1').includes(1), false);
  check('the other bed in the old room is free', vacantBeds(withMember, 'PG1', 'G1').includes(2), true);

  // The owner moves him to G2 bed 2.
  const moved: AppState = {
    ...withMember,
    members: [{ ...mover, roomCode: 'G2', bedIndex: 2 }],
  };
  check('after the move the old bed is free', vacantBeds(moved, 'PG1', 'G1').includes(1), true);
  check('and the new bed is taken', vacantBeds(moved, 'PG1', 'G2').includes(2), false);
  check('the room grid sees the member in the new room', moved.members[0].roomCode, 'G2');
}
{
  // Editing the rent of a member who is already priced keeps the past price.
  const m = member('2026-10-18', 5000);
  m.payments.push({ id: uid('pay'), date: '2026-10-20', cycleKey: '2026-10-18', cash: 5000, upi: 0, card: 0 });
  const edited = withRentChange(m, '2026-11-01', 8000);
  const pos = rentPosition(edited, '2026-11-20');
  check('October keeps its price', pos.ledger.find((r) => r.cycleKey === '2026-10-18')?.due, 5000);
  check('and stays paid', pos.ledger.find((r) => r.cycleKey === '2026-10-18')?.gap, 0);
  check('November is the new price', pos.ledger.find((r) => r.cycleKey === '2026-11-18')?.due, 8000);
  check('no phantom debt', pos.totalDue, 8000);
}

console.log('\n=== GND-03. An Excel import merges — it never deletes ===');
{
  await loadXlsx();
  const base = seedSampleState();
  const live = member('2026-09-01', 5000, { id: 'mA', name: 'Ravi', mobile: '9845000001' });
  const newer = member('2026-11-01', 7000, { id: 'mD', name: 'New Boy', mobile: '9845000004' });
  const device: AppState = { ...base, members: [live, newer] };

  // A workbook taken before "New Boy" was added.
  const wb = buildWorkbook({ ...base, members: [live] });
  const merged = applyWorkbook(wb, device);
  check('the member added after the file was made is kept', merged.members.some((m) => m.id === 'mD'), true);
  check('the member in the file is still there', merged.members.some((m) => m.id === 'mA'), true);
  check('nothing was deleted', merged.members.length, 2);
}
{
  // A member who left after the file was exported must not come back.
  const base = seedSampleState();
  const live = member('2026-09-01', 5000, { id: 'mA', name: 'Ravi' });
  const wb = buildWorkbook({ ...base, members: [live] });
  const afterVacate: AppState = {
    ...base,
    members: [{ ...live, status: 'vacated', vacatedOn: '2026-10-31' }],
  };
  const merged = applyWorkbook(wb, afterVacate);
  check('a member who left stays left after an import', merged.members[0].status, 'vacated');
  check('the leaving date is kept', merged.members[0].vacatedOn, '2026-10-31');
}
{
  // A payment that only exists on the device survives the import.
  const base = seedSampleState();
  const live = member('2026-09-01', 5000, { id: 'mA', name: 'Ravi' });
  live.payments.push({ id: 'pay_keep', date: '2026-10-05', cycleKey: '2026-09-01', cash: 5000, upi: 0, card: 0 });
  const wb = buildWorkbook({ ...base, members: [live] });
  const device: AppState = { ...base, members: [live] };
  const merged = applyWorkbook(wb, device);
  check('the payment is still there', merged.members[0].payments.length, 1);
  check('the payment keeps its id', merged.members[0].payments[0].id, 'pay_keep');
}
{
  // An old file cannot undo a void.
  const base = seedSampleState();
  const live = member('2026-09-01', 5000, { id: 'mA', name: 'Ravi' });
  live.payments.push({ id: 'pay_v', date: '2026-10-05', cycleKey: '2026-09-01', cash: 5000, upi: 0, card: 0 });
  const wb = buildWorkbook({ ...base, members: [live] });
  const voided: AppState = {
    ...base,
    members: [
      {
        ...live,
        payments: live.payments.map((p) => ({ ...p, voidedAt: '2026-10-20', voidReason: 'typed wrong' })),
      },
    ],
  };
  const merged = applyWorkbook(wb, voided);
  check('the void survives the import', merged.members[0].payments[0].voidedAt, '2026-10-20');
  check('and the payment still counts for nothing', rentPosition(merged.members[0], '2026-10-25').balance, 5000);
}
{
  // Importing the same file twice must not duplicate anything.
  const base = seedSampleState();
  const live = member('2026-09-01', 5000, { id: 'mA', name: 'Ravi' });
  live.payments.push({ id: 'pay_1', date: '2026-10-05', cycleKey: '2026-09-01', cash: 5000, upi: 0, card: 0 });
  const withMember: AppState = { ...base, members: [live] };
  const wb = buildWorkbook(withMember);
  const once = applyWorkbook(wb, withMember);
  const twice = applyWorkbook(wb, once);
  check('members are not duplicated', twice.members.length, once.members.length);
  check('payments are not duplicated', twice.members[0].payments.length, once.members[0].payments.length);
  check('water cans are not duplicated', twice.waterCans.length, once.waterCans.length);
  check('wifi connections are not duplicated', twice.wifi.length, once.wifi.length);
  check('staff advances are not duplicated', twice.staffAdvances.length, once.staffAdvances.length);
}
{
  // The preview tells the owner what will happen — and that nothing is deleted.
  const base = seedSampleState();
  const live = member('2026-09-01', 5000, { id: 'mA', name: 'Ravi' });
  const extra = member('2026-10-01', 6000, { id: 'mE', name: 'Anil' });
  // The file has a member the device has never seen; the device has one the
  // file does not mention.
  const wb = buildWorkbook({ ...base, members: [live, extra] });
  const device: AppState = {
    ...base,
    members: [live, member('2026-11-01', 7000, { id: 'mD', name: 'New Boy' })],
  };
  const preview = previewImport(device, wb);
  check('nothing will be deleted', preview.deleted, 0);
  check('the member only on the device is counted as kept', preview.kept >= 1, true);
  check('the new member in the file is counted as added', preview.added >= 1, true);
  check('the preview mentions members', preview.lines.some((l) => l.label === 'Members'), true);
}

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
