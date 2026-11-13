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
  /**
   * The PG the money was collected for, at the moment it was collected.
   *
   * When a member moves from one PG to another, the rent they paid earlier
   * must stay in the books of the PG where it was actually collected — the old
   * PG's income cannot be moved to the new PG by a transfer. Records saved
   * before this field existed have no branch: for them the member's current
   * PG is used, exactly as before.
   */
  branch?: BranchId;
  /**
   * Set when the owner reverses this payment.
   *
   * A voided payment is never deleted — it stays in the record as proof of
   * the correction, but it counts for nothing: not towards the rent paid,
   * not towards the balance due, and not towards the month's revenue.
   */
  voidedAt?: string;
  /** Why the payment was reversed. */
  voidReason?: string;
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
  /** Rent money received that was more than the rent due — returned to the member. */
  rentCreditRefund?: number;
  refund: number;
  refundMode: PaymentMode;
  recordedOn: string;
}

/**
 * One rent rate and the day it started applying.
 *
 * A member's rent can change during the stay. Every cycle is priced with the
 * rate that was in force when that cycle started, so raising the rent in
 * November never re-prices a month that was already paid.
 */
export interface RentRateChange {
  /** The day this rate starts applying (yyyy-mm-dd). */
  fromDate: string;
  /** Monthly rent in rupees from this date. */
  amount: number;
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
  monthlyRent?: number; // monthly billing — the rate in force today
  /**
   * Every rent rate this member has been charged, oldest first.
   * Empty for members saved before rent history existed: for them the single
   * `monthlyRent` field is the rate for every cycle, exactly as before.
   */
  rentHistory?: RentRateChange[];
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
  /** Which PG the can bill was for. Empty means it covers every PG (older records). */
  branch?: BranchId;
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
  /** How many months one EB bill covers (usually 2). */
  cycleMonths?: number;
  /** Date the next bill is expected. */
  dueDate?: string;
}

export interface EbBill {
  id: string;
  meterId: string;
  branch: BranchId;
  cycle: string; // e.g. "Oct–Nov"
  /** The amount the electricity board billed. */
  amount: number;
  /** The day the bill was paid. Empty while the bill is still unpaid. */
  paidDate: string;
  /** How the bill was paid. Empty while the bill is unpaid. */
  mode?: PaymentMode;
  /**
   * 'paid' | 'unpaid' | 'partial'.
   * Bills saved before this field existed count as paid.
   */
  status?: 'paid' | 'unpaid' | 'partial';
  /** How much of a part-paid bill has been paid so far. */
  paidAmount?: number;
  /** The month the power was used (yyyy-mm) — the period the bill is for. */
  serviceMonth?: string;
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
  /** Date the person started working. */
  joinDate?: string;
  /** Date the person left. Once set, the salary stops accruing after this month. */
  leftDate?: string;
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
  /** How many days one recharge buys. Default 30. */
  validityDays?: number;
  /**
   * What each plan length costs for this connection (days → price).
   * A 365-day plan is not ₹899 — the owner enters the real price once and
   * every later recharge of that plan is pre-filled with it.
   */
  planPrices?: { days: number; amount: number }[];
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
  /**
   * How many units were bought. Optional — older records have only an amount.
   */
  quantity?: number;
  /**
   * The price of one unit (₹). Optional — older records have only an amount.
   */
  unitPrice?: number;
  /**
   * Who the goods were bought from. Optional — older records have no supplier.
   */
  supplier?: string;
  /**
   * 'paid' = the money left the bank when the goods were bought.
   * 'credit' = the goods were bought on credit; nothing has been paid yet, so
   * the cost does not touch this month's cash and stays a liability until it
   * is settled. Records saved before this field existed count as paid.
   */
  status?: 'paid' | 'credit';
}

/**
 * Money paid to a supplier to clear goods that were bought on credit.
 *
 * The purchase itself is not an expense when it is on credit — the money only
 * leaves the bank when the supplier is paid, and that payment is what the
 * profit and loss shows, exactly like the water can vendor.
 */
export interface ProvisionSettlement {
  id: string;
  /** The day the money was paid to the supplier. */
  date: string;
  branch: BranchFilter;
  /** The supplier whose credit balance this payment clears. */
  supplier: string;
  cash: number;
  upi: number;
  card: number;
}

/**
 * A month the owner has closed — the books for that month are final.
 *
 * A closed month cannot be changed by accident: no back-dated payment, no
 * void, no expense edit. The owner has to unlock it first, and only if they
 * really mean to correct the past.
 */
export interface ClosedMonth {
  /** The month that is closed (yyyy-mm). */
  monthKey: string;
  /** The day it was closed. */
  closedAt: string;
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
  /** Payments made to suppliers to clear goods bought on credit. */
  provisionSettlements: ProvisionSettlement[];
  /** Months the owner has closed — their books are final. */
  closedMonths: ClosedMonth[];
}

export const APP_STATE_VERSION = 3;

export type ExpenseCategory =
  | 'Owner Lease'
  | 'EB Electricity'
  | 'Water Cans'
  | 'Water Tankers'
  | 'Catering'
  | 'Staff Salary'
  | 'Wi-Fi Recharges'
  | 'Daily Provisions';
