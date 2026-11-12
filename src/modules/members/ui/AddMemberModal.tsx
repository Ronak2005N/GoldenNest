import { memo, useCallback, useMemo, useState } from 'react';
import type { AppState, BranchId, Floor, Member, Occupation, PaymentModeOrSplit } from '../../../app/store/types';
import { BRANCHES, BRANCH_MAP, FLOORS } from '../../../app/store/branches';
import { useStore } from '../../../app/store/StoreProvider';
import { addMonths, longDate, todayISO } from '../../../shared/lib/dates';
import { digitsOnly, isValidMobile, money, uid } from '../../../shared/lib/format';
import { Badge, Btn, Field, Modal, MoneyInput, SelectInput, TextInput } from '../../../shared/ui';

export interface AdmitPrefill {
  branch?: BranchId;
  floor?: Floor;
  roomCode?: string;
  bedIndex?: number;
}

const OCCUPATIONS: Occupation[] = ['Student', 'Teacher / Faculty', 'IT / Working Professional', 'Other'];
const MODES: PaymentModeOrSplit[] = ['Cash', 'UPI', 'Card', 'Split'];

export function vacantBeds(state: AppState, branch: BranchId, roomCode: string): number[] {
  const room = state.rooms.find((r) => r.branch === branch && r.code === roomCode);
  if (!room) return [];
  const taken = new Set(
    state.members
      .filter((m) => m.status === 'active' && m.branch === branch && m.roomCode === roomCode)
      .map((m) => m.bedIndex),
  );
  const free: number[] = [];
  for (let i = 1; i <= room.sharing; i++) if (!taken.has(i)) free.push(i);
  return free;
}

/* The three heavy blocks are memoised: typing a name never re-renders the
   room picker, the bed tiles or the advance fields. */

const StaySection = memo(function StaySection({
  branch,
  floor,
  roomCode,
  bedIndex,
  rooms,
  beds,
  errors,
  onBranch,
  onFloor,
  onRoom,
  onBed,
}: {
  branch: BranchId;
  floor: Floor;
  roomCode: string;
  bedIndex: number;
  rooms: { id: string; code: string; sharing: number; ac: boolean }[];
  beds: number[];
  errors: Record<string, string>;
  onBranch: (b: BranchId) => void;
  onFloor: (f: Floor) => void;
  onRoom: (code: string) => void;
  onBed: (b: number) => void;
}) {
  return (
    <div className="well p-4">
      <p className="mb-3 text-base font-bold">Where will this member stay?</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="PG Branch">
          <SelectInput value={branch} onChange={(e) => onBranch(e.target.value as BranchId)}>
            {BRANCHES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.short}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Floor">
          <SelectInput value={floor} onChange={(e) => onFloor(e.target.value as Floor)}>
            {FLOORS.filter((f) => BRANCH_MAP[branch].floors.some((x) => x.floor === f)).map((f) => (
              <option key={f}>{f}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Room number" error={errors.room}>
          <SelectInput value={roomCode} onChange={(e) => onRoom(e.target.value)}>
            <option value="">Choose a room…</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.code}>
                {r.code} ({r.sharing}-Sharing, {r.ac ? 'AC' : 'Non-AC'})
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>
      <div className="mt-4">
        <p className="mb-1.5 text-base font-semibold">Free bed</p>
        {beds.length === 0 ? (
          <p className="text-base font-semibold text-bad">
            {roomCode ? 'This room is full. Choose another room.' : 'Choose a room first to see free beds.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {beds.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => onBed(b)}
                aria-pressed={bedIndex === b}
                className={`press min-h-[54px] min-w-[110px] rounded-xl border px-4 text-base font-bold ${
                  bedIndex === b
                    ? 'border-good bg-good/[0.16] text-good'
                    : 'border-good/35 bg-good/[0.07] text-good hover:bg-good/[0.13]'
                }`}
              >
                Bed {b} — FREE
              </button>
            ))}
          </div>
        )}
        {errors.bed ? <p className="mt-1 font-semibold text-bad">{errors.bed}</p> : null}
      </div>
    </div>
  );
});

const RentSection = memo(function RentSection({
  billingType,
  startDate,
  endDate,
  monthlyRent,
  dailyRate,
  cycleDay,
  errors,
  onBillingType,
  onStartDate,
  onEndDate,
  onMonthlyRent,
  onDailyRate,
}: {
  billingType: 'monthly' | 'daily';
  startDate: string;
  endDate: string;
  monthlyRent: string;
  dailyRate: string;
  cycleDay: number | null;
  errors: Record<string, string>;
  onBillingType: (t: 'monthly' | 'daily') => void;
  onStartDate: (v: string) => void;
  onEndDate: (v: string) => void;
  onMonthlyRent: (v: string) => void;
  onDailyRate: (v: string) => void;
}) {
  const suffix = (d: number) => (d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th');
  const dailyDays =
    startDate && endDate
      ? Math.max(
          1,
          Math.round(
            (new Date(`${endDate}T00:00`).getTime() - new Date(`${startDate}T00:00`).getTime()) / 86400000,
          ) + 1,
        )
      : 0;

  return (
    <div className="well p-4">
      <p className="mb-3 text-base font-bold">How will rent be calculated?</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onBillingType('monthly')}
          aria-pressed={billingType === 'monthly'}
          className={`press min-h-[54px] rounded-xl border px-5 text-base font-bold ${
            billingType === 'monthly' ? 'border-brand bg-brand text-white' : 'border-line bg-white/70 hover:bg-white'
          }`}
        >
          Monthly (Date-to-Date Cycle)
        </button>
        <button
          type="button"
          onClick={() => onBillingType('daily')}
          aria-pressed={billingType === 'daily'}
          className={`press min-h-[54px] rounded-xl border px-5 text-base font-bold ${
            billingType === 'daily' ? 'border-brand bg-brand text-white' : 'border-line bg-white/70 hover:bg-white'
          }`}
        >
          Daily / Short Stay (Pro-Rata)
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Joining date" error={errors.startDate}>
          <TextInput type="date" value={startDate} onChange={(e) => onStartDate(e.target.value)} />
        </Field>
        {billingType === 'monthly' ? (
          <Field label="Monthly rent for this bed (₹)">
            <MoneyInput value={monthlyRent} onChange={(e) => onMonthlyRent(e.target.value)} />
          </Field>
        ) : (
          <>
            <Field label="Leaving date" error={errors.endDate}>
              <TextInput type="date" value={endDate} onChange={(e) => onEndDate(e.target.value)} />
            </Field>
            <Field label="Rent per day (₹)" hint="Default ₹500 per day" error={errors.rate}>
              <MoneyInput value={dailyRate} onChange={(e) => onDailyRate(e.target.value)} />
            </Field>
          </>
        )}
      </div>
      {billingType === 'monthly' && cycleDay ? (
        <p className="mt-3 rounded-xl bg-brand-soft px-4 py-3 text-base font-semibold text-brand-dark">
          Rent cycle will run from the {cycleDay}
          {suffix(cycleDay)} of one month to the {cycleDay}
          {suffix(cycleDay)} of the next month.
          {startDate ? ` First cycle ends on ${longDate(addMonths(startDate, 1))}.` : ''}
        </p>
      ) : null}
      {billingType === 'daily' && dailyDays > 0 ? (
        <p className="mt-3 rounded-xl bg-brand-soft px-4 py-3 text-base font-semibold text-brand-dark">
          Total stay rent = {dailyDays} days × {money(Number(dailyRate || 0))}/day ={' '}
          {money(dailyDays * Number(dailyRate || 0))}
        </p>
      ) : null}
    </div>
  );
});

const AdvanceSection = memo(function AdvanceSection({
  advance,
  advanceMode,
  advCash,
  advUpi,
  advCard,
  advanceDate,
  errors,
  onAdvance,
  onMode,
  onCash,
  onUpi,
  onCard,
  onDate,
}: {
  advance: string;
  advanceMode: PaymentModeOrSplit;
  advCash: string;
  advUpi: string;
  advCard: string;
  advanceDate: string;
  errors: Record<string, string>;
  onAdvance: (v: string) => void;
  onMode: (m: PaymentModeOrSplit) => void;
  onCash: (v: string) => void;
  onUpi: (v: string) => void;
  onCard: (v: string) => void;
  onDate: (v: string) => void;
}) {
  return (
    <div className="well p-4">
      <p className="mb-3 text-base font-bold">Advance (security deposit) collected</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Advance amount (₹)" error={errors.advance}>
          <MoneyInput value={advance} onChange={(e) => onAdvance(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Payment mode">
          <SelectInput value={advanceMode} onChange={(e) => onMode(e.target.value as PaymentModeOrSplit)}>
            {MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </SelectInput>
        </Field>
        {advanceMode === 'Split' ? (
          <>
            <Field label="Paid in Cash (₹)" error={errors.split}>
              <MoneyInput value={advCash} onChange={(e) => onCash(e.target.value)} />
            </Field>
            <Field label="Paid in UPI (₹)">
              <MoneyInput value={advUpi} onChange={(e) => onUpi(e.target.value)} />
            </Field>
            <Field label="Paid in Card (₹)">
              <MoneyInput value={advCard} onChange={(e) => onCard(e.target.value)} />
            </Field>
          </>
        ) : null}
        <Field label="Date money was received">
          <TextInput type="date" value={advanceDate} onChange={(e) => onDate(e.target.value)} />
        </Field>
      </div>
      <p className="mt-3 text-base text-slate-600">
        Advance is refunded at the end of the stay after cutting any maintenance damage and unpaid rent.
      </p>
    </div>
  );
});

export function AddMemberModal({
  open,
  onClose,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: AdmitPrefill;
}) {
  const { state, update } = useStore();
  const [name, setName] = useState('');
  const [occupation, setOccupation] = useState<Occupation>('Student');
  const [mobile, setMobile] = useState('');
  const [govtId, setGovtId] = useState('[Aadhaar Redacted]');
  const [address, setAddress] = useState('');
  const [branch, setBranch] = useState<BranchId>(prefill?.branch ?? 'PG1');
  const [floor, setFloor] = useState<Floor>(prefill?.floor ?? 'Ground');
  const [roomCode, setRoomCode] = useState(prefill?.roomCode ?? '');
  const [bedIndex, setBedIndex] = useState<number>(prefill?.bedIndex ?? 0);
  const [billingType, setBillingType] = useState<'monthly' | 'daily'>('monthly');
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState('');
  const [monthlyRent, setMonthlyRent] = useState(() => {
    const prefillRoom = prefill?.roomCode
      ? state.rooms.find((r) => r.branch === (prefill.branch ?? 'PG1') && r.code === prefill.roomCode)
      : undefined;
    return prefillRoom ? String(prefillRoom.monthlyRent) : '';
  });
  const [dailyRate, setDailyRate] = useState('500');
  const [advance, setAdvance] = useState('');
  const [advanceMode, setAdvanceMode] = useState<PaymentModeOrSplit>('Cash');
  const [advCash, setAdvCash] = useState('');
  const [advUpi, setAdvUpi] = useState('');
  const [advCard, setAdvCard] = useState('');
  const [advanceDate, setAdvanceDate] = useState(todayISO());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const roomsOfFloor = useMemo(
    () => state.rooms.filter((r) => r.branch === branch && r.floor === floor),
    [state.rooms, branch, floor],
  );
  const selectedRoom = useMemo(
    () => state.rooms.find((r) => r.branch === branch && r.code === roomCode),
    [state.rooms, branch, roomCode],
  );
  const beds = useMemo(
    () => (roomCode ? vacantBeds(state, branch, roomCode) : []),
    [state, branch, roomCode],
  );

  const handleBranch = useCallback((b: BranchId) => {
    setBranch(b);
    setFloor(BRANCH_MAP[b].floors[0].floor);
    setRoomCode('');
    setBedIndex(0);
  }, []);

  const handleFloor = useCallback((f: Floor) => {
    setFloor(f);
    setRoomCode('');
    setBedIndex(0);
  }, []);

  const handleRoom = useCallback(
    (code: string) => {
      setRoomCode(code);
      const room = state.rooms.find((r) => r.branch === branch && r.code === code);
      if (room) {
        setMonthlyRent(String(room.monthlyRent));
        const free = vacantBeds(state, branch, code);
        setBedIndex(free[0] ?? 0);
      }
    },
    [state, branch],
  );

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Please type the member’s full name.';
    if (!isValidMobile(mobile)) e.mobile = 'Please enter a 10-digit mobile number.';
    if (!roomCode) e.room = 'Please choose a room.';
    if (!bedIndex) e.bed = 'Please choose a free bed.';
    if (!startDate) e.startDate = 'Please choose the joining date.';
    if (billingType === 'monthly' && Number(monthlyRent) <= 0) e.rent = 'Please enter the monthly rent.';
    if (billingType === 'daily') {
      if (!endDate) e.endDate = 'Please choose the leave date.';
      else if (endDate < startDate) e.endDate = 'Leave date must be on or after the joining date.';
      if (Number(dailyRate) <= 0) e.rate = 'Please enter the daily rent rate.';
    }
    if (Number(advance) < 0) e.advance = 'Advance cannot be negative.';
    if (advanceMode === 'Split') {
      const total = Number(advCash || 0) + Number(advUpi || 0) + Number(advCard || 0);
      if (Math.abs(total - Number(advance || 0)) > 0.5) {
        e.split = `Cash + UPI + Card must add up to the advance total (${money(Number(advance || 0))}).`;
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function save() {
    if (!validate()) return;
    const advanceAmt = Number(advance || 0);
    const split =
      advanceMode === 'Split'
        ? { cash: Number(advCash || 0), upi: Number(advUpi || 0), card: Number(advCard || 0) }
        : {
            cash: advanceMode === 'Cash' ? advanceAmt : 0,
            upi: advanceMode === 'UPI' ? advanceAmt : 0,
            card: advanceMode === 'Card' ? advanceAmt : 0,
          };
    const member: Member = {
      id: uid('mem'),
      name: name.trim(),
      occupation,
      mobile: digitsOnly(mobile),
      govtId: govtId.trim() || '[Aadhaar Redacted]',
      homeAddress: address.trim(),
      branch,
      floor: selectedRoom?.floor ?? floor,
      roomCode,
      bedIndex,
      billingType,
      startDate,
      endDate: billingType === 'daily' ? endDate : undefined,
      monthlyRent: billingType === 'monthly' ? Number(monthlyRent) : undefined,
      dailyRate: billingType === 'daily' ? Number(dailyRate) : undefined,
      advance: { amount: advanceAmt, mode: advanceMode, ...split, date: advanceDate },
      payments: [],
      status: 'active',
    };
    update((s) => ({ ...s, members: [...s.members, member] }));
    const stayDays =
      billingType === 'daily' && endDate
        ? Math.max(
            1,
            Math.round(
              (new Date(`${endDate}T00:00`).getTime() - new Date(`${startDate}T00:00`).getTime()) / 86400000,
            ) + 1,
          )
        : 0;
    const cycleDate = new Date(`${startDate}T00:00`).getDate();
    const message =
      `${member.name} admitted to ${BRANCH_MAP[member.branch].short}, Room ${member.roomCode}, Bed ${member.bedIndex}.` +
      (member.billingType === 'monthly'
        ? `\nRent cycle: from the ${cycleDate}th of each month to the ${cycleDate}th of the next month.`
        : `\nDaily stay: ${longDate(startDate)} to ${longDate(endDate)} = ${stayDays} days × ${money(
            Number(dailyRate),
          )} = ${money(stayDays * Number(dailyRate))} total.`);
    window.alert(message);
    onClose();
  }

  const cycleDay = startDate ? new Date(`${startDate}T00:00`).getDate() : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Add New Member"
      subtitle="Men’s PG admission — fill one question at a time. Fields marked below must be filled."
    >
      <div className="space-y-5">
        <Field label="Full name" error={errors.name}>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Type the full name"
            autoComplete="off"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Occupation">
            <SelectInput value={occupation} onChange={(e) => setOccupation(e.target.value as Occupation)}>
              {OCCUPATIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Mobile number (10 digits)" error={errors.mobile}>
            <TextInput
              value={mobile}
              inputMode="tel"
              onChange={(e) => setMobile(e.target.value)}
              placeholder="98450 12345"
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Government ID (Aadhaar reference)">
            <TextInput value={govtId} onChange={(e) => setGovtId(e.target.value)} />
          </Field>
          <Field label="Permanent home address">
            <TextInput
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, town"
            />
          </Field>
        </div>

        <StaySection
          branch={branch}
          floor={floor}
          roomCode={roomCode}
          bedIndex={bedIndex}
          rooms={roomsOfFloor}
          beds={beds}
          errors={errors}
          onBranch={handleBranch}
          onFloor={handleFloor}
          onRoom={handleRoom}
          onBed={setBedIndex}
        />

        <RentSection
          billingType={billingType}
          startDate={startDate}
          endDate={endDate}
          monthlyRent={monthlyRent}
          dailyRate={dailyRate}
          cycleDay={cycleDay}
          errors={errors}
          onBillingType={setBillingType}
          onStartDate={setStartDate}
          onEndDate={setEndDate}
          onMonthlyRent={setMonthlyRent}
          onDailyRate={setDailyRate}
        />

        <AdvanceSection
          advance={advance}
          advanceMode={advanceMode}
          advCash={advCash}
          advUpi={advUpi}
          advCard={advCard}
          advanceDate={advanceDate}
          errors={errors}
          onAdvance={setAdvance}
          onMode={setAdvanceMode}
          onCash={setAdvCash}
          onUpi={setAdvUpi}
          onCard={setAdvCard}
          onDate={setAdvanceDate}
        />

        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn onClick={save} full className="sm:w-auto sm:flex-1">
            Save Member &amp; Assign Bed
          </Btn>
          <Btn variant="secondary" onClick={onClose} full className="sm:w-auto">
            Cancel
          </Btn>
        </div>
        {Object.keys(errors).length > 0 ? (
          <p className="text-center text-base font-semibold text-bad">
            Please fix the highlighted fields above.
          </p>
        ) : null}
        <p className="text-center text-sm text-slate-600">
          <Badge tone="info">Privacy: ID numbers are kept as entered on this device only</Badge>
        </p>
      </div>
    </Modal>
  );
}
