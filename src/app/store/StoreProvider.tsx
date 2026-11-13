import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppState, BranchFilter } from './types';
import { emptyState, seedSampleState } from './seed';
import { migrateState } from './migrate';
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
 * If there is no saved file at all, this is a brand new device and the sample
 * data is loaded. If a saved file exists but cannot be read, the app **stops**
 * — it must never quietly replace the owner's records with sample data, and it
 * must never overwrite the damaged file either.
 */
function loadState(): Boot {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STATE_KEY);
  } catch {
    // Storage is not readable at all (private mode, blocked cookies). There is
    // no saved file to lose, so the app starts fresh.
    return { state: migrateState(seedSampleState()), corrupted: false, damaged: '' };
  }

  if (!raw) {
    // A brand new device — nothing to lose.
    return { state: migrateState(seedSampleState()), corrupted: false, damaged: '' };
  }

  try {
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rooms) || !Array.isArray(parsed.members)) {
      // The file is there but it is not the data we saved — treat it as damaged.
      return { state: migrateState(seedSampleState()), corrupted: true, damaged: raw };
    }
    return { state: migrateState(parsed), corrupted: false, damaged: '' };
  } catch {
    // The file is damaged. Stop here instead of hiding it behind sample data.
    return { state: migrateState(seedSampleState()), corrupted: true, damaged: raw };
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
    if (window.confirm('Load the sample data again? This replaces everything currently saved.')) {
      setState(migrateState(seedSampleState()));
    }
  }, []);

  const resetToEmpty = useCallback(() => {
    if (
      window.confirm(
        'Start with empty data? Members, payments and expenses will be cleared. Rooms, EB meters and Wi-Fi connections stay. This cannot be undone — download an Excel backup first if unsure.',
      )
    ) {
      setState(migrateState(emptyState()));
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
