import { useState } from 'react';
import { AlertTriangle, Check, Copy, Plus, RefreshCw, Wifi as WifiIcon } from 'lucide-react';
import { useStore } from '../app/store/StoreProvider';
import { BRANCHES, BRANCH_MAP } from '../app/store/branches';
import type { BranchId, PaymentMode, Wifi } from '../app/store/types';
import { addDays, daysBetween, longDate, todayISO } from '../shared/lib/dates';
import { money, uid } from '../shared/lib/format';
import { Badge, Btn, Card, EmptyState, Field, Modal, MoneyInput, PageIntro, SelectInput, TextInput } from '../shared/ui';

type Urgency = 'expired' | 'soon' | 'ok';

function urgency(w: Wifi): Urgency {
  const days = daysBetween(todayISO(), w.expiryDate);
  if (days < 0) return 'expired';
  if (days <= 5) return 'soon';
  return 'ok';
}

export function WifiPage() {
  const { state, branch, update } = useStore();
  const [adding, setAdding] = useState(false);
  const [recharging, setRecharging] = useState<Wifi | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const list = state.wifi.filter((w) => branch === 'ALL' || w.branch === branch);
  const expired = list.filter((w) => urgency(w) === 'expired');
  const soon = list.filter((w) => urgency(w) === 'soon');
  const fine = list.filter((w) => urgency(w) === 'ok');
  const ordered = [...expired, ...soon, ...fine];

  function copyPassword(w: Wifi) {
    navigator.clipboard?.writeText(w.password).then(
      () => {
        setCopiedId(w.id);
        window.setTimeout(() => setCopiedId(null), 2000);
      },
      () => window.alert(`Password: ${w.password}`),
    );
  }

  function quickRecharge(w: Wifi) {
    const mode = window.prompt(
      `Recharge “${w.label}” for ${money(w.monthlyAmount)}.\n\nType how you paid: UPI, Cash or Card`,
      'UPI',
    );
    if (!mode) return;
    const norm = mode.trim().toLowerCase();
    const payMode: PaymentMode = norm.includes('cash') ? 'Cash' : norm.includes('card') ? 'Card' : 'UPI';
    const base = w.expiryDate < todayISO() ? todayISO() : w.expiryDate;
    const newExpiry = addDays(base, 30);
    update((s) => ({
      ...s,
      wifi: s.wifi.map((x) => (x.id === w.id ? { ...x, expiryDate: newExpiry } : x)),
      wifiRecharges: [
        ...s.wifiRecharges,
        { id: uid('wr'), wifiId: w.id, date: todayISO(), amount: w.monthlyAmount, mode: payMode },
      ],
    }));
    window.alert(
      `Recharge saved for ${w.label}: ${money(w.monthlyAmount)} paid by ${payMode}.\nNew expiry date: ${longDate(newExpiry)}.`,
    );
  }

  return (
    <div>
      <PageIntro
        title="Wi-Fi Manager"
        hint="Every connection, its password, monthly amount and its own expiry date — with one-tap recharge."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone={expired.length ? 'bad' : 'neutral'}>{expired.length} expired / due today</Badge>
          <Badge tone={soon.length ? 'warn' : 'neutral'}>{soon.length} expiring soon</Badge>
          <Badge tone="neutral">{list.length} connections</Badge>
        </div>
        <Btn onClick={() => setAdding(true)}>
          <Plus size={22} aria-hidden /> Add New Wi-Fi Connection
        </Btn>
      </div>

      {expired.length + soon.length > 0 ? (
        <Card className="mb-5 border border-warn/30 bg-warn/[0.07]">
          <p className="flex items-center gap-2 text-lg font-bold text-warn">
            <AlertTriangle size={26} aria-hidden /> Attention needed
          </p>
          <ul className="mt-2 space-y-1 text-base text-slate-800">
            {ordered.slice(0, expired.length + soon.length).map((w) => (
              <li key={w.id}>
                <strong>{w.label}</strong> —{' '}
                {urgency(w) === 'expired'
                  ? `EXPIRED on ${longDate(w.expiryDate)}`
                  : `expiring on ${longDate(w.expiryDate)}`}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {list.length === 0 ? (
        <EmptyState
          title="No Wi-Fi connections yet"
          hint="Add your first Wi-Fi connection with its password and expiry date."
          action={<Btn onClick={() => setAdding(true)}><Plus size={22} aria-hidden /> Add New Wi-Fi Connection</Btn>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ordered.map((w) => {
            const u = urgency(w);
            return (
              <Card
                key={w.id}
                className={`flex flex-col gap-3 ${u === 'expired' ? 'border border-bad/40' : u === 'soon' ? 'border border-warn/40' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <WifiIcon size={26} aria-hidden className={u === 'ok' ? 'text-info' : 'text-warn'} />
                  <div>
                    <p className="title leading-tight">{w.label}</p>
                    <p className="text-base text-slate-600">{BRANCH_MAP[w.branch].short}</p>
                  </div>
                </div>
                <div>
                  <Badge tone={u === 'expired' ? 'bad' : u === 'soon' ? 'warn' : 'good'}>
                    {u === 'expired' ? 'Expired / due today' : u === 'soon' ? 'Expiring soon' : 'Active'}
                  </Badge>
                </div>

                <div className="well px-4 py-3">
                  <p className="text-base text-slate-600">Wi-Fi name (SSID)</p>
                  <p className="num-md break-words">{w.ssid}</p>
                  <p className="mt-2 text-base text-slate-600">Password</p>
                  <div className="flex items-center gap-2">
                    <p className="num-lg break-words">{w.password}</p>
                    <button
                      type="button"
                      onClick={() => copyPassword(w)}
                      aria-label={`Copy password for ${w.label}`}
                      className="press flex min-h-[52px] min-w-[52px] items-center justify-center gap-1.5 rounded-xl border border-line px-3 text-base font-semibold hover:border-brand hover:text-brand"
                    >
                      {copiedId === w.id ? <Check size={20} aria-hidden /> : <Copy size={20} aria-hidden />}
                      {copiedId === w.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between gap-3 text-base">
                  <span className="text-slate-600">Monthly plan</span>
                  <span className="num-md">{money(w.monthlyAmount)}</span>
                </div>
                <div className="flex justify-between gap-3 text-base">
                  <span className="text-slate-600">Expiry / recharge due</span>
                  <span className={`num-md ${u === 'ok' ? '' : u === 'soon' ? 'text-warn' : 'text-bad'}`}>
                    {longDate(w.expiryDate)}
                  </span>
                </div>

                <div className="mt-auto flex flex-col gap-2">
                  <Btn
                    variant={u === 'ok' ? 'secondary' : u === 'soon' ? 'warn' : 'danger'}
                    onClick={() => quickRecharge(w)}
                  >
                    <RefreshCw size={20} aria-hidden /> Recharge Done (+30 Days)
                  </Btn>
                  <Btn variant="ghost" onClick={() => setRecharging(w)}>
                    Choose another date or amount
                  </Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AddWifiModal open={adding} onClose={() => setAdding(false)} />
      <RechargeModal wifi={recharging} onClose={() => setRecharging(null)} />
    </div>
  );
}

function AddWifiModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { update } = useStore();
  const [label, setLabel] = useState('');
  const [wBranch, setWBranch] = useState<BranchId>('PG1');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [amount, setAmount] = useState('899');
  const [expiry, setExpiry] = useState(addDays(todayISO(), 30));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function save() {
    const e: Record<string, string> = {};
    if (!label.trim()) e.label = 'Please give this connection a name (e.g. PG1 - Ground Floor Wi-Fi 1).';
    if (!ssid.trim()) e.ssid = 'Please enter the Wi-Fi name (SSID).';
    if (!password.trim()) e.password = 'Please enter the Wi-Fi password.';
    setErrors(e);
    if (Object.keys(e).length) return;
    update((s) => ({
      ...s,
      wifi: [
        ...s.wifi,
        { id: uid('wifi'), label: label.trim(), branch: wBranch, ssid: ssid.trim(), password, monthlyAmount: Number(amount) || 0, expiryDate: expiry },
      ],
    }));
    window.alert(`${label.trim()} added. Expiry ${longDate(expiry)}.`);
    setLabel('');
    setSsid('');
    setPassword('');
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add New Wi-Fi Connection">
      <div className="space-y-4">
        <Field label="Connection name" error={errors.label}>
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. PG1 - Ground Floor Wi-Fi 1" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="PG Branch">
            <SelectInput value={wBranch} onChange={(e) => setWBranch(e.target.value as BranchId)}>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.short}</option>)}
            </SelectInput>
          </Field>
          <Field label="Monthly plan amount (₹)">
            <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Wi-Fi name (SSID)" error={errors.ssid}>
            <TextInput value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="GN_PG1_Ground_1" />
          </Field>
          <Field label="Password" error={errors.password}>
            <TextInput value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Expiry / recharge due date">
            <TextInput type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>Save Wi-Fi Connection</Btn>
          <Btn variant="secondary" full onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

function RechargeModal({ wifi, onClose }: { wifi: Wifi | null; onClose: () => void }) {
  const { update } = useStore();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<PaymentMode>('UPI');
  const [date, setDate] = useState(todayISO());
  const [newExpiry, setNewExpiry] = useState('');

  if (!wifi) return null;

  const suggested = addDays(wifi.expiryDate < todayISO() ? todayISO() : wifi.expiryDate, 30);
  const value = amount === '' ? String(wifi.monthlyAmount) : amount;
  const expiryValue = newExpiry || suggested;

  function save() {
    const a = Number(value);
    update((s) => ({
      ...s,
      wifi: s.wifi.map((x) => (x.id === wifi!.id ? { ...x, expiryDate: expiryValue } : x)),
      wifiRecharges: [
        ...s.wifiRecharges,
        { id: uid('wr'), wifiId: wifi!.id, date, amount: a, mode },
      ],
    }));
    window.alert(
      `Recharge saved for ${wifi!.label}: ${money(a)} by ${mode}. New expiry: ${longDate(expiryValue)}.`,
    );
    setAmount('');
    setNewExpiry('');
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Recharge — ${wifi.label}`} subtitle={`Current expiry: ${longDate(wifi.expiryDate)}`}>
      <div className="space-y-4">
        <Field label="Amount paid (₹)">
          <MoneyInput value={value} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Paid by">
          <SelectInput value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            <option>UPI</option>
            <option>Cash</option>
            <option>Card</option>
          </SelectInput>
        </Field>
        <Field label="Payment date">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="New expiry date" hint={`Suggested: +30 days = ${longDate(suggested)}`}>
          <TextInput type="date" value={expiryValue} onChange={(e) => setNewExpiry(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>Save Recharge</Btn>
          <Btn variant="secondary" full onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}
