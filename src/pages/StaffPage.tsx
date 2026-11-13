import { useState } from 'react';
import { HandCoins, LogOut, UserPlus, Wallet } from 'lucide-react';
import { useStore } from '../app/store/StoreProvider';
import { BRANCHES, BRANCH_MAP } from '../app/store/branches';
import { monthLockMessage } from '../app/store/monthLock';
import { staffLedgers } from '../app/store/selectors';
import type { BranchId, PaymentMode, Staff, StaffRole } from '../app/store/types';
import { currentMonthKey, longDate, monthLabel, todayISO } from '../shared/lib/dates';
import { digitsOnly, isValidMobile, money, uid } from '../shared/lib/format';
import { Badge, Btn, Card, EmptyState, Field, Modal, MoneyInput, PageIntro, SelectInput, Tabs, TextInput } from '../shared/ui';

const ROLES: StaffRole[] = ['Cook', 'Assistant', 'Helper / Warden'];

export function StaffPage() {
  const { state, branch } = useStore();
  const key = currentMonthKey();
  const [tab, setTab] = useState('working');
  const [adding, setAdding] = useState(false);
  const [advancing, setAdvancing] = useState<Staff | null>(null);
  const [paying, setPaying] = useState<Staff | null>(null);
  const [leaving, setLeaving] = useState<Staff | null>(null);

  const allStaff = state.staff.filter((s) => branch === 'ALL' || s.branch === branch);
  const staff = allStaff.filter((s) => !s.leftDate);
  const leftStaff = allStaff.filter((s) => !!s.leftDate);
  // The payroll for this month — a person who joined or left part-way through
  // it is paid for the days they actually worked.
  const ledger = staffLedgers(state, branch, key);
  const ledgerById = new Map(ledger.map((r) => [r.staff.id, r]));

  function advancesFor(id: string) {
    return state.staffAdvances.filter((a) => a.staffId === id && a.date.startsWith(key));
  }
  function payoutsFor(id: string) {
    return state.staffPayouts.filter((p) => p.staffId === id && p.date.startsWith(key));
  }

  const totalSalary = ledger.reduce((n, r) => n + r.salary, 0);
  const totalAdvances = staff.reduce((n, s) => n + advancesFor(s.id).reduce((x, a) => x + a.amount, 0), 0);
  const totalPaid = staff.reduce((n, s) => n + payoutsFor(s.id).reduce((x, p) => x + p.amount, 0), 0);

  return (
    <div>
      <PageIntro
        title="Male Staff Salary & Advances"
        hint="Cook, Assistant and Helper / Warden staff. Salary remaining after advances is shown automatically."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-base font-semibold text-slate-600">Total monthly salary (all shown staff)</p>
          <p className="num-xl mt-1">{money(totalSalary)}</p>
        </Card>
        <Card>
          <p className="text-base font-semibold text-slate-600">Advances given this month</p>
          <p className="num-xl mt-1 text-warn">{money(totalAdvances)}</p>
        </Card>
        <Card>
          <p className="text-base font-semibold text-slate-600">Salary already handed over</p>
          <p className="num-xl mt-1 text-good">{money(totalPaid)}</p>
        </Card>
      </div>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <Tabs
          ariaLabel="Staff lists"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'working', label: 'Currently Working', badge: staff.length },
            { id: 'left', label: 'Left (History)', badge: leftStaff.length },
          ]}
        />
        <Btn onClick={() => setAdding(true)}>
          <UserPlus size={22} aria-hidden /> Add Staff Member
        </Btn>
      </div>

      {tab === 'left' ? (
        leftStaff.length === 0 ? (
          <EmptyState
            title="Nobody has left yet"
            hint="When a staff member leaves, use “Mark as Left” on their card. Their salary then stops being counted in the profit and loss."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {leftStaff.map((s) => (
              <Card key={s.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold leading-tight">{s.name}</p>
                    <p className="text-base text-slate-600">{s.role}</p>
                  </div>
                  <Badge tone="neutral">LEFT PG</Badge>
                </div>
                <div className="well px-4 py-3">
                  <div className="flex justify-between gap-3 text-base">
                    <span className="text-slate-600">Joined on</span>
                    <span className="num-md">{longDate(s.joinDate ?? '')}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-base">
                    <span className="text-slate-600">Left on</span>
                    <span className="num-md">{longDate(s.leftDate ?? '')}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-base">
                    <span className="text-slate-600">Monthly salary</span>
                    <span className="num-md">{money(s.salary)}</span>
                  </div>
                </div>
                <p className="text-base text-slate-600">
                  Salary for {monthLabel(key)} is not counted, because this person had already left.
                </p>
                <Btn variant="secondary" onClick={() => setLeaving(s)}>
                  <LogOut size={20} aria-hidden /> Change leaving date
                </Btn>
              </Card>
            ))}
          </div>
        )
      ) : staff.length === 0 ? (
        <EmptyState
          title="No staff added yet"
          hint="Add your Cook, Assistant and Helper with their monthly salary — advances and payments will be tracked from then on."
          action={<Btn onClick={() => setAdding(true)}><UserPlus size={22} aria-hidden /> Add Staff Member</Btn>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {staff.map((s) => {
            const row = ledgerById.get(s.id);
            const adv = row?.advances ?? 0;
            const carried = row?.advanceCarried ?? 0;
            const deducted = row?.advanceDeducted ?? adv;
            const paid = row?.paid ?? 0;
            const salary = row?.salary ?? s.salary;
            const partial = row?.partialMonth ?? false;
            // The ledger already works the carried-over advance into this month.
            const remaining = row?.remaining ?? Math.max(0, salary - deducted - paid);
            return (
              <Card key={s.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold leading-tight">{s.name}</p>
                    <p className="text-base text-slate-600">{s.role}</p>
                  </div>
                  <Badge tone="info">{BRANCH_MAP[s.branch].short}</Badge>
                </div>

                <a
                  href={`tel:+91${s.mobile}`}
                  className="press inline-flex min-h-[52px] items-center gap-2 rounded-xl border border-line px-4 text-base font-semibold hover:border-slate-400"
                >
                  Call {s.mobile}
                </a>

                <div className="well px-4 py-3">
                  <div className="flex justify-between gap-3 text-base">
                    <span className="text-slate-600">Monthly base salary</span>
                    <span className="num-md">{money(s.salary)}</span>
                  </div>
                  {partial ? (
                    <div className="flex justify-between gap-3 text-base">
                      <span className="text-slate-600">Salary for this month</span>
                      <span className="num-md text-brand">{money(salary)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 text-base">
                    <span className="text-slate-600">Joined on</span>
                    <span className="num-md">{longDate(s.joinDate ?? '')}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-base">
                    <span className="text-slate-600">Advance taken this month</span>
                    <span className="num-md text-warn">{money(adv)}</span>
                  </div>
                  {carried > 0 ? (
                    <div className="flex justify-between gap-3 text-base">
                      <span className="text-slate-600">Advance carried over from earlier</span>
                      <span className="num-md text-warn">{money(carried)}</span>
                    </div>
                  ) : null}
                  {deducted > 0 ? (
                    <div className="flex justify-between gap-3 text-base">
                      <span className="text-slate-600">Advance adjusted against salary</span>
                      <span className="num-md text-warn">{money(deducted)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 text-base">
                    <span className="text-slate-600">Paid this month</span>
                    <span className="num-md text-good">{money(paid)}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-3 border-t border-line pt-1">
                    <span className="font-semibold">Net salary payable</span>
                    <span className="num-xl text-brand">{money(remaining)}</span>
                  </div>
                </div>

                <div className="mt-auto flex flex-col gap-2">
                  <Btn variant="secondary" onClick={() => setAdvancing(s)}>
                    <HandCoins size={20} aria-hidden /> Give Salary Advance
                  </Btn>
                  <Btn disabled={remaining <= 0} onClick={() => setPaying(s)}>
                    <Wallet size={20} aria-hidden />
                    {remaining > 0 ? `Pay Remaining Salary (${money(remaining)})` : 'Salary fully paid'}
                  </Btn>
                  <Btn variant="danger" onClick={() => setLeaving(s)}>
                    <LogOut size={20} aria-hidden /> Mark as Left
                  </Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="headline">Advances this month</h2>
          <div className="mt-3 space-y-2">
            {state.staffAdvances
              .filter((a) => a.date.startsWith(key) && (branch === 'ALL' || state.staff.find((s) => s.id === a.staffId)?.branch === branch))
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((a) => {
                const person = state.staff.find((s) => s.id === a.staffId);
                return (
                  <div key={a.id} className="flex items-center justify-between gap-3 well px-4 py-3">
                    <div>
                      <p className="text-base font-semibold">{person?.name ?? 'Former staff'}</p>
                      <p className="text-base text-slate-600">{longDate(a.date)} · {a.mode}</p>
                    </div>
                    <span className="num-lg text-warn">{money(a.amount)}</span>
                  </div>
                );
              })}
            {state.staffAdvances.filter((a) => a.date.startsWith(key)).length === 0 ? (
              <p className="text-base text-slate-600">No advances given this month.</p>
            ) : null}
          </div>
        </Card>
        <Card>
          <h2 className="headline">Salary payments this month</h2>
          <div className="mt-3 space-y-2">
            {state.staffPayouts
              .filter((p) => p.date.startsWith(key) && (branch === 'ALL' || state.staff.find((s) => s.id === p.staffId)?.branch === branch))
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((p) => {
                const person = state.staff.find((s) => s.id === p.staffId);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 well px-4 py-3">
                    <div>
                      <p className="text-base font-semibold">{person?.name ?? 'Former staff'}</p>
                      <p className="text-base text-slate-600">{longDate(p.date)} · {p.mode}</p>
                    </div>
                    <span className="num-lg text-good">{money(p.amount)}</span>
                  </div>
                );
              })}
            {state.staffPayouts.filter((p) => p.date.startsWith(key)).length === 0 ? (
              <p className="text-base text-slate-600">No salary paid yet this month.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <AddStaffModal open={adding} onClose={() => setAdding(false)} />
      <AdvanceModal staff={advancing} onClose={() => setAdvancing(null)} />
      <PaySalaryModal staff={paying} onClose={() => setPaying(null)} />
      <LeaveStaffModal staff={leaving} onClose={() => setLeaving(null)} />
    </div>
  );
}

function LeaveStaffModal({ staff, onClose }: { staff: Staff | null; onClose: () => void }) {
  const { state, update } = useStore();
  const [leftDate, setLeftDate] = useState(todayISO());
  const [error, setError] = useState('');

  if (!staff) return null;

  function save() {
    if (!leftDate) {
      setError('Please choose the date the person left.');
      return;
    }
    const locked = monthLockMessage(state, leftDate, 'change the leaving date');
    if (locked) {
      setError(locked);
      return;
    }
    update((s) => ({
      ...s,
      staff: s.staff.map((x) => (x.id === staff!.id ? { ...x, leftDate } : x)),
    }));
    window.alert(
      `${staff!.name} is marked as left from ${longDate(leftDate)}.\nTheir salary is counted up to that month only.`,
    );
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`${staff.leftDate ? 'Change leaving date' : 'Mark as Left'} — ${staff.name}`} subtitle={`${staff.role} · ${BRANCH_MAP[staff.branch].short}`}>
      <div className="space-y-4">
        <Field label="Date the person left" error={error}>
          <TextInput type="date" value={leftDate} onChange={(e) => setLeftDate(e.target.value)} />
        </Field>
        <div className="rounded-xl bg-brand-soft px-4 py-3 text-base font-semibold text-brand-dark">
          After this date the salary is no longer counted in the profit and loss. Salary is still
          counted for the month the person left in.
        </div>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>Save</Btn>
          <Btn variant="secondary" full onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

function AddStaffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { update } = useStore();
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('Cook');
  const [mobile, setMobile] = useState('');
  const [staffBranch, setStaffBranch] = useState<BranchId>('PG1');
  const [salary, setSalary] = useState('12000');
  const [joinDate, setJoinDate] = useState(todayISO());
  const [errors, setErrors] = useState<Record<string, string>>({});

  function save() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Please type the staff member’s name.';
    if (!isValidMobile(mobile)) e.mobile = 'Please enter a 10-digit mobile number.';
    if (Number(salary) <= 0) e.salary = 'Please enter the monthly salary.';
    setErrors(e);
    if (Object.keys(e).length) return;
    update((s) => ({
      ...s,
      staff: [
        ...s.staff,
        {
          id: uid('stf'),
          name: name.trim(),
          role,
          mobile: digitsOnly(mobile),
          branch: staffBranch,
          salary: Number(salary),
          joinDate,
        },
      ],
    }));
    window.alert(`${name.trim()} added as ${role} at ${BRANCH_MAP[staffBranch].short}.`);
    setName('');
    setMobile('');
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Staff Member" subtitle="Only male staff: Cook, Assistant or Helper / Warden.">
      <div className="space-y-4">
        <Field label="Staff name" error={errors.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Type the full name" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role">
            <SelectInput value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </SelectInput>
          </Field>
          <Field label="Mobile number" error={errors.mobile}>
            <TextInput value={mobile} inputMode="tel" onChange={(e) => setMobile(e.target.value)} placeholder="98450 12345" />
          </Field>
          <Field label="Assigned PG Branch">
            <SelectInput value={staffBranch} onChange={(e) => setStaffBranch(e.target.value as BranchId)}>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.short}</option>)}
            </SelectInput>
          </Field>
          <Field label="Fixed monthly salary (₹)" error={errors.salary}>
            <MoneyInput value={salary} onChange={(e) => setSalary(e.target.value)} />
          </Field>
          <Field label="Date the person joined">
            <TextInput type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>Save Staff Member</Btn>
          <Btn variant="secondary" full onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

function AdvanceModal({ staff, onClose }: { staff: Staff | null; onClose: () => void }) {
  const { state, update } = useStore();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(currentMonthKey() + '-' + String(new Date().getDate()).padStart(2, '0'));
  const [mode, setMode] = useState<'Cash' | 'UPI'>('Cash');
  const [error, setError] = useState('');

  if (!staff) return null;

  function save() {
    const a = Number(amount);
    if (!a || a <= 0) {
      setError('Please enter the advance amount.');
      return;
    }
    const locked = monthLockMessage(state, date, 'give this advance');
    if (locked) {
      setError(locked);
      return;
    }
    update((s) => ({
      ...s,
      staffAdvances: [...s.staffAdvances, { id: uid('sa'), staffId: staff!.id, date, amount: a, mode }],
    }));
    window.alert(`${money(a)} advance given to ${staff!.name} by ${mode} on ${longDate(date)}.`);
    setAmount('');
    setError('');
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Salary Advance — ${staff.name}`} subtitle={`Monthly salary ${money(staff.salary)}`}>
      <div className="space-y-4">
        <Field label="Advance amount (₹)" error={error}>
          <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date given">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Paid by">
          <SelectInput value={mode} onChange={(e) => setMode(e.target.value as 'Cash' | 'UPI')}>
            <option>Cash</option>
            <option>UPI</option>
          </SelectInput>
        </Field>
        <div className="rounded-xl bg-brand-soft px-4 py-3 text-base font-semibold text-brand-dark">
          This advance will be cut from {staff.name}’s salary at month end.
        </div>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>Save Advance</Btn>
          <Btn variant="secondary" full onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

function PaySalaryModal({ staff, onClose }: { staff: Staff | null; onClose: () => void }) {
  const { state, update } = useStore();
  const key = currentMonthKey();
  const [mode, setMode] = useState<PaymentMode>('Cash');
  const [date, setDate] = useState(currentMonthKey() + '-' + String(new Date().getDate()).padStart(2, '0'));
  const [amount, setAmount] = useState('');

  if (!staff) return null;

  const adv = state.staffAdvances.filter((a) => a.staffId === staff.id && a.date.startsWith(key)).reduce((n, a) => n + a.amount, 0);
  const paid = state.staffPayouts.filter((p) => p.staffId === staff.id && p.date.startsWith(key)).reduce((n, p) => n + p.amount, 0);
  const remaining = Math.max(0, staff.salary - adv - paid);
  const value = amount === '' ? String(remaining) : amount;

  function save() {
    const a = Number(value);
    if (!a || a <= 0) {
      window.alert('Nothing is pending — this staff member’s salary is already fully paid.');
      return;
    }
    const locked = monthLockMessage(state, date, 'pay this salary');
    if (locked) {
      window.alert(locked);
      return;
    }
    update((s) => ({
      ...s,
      staffPayouts: [...s.staffPayouts, { id: uid('sp'), staffId: staff!.id, date, amount: a, mode }],
    }));
    window.alert(`${money(a)} salary paid to ${staff!.name} by ${mode} on ${longDate(date)}.`);
    setAmount('');
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Pay Remaining Salary — ${staff.name}`} subtitle={`Salary ${money(staff.salary)} · advance ${money(adv)} · already paid ${money(paid)}`}>
      <div className="space-y-4">
        <div className="rounded-xl bg-good-soft px-4 py-3">
          <p className="text-base font-semibold text-good">Net salary payable now</p>
          <p className="num-xl text-good">{money(remaining)}</p>
        </div>
        <Field label="Amount to pay now (₹)">
          <MoneyInput value={value} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date paid">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Paid by">
          <SelectInput value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            <option>Cash</option>
            <option>UPI</option>
            <option>Card</option>
          </SelectInput>
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>Save Salary Payment</Btn>
          <Btn variant="secondary" full onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}
