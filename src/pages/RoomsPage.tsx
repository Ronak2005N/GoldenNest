import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useStore } from '../app/store/StoreProvider';
import { BRANCH_MAP } from '../app/store/branches';
import type { BranchId, Floor, Room } from '../app/store/types';
import { money } from '../shared/lib/format';
import { Badge, Btn, Card, EmptyState, Field, Modal, MoneyInput, PageIntro, SelectInput, TextInput } from '../shared/ui';
import { RoomBedsModal } from './rooms/RoomBedsModal';

export function RoomsPage() {
  const { state, branch } = useStore();
  const [floorFilter, setFloorFilter] = useState<'ALL' | Floor>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editing, setEditing] = useState<Room | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  // Filter rooms by branch, floor, and search
  const rooms = useMemo(() => {
    return state.rooms.filter((r) => {
      if (branch !== 'ALL' && r.branch !== branch) return false;
      if (floorFilter !== 'ALL' && r.floor !== floorFilter) return false;
      if (searchQuery && !r.code.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [state.rooms, branch, floorFilter, searchQuery]);

  // Calculate occupancy
  const occupancy = useMemo(() => {
    const map = new Map<string, Map<number, string>>();
    for (const m of state.members) {
      if (m.status !== 'active') continue;
      const key = `${m.branch}|${m.roomCode}`;
      let beds = map.get(key);
      if (!beds) {
        beds = new Map<number, string>();
        map.set(key, beds);
      }
      beds.set(m.bedIndex, m.name);
    }
    return map;
  }, [state.members]);

  const branchesShown = branch === 'ALL' ? (['PG1', 'PG2', 'PG3', 'PG4'] as BranchId[]) : [branch as BranchId];

  return (
      <div>
        <PageIntro
          title="Rooms & Vacant Beds"
          hint="Tap any room card to manage its occupants. Free beds allow direct member admission."
        />

        {/* Filters */}
        <Card className="mb-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Floor">
              <SelectInput value={floorFilter} onChange={(e) => setFloorFilter(e.target.value as typeof floorFilter)}>
                <option value="ALL">All floors</option>
                <option>Ground</option>
                <option>First</option>
                <option>Second</option>
                <option>Third</option>
              </SelectInput>
            </Field>
            <Field label="Search">
              <TextInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Room ID (e.g., G1)"
              />
            </Field>
          </div>
        </Card>

        {/* Stats Summary */}
        {rooms.length > 0 ? (
          <>
            <div className="mb-4 flex flex-wrap gap-3">
              <Badge tone="neutral">{rooms.length} rooms shown</Badge>
              {(() => {
                const totalBeds = rooms.reduce((n, r) => n + r.sharing, 0);
                const occupied = rooms.reduce((n, r) => {
                  const key = `${r.branch}|${r.code}`;
                  return n + (occupancy.get(key)?.size ?? 0);
                }, 0);
                return (
                  <>
                    <Badge tone="good">{totalBeds - occupied} vacant beds</Badge>
                    <Badge tone="neutral">{occupied} occupied</Badge>
                  </>
                );
              })()}
              <Badge tone="info">{money(rooms.reduce((n, r) => n + r.monthlyRent * r.sharing, 0))} total rent capacity / month</Badge>
            </div>

            {/* Rooms Grid */}
            {branchesShown.map((b) => {
              const branchRooms = rooms.filter((r) => r.branch === b);
              if (!branchRooms.length) return null;
              return (
                <section key={b} className="mb-8">
                  <h2 className="headline mb-3 flex items-center gap-3">
                    {BRANCH_MAP[b].name}
                    {BRANCH_MAP[b].comingSoon ? <Badge tone="warn">Coming Soon</Badge> : null}
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {branchRooms.map((room) => {
                      return (
                        <div
                          key={room.id}
                          className="cv-auto cursor-pointer hover:shadow-lg transition-shadow"
                          onClick={() => setSelectedRoom(room)}
                        >
                          <Card className="flex flex-col gap-4">
                            {/* First Row: Room ID + Edit Button */}
                            <div className="flex items-start justify-between gap-2">
                              <p className="num-xl font-semibold text-brand-dark">{room.code}</p>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditing(room);
                                }}
                                aria-label={`Edit room ${room.code}`}
                                className="press flex min-h-[48px] min-w-[48px] items-center justify-center gap-1.5 rounded-xl border border-line px-3 text-base font-semibold hover:border-brand hover:text-brand"
                              >
                                <Pencil size={18} aria-hidden /> Edit
                              </button>
                            </div>

                            {/* Second Row: Floor Label */}
                            <p className="text-sm text-slate-500">{room.floor} Floor</p>

                            {/* Third Row: Sharing Capacity + AC Status Badges */}
                            <div className="flex flex-wrap gap-2">
                              <Badge tone="neutral">{room.sharing}-SHARING</Badge>
                              <Badge tone={room.ac ? 'info' : 'neutral'}>{room.ac ? 'AC' : 'NON-AC'}</Badge>
                            </div>

                            {/* Fourth Row: Monthly Rate */}
                            <p className="text-base text-slate-600">{money(room.monthlyRent)} per bed / month</p>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </>
        ) : (
          <EmptyState
            title="No rooms match these filters"
            hint="Change the floor filter or search term to see rooms."
          />
        )}

        {/* Edit Room Modal */}
        {editing ? <EditRoomModal room={editing} onClose={() => setEditing(null)} /> : null}

        {/* Room Beds Modal */}
        <RoomBedsModal room={selectedRoom} onClose={() => setSelectedRoom(null)} />
      </div>
    );
}

function EditRoomModal({ room, onClose }: { room: Room; onClose: () => void }) {
  const { state, update } = useStore();
  const live = state.rooms.find((r) => r.id === room.id) ?? room;
  const [sharing, setSharing] = useState('');
  const [ac, setAc] = useState('');
  const [rent, setRent] = useState(String(live.monthlyRent));
  const occupied = state.members.filter(
    (m) => m.status === 'active' && m.branch === live.branch && m.roomCode === live.code,
  ).length;

  function save() {
    const newSharing = sharing === '' ? live.sharing : (Number(sharing) as Room['sharing']);
    if (newSharing < occupied) {
      window.alert(
        `This room currently has ${occupied} member${occupied !== 1 ? 's' : ''} in it. Sharing cannot be set below that. Vacate a member first.`,
      );
      return;
    }
    update((s) => ({
      ...s,
      rooms: s.rooms.map((r) =>
        r.id === live.id
          ? { ...r, sharing: newSharing, ac: ac === '' ? live.ac : ac === 'AC', monthlyRent: Number(rent) || r.monthlyRent }
          : r,
      ),
    }));
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Edit Room ${live.code}`} subtitle={`${BRANCH_MAP[live.branch].short} · ${live.floor} Floor`}>
      <div className="space-y-4">
        <Field label="Sharing type (beds in this room)">
          <SelectInput value={String(sharing === '' ? live.sharing : sharing)} onChange={(e) => setSharing(e.target.value)}>
            <option value="1">1-Sharing</option>
            <option value="2">2-Sharing</option>
            <option value="3">3-Sharing</option>
            <option value="4">4-Sharing</option>
          </SelectInput>
        </Field>
        <Field label="Room category">
          <SelectInput value={ac === '' ? (live.ac ? 'AC' : 'Non-AC') : ac} onChange={(e) => setAc(e.target.value)}>
            <option>AC</option>
            <option>Non-AC</option>
          </SelectInput>
        </Field>
        <Field label="Default monthly rent per bed (₹)" hint={`Currently ${money(live.monthlyRent)}. Existing members keep their own rent.`}>
          <MoneyInput value={rent} onChange={(e) => setRent(e.target.value)} />
        </Field>
        <p className="text-base text-slate-600">{occupied} member{occupied !== 1 ? 's' : ''} currently stay in this room.</p>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={save}>
            Save Room Changes
          </Btn>
          <Btn variant="secondary" full onClick={onClose}>
            Cancel
          </Btn>
        </div>
      </div>
    </Modal>
  );
}