import { useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import type { Member, RentPayment } from '../../../app/store/types';
import { useStore } from '../../../app/store/StoreProvider';
import { BRANCH_MAP } from '../../../app/store/branches';
import { rentPosition } from '../../../entities/member';
import { longDate, todayISO } from '../../../shared/lib/dates';
import { money, splitLine, uid } from '../../../shared/lib/format';
import { openWhatsApp, paymentReceiptMessage } from '../../../shared/lib/whatsapp';
import { Badge, Btn, Field, InfoRow, Modal, MoneyInput, SectionTitle, TextInput } from '../../../shared/ui';

/**
 * Record a full, partial or split (Cash + UPI + Card) rent payment,
 * then show a clear receipt the owner can send on WhatsApp.
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
  const { update } = useStore();
  const [cash, setCash] = useState('');
  const [upi, setUpi] = useState('');
  const [card, setCard] = useState('');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{ cash: number; upi: number; card: number; balance: number } | null>(null);

  const pos = useMemo(() => (member ? rentPosition(member) : null), [member]);

  if (!member || !pos) return null;

  function reset() {
    setCash('');
    setUpi('');
    setCard('');
    setDate(todayISO());
    setError('');
    setReceipt(null);
  }

  function fillBalance(source: 'Cash' | 'UPI') {
    if (!pos) return;
    const remaining = Math.max(0, pos.balance - (Number(cash || 0) + Number(upi || 0) + Number(card || 0)));
    if (source === 'Cash') setCash(String(Number(cash || 0) + remaining));
    else setUpi(String(Number(upi || 0) + remaining));
  }

  function save() {
    if (!member || !pos) return;
    const c = Number(cash || 0);
    const u = Number(upi || 0);
    const d = Number(card || 0);
    const total = c + u + d;
    if (total <= 0) {
      setError('Enter at least some money in Cash, UPI or Card.');
      return;
    }
    const payment: RentPayment = {
      id: uid('pay'),
      date,
      cycleKey: pos.cycleKey,
      cash: c,
      upi: u,
      card: d,
    };
    update((s) => ({
      ...s,
      members: s.members.map((m) => (m.id === member.id ? { ...m, payments: [...m.payments, payment] } : m)),
    }));
    const newBalance = Math.max(0, pos.balance - total);
    setReceipt({ cash: c, upi: u, card: d, balance: newBalance });
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
                label="Balance Still Due"
                value={receipt.balance > 0 ? money(receipt.balance) : 'None — paid in full'}
              />
            </div>
            <p className="mt-3 text-base text-slate-700">
              Received on {longDate(date)} for the cycle starting {longDate(pos.cycleStart)}.
            </p>
          </div>
          <Btn
            full
            variant="success"
            onClick={() =>
              openWhatsApp(
                member.mobile,
                paymentReceiptMessage({
                  name: member.name,
                  branchLabel: BRANCH_MAP[member.branch].short,
                  room: member.roomCode,
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
        <div className="well p-4">
          <InfoRow label="Rent for this cycle" value={money(pos.due)} />
          <InfoRow label="Paid so far" value={money(pos.paid)} />
          <InfoRow label="Balance due" value={money(pos.balance)} />
          <p className="mt-2 text-base text-slate-600">{pos.label}</p>
        </div>

        {pos.balance <= 0 ? (
          <div className="rounded-2xl border border-good/25 bg-good/[0.07] p-4">
            <Badge tone="good">Paid in full</Badge>
            <p className="mt-2 text-base text-slate-700">
              This cycle is already settled. You can still record an extra payment if needed.
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
            <span className={pos.balance - (Number(cash || 0) + Number(upi || 0) + Number(card || 0)) > 0 ? 'text-bad' : 'text-good'}>
              {money(Math.max(0, pos.balance - (Number(cash || 0) + Number(upi || 0) + Number(card || 0))))}
            </span>
          </p>
          <p className="mt-1 text-base text-slate-600">{splitLine({ cash: Number(cash || 0), upi: Number(upi || 0), card: Number(card || 0) })}</p>
        </div>

        {error ? <p className="font-semibold text-bad">{error}</p> : null}

        <Btn full onClick={save}>
          Save Payment &amp; Show Receipt
        </Btn>
      </div>
    </Modal>
  );
}
