import { useMemo, useState } from 'react';
import { Download, MessageCircle, Pencil, Phone, Receipt, TrendingUp, UserPlus, Users, Wallet } from 'lucide-react';
import { useStore } from '../app/store/StoreProvider';
import { BRANCH_MAP } from '../app/store/branches';
import { activeMembers, vacatedMembers } from '../app/store/selectors';
import type { Member } from '../app/store/types';
import { currentRentRate, rentPosition, rentStatusText, withRentChange } from '../entities/member';
import { AddMemberModal, EditMemberModal, PaymentHistoryModal, RecordPaymentModal, VacateModal } from '../modules/members';
import { BulkMembersModal, downloadMembersList } from '../modules/members-bulk';
import { longDate, todayISO } from '../shared/lib/dates';
import { money } from '../shared/lib/format';
import { openWhatsApp, rentReminderMessage } from '../shared/lib/whatsapp';
import { Badge, Btn, Card, EmptyState, Field, Modal, MoneyInput, PageIntro, Tabs, TextInput } from '../shared/ui';

export function MembersPage() {
  const { state, branch } = useStore();
  const [tab, setTab] = useState('active');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [paying, setPaying] = useState<Member | null>(null);
  const [vacating, setVacating] = useState<Member | null>(null);
  const [changingRent, setChangingRent] = useState<Member | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [history, setHistory] = useState<Member | null>(null);

  const q = query.trim().toLowerCase();
  const filter = (m: Member) =>
    !q ||
    m.name.toLowerCase().includes(q) ||
    m.roomCode.toLowerCase().includes(q) ||
    m.mobile.includes(q);

  const active = useMemo(
    () => activeMembers(state, branch).filter(filter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, branch, q],
  );
  const vacated = useMemo(
    () => vacatedMembers(state, branch).filter(filter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, branch, q],
  );

  const activeCount = activeMembers(state, branch).length;

  return (
    <div>
      <PageIntro
        title="Members (Boys & Gents)"
        hint="Every member living in the PG right now, and everyone who has left."
      />

      <div className="mb-4 flex flex-col gap-3">
        <Tabs
          ariaLabel="Member lists"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'active', label: 'Currently Staying (Active)', badge: activeCount },
            { id: 'vacated', label: 'Left PG (Vacated History)', badge: vacatedMembers(state, branch).length },
          ]}
        />
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Btn variant="secondary" onClick={() => void downloadMembersList(state, branch)} className="shrink-0">
            <Download size={22} aria-hidden /> Download Members (.xlsx)
          </Btn>
          <Btn variant="secondary" onClick={() => setBulkOpen(true)} className="shrink-0">
            <Users size={22} aria-hidden /> Add Many Members
          </Btn>
          <Btn onClick={() => setAdding(true)} className="shrink-0">
            <UserPlus size={22} aria-hidden /> Add New Member
          </Btn>
        </div>
      </div>

      <div className="mb-4 max-w-md">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, room or phone number"
          aria-label="Search members"
        />
      </div>

      {tab === 'active' ? (
        active.length === 0 ? (
          <EmptyState
            title={q ? 'No member matches that search' : 'No members are staying right now'}
            hint={q ? 'Try a different name or room number.' : 'Tap “Add New Member” to admit your first member into a free bed.'}
            action={!q ? <Btn onClick={() => setAdding(true)}><UserPlus size={22} aria-hidden /> Add New Member</Btn> : undefined}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((m) => {
              const pos = rentPosition(m);
              return (
                <Card key={m.id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold leading-tight">{m.name}</p>
                      <p className="text-base text-slate-600">{m.occupation}</p>
                    </div>
                    <Badge
                      tone={pos.status === 'paid' ? 'good' : pos.status === 'partial' ? 'warn' : 'bad'}
                    >
                      {pos.status === 'paid' ? 'Paid in Full' : rentStatusText(pos)}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge tone="info">{BRANCH_MAP[m.branch].short}</Badge>
                    <Badge tone="neutral">Room {m.roomCode} · Bed {m.bedIndex}</Badge>
                    <Badge tone="neutral">{m.billingType === 'monthly' ? 'Monthly' : 'Daily stay'}</Badge>
                  </div>

                  <div className="well px-3 py-2">
                    <p className="text-base leading-snug text-slate-700">
                      {m.billingType === 'monthly'
                        ? `Rent ${money(pos.due)} · cycle ${longDate(pos.cycleStart)} to ${longDate(pos.cycleEnd)}`
                        : pos.label}
                    </p>
                    <p className="mt-1 text-base font-semibold">
                      Paid {money(pos.paid)} ·{' '}
                      <span className={pos.balance > 0 ? 'text-bad' : 'text-good'}>
                        Balance {money(pos.balance)}
                      </span>
                    </p>
                    {pos.olderDue > 0 ? (
                      <p className="mt-1 text-base font-semibold text-bad">
                        Older months unpaid: {money(pos.olderDue)} · Total due {money(pos.totalDue)}
                      </p>
                    ) : null}
                    {pos.credit > 0 ? (
                      <p className="mt-1 text-base text-good">
                        {money(pos.credit)} extra paid — it will cut next month&apos;s bill
                      </p>
                    ) : null}
                    {pos.prepaid > 0 ? (
                      <p className="mt-1 text-base text-info">
                        {money(pos.prepaid)} already paid for a month that has not started
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2 text-base">
                    <a
                      href={`tel:+91${m.mobile}`}
                      className="press inline-flex min-h-[52px] items-center gap-2 rounded-xl border border-line px-4 font-semibold hover:border-slate-400"
                    >
                      <Phone size={20} aria-hidden /> Call
                    </a>
                    <Btn variant="secondary" onClick={() => setPaying(m)}>
                      <Wallet size={20} aria-hidden /> Record Payment
                    </Btn>
                    <Btn variant="secondary" onClick={() => setHistory(m)}>
                      <Receipt size={20} aria-hidden /> Payment History
                    </Btn>
                    <Btn variant="secondary" onClick={() => setEditing(m)}>
                      <Pencil size={20} aria-hidden /> Edit Details
                    </Btn>
                    {m.billingType === 'monthly' ? (
                      <Btn variant="secondary" onClick={() => setChangingRent(m)}>
                        <TrendingUp size={20} aria-hidden /> Change Rent
                      </Btn>
                    ) : null}
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

                  <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
                    <p className="text-base text-slate-600">
                      Advance held: <span className="num-md">{money(m.advance.amount)}</span> ({m.advance.mode})
                    </p>
                    <Btn variant="danger" onClick={() => setVacating(m)}>
                      Vacate / Leave PG
                    </Btn>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : vacated.length === 0 ? (
        <EmptyState title="No members have left yet" hint="When a member leaves, use “Vacate / Leave PG” and the record will appear here with the full settlement." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {vacated.map((m) => {
            const s = m.settlement;
            const pos = rentPosition(m);
            return (
              <Card key={m.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold leading-tight">{m.name}</p>
                    <p className="text-base text-slate-600">
                      {BRANCH_MAP[m.branch].short} · Room {m.roomCode}
                    </p>
                  </div>
                  <Badge tone="neutral">Left PG</Badge>
                </div>
                <div className="well px-3 py-2">
                  <p className="text-base">Stayed: {longDate(m.startDate)} to {longDate(m.vacatedOn ?? '')}</p>
                  <p className="text-base font-semibold mt-1">
                    Advance {money(m.advance.amount)} · Maintenance cut {money(s?.maintenanceDeduction ?? 0)} ·
                    Pending rent cut {money(s?.pendingRentDeduction ?? 0)}
                  </p>
                  <p className="text-base font-bold mt-1 text-good">
                    Refund returned by {s?.refundMode ?? '—'}: {money(s?.refund ?? 0)}
                  </p>
                  <p className="text-base text-slate-600 mt-1">Settled on {longDate(s?.recordedOn ?? '')}</p>
                  <p className="mt-1 text-base font-semibold">
                    Rent charged: {money(currentRentRate(m))} per month
                  </p>
                  {pos.totalDue > 0 ? (
                    <p className="mt-1 text-base font-bold text-bad">
                      Rent still owed: {money(pos.totalDue)}
                    </p>
                  ) : null}
                </div>
                <p className="text-base text-slate-600">
                  Exit recorded on {longDate(m.vacatedOn ?? '')} · maintenance deduction kept as PG revenue
                </p>
                <div className="flex flex-wrap gap-2">
                  <Btn variant="secondary" onClick={() => setEditing(m)}>
                    <Pencil size={20} aria-hidden /> Edit Details
                  </Btn>
                  {m.payments.length > 0 ? (
                    <Btn variant="secondary" onClick={() => setHistory(m)}>
                      <Receipt size={20} aria-hidden /> Payment History
                    </Btn>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AddMemberModal key={adding ? 'adding' : 'closed'} open={adding} onClose={() => setAdding(false)} />
      <BulkMembersModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <RecordPaymentModal key={paying?.id ?? 'none'} member={paying} open={!!paying} onClose={() => setPaying(null)} />
      <VacateModal member={vacating} open={!!vacating} onClose={() => setVacating(null)} />
      <ChangeRentModal member={changingRent} onClose={() => setChangingRent(null)} />
      <EditMemberModal member={editing} onClose={() => setEditing(null)} />
      <PaymentHistoryModal member={history} onClose={() => setHistory(null)} />
    </div>
  );
}

/**
 * Changes a member's rent from a given date.
 *
 * The new rate is added to the member's rent history — every month before the
 * change keeps the rent it was charged at, so an increase never re-prices a
 * month that has already been paid.
 */
function ChangeRentModal({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const { update } = useStore();
  const [amount, setAmount] = useState('');
  const [fromDate, setFromDate] = useState(todayISO());
  const [error, setError] = useState('');

  if (!member) return null;

  const current = currentRentRate(member);

  function save() {
    const a = Number(amount);
    if (!a || a <= 0) {
      setError('Please enter the new monthly rent in rupees.');
      return;
    }
    if (a === current) {
      setError(`This member is already paying ${money(current)} — enter a different amount.`);
      return;
    }
    update((s) => ({
      ...s,
      members: s.members.map((m) => (m.id === member!.id ? withRentChange(m, fromDate, a) : m)),
    }));
    window.alert(
      `${member!.name}'s rent changed from ${money(current)} to ${money(a)} from ${longDate(fromDate)}.\n\n` +
        `Every month up to that date keeps ${money(current)} — nothing already paid is re-priced.`,
    );
    setAmount('');
    setError('');
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Change Rent — ${member.name}`}
      subtitle={`${BRANCH_MAP[member.branch].short} · Room ${member.roomCode} · now ${money(current)}/month`}
    >
      <div className="space-y-4">
        <Field label="New monthly rent (₹)" error={error}>
          <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(current)} />
        </Field>
        <Field label="New rent applies from" hint="Earlier months keep the rent they were charged at.">
          <TextInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <div className="rounded-xl bg-brand-soft px-4 py-3 text-base font-semibold text-brand-dark">
          Months from {longDate(fromDate)} are billed at {money(Number(amount || 0))}. Every earlier month
          stays at {money(current)}. The app keeps a full history of these changes.
        </div>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>Save New Rent</Btn>
          <Btn variant="secondary" full onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}
