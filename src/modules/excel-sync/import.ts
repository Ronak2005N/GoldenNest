import type * as XLSX from 'xlsx';
import { loadXlsx, xl } from './xlsx-lazy';
import type {
  AppState,
  BranchId,
  CateringExpense,
  ClosedMonth,
  EbBill,
  EbMeter,
  Floor,
  LeasePayment,
  MaintenanceRevenue,
  Member,
  PaymentMode,
  ProvisionExpense,
  ProvisionSettlement,
  RentPayment,
  RentRateChange,
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
import { todayISO } from '../../shared/lib/dates';

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

/* ------------------------------------------------------------------------------------
 * MERGE — the import is an upsert. It never removes anything.
 * ---------------------------------------------------------------------------------- */

/** A record that carries its own id. */
interface Identified {
  id: string;
}

/**
 * Adds the incoming records to the ones already on the device.
 *
 * A record whose id is already there is updated in place; a record that is new
 * is appended. A record that is only on the device is **kept** — an import can
 * never delete it, so importing an old backup cannot throw away newer work.
 */
export function upsertById<T extends Identified>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of existing) map.set(row.id, row);
  for (const row of incoming) {
    const current = map.get(row.id);
    if (!current) {
      map.set(row.id, row);
      continue;
    }
    const merged = { ...current, ...row } as T & { voidedAt?: string; voidReason?: string };
    // A reversal is a correction of fact: an older file cannot undo it.
    if ((current as { voidedAt?: string }).voidedAt && !(row as { voidedAt?: string }).voidedAt) {
      merged.voidedAt = (current as { voidedAt?: string }).voidedAt;
      merged.voidReason = (current as { voidReason?: string }).voidReason;
    }
    map.set(row.id, merged);
  }
  return [...map.values()];
}

/** Same as upsertById, but rows are matched on a natural key (no id in the file). */
export function upsertByKey<T>(existing: T[], incoming: T[], keyOf: (row: T) => string): T[] {
  const map = new Map<string, T>();
  for (const row of existing) map.set(keyOf(row), row);
  for (const row of incoming) {
    const key = keyOf(row);
    const current = map.get(key);
    map.set(key, current ? ({ ...current, ...row } as T) : row);
  }
  return [...map.values()];
}

/** Water cans have no id in the old sheet — they are recognised by their shape. */
export function canKey(c: WaterCanLog): string {
  return `${c.date}|${c.branch}|${c.count}`;
}

/** Water tankers likewise. */
export function tankerKey(t: WaterTanker): string {
  return `${t.date}|${t.branch}|${t.cost}|${t.note}`;
}

/** A can settlement is recognised by the month and the PG it belongs to. */
export function settlementKey(s: CanSettlement): string {
  return `${s.monthKey}|${s.branch ?? 'ALL'}|${s.date}`;
}

/**
 * Merges the members of a file into the members on the device.
 *
 * Payments are merged by id, never replaced. A member who has left the PG on
 * this device stays left: an old backup cannot bring them back and put two
 * people in one bed.
 */
function mergeMembers(existing: Member[], incoming: Member[]): Member[] {
  const map = new Map<string, Member>();
  for (const m of existing) map.set(m.id, m);
  for (const fileMember of incoming) {
    const current = map.get(fileMember.id);
    if (!current) {
      map.set(fileMember.id, fileMember);
      continue;
    }
    const merged: Member = {
      ...current,
      ...fileMember,
      payments: upsertById(current.payments, fileMember.payments),
    };
    // A departure is a fact about the past — a file cannot undo it.
    if (current.status === 'vacated' && fileMember.status !== 'vacated') {
      merged.status = 'vacated';
      merged.vacatedOn = current.vacatedOn;
      merged.settlement = current.settlement;
    }
    map.set(fileMember.id, merged);
  }
  return [...map.values()];
}

/**
 * Merges workbook records into the state already on the device.
 *
 * Nothing is ever deleted: every collection is an upsert by id (or by a
 * natural key for the sheets that carry no id).
 */
export function mergeState(base: AppState, incoming: Partial<AppState>): AppState {
  const next: AppState = { ...base };

  next.rooms = upsertById(base.rooms, incoming.rooms ?? []);
  next.ebMeters = upsertById(base.ebMeters, incoming.ebMeters ?? []);
  next.ebBills = upsertById(base.ebBills, incoming.ebBills ?? []);
  next.leasePayments = upsertById(base.leasePayments, incoming.leasePayments ?? []);
  next.catering = upsertById(base.catering, incoming.catering ?? []);
  next.staff = upsertById(base.staff, incoming.staff ?? []);
  next.staffAdvances = upsertById(base.staffAdvances, incoming.staffAdvances ?? []);
  next.staffPayouts = upsertById(base.staffPayouts, incoming.staffPayouts ?? []);
  next.wifi = upsertById(base.wifi, incoming.wifi ?? []);
  next.wifiRecharges = upsertById(base.wifiRecharges, incoming.wifiRecharges ?? []);
  next.provisionExpenses = upsertById(base.provisionExpenses, incoming.provisionExpenses ?? []);
  next.provisionSettlements = upsertById(base.provisionSettlements ?? [], incoming.provisionSettlements ?? []);
  // A closed month is matched by the month it is — the day it was closed on is
  // only a note.
  next.closedMonths = upsertByKey(
    base.closedMonths ?? [],
    incoming.closedMonths ?? [],
    (c) => c.monthKey,
  );
  next.maintenance = upsertById(base.maintenance, incoming.maintenance ?? []);
  next.waterCans = upsertByKey(base.waterCans, incoming.waterCans ?? [], canKey);
  next.waterTankers = upsertByKey(base.waterTankers, incoming.waterTankers ?? [], tankerKey);
  next.canSettlements = upsertByKey(base.canSettlements, incoming.canSettlements ?? [], settlementKey);
  next.provisionChips = [...new Set([...base.provisionChips, ...(incoming.provisionChips ?? [])])];
  next.members = mergeMembers(base.members, incoming.members ?? []);
  if (typeof incoming.canRate === 'number' && incoming.canRate > 0) next.canRate = incoming.canRate;

  next.version = APP_STATE_VERSION;
  return next;
}

/* ------------------------------------------------------------------------------------
 * PARSE — what the file actually contains.
 * ---------------------------------------------------------------------------------- */

/** Reads the contents of a workbook into plain app records (no base state). */
export function parseWorkbook(wb: XLSX.WorkBook): Partial<AppState> {
  const incoming: Partial<AppState> = {};

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
    if (rooms.length) incoming.rooms = rooms;
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
        const voidedRaw = dt(r['Voided On']);
        list.push({
          id: str(r['Payment ID']) || uid('pay'),
          date: dt(r['Date']) || '',
          cycleKey: str(r['Cycle Key']) || dt(r['Date']) || '',
          cash: n(r['Cash (₹)']) || n(r['Cash']),
          upi: n(r['UPI (₹)']) || n(r['UPI']),
          card: n(r['Card (₹)']) || n(r['Card']),
          note: str(r['Note']) || undefined,
          // A voided payment is kept in the record but counts for nothing.
          // Only a real date counts as voided — a broken cell must not
          // silently cancel a payment.
          voidedAt: /^\d{4}-\d{2}-\d{2}$/.test(voidedRaw) ? voidedRaw : undefined,
          voidReason: str(r['Void Reason']) || undefined,
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
          rentCreditRefund: n(vacRow['Rent Credit Refunded (₹)']),
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
    incoming.members = members;
  }

  // Water cans / tankers / settlements
  const waterRows = rows(wb, 'Water_Cans_Tankers');
  if (waterRows && waterRows.length) {
    const cans: WaterCanLog[] = [];
    const tankers: WaterTanker[] = [];
    const settlements: CanSettlement[] = [];
    let canIndex = 0;
    let tankerIndex = 0;
    let settlementIndex = 0;
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
        const monthKey = str(r['Settled Month']) || dt(r['Date']).slice(0, 7);
        const branchId =
          str(r['PG Branch']) && str(r['PG Branch']).toUpperCase() !== 'ALL'
            ? branch(r['PG Branch'])
            : undefined;
        const date = dt(r['Date']);
        settlementIndex += 1;
        settlements.push({
          // A stable id so the same settlement is not added twice.
          id: `cst_${monthKey}_${branchId ?? 'ALL'}_${date}_${settlementIndex}`,
          monthKey,
          branch: branchId,
          date,
          cash,
          upi,
          card,
        });
      } else if (type.includes('tanker')) {
        tankerIndex += 1;
        tankers.push({
          id: `tnk_${dt(r['Date'])}_${branch(r['PG Branch'])}_${tankerIndex}`,
          date: dt(r['Date']),
          branch: branch(r['PG Branch']),
          note: str(r['Details']) || 'Tanker',
          cost: n(r['Amount (₹)']),
          mode: mode(r['Payment Mode']),
        });
      } else {
        canIndex += 1;
        cans.push({
          id: `can_${dt(r['Date'])}_${branch(r['PG Branch'])}_${canIndex}`,
          date: dt(r['Date']),
          branch: branch(r['PG Branch']),
          count: n(r['Count']),
        });
      }
    }
    if (cans.length) incoming.waterCans = cans;
    if (tankers.length) incoming.waterTankers = tankers;
    if (settlements.length) incoming.canSettlements = settlements;
  }

  // Full-fidelity can settlement sheet (has the PG on each row).
  const settleRows = rows(wb, 'Can_Settlements');
  if (settleRows && settleRows.length) {
    incoming.canSettlements = settleRows.map((r): CanSettlement => ({
      id: str(r['Settlement ID']) || uid('cst'),
      monthKey: str(r['Month']).slice(0, 7) || dt(r['Paid Date']).slice(0, 7),
      branch:
        str(r['PG Branch']) && str(r['PG Branch']).toUpperCase() !== 'ALL'
          ? branch(r['PG Branch'])
          : undefined,
      date: dt(r['Paid Date']),
      cash: n(r['Cash (₹)']),
      upi: n(r['UPI (₹)']),
      card: n(r['Card (₹)']),
    }));
  }

  // EB meters & bills
  const meterRows = rows(wb, 'EB_Meters');
  if (meterRows && meterRows.length) {
    incoming.ebMeters = meterRows.map((r): EbMeter => ({
      id: str(r['Meter ID']) || uid('meter'),
      branch: branch(r['PG Branch']),
      label: str(r['Meter Label']) || 'EB Meter 1',
      consumerNo: str(r['Consumer No']),
      cycleMonths: n(r['Bill Cycle (Months)']) || 2,
      dueDate: dt(r['Next Bill Due Date']) || undefined,
    }));
  }
  const ebRows = rows(wb, 'EB_Bills');
  if (ebRows && ebRows.length) {
    incoming.ebBills = ebRows.map((r): EbBill => {
      const statusRaw = str(r['Status']).toLowerCase();
      const status: EbBill['status'] =
        statusRaw === 'unpaid' || statusRaw === 'partial' ? statusRaw : 'paid';
      const paidDate = dt(r['Paid Date']);
      return {
        id: str(r['Bill ID']) || uid('eb'),
        meterId: str(r['Meter ID']),
        branch: branch(r['PG Branch']),
        cycle: str(r['Billing Cycle']),
        amount: n(r['Amount (₹)']),
        paidDate,
        mode: status === 'unpaid' ? undefined : mode(r['Payment Mode']),
        status,
        paidAmount: n(r['Paid Amount (₹)']) || undefined,
        serviceMonth: str(r['Bill For Month']).slice(0, 7) || undefined,
      };
    });
  }

  // Lease & catering
  const leaseRows = rows(wb, 'Lease_Payments');
  if (leaseRows && leaseRows.length) {
    incoming.leasePayments = leaseRows.map((r): LeasePayment => ({
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
    incoming.catering = catRows.map((r): CateringExpense => ({
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
    incoming.staff = staffRows
      .map((r): Staff => ({
        id: str(r['Staff ID']) || uid('stf'),
        name: str(r['Staff Name']),
        role: (str(r['Role']) || 'Helper / Warden') as Staff['role'],
        mobile: str(r['Mobile']).replace(/\D/g, ''),
        branch: branch(r['PG Branch']),
        salary: n(r['Monthly Salary (₹)']),
        joinDate: dt(r['Joined On']) || undefined,
        leftDate: dt(r['Left On']) || undefined,
      }))
      .filter((s) => s.name);
    const ids = new Set(incoming.staff.map((s) => s.id));
    const advRows = rows(wb, 'Staff_Advances');
    if (advRows) {
      incoming.staffAdvances = advRows
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
      incoming.staffPayouts = payoutRows
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
    incoming.wifi = wifiRows.map((r): Wifi => {
      // Plan prices are stored as "30d: 899, 90d: 2400".
      const planPrices: { days: number; amount: number }[] = [];
      for (const part of str(r['Plan Prices']).split(',')) {
        const m = part.match(/(\d+)\s*d\s*:\s*([\d.]+)/i);
        if (m) planPrices.push({ days: Number(m[1]), amount: Number(m[2]) });
      }
      return {
        id: str(r['Wi-Fi ID']) || uid('wifi'),
        label: str(r['Connection Name']) || 'Wi-Fi',
        branch: branch(r['PG Branch']),
        ssid: str(r['SSID']),
        password: str(r['Password']),
        monthlyAmount: n(r['Monthly Plan (₹)']),
        expiryDate: dt(r['Expiry / Recharge Due Date']),
        validityDays: n(r['Recharge Adds (Days)']) || 30,
        planPrices: planPrices.length ? planPrices : undefined,
      };
    });
    const rechargeRows = rows(wb, 'WiFi_Recharges');
    if (rechargeRows) {
      const ids = new Set(incoming.wifi.map((w) => w.id));
      incoming.wifiRecharges = rechargeRows
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

  // Rent rate history — which rent each member was charged, and from when.
  const rateRows = rows(wb, 'Rent_History');
  if (rateRows && rateRows.length) {
    const historyByMember = new Map<string, RentRateChange[]>();
    for (const r of rateRows) {
      const memberId = str(r['Member ID']);
      if (!memberId) continue;
      const list = historyByMember.get(memberId) ?? [];
      list.push({ fromDate: dt(r['From Date']), amount: n(r['Monthly Rent (₹)']) });
      historyByMember.set(memberId, list);
    }
    incoming.members = (incoming.members ?? []).map((m) => {
      const history = historyByMember.get(m.id);
      if (!history || !history.length) return m;
      const sorted = history.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
      return { ...m, rentHistory: sorted, monthlyRent: sorted[sorted.length - 1].amount };
    });
  }

  // Provisions
  const provRows = rows(wb, 'Daily_Provisions');
  if (provRows) {
    incoming.provisionExpenses = provRows
      .map((r): ProvisionExpense => {
        const quantity = n(r['Quantity']);
        const unitPrice = n(r['Unit Price (₹)']);
        const creditText = str(r['Paid or Credit'] ?? r['Status']).toLowerCase();
        return {
          id: str(r['Expense ID']) || uid('pv'),
          date: dt(r['Date']),
          branch: (str(r['PG Branch']) || 'ALL') as ProvisionExpense['branch'],
          item: str(r['Item']),
          amount: n(r['Amount (₹)']),
          mode: mode(r['Payment Mode']),
          quantity: quantity > 0 ? quantity : undefined,
          unitPrice: unitPrice > 0 ? unitPrice : undefined,
          supplier: str(r['Supplier']) || undefined,
          // Files saved before this column existed were paid for in cash.
          status: creditText.includes('credit') ? 'credit' : 'paid',
        };
      })
      .filter((p) => p.item);
  }
  const chipRows = rows(wb, 'Provision_Chips');
  if (chipRows && chipRows.length) {
    const chips = chipRows.map((r) => str(r['Item Chip'] ?? r['Item'])).filter(Boolean);
    if (chips.length) incoming.provisionChips = chips;
  }

  // Payments made to suppliers for goods bought on credit.
  const provSettleRows = rows(wb, 'Provision_Settlements');
  if (provSettleRows && provSettleRows.length) {
    incoming.provisionSettlements = provSettleRows
      .map((r): ProvisionSettlement => ({
        id: str(r['Settlement ID']) || uid('pvs'),
        date: dt(r['Date']),
        branch: (str(r['PG Branch']) || 'ALL') as ProvisionSettlement['branch'],
        supplier: str(r['Supplier']),
        cash: n(r['Cash (₹)']),
        upi: n(r['UPI (₹)']),
        card: n(r['Card (₹)']),
      }))
      .filter((s) => s.supplier);
  }

  // Months whose books the owner has closed.
  const closedRows = rows(wb, 'Closed_Months');
  if (closedRows && closedRows.length) {
    incoming.closedMonths = closedRows
      .map((r): ClosedMonth => ({
        monthKey: str(r['Month']),
        closedAt: dt(r['Closed On']) || todayISO(),
      }))
      .filter((c) => /^\d{4}-\d{2}$/.test(c.monthKey));
  }

  // Maintenance revenue (vacation deductions)
  const mntRows = rows(wb, 'Maintenance_Revenue');
  if (mntRows && mntRows.length) {
    incoming.maintenance = mntRows.map((r): MaintenanceRevenue => ({
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
        if (rate > 0) incoming.canRate = rate;
      }
    }
  }

  return incoming;
}

/**
 * Merges a workbook into the state already on the device.
 *
 * The import is an upsert: records in the file are added or updated, records
 * that are only on the device are kept. Nothing is ever deleted, so importing
 * an older backup can never throw away work done since it was taken.
 */
export function applyWorkbook(wb: XLSX.WorkBook, base: AppState): AppState {
  return mergeState(base, parseWorkbook(wb));
}

export async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  await loadXlsx();
  const buf = await file.arrayBuffer();
  return xl().read(buf, { type: 'array', cellDates: true });
}
