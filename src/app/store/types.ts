/** Golden Nest domain model — single localStorage-backed state tree. */

export type BranchId = 'PG1' | 'PG2' | 'PG3' | 'PG4';
export type BranchFilter = BranchId | 'ALL';
export type PaymentMode = 'Cash' | 'UPI' | 'Card';
export type PaymentModeOrSplit = PaymentMode | 'Split';
export type Floor = 'Ground' | 'First' | 'Second' | 'Third';
export type Occupation = 'Student' | 'Teacher / Faculty' | 'IT / Working Professional' | 'Other';
export type StaffRole = 'Cook' | 'Assistant' | 'Helper / Warden';

export interface Split {
  cash: number;
  upi: number;
  card: number;
}

export interface BranchInfo {
  id: BranchId;
  name: string;
  short: string;
  comingSoon?: boolean;
  floors: { floor: Floor; codes: string[] }[];
  defaultMeters: number;
}

export interface Room {
  id: string;
  branch: BranchId;
  floor: Floor;
  code: string;
  sharing: 1 | 2 | 3 | 4;
  ac: boolean;
  monthlyRent: number;
}

export interface RentPayment {
  id: string;
  date: string; // yyyy-mm-dd
  cycleKey: string; // monthly: cycle start date; daily: "daily"
  cash: number;
  upi: number;
  card: number;
  note?: string;
}

export interface AdvanceRecord {
  amount: number;
  mode: PaymentModeOrSplit;
  cash: number;
  upi: number;
  card: number;
  date: string;
}

export interface VacateSettlement {
  exitDate: string;
  maintenanceDeduction: number;
  pendingRentDeduction: number;
  refund: number;
  refundMode: PaymentMode;
  recordedOn: string;
}

export interface Member {
  id: string;
  name: string;
  occupation: Occupation;
  mobile: string;
  govtId: string; // seeds always use "[Aadhaar Redacted]"
  homeAddress: string;
  branch: BranchId;
  floor: Floor;
  roomCode: string;
  bedIndex: number; // 1-based
  billingType: 'monthly' | 'daily';
  startDate: string;
  endDate?: string; // daily stays only
  monthlyRent?: number; // monthly billing
  dailyRate?: number; // daily billing (default ₹500)
  advance: AdvanceRecord;
  payments: RentPayment[];
  status: 'active' | 'vacated';
  vacatedOn?: string;
  settlement?: VacateSettlement;
}

export interface MaintenanceRevenue {
  id: string;
  date: string;
  branch: BranchId;
  amount: number;
  memberId: string;
  memberName: string;
}

export interface WaterCanLog {
  id: string;
  date: string;
  branch: BranchId;
  count: number;
}

export interface CanSettlement {
  id: string;
  monthKey: string; // yyyy-mm
  date: string;
  cash: number;
  upi: number;
  card: number;
}

export interface WaterTanker {
  id: string;
  date: string;
  branch: BranchId;
  note: string;
  cost: number;
  mode: PaymentMode;
}

export interface EbMeter {
  id: string;
  branch: BranchId;
  label: string;
  consumerNo: string;
}

export interface EbBill {
  id: string;
  meterId: string;
  branch: BranchId;
  cycle: string; // e.g. "Oct–Nov"
  amount: number;
  paidDate: string;
  mode: PaymentMode;
}

export interface LeasePayment {
  id: string;
  branch: BranchId;
  monthKey: string;
  amount: number;
  date: string;
  mode: PaymentMode;
}

export interface CateringExpense {
  id: string;
  date: string;
  branch: BranchId;
  description: string;
  cash: number;
  upi: number;
  card: number;
}

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  mobile: string;
  branch: BranchId;
  salary: number;
}

export interface StaffAdvance {
  id: string;
  staffId: string;
  date: string;
  amount: number;
  mode: 'Cash' | 'UPI';
}

export interface StaffPayout {
  id: string;
  staffId: string;
  date: string;
  amount: number;
  mode: PaymentMode;
}

export interface Wifi {
  id: string;
  label: string;
  branch: BranchId;
  ssid: string;
  password: string;
  monthlyAmount: number;
  expiryDate: string;
}

export interface WifiRecharge {
  id: string;
  wifiId: string;
  date: string;
  amount: number;
  mode: PaymentMode;
}

export interface ProvisionExpense {
  id: string;
  date: string;
  branch: BranchFilter;
  item: string;
  amount: number;
  mode: PaymentMode;
}

export interface AppState {
  version: number;
  rooms: Room[];
  members: Member[];
  maintenance: MaintenanceRevenue[];
  waterCans: WaterCanLog[];
  canRate: number;
  canSettlements: CanSettlement[];
  waterTankers: WaterTanker[];
  ebMeters: EbMeter[];
  ebBills: EbBill[];
  leasePayments: LeasePayment[];
  catering: CateringExpense[];
  staff: Staff[];
  staffAdvances: StaffAdvance[];
  staffPayouts: StaffPayout[];
  wifi: Wifi[];
  wifiRecharges: WifiRecharge[];
  provisionChips: string[];
  provisionExpenses: ProvisionExpense[];
}

export const APP_STATE_VERSION = 1;

export type ExpenseCategory =
  | 'Owner Lease'
  | 'EB Electricity'
  | 'Water Cans'
  | 'Water Tankers'
  | 'Catering'
  | 'Staff Salary'
  | 'Wi-Fi Recharges'
  | 'Daily Provisions';
