import { Suspense, lazy, useMemo, useState } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { useStore } from '../app/store/StoreProvider';
import { BRANCH_MAP } from '../app/store/branches';
import { defaulters, pnlFor } from '../app/store/selectors';
import type { BranchId } from '../app/store/types';
import { ExcelSyncButtons } from '../modules/excel-sync';
import { currentMonthKey, longDate, monthLabel, todayISO, monthOptions } from '../shared/lib/dates';
import { money } from '../shared/lib/format';
import { Badge, Btn, Card, PageIntro, SectionTitle, SelectInput, Stat } from '../shared/ui';

/** Recharts lives in its own chunk so the app paints before chart code parses. */
const PnlCharts = lazy(() => import('./dashboard/PnlCharts'));

export function DashboardPage() {
  const { state, branch } = useStore();
  const [month, setMonth] = useState(currentMonthKey());

  const pnl = useMemo(() => pnlFor(state, branch, month), [state, branch, month]);
  const rows = defaulters(state, branch);

  const isProfit = pnl.net >= 0;

  return (
    <div>
      <PageIntro
        title="Profit & Loss Dashboard"
        hint="One month at a time. Revenue is money received; expenses are money spent."
      />

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="mb-1.5 block text-base font-semibold">Month</span>
          <SelectInput value={month} onChange={(e) => setMonth(e.target.value)} className="min-w-[220px] font-semibold">
            {monthOptions().map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </SelectInput>
        </label>
        <Badge tone="neutral">
          Showing: {branch === 'ALL' ? 'ALL PGs (Combined View)' : BRANCH_MAP[branch as BranchId].name}
        </Badge>
        {rows.length > 0 ? (
          <Badge tone="bad">{rows.length} members owe rent</Badge>
        ) : (
          <Badge tone="good">No pending rent</Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Stat
          label="Total Revenue Collected"
          value={money(pnl.revenue)}
          tone="good"
          sub={
            <>
              Cash {money(pnl.rent.cash)} · UPI {money(pnl.rent.upi)} · Card {money(pnl.rent.card)}
              {pnl.maintenance > 0 ? (
                <>
                  <br />+ {money(pnl.maintenance)} maintenance from vacated members
                </>
              ) : null}
            </>
          }
        />
        <Stat
          label="Total Pending Rent (Defaulters)"
          value={money(pnl.pendingRent)}
          tone={pnl.pendingRent > 0 ? 'bad' : 'good'}
          sub={
            rows.length > 0
              ? `${rows.length} member(s) with balance due > 0`
              : 'Everyone has paid in full'
          }
        />
        <Stat
          label="Total Expenses This Month"
          value={money(pnl.expenses.total)}
          tone="warn"
          sub="Lease, EB, water, catering, staff, Wi-Fi and provisions"
        />
        <Stat
          label={isProfit ? 'Net profit this month' : 'Net loss this month'}
          value={money(Math.abs(pnl.net))}
          tone={isProfit ? 'good' : 'bad'}
          sub={
            <>
              {isProfit ? (
                <span className="inline-flex items-center gap-1 font-semibold text-good">
                  <TrendingUp size={18} aria-hidden /> Revenue minus expenses
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-bad">
                  <TrendingDown size={18} aria-hidden /> Spent more than received
                </span>
              )}
            </>
          }
        />
        <Stat
          label="Total Refundable Advance Held"
          value={money(pnl.advanceHeld)}
          tone="brand"
          sub="Security deposits of all members currently staying"
        />
      </div>

      <Suspense
        fallback={
          <div className="mt-6">
            <Card>
              <p className="text-base text-slate-600">Opening the charts…</p>
            </Card>
          </div>
        }
      >
        <PnlCharts state={state} branch={branch} month={month} />
      </Suspense>

      {pnl.pendingRent > 0 ? (
        <Card className="mt-5 border-bad/25 bg-bad/[0.06]">
          <p className="flex items-center gap-2 text-lg font-bold text-bad">
            <AlertTriangle size={26} aria-hidden /> {money(pnl.pendingRent)} is still pending from {rows.length} member(s).
          </p>
          <p className="mt-1 text-base text-slate-700">
            Open the “Rent &amp; Defaulters” tab to send a WhatsApp reminder in one tap.
          </p>
        </Card>
      ) : null}

      <Card className="mt-5">
        <SectionTitle>Backup, Reset &amp; Data</SectionTitle>
        <p className="mt-1 text-base text-slate-600">
          All information is saved on this device only — no internet or database needed. Today is{' '}
          {longDate(todayISO())}. Download an Excel backup regularly to move data between your laptop and
          phone.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <ExcelSyncButtons variant="primary" />
          <div className="flex flex-wrap gap-3 border-t border-line pt-4">
            <ResetButtons />
          </div>
        </div>
      </Card>
    </div>
  );
}

function ResetButtons() {
  const { resetToSample, resetToEmpty } = useStore();
  return (
    <>
      <Btn variant="secondary" onClick={resetToSample}>
        Load Sample Data Again
      </Btn>
      <Btn variant="danger" onClick={resetToEmpty}>
        Reset to Empty (start real records)
      </Btn>
    </>
  );
}
