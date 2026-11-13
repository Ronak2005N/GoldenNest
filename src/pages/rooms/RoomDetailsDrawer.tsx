import { useState, useMemo, useEffect } from 'react';
import { Bed, Plus, Users, UserPlus } from 'lucide-react';
import { useStore } from '../../app/store/StoreProvider';
import { BRANCH_MAP } from '../../app/store/branches';
import type { Room, Member } from '../../app/store/types';
import { Badge, Btn, Card, Drawer, EmptyState, Field, TextInput, SelectInput, Modal } from '../../shared/ui';
import { todayISO } from '../../shared/lib/dates';

export function RoomDetailsDrawer({ room, onClose }: { room: Room | null; onClose: () => void }) {
  const { state, update } = useStore();
  const [showBulkModal, setShowBulkModal] = useState(false);

  if (!room) return null;

  // At this point, room is guaranteed to be non-null due to the early return above
  const r = room;

  // Get members in this specific room
  const roomMembers = useMemo(() => {
    return state.members.filter(
      (m) => m.status === 'active' && m.branch === r.branch && m.roomCode === r.code,
    );
  }, [state.members, r.branch, r.code]);

  const occupiedCount = roomMembers.length;
  const totalBeds = r.sharing;
  const vacantCount = totalBeds - occupiedCount;
  
  const vacantBedIndices = useMemo(() => {
    const taken = new Set(
      state.members
        .filter((m) => m.status === 'active' && m.branch === r.branch && m.roomCode === r.code)
        .map((m) => m.bedIndex),
    );
    const free: number[] = [];
    for (let i = 1; i <= totalBeds; i++) if (!taken.has(i)) free.push(i);
    return free;
  }, [state.members, r.branch, r.code, totalBeds]);

  const firstVacantBed = vacantBedIndices[0] ?? 1;

  // Bulk add modal state
  const [bulkName, setBulkName] = useState('');
  const [bulkMobile, setBulkMobile] = useState('');
  const [bulkBedIndex, setBulkBedIndex] = useState<number>(firstVacantBed);
  const [bulkError, setBulkError] = useState('');

  // Multiple members state
  const [multipleMembers, setMultipleMembers] = useState<Array<{ name: string; mobile: string; bedIndex: number }>>(
    Array.from({ length: 3 }, () => ({ name: '', mobile: '', bedIndex: 1 })),
  );

  // Generate bed options for the current room
  const bedOptions = useMemo(() => {
    return Array.from({ length: totalBeds }, (_, i) => i + 1);
  }, [totalBeds]);

  function handleSingleMemberSave() {
    if (!bulkName.trim()) {
      setBulkError('Name is required');
      return;
    }
    if (!/^\d{10}$/.test(bulkMobile)) {
      setBulkError('Mobile must be 10 digits');
      return;
    }

    const today = todayISO();
    
    // Check if mobile already exists in another room (two-way sync)
    const existingMember = state.members.find(
      (m) => m.status === 'active' && m.mobile === bulkMobile,
    );

    if (existingMember) {
      // Update existing member's room assignment
      update((s) => ({
        ...s,
        members: s.members.map((m) =>
          m.id === existingMember.id
            ? {
                ...m,
                branch: r.branch,
                roomCode: r.code,
                bedIndex: bulkBedIndex,
                floor: r.floor,
              }
            : m,
        ),
      }));
      window.alert(`${bulkName} is already a member. Updated their room to ${r.code}, Bed ${bulkBedIndex}.`);
    } else {
      // Create new member in the global members list
      const newMember: Member = {
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: bulkName.trim(),
        occupation: 'Student',
        mobile: bulkMobile,
        govtId: '[Aadhaar Redacted]',
        homeAddress: '',
        branch: r.branch,
        floor: r.floor,
        roomCode: r.code,
        bedIndex: bulkBedIndex,
        billingType: 'monthly',
        startDate: today,
        monthlyRent: r.monthlyRent,
        rentHistory: [{ fromDate: today, amount: r.monthlyRent }],
        advance: { amount: 0, mode: 'Cash', cash: 0, upi: 0, card: 0, date: today },
        payments: [],
        status: 'active',
      };

      update((s) => ({ ...s, members: [...s.members, newMember] }));
      window.alert(`${bulkName} added to ${r.code}, Bed ${bulkBedIndex}.`);
    }

    setBulkName('');
    setBulkMobile('');
    setBulkBedIndex(firstVacantBed);
    setBulkError('');
    setShowBulkModal(false);
  }

  function handleMultipleMembersSave() {
    const today = todayISO();
    const errors: string[] = [];

    // Validate all members
    for (let i = 0; i < multipleMembers.length; i++) {
      const m = multipleMembers[i];
      if (!m.name.trim()) {
        errors.push(`Row ${i + 1}: Name is required`);
        continue;
      }
      if (!/^\d{10}$/.test(m.mobile)) {
        errors.push(`Row "${m.name}": Mobile must be 10 digits`);
      }
      if (m.bedIndex < 1 || m.bedIndex > totalBeds) {
        errors.push(`Row "${m.name}": Bed index invalid`);
      }
    }

    // Check for duplicate bed indices
    const bedCounts = new Map<number, number>();
    for (const m of multipleMembers.filter(m => m.name.trim())) {
      const count = bedCounts.get(m.bedIndex) ?? 0;
      bedCounts.set(m.bedIndex, count + 1);
    }
    for (const [bed, count] of bedCounts) {
      if (count > 1) {
        errors.push(`Bed ${bed} is assigned to ${count} members`);
        break;
      }
    }

    if (errors.length > 0) {
      setBulkError(errors.slice(0, 3).join('; ') + (errors.length > 3 ? ` and ${errors.length - 3} more` : ''));
      return;
    }

    // Create/update members
    const newMembers: Member[] = [];
    const updates: { id: string; changes: Partial<Member> }[] = [];

    for (const m of multipleMembers.filter(m => m.name.trim())) {
      const existingMember = state.members.find(
        (mem) => mem.status === 'active' && mem.mobile === m.mobile,
      );

      if (existingMember) {
        updates.push({
          id: existingMember.id,
          changes: {
            branch: r.branch,
            roomCode: r.code,
            bedIndex: m.bedIndex,
            floor: r.floor,
          },
        });
      } else {
        newMembers.push({
          id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: m.name.trim(),
          occupation: 'Student',
          mobile: m.mobile,
          govtId: '[Aadhaar Redacted]',
          homeAddress: '',
          branch: r.branch,
          floor: r.floor,
          roomCode: r.code,
          bedIndex: m.bedIndex,
          billingType: 'monthly',
          startDate: today,
          monthlyRent: r.monthlyRent,
          rentHistory: [{ fromDate: today, amount: r.monthlyRent }],
          advance: { amount: 0, mode: 'Cash', cash: 0, upi: 0, card: 0, date: today },
          payments: [],
          status: 'active',
        });
      }
    }

    if (updates.length > 0) {
      update((s) => ({
        ...s,
        members: s.members.map((m) => {
          const update = updates.find((u) => u.id === m.id);
          return update ? { ...m, ...update.changes } : m;
        }),
      }));
    }

    update((s) => ({ ...s, members: [...s.members, ...newMembers] }));

    const count = newMembers.length + updates.length;
    window.alert(`${count} member${count !== 1 ? 's' : ''} successfully added to ${r.code}.`);

    setBulkName('');
    setBulkMobile('');
    setBulkBedIndex(firstVacantBed);
    setBulkError('');
    setShowBulkModal(false);
    setMultipleMembers(Array.from({ length: 3 }, () => ({ name: '', mobile: '', bedIndex: 1 })));
  }

  // Update multiple members when bed count changes
  useEffect(() => {
    setMultipleMembers((prev) => prev.map((m) => ({ ...m, bedIndex: Math.min(m.bedIndex, totalBeds) })));
  }, [totalBeds]);

  return (
    <Drawer open={!!room} onClose={onClose} title={`Room ${r.code} Details`}>
      <div className="space-y-6">
        {/* Occupancy Summary */}
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-2">Occupancy Summary</h3>
          <p className="text-base text-slate-600">
            Room Status: <span className="font-semibold">{occupiedCount}</span> / <span className="font-semibold">{totalBeds}</span> Beds Occupied.{' '}
            <span className="font-semibold">{occupiedCount} Member{occupiedCount !== 1 ? 's' : ''},</span>{' '}
            <span className="font-semibold">{vacantCount} Vacant Bed{vacantCount !== 1 ? 's' : ''}</span>
          </p>
        </Card>

        {/* Current Members List */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Users size={20} /> Current Members ({roomMembers.length})
          </h3>
          {roomMembers.length === 0 ? (
            <EmptyState
              title="No members in this room"
              hint="Add members using the buttons below."
            />
          ) : (
            <div className="grid gap-3">
              {roomMembers.map((member) => (
                <Card key={member.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-base">{member.name}</p>
                      <p className="text-sm text-slate-500">
                        Bed {member.bedIndex} • {BRANCH_MAP[member.branch].short}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Vacant Beds List */}
        {vacantCount > 0 ? (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Bed size={20} /> Vacant Beds ({vacantCount})
            </h3>
            <div className="grid gap-3">
              {vacantBedIndices.map((bedIndex) => (
                <Card key={bedIndex} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge tone="neutral">Bed {bedIndex}</Badge>
                      <span className="text-slate-500">Vacant</span>
                    </div>
                    <Btn
                      onClick={() => {
                        setBulkBedIndex(bedIndex);
                        setShowBulkModal(true);
                      }}
                    >
                      <Plus size={16} /> Add Member
                    </Btn>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Bed size={20} /> Vacant Beds (0)
            </h3>
            <Card className="p-4 text-center">
              <p className="text-slate-500">All beds are occupied</p>
            </Card>
          </div>
        )}

        {/* Add Members Modal */}
        <Modal
          open={showBulkModal}
          onClose={() => setShowBulkModal(false)}
          title="Add Members to this Room"
          subtitle="Enter member details. They will be saved to the main Members directory (Boys & Gents)."
          wide
        >
          <div className="space-y-4">
            {bulkError && (
              <p className="font-semibold text-bad">{bulkError}</p>
            )}
            <p className="text-slate-600">
              Current PG: <strong>{BRANCH_MAP[r.branch].short}</strong> • Room: <strong>{r.code}</strong> • {totalBeds} beds total
            </p>

            {/* Single Member Add Mode */}
            <div className="border-t border-line pt-4">
              <h4 className="text-base font-semibold mb-3">Add Single Member</h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Member Name">
                  <TextInput
                    value={bulkName}
                    onChange={(e) => setBulkName(e.target.value)}
                    placeholder="Full name"
                  />
                </Field>
                <Field label="Mobile Number">
                  <TextInput
                    value={bulkMobile}
                    onChange={(e) => setBulkMobile(e.target.value)}
                    placeholder="10-digit number"
                    inputMode="tel"
                  />
                </Field>
                <Field label="Bed">
                  <SelectInput
                    value={bulkBedIndex.toString()}
                    onChange={(e) => setBulkBedIndex(Number(e.target.value))}
                  >
                    {bedOptions.map((b) => (
                      <option key={b} value={b}>
                        Bed {b}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <h4 className="text-base font-semibold mb-3">Add Many Members</h4>
              <div className="grid gap-3">
                {multipleMembers.map((member, idx) => (
                  <div key={idx} className="grid sm:grid-cols-4 gap-3">
                    <Field label={`Name ${idx + 1}`}>
                      <TextInput
                        value={member.name}
                        onChange={(e) => {
                          const newMembers = [...multipleMembers];
                          newMembers[idx].name = e.target.value;
                          setMultipleMembers(newMembers);
                        }}
                        placeholder={`Member ${idx + 1} name`}
                      />
                    </Field>
                    <Field label={`Mobile ${idx + 1}`}>
                      <TextInput
                        value={member.mobile}
                        onChange={(e) => {
                          const newMembers = [...multipleMembers];
                          newMembers[idx].mobile = e.target.value;
                          setMultipleMembers(newMembers);
                        }}
                        placeholder="10-digit number"
                        inputMode="tel"
                      />
                    </Field>
                    <Field label={`Bed ${idx + 1}`}>
                      <SelectInput
                        value={member.bedIndex.toString()}
                        onChange={(e) => {
                          const newMembers = [...multipleMembers];
                          newMembers[idx].bedIndex = Number(e.target.value);
                          setMultipleMembers(newMembers);
                        }}
                      >
                        {bedOptions.map((b) => (
                          <option key={b} value={b}>
                            Bed {b}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Btn variant="secondary" onClick={() => setShowBulkModal(false)}>
                Cancel
              </Btn>
              <Btn onClick={handleSingleMemberSave}>
                Add Member
              </Btn>
              <Btn onClick={handleMultipleMembersSave}>
                Add Many
              </Btn>
            </div>
          </div>
        </Modal>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-line">
          <Btn variant="secondary" onClick={() => {
            setBulkBedIndex(firstVacantBed);
            setShowBulkModal(true);
          }}>
            <UserPlus size={18} /> Add New Member
          </Btn>
          <Btn onClick={() => setShowBulkModal(true)}>
            <Plus size={18} /> Add Many Members / Sync
          </Btn>
        </div>
      </div>
    </Drawer>
  );
}