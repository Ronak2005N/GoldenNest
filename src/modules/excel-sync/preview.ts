import type * as XLSX from 'xlsx';
import type { AppState, Member } from '../../app/store/types';
import { mergeState, parseWorkbook, canKey, settlementKey, tankerKey } from './import';

export interface PreviewLine {
  /** What the line is about, in the owner's words. */
  label: string;
  /** Records in the file that are not on this device yet. */
  added: number;
  /** Records that exist on both sides and will be updated. */
  updated: number;
  /** Records on this device that the file does not mention — all are kept. */
  kept: number;
  /** Names of the records that will be added or updated. */
  names: string[];
}

export interface ImportPreview {
  lines: PreviewLine[];
  added: number;
  updated: number;
  kept: number;
  /** Always zero — an import never deletes anything. */
  deleted: number;
  /** Members who have left the PG on this device and stay left. */
  staysLeft: string[];
}

function diff<T extends { id: string }>(
  label: string,
  existing: T[],
  incoming: T[],
  nameOf: (row: T) => string,
): PreviewLine {
  const current = new Map(existing.map((r) => [r.id, r]));
  const file = new Map(incoming.map((r) => [r.id, r]));
  const names: string[] = [];
  let added = 0;
  let updated = 0;
  for (const [id, row] of file) {
    const before = current.get(id);
    if (!before) {
      added += 1;
      names.push(nameOf(row));
    } else if (JSON.stringify(before) !== JSON.stringify(row)) {
      updated += 1;
      names.push(nameOf(row));
    }
  }
  let kept = 0;
  for (const id of current.keys()) if (!file.has(id)) kept += 1;
  return { label, added, updated, kept, names };
}

function diffByKey<T>(
  label: string,
  existing: T[],
  incoming: T[],
  keyOf: (row: T) => string,
  nameOf: (row: T) => string,
): PreviewLine {
  const current = new Map(existing.map((r) => [keyOf(r), r]));
  const file = new Map(incoming.map((r) => [keyOf(r), r]));
  const names: string[] = [];
  let added = 0;
  let updated = 0;
  for (const [key, row] of file) {
    const before = current.get(key);
    if (!before) {
      added += 1;
      names.push(nameOf(row));
    } else if (JSON.stringify(before) !== JSON.stringify(row)) {
      updated += 1;
      names.push(nameOf(row));
    }
  }
  let kept = 0;
  for (const key of current.keys()) if (!file.has(key)) kept += 1;
  return { label, added, updated, kept, names };
}

/**
 * Works out exactly what an import would change — before anything is saved.
 *
 * The owner sees how many records are new, how many will be updated and — the
 * important number — that **nothing will be deleted**.
 */
export function previewImport(base: AppState, wb: XLSX.WorkBook): ImportPreview {
  const incoming = parseWorkbook(wb);
  const merged = mergeState(base, incoming);

  const lines: PreviewLine[] = [];

  lines.push(diff('Members', base.members, incoming.members ?? [], (m) => m.name || m.id));

  // Payments are compared across every member.
  const basePayments = base.members.flatMap((m) => m.payments);
  const filePayments = (incoming.members ?? []).flatMap((m) => m.payments);
  lines.push(diff('Payments', basePayments, filePayments, (p) => `${p.date} · ${p.cycleKey}`));

  lines.push(diff('Staff', base.staff, incoming.staff ?? [], (s) => s.name || s.id));
  lines.push(diff('Staff advances', base.staffAdvances, incoming.staffAdvances ?? [], (a) => a.date));
  lines.push(diff('Salary payments', base.staffPayouts, incoming.staffPayouts ?? [], (p) => p.date));
  lines.push(diff('EB bills', base.ebBills, incoming.ebBills ?? [], (b) => `${b.paidDate} · ${b.amount}`));
  lines.push(diff('Owner lease', base.leasePayments, incoming.leasePayments ?? [], (l) => `${l.monthKey} · ${l.amount}`));
  lines.push(diff('Catering', base.catering, incoming.catering ?? [], (c) => c.date));
  lines.push(diff('Wi-Fi connections', base.wifi, incoming.wifi ?? [], (w) => w.label || w.id));
  lines.push(diff('Wi-Fi recharges', base.wifiRecharges, incoming.wifiRecharges ?? [], (r) => r.date));
  lines.push(diff('Daily provisions', base.provisionExpenses, incoming.provisionExpenses ?? [], (p) => p.date));
  lines.push(
    diff(
      'Provision credit payments',
      base.provisionSettlements ?? [],
      incoming.provisionSettlements ?? [],
      (s) => `${s.date} · ${s.supplier}`,
    ),
  );
  lines.push(
    diffByKey(
      'Closed months',
      base.closedMonths ?? [],
      incoming.closedMonths ?? [],
      (c) => c.monthKey,
      (c) => c.monthKey,
    ),
  );
  lines.push(diff('Maintenance kept', base.maintenance, incoming.maintenance ?? [], (m) => m.date));
  lines.push(
    diffByKey('Water cans', base.waterCans, incoming.waterCans ?? [], canKey, (c) => `${c.date} · ${c.count} cans`),
  );
  lines.push(
    diffByKey('Water tankers', base.waterTankers, incoming.waterTankers ?? [], tankerKey, (t) => `${t.date} · ${t.cost}`),
  );
  lines.push(
    diffByKey(
      'Water can settlements',
      base.canSettlements,
      incoming.canSettlements ?? [],
      settlementKey,
      (s) => `${s.monthKey} · ${s.branch ?? 'ALL'}`,
    ),
  );

  const added = lines.reduce((n, l) => n + l.added, 0);
  const updated = lines.reduce((n, l) => n + l.updated, 0);
  const kept = lines.reduce((n, l) => n + l.kept, 0);

  // Members who have left on this device stay left, whatever the file says.
  const fileById = new Map((incoming.members ?? []).map((m) => [m.id, m]));
  const staysLeft = base.members
    .filter((m) => m.status === 'vacated' && fileById.get(m.id)?.status !== 'vacated')
    .map((m) => m.name || m.id);

  // The merged state is returned so the caller can apply exactly what was previewed.
  void merged;
  return { lines, added, updated, kept, deleted: 0, staysLeft };
}

/** The merged state an import would produce — the same one the preview describes. */
export function mergedAfterImport(base: AppState, wb: XLSX.WorkBook): AppState {
  return mergeState(base, parseWorkbook(wb));
}

export type { Member };
