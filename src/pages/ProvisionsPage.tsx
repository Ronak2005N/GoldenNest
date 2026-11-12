import { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../app/store/StoreProvider';
import { BRANCHES, BRANCH_MAP } from '../app/store/branches';
import type { BranchFilter, PaymentMode } from '../app/store/types';
import { currentMonthKey, longDate, monthKey, monthLabel, todayISO } from '../shared/lib/dates';
import { money, uid } from '../shared/lib/format';
import { Badge, Btn, Card, EmptyState, Field, MoneyInput, PageIntro, SelectInput, TextInput } from '../shared/ui';

const MODES: PaymentMode[] = ['Cash', 'UPI', 'Card'];

export function ProvisionsPage() {
  const { state, update, branch } = useStore();
  const key = currentMonthKey();
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [entryBranch, setEntryBranch] = useState<BranchFilter>(branch === 'ALL' ? 'PG1' : branch);
  const [mode, setMode] = useState<PaymentMode>('Cash');
  const [newChip, setNewChip] = useState('');
  const [chipOpen, setChipOpen] = useState(false);
  const [error, setError] = useState('');

  const expenses = state.provisionExpenses
    .filter((p) => branch === 'ALL' || p.branch === branch || p.branch === 'ALL')
    .sort((a, b) => b.date.localeCompare(a.date));
  const monthTotal = expenses
    .filter((p) => monthKey(p.date) === key)
    .reduce((n, p) => n + p.amount, 0);

  function saveExpense() {
    if (!selected) {
      setError('First tap one of the item buttons above.');
      return;
    }
    const a = Number(amount);
    if (!a || a <= 0) {
      setError('Please enter how much you paid.');
      return;
    }
    setError('');
    update((s) => ({
      ...s,
      provisionExpenses: [
        ...s.provisionExpenses,
        { id: uid('pv'), date, branch: entryBranch, item: selected, amount: a, mode },
      ],
    }));
    window.alert(`Saved ${money(a)} for ${selected} (paid by ${mode}).`);
    setAmount('');
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
          <p className="text-base font-semibold text-slate-600">Provisions spent this month</p>
          <p className="num-xl mt-1 text-brand">{money(monthTotal)}</p>
          <p className="text-base text-slate-600">{monthLabel(key)}</p>
        </Card>
        <Card>
          <p className="text-base font-semibold text-slate-600">Items in your list</p>
          <p className="num-xl mt-1">{state.provisionChips.length}</p>
          <p className="text-base text-slate-600">Saved forever on this device</p>
        </Card>
        <Card>
          <p className="text-base font-semibold text-slate-600">Entries recorded</p>
          <p className="num-xl mt-1">{expenses.length}</p>
          <p className="text-base text-slate-600">All time</p>
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
          <Field label="Amount paid (₹)">
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
          <Btn onClick={saveExpense} className="ml-auto">
            Save Expense
          </Btn>
        </div>
        {error ? <p className="mt-2 font-semibold text-bad">{error}</p> : null}
      </Card>

      <h2 className="mb-3 headline">Recent provision expenses</h2>
      {expenses.length === 0 ? (
        <EmptyState title="No expenses recorded yet" hint="Tap an item above and save your first expense." />
      ) : (
        <div className="space-y-2">
          {expenses.slice(0, 25).map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-base font-semibold">{p.item}</p>
                <p className="text-base text-slate-600">
                  {longDate(p.date)} · {p.branch === 'ALL' ? 'All PGs' : BRANCH_MAP[p.branch].short} · {p.mode}
                </p>
              </div>
              <div className="flex items-center gap-3">
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
          ))}
        </div>
      )}

      <div className="mt-5">
        <Badge tone="neutral">Everything here is included in the Dashboard profit &amp; loss</Badge>
      </div>
    </div>
  );
}
