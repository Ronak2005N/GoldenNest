import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppState, BranchFilter } from './types';
import { emptyState, seedSampleState } from './seed';
import { migrateState } from './migrate';
import { zeroedState } from './zero';
import { RecoveryScreen } from './RecoveryScreen';

const STATE_KEY = 'golden-nest-state-v2';
const BRANCH_KEY = 'golden-nest-branch-v1';

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

  useEffect(() => {
    // While the file is damaged, the app must not write anything: the damaged
    // file stays exactly as it is until the owner restores from a backup.
    if (corrupted) return;
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
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
   */
  const resetToEmpty = useCallback(() => {
    if (
      window.confirm(
        'Start from zero?\n\nThis will clear EVERYTHING: members, left-PG members, all payments, pending rent, staff, water cans, EB bills, lease, catering, Wi-Fi recharges and provisions.\n\nYour rooms, EB meters, Wi-Fi connections and item buttons will stay.\n\nThis cannot be undone — download an Excel backup first if you want to keep a copy.',
      )
    ) {
      setState((prev) => zeroedState(prev));
    }
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
