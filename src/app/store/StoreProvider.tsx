import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppState, BranchFilter } from './types';
import { emptyState, seedSampleState } from './seed';
import { migrateState } from './migrate';
import { zeroedState } from './zero';
import { RecoveryScreen } from './RecoveryScreen';
import { todayISO } from '../../shared/lib/dates';

const STATE_KEY = 'golden-nest-state-v2';
const BRANCH_KEY = 'golden-nest-branch-v1';
/**
 * A one-time note that the books were cleared, so the dashboard can tell the
 * owner that the zero really happened.
 */
export const CLEARED_KEY = 'golden-nest-cleared-at';

interface Boot {
  /** The state to start with (sample data only on a brand new device). */
  state: AppState;
  /** True when a saved file exists but could not be read. */
  corrupted: boolean;
  /** The damaged text, exactly as found, so it can be kept for safekeeping. */
  damaged: string;
}

/**
 * Reads the saved data.
 *
 * If there is no saved file at all, this is a brand new device and it starts
 * **completely empty** — zero net profit, no members, nothing paid, nothing
 * unpaid — so the owner can feed the real numbers in from the beginning.
 * If a saved file exists but cannot be read, the app **stops** — it must never
 * quietly replace the owner's records with sample data, and it must never
 * overwrite the damaged file either.
 */
function loadState(): Boot {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STATE_KEY);
  } catch {
    // Storage is not readable at all (private mode, blocked cookies). There is
    // no saved file to lose, so the app starts empty.
    return { state: migrateState(emptyState()), corrupted: false, damaged: '' };
  }

  if (!raw) {
    // A brand new device — nothing to lose, and nothing made up either.
    return { state: migrateState(emptyState()), corrupted: false, damaged: '' };
  }

  try {
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rooms) || !Array.isArray(parsed.members)) {
      // The file is there but it is not the data we saved — treat it as damaged.
      return { state: migrateState(emptyState()), corrupted: true, damaged: raw };
    }
    return { state: migrateState(parsed), corrupted: false, damaged: '' };
  } catch {
    // The file is damaged. Stop here instead of hiding it behind sample data.
    return { state: migrateState(emptyState()), corrupted: true, damaged: raw };
  }
}

function loadBranch(): BranchFilter {
  try {
    const raw = localStorage.getItem(BRANCH_KEY);
    if (raw === 'ALL' || raw === 'PG1' || raw === 'PG2' || raw === 'PG3' || raw === 'PG4') return raw;
  } catch {
    /* ignore */
  }
  return 'ALL';
}

interface StoreValue {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  replaceState: (next: AppState) => void;
  resetToSample: () => void;
  resetToEmpty: () => void;
  branch: BranchFilter;
  setBranch: (b: BranchFilter) => void;
  /**
   * True when the device could not save the data (the storage is full or
   * blocked). The warning stays on screen until a save succeeds.
   */
  saveFailed: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const boot = useState(loadState)[0];
  const [state, setState] = useState<AppState>(boot.state);
  const [corrupted, setCorrupted] = useState(boot.corrupted);
  const [saveFailed, setSaveFailed] = useState(false);
  const wasFailing = useRef(false);
  const [branch, setBranchState] = useState<BranchFilter>(loadBranch);
  // The latest state, for callbacks that must not be re-created on every
  // change (the clear button must always work on the newest data).
  const stateRef = useRef(state);
  stateRef.current = state;
  // The exact text last written to the device, so another tab's copy of the
  // same books is not mistaken for a change (and no ping-pong can start).
  const lastSaved = useRef<string>('');

  useEffect(() => {
    // While the file is damaged, the app must not write anything: the damaged
    // file stays exactly as it is until the owner restores from a backup.
    if (corrupted) return;
    try {
      const json = JSON.stringify(state);
      localStorage.setItem(STATE_KEY, json);
      lastSaved.current = json;
      wasFailing.current = false;
      setSaveFailed(false);
    } catch {
      // The device could not save. Tell the owner once, and keep a permanent
      // warning on screen until the save works again.
      if (!wasFailing.current) {
        window.alert(
          'Could not save data to this device. Storage may be full — download the Excel backup now.',
        );
      }
      wasFailing.current = true;
      setSaveFailed(true);
    }
  }, [state, corrupted]);

  /**
   * Two tabs of the same app must never disagree about the books.
   *
   * When another tab saves — most importantly when it clears everything with
   * "Start From Zero" — this tab picks the new file up instead of keeping the
   * old numbers on screen and writing them back over the cleared ones.
   */
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STATE_KEY) return;
      if (!event.newValue) return; // the file was removed — leave the screen alone
      // The same books coming back from another tab are not a change.
      if (event.newValue === lastSaved.current) return;
      try {
        const parsed = JSON.parse(event.newValue) as AppState;
        if (!parsed || !Array.isArray(parsed.rooms) || !Array.isArray(parsed.members)) return;
        setState(migrateState(parsed));
      } catch {
        // A file we cannot read is left alone; the recovery screen deals with
        // a damaged file when this tab is opened afresh.
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setBranch = useCallback((b: BranchFilter) => {
    setBranchState(b);
    try {
      localStorage.setItem(BRANCH_KEY, b);
    } catch {
      /* ignore */
    }
  }, []);

  const update = useCallback((fn: (s: AppState) => AppState) => {
    setState((prev) => fn(prev));
  }, []);

  const replaceState = useCallback((next: AppState) => setState(next), []);

  const resetToSample = useCallback(() => {
    if (
      window.confirm(
        'Load the demo data again? It adds sample water, EB, lease, catering and provision rows so you can see how the screens behave. This replaces everything currently saved.',
      )
    ) {
      setState(migrateState(seedSampleState()));
    }
  }, []);

  /**
   * Starts the business from zero.
   *
   * Every rupee of real data goes: members, left-PG members, payments, rent
   * arrears, staff, water, EB bills, lease, catering, Wi-Fi recharges,
   * provisions, supplier credit and closed months. Only the *setup* survives —
   * the rooms, the EB meters, the Wi-Fi connections, the can rate and the item
   * buttons — so the app is ready to use at once and the profit starts at ₹0.
   *
   * The cleared books are written straight to the device and the screen is
   * reloaded, so every PG and every month is rebuilt from the cleared file and
   * the owner can *see* that the books really are at ₹0. If the device cannot
   * save, the screen is left alone and the owner is told, rather than quietly
   * bringing the old data back on the next reload.
   */
  const resetToEmpty = useCallback(() => {
    if (
      !window.confirm(
        'Start from zero?\n\nThis will clear EVERYTHING — in every PG and in every month: members, left-PG members, all payments, pending rent, staff, water cans, EB bills, lease, catering, Wi-Fi recharges and provisions.\n\nYour rooms, EB meters, Wi-Fi connections and item buttons will stay.\n\nThis cannot be undone — download an Excel backup first if you want to keep a copy.',
      )
    ) {
      return;
    }
    const next = zeroedState(stateRef.current);
    // Write the cleared books to the device first: the screen must never show
    // a clear that is not really saved.
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(next));
    } catch {
      setState(next);
      window.alert(
        'The data was cleared on screen but this device could not save it. Download an Excel backup now, and do not close this tab — the old data will come back when you reopen the app.',
      );
      return;
    }
    setState(next);
    // Leave a one-time note so the dashboard can show the owner that the books
    // really were cleared, in every PG and every month.
    try {
      localStorage.setItem(CLEARED_KEY, todayISO());
    } catch {
      /* ignore */
    }
    // Rebuild the whole screen from the cleared file, so no screen, chart or
    // tab can keep showing the old numbers.
    window.location.reload();
  }, []);

  const value = useMemo(
    () => ({ state, update, replaceState, resetToSample, resetToEmpty, branch, setBranch, saveFailed }),
    [state, update, replaceState, resetToSample, resetToEmpty, branch, setBranch, saveFailed],
  );

  // Damaged data file: the app stops here instead of showing sample data.
  if (corrupted) {
    return (
      <RecoveryScreen
        damaged={boot.damaged}
        onRestore={(next) => {
          setState(next);
          setCorrupted(false);
        }}
        onStartFresh={(next) => {
          setState(next);
          setCorrupted(false);
        }}
      />
    );
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
