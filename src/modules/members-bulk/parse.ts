import type { BranchId, Floor, Member, Occupation, PaymentModeOrSplit } from '../../app/store/types';
import { withRentChange } from '../../entities/member/rent';
import { MEMBER_COLUMNS, IMPORT_COLUMN_ORDER, matchHeader } from './columns';
import type { MemberColumn } from './columns';

export interface DraftRow {
  line: number;
  name: string;
  mobile: string;
  branch: BranchId | '';
  roomCode: string;
  bedIndex: number | null;
  monthlyRent: number | null;
  advance: number | null;
  advanceMode: PaymentModeOrSplit | '';
  advanceModeRaw: string;
  advanceCash: number | null;
  advanceUpi: number | null;
  advanceCard: number | null;
  advanceDate: string;
  startDate: string;
  occupation: Occupation | '';
  errors: string[];
  warnings: string[];
}

const OCCUPATION_ALIASES: { match: string; value: Occupation }[] = [
  { match: 'student', value: 'Student' },
  { match: 'teacher', value: 'Teacher / Faculty' },
  { match: 'faculty', value: 'Teacher / Faculty' },
  { match: 'working', value: 'IT / Working Professional' },
  { match: 'professional', value: 'IT / Working Professional' },
  { match: 'it', value: 'IT / Working Professional' },
];

export function emptyDraft(line: number): DraftRow {
  return {
    line,
    name: '',
    mobile: '',
    branch: '',
    roomCode: '',
    bedIndex: null,
    monthlyRent: null,
    advance: null,
    advanceMode: '',
    advanceModeRaw: '',
    advanceCash: null,
    advanceUpi: null,
    advanceCard: null,
    advanceDate: '',
    startDate: '',
    occupation: '',
    errors: [],
    warnings: [],
  };
}

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[₹$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** Accepts 2026-11-18, 18/11/2026, 18-11-2026 and 18 Nov 2026. */
export function parseDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{1,2})[\s-]([a-z]{3})[a-z]*[\s-](\d{4})$/i.exec(v);
  if (m && MONTHS[m[2].toLowerCase()]) {
    return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function parseOccupation(value: string): Occupation | '' {
  const v = value.trim().toLowerCase();
  if (!v) return '';
  const hit = OCCUPATION_ALIASES.find((o) => v.includes(o.match));
  return hit ? hit.value : 'Other';
}

function parseBranch(value: string): BranchId | '' {
  const v = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (v === 'PG1' || v === 'PG2' || v === 'PG3' || v === 'PG4') return v;
  if (v === '1') return 'PG1';
  if (v === '2') return 'PG2';
  if (v === '3') return 'PG3';
  if (v === '4') return 'PG4';
  return '';
}

/** Reads "Cash" / "UPI" / "Card" / "Split" from a cell. Blank means "not told". */
export function parseAdvanceMode(value: string): PaymentModeOrSplit | '' {
  const v = value.trim().toLowerCase();
  if (!v) return '';
  if (v.startsWith('split')) return 'Split';
  if (v.startsWith('cash')) return 'Cash';
  if (v.startsWith('upi') || v.startsWith('gpay') || v.startsWith('phonepe') || v.startsWith('paytm')) {
    return 'UPI';
  }
  if (v.startsWith('card') || v.startsWith('credit') || v.startsWith('debit')) return 'Card';
  return '';
}

/** Split pasted text into rows. Tabs win; otherwise fall back to commas. */
export function splitRows(text: string): string[][] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const delim = lines.some((l) => l.includes('\t')) ? '\t' : ',';
  return lines.map((l) => l.split(delim).map((c) => c.trim()));
}

/**
 * Turn raw rows into drafts. The first row is treated as a header when it looks
 * like one; otherwise the documented column order is assumed.
 */
export function rowsToDrafts(rows: string[][]): DraftRow[] {
  if (!rows.length) return [];
  const header = matchHeader(rows[0]);
  const startIndex = header ? 1 : 0;
  const indexOf: Partial<Record<MemberColumn['key'], number>> =
    header ?? Object.fromEntries(IMPORT_COLUMN_ORDER.map((k, i) => [k, i]));

  const drafts: DraftRow[] = [];
  for (let r = startIndex; r < rows.length; r += 1) {
    const cells = rows[r];
    if (cells.every((c) => !c)) continue;
    const get = (key: MemberColumn['key']) => {
      const i = indexOf[key];
      return i === undefined ? '' : (cells[i] ?? '');
    };
    const draft = emptyDraft(r + 1);
    draft.name = get('name').trim();
    draft.mobile = digits(get('mobile'));
    draft.roomCode = get('roomCode').trim().toUpperCase();
    const bed = parseNumber(get('bedIndex'));
    draft.bedIndex = bed && bed > 0 ? Math.round(bed) : null;
    draft.monthlyRent = parseNumber(get('monthlyRent'));
    draft.advance = parseNumber(get('advance'));
    draft.advanceMode = parseAdvanceMode(get('advanceMode'));
    draft.advanceModeRaw = get('advanceMode').trim();
    draft.advanceCash = parseNumber(get('advanceCash'));
    draft.advanceUpi = parseNumber(get('advanceUpi'));
    draft.advanceCard = parseNumber(get('advanceCard'));
    draft.advanceDate = parseDate(get('advanceDate')) ?? '';
    draft.startDate = parseDate(get('startDate')) ?? '';
    draft.occupation = parseOccupation(get('occupation'));
    draft.branch = parseBranch(get('branch'));
    drafts.push(draft);
  }
  return drafts;
}

/** The same rows the owner would paste from Excel — used by the on-screen grid. */
export function gridToDrafts(
  rows: {
    name: string;
    mobile: string;
    room: string;
    bed: string;
    rent: string;
    advance: string;
    advanceMode: string;
    advanceDate: string;
  }[],
): DraftRow[] {
  return rows.map((r, i) => {
    const draft = emptyDraft(i + 1);
    draft.name = r.name.trim();
    draft.mobile = digits(r.mobile);
    draft.roomCode = r.room.trim().toUpperCase();
    const bed = parseNumber(r.bed);
    draft.bedIndex = bed && bed > 0 ? Math.round(bed) : null;
    draft.monthlyRent = parseNumber(r.rent);
    draft.advance = parseNumber(r.advance);
    draft.advanceMode = parseAdvanceMode(r.advanceMode);
    draft.advanceModeRaw = r.advanceMode.trim();
    draft.advanceDate = parseDate(r.advanceDate) ?? '';
    return draft;
  });
}

/** Column order shown to the owner in the hint line. */
export const COLUMN_HINT = MEMBER_COLUMNS.map((c) => c.label).join(' · ');

/** Room lookup per branch, plus which beds are already taken. */
export interface RoomIndex {
  byBranch: Map<BranchId, Map<string, { floor: Floor; sharing: number; monthlyRent: number }>>;
  takenBeds: Map<string, Set<number>>;
}

export function buildRoomIndex(rooms: AppStateRooms, members: Member[]): RoomIndex {
  const byBranch = new Map<BranchId, Map<string, { floor: Floor; sharing: number; monthlyRent: number }>>();
  for (const r of rooms) {
    let m = byBranch.get(r.branch);
    if (!m) {
      m = new Map();
      byBranch.set(r.branch, m);
    }
    m.set(r.code.toUpperCase(), { floor: r.floor, sharing: r.sharing, monthlyRent: r.monthlyRent });
  }
  const takenBeds = new Map<string, Set<number>>();
  for (const mem of members) {
    if (mem.status !== 'active') continue;
    const key = `${mem.branch}|${mem.roomCode.toUpperCase()}`;
    let s = takenBeds.get(key);
    if (!s) {
      s = new Set();
      takenBeds.set(key, s);
    }
    s.add(mem.bedIndex);
  }
  return { byBranch, takenBeds };
}

type AppStateRooms = { branch: BranchId; code: string; floor: Floor; sharing: number; monthlyRent: number }[];

/**
 * Check every draft against the rooms of the app and flag what can be imported.
 * Beds claimed by earlier rows of the same import are tracked here, so two rows
 * can never land on the same bed.
 */
export function validateDrafts(
  drafts: DraftRow[],
  index: RoomIndex,
  defaultBranch: BranchId,
): void {
  const claimed = new Map<string, Set<number>>();
  for (const d of drafts) {
    d.errors = [];
    d.warnings = [];
    if (!d.name) d.errors.push('Name is missing');
    if (d.mobile && d.mobile.length !== 10) d.errors.push('Mobile number is not 10 digits');
    if (!d.mobile) d.warnings.push('No mobile — no WhatsApp reminder for this member');

    const branch = d.branch || defaultBranch;
    d.branch = branch;
    const rooms = index.byBranch.get(branch);
    if (!rooms) {
      d.errors.push(`No rooms found for ${branch}`);
      continue;
    }
    const room = rooms.get(d.roomCode);
    if (!d.roomCode) {
      d.errors.push('Room number is missing');
    } else if (!room) {
      d.errors.push(`Room ${d.roomCode} does not exist in ${branch}`);
    } else {
      if (d.bedIndex === null) {
        d.errors.push('Bed number is missing');
      } else if (d.bedIndex > room.sharing) {
        d.errors.push(`Room ${d.roomCode} has only ${room.sharing} bed(s)`);
      } else {
        const key = `${branch}|${d.roomCode}`;
        const taken = index.takenBeds.get(key);
        const mine = claimed.get(key);
        if (taken?.has(d.bedIndex)) {
          d.errors.push(`Bed ${d.bedIndex} of room ${d.roomCode} is already occupied`);
        } else if (mine?.has(d.bedIndex)) {
          d.errors.push(`Bed ${d.bedIndex} of room ${d.roomCode} is used twice in this import`);
        } else {
          let s = claimed.get(key);
          if (!s) {
            s = new Set();
            claimed.set(key, s);
          }
          s.add(d.bedIndex);
        }
      }
      if (d.monthlyRent === null) d.monthlyRent = room.monthlyRent;
      else if (d.monthlyRent <= 0) d.errors.push('Monthly rent must be more than 0');
    }
    if (d.advance !== null && d.advance < 0) d.errors.push('Advance cannot be negative');
    for (const part of [d.advanceCash, d.advanceUpi, d.advanceCard]) {
      if (part !== null && part < 0) d.errors.push('Advance split amounts cannot be negative');
    }
    if (d.advanceModeRaw && !d.advanceMode) {
      d.warnings.push(`Advance mode “${d.advanceModeRaw}” is not known — saved as Cash`);
    }
    // A split that does not add up to the advance total would silently lose money.
    const splitParts = [d.advanceCash, d.advanceUpi, d.advanceCard];
    const anyPart = splitParts.some((p) => p !== null && p > 0);
    const splitSum = (d.advanceCash ?? 0) + (d.advanceUpi ?? 0) + (d.advanceCard ?? 0);
    if (d.advance === null && anyPart) {
      // A sheet with only the split columns still tells us the advance total.
      d.advance = splitSum;
    }
    if (d.advanceMode === 'Split') {
      if (!anyPart) {
        d.errors.push('Split advance needs the Cash, UPI and Card amounts');
      } else if (d.advance !== null && Math.abs(splitSum - d.advance) > 0.5) {
        d.errors.push('Advance Cash + UPI + Card must add up to the advance amount');
      }
    }
  }
}

/** The advance record a draft describes, with the mode/split worked out. */
export interface AdvancePlan {
  amount: number;
  mode: PaymentModeOrSplit;
  cash: number;
  upi: number;
  card: number;
  date: string;
}

export function planAdvance(d: DraftRow, today: string, fallback?: Member['advance']): AdvancePlan {
  const amount = d.advance ?? 0;
  const hasSplitParts = !!(d.advanceCash || d.advanceUpi || d.advanceCard);
  const date = d.advanceDate || d.startDate || today;

  // The sheet told us the mode — trust it and zero the buckets it does not use.
  if (d.advanceMode === 'Split') {
    return {
      amount,
      mode: 'Split',
      cash: d.advanceCash ?? 0,
      upi: d.advanceUpi ?? 0,
      card: d.advanceCard ?? 0,
      date,
    };
  }
  if (d.advanceMode === 'Cash' || d.advanceMode === 'UPI' || d.advanceMode === 'Card') {
    return {
      amount,
      mode: d.advanceMode,
      cash: d.advanceMode === 'Cash' ? amount : 0,
      upi: d.advanceMode === 'UPI' ? amount : 0,
      card: d.advanceMode === 'Card' ? amount : 0,
      date,
    };
  }

  // Split columns without a mode still mean a split.
  if (hasSplitParts) {
    return {
      amount,
      mode: 'Split',
      cash: d.advanceCash ?? 0,
      upi: d.advanceUpi ?? 0,
      card: d.advanceCard ?? 0,
      date,
    };
  }

  // Nothing said about the mode — an existing member keeps theirs, a new one is Cash.
  const mode: PaymentModeOrSplit = fallback?.mode ?? 'Cash';
  if (mode === 'Split') {
    return {
      amount,
      mode,
      cash: fallback?.cash ?? 0,
      upi: fallback?.upi ?? 0,
      card: fallback?.card ?? 0,
      date,
    };
  }
  return {
    amount,
    mode,
    cash: mode === 'Cash' ? amount : 0,
    upi: mode === 'UPI' ? amount : 0,
    card: mode === 'Card' ? amount : 0,
    date,
  };
}

/** Turn valid drafts into members. Existing members with the same mobile are updated. */
export function draftsToMembers(
  drafts: DraftRow[],
  index: RoomIndex,
  defaultBranch: BranchId,
  existing: Member[],
  today: string,
): { created: Member[]; updated: { member: Member; changes: string[] }[] } {
  const byMobile = new Map<string, Member>();
  for (const m of existing) {
    if (m.mobile) byMobile.set(m.mobile, m);
  }
  const created: Member[] = [];
  const updated: { member: Member; changes: string[] }[] = [];

  for (const d of drafts) {
    if (d.errors.length) continue;
    const branch = (d.branch || defaultBranch) as BranchId;
    const room = index.byBranch.get(branch)?.get(d.roomCode);
    const floor = room?.floor ?? 'Ground';
    const mobile = d.mobile;
    const existingMember = mobile ? byMobile.get(mobile) : undefined;

    if (existingMember) {
      const changes: string[] = [];
      let next: Member = { ...existingMember };
      if (existingMember.name !== d.name) {
        changes.push(`name “${existingMember.name}” → “${d.name}”`);
        next.name = d.name;
      }
      if (existingMember.roomCode !== d.roomCode || existingMember.bedIndex !== d.bedIndex) {
        changes.push(`bed ${existingMember.roomCode}/${existingMember.bedIndex} → ${d.roomCode}/${d.bedIndex}`);
        next.roomCode = d.roomCode;
        next.bedIndex = d.bedIndex as number;
        next.floor = floor;
      }
      if (d.monthlyRent !== null && existingMember.monthlyRent !== d.monthlyRent) {
        changes.push(`rent ${existingMember.monthlyRent ?? 0} → ${d.monthlyRent}`);
        // The new rate is added to the member's rent history from today — the
        // months already paid keep the rent they were charged at.
        const effective = d.startDate && d.startDate > today ? d.startDate : today;
        next = withRentChange(next, effective, d.monthlyRent);
      }
      if (d.advance !== null && existingMember.advance.amount !== d.advance) {
        changes.push(`advance ${existingMember.advance.amount} → ${d.advance}`);
        const plan = planAdvance(d, today, existingMember.advance);
        next.advance = {
          amount: plan.amount,
          mode: plan.mode,
          cash: plan.cash,
          upi: plan.upi,
          card: plan.card,
          date: plan.date,
        };
      } else if (d.advance !== null && d.advanceMode && existingMember.advance.mode !== d.advanceMode) {
        changes.push(`advance mode ${existingMember.advance.mode} → ${d.advanceMode}`);
        const plan = planAdvance(d, today, existingMember.advance);
        next.advance = {
          amount: plan.amount,
          mode: plan.mode,
          cash: plan.cash,
          upi: plan.upi,
          card: plan.card,
          date: plan.date,
        };
      }
      if (d.startDate && existingMember.startDate !== d.startDate) {
        next.startDate = d.startDate;
      }
      if (changes.length) updated.push({ member: next, changes });
      continue;
    }

    const plan = planAdvance(d, today);
    created.push({
      id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: d.name,
      occupation: d.occupation || 'Student',
      mobile,
      govtId: '[Aadhaar Redacted]',
      homeAddress: '',
      branch,
      floor,
      roomCode: d.roomCode,
      bedIndex: d.bedIndex as number,
      billingType: 'monthly',
      startDate: d.startDate || today,
      monthlyRent: d.monthlyRent ?? room?.monthlyRent ?? 0,
      // A brand new member has one rate for the whole stay.
      rentHistory: [
        { fromDate: d.startDate || today, amount: d.monthlyRent ?? room?.monthlyRent ?? 0 },
      ],
      advance: {
        amount: plan.amount,
        mode: plan.mode,
        cash: plan.cash,
        upi: plan.upi,
        card: plan.card,
        date: plan.date,
      },
      payments: [],
      status: 'active',
    });
  }
  return { created, updated };
}
