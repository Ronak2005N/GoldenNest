import { useMemo, useState } from 'react';
import type { BranchId, Floor, Member, Occupation, PaymentMode } from '../../../app/store/types';
import { useStore } from '../../../app/store/StoreProvider';
import { BRANCHES, BRANCH_MAP, FLOORS } from '../../../app/store/branches';
import { monthLockMessage } from '../../../app/store/monthLock';
import { currentRentRate, withRentChange } from '../../../entities/member/rent';
import { longDate, todayISO } from '../../../shared/lib/dates';
import { digitsOnly, isValidMobile, money } from '../../../shared/lib/format';
import { Badge, Btn, Field, InfoRow, Modal, MoneyInput, SelectInput, TextInput } from '../../../shared/ui';

const OCCUPATIONS: Occupation[] = ['Student', 'Teacher / Faculty', 'IT / Working Professional', 'Other'];

/**
 * Edit an existing member.
 *
 * Everything here is a correction of data that was typed in wrong — the rent
 * that was never filled in, the wrong room, the wrong mobile number. Nothing
 * is deleted: a rent change is added to the member's rent history so the
 * months already paid keep the price they were charged at, and moving a
 * member to another bed frees the old bed immediately.
 *
 * The same screen works for members who have already left the PG — that is
 * how the rent of an old record gets filled in so their dues can finally be
 * calculated.
 */
export function EditMemberModal({
  member,
  onClose,
}: {
  member: Member | null;
  onClose: () => void;
}) {
  const { state, update } = useStore();
  const [name, setName] = useState('');
  const [occupation, setOccupation] = useState<Occupation>('Student');
  const [mobile, setMobile] = useState('');
  const [govtId, setGovtId] = useState('');
  const [address, setAddress] = useState('');
  const [branch, setBranch] = useState<BranchId>('PG1');
  const [floor, setFloor] = useState<Floor>('Ground');
  const [roomCode, setRoomCode] = useState('');
  const [bedIndex, setBedIndex] = useState(0);
  const [rent, setRent] = useState('');
  const [rentFrom, setRentFrom] = useState('');
  const [advance, setAdvance] = useState('');
  const [advanceMode, setAdvanceMode] = useState<PaymentMode>('Cash');
  const [advanceDate, setAdvanceDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedFor, setLoadedFor] = useState('');

  // The form is filled from the record the first time it opens for a member.
  useMemo(() => {
    if (!member || loadedFor === member.id) return;
    setLoadedFor(member.id);
    setName(member.name);
    setOccupation(member.occupation);
    setMobile(member.mobile);
    setGovtId(member.govtId);
    setAddress(member.homeAddress);
    setBranch(member.branch);
    setFloor(member.floor);
    setRoomCode(member.roomCode);
    setBedIndex(member.bedIndex);
    setRent(String(currentRentRate(member) || member.monthlyRent || ''));
    // A member whose rent was never recorded gets the new rate for the whole
    // stay; otherwise the change starts today.
    const neverRecorded = !member.monthlyRent && !member.rentHistory?.length;
    setRentFrom(neverRecorded ? member.startDate : todayISO());
    setAdvance(String(member.advance.amount ?? 0));
    setAdvanceMode(member.advance.mode === 'Split' ? 'Cash' : member.advance.mode);
    setAdvanceDate(member.advance.date || member.startDate);
  }, [member, loadedFor]);

  const rooms = useMemo(
    () => state.rooms.filter((r) => r.branch === branch && r.floor === floor),
    [state.rooms, branch, floor],
  );
  const selectedRoom = useMemo(
    () => state.rooms.find((r) => r.branch === branch && r.code === roomCode),
    [state.rooms, branch, roomCode],
  );

  /** Free beds in the chosen room — the member's own bed counts as free. */
  const beds = useMemo(() => {
    if (!roomCode || !member) return [];
    const taken = new Set(
      state.members
        .filter(
          (m) =>
            m.status === 'active' &&
            m.id !== member.id &&
            m.branch === branch &&
            m.roomCode === roomCode,
        )
        .map((m) => m.bedIndex),
    );
    const sharing = selectedRoom?.sharing ?? 4;
    const out: number[] = [];
    for (let i = 1; i <= sharing; i += 1) if (!taken.has(i)) out.push(i);
    return out;
  }, [state.members, member, branch, roomCode, selectedRoom]);

  if (!member) return null;

  const isVacated = member.status === 'vacated';
  const currentRate = currentRentRate(member) || member.monthlyRent || 0;
  const rentChanged = Number(rent || 0) !== currentRate;

  function save() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Please type the member’s full name.';
    if (!isValidMobile(mobile)) e.mobile = 'Please enter a 10-digit mobile number.';
    if (member!.billingType === 'monthly' && Number(rent || 0) <= 0) {
      e.rent = 'Please enter the monthly rent.';
    }
    if (Number(advance || 0) < 0) e.advance = 'The deposit cannot be negative.';
    if (!isVacated) {
      if (!roomCode) e.room = 'Please choose a room.';
      else if (!bedIndex) e.bed = 'Please choose a bed.';
    }
    setErrors(e);
    if (Object.keys(e).length) return;

    // A closed month is final — a new rent rate cannot be applied to it.
    if (member!.billingType === 'monthly' && Number(rent || 0) !== currentRate) {
      const from = rentFrom || member!.startDate;
      const locked = monthLockMessage(state, from, 'change the rent for that month');
      if (locked) {
        setErrors({ rent: locked });
        return;
      }
    }

    update((s) => ({
      ...s,
      members: s.members.map((m) => {
        if (m.id !== member!.id) return m;
        let next: Member = {
          ...m,
          name: name.trim(),
          occupation,
          mobile: digitsOnly(mobile),
          govtId: govtId.trim() || '[Aadhaar Redacted]',
          homeAddress: address.trim(),
        };
        if (!isVacated) {
          next = {
            ...next,
            branch,
            floor: selectedRoom?.floor ?? floor,
            roomCode,
            bedIndex,
          };
        }
        if (m.billingType === 'monthly') {
          const amount = Number(rent || 0);
          if (amount !== currentRate) {
            // The new rate is added to the rent history — every month before
            // it keeps the price it was charged at.
            next = withRentChange(next, rentFrom || member!.startDate, amount);
          }
        }
        // The security deposit can be corrected or topped up.
        const advanceAmount = Number(advance || 0);
        if (advanceAmount !== (m.advance.amount ?? 0) || advanceMode !== m.advance.mode) {
          next = {
            ...next,
            advance: {
              amount: advanceAmount,
              mode: advanceMode,
              cash: advanceMode === 'Cash' ? advanceAmount : 0,
              upi: advanceMode === 'UPI' ? advanceAmount : 0,
              card: advanceMode === 'Card' ? advanceAmount : 0,
              date: advanceDate || todayISO(),
            },
          };
        }
        return next;
      }),
    }));

    const moved =
      !isVacated &&
      (member!.branch !== branch || member!.roomCode !== roomCode || member!.bedIndex !== bedIndex);
    window.alert(
      `${name.trim()}'s details saved.` +
        (moved ? `\n\nMoved to ${BRANCH_MAP[branch].short}, Room ${roomCode}, Bed ${bedIndex}. The old bed is free now.` : '') +
        (rentChanged
          ? `\n\nRent changed from ${money(currentRate)} to ${money(Number(rent || 0))} from ${longDate(rentFrom)}. Earlier months keep ${money(currentRate)}.`
          : ''),
    );
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={isVacated ? `Edit Details — ${member.name} (Left PG)` : `Edit Member — ${member.name}`}
      subtitle={`${BRANCH_MAP[member.branch].short} · Room ${member.roomCode} · Bed ${member.bedIndex}`}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={errors.name}>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Occupation">
            <SelectInput value={occupation} onChange={(e) => setOccupation(e.target.value as Occupation)}>
              {OCCUPATIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Mobile number (10 digits)" error={errors.mobile}>
            <TextInput value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" />
          </Field>
          <Field label="Government ID (Aadhaar reference)">
            <TextInput value={govtId} onChange={(e) => setGovtId(e.target.value)} />
          </Field>
          <Field label="Permanent home address">
            <TextInput value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          {member.billingType === 'monthly' ? (
            <Field label="Monthly rent (₹)" error={errors.rent}>
              <MoneyInput value={rent} onChange={(e) => setRent(e.target.value)} />
            </Field>
          ) : null}
        </div>

        {member.billingType === 'monthly' ? (
          <div className="well px-4 py-3">
            <InfoRow label="Rent charged today" value={money(currentRate)} />
            {rentChanged ? (
              <>
                <InfoRow label="New rent" value={money(Number(rent || 0))} />
                <Field
                  label="New rent applies from"
                  hint="Every month before this date keeps the rent it was charged at."
                >
                  <TextInput type="date" value={rentFrom} onChange={(e) => setRentFrom(e.target.value)} />
                </Field>
                <div className="mt-2 rounded-xl bg-brand-soft px-4 py-3 text-base font-semibold text-brand-dark">
                  Months from {longDate(rentFrom)} are billed at {money(Number(rent || 0))}. Months before
                  that keep {money(currentRate)} — nothing already paid is re-priced.
                </div>
              </>
            ) : (
              <p className="mt-1 text-base text-slate-600">
                Change the rent above to add a new rate from a date. Earlier months keep their old price.
              </p>
            )}
          </div>
        ) : null}

        <div className="well px-4 py-3">
          <p className="mb-2 text-base font-bold">Security deposit (advance) held</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Amount held (₹)" error={errors.advance}>
              <MoneyInput value={advance} onChange={(e) => setAdvance(e.target.value)} />
            </Field>
            <Field label="Paid by">
              <SelectInput value={advanceMode} onChange={(e) => setAdvanceMode(e.target.value as PaymentMode)}>
                <option>Cash</option>
                <option>UPI</option>
                <option>Card</option>
              </SelectInput>
            </Field>
            <Field label="Date received">
              <TextInput type="date" value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} />
            </Field>
          </div>
          <p className="mt-2 text-base text-slate-600">
            This amount is returned when the member leaves, after cutting maintenance and any unpaid
            rent. Correct it here if it was entered wrongly.
          </p>
        </div>

        {!isVacated ? (
          <div className="well p-4">
            <p className="mb-3 text-base font-bold">Where is this member staying?</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="PG Branch">
                <SelectInput
                  value={branch}
                  onChange={(e) => {
                    const b = e.target.value as BranchId;
                    setBranch(b);
                    setFloor(BRANCH_MAP[b].floors[0].floor);
                    setRoomCode('');
                    setBedIndex(0);
                  }}
                >
                  {BRANCHES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.short}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Floor">
                <SelectInput
                  value={floor}
                  onChange={(e) => {
                    setFloor(e.target.value as Floor);
                    setRoomCode('');
                    setBedIndex(0);
                  }}
                >
                  {FLOORS.filter((f) => BRANCH_MAP[branch].floors.some((x) => x.floor === f)).map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Room number" error={errors.room}>
                <SelectInput value={roomCode} onChange={(e) => setRoomCode(e.target.value)}>
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
              <p className="mb-1.5 text-base font-semibold">Bed</p>
              {beds.length === 0 ? (
                <p className="text-base font-semibold text-bad">
                  {roomCode ? 'This room is full. Choose another room.' : 'Choose a room first.'}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {beds.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBedIndex(b)}
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
              {selectedRoom ? (
                <p className="mt-3 text-base text-slate-600">
                  This room’s usual rent is {money(selectedRoom.monthlyRent)} per bed per month.
                  {Number(rent || 0) !== currentRate ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="font-semibold text-brand underline"
                        onClick={() => setRent(String(selectedRoom.monthlyRent))}
                      >
                        Use this room’s rent
                      </button>
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-brand-soft px-4 py-3 text-base font-semibold text-brand-dark">
            This member has left the PG (left on {longDate(member.vacatedOn || member.settlement?.exitDate || '')}).
            You can still correct their details and fill in a missing rent so their dues can be calculated.
          </div>
        )}

        {member.payments.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{member.payments.length} payment record(s) on file</Badge>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:w-auto sm:flex-1" onClick={save}>
            Save Changes
          </Btn>
          <Btn variant="secondary" full className="sm:w-auto" onClick={onClose}>
            Cancel
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
