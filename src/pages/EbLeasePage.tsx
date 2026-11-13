import { useState } from 'react';
import { AlertTriangle, Plus, Receipt, Zap } from 'lucide-react';
import { useStore } from '../app/store/StoreProvider';
import { BRANCHES, BRANCH_MAP } from '../app/store/branches';
import { monthLockMessage } from '../app/store/monthLock';
import type { BranchId, EbBill, PaymentMode } from '../app/store/types';
import { ebBillMonths, ebOutstanding, ebServiceMonth, ebStatus, unpaidEbBills } from '../app/store/selectors';
import { currentMonthKey, longDate, monthKey, monthLabel, todayISO, addMonths, dueStatus, lastMonths } from '../shared/lib/dates';
import { money, uid } from '../shared/lib/format';
import { Badge, Btn, Card, EmptyState, Field, Modal, MoneyInput, PageIntro, SelectInput, Tabs, TextInput } from '../shared/ui';

const MODES: PaymentMode[] = ['Cash', 'UPI', 'Card'];

export function EbLeasePage() {
  const [tab, setTab] = useState('eb');
  return (
    <div>
      <PageIntro
        title="EB Bills, Owner Lease & Catering"
        hint="All PG expenses that are paid to outside parties — electricity, building lease and food catering."
      />
      <div className="mb-5">
        <Tabs
          ariaLabel="Expense types"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'eb', label: 'Electricity (EB) Bills' },
            { id: 'lease', label: 'Owner Lease Payment' },
            { id: 'catering', label: 'Catering Service Expense' },
          ]}
        />
      </div>
      {tab === 'eb' ? <EbTab /> : tab === 'lease' ? <LeaseTab /> : <CateringTab />}
    </div>
  );
}

function EbTab() {
  const { state, branch } = useStore();
  const [addingMeter, setAddingMeter] = useState<BranchId | null>(null);
  const [recording, setRecording] = useState<{ meterId: string; branch: BranchId; label: string } | null>(null);
  const [paying, setPaying] = useState<EbBill | null>(null);

  const meters = state.ebMeters.filter((m) => branch === 'ALL' || m.branch === branch);
  const branchesShown = branch === 'ALL' ? BRANCHES : BRANCHES.filter((b) => b.id === branch);
  const unpaid = unpaidEbBills(state, branch, currentMonthKey());

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-slate-600">
          Each meter is a separate EB connection. Record every bill as it arrives (usually every two months).
        </p>
        <Btn onClick={() => setAddingMeter(branch === 'ALL' ? 'PG1' : branch)}>
          <Plus size={22} aria-hidden /> Add EB Meter
        </Btn>
      </div>

      {unpaid.count > 0 ? (
        <Card className="border-2 border-warn/45 bg-warn/[0.07]">
          <p className="flex items-center gap-2 text-lg font-bold text-warn">
            <AlertTriangle size={24} aria-hidden /> {money(unpaid.total)} of electricity is not paid yet
          </p>
          <p className="mt-1 text-base text-slate-700">
            {unpaid.count} bill(s) have arrived but have not been paid in full. This money is still owed
            to the electricity board.
          </p>
        </Card>
      ) : null}

      {branchesShown.map((b) => {
        const branchMeters = meters.filter((m) => m.branch === b.id);
        return (
          <section key={b.id}>
            <h2 className="mb-3 headline">{b.name}</h2>
            {branchMeters.length === 0 ? (
              <Card className="border-dashed">
                <p className="text-base text-slate-600">No EB meters added yet for this PG.</p>
                <div className="mt-3">
                  <Btn onClick={() => setAddingMeter(b.id)}>
                    <Plus size={22} aria-hidden /> Add EB Meter for {b.short}
                  </Btn>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {branchMeters.map((meter) => {
                  const bills = state.ebBills
                    .filter((x) => x.meterId === meter.id)
                    .sort((a, b2) => b2.paidDate.localeCompare(a.paidDate));
                  const totalPaid = bills.reduce((n, x) => n + x.amount, 0);
                  const due = dueStatus(meter.dueDate ?? '');
                  return (
                    <Card key={meter.id} className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Zap size={26} aria-hidden className="text-warn" />
                          <div>
                            <p className="text-lg font-bold leading-tight">{meter.label}</p>
                            <p className="text-base text-slate-600">{meter.consumerNo || 'No consumer number'}</p>
                          </div>
                        </div>
                        <Badge tone="neutral">{money(totalPaid)} paid</Badge>
                      </div>
                      <div className="well px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-base font-semibold">Next bill due</p>
                          <Badge tone={due === 'overdue' ? 'bad' : due === 'soon' ? 'warn' : 'good'}>
                            {due === 'overdue'
                              ? 'OVERDUE'
                              : due === 'soon'
                                ? 'DUE SOON'
                                : 'ON SCHEDULE'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-base text-slate-700">{longDate(meter.dueDate ?? '')}</p>
                        <p className="text-base text-slate-600">
                          One bill covers {meter.cycleMonths ?? 2} month(s)
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        {bills.length === 0 ? (
                          <p className="text-base text-slate-600">No bills recorded yet.</p>
                        ) : (
                          bills.slice(0, 4).map((bill) => {
                            const status = ebStatus(bill);
                            const owed = ebOutstanding(bill);
                            // A bill that covers two months is shared over them, so
                            // the owner can see where the cost actually landed.
                            const covered = ebBillMonths(state, bill);
                            return (
                              <div key={bill.id} className="well px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="text-base font-semibold">{bill.cycle || 'Billing period'}</p>
                                    <p className="text-base text-slate-600">
                                      {status === 'paid'
                                        ? `Paid ${longDate(bill.paidDate)}${bill.mode ? ` · ${bill.mode}` : ''}`
                                        : status === 'partial'
                                          ? `Part paid ${money(bill.paidAmount ?? 0)} · ${money(owed)} still owed`
                                          : 'NOT PAID YET'}
                                    </p>
                                    <p className="text-base text-slate-600">
                                      {covered.length > 1 ? (
                                        <>
                                          {money(bill.amount / covered.length)} each for{' '}
                                          {covered.map((m) => monthLabel(m)).join(' and ')}
                                        </>
                                      ) : (
                                        <>Bill for {monthLabel(ebServiceMonth(bill))}</>
                                      )}
                                    </p>
                                  </div>
                                  <span className="num-md">{money(bill.amount)}</span>
                                </div>
                                {status !== 'paid' ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Badge tone="warn">{money(owed)} unpaid</Badge>
                                    <Btn variant="secondary" onClick={() => setPaying(bill)}>
                                      <Receipt size={20} aria-hidden /> Pay this bill
                                    </Btn>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                        {bills.length > 4 ? (
                          <p className="text-base text-slate-600">+ {bills.length - 4} older bill(s)</p>
                        ) : null}
                      </div>
                      <Btn variant="secondary" onClick={() => setRecording({ meterId: meter.id, branch: meter.branch, label: meter.label })}>
                        <Receipt size={20} aria-hidden /> Record EB Bill
                      </Btn>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {addingMeter ? <AddMeterModal branchId={addingMeter} onClose={() => setAddingMeter(null)} /> : null}
      {recording ? <RecordBillModal target={recording} onClose={() => setRecording(null)} /> : null}
      {paying ? <PayBillModal bill={paying} onClose={() => setPaying(null)} /> : null}
    </div>
  );
}

function AddMeterModal({ branchId, onClose }: { branchId: BranchId; onClose: () => void }) {
  const { state, update } = useStore();
  const count = state.ebMeters.filter((m) => m.branch === branchId).length + 1;
  const [label, setLabel] = useState(`EB Meter ${count}`);
  const [consumerNo, setConsumerNo] = useState('');
  const [cycleMonths, setCycleMonths] = useState('2');
  const [dueDate, setDueDate] = useState(addMonths(todayISO(), 2));

  function save() {
    const months = Number(cycleMonths) || 2;
    update((s) => ({
      ...s,
      ebMeters: [
        ...s.ebMeters,
        {
          id: uid('meter'),
          branch: branchId,
          label: label || `EB Meter ${count}`,
          consumerNo,
          cycleMonths: months,
          dueDate,
        },
      ],
    }));
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Add EB Meter — ${BRANCH_MAP[branchId].short}`}>
      <div className="space-y-4">
        <Field label="Meter name">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Consumer number (optional note)">
          <TextInput value={consumerNo} onChange={(e) => setConsumerNo(e.target.value)} placeholder="e.g. TN0123456789" />
        </Field>
        <Field label="One bill covers how many months?" hint="Usually 2 months for a commercial connection.">
          <SelectInput value={cycleMonths} onChange={(e) => setCycleMonths(e.target.value)}>
            <option value="1">Every month</option>
            <option value="2">Every 2 months</option>
            <option value="3">Every 3 months</option>
            <option value="6">Every 6 months</option>
          </SelectInput>
        </Field>
        <Field label="Next bill expected on">
          <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>Save Meter</Btn>
          <Btn variant="secondary" full onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

function RecordBillModal({
  target,
  onClose,
}: {
  target: { meterId: string; branch: BranchId; label: string };
  onClose: () => void;
}) {
  const { state, update } = useStore();
  const [cycle, setCycle] = useState('');
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState(currentMonthKey() + '-' + String(new Date().getDate()).padStart(2, '0'));
  const [mode, setMode] = useState<PaymentMode>('UPI');
  const [error, setError] = useState('');
  /** 'paid' | 'partial' | 'unpaid' */
  const [payState, setPayState] = useState<'paid' | 'partial' | 'unpaid'>('paid');
  const [partPaid, setPartPaid] = useState('');
  const [serviceMonth, setServiceMonth] = useState(currentMonthKey());

  const meter = state.ebMeters.find((m) => m.id === target.meterId);
  const cycleMonths = meter?.cycleMonths ?? 2;
  const currentDue = meter?.dueDate ?? '';
  const suggestedNext = addMonths(currentDue && currentDue > paidDate ? currentDue : paidDate, cycleMonths);
  const [nextDue, setNextDue] = useState(suggestedNext);

  function save() {
    const a = Number(amount);
    if (!a || a <= 0) {
      setError('Please enter the bill amount in rupees.');
      return;
    }
    // A closed month is final: neither the month the power was used nor the
    // month the bill was paid in may be changed.
    const locked =
      monthLockMessage(state, `${serviceMonth}-01`, 'record a bill for a closed month') ??
      (payState === 'unpaid' ? null : monthLockMessage(state, paidDate, 'record this payment'));
    if (locked) {
      setError(locked);
      return;
    }
    if (payState === 'partial') {
      const part = Number(partPaid || 0);
      if (!part || part <= 0) {
        setError('Please enter how much has been paid so far.');
        return;
      }
      if (part >= a) {
        setError('The part payment must be less than the bill amount. Choose "Paid in full" instead.');
        return;
      }
    }
    // The next bill is expected one full cycle after the one just paid.
    const nextDueDate = nextDue || suggestedNext;
    const bill: EbBill = {
      id: uid('eb'),
      meterId: target.meterId,
      branch: target.branch,
      cycle: cycle || 'Current',
      amount: a,
      paidDate: payState === 'unpaid' ? '' : paidDate,
      mode: payState === 'unpaid' ? undefined : mode,
      status: payState,
      paidAmount: payState === 'partial' ? Number(partPaid || 0) : payState === 'paid' ? a : undefined,
      serviceMonth,
    };
    update((s) => ({
      ...s,
      ebMeters: s.ebMeters.map((m) =>
        m.id === target.meterId ? { ...m, cycleMonths, dueDate: nextDueDate } : m,
      ),
      ebBills: [...s.ebBills, bill],
    }));
    window.alert(
      `${target.label} bill of ${money(a)} recorded for ${monthLabel(serviceMonth)}.\n` +
        (payState === 'unpaid'
          ? `It has NOT been paid — ${money(a)} is still owed to the electricity board.`
          : payState === 'partial'
            ? `Part paid ${money(Number(partPaid || 0))}. ${money(a - Number(partPaid || 0))} is still owed.`
            : `Paid (${mode} on ${longDate(paidDate)}).`) +
        `\n\nNext bill expected on ${longDate(nextDueDate)}.`,
    );
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Record EB Bill — ${target.label}`} subtitle={BRANCH_MAP[target.branch].short}>
      <div className="space-y-4">
        <Field label="Billing cycle (e.g. Oct–Nov)">
          <TextInput value={cycle} onChange={(e) => setCycle(e.target.value)} placeholder="Oct–Nov" />
        </Field>
        <Field label="Bill amount (₹)" error={error}>
          <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field
          label="This bill is for the month of"
          hint="The power was used in this month — the cost belongs to it whether or not the bill is paid."
        >
          <SelectInput value={serviceMonth} onChange={(e) => setServiceMonth(e.target.value)}>
            {lastMonths(currentMonthKey(), 8)
              .slice()
              .reverse()
              .map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
          </SelectInput>
        </Field>

        <div>
          <p className="mb-1.5 text-base font-semibold">Has this bill been paid?</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'paid', label: 'Paid in full' },
                { id: 'partial', label: 'Part paid' },
                { id: 'unpaid', label: 'Not paid yet' },
              ] as const
            ).map((o) => (
              <Btn
                key={o.id}
                variant={payState === o.id ? 'primary' : 'secondary'}
                onClick={() => setPayState(o.id)}
                aria-pressed={payState === o.id}
              >
                {o.label}
              </Btn>
            ))}
          </div>
        </div>

        {payState === 'unpaid' ? (
          <div className="rounded-2xl border border-warn/35 bg-warn/[0.07] p-4 text-base text-slate-700">
            The bill is recorded but not paid. Its full amount stays as money the PG owes to the
            electricity board, and it shows in the month it is for.
          </div>
        ) : (
          <>
            {payState === 'partial' ? (
              <Field label="Amount paid so far (₹)">
                <MoneyInput value={partPaid} onChange={(e) => setPartPaid(e.target.value)} placeholder="0" />
              </Field>
            ) : null}
            <Field label="Paid date">
              <TextInput type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </Field>
            <Field label="Paid by">
              <SelectInput value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
                {MODES.map((m) => <option key={m}>{m}</option>)}
              </SelectInput>
            </Field>
          </>
        )}
        <Field label="Next bill expected on" hint={`Suggested: ${longDate(suggestedNext)}`}>
          <TextInput type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>Save EB Bill</Btn>
          <Btn variant="secondary" full onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

/** Records a payment against a bill that had arrived unpaid. */
function PayBillModal({ bill, onClose }: { bill: EbBill | null; onClose: () => void }) {
  const { state, update } = useStore();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(currentMonthKey() + '-' + String(new Date().getDate()).padStart(2, '0'));
  const [mode, setMode] = useState<PaymentMode>('UPI');
  const [error, setError] = useState('');

  if (!bill) return null;

  const owed = ebOutstanding(bill!);

  function save() {
    const a = Number(amount || 0);
    if (!a || a <= 0) {
      setError('Please enter how much was paid.');
      return;
    }
    if (a > owed) {
      setError(`This bill only has ${money(owed)} outstanding.`);
      return;
    }
    // A closed month is final — the bill's month and the payment month are
    // both protected.
    const locked =
      monthLockMessage(state, `${ebServiceMonth(bill!)}-01`, 'change a bill of a closed month') ??
      monthLockMessage(state, date, 'make this payment');
    if (locked) {
      setError(locked);
      return;
    }
    const totalPaid = (bill!.paidAmount ?? 0) + a;
    update((s) => ({
      ...s,
      ebBills: s.ebBills.map((b) =>
        b.id === bill!.id
          ? {
              ...b,
              paidDate: date,
              mode,
              paidAmount: totalPaid,
              status: totalPaid >= b.amount ? 'paid' : 'partial',
            }
          : b,
      ),
    }));
    window.alert(
      totalPaid >= bill!.amount
        ? `Bill of ${money(bill!.amount)} is now fully paid.`
        : `${money(a)} paid. ${money(bill!.amount - totalPaid)} is still owed.`,
    );
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Pay EB Bill"
      subtitle={`${money(bill.amount)} billed · ${money(owed)} still owed`}
    >
      <div className="space-y-4">
        <Field label="Amount being paid now (₹)" error={error}>
          <MoneyInput value={amount || String(owed)} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Paid date">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Paid by">
          <SelectInput value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {MODES.map((m) => <option key={m}>{m}</option>)}
          </SelectInput>
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>Save Payment</Btn>
          <Btn variant="secondary" full onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

function LeaseTab() {
  const { state, branch } = useStore();
  const key = currentMonthKey();
  const branchesShown = branch === 'ALL' ? BRANCHES : BRANCHES.filter((b) => b.id === branch);
  const [paying, setPaying] = useState<BranchId | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-base text-slate-600">
        Fixed monthly rent paid to the building owner for {monthLabel(key)}.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {branchesShown.map((b) => {
          const payment = state.leasePayments.find((l) => l.branch === b.id && l.monthKey === key);
          return (
            <Card key={b.id} className={payment ? 'border-good/30' : 'border-warn/30'}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{b.short}</p>
                  <p className="text-base text-slate-600">Owner lease · {monthLabel(key)}</p>
                </div>
                <Badge tone={payment ? 'good' : 'warn'}>{payment ? 'PAID' : 'NOT PAID'}</Badge>
              </div>
              <div className="mt-3">
                {payment ? (
                  <>
                    <p className="num-xl text-good">{money(payment.amount)}</p>
                    <p className="text-base text-slate-600">
                      Paid {longDate(payment.date)} by {payment.mode}
                    </p>
                  </>
                ) : (
                  <Btn onClick={() => setPaying(b.id)}>
                    <Plus size={22} aria-hidden /> Record Lease Payment
                  </Btn>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <h2 className="headline">Lease history</h2>
      <div className="space-y-2">
        {state.leasePayments
          .filter((l) => branch === 'ALL' || l.branch === branch)
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 12)
          .map((l) => (
            <Card key={l.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-base font-semibold">{BRANCH_MAP[l.branch].short} · {monthLabel(l.monthKey)}</p>
                <p className="text-base text-slate-600">{longDate(l.date)} · {l.mode}</p>
              </div>
              <span className="num-lg">{money(l.amount)}</span>
            </Card>
          ))}
        {state.leasePayments.length === 0 ? <EmptyState title="No lease payments recorded yet" /> : null}
      </div>

      {paying ? <LeaseModal branchId={paying} onClose={() => setPaying(null)} /> : null}
    </div>
  );
}

function LeaseModal({ branchId, onClose }: { branchId: BranchId; onClose: () => void }) {
  const { state, update } = useStore();
  const key = currentMonthKey();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(`${key}-${String(new Date().getDate()).padStart(2, '0')}`);
  const [mode, setMode] = useState<PaymentMode>('Cash');
  const [error, setError] = useState('');

  function save() {
    const a = Number(amount);
    if (!a || a <= 0) {
      setError('Please enter the lease amount in rupees.');
      return;
    }
    const locked =
      monthLockMessage(state, `${key}-01`, 'record a lease for a closed month') ??
      monthLockMessage(state, date, 'record this lease payment');
    if (locked) {
      setError(locked);
      return;
    }
    update((s) => ({
      ...s,
      leasePayments: [
        ...s.leasePayments,
        { id: uid('lse'), branch: branchId, monthKey: key, amount: a, date, mode },
      ],
    }));
    window.alert(`${BRANCH_MAP[branchId].short} lease of ${money(a)} recorded for ${monthLabel(key)}.`);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Owner Lease — ${BRANCH_MAP[branchId].short}`} subtitle={monthLabel(key)}>
      <div className="space-y-4">
        <Field label="Lease amount paid (₹)" error={error}>
          <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Paid date">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Paid by">
          <SelectInput value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {MODES.map((m) => <option key={m}>{m}</option>)}
          </SelectInput>
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>Save Lease Payment</Btn>
          <Btn variant="secondary" full onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

function CateringTab() {
  const { state, update, branch } = useStore();
  const key = currentMonthKey();
  const [date, setDate] = useState(`${key}-${String(new Date().getDate()).padStart(2, '0')}`);
  const [cBranch, setCBranch] = useState<BranchId>(branch === 'ALL' ? 'PG1' : branch);
  const [description, setDescription] = useState('');
  const [cash, setCash] = useState('');
  const [upi, setUpi] = useState('');
  const [card, setCard] = useState('');
  const [error, setError] = useState('');

  const rows = state.catering
    .filter((c) => branch === 'ALL' || c.branch === branch)
    .sort((a, b) => b.date.localeCompare(a.date));
  const monthTotal = rows
    .filter((c) => monthKey(c.date) === key)
    .reduce((n, c) => n + c.cash + c.upi + c.card, 0);

  function save() {
    const c = Number(cash || 0);
    const u = Number(upi || 0);
    const d = Number(card || 0);
    if (c + u + d <= 0) {
      setError('Enter the payment in Cash, UPI or Card.');
      return;
    }
    const locked = monthLockMessage(state, date, 'add this catering payment');
    if (locked) {
      setError(locked);
      return;
    }
    setError('');
    update((s) => ({
      ...s,
      catering: [
        ...s.catering,
        { id: uid('cat'), date, branch: cBranch, description: description || 'Catering payment', cash: c, upi: u, card: d },
      ],
    }));
    window.alert(`Catering payment of ${money(c + u + d)} saved.`);
    setDescription('');
    setCash('');
    setUpi('');
    setCard('');
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-base font-semibold text-slate-600">Catering paid this month</p>
          <p className="num-xl mt-1 text-brand">{money(monthTotal)}</p>
          <p className="text-base text-slate-600">{monthLabel(key)}</p>
        </Card>
        <Card>
          <p className="text-base font-semibold text-slate-600">Total recorded ever</p>
          <p className="num-xl mt-1">{money(rows.reduce((n, c) => n + c.cash + c.upi + c.card, 0))}</p>
          <p className="text-base text-slate-600">{rows.length} payment(s)</p>
        </Card>
      </div>

      <Card>
        <h2 className="flex items-center gap-2 headline">
          <Receipt size={26} aria-hidden /> Log a catering payment
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="PG Branch">
            <SelectInput value={cBranch} onChange={(e) => setCBranch(e.target.value as BranchId)}>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.short}</option>)}
            </SelectInput>
          </Field>
          <Field label="Description">
            <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. November first half" />
          </Field>
          <Field label="Paid in Cash (₹)"><MoneyInput value={cash} onChange={(e) => setCash(e.target.value)} /></Field>
          <Field label="Paid in UPI (₹)"><MoneyInput value={upi} onChange={(e) => setUpi(e.target.value)} /></Field>
          <Field label="Paid in Card (₹)" error={error}><MoneyInput value={card} onChange={(e) => setCard(e.target.value)} /></Field>
        </div>
        <div className="mt-4">
          <Btn onClick={save}>Save Catering Payment</Btn>
        </div>
      </Card>

      <h2 className="headline">Catering history</h2>
      {rows.length === 0 ? (
        <EmptyState title="No catering payments yet" hint="Use the form above to log what you paid the catering service." />
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <Card key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-base font-semibold">{c.description}</p>
                <p className="text-base text-slate-600">
                  {longDate(c.date)} · {BRANCH_MAP[c.branch].short} · Cash {money(c.cash)} · UPI {money(c.upi)} · Card {money(c.card)}
                </p>
              </div>
              <span className="num-lg">{money(c.cash + c.upi + c.card)}</span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
