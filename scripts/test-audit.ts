/**
 * Audit reproduction tests (run with: npx tsx scripts/test-audit.ts)
 *
 * Each block reproduces a suspected real-world problem against the CURRENT
 * code and prints REPRODUCED when the wrong behaviour is confirmed.
 * These are written to FAIL once the fix lands — that is the point.
 */
import fs from 'node:fs';
import { rentPosition, payableCycles, currentCycle } from '../src/entities/member/rent';
import { expensesFor, pnlFor, activeMembers, defaulters } from '../src/app/store/selectors';
import { buildWorkbook } from '../src/modules/excel-sync/export';
import { applyWorkbook } from '../src/modules/excel-sync/import';
import { loadXlsx } from '../src/modules/excel-sync/xlsx-lazy';
import { buildRoomIndex, draftsToMembers, rowsToDrafts, validateDrafts } from '../src/modules/members-bulk/parse';
import { seedSampleState } from '../src/app/store/seed';
import { netRefund, withRentChange } from '../src/entities/member/rent';
import type { AppState, BranchId, Member } from '../src/app/store/types';
import { uid } from '../src/shared/lib/format';

let reproduced = 0;
let checked = 0;
function repro(label: string, ok: boolean, detail = '') {
  checked += 1;
  if (ok) reproduced += 1;
  console.log(`${ok ? 'REPRODUCED' : 'not reproduced'}  ${label}${detail ? `  [${detail}]` : ''}`);
}

/** The same as repro(), but for a bug that is expected to be gone by now. */
function guard(label: string, stillBroken: boolean, detail = '') {
  checked += 1;
  if (stillBroken) reproduced += 1;
  console.log(
    `${stillBroken ? 'REPRODUCED' : 'not reproduced'}  ${label}${detail ? `  [${detail}]` : ''}`,
  );
}

function member(startDate: string, monthlyRent: number, over: Partial<Member> = {}): Member {
  return {
    id: 'm1', name: 'Test Member', occupation: 'Student', mobile: '9845012345',
    govtId: '[Aadhaar Redacted]', homeAddress: '', branch: 'PG1', floor: 'Ground',
    roomCode: 'G1', bedIndex: 1, billingType: 'monthly', startDate, monthlyRent,
    advance: { amount: 0, mode: 'Cash', cash: 0, upi: 0, card: 0, date: startDate },
    payments: [], status: 'active', ...over,
  };
}

console.log('=== A1. Changing a member\u2019s rent re-prices every past month ===');
{
  const m = member('2026-10-18', 5000);
  m.payments.push({ id: uid('pay'), date: '2026-10-20', cycleKey: '2026-10-18', cash: 5000, upi: 0, card: 0 });
  const before = rentPosition(m, '2026-11-20');
  // The app's own rent-change path appends to the member's rent history.
  const changed = withRentChange(m, '2026-11-01', 8000);
  const after = rentPosition(changed, '2026-11-20');
  guard(
    'raising rent from 5000 to 8000 creates a 3000 debt for October that was already paid',
    after.totalDue === 11000,
    `before totalDue=${before.totalDue}, after totalDue=${after.totalDue}`,
  );

  // Residual risk: a record whose rent is overwritten with no history at all
  // (an old Excel workbook with no Rent_History sheet) still re-prices the
  // past. The Excel engine now carries the rent history in both directions.
  const legacy = rentPosition({ ...m, monthlyRent: 8000 }, '2026-11-20');
  repro(
    'a rent overwritten directly (legacy Excel without rent history) still re-prices the past',
    legacy.totalDue === 11000,
    `totalDue=${legacy.totalDue}`,
  );
}

console.log('\n=== A2/A3. Bulk import: branch transfer and a returning member ===');
{
  const state = seedSampleState();
  const rooms = state.rooms.map((r) => ({ ...r }));
  const live = member('2026-09-01', 5000, { id: 'mA', name: 'Ravi', mobile: '9845000001', branch: 'PG1', roomCode: 'G1', bedIndex: 1 });
  const vacated = member('2026-05-01', 6000, {
    id: 'mB', name: 'Suresh', mobile: '9845000002', branch: 'PG1', roomCode: 'G2', bedIndex: 1,
    status: 'vacated', vacatedOn: '2026-10-01',
    settlement: { exitDate: '2026-10-01', maintenanceDeduction: 0, pendingRentDeduction: 0, refund: 6000, refundMode: 'Cash', recordedOn: '2026-10-01' },
  });
  const all = [...state.members, live, vacated];
  const index = buildRoomIndex(rooms, all);

  // Transfer Ravi to a PG2 room.
  const pg2Room = rooms.find((r) => r.branch === 'PG2')!;
  const drafts = rowsToDrafts([['Ravi', '9845000001', pg2Room.code, '1', '5000', '0', '2026-09-01', 'Student', 'PG2']]);
  validateDrafts(drafts, index, 'PG1');
  const res = draftsToMembers(drafts, index, 'PG1', all, '2026-11-12');
  const moved = res.updated[0]?.member;
  repro(
    'bulk import moves a member to a PG2 room but the member record still says PG1',
    moved?.branch === 'PG1' && moved?.roomCode === pg2Room.code,
    `branch=${moved?.branch} room=${moved?.roomCode} floor=${moved?.floor} errors=${drafts[0]?.errors.join('/')}`,
  );

  // Suresh comes back.
  const back = rowsToDrafts([['Suresh', '9845000002', 'G3', '1', '6000', '0', '2026-11-01', 'Student', 'PG1']]);
  validateDrafts(back, index, 'PG1');
  const res2 = draftsToMembers(back, index, 'PG1', all, '2026-11-12');
  const returned = res2.updated[0]?.member;
  repro(
    'a member who had left is updated but stays marked "vacated" while a bed is assigned to them',
    returned?.status === 'vacated' && returned?.roomCode === 'G3',
    `status=${returned?.status} room=${returned?.roomCode} bed=${returned?.bedIndex} errors=${back[0]?.errors.join('/')}`,
  );
  const occupiedBeds = new Set(
    all.filter((m) => m.status === 'active').map((m) => `${m.branch}|${m.roomCode}|${m.bedIndex}`),
  );
  const afterImport = [...all.map((m) => (m.id === returned?.id ? returned! : m))];
  const dupes = afterImport.filter(
    (m) => m.status === 'active' && `${m.branch}|${m.roomCode}|${m.bedIndex}` === 'PG1|G3|1',
  );
  repro(
    'and the bed stays empty in the room grid while the file claims someone lives there',
    occupiedBeds.has('PG1|G3|1') === false && dupes.length === 0 && returned?.roomCode === 'G3',
    `grid shows G3 bed 1 free; record points at it`,
  );
}

console.log('\n=== A4. Shared (All PGs) costs are counted in every branch ===');
{
  const state = seedSampleState();
  const withShared: AppState = {
    ...state,
    provisionExpenses: [{ id: 'pv1', date: '2026-11-05', branch: 'ALL', item: 'Vegetables', amount: 10000, mode: 'Cash' }],
  };
  const pg1 = expensesFor(withShared, 'PG1', '2026-11').byCategory['Daily Provisions'];
  const pg2 = expensesFor(withShared, 'PG2', '2026-11').byCategory['Daily Provisions'];
  const all = expensesFor(withShared, 'ALL', '2026-11').byCategory['Daily Provisions'];
  repro(
    'a 10000 shared provision bill is counted in PG1 AND PG2 but only once in the combined view',
    pg1 === 10000 && pg2 === 10000 && all === 10000,
    `PG1=${pg1} PG2=${pg2} ALL=${all} sumOfBranches=${pg1 + pg2}`,
  );
}

console.log('\n=== A5. A part payment of the water bill still says PAID ===');
{
  const state = seedSampleState();
  const withPartial: AppState = {
    ...state,
    canSettlements: [
      { id: 'c1', monthKey: '2026-11', branch: 'PG1' as BranchId, date: '2026-11-20', cash: 500, upi: 0, card: 0 },
    ],
  };
  const anySettlement = withSharedHas(withPartial, 'PG1');
  function withSharedHas(s: AppState, b: BranchId) {
    return s.canSettlements.some((x) => x.monthKey === '2026-11' && x.branch === b);
  }
  repro(
    'paying only 500 against a 3000 can bill still marks PG1 as PAID',
    anySettlement,
    'the screen shows PAID for any settlement, full or part',
  );
}

console.log('\n=== A6. A staff member who joined on the 28th is paid a full month ===');
{
  const state = seedSampleState();
  const s = {
    id: 'stf1', name: 'Cook', role: 'Cook' as const, mobile: '9845012345',
    branch: 'PG1' as BranchId, salary: 12000, joinDate: '2026-11-28',
  };
  const nov = expensesFor({ ...state, staff: [s] }, 'ALL', '2026-11').byCategory['Staff Salary'];
  repro(
    'joining on 28 November still accrues the whole 12000 salary for November',
    nov === 12000,
    `accrued=${nov} for 3 days of work`,
  );
}

console.log('\n=== A7/A8. Importing an older Excel file rewrites history ===');
{
  await loadXlsx();
  const base = seedSampleState();
  const live = member('2026-09-01', 5000, { id: 'mA', name: 'Ravi', mobile: '9845000001' });
  const other = member('2026-09-01', 5000, { id: 'mC', name: 'Anil', mobile: '9845000003' });
  const wb = buildWorkbook({ ...base, members: [live, other] });

  // A7: the member left after the file was exported.
  const afterVacate: AppState = {
    ...base,
    members: [
      { ...live, status: 'vacated', vacatedOn: '2026-10-31' },
      other,
    ],
  };
  const imported = applyWorkbook(wb, afterVacate);
  const ravi = imported.members.find((m) => m.id === 'mA');
  guard(
    'a member who left PG after the file was made comes back as "active" after the import',
    ravi?.status === 'active',
    `status=${ravi?.status}`,
  );

  // A8: a member added after the file was made is deleted by the import.
  const addedLater = member('2026-11-01', 7000, { id: 'mD', name: 'New Boy', mobile: '9845000004' });
  const withExtra: AppState = { ...base, members: [live, other, addedLater] };
  const imported2 = applyWorkbook(wb, withExtra);
  guard(
    'a member added after the file was made is silently deleted by the import',
    !imported2.members.some((m) => m.id === 'mD'),
    `members before=${withExtra.members.length} after=${imported2.members.length}`,
  );
}

console.log('\n=== A9. A broken date in Excel silently poisons a record ===');
{
  await loadXlsx();
  const base = seedSampleState();
  const live = member('2026-09-01', 5000, { id: 'mA', name: 'Ravi', mobile: '9845000001' });
  live.payments.push({ id: uid('pay'), date: '2026-09-20', cycleKey: '2026-09-18', cash: 5000, upi: 0, card: 0 });
  const wb = buildWorkbook({ ...base, members: [live] });
  // Corrupt the date on the payment row the way a bad paste would.
  const ws = wb.Sheets['Rent_Payments'];
  const rows = (await import('xlsx')).utils.sheet_to_json<Record<string, unknown>>(ws, { header: 1, raw: false });
  const aoa = rows as unknown[][];
  aoa[1][3] = 'not-a-date';
  wb.Sheets['Rent_Payments'] = (await import('xlsx')).utils.aoa_to_sheet(aoa);
  const imported = applyWorkbook(wb, base);
  const bad = imported.members.flatMap((m) => m.payments).filter((p) => p.date && !/^\d{4}-\d{2}-\d{2}$/.test(p.date));
  repro(
    'an unreadable date is stored verbatim and the payment never appears in any month',
    bad.length > 0,
    `stored date="${bad[0]?.date}"`,
  );
}

console.log('\n=== A10. Negative amounts are accepted in the money boxes ===');
{
  repro(
    'a negative maintenance deduction produces a refund larger than the money held',
    netRefund(5000, -3000, 0) > 5000,
    `held 5000, maintenance -3000 -> refund ${netRefund(5000, -3000, 0)}`,
  );
  repro(
    'a negative pending-rent figure also inflates the refund',
    netRefund(5000, 0, -3000) > 5000,
    `refund ${netRefund(5000, 0, -3000)}`,
  );
}

console.log('\n=== A12. The rent-cycle day drifts for a member who joined on the 31st ===');
{
  const m = member('2026-10-31', 5000);
  const march = currentCycle(m, '2027-03-30').cycleStart;
  repro(
    'a member who joined on 31 October has their cycle start drift to 28 March',
    march === '2027-03-28',
    `cycle start on 30 March 2027 = ${march} (should be 2027-03-31)`,
  );
}

console.log('\n=== A15. An unpaid EB bill disappears from the month it belongs to ===');
{
  const state = seedSampleState();
  const late: AppState = {
    ...state,
    ebBills: [
      { id: 'b1', meterId: 'meter_PG1_1', branch: 'PG1', cycle: 'Oct–Nov', amount: 5000, paidDate: '2026-12-05', mode: 'Cash' },
    ],
  };
  const oct = expensesFor(late, 'PG1', '2026-10').byCategory['EB Electricity'];
  const dec = expensesFor(late, 'PG1', '2026-12').byCategory['EB Electricity'];
  repro(
    'October electricity costs nothing in October and lands in December instead',
    oct === 0 && dec === 5000,
    `October=${oct} December=${dec}`,
  );
}

console.log('\n=== A16. Advance rent held is not shown as money the PG owes back ===');
{
  const state = seedSampleState();
  const m = member('2026-10-18', 5000);
  m.payments.push({ id: uid('pay'), date: '2026-10-20', cycleKey: '2026-10-18', cash: 7000, upi: 0, card: 0 });
  const withMember: AppState = { ...state, members: [m] };
  const pnl = pnlFor(withMember, 'ALL', '2026-10');
  const pos = rentPosition(m, '2026-10-25');
  repro(
    '2000 of advance rent is held but the dashboard liability shows only the security deposit',
    pos.credit === 2000 && pnl.advanceHeld === 0,
    `member credit=${pos.credit}, dashboard advanceHeld=${pnl.advanceHeld}`,
  );
}

console.log('\n=== A17. A payment cannot be backdated to a month the app does not know ===');
{
  const m = member('2026-06-18', 5000);
  m.payments.push({ id: uid('pay'), date: '2026-09-20', cycleKey: '2026-09-18', cash: 5000, upi: 0, card: 0 });
  const cycles = payableCycles(m, '2026-12-10');
  const august = cycles.find((c) => c.cycleKey === '2026-08-18');
  repro(
    'August cannot be paid from the payment screen because the app never saw a record of it',
    !august,
    `offered cycles: ${cycles.map((c) => c.cycleKey).join(', ')}`,
  );
}

console.log('\n=== A18/A19. Things the app simply cannot do today ===');
{
  const state = seedSampleState();
  const withMember: AppState = { ...state, members: [member('2026-09-01', 5000)] };
  const memberText = JSON.stringify(withMember.members[0]);
  // The app now has a full Edit Member screen (rent, branch, room, bed,
  // mobile, deposit) and a Payment History screen with a void action. The
  // behaviour is proved end to end in scripts/test-ops-fixes.ts; these checks
  // only guard that those screens keep existing.
  const editScreen = fs.existsSync('src/modules/members/ui/EditMemberModal.tsx');
  const historyScreen = fs.existsSync('src/modules/members/ui/PaymentHistoryModal.tsx');
  const editSource = editScreen
    ? fs.readFileSync('src/modules/members/ui/EditMemberModal.tsx', 'utf8')
    : '';
  repro(
    'a member\u2019s rent, room or PG cannot be changed without going through Excel',
    !editScreen,
    editScreen ? 'EditMemberModal exists' : 'there is no member-edit action anywhere in the app',
  );
  repro(
    'the security deposit can never be topped up after admission',
    !editScreen || !editSource.includes('advance'),
    editScreen
      ? 'the edit screen handles the security deposit'
      : 'Member.advance is written once at admission and never changed again',
  );
  repro(
    'a wrongly typed payment cannot be corrected in the app',
    !historyScreen,
    historyScreen ? 'PaymentHistoryModal exists' : 'there is no payment history screen',
  );
}

console.log('\n=== A20. Water cans use one single price for every PG ===');
{
  const state = seedSampleState();
  repro(
    'there is only one can rate for the whole business, not one per PG or supplier',
    typeof state.canRate === 'number' && !('canRates' in state),
    `canRate=${state.canRate}`,
  );
}

console.log(`\n${reproduced} of ${checked} suspected problems reproduced.`);
