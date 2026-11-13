import { BRANCHES } from './branches';
import type {
  AppState,
  BranchId,
  EbBill,
  EbMeter,
  Floor,
  Room,
  WaterCanLog,
  Wifi,
} from './types';
import { APP_STATE_VERSION } from './types';

interface RentRule {
  match: (floor: Floor, code: string) => boolean;
  sharing: 1 | 2 | 3 | 4;
  ac: boolean;
  rent: number;
}

function roomRules(branch: BranchId): RentRule[] {
  switch (branch) {
    case 'PG1':
      return [
        { match: (f) => f === 'Ground', sharing: 2, ac: false, rent: 8500 },
        { match: (f) => f === 'First', sharing: 2, ac: true, rent: 10500 },
        { match: (f) => f === 'Second', sharing: 3, ac: false, rent: 7500 },
      ];
    case 'PG2':
      return [
        { match: (f, c) => f === 'First' && Number(c.slice(1)) <= 6, sharing: 2, ac: true, rent: 9500 },
        { match: (f) => f === 'First', sharing: 3, ac: false, rent: 7000 },
      ];
    case 'PG3':
      return [
        { match: (f) => f === 'Ground', sharing: 1, ac: true, rent: 12000 },
        { match: (f) => f === 'First', sharing: 2, ac: false, rent: 8000 },
        { match: (f) => f === 'Second', sharing: 3, ac: false, rent: 7000 },
        { match: (f) => f === 'Third', sharing: 2, ac: false, rent: 8500 },
      ];
    case 'PG4':
      return [
        { match: (f) => f === 'Ground', sharing: 2, ac: false, rent: 8000 },
        { match: (f) => f === 'First', sharing: 2, ac: true, rent: 10000 },
        { match: (f) => f === 'Second', sharing: 3, ac: false, rent: 7000 },
        { match: (f) => f === 'Third', sharing: 2, ac: false, rent: 8500 },
      ];
  }
}

export function buildRooms(): Room[] {
  const rooms: Room[] = [];
  for (const b of BRANCHES) {
    const rules = roomRules(b.id);
    for (const f of b.floors) {
      for (const code of f.codes) {
        const rule = rules.find((r) => r.match(f.floor, code)) ?? rules[rules.length - 1];
        rooms.push({
          id: `room_${b.id}_${code}`,
          branch: b.id,
          floor: f.floor,
          code,
          sharing: rule.sharing,
          ac: rule.ac,
          monthlyRent: rule.rent,
        });
      }
    }
  }
  return rooms;
}

export function buildEbMeters(): EbMeter[] {
  const meters: EbMeter[] = [];
  for (const b of BRANCHES) {
    for (let i = 1; i <= b.defaultMeters; i++) {
      meters.push({
        id: `meter_${b.id}_${i}`,
        branch: b.id,
        label: `EB Meter ${i}`,
        consumerNo: `${b.id}-EB-${String(i).padStart(4, '0')}`,
        cycleMonths: 2,
        dueDate: `2026-12-${String(5 + i).padStart(2, '0')}`,
      });
    }
  }
  return meters;
}

const DEFAULT_PROVISION_CHIPS = [
  'Gas Cylinder',
  'Rice Bag',
  'Milk',
  'Vegetables & Groceries',
  'Cooking Oil',
  'Cleaning Liquid / Phenyl',
  'Brooms & Mops',
  'Light Bulbs / Electrical',
  'Plumbing Repair',
  'Drinking Can Deposit',
  'Tea / Coffee Powder',
];

function buildWaterCans(): WaterCanLog[] {
  const octCounts = [30, 35, 30, 40, 30, 35, 30, 40, 30, 35, 30, 40, 30, 35, 30];
  const novCounts = [15, 20, 15, 25, 15, 20, 15, 25, 15, 20, 15];
  const branches: BranchId[] = ['PG1', 'PG2', 'PG3'];
  const logs: WaterCanLog[] = [];
  let index = 0;
  octCounts.forEach((count, i) => {
    const day = 1 + i * 2;
    index += 1;
    logs.push({
      // A stable id: the same can entry must be recognised on every device,
      // so an Excel import can match it instead of adding it twice.
      id: `can_seed_${index}`,
      date: `2026-10-${String(day).padStart(2, '0')}`,
      branch: branches[i % 3],
      count,
    });
  });
  novCounts.forEach((count, i) => {
    const day = 1 + i;
    index += 1;
    logs.push({
      id: `can_seed_${index}`,
      date: `2026-11-${String(day).padStart(2, '0')}`,
      branch: branches[i % 3],
      count,
    });
  });
  return logs;
}

function buildWifi(): Wifi[] {
  const rows: [string, BranchId, string, string, number, string][] = [
    ['PG1 - Ground Floor Wi-Fi 1', 'PG1', 'GN_PG1_Ground_1', 'GoldenNest@101', 899, '2026-11-30'],
    ['PG1 - First Floor Wi-Fi 1', 'PG1', 'GN_PG1_First_1', 'GoldenNest@102', 899, '2026-11-14'],
    ['PG1 - Second Floor Wi-Fi 1', 'PG1', 'GN_PG1_Second_1', 'GoldenNest@103', 899, '2026-11-09'],
    ['PG1 - Main Router (Owner)', 'PG1', 'GN_PG1_Main', 'GoldenNest@104', 1199, '2026-12-05'],
    ['PG2 - Floor 1 Wi-Fi 1', 'PG2', 'GN_PG2_F1_1', 'GoldenNest@201', 899, '2026-11-25'],
    ['PG2 - Floor 1 Wi-Fi 2', 'PG2', 'GN_PG2_F1_2', 'GoldenNest@202', 899, '2026-11-12'],
    ['PG2 - Lounge Wi-Fi', 'PG2', 'GN_PG2_Lounge', 'GoldenNest@203', 799, '2026-12-01'],
    ['PG3 - Ground Floor Wi-Fi', 'PG3', 'GN_PG3_Ground', 'GoldenNest@301', 899, '2026-11-20'],
    ['PG3 - First Floor Wi-Fi', 'PG3', 'GN_PG3_First', 'GoldenNest@302', 899, '2026-12-10'],
    ['PG3 - Second Floor Wi-Fi', 'PG3', 'GN_PG3_Second', 'GoldenNest@303', 899, '2026-11-18'],
    ['PG3 - Third Floor Wi-Fi', 'PG3', 'GN_PG3_Third', 'GoldenNest@304', 799, '2026-12-15'],
    ['PG4 - Site Wi-Fi 1', 'PG4', 'GN_PG4_Site_1', 'GoldenNest@401', 799, '2026-12-20'],
    ['PG4 - Site Wi-Fi 2', 'PG4', 'GN_PG4_Site_2', 'GoldenNest@402', 799, '2026-11-16'],
    ['PG1 - CCTV Backup Line', 'PG1', 'GN_PG1_CCTV', 'GoldenNest@105', 599, '2026-11-30'],
  ];
  return rows.map(([label, branch, ssid, password, monthlyAmount, expiryDate], i) => ({
    // A stable id so the same connection is recognised on every device.
    id: `wifi_seed_${i + 1}`,
    label,
    branch,
    ssid,
    password,
    monthlyAmount,
    expiryDate,
    validityDays: 30,
  }));
}

export function seedSampleState(): AppState {
  const rooms = buildRooms();
  const ebMeters = buildEbMeters();
  const wifi = buildWifi();

  const ebBills: EbBill[] = [
    // Paid in October
    { id: 'eb_seed_1', meterId: 'meter_PG1_3', branch: 'PG1', cycle: 'Sep–Oct', amount: 2950, paidDate: '2026-10-06', mode: 'Cash' },
    { id: 'eb_seed_2', meterId: 'meter_PG2_2', branch: 'PG2', cycle: 'Sep–Oct', amount: 2400, paidDate: '2026-10-08', mode: 'UPI' },
    { id: 'eb_seed_3', meterId: 'meter_PG3_1', branch: 'PG3', cycle: 'Sep–Oct', amount: 1980, paidDate: '2026-10-09', mode: 'Cash' },
    // Paid in November
    { id: 'eb_seed_4', meterId: 'meter_PG1_1', branch: 'PG1', cycle: 'Oct–Nov', amount: 4850, paidDate: '2026-11-03', mode: 'UPI' },
    { id: 'eb_seed_5', meterId: 'meter_PG1_2', branch: 'PG1', cycle: 'Oct–Nov', amount: 3200, paidDate: '2026-11-04', mode: 'Cash' },
    { id: 'eb_seed_6', meterId: 'meter_PG2_1', branch: 'PG2', cycle: 'Oct–Nov', amount: 2750, paidDate: '2026-11-05', mode: 'UPI' },
    { id: 'eb_seed_7', meterId: 'meter_PG3_2', branch: 'PG3', cycle: 'Oct–Nov', amount: 2100, paidDate: '2026-11-06', mode: 'Card' },
    { id: 'eb_seed_8', meterId: 'meter_PG1_4', branch: 'PG1', cycle: 'Oct–Nov', amount: 3100, paidDate: '2026-11-08', mode: 'Cash' },
  ];

  const leasePayments = [
    { id: 'lse_seed_1', branch: 'PG1' as BranchId, monthKey: '2026-10', amount: 35000, date: '2026-10-01', mode: 'Cash' as const },
    { id: 'lse_seed_2', branch: 'PG2' as BranchId, monthKey: '2026-10', amount: 25000, date: '2026-10-01', mode: 'UPI' as const },
    { id: 'lse_seed_3', branch: 'PG3' as BranchId, monthKey: '2026-10', amount: 28000, date: '2026-10-01', mode: 'Cash' as const },
    { id: 'lse_seed_4', branch: 'PG1' as BranchId, monthKey: '2026-11', amount: 35000, date: '2026-11-01', mode: 'UPI' as const },
    { id: 'lse_seed_5', branch: 'PG2' as BranchId, monthKey: '2026-11', amount: 25000, date: '2026-11-01', mode: 'UPI' as const },
    { id: 'lse_seed_6', branch: 'PG3' as BranchId, monthKey: '2026-11', amount: 28000, date: '2026-11-01', mode: 'Cash' as const },
  ];

  const catering = [
    { id: 'cat_seed_1', date: '2026-10-15', branch: 'PG1' as BranchId, description: 'Catering — October first half', cash: 10000, upi: 12000, card: 0 },
    { id: 'cat_seed_2', date: '2026-10-31', branch: 'PG3' as BranchId, description: 'Catering — October full month', cash: 0, upi: 9000, card: 0 },
    { id: 'cat_seed_3', date: '2026-11-05', branch: 'PG1' as BranchId, description: 'Catering — November first half', cash: 12000, upi: 10000, card: 0 },
  ];

  const wifiRecharges = [
    { id: 'wr_seed_1', wifiId: wifi[2].id, date: '2026-10-10', amount: 899, mode: 'Cash' as const },
    { id: 'wr_seed_2', wifiId: wifi[1].id, date: '2026-10-14', amount: 899, mode: 'UPI' as const },
    { id: 'wr_seed_3', wifiId: wifi[5].id, date: '2026-10-13', amount: 899, mode: 'UPI' as const },
    { id: 'wr_seed_4', wifiId: wifi[12].id, date: '2026-10-17', amount: 799, mode: 'UPI' as const },
    { id: 'wr_seed_5', wifiId: wifi[0].id, date: '2026-10-31', amount: 899, mode: 'Cash' as const },
  ];

  const provisionExpenses = [
    { id: 'pv_seed_1', date: '2026-10-02', branch: 'PG1' as BranchId, item: 'Gas Cylinder', amount: 1150, mode: 'UPI' as const },
    { id: 'pv_seed_2', date: '2026-10-04', branch: 'PG1' as BranchId, item: 'Vegetables & Groceries', amount: 3100, mode: 'Cash' as const },
    { id: 'pv_seed_3', date: '2026-10-12', branch: 'PG2' as BranchId, item: 'Cleaning Liquid / Phenyl', amount: 380, mode: 'Cash' as const },
    { id: 'pv_seed_4', date: '2026-10-20', branch: 'PG3' as BranchId, item: 'Light Bulbs / Electrical', amount: 520, mode: 'UPI' as const },
    { id: 'pv_seed_5', date: '2026-11-01', branch: 'PG1' as BranchId, item: 'Gas Cylinder', amount: 1150, mode: 'UPI' as const },
    { id: 'pv_seed_6', date: '2026-11-02', branch: 'PG1' as BranchId, item: 'Vegetables & Groceries', amount: 3200, mode: 'Cash' as const },
    { id: 'pv_seed_7', date: '2026-11-03', branch: 'PG2' as BranchId, item: 'Milk', amount: 1450, mode: 'UPI' as const },
    { id: 'pv_seed_8', date: '2026-11-04', branch: 'PG3' as BranchId, item: 'Rice Bag', amount: 2600, mode: 'Cash' as const },
    { id: 'pv_seed_9', date: '2026-11-06', branch: 'PG1' as BranchId, item: 'Cooking Oil', amount: 1290, mode: 'UPI' as const },
    { id: 'pv_seed_10', date: '2026-11-08', branch: 'PG1' as BranchId, item: 'Tea / Coffee Powder', amount: 640, mode: 'Cash' as const },
  ];

  return {
    version: APP_STATE_VERSION,
    rooms,
    members: [],
    maintenance: [],
    waterCans: buildWaterCans(),
    canRate: 20,
    canSettlements: [
      // October was settled PG by PG — 165 + 170 + 165 cans × ₹20.
      { id: 'cst_seed_1', monthKey: '2026-10', branch: 'PG1' as BranchId, date: '2026-11-01', cash: 3300, upi: 0, card: 0 },
      { id: 'cst_seed_2', monthKey: '2026-10', branch: 'PG2' as BranchId, date: '2026-11-01', cash: 0, upi: 3400, card: 0 },
      { id: 'cst_seed_3', monthKey: '2026-10', branch: 'PG3' as BranchId, date: '2026-11-01', cash: 2000, upi: 1300, card: 0 },
    ],
    waterTankers: [
      { id: 'tnk_seed_1', date: '2026-10-03', branch: 'PG1', note: '25,000 L — Sri Vinayak Water Works', cost: 1500, mode: 'Cash' },
      { id: 'tnk_seed_2', date: '2026-10-10', branch: 'PG2', note: '25,000 L — Padur Water Supply', cost: 1200, mode: 'UPI' },
      { id: 'tnk_seed_3', date: '2026-10-18', branch: 'PG1', note: '5,000 L — Top-up tanker', cost: 1400, mode: 'Cash' },
      { id: 'tnk_seed_4', date: '2026-10-26', branch: 'PG3', note: '25,000 L — Sri Vinayak Water Works', cost: 1500, mode: 'UPI' },
      { id: 'tnk_seed_5', date: '2026-11-02', branch: 'PG1', note: '25,000 L — Sri Vinayak Water Works', cost: 1500, mode: 'UPI' },
      { id: 'tnk_seed_6', date: '2026-11-05', branch: 'PG2', note: '25,000 L — Padur Water Supply', cost: 1200, mode: 'Cash' },
      { id: 'tnk_seed_7', date: '2026-11-09', branch: 'PG3', note: '25,000 L — Sri Vinayak Water Works', cost: 1300, mode: 'UPI' },
    ],
    ebMeters,
    ebBills,
    leasePayments,
    catering,
    staff: [],
    staffAdvances: [],
    staffPayouts: [],
    wifi,
    wifiRecharges,
    provisionChips: [...DEFAULT_PROVISION_CHIPS],
    provisionExpenses,
    provisionSettlements: [],
    closedMonths: [],
  };
}

export function emptyState(): AppState {
  return {
    version: APP_STATE_VERSION,
    rooms: buildRooms(),
    members: [],
    maintenance: [],
    waterCans: [],
    canRate: 20,
    canSettlements: [],
    waterTankers: [],
    ebMeters: buildEbMeters(),
    ebBills: [],
    leasePayments: [],
    catering: [],
    staff: [],
    staffAdvances: [],
    staffPayouts: [],
    wifi: [],
    wifiRecharges: [],
    provisionChips: [...DEFAULT_PROVISION_CHIPS],
    provisionExpenses: [],
    provisionSettlements: [],
    closedMonths: [],
  };
}

export { DEFAULT_PROVISION_CHIPS };
