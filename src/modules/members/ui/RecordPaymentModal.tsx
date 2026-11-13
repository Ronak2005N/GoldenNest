import { useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import type { Member, RentPayment } from '../../../app/store/types';
import { useStore } from '../../../app/store/StoreProvider';
import { BRANCH_MAP } from '../../../app/store/branches';
import { monthLockMessage } from '../../../app/store/monthLock';
import { payableCycles, rentPosition } from '../../../entities/member';
import { longDate, monthKey, todayISO } from '../../../shared/lib/dates';
import { money, splitLine, uid } from '../../../shared/lib/format';
import { openWhatsApp, paymentReceiptMessage } from '../../../shared/lib/whatsapp';
import { Badge, Btn, Field, InfoRow, Modal, MoneyInput, SectionTitle, SelectInput, TextInput } from '../../../shared/ui';

/**
 * Record a full, partial or split (Cash + UPI + Card) rent payment,
 * then show a clear receipt the owner can send on WhatsApp.
 *
 * The owner chooses which month the money is for: the month running now, the
 * next month (paid in advance) or an older month that is still open.
 */
export function RecordPaymentModal({
  member,
  open,
  onClose,
  onRecorded,
}: {
  member: Member | null;
  open: boolean;
  onClose: () => void;
  onRecorded?: () => void;
}) {
  const { state, update } = useStore();
  const [cash, setCash] = useState('');
  const [upi, setUpi] = useState('');
  const [card, setCard] = useState('');
  const [date, setDate] = useState(todayISO());
  const [cycleKey, setCycleKey] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{
    cash: number;
    upi: number;
    card: number;
    balance: number;
    cycleLabel: string;
    cycleStart: string;
  } | null>(null);

  const cycles = useMemo(() => (member ? payableCycles(member) : []), [member]);
  const pos = useMemo(() => (member ? rentPosition(member) : null), [member]);

  if (!member || !pos) return null;

  // Kept in a local so the receipt button can use it inside a callback.
  const who = member;

  // Falls back to the month running now whenever the picked month is not open.
  const current = cycles.find((c) => c.kind === 'current') ?? cycles[cycles.length - 1];
  const target = cycles.find((c) => c.cycleKey === cycleKey) ?? current;
  const isNext = target.kind === 'next';
  const isOlder = target.kind === 'older';

  // A closed month is final: money cannot be booked into it, and an old month
  // that has been closed cannot be settled either.
  const lockedByDate = monthLockMessage(state, date, 'record a payment');
  const lockedByCycle =
    target.kind === 'older' && target.cycleKey !== 'daily'
      ? monthLockMessage(state, `${monthKey(target.cycleKey)}-01`, 'settle that closed month')
      : null;
  const locked = lockedByDate ?? lockedByCycle;

  function reset() {
    setCash('');
    setUpi('');
    setCard('');
    setDate(todayISO());
    setCycleKey('');
    setError('');
    setReceipt(null);
  }

  function fillBalance(source: 'Cash' | 'UPI') {
    const remaining = Math.max(0, target.gap - (Number(cash || 0) + Number(upi || 0) + Number(card || 0)));
    if (source === 'Cash') setCash(String(Number(cash || 0) + remaining));
    else setUpi(String(Number(upi || 0) + remaining));
  }

  function save() {
    const c = Number(cash || 0);
    const u = Number(upi || 0);
    const d = Number(card || 0);
    const total = c + u + d;
    if (total <= 0) {
      setError('Enter at least some money in Cash, UPI or Card.');
      return;
    }
    if (locked) {
      setError(locked);
      return;
    }
    const payment: RentPayment = {
      id: uid('pay'),
      date,
      cycleKey: target.cycleKey,
      cash: c,
      upi: u,
      card: d,
    };
    update((s) => ({
      ...s,
      members: s.members.map((m) => (m.id === who.id ? { ...m, payments: [...m.payments, payment] } : m)),
    }));
    setReceipt({
      cash: c,
      upi: u,
      card: d,
      balance: Math.max(0, target.gap - total),
      cycleLabel: target.label,
      cycleStart: target.cycleStart,
    });
    onRecorded?.();
  }

  if (receipt) {
    const total = receipt.cash + receipt.upi + receipt.card;
    return (
      <Modal open={open} onClose={() => { reset(); onClose(); }} title="Payment Receipt" subtitle="Cash · UPI · Card breakdown">
        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed border-brand/60 bg-brand-soft/70 p-5">
            <SectionTitle>Golden Nest PG — Payment Received</SectionTitle>
            <p className="mt-1 text-base font-semibold text-brand-dark">
              {BRANCH_MAP[member.branch].short} · Room {member.roomCode} · Bed {member.bedIndex}
            </p>
            <p className="mt-3 text-lg font-bold">{member.name}</p>
            <div className="mt-3">
              <InfoRow label="Paid in Cash" value={money(receipt.cash)} />
              <InfoRow label="Paid in UPI" value={money(receipt.upi)} />
              <InfoRow label="Paid in Card" value={money(receipt.card)} />
              <InfoRow label="Total Received" value={money(total)} />
              <InfoRow
                label="Balance Still Due for this Month"
                value={receipt.balance > 0 ? money(receipt.balance) : 'None — paid in full'}
              />
            </div>
            <p className="mt-3 text-base text-slate-700">
              Received on {longDate(date)} for the month {receipt.cycleLabel}.
            </p>
          </div>
          <Btn
            full
            variant="success"
            onClick={() =>
              openWhatsApp(
                who.mobile,
                paymentReceiptMessage({
                  name: who.name,
                  branchLabel: BRANCH_MAP[who.branch].short,
                  room: who.roomCode,
                  cash: receipt.cash,
                  upi: receipt.upi,
                  card: receipt.card,
                  total,
                  balance: receipt.balance,
                  date: longDate(date),
                }),
              )
            }
          >
            <MessageCircle size={22} aria-hidden /> Send Receipt on WhatsApp
          </Btn>
          <Btn full variant="secondary" onClick={() => { reset(); onClose(); }}>
            Done
          </Btn>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Record Rent Payment"
      subtitle={`${member.name} · ${BRANCH_MAP[member.branch].short} · Room ${member.roomCode}`}
    >
      <div className="space-y-4">
        {cycles.length > 1 ? (
          <Field label="Which month is this money for?">
            <SelectInput value={target.cycleKey} onChange={(e) => setCycleKey(e.target.value)}>
              {cycles.map((c) => (
                <option key={c.cycleKey} value={c.cycleKey}>
                  {c.kind === 'older'
                    ? 'Still open from earlier — '
                    : c.kind === 'next'
                      ? 'Next month (paid in advance) — '
                      : 'This month — '}
                  {c.label} · {c.gap > 0 ? `${money(c.gap)} due` : 'already paid'}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : null}

        <div className="well p-4">
          <InfoRow label="Rent for this month" value={money(target.due)} />
          <InfoRow label="Paid so far" value={money(target.paid)} />
          <InfoRow label="Balance due" value={money(target.gap)} />
          <p className="mt-2 text-base text-slate-600">{target.label}</p>
        </div>

        {isNext ? (
          <div className="rounded-2xl border border-info/30 bg-info/[0.07] p-4">
            <Badge tone="info">Paid in advance</Badge>
            <p className="mt-2 text-base text-slate-700">
              This money is kept for the next month. It is shown as already paid for that month and
              will not be shown as arrears now.
            </p>
          </div>
        ) : null}

        {isOlder ? (
          <div className="rounded-2xl border border-warn/30 bg-warn/[0.07] p-4">
            <Badge tone="warn">Older month still open</Badge>
            <p className="mt-2 text-base text-slate-700">
              This month was left unpaid earlier. Recording the money here clears that old
              balance.
            </p>
          </div>
        ) : null}

        {target.gap <= 0 ? (
          <div className="rounded-2xl border border-good/25 bg-good/[0.07] p-4">
            <Badge tone="good">Paid in full</Badge>
            <p className="mt-2 text-base text-slate-700">
              This month is already settled. You can still record an extra payment if needed — it
              will reduce next month&apos;s bill.
            </p>
          </div>
        ) : null}

        {pos.olderDue > 0 ? (
          <div className="rounded-2xl border border-bad/25 bg-bad/[0.06] p-4">
            <p className="text-base font-semibold text-bad">
              Older rent of {money(pos.olderDue)} is still unpaid.
            </p>
            <p className="mt-1 text-base text-slate-700">
              Pick the earlier month below to clear it, or send a WhatsApp reminder.
            </p>
          </div>
        ) : null}

        {pos.credit > 0 ? (
          <div className="rounded-2xl border border-good/25 bg-good/[0.07] p-4">
            <p className="text-base font-semibold text-good">
              {money(pos.credit)} extra was paid earlier — it will reduce next month&apos;s bill
              automatically.
            </p>
          </div>
        ) : null}

        {pos.prepaid > 0 ? (
          <div className="rounded-2xl border border-info/25 bg-info/[0.07] p-4">
            <p className="text-base font-semibold text-info">
              {money(pos.prepaid)} is already paid for a month that has not started yet.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Amount paid in Cash (₹)">
            <MoneyInput value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Amount paid in UPI (₹)">
            <MoneyInput value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Amount paid in Card (₹)">
            <MoneyInput value={card} onChange={(e) => setCard(e.target.value)} placeholder="0" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Btn variant="secondary" onClick={() => fillBalance('Cash')}>
            Fill balance in Cash
          </Btn>
          <Btn variant="secondary" onClick={() => fillBalance('UPI')}>
            Fill balance in UPI
          </Btn>
          <Btn variant="ghost" onClick={() => { setCash(''); setUpi(''); setCard(''); }}>
            Clear amounts
          </Btn>
        </div>

        <Field label="Date money was received">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <div className="well px-4 py-3">
          <p className="text-base font-semibold">
            Total now entered: {money(Number(cash || 0) + Number(upi || 0) + Number(card || 0))} · New balance:{' '}
            <span className={target.gap - (Number(cash || 0) + Number(upi || 0) + Number(card || 0)) > 0 ? 'text-bad' : 'text-good'}>
              {money(Math.max(0, target.gap - (Number(cash || 0) + Number(upi || 0) + Number(card || 0))))}
            </span>
          </p>
          <p className="mt-1 text-base text-slate-600">{splitLine({ cash: Number(cash || 0), upi: Number(upi || 0), card: Number(card || 0) })}</p>
        </div>

        {error ? <p className="font-semibold text-bad">{error}</p> : null}

        {locked ? (
          <div className="rounded-2xl border border-bad/35 bg-bad/[0.07] p-4">
            <p className="text-base font-semibold text-bad">{locked}</p>
          </div>
        ) : null}

        <Btn full onClick={save} disabled={!!locked}>
          Save Payment &amp; Show Receipt
        </Btn>
      </div>
    </Modal>
  );
}
