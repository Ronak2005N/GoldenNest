import type * as XLSX from 'xlsx';
import { loadXlsx, xl } from './xlsx-lazy';
import type { AppState } from '../../app/store/types';
import { BRANCH_MAP } from '../../app/store/branches';
import { pnlFor, defaulters, activeMembers, vacatedMembers } from '../../app/store/selectors';
import { rentPosition } from '../../entities/member';
import { currentMonthKey, monthLabel, todayISO } from '../../shared/lib/dates';

function sheet(wb: XLSX.WorkBook, name: string, rows: (string | number)[][], widths: number[]) {
  const ws = xl().utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((w) => ({ wch: w }));
  xl().utils.book_append_sheet(wb, ws, name);
}

function occupancy(state: AppState, roomId: string) {
  const room = state.rooms.find((r) => r.id === roomId)!;
  const taken = state.members.filter(
    (m) => m.status === 'active' && m.branch === room.branch && m.roomCode === room.code,
  );
  return { total: room.sharing, taken: taken.length };
}

/** Builds the full multi-tab backup workbook (pure — safe in browser and Node). */
export function buildWorkbook(state: AppState): XLSX.WorkBook {
  const wb = xl().utils.book_new();
  const today = todayISO();
  const key = currentMonthKey();

  // 1. Dashboard_PnL (derived snapshot of the current month, all PGs)
  const pnl = pnlFor(state, 'ALL', key);
  sheet(
    wb,
    'Dashboard_PnL',
    [
      ['Golden Nest PG Manager — Profit & Loss', monthLabel(key)],
      ['Metric', 'Amount (₹)'],
      ['Total Revenue Collected', pnl.revenue],
      ['  Rent — Cash', pnl.rent.cash],
      ['  Rent — UPI', pnl.rent.upi],
      ['  Rent — Card', pnl.rent.card],
      ['  Maintenance Deductions (vacated members)', pnl.maintenance],
      ['Total Pending Rent (Defaulters)', pnl.pendingRent],
      ['Total Expenses This Month', pnl.expenses.total],
      ...Object.entries(pnl.expenses.byCategory).map(([k, v]) => [`  ${k}`, v] as [string, number]),
      ['NET PROFIT / LOSS', pnl.net],
      ['Total Refundable Advance Held', pnl.advanceHeld],
      [],
      ['Note', 'Generated on ' + today + '. This sheet is a summary and is not imported back.'],
    ],
    [46, 22],
  );

  // 2. Active_Members (includes defaulters — balance shown in columns)
  const activeRows: (string | number)[][] = [
    [
      'Member ID', 'Name', 'Occupation', 'Mobile', 'Government ID', 'Home Address',
      'PG Branch', 'Floor', 'Room', 'Bed No', 'Sharing', 'AC / Non-AC',
      'Billing Type', 'Start Date', 'End Date', 'Monthly Rent (₹)', 'Daily Rate (₹)',
      'Advance Amount (₹)', 'Advance Mode', 'Advance Cash (₹)', 'Advance UPI (₹)', 'Advance Card (₹)', 'Advance Date',
      'Cycle Start', 'Cycle End', 'Rent Due (₹)', 'Paid Cash (₹)', 'Paid UPI (₹)', 'Paid Card (₹)',
      'Total Paid (₹)', 'Balance Due (₹)', 'Status',
    ],
  ];
  for (const m of activeMembers(state, 'ALL')) {
    const pos = rentPosition(m, today);
    const room = state.rooms.find((r) => r.branch === m.branch && r.code === m.roomCode);
    activeRows.push([
      m.id, m.name, m.occupation, m.mobile, m.govtId, m.homeAddress,
      m.branch, m.floor, m.roomCode, m.bedIndex, room?.sharing ?? '', room?.ac ? 'AC' : 'Non-AC',
      m.billingType === 'monthly' ? 'Monthly (Date-to-Date)' : 'Daily / Short Stay',
      m.startDate, m.endDate ?? '', m.monthlyRent ?? '', m.dailyRate ?? '',
      m.advance.amount, m.advance.mode, m.advance.cash, m.advance.upi, m.advance.card, m.advance.date,
      pos.cycleStart, pos.cycleEnd, pos.due,
      '', '', '', // cash/UPI/card split lives in the Rent_Payments tab
      pos.paid, pos.balance,
      pos.balance <= 0 ? 'PAID IN FULL' : pos.paid > 0 ? 'PARTIAL — BALANCE DUE' : 'UNPAID',
    ]);
  }
  sheet(wb, 'Active_Members', activeRows, [16, 20, 24, 14, 22, 34, 11, 10, 9, 8, 9, 12, 24, 12, 12, 16, 14, 18, 14, 15, 15, 15, 14, 12, 12, 14, 14, 14, 14, 14, 16, 24]);

  // 3. Defaulters (derived read-only view)
  const defRows: (string | number)[][] = [
    ['Name', 'Occupation', 'PG Branch', 'Room', 'Cycle Start', 'Cycle End', 'Total Rent (₹)', 'Paid So Far (₹)', 'Balance Due (₹)', 'Mobile'],
  ];
  for (const d of defaulters(state, 'ALL', today)) {
    defRows.push([
      d.member.name, d.member.occupation, BRANCH_MAP[d.member.branch].short, d.member.roomCode,
      d.cycleStart, d.cycleEnd, d.due, d.paid, d.balance, d.member.mobile,
    ]);
  }
  sheet(wb, 'Defaulters', defRows, [20, 24, 22, 9, 13, 13, 16, 16, 17, 14]);

  // 4. Vacated_Members
  const vacRows: (string | number)[][] = [
    [
      'Member ID', 'Name', 'Occupation', 'Mobile', 'Government ID', 'Home Address',
      'PG Branch', 'Floor', 'Room', 'Bed No', 'Billing Type', 'Start Date', 'End Date', 'Exit Date',
      'Monthly Rent (₹)', 'Daily Rate (₹)',
      'Advance Paid (₹)', 'Advance Mode', 'Advance Cash (₹)', 'Advance UPI (₹)', 'Advance Card (₹)', 'Advance Date',
      'Maintenance Deduction (₹)', 'Pending Rent Deduction (₹)', 'Net Refund Returned (₹)', 'Refund Mode', 'Settled On',
    ],
  ];
  for (const m of vacatedMembers(state, 'ALL')) {
    const s = m.settlement;
    vacRows.push([
      m.id, m.name, m.occupation, m.mobile, m.govtId, m.homeAddress,
      m.branch, m.floor, m.roomCode, m.bedIndex,
      m.billingType === 'monthly' ? 'Monthly (Date-to-Date)' : 'Daily / Short Stay',
      m.startDate, m.endDate ?? '', m.vacatedOn ?? '',
      m.monthlyRent ?? '', m.dailyRate ?? '',
      m.advance.amount, m.advance.mode, m.advance.cash, m.advance.upi, m.advance.card, m.advance.date,
      s?.maintenanceDeduction ?? 0, s?.pendingRentDeduction ?? 0,
      s?.refund ?? 0, s?.refundMode ?? '', s?.recordedOn ?? '',
    ]);
  }
  sheet(wb, 'Vacated_Members', vacRows, [16, 20, 24, 14, 22, 34, 11, 10, 9, 8, 24, 12, 12, 12, 16, 14, 17, 14, 15, 15, 15, 14, 24, 24, 22, 13, 13]);

  // 5. Rooms_Beds
  const roomRows: (string | number)[][] = [
    ['Room ID', 'PG Branch', 'Floor', 'Room No', 'Sharing', 'Category', 'Monthly Rent per Bed (₹)', 'Total Beds', 'Occupied Beds', 'Vacant Beds'],
  ];
  for (const r of state.rooms) {
    const occ = occupancy(state, r.id);
    roomRows.push([
      r.id, r.branch, r.floor, r.code, `${r.sharing}-Sharing`, r.ac ? 'AC' : 'Non-AC',
      r.monthlyRent, occ.total, occ.taken, Math.max(0, occ.total - occ.taken),
    ]);
  }
  sheet(wb, 'Rooms_Beds', roomRows, [20, 11, 10, 10, 10, 12, 22, 11, 14, 12]);

  // 6. Water_Cans_Tankers
  const waterRows: (string | number)[][] = [
    ['Type', 'Date', 'PG Branch', 'Details', 'Count', 'Amount (₹)', 'Payment Mode', 'Settled Month'],
  ];
  for (const c of state.waterCans) {
    waterRows.push(['Can Delivery', c.date, c.branch, 'Drinking water cans', c.count, '', '', '']);
  }
  for (const t of state.waterTankers) {
    waterRows.push(['Tanker', t.date, t.branch, t.note, '', t.cost, t.mode, '']);
  }
  for (const s of state.canSettlements) {
    waterRows.push(['Can Settlement', s.date, 'ALL', 'Month-end can bill payment', '', s.cash + s.upi + s.card,
      s.cash && s.upi ? `Cash ${s.cash} + UPI ${s.upi}` + (s.card ? ` + Card ${s.card}` : '') : s.card ? 'Card' : s.upi ? 'UPI' : 'Cash',
      s.monthKey]);
  }
  sheet(wb, 'Water_Cans_Tankers', waterRows, [16, 12, 11, 30, 9, 13, 26, 14]);

  // 7. EB_Bills
  const ebRows: (string | number)[][] = [
    ['Bill ID', 'Meter ID', 'Meter Label', 'Consumer No', 'PG Branch', 'Billing Cycle', 'Amount (₹)', 'Paid Date', 'Payment Mode'],
  ];
  for (const b of state.ebBills) {
    const meter = state.ebMeters.find((m) => m.id === b.meterId);
    ebRows.push([b.id, b.meterId, meter?.label ?? '', meter?.consumerNo ?? '', b.branch, b.cycle, b.amount, b.paidDate, b.mode]);
  }
  sheet(wb, 'EB_Bills', ebRows, [18, 18, 14, 16, 11, 14, 13, 12, 14]);

  // 8. Staff_Salaries
  const staffRows: (string | number)[][] = [
    ['Staff ID', 'Staff Name', 'Role', 'Mobile', 'PG Branch', 'Monthly Salary (₹)', 'Advance This Month (₹)', 'Paid This Month (₹)', 'Net Payable (₹)'],
  ];
  for (const s of state.staff) {
    const adv = state.staffAdvances.filter((a) => a.staffId === s.id && a.date.startsWith(key)).reduce((n, a) => n + a.amount, 0);
    const paid = state.staffPayouts.filter((p) => p.staffId === s.id && p.date.startsWith(key)).reduce((n, p) => n + p.amount, 0);
    staffRows.push([s.id, s.name, s.role, s.mobile, s.branch, s.salary, adv, paid, Math.max(0, s.salary - adv - paid)]);
  }
  sheet(wb, 'Staff_Salaries', staffRows, [16, 20, 18, 14, 11, 19, 24, 20, 16]);

  // 9. WiFi_Connections
  const wifiRows: (string | number)[][] = [
    ['Wi-Fi ID', 'Connection Name', 'PG Branch', 'SSID', 'Password', 'Monthly Plan (₹)', 'Expiry / Recharge Due Date'],
  ];
  for (const w of state.wifi) {
    wifiRows.push([w.id, w.label, w.branch, w.ssid, w.password, w.monthlyAmount, w.expiryDate]);
  }
  sheet(wb, 'WiFi_Connections', wifiRows, [16, 30, 11, 22, 18, 17, 26]);

  // 10. Daily_Provisions
  const provRows: (string | number)[][] = [['Expense ID', 'Date', 'PG Branch', 'Item', 'Amount (₹)', 'Payment Mode']];
  for (const p of state.provisionExpenses) {
    provRows.push([p.id, p.date, p.branch, p.item, p.amount, p.mode]);
  }
  sheet(wb, 'Daily_Provisions', provRows, [18, 12, 11, 30, 13, 14]);

  // ——— supporting sheets (full-fidelity restore) ———
  const payRows: (string | number)[][] = [
    ['Payment ID', 'Member ID', 'Member Name', 'Date', 'Cycle Key', 'Cash (₹)', 'UPI (₹)', 'Card (₹)', 'Note'],
  ];
  for (const m of state.members) {
    for (const p of m.payments) {
      payRows.push([p.id, m.id, m.name, p.date, p.cycleKey, p.cash, p.upi, p.card, p.note ?? '']);
    }
  }
  sheet(wb, 'Rent_Payments', payRows, [18, 16, 20, 12, 14, 12, 12, 12, 24]);

  const meterRows: (string | number)[][] = [['Meter ID', 'PG Branch', 'Meter Label', 'Consumer No']];
  for (const m of state.ebMeters) meterRows.push([m.id, m.branch, m.label, m.consumerNo]);
  sheet(wb, 'EB_Meters', meterRows, [18, 11, 16, 16]);

  const leaseRows: (string | number)[][] = [['Lease ID', 'PG Branch', 'Month', 'Amount (₹)', 'Paid Date', 'Payment Mode']];
  for (const l of state.leasePayments) leaseRows.push([l.id, l.branch, l.monthKey, l.amount, l.date, l.mode]);
  sheet(wb, 'Lease_Payments', leaseRows, [18, 11, 11, 13, 12, 14]);

  const catRows: (string | number)[][] = [['Catering ID', 'Date', 'PG Branch', 'Description', 'Cash (₹)', 'UPI (₹)', 'Card (₹)']];
  for (const c of state.catering) catRows.push([c.id, c.date, c.branch, c.description, c.cash, c.upi, c.card]);
  sheet(wb, 'Catering_Expenses', catRows, [18, 12, 11, 34, 13, 13, 13]);

  const advRows: (string | number)[][] = [['Advance ID', 'Staff ID', 'Staff Name', 'Date', 'Amount (₹)', 'Mode']];
  for (const a of state.staffAdvances) {
    advRows.push([a.id, a.staffId, state.staff.find((s) => s.id === a.staffId)?.name ?? '', a.date, a.amount, a.mode]);
  }
  sheet(wb, 'Staff_Advances', advRows, [18, 16, 20, 12, 13, 10]);

  const pay2Rows: (string | number)[][] = [['Payout ID', 'Staff ID', 'Staff Name', 'Date', 'Amount (₹)', 'Mode']];
  for (const p of state.staffPayouts) {
    pay2Rows.push([p.id, p.staffId, state.staff.find((s) => s.id === p.staffId)?.name ?? '', p.date, p.amount, p.mode]);
  }
  sheet(wb, 'Staff_Payouts', pay2Rows, [18, 16, 20, 12, 13, 10]);

  const wrRows: (string | number)[][] = [['Recharge ID', 'Wi-Fi ID', 'Connection Name', 'Date', 'Amount (₹)', 'Mode']];
  for (const r of state.wifiRecharges) {
    wrRows.push([r.id, r.wifiId, state.wifi.find((w) => w.id === r.wifiId)?.label ?? '', r.date, r.amount, r.mode]);
  }
  sheet(wb, 'WiFi_Recharges', wrRows, [18, 16, 30, 12, 13, 10]);

  const chipRows: (string | number)[][] = [['Item Chip']];
  for (const c of state.provisionChips) chipRows.push([c]);
  sheet(wb, 'Provision_Chips', chipRows, [34]);

  const mntRows: (string | number)[][] = [['Record ID', 'Date', 'PG Branch', 'Member Name', 'Amount (₹)']];
  for (const m of state.maintenance) mntRows.push([m.id, m.date, m.branch, m.memberName, m.amount]);
  sheet(wb, 'Maintenance_Revenue', mntRows, [18, 12, 11, 22, 13]);

  const settleRows: (string | number)[][] = [['Settlement ID', 'Month', 'Paid Date', 'Cash (₹)', 'UPI (₹)', 'Card (₹)']];
  for (const s of state.canSettlements) settleRows.push([s.id, s.monthKey, s.date, s.cash, s.upi, s.card]);
  sheet(wb, 'Can_Settlements', settleRows, [18, 11, 12, 13, 13, 13]);

  const metaRows: (string | number)[][] = [
    ['Golden Nest PG Manager — backup file'],
    ['Generated', today],
    ['Water can rate (₹)', state.canRate],
    ['Import note', 'Use “Load / Sync from Excel” to restore this backup. The Dashboard_PnL and Defaulters tabs are read-only views.'],
  ];
  sheet(wb, 'Backup_Info', metaRows, [16, 90]);

  return wb;
}

/** Triggers a browser download of the backup workbook (loads SheetJS on first use). */
export async function exportExcel(state: AppState): Promise<void> {
  await loadXlsx();
  const wb = buildWorkbook(state);
  const out = xl().write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GoldenNest_PG_Backup_${todayISO()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
