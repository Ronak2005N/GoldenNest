import { useState } from 'react';
import { LogOut, MessageCircle, Receipt, Wallet } from 'lucide-react';
import { useStore } from '../app/store/StoreProvider';
import { BRANCH_MAP } from '../app/store/branches';
import { activeMembers, defaulters, vacatedDefaulters } from '../app/store/selectors';
import type { Member } from '../app/store/types';
import { rentPosition, rentStatusText } from '../entities/member';
import { PaymentHistoryModal, RecordPaymentModal } from '../modules/members';
import { longDate } from '../shared/lib/dates';
import { money } from '../shared/lib/format';
import { openWhatsApp, rentReminderMessage } from '../shared/lib/whatsapp';
import { Badge, Btn, Card, EmptyState, PageIntro, Tabs } from '../shared/ui';

export function RentPage() {
  const { state, branch } = useStore();
  const [tab, setTab] = useState('defaulters');
  const [paying, setPaying] = useState<Member | null>(null);
  const [history, setHistory] = useState<Member | null>(null);

  const defaulterRows = defaulters(state, branch);
  // Members who have left the PG but never settled their rent. Kept apart
  // from the staying defaulters — no reminder is sent to them.
  const leftRows = vacatedDefaulters(state, branch);
  const leftTotal = leftRows.reduce((n, d) => n + d.due, 0);
  const members = activeMembers(state, branch);

  return (
    <div>
      <PageIntro
        title="Rent Collection & Defaulters"
        hint="Record full or part payments in Cash, UPI and Card. Anyone with a balance stays on the defaulters list until fully paid."
      />

      <div className="mb-5">
        <Tabs
          ariaLabel="Rent views"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'defaulters', label: 'Defaulters (Unpaid Rent)', badge: defaulterRows.length },
            { id: 'ledger', label: 'Rent Ledger (All Members)', badge: members.length },
          ]}
        />
      </div>

      {tab === 'defaulters' ? (
        defaulterRows.length === 0 ? (
          <EmptyState
            title="No unpaid rent — everyone staying has paid in full"
            hint="Wonderful. Any member who owes money will automatically appear here with a WhatsApp reminder button."
          />
        ) : (
          <div className="space-y-4">
            <Card className="border border-bad/25 bg-bad/[0.06]">
              <p className="text-lg font-bold text-bad">
                {defaulterRows.length} member(s) owe money — total pending{' '}
                <span className="num-xl">{money(defaulterRows.reduce((n, d) => n + d.balance, 0))}</span>
              </p>
            </Card>
            {defaulterRows.map((d) => {
              const m = d.member;
              return (
                <Card key={m.id} className="grid gap-4 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
                  <div>
                    <p className="text-lg font-semibold leading-tight">{m.name}</p>
                    <p className="text-base text-slate-600">{m.occupation}</p>
                    <p className="mt-1 text-base font-semibold">
                      {BRANCH_MAP[m.branch].short} · Room {m.roomCode} · Bed {m.bedIndex}
                    </p>
                    <p className="text-base text-slate-600">Cycle: {longDate(d.cycleStart)} to {longDate(d.cycleEnd)}</p>
                  </div>

                  <div className="well px-4 py-3">
                    <div className="flex justify-between gap-4 text-base">
                      <span className="text-slate-600">Total rent</span>
                      <span className="num-md">{money(d.due)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-base">
                      <span className="text-slate-600">Paid so far</span>
                      <span className="num-md text-good">{money(d.paid)}</span>
                    </div>
                    {d.olderDue > 0 ? (
                      <div className="flex justify-between gap-4 text-base">
                        <span className="text-slate-600">Older months still open</span>
                        <span className="num-md text-bad">{money(d.olderDue)}</span>
                      </div>
                    ) : null}
                    <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1">
                      <span className="font-semibold">Total due</span>
                      <span className="num-xl text-bad">{money(d.balance)}</span>
                    </div>
                    <p className="mt-1 text-base text-slate-600">
                      {d.status === 'unpaid' ? 'No payment received yet' : 'Part payment received'}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Badge tone={d.status === 'unpaid' ? 'bad' : 'warn'}>
                      {d.status === 'unpaid' ? 'UNPAID' : 'PARTIAL — BALANCE DUE'}
                    </Badge>
                    <Btn variant="primary" onClick={() => setPaying(m)}>
                      <Wallet size={20} aria-hidden /> Record Payment
                    </Btn>
                    <Btn
                      variant="success"
                      onClick={() =>
                        openWhatsApp(
                          m.mobile,
                          rentReminderMessage({
                            name: m.name,
                            branchLabel: BRANCH_MAP[m.branch].short,
                            room: m.roomCode,
                            balance: d.balance,
                            cycleDate: longDate(d.cycleStart),
                            rent: d.due,
                            paid: d.paid,
                          }),
                        )
                      }
                    >
                      <MessageCircle size={20} aria-hidden /> Send WhatsApp Reminder
                    </Btn>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : members.length === 0 ? (
        <EmptyState title="No members yet" hint="Admit a member from the Rooms tab first." />
      ) : (
        <div className="space-y-4">
          {members
            .map((m) => ({ m, pos: rentPosition(m) }))
            .sort((a, b) => b.pos.totalDue - a.pos.totalDue)
            .map(({ m, pos }) => (
              <Card key={m.id} className="grid gap-4 lg:grid-cols-[1.3fr_1.1fr_auto] lg:items-center">
                <div>
                  <p className="text-lg font-semibold leading-tight">{m.name}</p>
                  <p className="text-base text-slate-600">
                    {BRANCH_MAP[m.branch].short} · Room {m.roomCode} · Bed {m.bedIndex} · {m.occupation}
                  </p>
                  <p className="mt-1 text-base text-slate-600">
                    {m.billingType === 'monthly' ? 'Monthly' : 'Daily'}: {pos.label}
                  </p>
                </div>
                <div className="well px-4 py-3">
                  <div className="flex justify-between gap-4 text-base">
                    <span className="text-slate-600">Rent</span>
                    <span className="num-md">{money(pos.due)}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-base">
                    <span className="text-slate-600">Cash + UPI + Card paid</span>
                    <span className="num-md text-good">{money(pos.paid)}</span>
                  </div>
                  {pos.olderDue > 0 ? (
                    <div className="flex justify-between gap-4 text-base">
                      <span className="text-slate-600">Older months still open</span>
                      <span className="num-md text-bad">{money(pos.olderDue)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4 text-base">
                    <span className="font-semibold">Balance due</span>
                    <span className={`num-lg ${pos.totalDue > 0 ? 'text-bad' : 'text-good'}`}>
                      {money(pos.totalDue)}
                    </span>
                  </div>
                  {pos.credit > 0 ? (
                    <div className="flex justify-between gap-4 text-base">
                      <span className="text-slate-600">Extra paid, cuts next month</span>
                      <span className="num-md text-good">{money(pos.credit)}</span>
                    </div>
                  ) : null}
                  {pos.prepaid > 0 ? (
                    <div className="flex justify-between gap-4 text-base">
                      <span className="text-slate-600">Paid for a future month</span>
                      <span className="num-md text-info">{money(pos.prepaid)}</span>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col items-stretch gap-2">
                  <Badge tone={pos.status === 'paid' ? 'good' : pos.status === 'partial' ? 'warn' : 'bad'}>
                    {rentStatusText(pos)}
                  </Badge>
                  <Btn variant={pos.totalDue > 0 ? 'primary' : 'secondary'} onClick={() => setPaying(m)}>
                    <Wallet size={20} aria-hidden /> Record Payment
                  </Btn>
                  <Btn variant="secondary" onClick={() => setHistory(m)}>
                    <Receipt size={20} aria-hidden /> Payment History
                  </Btn>
                  {pos.totalDue > 0 ? (
                    <Btn
                      variant="success"
                      onClick={() =>
                        openWhatsApp(
                          m.mobile,
                          rentReminderMessage({
                            name: m.name,
                            branchLabel: BRANCH_MAP[m.branch].short,
                            room: m.roomCode,
                            balance: pos.totalDue,
                            cycleDate: longDate(pos.cycleStart),
                            rent: pos.due,
                            paid: pos.paid,
                          }),
                        )
                      }
                    >
                      <MessageCircle size={20} aria-hidden /> WhatsApp Reminder
                    </Btn>
                  ) : null}
                </div>
              </Card>
            ))}
        </div>
      )}

      {tab === 'defaulters' && leftRows.length > 0 ? (
        <section className="mt-8">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="headline flex items-center gap-2">
              <LogOut size={26} aria-hidden /> Left PG — Dues Pending
            </h2>
            <Badge tone="warn">
              {leftRows.length} member(s) · {money(leftTotal)} still owed
            </Badge>
          </div>
          <p className="mb-3 text-base text-slate-700">
            These members have left the PG without settling their rent. The amount below is still
            owed to you. No rent reminder is sent to them — use “Record Payment” only if they
            actually pay you.
          </p>
          <div className="space-y-4">
            {leftRows.map((row) => {
              const m = row.member;
              return (
                <Card
                  key={m.id}
                  className="grid gap-4 border-warn/45 bg-warn/[0.06] lg:grid-cols-[1.4fr_1fr_auto] lg:items-center"
                >
                  <div>
                    <p className="text-lg font-semibold leading-tight">{m.name}</p>
                    <p className="text-base text-slate-600">
                      {BRANCH_MAP[m.branch].short} · Room {m.roomCode} · Bed {m.bedIndex}
                    </p>
                    <p className="mt-1 text-base font-semibold">Left PG on {longDate(row.leftOn)}</p>
                    <p className="text-base text-slate-600">
                      Stay: {longDate(m.startDate)} to {longDate(row.leftOn)}
                    </p>
                  </div>

                  <div className="well px-4 py-3">
                    <div className="flex justify-between gap-4 text-base">
                      <span className="text-slate-600">Paid while staying</span>
                      <span className="num-md text-good">{money(row.paid)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-base">
                      <span className="text-slate-600">Refunded when leaving</span>
                      <span className="num-md">{money(row.refund)}</span>
                    </div>
                    <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1">
                      <span className="font-semibold">Rent still owed</span>
                      <span className="num-xl text-bad">{money(row.due)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Badge tone="warn">LEFT PG — DUES PENDING</Badge>
                    <Btn variant="primary" onClick={() => setPaying(m)}>
                      <Wallet size={20} aria-hidden /> Record Payment
                    </Btn>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <RecordPaymentModal key={paying?.id ?? 'none'} member={paying} open={!!paying} onClose={() => setPaying(null)} />
      <PaymentHistoryModal member={history} onClose={() => setHistory(null)} />
    </div>
  );
}
