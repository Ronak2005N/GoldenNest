/**
 * Excel two-way sync round-trip test (run with: npx tsx scripts/test-excel-roundtrip.ts)
 * Exports the seeded state to .xlsx, reads it back, and asserts nothing important is lost.
 */
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import { seedSampleState } from '../src/app/store/seed';
import { buildWorkbook } from '../src/modules/excel-sync/export';
import { applyWorkbook } from '../src/modules/excel-sync/import';
import { loadXlsx } from '../src/modules/excel-sync/xlsx-lazy';
import { defaulters, pnlFor, refundableAdvanceHeld } from '../src/app/store/selectors';
import { currentMonthKey } from '../src/shared/lib/dates';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

const state = seedSampleState();

// --- seed contract (owner decision, 12 Nov 2026: fresh installs carry NO sample
// members or staff; rooms, Wi-Fi, water, EB, lease, catering and provision rows
// stay so the screens still demonstrate themselves) ---
const key = currentMonthKey();
check('seed active members', state.members.filter((m) => m.status === 'active').length, 0);
check('seed vacated members', state.members.filter((m) => m.status === 'vacated').length, 0);
check('seed staff', state.staff.length, 0);
check('seed rooms total', state.rooms.length, 48);
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
check('PnL runs (seed still carries expenses)', pnlFor(state, 'ALL', key).expenses.total > 0, true);

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
  check('fixture active members', fixture.members.filter((m) => m.status === 'active').length, 14);
  check('fixture vacated members', fixture.members.filter((m) => m.status === 'vacated').length, 2);
  check('fixture staff', fixture.staff.length, 5);
  check('fixture defaulters', defaulters(fixture, 'ALL').length, 5);
  check('fixture pending rent', defaulters(fixture, 'ALL').reduce((n, d) => n + d.balance, 0), 28000);
  check('fixture refundable advance held', refundableAdvanceHeld(fixture, 'ALL'), 118500);
  check('fixture settlement refund (Rakesh)', fixture.members.find((m) => m.name === 'Rakesh Pandey')?.settlement?.refund, 7500);
  check('fixture aadhaar privacy', fixture.members.every((m) => m.govtId === '[Aadhaar Redacted]'), true);

  // write it back out and re-import: member data must survive the full trip
  const tripBytes = XLSX.write(buildWorkbook(fixture), { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  const trip = applyWorkbook(XLSX.read(tripBytes, { type: 'buffer' }), seedSampleState());
  check('trip members', trip.members.length, fixture.members.length);
  check('trip rent payments', trip.members.reduce((n, m) => n + m.payments.length, 0), fixture.members.reduce((n, m) => n + m.payments.length, 0));
  check('trip defaulters', defaulters(trip, 'ALL').length, 5);
  check('trip pending rent', defaulters(trip, 'ALL').reduce((n, d) => n + d.balance, 0), 28000);
  check('trip settlement refund (Rakesh)', trip.members.find((m) => m.name === 'Rakesh Pandey')?.settlement?.refund, 7500);
  check('trip staff', trip.staff.length, 5);
} else {
  console.log(`\nSKIPPED: backup fixture ${BACKUP} not found — member roundtrip not verified.`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
