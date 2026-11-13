import { useMemo, useState } from 'react';
import { Ban, Check, Lock } from 'lucide-react';
import type { Member } from '../../../app/store/types';
import { useStore } from '../../../app/store/StoreProvider';
import { BRANCH_MAP } from '../../../app/store/branches';
import { monthLockMessage } from '../../../app/store/monthLock';
import { rentPosition } from '../../../entities/member/rent';
import { longDate, todayISO } from '../../../shared/lib/dates';
import { money } from '../../../shared/lib/format';
import { Badge, Btn, Field, InfoRow, Modal, TextInput } from '../../../shared/ui';

/**
 * Payment history and reversals.
 *
 * A payment is never deleted. When the owner realises a payment was typed in
 * wrong, it is *voided*: the record stays on file with the date and the
 * reason, so there is always an audit trail of what was received and what was
 * corrected. A voided payment counts for nothing — not towards the rent
 * paid, not towards the balance, and not towards that month's revenue.
 */
export function PaymentHistoryModal({
  member,
  onClose,
}: {
  member: Member | null;
  onClose: () => void;
}) {
  const { state, update } = useStore();
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const live = useMemo(
    () => (member ? state.members.find((m) => m.id === member.id) ?? member : null),
    [state.members, member],
  );

  if (!member || !live) return null;

  const payments = [...live.payments].sort((a, b) => b.date.localeCompare(a.date));
  const livePayments = payments.filter((p) => !p.voidedAt);
  const voided = payments.filter((p) => p.voidedAt);
  const received = livePayments.reduce((n, p) => n + p.cash + p.upi + p.card, 0);
  const pos = rentPosition(live);
  const target = payments.find((p) => p.id === voidingId);
  const targetLocked = target ? monthLockMessage(state, target.date, 'void this payment') : null;

  function voidPayment() {
    if (!target) return;
    // A closed month is final — a payment inside it cannot be reversed.
    const locked = monthLockMessage(state, target.date, 'void this payment');
    if (locked) {
      window.alert(locked);
      return;
    }
    const text = reason.trim();
    update((s) => ({
      ...s,
      members: s.members.map((m) =>
        m.id === live!.id
          ? {
              ...m,
              payments: m.payments.map((p) =>
                p.id === target.id
                  ? { ...p, voidedAt: todayISO(), voidReason: text || 'Entered by mistake' }
                  : p,
              ),
            }
          : m,
      ),
    }));
    window.alert(
      `Payment of ${money(target.cash + target.upi + target.card)} dated ${longDate(target.date)} is now voided.\n\n` +
        'The rent goes back to unpaid and the month’s collection goes down by the same amount. The record is kept for your records.',
    );
    setVoidingId(null);
    setReason('');
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`Payment History — ${live.name}`}
      subtitle={`${BRANCH_MAP[live.branch].short} · Room ${live.roomCode} · Bed ${live.bedIndex}`}
    >
      <div className="space-y-4">
        <div className="well px-4 py-3">
          <InfoRow label="Total received (live payments)" value={money(received)} />
          <InfoRow label="Voided / reversed" value={money(voided.reduce((n, p) => n + p.cash + p.upi + p.card, 0))} />
          <InfoRow label="Rent still owed" value={money(pos.totalDue)} />
        </div>

        {payments.length === 0 ? (
          <p className="text-base text-slate-600">No payments have been recorded for this member yet.</p>
        ) : (
          <div className="space-y-3">
            {payments.map((p) => {
              const amount = p.cash + p.upi + p.card;
              const isVoid = !!p.voidedAt;
              const lockedHere = monthLockMessage(state, p.date, 'void this payment');
              return (
                <div
                  key={p.id}
                  className={`well px-4 py-3 ${isVoid ? 'border-bad/30 bg-bad/[0.05]' : ''}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p
                        className={`text-base font-semibold ${isVoid ? 'line-through text-slate-500' : ''}`}
                      >
                        {money(amount)} · {longDate(p.date)}
                      </p>
                      <p className="text-base text-slate-600">
                        {p.cash ? `Cash ${money(p.cash)} · ` : ''}
                        {p.upi ? `UPI ${money(p.upi)} · ` : ''}
                        {p.card ? `Card ${money(p.card)} · ` : ''}
                        for the cycle starting {longDate(p.cycleKey === 'daily' ? p.date : p.cycleKey)}
                      </p>
                      {p.note ? <p className="text-base text-slate-600">{p.note}</p> : null}
                    </div>
                    {isVoid ? (
                      <Badge tone="bad">VOIDED on {longDate(p.voidedAt ?? '')}</Badge>
                    ) : lockedHere ? (
                      <Badge tone="warn">
                        <Lock size={16} aria-hidden /> Month closed
                      </Badge>
                    ) : (
                      <Btn variant="danger" onClick={() => setVoidingId(p.id)}>
                        <Ban size={20} aria-hidden /> Void this payment
                      </Btn>
                    )}
                  </div>
                  {isVoid ? (
                    <p className="mt-2 text-base font-semibold text-bad">
                      Reversed — this money is not counted. Reason: {p.voidReason || 'Entered by mistake'}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {target ? (
          <div className="rounded-2xl border border-bad/35 bg-bad/[0.06] p-4">
            <p className="text-lg font-bold text-bad">
              Void the payment of {money(target.cash + target.upi + target.card)} dated{' '}
              {longDate(target.date)}?
            </p>
            <p className="mt-1 text-base text-slate-700">
              The rent goes back to unpaid and that month’s collection goes down by the same amount. The
              payment is kept on record as voided — it is never deleted.
            </p>
            <div className="mt-3">
              <Field label="Why is it being reversed?" hint="Optional — it is saved with the record.">
                <TextInput
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Typed 8,500 instead of 5,800"
                />
              </Field>
            </div>
            {targetLocked ? (
              <p className="mt-2 text-base font-semibold text-bad">{targetLocked}</p>
            ) : null}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row-reverse">
              <Btn variant="danger" full className="sm:flex-1" onClick={voidPayment} disabled={!!targetLocked}>
                <Check size={20} aria-hidden /> Yes — void this payment
              </Btn>
              <Btn
                variant="secondary"
                full
                onClick={() => {
                  setVoidingId(null);
                  setReason('');
                }}
              >
                Cancel
              </Btn>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn variant="secondary" full onClick={onClose}>
            Close
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
