import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppState, BranchFilter } from './types';
import { emptyState, seedSampleState } from './seed';

const STATE_KEY = 'golden-nest-state-v2';
const BRANCH_KEY = 'golden-nest-branch-v1';

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.rooms) && Array.isArray(parsed.members)) {
        return parsed;
      }
    }
  } catch {
    // corrupt storage → fall through to fresh sample data
  }
  return seedSampleState();
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
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);
  const [branch, setBranchState] = useState<BranchFilter>(loadBranch);

  useEffect(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      window.alert(
        'Could not save data to this device. Storage may be full — try downloading the Excel backup first.',
      );
    }
  }, [state]);

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
      setState(seedSampleState());
    }
  }, []);

  const resetToEmpty = useCallback(() => {
    if (
      window.confirm(
        'Start with empty data? Members, payments and expenses will be cleared. Rooms, EB meters and Wi-Fi connections stay. This cannot be undone — download an Excel backup first if unsure.',
      )
    ) {
      setState(emptyState());
    }
  }, []);

  const value = useMemo(
    () => ({ state, update, replaceState, resetToSample, resetToEmpty, branch, setBranch }),
    [state, update, replaceState, resetToSample, resetToEmpty, branch, setBranch],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
