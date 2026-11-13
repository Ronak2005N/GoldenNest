import { useState } from 'react';
import { Droplets, Plus, Truck } from 'lucide-react';
import { useStore } from '../app/store/StoreProvider';
import { BRANCHES, BRANCH_MAP } from '../app/store/branches';
import { monthLockMessage } from '../app/store/monthLock';
import type { AppState, BranchId, PaymentMode } from '../app/store/types';
import { currentMonthKey, longDate, monthKey, monthLabel, todayISO } from '../shared/lib/dates';
import { money, uid } from '../shared/lib/format';
import { Badge, Btn, Card, EmptyState, Field, InfoRow, Modal, MoneyInput, PageIntro, SelectInput, Tabs, TextInput } from '../shared/ui';

const MODES: PaymentMode[] = ['Cash', 'UPI', 'Card'];

export function WaterPage() {
  const [tab, setTab] = useState('cans');
  const { state } = useStore();
  const key = currentMonthKey();
  const cansThisMonth = state.waterCans.filter((c) => monthKey(c.date) === key);
  const tankersThisMonth = state.waterTankers.filter((t) => monthKey(t.date) === key);

  return (
    <div>
      <PageIntro
        title="Water Cans & Water Tankers"
        hint="Drinking water cans are counted daily and paid at month end. Bath water tankers are paid on the same day they arrive."
      />
      <div className="mb-5">
        <Tabs
          ariaLabel="Water types"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'cans', label: 'Drinking Water Cans (Monthly Settlement)', badge: cansThisMonth.reduce((n, c) => n + c.count, 0) },
            { id: 'tankers', label: 'Bath / Utility Water Tankers (Same-Day Pay)', badge: tankersThisMonth.length },
          ]}
        />
      </div>
      {tab === 'cans' ? <CansTab /> : <TankersTab />}
    </div>
  );
}

/**
 * The month-end can bill is settled per PG. A settlement saved before this
 * existed carries no PG on it and is treated as covering every PG, so old
 * records keep working.
 */
function settlementFor(
  settlements: AppState['canSettlements'],
  monthKeyVal: string,
  branchId: BranchId,
) {
  return (
    settlements.find((s) => s.monthKey === monthKeyVal && s.branch === branchId) ??
    settlements.find((s) => s.monthKey === monthKeyVal && !s.branch) ??
    null
  );
}

function CansTab() {
  const { state, update, branch } = useStore();
  const key = currentMonthKey();
  const [count, setCount] = useState('10');
  const [date, setDate] = useState(todayISO());
  const [entryBranch, setEntryBranch] = useState<BranchId>(branch === 'ALL' ? 'PG1' : branch);
  const [rate, setRate] = useState(String(state.canRate));
  const [settling, setSettling] = useState<BranchId | null>(null);

  const scopes: BranchId[] = branch === 'ALL' ? BRANCHES.map((b) => b.id) : [branch];

  const logs = state.waterCans
    .filter((c) => monthKey(c.date) === key && (branch === 'ALL' || c.branch === branch))
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalCans = logs.reduce((n, c) => n + c.count, 0);
  const bill = totalCans * state.canRate;

  const perBranch = scopes.map((b) => {
    const cans = state.waterCans
      .filter((c) => c.branch === b && monthKey(c.date) === key)
      .reduce((n, c) => n + c.count, 0);
    return {
      branch: b,
      cans,
      bill: cans * state.canRate,
      settlement: settlementFor(state.canSettlements, key, b),
    };
  });
  const allSettled = perBranch.every((p) => p.cans === 0 || p.settlement);

  function saveCans() {
    const n = Number(count);
    if (!n || n <= 0) {
      window.alert('Please enter how many cans were delivered (more than zero).');
      return;
    }
    const locked = monthLockMessage(state, date, 'add this entry');
    if (locked) {
      window.alert(locked);
      return;
    }
    update((s) => ({
      ...s,
      waterCans: [...s.waterCans, { id: uid('can'), date, branch: entryBranch, count: n }],
    }));
    window.alert(`Saved ${n} cans on ${longDate(date)} for ${BRANCH_MAP[entryBranch].short}.`);
  }

  function saveRate() {
    const r = Number(rate);
    if (r > 0) update((s) => ({ ...s, canRate: r }));
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-base font-semibold text-slate-600">Total cans this month</p>
          <p className="num-xl mt-1">{totalCans}</p>
          <p className="text-base text-slate-600">{monthLabel(key)}</p>
        </Card>
        <Card>
          <p className="text-base font-semibold text-slate-600">Rate per can (editable)</p>
          <div className="mt-1 flex gap-2">
            <MoneyInput value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Rate per can in rupees" />
            <Btn variant="secondary" onClick={saveRate} className="min-h-[54px]">
              Save
            </Btn>
          </div>
        </Card>
        <Card>
          <p className="text-base font-semibold text-slate-600">Total can bill at month end</p>
          <p className="num-xl mt-1 text-brand">{money(bill)}</p>
          <p className="text-base text-slate-600">{totalCans} cans × {money(state.canRate)}</p>
        </Card>
        <Card className={allSettled ? 'border-good/30' : 'border-warn/30'}>
          <p className="text-base font-semibold text-slate-600">Vendor settlement</p>
          <div className="mt-2">
            <Badge tone={allSettled ? 'good' : 'warn'}>
              {allSettled ? 'ALL PAID' : 'NOT YET PAID'}
            </Badge>
          </div>
          <p className="mt-2 text-base text-slate-600">
            {allSettled
              ? 'Every PG with cans this month has been settled.'
              : 'Pay each PG separately — a bill belongs to one PG at a time.'}
          </p>
        </Card>
      </div>

      <section>
        <h2 className="headline mb-3">Month-end bill for each PG</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {perBranch.map((p) => {
            const paidAmount = p.settlement
              ? p.settlement.cash + p.settlement.upi + p.settlement.card
              : 0;
            const partPaid = !!p.settlement && paidAmount < p.bill;
            return (
            <Card
              key={p.branch}
              className={p.settlement && !partPaid ? 'border-good/30' : 'border-warn/30'}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{BRANCH_MAP[p.branch].short}</p>
                  <p className="text-base text-slate-600">
                    {p.cans} cans × {money(state.canRate)} · {monthLabel(key)}
                  </p>
                </div>
                <Badge tone={p.settlement && !partPaid ? 'good' : 'warn'}>
                  {p.settlement ? (partPaid ? 'PART PAID' : 'PAID') : 'NOT PAID'}
                </Badge>
              </div>
              <p className="num-xl mt-2 text-brand">{money(p.bill)}</p>
              {p.settlement ? (
                <p className="mt-1 text-base text-slate-600">
                  Paid {money(paidAmount)} on {longDate(p.settlement.date)}
                </p>
              ) : null}
              {partPaid ? (
                <p className="mt-1 text-base font-semibold text-warn">
                  {money(p.bill - paidAmount)} is still owed to the vendor
                </p>
              ) : null}
              <div className="mt-3">
                {p.settlement ? (
                  <Btn variant="secondary" onClick={() => setSettling(p.branch)}>
                    Change this payment
                  </Btn>
                ) : (
                  <Btn variant="success" disabled={p.cans === 0} onClick={() => setSettling(p.branch)}>
                    {p.cans === 0 ? 'No cans logged yet' : `Mark ${money(p.bill)} as PAID`}
                  </Btn>
                )}
              </div>
            </Card>
            );
          })}
        </div>
      </section>

      <Card>
        <h2 className="headline">Quick daily entry — how many cans arrived today?</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="PG Branch">
            <SelectInput value={entryBranch} onChange={(e) => setEntryBranch(e.target.value as BranchId)}>
              {BRANCHES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.short}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Number of cans">
            <MoneyInput value={count} onChange={(e) => setCount(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[10, 20, 25].map((q) => (
            <Btn key={q} variant="secondary" onClick={() => setCount(String(q))} aria-pressed={count === String(q)}>
              +{q} Cans
            </Btn>
          ))}
          <Btn onClick={saveCans}>
            <Plus size={22} aria-hidden /> Save Today&apos;s Cans
          </Btn>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="headline">Cans delivered this month</h2>
      </div>

      {logs.length === 0 ? (
        <EmptyState title="No cans logged this month yet" hint="Use the big buttons above to save today’s cans." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {logs.map((c) => (
            <Card key={c.id} className="flex items-center justify-between gap-3 py-4">
              <div className="flex items-center gap-3">
                <Droplets size={26} aria-hidden className="text-info" />
                <div>
                  <p className="num-lg">{c.count} cans</p>
                  <p className="text-base text-slate-600">{BRANCH_MAP[c.branch].short}</p>
                </div>
              </div>
              <p className="text-base font-semibold text-slate-600">{longDate(c.date)}</p>
            </Card>
          ))}
        </div>
      )}

      {settling ? (
        <SettleCansModal
          monthKeyVal={key}
          branchId={settling}
          bill={perBranch.find((p) => p.branch === settling)?.bill ?? 0}
          cans={perBranch.find((p) => p.branch === settling)?.cans ?? 0}
          rate={state.canRate}
          onClose={() => setSettling(null)}
        />
      ) : null}
    </div>
  );
}

function SettleCansModal({
  monthKeyVal,
  branchId,
  bill,
  cans,
  rate,
  onClose,
}: {
  monthKeyVal: string;
  branchId: BranchId;
  bill: number;
  cans: number;
  rate: number;
  onClose: () => void;
}) {
  const { state, update } = useStore();
  const [cash, setCash] = useState('');
  const [upi, setUpi] = useState('');
  const [card, setCard] = useState('');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');

  function save() {
    const c = Number(cash || 0);
    const u = Number(upi || 0);
    const d = Number(card || 0);
    if (c + u + d <= 0) {
      setError('Enter how much was paid in Cash, UPI or Card.');
      return;
    }
    // A closed month is final — neither the payment month nor the bill month
    // may be touched.
    const locked =
      monthLockMessage(state, date, 'pay this bill') ??
      monthLockMessage(state, `${monthKeyVal}-01`, 'pay a bill for a closed month');
    if (locked) {
      setError(locked);
      return;
    }
    if (Math.abs(c + u + d - bill) > 1) {
      if (!window.confirm(`You entered ${money(c + u + d)} but the bill is ${money(bill)}. Save anyway?`)) return;
    }
    update((s) => ({
      ...s,
      canSettlements: [
        ...s.canSettlements.filter((x) => !(x.monthKey === monthKeyVal && x.branch === branchId)),
        { id: uid('cst'), monthKey: monthKeyVal, branch: branchId, date, cash: c, upi: u, card: d },
      ],
    }));
    window.alert(
      `Water can bill for ${BRANCH_MAP[branchId].short} — ${monthLabel(monthKeyVal)} marked as PAID (${money(c + u + d)}).`,
    );
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Month-End Water Can Settlement — ${BRANCH_MAP[branchId].short}`} subtitle={`${cans} cans × ${money(rate)} = ${money(bill)}`}>
      <div className="space-y-4">
        <div className="well px-4 py-3">
          <InfoRow label="Total can bill" value={money(bill)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Paid in Cash (₹)"><MoneyInput value={cash} onChange={(e) => setCash(e.target.value)} /></Field>
          <Field label="Paid in UPI (₹)"><MoneyInput value={upi} onChange={(e) => setUpi(e.target.value)} /></Field>
          <Field label="Paid in Card (₹)"><MoneyInput value={card} onChange={(e) => setCard(e.target.value)} /></Field>
        </div>
        <Field label="Date paid">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {error ? <p className="font-semibold text-bad">{error}</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>Mark as PAID</Btn>
          <Btn variant="secondary" full onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

function TankersTab() {
  const { state, update, branch } = useStore();
  const key = currentMonthKey();
  const [date, setDate] = useState(todayISO());
  const [tBranch, setTBranch] = useState<BranchId>(branch === 'ALL' ? 'PG1' : branch);
  const [note, setNote] = useState('25,000 L — Sri Vinayak Water Works');
  const [cost, setCost] = useState('1500');
  const [mode, setMode] = useState<PaymentMode>('UPI');
  const [error, setError] = useState('');

  const tankers = state.waterTankers
    .filter((t) => monthKey(t.date) === key && (branch === 'ALL' || t.branch === branch))
    .sort((a, b) => b.date.localeCompare(a.date));
  const count = tankers.length;
  const spent = tankers.reduce((n, t) => n + t.cost, 0);

  function save() {
    const c = Number(cost);
    if (!c || c <= 0) {
      setError('Please enter the tanker cost in rupees.');
      return;
    }
    const locked = monthLockMessage(state, date, 'add this tanker');
    if (locked) {
      setError(locked);
      return;
    }
    setError('');
    update((s) => ({
      ...s,
      waterTankers: [...s.waterTankers, { id: uid('tnk'), date, branch: tBranch, note: note || 'Water tanker', cost: c, mode }],
    }));
    window.alert(`Tanker of ${money(c)} saved and paid by ${mode} on ${longDate(date)}.`);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-base font-semibold text-slate-600">Tankers this month</p>
          <p className="num-xl mt-1">{count}</p>
          <p className="text-base text-slate-600">{monthLabel(key)}</p>
        </Card>
        <Card>
          <p className="text-base font-semibold text-slate-600">Total spent on tankers</p>
          <p className="num-xl mt-1 text-brand">{money(spent)}</p>
          <p className="text-base text-slate-600">Paid on the same day of delivery</p>
        </Card>
      </div>

      <Card>
        <h2 className="flex items-center gap-2 headline">
          <Truck size={26} aria-hidden /> Book &amp; Pay a Tanker (same day)
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Date tanker arrived">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="PG Branch">
            <SelectInput value={tBranch} onChange={(e) => setTBranch(e.target.value as BranchId)}>
              {BRANCHES.map((b) => (
                <option key={b.id} value={b.id}>{b.short}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Capacity / vendor note">
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="25,000 L — vendor name" />
          </Field>
          <Field label="Cost paid (₹)" error={error}>
            <MoneyInput value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label="Paid by">
            <SelectInput value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
              {MODES.map((m) => <option key={m}>{m}</option>)}
            </SelectInput>
          </Field>
        </div>
        <div className="mt-4">
          <Btn onClick={save}>
            <Plus size={22} aria-hidden /> Save Tanker &amp; Payment
          </Btn>
        </div>
      </Card>

      <h2 className="headline">Tankers this month</h2>
      {tankers.length === 0 ? (
        <EmptyState title="No tankers this month" hint="Use the form above when a tanker arrives." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tankers.map((t) => (
            <Card key={t.id} className="py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Truck size={26} aria-hidden className="text-info" />
                  <div>
                    <p className="num-lg">{money(t.cost)}</p>
                    <p className="text-base text-slate-600">{BRANCH_MAP[t.branch].short}</p>
                  </div>
                </div>
                <Badge tone="neutral">{t.mode}</Badge>
              </div>
              <p className="mt-2 text-base text-slate-700">{t.note}</p>
              <p className="text-base text-slate-600">{longDate(t.date)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
