/**
 * Column map for fast member entry.
 *
 * The owner keeps members in his own Excel/Google Sheet, so the importer must
 * cope with whatever column names he already uses. Every column lists the
 * aliases we accept; the first row of a paste/upload is sniffed for a header.
 */

export interface MemberColumn {
  key:
    | 'name'
    | 'mobile'
    | 'roomCode'
    | 'bedIndex'
    | 'monthlyRent'
    | 'advance'
    | 'advanceMode'
    | 'advanceCash'
    | 'advanceUpi'
    | 'advanceCard'
    | 'advanceDate'
    | 'startDate'
    | 'occupation'
    | 'branch';
  label: string;
  aliases: string[];
  hint: string;
}

/** Normalise a header cell: lowercase, drop currency symbols and punctuation. */
export function normaliseHeader(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/[₹$]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export const MEMBER_COLUMNS: MemberColumn[] = [
  {
    key: 'name',
    label: 'Name',
    aliases: ['name', 'membername', 'fullname', 'member', 'nameofmember'],
    hint: 'Full name of the member',
  },
  {
    key: 'mobile',
    label: 'Mobile',
    aliases: ['mobile', 'mobilenumber', 'phone', 'phonenumber', 'contact', 'contactnumber', 'mobile10'],
    hint: '10-digit mobile number (for WhatsApp reminders)',
  },
  {
    key: 'roomCode',
    label: 'Room',
    aliases: ['room', 'roomno', 'roomnumber', 'roomcode', 'roomid'],
    hint: 'Room number, e.g. G1',
  },
  {
    key: 'bedIndex',
    label: 'Bed',
    aliases: ['bed', 'bedno', 'bednumber', 'bedindex', 'bed1'],
    hint: 'Bed number inside the room',
  },
  {
    key: 'monthlyRent',
    label: 'Monthly Rent',
    aliases: ['rent', 'monthlyrent', 'rentpermonth', 'rentpm', 'monthlyrentperbed'],
    hint: 'Rent per bed per month in ₹',
  },
  {
    key: 'advance',
    label: 'Advance',
    aliases: ['advance', 'advanceamount', 'advancepaid', 'securitydeposit', 'deposit'],
    hint: 'Security deposit already collected',
  },
  {
    key: 'advanceMode',
    label: 'Advance Mode',
    aliases: ['advancemode', 'advancepaymentmode', 'advancepaidvia', 'advancevia'],
    hint: 'How the advance was received — Cash, UPI, Card or Split',
  },
  {
    key: 'advanceCash',
    label: 'Advance Cash (₹)',
    aliases: ['advancecash', 'advancecashamount', 'advancepaidincash'],
    hint: 'Part of the advance received in cash (only for Split)',
  },
  {
    key: 'advanceUpi',
    label: 'Advance UPI (₹)',
    aliases: ['advanceupi', 'advanceupiamount', 'advancepaidinupi'],
    hint: 'Part of the advance received by UPI (only for Split)',
  },
  {
    key: 'advanceCard',
    label: 'Advance Card (₹)',
    aliases: ['advancecard', 'advancecardamount', 'advancepaidincard'],
    hint: 'Part of the advance received by card (only for Split)',
  },
  {
    key: 'advanceDate',
    label: 'Advance Date',
    aliases: ['advancedate', 'dateofadvance', 'advancepaidon', 'advanceondate'],
    hint: 'Date the advance money was received',
  },
  {
    key: 'startDate',
    label: 'Joining Date',
    aliases: ['startdate', 'joiningdate', 'date', 'fromdate', 'dateofjoining', 'start'],
    hint: 'Date the member joined',
  },
  {
    key: 'occupation',
    label: 'Occupation',
    aliases: ['occupation', 'work', 'profession', 'job'],
    hint: 'Student, Teacher, Working Professional…',
  },
  {
    key: 'branch',
    label: 'PG Branch',
    aliases: ['branch', 'pgbranch', 'pg', 'hostel', 'location'],
    hint: 'PG1 / PG2 / PG3 / PG4 (optional — the branch chosen in the app is used when blank)',
  },
];

/**
 * The column order assumed when a pasted/uploaded sheet has no header row.
 *
 * The first nine are the long-standing order (Name → PG Branch); the advance
 * extras come after them so an old 9-column paste still lands on the right
 * fields. Sheets with a header row can use any order.
 */
export const IMPORT_COLUMN_ORDER: MemberColumn['key'][] = [
  'name',
  'mobile',
  'roomCode',
  'bedIndex',
  'monthlyRent',
  'advance',
  'startDate',
  'occupation',
  'branch',
  'advanceMode',
  'advanceCash',
  'advanceUpi',
  'advanceCard',
  'advanceDate',
];

/** Header row → column key map. Returns null when the row is not a header. */
export function matchHeader(cells: string[]): Partial<Record<MemberColumn['key'], number>> | null {
  const map: Partial<Record<MemberColumn['key'], number>> = {};
  let hits = 0;
  cells.forEach((cell, i) => {
    const norm = normaliseHeader(cell);
    if (!norm) return;
    const col = MEMBER_COLUMNS.find((c) => c.aliases.includes(norm));
    if (col && map[col.key] === undefined) {
      map[col.key] = i;
      hits += 1;
    }
  });
  // A header needs at least a name-like column, otherwise it is data.
  return hits >= 2 && map.name !== undefined ? map : null;
}
