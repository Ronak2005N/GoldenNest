import { Suspense, lazy, useMemo, useState } from 'react';
import { AlertTriangle, Lock, LockOpen, TrendingDown, TrendingUp } from 'lucide-react';
import { useStore } from '../app/store/StoreProvider';
import { BRANCH_MAP } from '../app/store/branches';
import { asOfForMonth, defaulters, pnlFor, vacatedDefaulters } from '../app/store/selectors';
import { closeMonth, closedMonthsSorted, isMonthClosed, openMonth } from '../app/store/monthLock';
import type { BranchId } from '../app/store/types';
import { ExcelSyncButtons } from '../modules/excel-sync';
import { currentMonthKey, longDate, monthLabel, todayISO, monthOptions } from '../shared/lib/dates';
import { money } from '../shared/lib/format';
import { Badge, Btn, Card, PageIntro, SectionTitle, SelectInput, Stat } from '../shared/ui';

/** Recharts lives in its own chunk so the app paints before chart code parses. */
const PnlCharts = lazy(() => import('./dashboard/PnlCharts'));

export function DashboardPage() {
  const { state, branch, update } = useStore();
  const [month, setMonth] = useState(currentMonthKey());

  const pnl = useMemo(() => pnlFor(state, branch, month), [state, branch, month]);
  // Pending rent is measured at the end of the month being looked at, so an
  // old month shows what was outstanding back then — not what is outstanding now.
  const asOf = asOfForMonth(month);
  const rows = defaulters(state, branch, asOf);
  // Members who left the PG but never settled — still a receivable.
  const leftRows = vacatedDefaulters(state, branch, asOf);
  const closed = isMonthClosed(state, month);
  const closedList = closedMonthsSorted(state);
  const canLock = month < currentMonthKey() && !closed;

  const isProfit = pnl.net >= 0;

  function lockMonth() {
    update((s) => closeMonth(s, month, todayISO()));
    window.alert(
      `${monthLabel(month)} is now closed. Its books are final — no back-dated payment, no void and no expense change can be made in that month until you unlock it.`,
    );
  }

  function unlockMonth(key: string) {
    update((s) => openMonth(s, key));
    window.alert(`${monthLabel(key)} is open again. You can now correct that month.`);
  }

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
          <Badge tone="bad">{rows.length} staying member(s) owe rent</Badge>
        ) : (
          <Badge tone="good">No pending rent from staying members</Badge>
        )}
        {leftRows.length > 0 ? (
          <Badge tone="warn">
            {leftRows.length} left-PG member(s) · {money(leftRows.reduce((n, d) => n + d.due, 0))} still owed
          </Badge>
        ) : null}
        {closed ? (
          <Badge tone="bad">
            <Lock size={16} aria-hidden /> {monthLabel(month)} is closed
          </Badge>
        ) : null}
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
            rows.length > 0 || leftRows.length > 0 ? (
              <>
                {rows.length > 0 ? `${rows.length} staying member(s) · ${money(pnl.pendingRentStaying)}` : null}
                {rows.length > 0 && leftRows.length > 0 ? ' · ' : null}
                {leftRows.length > 0 ? `${leftRows.length} left PG · ${money(pnl.pendingRentLeft)}` : null}
                <br />
                measured on {longDate(asOf)}
              </>
            ) : (
              `Everyone had paid in full on ${longDate(asOf)}`
            )
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
          label="Unpaid Bills Owed (Electricity, Water & Provisions)"
          value={money(pnl.unpaidEb + pnl.unpaidWater + pnl.unpaidProvisionCredit)}
          tone={pnl.unpaidEb + pnl.unpaidWater + pnl.unpaidProvisionCredit > 0 ? 'warn' : 'good'}
          sub={
            pnl.unpaidEb + pnl.unpaidWater + pnl.unpaidProvisionCredit > 0
              ? `${money(pnl.unpaidEb)} electricity (${pnl.unpaidEbCount} bill(s)) · ${money(pnl.unpaidWater)} water cans · ${money(pnl.unpaidProvisionCredit)} provisions bought on credit`
              : 'Every bill has been paid'
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
            <AlertTriangle size={26} aria-hidden /> {money(pnl.pendingRent)} is still pending from {rows.length + leftRows.length} member(s).
          </p>
          <p className="mt-1 text-base text-slate-700">
            Open the “Rent &amp; Defaulters” tab to send a WhatsApp reminder in one tap.
            {leftRows.length > 0
              ? ` ${leftRows.length} of them have left the PG — their dues are listed separately and no reminder is sent to them.`
              : ''}
          </p>
        </Card>
      ) : null}

      <Card className="mt-5">
        <SectionTitle>Month Lock — Keep Finalised Months Safe</SectionTitle>
        <p className="mt-1 text-base text-slate-600">
          A closed month is final: no back-dated payment, no void and no expense change can be made
          inside it by accident. Unlock it first if you really need to correct the past.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Badge tone={closed ? 'bad' : 'neutral'}>
            {closed ? 'CLOSED' : 'OPEN'} · {monthLabel(month)}
          </Badge>
          {closed ? (
            <Btn variant="secondary" onClick={() => unlockMonth(month)}>
              <LockOpen size={20} aria-hidden /> Unlock {monthLabel(month)}
            </Btn>
          ) : (
            <Btn variant="secondary" disabled={!canLock} onClick={lockMonth}>
              <Lock size={20} aria-hidden />
              {canLock ? `Lock ${monthLabel(month)}` : 'Only a finished month can be locked'}
            </Btn>
          )}
        </div>
        {closedList.length > 0 ? (
          <div className="mt-4 space-y-2 border-t border-line pt-4">
            <p className="text-base font-semibold">Closed months</p>
            {closedList.map((c) => (
              <div
                key={c.monthKey}
                className="well flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-base font-semibold">{monthLabel(c.monthKey)}</p>
                  <p className="text-base text-slate-600">Closed on {longDate(c.closedAt)}</p>
                </div>
                <Btn variant="secondary" onClick={() => unlockMonth(c.monthKey)}>
                  <LockOpen size={20} aria-hidden /> Unlock
                </Btn>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

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
