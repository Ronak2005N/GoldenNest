import type * as XLSX from 'xlsx';
import { loadXlsx, xl } from './xlsx-lazy';
import type {
  AppState,
  BranchId,
  CateringExpense,
  EbBill,
  EbMeter,
  Floor,
  LeasePayment,
  MaintenanceRevenue,
  Member,
  PaymentMode,
  ProvisionExpense,
  RentPayment,
  Room,
  Staff,
  StaffAdvance,
  StaffPayout,
  WaterCanLog,
  WaterTanker,
  Wifi,
  WifiRecharge,
  CanSettlement,
} from '../../app/store/types';
import { APP_STATE_VERSION } from '../../app/store/types';
import { FLOORS } from '../../app/store/branches';
import { uid } from '../../shared/lib/format';

type Row = Record<string, unknown>;

const BRANCH_IDS: BranchId[] = ['PG1', 'PG2', 'PG3', 'PG4'];
const MODES: PaymentMode[] = ['Cash', 'UPI', 'Card'];

function rows(wb: XLSX.WorkBook, name: string): Row[] | null {
  const ws = wb.Sheets[name];
  if (!ws) return null;
  return xl().utils.sheet_to_json<Row>(ws, { defval: '', raw: false });
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isoFromDate(v);
  return String(v).trim();
}

function n(v: unknown): number {
  const cleaned = str(v).replace(/[^0-9.-]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/** Accepts "2026-11-01", "1/11/2026", Date objects and Excel serial numbers. */
function dt(v: unknown): string {
  if (v instanceof Date) return isoFromDate(v);
  const s = str(v);
  if (!s) return '';
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return isoFromDate(d);
    }
    return s;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return isoFromDate(parsed);
  return s;
}

function isoFromDate(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

function branch(v: unknown, fallback: BranchId = 'PG1'): BranchId {
  const s = str(v).toUpperCase().replace(/\s+/g, '');
  const found = BRANCH_IDS.find((b) => s.includes(b));
  return found ?? fallback;
}

function mode(v: unknown, fallback: PaymentMode = 'Cash'): PaymentMode {
  const s = str(v).toLowerCase();
  return MODES.find((m) => s.includes(m.toLowerCase())) ?? fallback;
}

/** Reads an uploaded workbook and rebuilds state on top of `base` (sheets not present are kept as-is). */
export function applyWorkbook(wb: XLSX.WorkBook, base: AppState): AppState {
  const next: AppState = {
    ...base,
    rooms: [...base.rooms],
    members: [...base.members],
    maintenance: [...base.maintenance],
    waterCans: [...base.waterCans],
    canSettlements: [...base.canSettlements],
    waterTankers: [...base.waterTankers],
    ebMeters: [...base.ebMeters],
    ebBills: [...base.ebBills],
    leasePayments: [...base.leasePayments],
    catering: [...base.catering],
    staff: [...base.staff],
    staffAdvances: [...base.staffAdvances],
    staffPayouts: [...base.staffPayouts],
    wifi: [...base.wifi],
    wifiRecharges: [...base.wifiRecharges],
    provisionChips: [...base.provisionChips],
    provisionExpenses: [...base.provisionExpenses],
  };

  // Rooms
  const roomRows = rows(wb, 'Rooms_Beds');
  if (roomRows && roomRows.length) {
    const rooms: Room[] = roomRows
      .map((r) => ({
        id: str(r['Room ID']) || `room_${branch(r['PG Branch'])}_${str(r['Room No'])}`,
        branch: branch(r['PG Branch']),
        floor: (FLOORS.find((f) => f === str(r['Floor'])) ?? 'Ground') as Floor,
        code: str(r['Room No']),
        sharing: Math.min(4, Math.max(1, n(r['Sharing']) || Number(str(r['Sharing']).match(/\d/)?.[0]) || 2)) as Room['sharing'],
        ac: str(r['Category']).toUpperCase().includes('AC') && !str(r['Category']).toUpperCase().includes('NON'),
        monthlyRent: n(r['Monthly Rent per Bed (₹)']) || n(r['Monthly Rent (₹)']),
      }))
      .filter((r) => r.code);
    if (rooms.length) next.rooms = rooms;
  }

  // Members (active + vacated)
  const activeRows = rows(wb, 'Active_Members');
  const vacRows = rows(wb, 'Vacated_Members');
  if ((activeRows && activeRows.length) || (vacRows && vacRows.length)) {
    const paymentRows = rows(wb, 'Rent_Payments');
    const paymentsByMember = new Map<string, RentPayment[]>();
    if (paymentRows) {
      for (const r of paymentRows) {
        const memberId = str(r['Member ID']);
        if (!memberId) continue;
        const list = paymentsByMember.get(memberId) ?? [];
        list.push({
          id: str(r['Payment ID']) || uid('pay'),
          date: dt(r['Date']) || '',
          cycleKey: str(r['Cycle Key']) || dt(r['Date']) || '',
          cash: n(r['Cash (₹)']) || n(r['Cash']),
          upi: n(r['UPI (₹)']) || n(r['UPI']),
          card: n(r['Card (₹)']) || n(r['Card']),
          note: str(r['Note']) || undefined,
        });
        paymentsByMember.set(memberId, list);
      }
    }

    const readMember = (r: Row, status: 'active' | 'vacated'): Member => {
      const id = str(r['Member ID']) || uid('mem');
      const b = branch(r['PG Branch']);
      const roomCode = str(r['Room No']) || str(r['Room']);
      const billingRaw = str(r['Billing Type']).toLowerCase();
      const advanceModeRaw = str(r['Advance Mode']);
      const advanceMode: Member['advance']['mode'] =
        advanceModeRaw.toLowerCase() === 'split'
          ? 'Split'
          : (MODES.find((m) => m.toLowerCase() === advanceModeRaw.toLowerCase()) ?? 'Cash');
      const advanceCash = n(r['Advance Cash (₹)']);
      const advanceUpi = n(r['Advance UPI (₹)']);
      const advanceCard = n(r['Advance Card (₹)']);
      const advanceTotal = n(r['Advance Amount (₹)']) || n(r['Advance Paid (₹)']);
      const advanceSplit =
        advanceMode === 'Split'
          ? { cash: advanceCash, upi: advanceUpi, card: advanceCard }
          : {
              cash: advanceMode === 'Cash' ? advanceTotal : 0,
              upi: advanceMode === 'UPI' ? advanceTotal : 0,
              card: advanceMode === 'Card' ? advanceTotal : 0,
            };

      let payments = paymentsByMember.get(id);
      if (!payments && status === 'active') {
        // Fallback when the workbook has no Rent_Payments tab: one lump payment in the current cycle.
        const paid = n(r['Total Paid (₹)']);
        const cycleKey = str(r['Cycle Start']) || dt(r['Start Date']);
        payments =
          paid > 0
            ? [
                {
                  id: uid('pay'),
                  date: cycleKey,
                  cycleKey,
                  cash: paid,
                  upi: 0,
                  card: 0,
                  note: 'Imported from Excel without payment split',
                },
              ]
            : [];
      }
      payments = payments ?? [];

      const settlementRaw = status === 'vacated' ? (vacRows ?? []).find((v) => str(v['Member ID']) === id) : undefined;
      const member: Member = {
        id,
        name: str(r['Name']) || 'Unnamed member',
        occupation: (str(r['Occupation']) || 'Other') as Member['occupation'],
        mobile: str(r['Mobile']).replace(/\D/g, ''),
        govtId: str(r['Government ID']) || '[Aadhaar Redacted]',
        homeAddress: str(r['Home Address']),
        branch: b,
        floor: (FLOORS.find((f) => f === str(r['Floor'])) ?? 'Ground') as Floor,
        roomCode,
        bedIndex: n(r['Bed No']) || 1,
        billingType: billingRaw.includes('daily') ? 'daily' : 'monthly',
        startDate: dt(r['Start Date']),
        endDate: dt(r['End Date']) || undefined,
        monthlyRent: n(r['Monthly Rent (₹)']) || undefined,
        dailyRate: n(r['Daily Rate (₹)']) || undefined,
        advance: {
          amount: advanceTotal,
          mode: advanceMode,
          ...advanceSplit,
          date: dt(r['Advance Date']),
        },
        payments,
        status,
      };

      if (status === 'vacated') {
        member.vacatedOn = dt(r['Exit Date']);
        const vacRow = settlementRaw ?? r;
        member.settlement = {
          exitDate: dt(vacRow['Exit Date']) || member.vacatedOn || '',
          maintenanceDeduction: n(vacRow['Maintenance Deduction (₹)']),
          pendingRentDeduction: n(vacRow['Pending Rent Deduction (₹)']),
          refund: n(vacRow['Net Refund Returned (₹)']),
          refundMode: mode(vacRow['Refund Mode']),
          recordedOn: dt(vacRow['Settled On']) || member.vacatedOn || '',
        };
      }
      return member;
    };

    const members: Member[] = [];
    for (const r of activeRows ?? []) {
      const m = readMember(r, 'active');
      if (m.name) members.push(m);
    }
    for (const r of vacRows ?? []) {
      const m = readMember(r, 'vacated');
      if (m.name) members.push(m);
    }
    next.members = members;
  }

  // Water cans / tankers / settlements
  const waterRows = rows(wb, 'Water_Cans_Tankers');
  if (waterRows && waterRows.length) {
    const cans: WaterCanLog[] = [];
    const tankers: WaterTanker[] = [];
    const settlements: CanSettlement[] = [];
    for (const r of waterRows) {
      const type = str(r['Type']).toLowerCase();
      if (type.includes('settlement')) {
        const total = n(r['Amount (₹)']);
        const raw = str(r['Payment Mode']);
        let cash = Number(raw.match(/cash\s*₹?\s*([\d.]+)/i)?.[1] ?? 0);
        let upi = Number(raw.match(/upi\s*₹?\s*([\d.]+)/i)?.[1] ?? 0);
        let card = Number(raw.match(/card\s*₹?\s*([\d.]+)/i)?.[1] ?? 0);
        if (!cash && !upi && !card && total) {
          if (raw.toLowerCase().includes('upi')) upi = total;
          else if (raw.toLowerCase().includes('card')) card = total;
          else cash = total;
        }
        settlements.push({
          id: uid('cst'),
          monthKey: str(r['Settled Month']) || dt(r['Date']).slice(0, 7),
          date: dt(r['Date']),
          cash,
          upi,
          card,
        });
      } else if (type.includes('tanker')) {
        tankers.push({
          id: uid('tnk'),
          date: dt(r['Date']),
          branch: branch(r['PG Branch']),
          note: str(r['Details']) || 'Tanker',
          cost: n(r['Amount (₹)']),
          mode: mode(r['Payment Mode']),
        });
      } else {
        cans.push({
          id: uid('can'),
          date: dt(r['Date']),
          branch: branch(r['PG Branch']),
          count: n(r['Count']),
        });
      }
    }
    if (cans.length) next.waterCans = cans;
    if (tankers.length) next.waterTankers = tankers;
    if (settlements.length) next.canSettlements = settlements;
  }

  // EB meters & bills
  const meterRows = rows(wb, 'EB_Meters');
  if (meterRows && meterRows.length) {
    next.ebMeters = meterRows.map((r): EbMeter => ({
      id: str(r['Meter ID']) || uid('meter'),
      branch: branch(r['PG Branch']),
      label: str(r['Meter Label']) || 'EB Meter 1',
      consumerNo: str(r['Consumer No']),
    }));
  }
  const ebRows = rows(wb, 'EB_Bills');
  if (ebRows && ebRows.length) {
    next.ebBills = ebRows.map((r): EbBill => ({
      id: str(r['Bill ID']) || uid('eb'),
      meterId: str(r['Meter ID']),
      branch: branch(r['PG Branch']),
      cycle: str(r['Billing Cycle']),
      amount: n(r['Amount (₹)']),
      paidDate: dt(r['Paid Date']),
      mode: mode(r['Payment Mode']),
    }));
  }

  // Lease & catering
  const leaseRows = rows(wb, 'Lease_Payments');
  if (leaseRows && leaseRows.length) {
    next.leasePayments = leaseRows.map((r): LeasePayment => ({
      id: str(r['Lease ID']) || uid('lse'),
      branch: branch(r['PG Branch']),
      monthKey: str(r['Month']).slice(0, 7) || dt(r['Paid Date']).slice(0, 7),
      amount: n(r['Amount (₹)']),
      date: dt(r['Paid Date']),
      mode: mode(r['Payment Mode']),
    }));
  }
  const catRows = rows(wb, 'Catering_Expenses');
  if (catRows && catRows.length) {
    next.catering = catRows.map((r): CateringExpense => ({
      id: str(r['Catering ID']) || uid('cat'),
      date: dt(r['Date']),
      branch: branch(r['PG Branch']),
      description: str(r['Description']) || 'Catering payment',
      cash: n(r['Cash (₹)']),
      upi: n(r['UPI (₹)']),
      card: n(r['Card (₹)']),
    }));
  }

  // Staff
  const staffRows = rows(wb, 'Staff_Salaries');
  if (staffRows && staffRows.length) {
    next.staff = staffRows
      .map((r): Staff => ({
        id: str(r['Staff ID']) || uid('stf'),
        name: str(r['Staff Name']),
        role: (str(r['Role']) || 'Helper / Warden') as Staff['role'],
        mobile: str(r['Mobile']).replace(/\D/g, ''),
        branch: branch(r['PG Branch']),
        salary: n(r['Monthly Salary (₹)']),
      }))
      .filter((s) => s.name);
    const ids = new Set(next.staff.map((s) => s.id));
    const advRows = rows(wb, 'Staff_Advances');
    if (advRows) {
      next.staffAdvances = advRows
        .map((r): StaffAdvance => ({
          id: str(r['Advance ID']) || uid('sa'),
          staffId: str(r['Staff ID']),
          date: dt(r['Date']),
          amount: n(r['Amount (₹)']),
          mode: str(r['Mode']).toLowerCase().includes('upi') ? 'UPI' : 'Cash',
        }))
        .filter((a) => ids.has(a.staffId));
    }
    const payoutRows = rows(wb, 'Staff_Payouts');
    if (payoutRows) {
      next.staffPayouts = payoutRows
        .map((r): StaffPayout => ({
          id: str(r['Payout ID']) || uid('sp'),
          staffId: str(r['Staff ID']),
          date: dt(r['Date']),
          amount: n(r['Amount (₹)']),
          mode: mode(r['Mode']),
        }))
        .filter((p) => ids.has(p.staffId));
    }
  }

  // Wi-Fi
  const wifiRows = rows(wb, 'WiFi_Connections');
  if (wifiRows && wifiRows.length) {
    next.wifi = wifiRows.map((r): Wifi => ({
      id: str(r['Wi-Fi ID']) || uid('wifi'),
      label: str(r['Connection Name']) || 'Wi-Fi',
      branch: branch(r['PG Branch']),
      ssid: str(r['SSID']),
      password: str(r['Password']),
      monthlyAmount: n(r['Monthly Plan (₹)']),
      expiryDate: dt(r['Expiry / Recharge Due Date']),
    }));
    const rechargeRows = rows(wb, 'WiFi_Recharges');
    if (rechargeRows) {
      const ids = new Set(next.wifi.map((w) => w.id));
      next.wifiRecharges = rechargeRows
        .map((r): WifiRecharge => ({
          id: str(r['Recharge ID']) || uid('wr'),
          wifiId: str(r['Wi-Fi ID']),
          date: dt(r['Date']),
          amount: n(r['Amount (₹)']),
          mode: mode(r['Mode']),
        }))
        .filter((r) => ids.has(r.wifiId));
    }
  }

  // Provisions
  const provRows = rows(wb, 'Daily_Provisions');
  if (provRows) {
    next.provisionExpenses = provRows
      .map((r): ProvisionExpense => ({
        id: str(r['Expense ID']) || uid('pv'),
        date: dt(r['Date']),
        branch: (str(r['PG Branch']) || 'ALL') as ProvisionExpense['branch'],
        item: str(r['Item']),
        amount: n(r['Amount (₹)']),
        mode: mode(r['Payment Mode']),
      }))
      .filter((p) => p.item);
  }
  const chipRows = rows(wb, 'Provision_Chips');
  if (chipRows && chipRows.length) {
    const chips = chipRows.map((r) => str(r['Item Chip'] ?? r['Item'])).filter(Boolean);
    if (chips.length) next.provisionChips = Array.from(new Set([...next.provisionChips, ...chips]));
  }

  // Maintenance revenue (vacation deductions)
  const mntRows = rows(wb, 'Maintenance_Revenue');
  if (mntRows && mntRows.length) {
    next.maintenance = mntRows.map((r): MaintenanceRevenue => ({
      id: str(r['Record ID']) || uid('mnt'),
      date: dt(r['Date']),
      branch: branch(r['PG Branch']),
      memberName: str(r['Member Name']),
      memberId: '',
      amount: n(r['Amount (₹)']),
    }));
  }

  // Water can rate from Backup_Info
  const infoRows = rows(wb, 'Backup_Info');
  if (infoRows) {
    for (const r of infoRows) {
      const label = str(Object.values(r)[0]);
      if (label.toLowerCase().includes('can rate')) {
        const rate = n(Object.values(r)[1]);
        if (rate > 0) next.canRate = rate;
      }
    }
  }

  next.version = APP_STATE_VERSION;
  return next;
}

export async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  await loadXlsx();
  const buf = await file.arrayBuffer();
  return xl().read(buf, { type: 'array', cellDates: true });
}
