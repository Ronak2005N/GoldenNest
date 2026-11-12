import { useCallback, useEffect, useState } from 'react';
import { AppShell, NAV_ITEMS } from './layout/AppShell';
import type { PageId } from './layout/AppShell';
import { DashboardPage } from '../pages/DashboardPage';
import { RoomsPage } from '../pages/RoomsPage';
import { MembersPage } from '../pages/MembersPage';
import { RentPage } from '../pages/RentPage';
import { WaterPage } from '../pages/WaterPage';
import { EbLeasePage } from '../pages/EbLeasePage';
import { StaffPage } from '../pages/StaffPage';
import { WifiPage } from '../pages/WifiPage';
import { ProvisionsPage } from '../pages/ProvisionsPage';

const PAGE_IDS = NAV_ITEMS.map((n) => n.id);

function pageFromUrl(): PageId {
  const p = new URLSearchParams(window.location.search).get('page');
  return (PAGE_IDS as string[]).includes(p ?? '') ? (p as PageId) : 'dashboard';
}

export function App() {
  const [page, setPageState] = useState<PageId>(pageFromUrl);

  // Deep links + browser back button (elderly users rely on Back to return where they were).
  useEffect(() => {
    const onPop = () => setPageState(pageFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setPage = useCallback((p: PageId) => {
    setPageState(p);
    const url = new URL(window.location.href);
    url.searchParams.set('page', p);
    window.history.pushState({ page: p }, '', url);
  }, []);

  return (
    <AppShell page={page} setPage={setPage}>
      {page === 'dashboard' ? <DashboardPage /> : null}
      {page === 'rooms' ? <RoomsPage /> : null}
      {page === 'members' ? <MembersPage /> : null}
      {page === 'rent' ? <RentPage /> : null}
      {page === 'water' ? <WaterPage /> : null}
      {page === 'eb' ? <EbLeasePage /> : null}
      {page === 'staff' ? <StaffPage /> : null}
      {page === 'wifi' ? <WifiPage /> : null}
      {page === 'provisions' ? <ProvisionsPage /> : null}
    </AppShell>
  );
}
