import { useMemo, useState } from 'react';
import { Pencil, UserPlus } from 'lucide-react';
import { useStore } from '../app/store/StoreProvider';
import { BRANCH_MAP } from '../app/store/branches';
import type { BranchId, Floor, Room } from '../app/store/types';
import { AddMemberModal } from '../modules/members';
import type { AdmitPrefill } from '../modules/members';
import { money } from '../shared/lib/format';
import { Badge, Btn, Card, EmptyState, Field, Modal, MoneyInput, PageIntro, SelectInput } from '../shared/ui';

type Bed = { index: number; memberName: string | null };

export function RoomsPage() {
  const { state, branch } = useStore();
  const [floorFilter, setFloorFilter] = useState<'ALL' | Floor>('ALL');
  const [sharingFilter, setSharingFilter] = useState<'ALL' | '1' | '2' | '3' | '4'>('ALL');
  const [catFilter, setCatFilter] = useState<'ALL' | 'AC' | 'Non-AC'>('ALL');
  const [editing, setEditing] = useState<Room | null>(null);
  const [admit, setAdmit] = useState<AdmitPrefill | null>(null);

  const rooms = useMemo(() => {
    return state.rooms.filter((r) => {
      if (branch !== 'ALL' && r.branch !== branch) return false;
      if (floorFilter !== 'ALL' && r.floor !== floorFilter) return false;
      if (sharingFilter !== 'ALL' && String(r.sharing) !== sharingFilter) return false;
      if (catFilter !== 'ALL' && (r.ac ? 'AC' : 'Non-AC') !== catFilter) return false;
      return true;
    });
  }, [state.rooms, branch, floorFilter, sharingFilter, catFilter]);

  /* One pass over the members instead of scanning the whole list per room —
     this is what keeps the 48-room screen smooth with 200+ members. */
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

  function bedsFor(room: Room): Bed[] {
    const taken = occupancy.get(`${room.branch}|${room.code}`);
    return Array.from({ length: room.sharing }, (_, i) => {
      const idx = i + 1;
      return { index: idx, memberName: taken?.get(idx) ?? null };
    });
  }

  const totalBeds = rooms.reduce((n, r) => n + r.sharing, 0);
  const occupied = rooms.reduce((n, r) => n + bedsFor(r).filter((b) => b.memberName).length, 0);
  const vacant = totalBeds - occupied;

  const branchesShown = branch === 'ALL' ? (['PG1', 'PG2', 'PG3', 'PG4'] as BranchId[]) : [branch as BranchId];

  return (
    <div>
      <PageIntro
        title="Rooms & Vacant Beds"
        hint="Green beds are free — tap one to admit a new member straight into that bed."
      />

      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Floor">
            <SelectInput value={floorFilter} onChange={(e) => setFloorFilter(e.target.value as 'ALL' | Floor)}>
              <option value="ALL">All floors</option>
              <option>Ground</option>
              <option>First</option>
              <option>Second</option>
              <option>Third</option>
            </SelectInput>
          </Field>
          <Field label="Sharing type">
            <SelectInput value={sharingFilter} onChange={(e) => setSharingFilter(e.target.value as typeof sharingFilter)}>
              <option value="ALL">Any sharing</option>
              <option value="1">1-Sharing</option>
              <option value="2">2-Sharing</option>
              <option value="3">3-Sharing</option>
              <option value="4">4-Sharing</option>
            </SelectInput>
          </Field>
          <Field label="Room category">
            <SelectInput value={catFilter} onChange={(e) => setCatFilter(e.target.value as typeof catFilter)}>
              <option value="ALL">AC and Non-AC</option>
              <option>AC</option>
              <option>Non-AC</option>
            </SelectInput>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Badge tone="good">{vacant} vacant beds</Badge>
          <Badge tone="neutral">{occupied} occupied</Badge>
          <Badge tone="info">{rooms.length} rooms shown</Badge>
          <Badge tone="warn">{money(rooms.reduce((n, r) => n + r.monthlyRent, 0))} total rent capacity / month</Badge>
        </div>
      </Card>

      {rooms.length === 0 ? (
        <EmptyState
          title="No rooms match these filters"
          hint="Change the floor, sharing or AC filter above to see rooms."
        />
      ) : (
        branchesShown.map((b) => {
          const branchRooms = rooms.filter((r) => r.branch === b);
          if (!branchRooms.length) return null;
          return (
            <section key={b} className="mb-8">
              <h2 className="headline mb-3 flex flex-wrap items-center gap-3">
                {BRANCH_MAP[b].name}
                {BRANCH_MAP[b].comingSoon ? <Badge tone="warn">Coming Soon</Badge> : null}
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {branchRooms.map((room) => {
                  const beds = bedsFor(room);
                  const free = beds.filter((x) => !x.memberName).length;
                  return (
                    <Card key={room.id} className="cv-auto flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="num-xl">{room.code}</p>
                          <p className="text-base text-slate-600">{room.floor} Floor</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditing(room)}
                          aria-label={`Edit room ${room.code}`}
                          className="press flex min-h-[52px] min-w-[52px] items-center justify-center gap-1.5 rounded-xl border border-line px-3 text-base font-semibold hover:border-brand hover:text-brand"
                        >
                          <Pencil size={20} aria-hidden /> Edit
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="neutral">{room.sharing}-Sharing</Badge>
                        <Badge tone={room.ac ? 'info' : 'neutral'}>{room.ac ? 'AC' : 'Non-AC'}</Badge>
                        <Badge tone={free > 0 ? 'good' : 'bad'}>{free > 0 ? `${free} free` : 'Full'}</Badge>
                      </div>
                      <p className="text-base text-slate-600">{money(room.monthlyRent)} per bed / month</p>
                      <div className="flex flex-wrap gap-2">
                        {beds.map((bed) =>
                          bed.memberName ? (
                            <div
                              key={bed.index}
                              title={`Bed ${bed.index}: occupied by ${bed.memberName}`}
                              className="well flex min-h-[58px] min-w-[128px] flex-1 flex-col justify-center px-3 py-1.5"
                            >
                              <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                                Bed {bed.index}
                              </span>
                              <span className="truncate text-base font-semibold leading-tight">
                                {bed.memberName}
                              </span>
                            </div>
                          ) : (
                            <button
                              key={bed.index}
                              type="button"
                              onClick={() =>
                                setAdmit({ branch: room.branch, floor: room.floor, roomCode: room.code, bedIndex: bed.index })
                              }
                              aria-label={`Bed ${bed.index} free — tap to admit a member`}
                              className="press flex min-h-[58px] min-w-[128px] flex-1 flex-col items-start justify-center rounded-xl border border-dashed border-good/45 bg-good/[0.08] px-3 py-1.5 text-left hover:border-good hover:bg-good/[0.14]"
                            >
                              <span className="text-sm font-semibold uppercase tracking-wide text-good/80">
                                Bed {bed.index}
                              </span>
                              <span className="flex items-center gap-1 text-base font-bold leading-tight text-good">
                                <UserPlus size={20} aria-hidden /> Free
                              </span>
                            </button>
                          ),
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      {editing ? <EditRoomModal room={editing} onClose={() => setEditing(null)} /> : null}
      <AddMemberModal
        key={admit ? `admit-${admit.roomCode}-${admit.bedIndex}` : 'admit-closed'}
        open={!!admit}
        prefill={admit ?? undefined}
        onClose={() => setAdmit(null)}
      />
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
        `This room currently has ${occupied} member(s). Sharing cannot be set below that. Vacate a member first.`,
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
        <p className="text-base text-slate-600">{occupied} member(s) currently stay in this room.</p>
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
