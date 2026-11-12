import type * as XLSX from 'xlsx';
import { loadXlsx, xl } from '../excel-sync/xlsx-lazy';
import type { AppState, BranchFilter } from '../../app/store/types';
import { BRANCH_MAP } from '../../app/store/branches';
import { activeMembers } from '../../app/store/selectors';
import { rentPosition } from '../../entities/member';
import { todayISO } from '../../shared/lib/dates';

const HEADERS = [
  'Name',
  'Mobile',
  'PG Branch',
  'Room',
  'Bed',
  'Monthly Rent (₹)',
  'Advance (₹)',
  'Joining Date',
  'Occupation',
  'Government ID',
  'Home Address',
  'Status',
];

function sheet(wb: XLSX.WorkBook, name: string, rows: (string | number)[][], widths: number[]) {
  const ws = xl().utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((w) => ({ wch: w }));
  xl().utils.book_append_sheet(wb, ws, name);
}

function download(wb: XLSX.WorkBook, fileName: string) {
  xl().writeFile(wb, fileName, { compression: true });
}

/**
 * A single, simple sheet of members for one PG (or all of them) — the file the
 * owner edits in Excel and brings back for a bulk import.
 */
export async function downloadMembersList(state: AppState, branch: BranchFilter) {
  await loadXlsx();
  const wb = xl().utils.book_new();
  const today = todayISO();
  const rows: (string | number)[][] = [HEADERS];
  for (const m of activeMembers(state, branch)) {
    const pos = rentPosition(m, today);
    rows.push([
      m.name,
      m.mobile,
      BRANCH_MAP[m.branch].short,
      m.roomCode,
      m.bedIndex,
      m.monthlyRent ?? '',
      m.advance?.amount ?? 0,
      m.startDate,
      m.occupation,
      m.govtId,
      m.homeAddress,
      pos.balance > 0 ? (pos.paid > 0 ? 'PARTIAL — BALANCE DUE' : 'UNPAID') : 'PAID IN FULL',
    ]);
  }
  sheet(wb, 'Members', rows, [22, 14, 14, 9, 7, 16, 13, 14, 22, 20, 30, 22]);
  const scope = branch === 'ALL' ? 'All_PGs' : BRANCH_MAP[branch].short.replace(/[^A-Za-z0-9]+/g, '_');
  download(wb, `GoldenNest_Members_${scope}.xlsx`);
}

/** A blank sheet with the same columns, plus two example rows. */
export async function downloadMembersTemplate(branch: BranchFilter) {
  await loadXlsx();
  const wb = xl().utils.book_new();
  const scope = branch === 'ALL' ? 'PG1' : BRANCH_MAP[branch].short;
  const rows: (string | number)[][] = [
    HEADERS,
    ['Ravi Kumar', '9845012345', scope, 'G1', '1', 4500, 2000, todayISO(), 'Student', '[Aadhaar Redacted]', '', 'PAID IN FULL'],
    ['Suresh Babu', '9845076543', scope, 'G1', '2', 4500, 0, todayISO(), 'Student', '[Aadhaar Redacted]', '', 'PAID IN FULL'],
  ];
  sheet(wb, 'Members', rows, [22, 14, 14, 9, 7, 16, 13, 14, 22, 20, 30, 22]);
  download(wb, 'GoldenNest_Members_Template.xlsx');
}
