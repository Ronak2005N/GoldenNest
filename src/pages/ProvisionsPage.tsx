import { useMemo, useState } from 'react';
import { Check, Plus, Trash2, Truck } from 'lucide-react';
import { useStore } from '../app/store/StoreProvider';
import { BRANCHES, BRANCH_MAP } from '../app/store/branches';
import type { BranchFilter, PaymentMode, ProvisionSettlement } from '../app/store/types';
import { monthLockMessage } from '../app/store/monthLock';
import { provisionCreditBalances, provisionStatus } from '../app/store/selectors';
import { currentMonthKey, longDate, monthKey, monthLabel, todayISO } from '../shared/lib/dates';
import { money, uid } from '../shared/lib/format';
import {
  Badge,
  Btn,
  Card,
  EmptyState,
  Field,
  InfoRow,
  Modal,
  MoneyInput,
  PageIntro,
  SelectInput,
  TextInput,
} from '../shared/ui';

const MODES: PaymentMode[] = ['Cash', 'UPI', 'Card'];

export function ProvisionsPage() {
  const { state, update, branch } = useStore();
  const key = currentMonthKey();
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [entryBranch, setEntryBranch] = useState<BranchFilter>(branch === 'ALL' ? 'PG1' : branch);
  const [mode, setMode] = useState<PaymentMode>('Cash');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [credit, setCredit] = useState(false);
  const [newChip, setNewChip] = useState('');
  const [chipOpen, setChipOpen] = useState(false);
  const [error, setError] = useState('');
  const [settling, setSettling] = useState<string | null>(null);

  const expenses = state.provisionExpenses
    .filter((p) => branch === 'ALL' || p.branch === branch || p.branch === 'ALL')
    .sort((a, b) => b.date.localeCompare(a.date));
  // What was actually paid for in this month — credit purchases are not cash.
  const monthTotal = expenses
    .filter((p) => monthKey(p.date) === key && provisionStatus(p) !== 'credit')
    .reduce((n, p) => n + p.amount, 0);
  const creditRows = useMemo(
    () => provisionCreditBalances(state, branch).filter((r) => r.outstanding > 0),
    [state, branch],
  );
  const creditTotal = creditRows.reduce((n, r) => n + r.outstanding, 0);

  const qty = Number(quantity || 0);
  const unit = Number(unitPrice || 0);
  const locked = monthLockMessage(state, date, 'change this month’s provisions');

  /** Keeps the amount in step with quantity × unit price, until it is typed by hand. */
  function setQuantityValue(value: string) {
    setQuantity(value);
    const product = Number(value || 0) * unit;
    if (product > 0 && (!amount || Number(amount) === qty * unit)) setAmount(String(product));
  }
  function setUnitPriceValue(value: string) {
    setUnitPrice(value);
    const product = qty * Number(value || 0);
    if (product > 0 && (!amount || Number(amount) === qty * unit)) setAmount(String(product));
  }

  function saveExpense() {
    if (!selected) {
      setError('First tap one of the item buttons above.');
      return;
    }
    const a = Number(amount);
    if (!a || a <= 0) {
      setError('Please enter how much it cost.');
      return;
    }
    if (locked) {
      setError(locked);
      return;
    }
    setError('');
    const q = Number(quantity || 0);
    const up = Number(unitPrice || 0);
    update((s) => ({
      ...s,
      provisionExpenses: [
        ...s.provisionExpenses,
        {
          id: uid('pv'),
          date,
          branch: entryBranch,
          item: selected,
          amount: a,
          mode: credit ? mode : mode,
          quantity: q > 0 ? q : undefined,
          unitPrice: up > 0 ? up : undefined,
          supplier: supplier.trim() || undefined,
          status: credit ? 'credit' : 'paid',
        },
      ],
    }));
    window.alert(
      credit
        ? `${money(a)} for ${selected} recorded as credit from ${supplier.trim() || 'the supplier'} — it is not paid yet.`
        : `Saved ${money(a)} for ${selected} (paid by ${mode}).`,
    );
    setAmount('');
    setQuantity('');
    setUnitPrice('');
    setSupplier('');
    setCredit(false);
    setSelected(null);
  }

  function addChip() {
    const name = newChip.trim();
    if (!name) return;
    update((s) =>
      s.provisionChips.includes(name)
        ? s
        : { ...s, provisionChips: [...s.provisionChips, name] },
    );
    setNewChip('');
    setSelected(name);
    window.alert(`“${name}” saved permanently. Just tap it next time.`);
  }

  function removeExpense(id: string, item: string) {
    const entry = state.provisionExpenses.find((p) => p.id === id);
    const blocked = entry ? monthLockMessage(state, entry.date, `remove the ${item} entry`) : null;
    if (blocked) {
      window.alert(blocked);
      return;
    }
    if (!window.confirm(`Remove the ${item} expense entry? This cannot be undone.`)) return;
    update((s) => ({ ...s, provisionExpenses: s.provisionExpenses.filter((p) => p.id !== id) }));
  }

  return (
    <div>
      <PageIntro
        title="Daily Provisions & Hostel Use"
        hint="Tap an item, type the amount, choose how you paid — three taps, no typing of item names."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-base font-semibold text-slate-600">Provisions paid this month</p>
          <p className="num-xl mt-1 text-brand">{money(monthTotal)}</p>
          <p className="text-base text-slate-600">{monthLabel(key)} · cash actually paid</p>
        </Card>
        <Card>
          <p className="text-base font-semibold text-slate-600">Bought on credit</p>
          <p className={`num-xl mt-1 ${creditTotal > 0 ? 'text-warn' : ''}`}>{money(creditTotal)}</p>
          <p className="text-base text-slate-600">Not paid to the supplier yet</p>
        </Card>
        <Card>
          <p className="text-base font-semibold text-slate-600">Items in your list</p>
          <p className="num-xl mt-1">{state.provisionChips.length}</p>
          <p className="text-base text-slate-600">Saved forever on this device</p>
        </Card>
      </div>

      <Card className="mb-5">
        <h2 className="headline">1. Tap the item you bought</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {state.provisionChips.map((chip) => {
            const active = selected === chip;
            return (
              <button
                key={chip}
                type="button"
                onClick={() => setSelected(chip)}
                aria-pressed={active}
                className={`press inline-flex min-h-[54px] items-center gap-2 rounded-full border px-5 text-base font-semibold ${
                  active
                    ? 'border-brand bg-brand text-white'
                    : 'border-line bg-white hover:border-brand hover:text-brand-dark'
                }`}
              >
                {active ? <Check size={20} aria-hidden /> : null}
                {chip}
              </button>
            );
          })}
        </div>

        <div className="mt-4 border-t border-line/70 pt-4">
          {chipOpen ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label="New item name" hint="It will be saved permanently as a button.">
                  <TextInput
                    value={newChip}
                    onChange={(e) => setNewChip(e.target.value)}
                    placeholder="e.g. Water Motor Service"
                  />
                </Field>
              </div>
              <Btn onClick={addChip}>Save New Item Button</Btn>
              <Btn variant="secondary" onClick={() => { setChipOpen(false); setNewChip(''); }}>
                Cancel
              </Btn>
            </div>
          ) : (
            <Btn variant="secondary" onClick={() => setChipOpen(true)}>
              <Plus size={22} aria-hidden /> Add Item Chip (save a new item forever)
            </Btn>
          )}
        </div>
      </Card>

      <Card className="mb-5">
        <h2 className="headline">2 &amp; 3. Type the amount and how you paid</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Item chosen">
            <div className="well flex min-h-[54px] items-center px-4 text-base font-semibold">
              {selected ?? '— tap a button above —'}
            </div>
          </Field>
          <Field label="Amount (₹)">
            <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="PG Branch">
            <SelectInput value={entryBranch} onChange={(e) => setEntryBranch(e.target.value as BranchFilter)}>
              <option value="ALL">All PGs</option>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.short}</option>)}
            </SelectInput>
          </Field>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="Quantity (how many)" hint="Optional — leave blank if it does not matter.">
            <TextInput
              type="number"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantityValue(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Price of one (₹)" hint="Optional — the amount is worked out for you.">
            <TextInput
              type="number"
              inputMode="decimal"
              value={unitPrice}
              onChange={(e) => setUnitPriceValue(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Supplier" hint="Optional — who you bought it from.">
            <TextInput
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="e.g. Amul / BigBasket"
            />
          </Field>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-base font-semibold">Paid now, or bought on credit?</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCredit(false)}
              aria-pressed={!credit}
              className={`press min-h-[54px] min-w-[140px] rounded-xl border px-5 text-base font-bold ${
                !credit ? 'border-brand bg-brand text-white' : 'border-line bg-white'
              }`}
            >
              Paid now
            </button>
            <button
              type="button"
              onClick={() => setCredit(true)}
              aria-pressed={credit}
              className={`press min-h-[54px] min-w-[180px] rounded-xl border px-5 text-base font-bold ${
                credit ? 'border-warn bg-warn text-white' : 'border-line bg-white'
              }`}
            >
              On credit (not paid)
            </button>
          </div>
          <p className="mt-2 text-base text-slate-600">
            {credit
              ? 'Goods bought on credit do not touch this month’s cash. They stay as money you owe the supplier until you pay.'
              : 'Money you paid today — it shows in this month’s profit and loss.'}
          </p>
        </div>

        {!credit ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`press min-h-[54px] min-w-[110px] rounded-xl border px-5 text-base font-bold ${
                  mode === m ? 'border-brand bg-brand text-white' : 'border-line bg-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        ) : null}

        {locked ? (
          <p className="mt-3 rounded-xl border border-bad/35 bg-bad/[0.07] px-4 py-3 font-semibold text-bad">
            {locked}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Btn onClick={saveExpense} disabled={!!locked}>
            Save Expense
          </Btn>
        </div>
        {error ? <p className="mt-2 font-semibold text-bad">{error}</p> : null}
      </Card>

      {creditRows.length > 0 ? (
        <Card className="mb-5 border-warn/30">
          <h2 className="headline">Supplier credit balances</h2>
          <p className="mt-1 text-base text-slate-600">
            Money you still owe for goods bought on credit. Pay the supplier and the amount comes out of
            this month&apos;s cash.
          </p>
          <div className="mt-3 space-y-2">
            {creditRows.map((row) => (
              <div key={row.supplier} className="well flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-base font-semibold">{row.supplier}</p>
                  <p className="text-base text-slate-600">
                    Bought {money(row.bought)} on credit · paid {money(row.paid)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="num-lg text-warn">{money(row.outstanding)}</span>
                  <Btn variant="secondary" onClick={() => setSettling(row.supplier)}>
                    <Truck size={20} aria-hidden /> Pay Supplier
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <h2 className="mb-3 headline">Recent provision expenses</h2>
      {expenses.length === 0 ? (
        <EmptyState title="No expenses recorded yet" hint="Tap an item above and save your first expense." />
      ) : (
        <div className="space-y-2">
          {expenses.slice(0, 25).map((p) => {
            const isCredit = provisionStatus(p) === 'credit';
            return (
              <Card key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-base font-semibold">{p.item}</p>
                  <p className="text-base text-slate-600">
                    {longDate(p.date)} · {p.branch === 'ALL' ? 'All PGs' : BRANCH_MAP[p.branch].short}
                    {p.supplier ? ` · ${p.supplier}` : ''}
                    {p.quantity ? ` · ${p.quantity} × ${money(p.unitPrice ?? 0)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {isCredit ? <Badge tone="warn">On credit</Badge> : <Badge tone="good">{p.mode}</Badge>}
                  <span className="num-lg">{money(p.amount)}</span>
                  <button
                    type="button"
                    onClick={() => removeExpense(p.id, p.item)}
                    aria-label={`Delete ${p.item} expense of ${money(p.amount)}`}
                    className="press flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-line text-bad hover:border-bad/40 hover:bg-bad/[0.07]"
                  >
                    <Trash2 size={22} aria-hidden />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-5">
        <Badge tone="neutral">Everything here is included in the Dashboard profit &amp; loss</Badge>
      </div>

      <SettleSupplierModal
        supplier={settling}
        onClose={() => setSettling(null)}
      />
    </div>
  );
}

/**
 * Paying a supplier for goods that were bought on credit.
 *
 * The payment is a cash row: the money leaves the bank on the day it is paid,
 * and it is the month's expense — exactly like the water can vendor.
 */
function SettleSupplierModal({ supplier, onClose }: { supplier: string | null; onClose: () => void }) {
  const { state, update, branch } = useStore();
  const row = useMemo(
    () => (supplier ? provisionCreditBalances(state, branch).find((r) => r.supplier === supplier) : null),
    [state, branch, supplier],
  );
  const [cash, setCash] = useState('');
  const [upi, setUpi] = useState('');
  const [card, setCard] = useState('');
  const [date, setDate] = useState(todayISO());
  const [entryBranch, setEntryBranch] = useState<BranchFilter>(branch === 'ALL' ? 'PG1' : branch);
  const [error, setError] = useState('');

  if (!supplier) return null;

  const supplierName = supplier;
  const total = Number(cash || 0) + Number(upi || 0) + Number(card || 0);
  const outstanding = row?.outstanding ?? 0;
  const locked = monthLockMessage(state, date, 'pay the supplier');

  function fillFull() {
    const rest = Math.max(0, outstanding - total);
    setCash(String(Number(cash || 0) + rest));
  }

  function save() {
    if (total <= 0) {
      setError('Enter how much you paid the supplier.');
      return;
    }
    if (locked) {
      setError(locked);
      return;
    }
    const payment: ProvisionSettlement = {
      id: uid('pvs'),
      date,
      branch: entryBranch,
      supplier: supplierName,
      cash: Number(cash || 0),
      upi: Number(upi || 0),
      card: Number(card || 0),
    };
    update((s) => ({
      ...s,
      provisionSettlements: [...s.provisionSettlements, payment],
    }));
    window.alert(
      `${money(total)} paid to ${supplierName}. It is recorded as cash spent in ${monthLabel(monthKey(date))}.`,
    );
    setCash('');
    setUpi('');
    setCard('');
    setError('');
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pay ${supplier}`}
      subtitle="Paying for goods bought on credit"
    >
      <div className="space-y-4">
        <div className="well px-4 py-3">
          <InfoRow label="Bought on credit" value={money(row?.bought ?? 0)} />
          <InfoRow label="Already paid" value={money(row?.paid ?? 0)} />
          <InfoRow label="Still owed" value={money(outstanding)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Cash (₹)">
            <MoneyInput value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" />
          </Field>
          <Field label="UPI (₹)">
            <MoneyInput value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Card (₹)">
            <MoneyInput value={card} onChange={(e) => setCard(e.target.value)} placeholder="0" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Btn variant="secondary" onClick={fillFull}>
            Pay the full balance in Cash
          </Btn>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date paid">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="PG Branch">
            <SelectInput value={entryBranch} onChange={(e) => setEntryBranch(e.target.value as BranchFilter)}>
              <option value="ALL">All PGs</option>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.short}</option>)}
            </SelectInput>
          </Field>
        </div>

        {locked ? <p className="font-semibold text-bad">{locked}</p> : null}
        {error ? <p className="font-semibold text-bad">{error}</p> : null}

        <Btn full onClick={save} disabled={!!locked}>
          Pay {money(total)} to {supplier}
        </Btn>
      </div>
    </Modal>
  );
}
