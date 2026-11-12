import { useState } from 'react';
import type { Member, PaymentMode } from '../../../app/store/types';
import { useStore } from '../../../app/store/StoreProvider';
import { BRANCH_MAP } from '../../../app/store/branches';
import { netRefund, rentPosition } from '../../../entities/member';
import { todayISO } from '../../../shared/lib/dates';
import { money, uid } from '../../../shared/lib/format';
import { Badge, Btn, Field, InfoRow, Modal, MoneyInput, SelectInput, TextInput } from '../../../shared/ui';

/**
 * Vacating wizard: 3 clear steps (Step 1 of 3 …), always able to go back.
 * Net refund = Advance Paid − Maintenance Deduction − Pending Unpaid Rent.
 */
export function VacateModal({
  member,
  open,
  onClose,
}: {
  member: Member | null;
  open: boolean;
  onClose: () => void;
}) {
  const { update } = useStore();
  const [step, setStep] = useState(1);
  const [maintenance, setMaintenance] = useState('0');
  const [pendingText, setPendingText] = useState('');
  const [refundMode, setRefundMode] = useState<PaymentMode>('Cash');
  const [exitDate, setExitDate] = useState(todayISO());

  if (!member) return null;

  const pos = rentPosition(member);
  const pendingDefault = pos.balance;
  const pending = pendingText === '' ? pendingDefault : Number(pendingText || 0);
  const maint = Number(maintenance || 0);
  const refund = netRefund(member.advance.amount, maint, pending);

  function reset() {
    setStep(1);
    setMaintenance('0');
    setPendingText('');
    setRefundMode('Cash');
    setExitDate(todayISO());
  }

  function confirm() {
    if (!member) return;
    const exit = exitDate;
    update((s) => {
      const members = s.members.map((m) =>
        m.id === member.id
          ? {
              ...m,
              status: 'vacated' as const,
              vacatedOn: exit,
              settlement: {
                exitDate: exit,
                maintenanceDeduction: maint,
                pendingRentDeduction: pending,
                refund,
                refundMode,
                recordedOn: todayISO(),
              },
            }
          : m,
      );
      const maintenanceRows =
        maint > 0
          ? [
              ...s.maintenance,
              {
                id: uid('mnt'),
                date: exit,
                branch: member.branch,
                amount: maint,
                memberId: member.id,
                memberName: member.name,
              },
            ]
          : s.maintenance;
      return { ...s, members, maintenance: maintenanceRows };
    });
    window.alert(
      `${member.name} has been marked as Left PG on ${exit}.\n\n` +
        `Bed ${member.bedIndex} in Room ${member.roomCode} (${BRANCH_MAP[member.branch].short}) is now FREE.\n\n` +
        `Advance paid: ${money(member.advance.amount)}\n` +
        `Maintenance cut: ${money(maint)}\n` +
        `Pending rent cut: ${money(pending)}\n` +
        `Refund returned by ${refundMode}: ${money(refund)}`,
    );
    reset();
    onClose();
  }

  const stepTitles = ['Check advance received', 'Cut deductions', 'Return the refund'];

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={`Vacate / Leave PG — ${stepTitles[step - 1]}`}
      subtitle={`Step ${step} of 3 · ${member.name} · Room ${member.roomCode}`}
    >
      <div className="space-y-4">
        <div className="flex gap-2" aria-hidden>
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-2.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`}
            />
          ))}
        </div>

        {step === 1 ? (
          <>
            <div className="well p-4">
              <Badge tone="info">Original advance received</Badge>
              <p className="num-xl mt-2 text-brand">{money(member.advance.amount)}</p>
              <div className="mt-3">
                <InfoRow label="Paid on" value={member.advance.date || '—'} />
                <InfoRow label="Payment mode" value={member.advance.mode} />
                <InfoRow label="Current rent balance" value={money(pos.balance)} />
                <InfoRow label="Stay started" value={member.startDate} />
              </div>
            </div>
            <p className="text-base text-slate-700">
              On the next screens you can cut any damage repair money and unpaid rent from this advance, then
              return the balance to the member.
            </p>
            <Btn full onClick={() => setStep(2)}>
              Next: Cut Deductions
            </Btn>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Field
              label="Maintenance / damage deduction (₹)"
              hint="Default ₹0. Type any repair or damage amount to keep in the PG."
            >
              <MoneyInput value={maintenance} onChange={(e) => setMaintenance(e.target.value)} />
            </Field>
            <Field
              label="Pending unpaid rent to cut (₹)"
              hint={`Auto-filled from the member’s balance due (${money(pendingDefault)}). Change it only if the member has paid in cash outside this app.`}
            >
              <MoneyInput
                value={pendingText === '' ? String(pendingDefault) : pendingText}
                onChange={(e) => setPendingText(e.target.value)}
              />
            </Field>
            <div className="rounded-2xl border border-brand/35 bg-brand-soft/75 p-4 shadow-[inset_0_1px_2px_rgb(15_23_42/0.05)]">
              <p className="text-base font-semibold text-brand-dark">Net advance to return to member</p>
              <p className="num-xl mt-1 text-good">
                {money(member.advance.amount)} − {money(maint)} − {money(pending)} = {money(refund)}
              </p>
              {refund <= 0 ? (
                <p className="mt-2 text-base font-semibold text-bad">
                  Deductions equal or exceed the advance — nothing needs to be returned. Please collect any
                  extra balance from the member.
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <Btn full className="sm:flex-1" onClick={() => setStep(3)}>
                Next: Return Refund
              </Btn>
              <Btn variant="secondary" full onClick={() => setStep(1)}>
                Back
              </Btn>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="well p-4">
              <InfoRow label="Advance paid" value={money(member.advance.amount)} />
              <InfoRow label="Maintenance deduction (kept by PG)" value={money(maint)} />
              <InfoRow label="Pending rent deduction" value={money(pending)} />
              <InfoRow label="Refund to return" value={money(refund)} />
            </div>
            <Field label="Date of leaving">
              <TextInput type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} />
            </Field>
            <Field label="How will you return the refund?">
              <SelectInput value={refundMode} onChange={(e) => setRefundMode(e.target.value as PaymentMode)}>
                <option>Cash</option>
                <option>UPI</option>
                <option>Card</option>
              </SelectInput>
            </Field>
            <div className="rounded-xl bg-good-soft px-4 py-3 text-base font-semibold text-good">
              After confirming, Room {member.roomCode} Bed {member.bedIndex} becomes free immediately, this
              member moves to the “Left PG (Vacated)” history list, and {money(maint)} is added to PG revenue.
            </div>
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <Btn variant="danger" full className="sm:flex-1" onClick={confirm}>
                Yes — Vacate Member &amp; Return {money(refund)}
              </Btn>
              <Btn variant="secondary" full onClick={() => setStep(2)}>
                Back
              </Btn>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
