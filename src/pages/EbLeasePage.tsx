import { useState } from 'react';
import { Plus, Receipt, Zap } from 'lucide-react';
import { useStore } from '../app/store/StoreProvider';
import { BRANCHES, BRANCH_MAP } from '../app/store/branches';
import type { BranchId, PaymentMode } from '../app/store/types';
import { currentMonthKey, longDate, monthKey, monthLabel } from '../shared/lib/dates';
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

  const meters = state.ebMeters.filter((m) => branch === 'ALL' || m.branch === branch);
  const branchesShown = branch === 'ALL' ? BRANCHES : BRANCHES.filter((b) => b.id === branch);

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
                      <div className="flex flex-col gap-2">
                        {bills.length === 0 ? (
                          <p className="text-base text-slate-600">No bills recorded yet.</p>
                        ) : (
                          bills.slice(0, 4).map((bill) => (
                            <div key={bill.id} className="flex items-center justify-between gap-2 well px-3 py-2">
                              <div>
                                <p className="text-base font-semibold">{bill.cycle || 'Billing period'}</p>
                                <p className="text-base text-slate-600">
                                  Paid {longDate(bill.paidDate)} · {bill.mode}
                                </p>
                              </div>
                              <span className="num-md">{money(bill.amount)}</span>
                            </div>
                          ))
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
    </div>
  );
}

function AddMeterModal({ branchId, onClose }: { branchId: BranchId; onClose: () => void }) {
  const { state, update } = useStore();
  const count = state.ebMeters.filter((m) => m.branch === branchId).length + 1;
  const [label, setLabel] = useState(`EB Meter ${count}`);
  const [consumerNo, setConsumerNo] = useState('');

  function save() {
    update((s) => ({
      ...s,
      ebMeters: [
        ...s.ebMeters,
        { id: uid('meter'), branch: branchId, label: label || `EB Meter ${count}`, consumerNo },
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
  const { update } = useStore();
  const [cycle, setCycle] = useState('');
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState(currentMonthKey() + '-' + String(new Date().getDate()).padStart(2, '0'));
  const [mode, setMode] = useState<PaymentMode>('UPI');
  const [error, setError] = useState('');

  function save() {
    const a = Number(amount);
    if (!a || a <= 0) {
      setError('Please enter the bill amount in rupees.');
      return;
    }
    update((s) => ({
      ...s,
      ebBills: [
        ...s.ebBills,
        { id: uid('eb'), meterId: target.meterId, branch: target.branch, cycle: cycle || 'Current', amount: a, paidDate, mode },
      ],
    }));
    window.alert(`${target.label} bill of ${money(a)} recorded (${mode} on ${longDate(paidDate)}).`);
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
        <Field label="Paid date">
          <TextInput type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
        </Field>
        <Field label="Paid by">
          <SelectInput value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {MODES.map((m) => <option key={m}>{m}</option>)}
          </SelectInput>
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>Save EB Bill</Btn>
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
  const { update } = useStore();
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
