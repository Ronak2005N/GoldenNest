import type { BranchId, BranchInfo, Floor } from './types';

/** The four Golden Nest branches with their exact room numbers (per spec). */
export const BRANCHES: BranchInfo[] = [
  {
    id: 'PG1',
    name: 'PG 1 — Golden Nest 1 (Main PG)',
    short: 'PG1 Main',
    defaultMeters: 7,
    floors: [
      { floor: 'Ground', codes: ['G1', 'G2', 'G3', 'G4'] },
      { floor: 'First', codes: ['F1', 'F2', 'F3', 'F4'] },
      { floor: 'Second', codes: ['S1', 'S2', 'S3', 'S4'] },
    ],
  },
  {
    id: 'PG2',
    name: 'PG 2 — Golden Nest 2 (Near Bus Stop)',
    short: 'PG2 Bus Stop',
    defaultMeters: 4,
    floors: [{ floor: 'First', codes: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'] }],
  },
  {
    id: 'PG3',
    name: 'PG 3 — Golden Nest 3 (Opposite Main PG)',
    short: 'PG3 Opposite Main',
    defaultMeters: 3,
    floors: [
      { floor: 'Ground', codes: ['G1', 'G2'] },
      { floor: 'First', codes: ['F1', 'F2', 'F3'] },
      { floor: 'Second', codes: ['S1', 'S2', 'S3'] },
      { floor: 'Third', codes: ['T1', 'T2'] },
    ],
  },
  {
    id: 'PG4',
    name: 'PG 4 — Golden Nest 4 (Near Padur Panchayat)',
    short: 'PG4 Padur Panchayat',
    comingSoon: true,
    defaultMeters: 0,
    floors: [
      { floor: 'Ground', codes: ['G1', 'G2', 'G3', 'G4'] },
      { floor: 'First', codes: ['F1', 'F2', 'F3', 'F4', 'F5'] },
      { floor: 'Second', codes: ['S1', 'S2', 'S3', 'S4', 'S5'] },
      { floor: 'Third', codes: ['T1', 'T2'] },
    ],
  },
];

export const BRANCH_MAP: Record<BranchId, BranchInfo> = Object.fromEntries(
  BRANCHES.map((b) => [b.id, b]),
) as Record<BranchId, BranchInfo>;

export const FLOORS: Floor[] = ['Ground', 'First', 'Second', 'Third'];

export function branchShort(id: BranchId): string {
  return BRANCH_MAP[id]?.short ?? id;
}

export function branchLabel(id: BranchId): string {
  return BRANCH_MAP[id]?.name ?? id;
}

export function branchLabelFor(filter: string, id?: BranchId): string {
  if (filter === 'ALL') return 'All PGs (Combined)';
  if (id) return branchLabel(id);
  return filter;
}

export function roomCount(branch: BranchId): number {
  return BRANCH_MAP[branch].floors.reduce((n, f) => n + f.codes.length, 0);
}
