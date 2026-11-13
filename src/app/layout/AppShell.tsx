import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BedDouble,
  Download,
  Droplets,
  HardHat,
  LayoutDashboard,
  Plug,
  ShoppingBasket,
  Users,
  Wallet,
  Wifi,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore } from '../store/StoreProvider';
import { BRANCHES } from '../store/branches';
import { defaulters } from '../store/selectors';
import type { BranchFilter } from '../store/types';
import { ExcelSyncButtons } from '../../modules/excel-sync';
import { exportExcel } from '../../modules/excel-sync/export';
import { Btn } from '../../shared/ui';

export type PageId =
  | 'dashboard'
  | 'rooms'
  | 'members'
  | 'rent'
  | 'water'
  | 'eb'
  | 'staff'
  | 'wifi'
  | 'provisions';

export const NAV_ITEMS: { id: PageId; label: string; short: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard (Profit & Loss)', short: 'Dashboard', icon: LayoutDashboard },
  { id: 'rooms', label: 'Rooms & Vacant Beds', short: 'Rooms', icon: BedDouble },
  { id: 'members', label: 'Members (Boys & Gents)', short: 'Members', icon: Users },
  { id: 'rent', label: 'Rent & Defaulters', short: 'Rent', icon: Wallet },
  { id: 'water', label: 'Water Cans & Tankers', short: 'Water', icon: Droplets },
  { id: 'eb', label: 'EB Bills, Lease & Catering', short: 'EB & Lease', icon: Plug },
  { id: 'staff', label: 'Staff Salary & Advances', short: 'Staff', icon: HardHat },
  { id: 'wifi', label: 'Wi-Fi Manager', short: 'Wi-Fi', icon: Wifi },
  { id: 'provisions', label: 'Daily Provisions', short: 'Provisions', icon: ShoppingBasket },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-brand text-xl font-bold tracking-[0.02em] text-white shadow-[0_2px_10px_-3px_rgb(180_83_9/0.65)]"
      >
        GN
      </span>
      <span className="leading-tight">
        <span className="block text-xl font-semibold tracking-[-0.01em]">Golden Nest PG Manager</span>
        <span className="meta block">Men&apos;s PG &middot; 4 branches &middot; easy daily record</span>
      </span>
    </div>
  );
}

function BranchSwitcher() {
  const { branch, setBranch } = useStore();
  const options: { id: BranchFilter; label: string }[] = [
    { id: 'ALL', label: 'ALL PGs (Combined View)' },
    ...BRANCHES.map((b) => ({
      id: b.id as BranchFilter,
      label: `${b.short}${b.comingSoon ? ' (Coming Soon)' : ''}`,
    })),
  ];
  return (
    <div>
      <p id="branch-switcher-label" className="meta mb-1.5 font-semibold">
        Choose PG Branch
      </p>
      <div role="group" aria-labelledby="branch-switcher-label" className="scroll-x flex gap-2 overflow-x-auto pb-1">
        {options.map((o) => {
          const active = o.id === branch;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setBranch(o.id)}
              aria-pressed={active}
              className={`press min-h-[54px] shrink-0 rounded-xl border px-5 text-base font-semibold ${
                active
                  ? 'border-brand-dark/30 bg-brand text-white shadow-[0_1px_2px_rgb(15_23_42/0.16)]'
                  : 'border-line bg-white/70 text-ink hover:bg-white hover:border-line-strong'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AppShell({ page, setPage, children }: { page: PageId; setPage: (p: PageId) => void; children: React.ReactNode }) {
  const { state, branch, saveFailed } = useStore();
  const defaulterCount = defaulters(state, branch).length;
  const navRef = useRef<HTMLElement>(null);
  const [moreRight, setMoreRight] = useState(false);

  /** The banner's "Download backup now" button. */
  const downloadBackupNow = useCallback(async () => {
    try {
      await exportExcel(state);
    } catch {
      window.alert('Could not create the Excel file. Please try again.');
    }
  }, [state]);

  /* The phone nav is a horizontal strip: fade the edge that still has items,
     and keep the active page in view when the route changes. */
  const updateNavEdges = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateNavEdges();
    window.addEventListener('resize', updateNavEdges);
    return () => window.removeEventListener('resize', updateNavEdges);
  }, [updateNavEdges]);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('button[aria-current="page"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'center' });
    updateNavEdges();
  }, [page, updateNavEdges]);

  return (
    <div className="min-h-screen">
      {saveFailed ? (
        <div
          role="alert"
          className="sticky top-0 z-50 border-b-2 border-bad bg-bad px-4 py-3 text-base font-semibold text-white"
        >
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3">
            <AlertTriangle size={24} aria-hidden className="shrink-0" />
            <p className="flex-1">
              Storage Full: New changes cannot be saved. Please download your Excel backup to secure
              your data.
            </p>
            <button
              type="button"
              onClick={() => void downloadBackupNow()}
              className="press min-h-[48px] rounded-xl border border-white/70 bg-white px-4 font-semibold text-bad"
            >
              <Download size={20} aria-hidden className="mr-2 inline" />
              Download backup now
            </button>
          </div>
        </div>
      ) : null}
      <header className="glass-strong sticky top-0 z-40 border-b border-line">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 pt-3">
          <BrandMark />
          <div className="hidden md:block">
            <ExcelSyncButtons compact />
          </div>
        </div>
        <div className="mx-auto max-w-[1440px] px-4 pb-3 pt-3">
          <BranchSwitcher />
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] gap-6 px-4 py-6">
        <aside className="glass sticky top-[196px] hidden max-h-[calc(100vh-212px)] w-[288px] shrink-0 overflow-y-auto rounded-[1.25rem] px-3 py-4 lg:block">
          <nav aria-label="Main menu" className="flex flex-col gap-1.5">
            {NAV_ITEMS.map((item) => {
              const active = item.id === page;
              const Icon = item.icon;
              const badge = item.id === 'rent' ? defaulterCount : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPage(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`press flex min-h-[56px] items-center gap-3 rounded-xl px-4 text-left text-base font-semibold ${
                    active
                      ? 'border border-brand/30 bg-brand-soft text-brand-dark shadow-[0_1px_2px_rgb(15_23_42/0.08)]'
                      : 'border border-transparent text-ink hover:bg-white/70'
                  }`}
                >
                  <Icon size={24} aria-hidden className={active ? 'text-brand' : 'text-slate-600'} />
                  <span className="flex-1 leading-tight">{item.label}</span>
                  {badge > 0 ? (
                    <span
                      className="num-md rounded-full bg-bad px-2.5 py-0.5 text-sm text-white"
                      aria-label={`${badge} members with unpaid rent`}
                    >
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </aside>

        <main id="main" className="min-w-0 flex-1 pb-32 lg:pb-12">
          {children}
          <HelpFooter />
        </main>
      </div>

      <nav
        ref={navRef}
        aria-label="Main menu"
        onScroll={updateNavEdges}
        className="glass-strong scroll-x fixed inset-x-3 bottom-3 z-40 flex gap-1 overflow-x-auto rounded-[1.25rem] px-2 py-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const active = item.id === page;
          const Icon = item.icon;
          const badge = item.id === 'rent' ? defaulterCount : 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPage(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`press flex min-h-[64px] min-w-[92px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-center ${
                active
                  ? 'border border-brand/30 bg-brand-soft text-brand-dark shadow-[0_1px_2px_rgb(15_23_42/0.08)]'
                  : 'border border-transparent text-slate-700'
              }`}
            >
              <span className="relative">
                <Icon size={24} aria-hidden />
                {badge > 0 ? (
                  <span className="absolute -right-2.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-xs font-bold text-white">
                    {badge}
                  </span>
                ) : null}
              </span>
              <span className="text-sm font-bold leading-tight">{item.short}</span>
            </button>
          );
        })}
      </nav>
      {moreRight ? (
        <div
          aria-hidden
          className="pointer-events-none fixed bottom-3 right-3 z-40 h-[76px] w-12 rounded-r-[1.25rem] bg-gradient-to-l from-white/95 to-transparent lg:hidden"
        />
      ) : null}
    </div>
  );
}

/** Always-available help block at the bottom of every page. */

export function HelpFooter() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-8 border-t border-line pt-4">
      <Btn variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Need help? Read these tips
      </Btn>
      {open ? (
        <ul className="mt-3 list-disc space-y-1.5 pl-6 text-base text-slate-700">
          <li>Everything you type is saved on this device automatically — there is no Save button for the app itself.</li>
          <li>Use the big buttons at the top to switch between PG branches.</li>
          <li>Download the Excel sheet every week to keep a backup on your laptop.</li>
          <li>Red numbers mean money is still pending. Amber means part payment received.</li>
          <li>For any problem, take a photo of the screen and call the support number in your contact list.</li>
        </ul>
      ) : null}
    </div>
  );
}
