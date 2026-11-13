/**
 * Excel two-way sync round-trip test (run with: npx tsx scripts/test-excel-roundtrip.ts)
 * Exports the seeded state to .xlsx, reads it back, and asserts nothing important is lost.
 */
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import { emptyState, seedSampleState } from '../src/app/store/seed';
import { buildWorkbook } from '../src/modules/excel-sync/export';
import { applyWorkbook } from '../src/modules/excel-sync/import';
import { loadXlsx } from '../src/modules/excel-sync/xlsx-lazy';
import { defaulters, pnlFor, refundableAdvanceHeld, rentCollected } from '../src/app/store/selectors';
import { rentLedger } from '../src/entities/member/rent';
import type { AppState, Member } from '../src/app/store/types';
import { currentMonthKey } from '../src/shared/lib/dates';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

const state = seedSampleState();

// --- live-app contract (owner decision, 12 Nov 2026: fresh installs carry NO sample
// members or staff, and no transaction rows at all) ---
const key = currentMonthKey();
check('live active members', state.members.filter((m) => m.status === 'active').length, 0);
check('live vacated members', state.members.filter((m) => m.status === 'vacated').length, 0);
check('live staff', state.staff.length, 0);
check('live rooms total', state.rooms.length, 48);
check('PG1 rooms', state.rooms.filter((r) => r.branch === 'PG1').length, 12);
check('PG2 rooms', state.rooms.filter((r) => r.branch === 'PG2').length, 10);
check('PG3 rooms', state.rooms.filter((r) => r.branch === 'PG3').length, 10);
check('PG4 rooms', state.rooms.filter((r) => r.branch === 'PG4').length, 16);
check('PG1 EB meters', state.ebMeters.filter((m) => m.branch === 'PG1').length, 7);
check('PG2 EB meters', state.ebMeters.filter((m) => m.branch === 'PG2').length, 4);
check('PG3 EB meters', state.ebMeters.filter((m) => m.branch === 'PG3').length, 3);
check('PG4 EB meters', state.ebMeters.filter((m) => m.branch === 'PG4').length, 0);
check('Wi-Fi connections', state.wifi.length, 14);
check('provision chips', state.provisionChips.length, 11);
check('defaulters count', defaulters(state, 'ALL').length, 0);
check('pending rent total', defaulters(state, 'ALL').reduce((n, d) => n + d.balance, 0), 0);
check('refundable advance held', refundableAdvanceHeld(state, 'ALL'), 0);
check('aadhaar privacy (no numeric IDs)', state.members.every((m) => m.govtId === '[Aadhaar Redacted]'), true);
check('the demo fixture carries expenses', pnlFor(state, 'ALL', key).expenses.total > 0, true);
check('the live app starts with zero expenses', pnlFor(emptyState(), 'ALL', key).expenses.total, 0);

// --- export to .xlsx (same bytes the browser download produces) ---
await loadXlsx(); // SheetJS is lazy-loaded in the app; the test primes it here
const wb = buildWorkbook(state);
const xlsxBytes = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
console.log(`\nWorkbook tabs (${wb.SheetNames.length}): ${wb.SheetNames.join(', ')}`);
console.log(`File size: ${xlsxBytes.length} bytes\n`);

// --- import back ---
const wbRead = XLSX.read(xlsxBytes, { type: 'buffer' });
const restored = applyWorkbook(wbRead, seedSampleState());

check('restored members', restored.members.length, state.members.length);
check('restored active members', restored.members.filter((m) => m.status === 'active').length, 0);
check('restored vacated members', restored.members.filter((m) => m.status === 'vacated').length, 0);
check('restored rooms', restored.rooms.length, 48);
check('restored rent payments', restored.members.reduce((n, m) => n + m.payments.length, 0), state.members.reduce((n, m) => n + m.payments.length, 0));
check('restored defaulters', defaulters(restored, 'ALL').length, 0);
check('restored pending rent', defaulters(restored, 'ALL').reduce((n, d) => n + d.balance, 0), 0);
check('restored wifi', restored.wifi.length, 14);
check('restored wifi passwords preserved', restored.wifi.map((w) => w.password).join(), state.wifi.map((w) => w.password).join());
check('restored wifi expiries', restored.wifi.map((w) => w.expiryDate).join(), state.wifi.map((w) => w.expiryDate).join());
check('restored water cans', restored.waterCans.length, state.waterCans.length);
check('restored can rate', restored.canRate, 20);
check('restored tankers', restored.waterTankers.length, state.waterTankers.length);
check('restored eb meters', restored.ebMeters.length, 14);
check('restored eb bills', restored.ebBills.length, state.ebBills.length);
check('restored lease', restored.leasePayments.length, state.leasePayments.length);
check('restored catering', restored.catering.length, state.catering.length);
check('restored staff', restored.staff.length, 0);
check('restored staff advances', restored.staffAdvances.length, state.staffAdvances.length);
check('restored staff payouts', restored.staffPayouts.length, state.staffPayouts.length);
check('restored provision chips', restored.provisionChips.length, 11);
check('restored provision expenses', restored.provisionExpenses.length, state.provisionExpenses.length);
check('restored maintenance revenue', restored.maintenance.length, state.maintenance.length);
check('restored advances sum', restored.members.reduce((n, m) => n + m.advance.amount, 0), state.members.reduce((n, m) => n + m.advance.amount, 0));
check('restored aadhaar privacy', restored.members.every((m) => m.govtId === '[Aadhaar Redacted]'), true);
check('restored revenue equal', pnlFor(restored, 'ALL', key).revenue, pnlFor(state, 'ALL', key).revenue);
check('restored expenses equal', pnlFor(restored, 'ALL', key).expenses.total, pnlFor(state, 'ALL', key).expenses.total);

// --- Part B: member fidelity against the owner's own backup file -----------------
// The seed ships without members (owner decision, 12 Nov 2026), so member
// import/export is verified against the exported sample dataset kept at the
// project root. Skips with a note if that file is moved.
const BACKUP = 'GoldenNest_PG_Backup_2026-11-11.xlsx';
if (fs.existsSync(BACKUP)) {
  console.log(`\nBackup fixture roundtrip: ${BACKUP}`);
  const fixture = applyWorkbook(XLSX.read(fs.readFileSync(BACKUP), { type: 'buffer' }), seedSampleState());
  // The arrears are measured against a fixed date so the numbers do not move
  // as the calendar advances. They are the arrears implied by each member's
  // joining date — every month from the joining date is claimed, whether or
  // not a payment was ever recorded for it (the old figure of 5 defaulters /
  // ₹28,000 came from the anchor bug that hid every unpaid earlier month).
  const AS_OF = '2026-11-13';
  check('fixture active members', fixture.members.filter((m) => m.status === 'active').length, 14);
  check('fixture vacated members', fixture.members.filter((m) => m.status === 'vacated').length, 2);
  check('fixture staff', fixture.staff.length, 5);
  check('fixture defaulters', defaulters(fixture, 'ALL', AS_OF).length, 13);
  check('fixture pending rent', defaulters(fixture, 'ALL', AS_OF).reduce((n, d) => n + d.balance, 0), 542500);
  check('fixture refundable advance held', refundableAdvanceHeld(fixture, 'ALL'), 118500);
  check('fixture settlement refund (Rakesh)', fixture.members.find((m) => m.name === 'Rakesh Pandey')?.settlement?.refund, 7500);
  check('fixture aadhaar privacy', fixture.members.every((m) => m.govtId === '[Aadhaar Redacted]'), true);
  // Money already collected stays in the month it was collected, even when the
  // member has since left the PG.
  check('fixture October rent collected', rentCollected(fixture, 'ALL', '2026-10').total, 37500);
  check('fixture November rent collected', rentCollected(fixture, 'ALL', '2026-11').total, 72000);

  // write it back out and re-import: member data must survive the full trip
  const tripBytes = XLSX.write(buildWorkbook(fixture), { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  const trip = applyWorkbook(XLSX.read(tripBytes, { type: 'buffer' }), seedSampleState());
  check('trip members', trip.members.length, fixture.members.length);
  check('trip rent payments', trip.members.reduce((n, m) => n + m.payments.length, 0), fixture.members.reduce((n, m) => n + m.payments.length, 0));
  check('trip defaulters', defaulters(trip, 'ALL', AS_OF).length, 13);
  check('trip pending rent', defaulters(trip, 'ALL', AS_OF).reduce((n, d) => n + d.balance, 0), 542500);
  check('trip October rent collected', rentCollected(trip, 'ALL', '2026-10').total, 37500);
  check('trip settlement refund (Rakesh)', trip.members.find((m) => m.name === 'Rakesh Pandey')?.settlement?.refund, 7500);
  check('trip staff', trip.staff.length, 5);
} else {
  console.log(`\nSKIPPED: backup fixture ${BACKUP} not found — member roundtrip not verified.`);
}

// --- Part C: rent rate history survives the round-trip ----------------------------
// A member whose rent was raised mid-stay must come back from Excel with both
// rates and their dates, otherwise the restore would re-price the past.
{
  const base = seedSampleState();
  const member: Member = {
    id: 'mem_rent_history',
    name: 'Ravi',
    occupation: 'Student',
    mobile: '9845000001',
    govtId: '[Aadhaar Redacted]',
    homeAddress: '',
    branch: 'PG1',
    floor: 'Ground',
    roomCode: 'G1',
    bedIndex: 1,
    billingType: 'monthly',
    startDate: '2026-05-01',
    monthlyRent: 8000,
    rentHistory: [
      { fromDate: '2026-05-01', amount: 5000 },
      { fromDate: '2026-11-01', amount: 8000 },
    ],
    advance: { amount: 0, mode: 'Cash', cash: 0, upi: 0, card: 0, date: '2026-05-01' },
    payments: [],
    status: 'active',
  };
  const withHistory: AppState = { ...base, members: [member] };
  const bytes = XLSX.write(buildWorkbook(withHistory), { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  const restored = applyWorkbook(XLSX.read(bytes, { type: 'buffer' }), base);
  const rm = restored.members.find((m) => m.id === 'mem_rent_history');
  check('rent history restored', rm?.rentHistory?.length, 2);
  check('old rate restored', rm?.rentHistory?.[0].amount, 5000);
  check('old rate date restored', rm?.rentHistory?.[0].fromDate, '2026-05-01');
  check('new rate restored', rm?.rentHistory?.[1].amount, 8000);
  check('current rent restored', rm?.monthlyRent, 8000);
  const ledger = rm ? rentLedger(rm, '2026-11-20') : [];
  check('the first cycle still costs the old rate', ledger.find((r) => r.cycleKey === '2026-05-01')?.due, 5000);
  check('the November cycle costs the new rate', ledger.find((r) => r.cycleKey === '2026-11-01')?.due, 8000);
}

// --- Part D: a voided payment survives the round-trip -----------------------------
// A reversed payment must come back from Excel as voided — never as live money.
{
  const base = seedSampleState();
  const member: Member = {
    id: 'mem_void',
    name: 'Anil',
    occupation: 'Student',
    mobile: '9845000002',
    govtId: '[Aadhaar Redacted]',
    homeAddress: '',
    branch: 'PG1',
    floor: 'Ground',
    roomCode: 'G1',
    bedIndex: 1,
    billingType: 'monthly',
    startDate: '2026-10-18',
    monthlyRent: 5000,
    advance: { amount: 0, mode: 'Cash', cash: 0, upi: 0, card: 0, date: '2026-10-18' },
    payments: [
      { id: 'pay_void', date: '2026-10-20', cycleKey: '2026-10-18', cash: 8500, upi: 0, card: 0, voidedAt: '2026-10-26', voidReason: 'Typed 8,500 instead of 5,800' },
      { id: 'pay_live', date: '2026-10-21', cycleKey: '2026-10-18', cash: 5000, upi: 0, card: 0 },
    ],
    status: 'active',
  };
  const withVoid: AppState = { ...base, members: [member] };
  const bytes = XLSX.write(buildWorkbook(withVoid), { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  const restored = applyWorkbook(XLSX.read(bytes, { type: 'buffer' }), base);
  const rm = restored.members.find((m) => m.id === 'mem_void');
  check('both payment records restored', rm?.payments.length, 2);
  const v = rm?.payments.find((p) => p.id === 'pay_void');
  check('the void date restored', v?.voidedAt, '2026-10-26');
  check('the void reason restored', v?.voidReason, 'Typed 8,500 instead of 5,800');
  const live = rm?.payments.find((p) => p.id === 'pay_live');
  check('the live payment is still live', live?.voidedAt, undefined);
  check('only the live payment counts', rentCollected({ ...base, members: [rm!] }, 'ALL', '2026-10').total, 5000);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
