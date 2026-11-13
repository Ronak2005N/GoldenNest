import { useState, useMemo, useCallback, useEffect } from 'react';
import { Bed, Plus, MoreVertical, User, UserPlus, X, Trash2 } from 'lucide-react';
import { useStore } from '../../app/store/StoreProvider';
import { BRANCH_MAP } from '../../app/store/branches';
import type { Room, Member, BedSlot } from '../../app/store/types';
import { Badge, Btn, Card, ConfirmDialog, Modal } from '../../shared/ui';
import { AddMemberModal, EditMemberModal } from '../../modules/members';
import { bedLabel, getBedSlotsForRoom } from '../../app/store/beds';

interface RoomBedsModalProps {
  room: Room | null;
  onClose: () => void;
}

export function RoomBedsModal({ room, onClose }: RoomBedsModalProps) {
  const { state, update } = useStore();
  const [addingBed, setAddingBed] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ bedIndex: number; bed: BedSlot } | null>(null);

  // Memoized room values - hooks MUST be called at top level, always in same order
  const bedSlots = useMemo(() => {
    if (!room) return [];
    return getBedSlotsForRoom(state, room.id);
  }, [state, room?.id]);

  const roomMembers = useMemo(() => {
    if (!room) return [];
    return state.members.filter(
      (m) => m.status === 'active' && m.branch === room.branch && m.roomCode === room.code,
    );
  }, [state.members, room?.branch, room?.code]);

  const getOccupiedMember = useCallback(
    (bedIndex: number): Member | undefined => {
      return roomMembers.find((m) => m.bedIndex === bedIndex);
    },
    [roomMembers]
  );

  const handleAddBed = useCallback(() => {
    if (!room) return;
    
    const nextIndex = bedSlots.length > 0
      ? Math.max(...bedSlots.map((bs) => bs.bedIndex)) + 1
      : 1;

    const newBed: BedSlot = {
      id: `bed_${room.id}_${nextIndex}`,
      roomId: room.id,
      bedIndex: nextIndex,
    };

    update((s) => ({
      ...s,
      bedSlots: [...s.bedSlots, newBed],
    }));
    setAddingBed(false);
  }, [bedSlots, room, update]);

  const handleDeleteBed = useCallback((bed: BedSlot) => {
    const member = getOccupiedMember(bed.bedIndex);
    if (member) {
      setConfirmDelete({ bedIndex: bed.bedIndex, bed });
    } else {
      update((s) => ({
        ...s,
        bedSlots: s.bedSlots.filter((bs) => bs.id !== bed.id),
      }));
    }
  }, [getOccupiedMember, update]);

  const confirmDeleteBed = useCallback(() => {
    if (!confirmDelete) return;

    update((s) => ({
      ...s,
      bedSlots: s.bedSlots.filter((bs) => bs.id !== confirmDelete.bed.id),
    }));
    setConfirmDelete(null);
  }, [confirmDelete, update]);

  const memberToVacate = confirmDelete ? getOccupiedMember(confirmDelete.bedIndex) : null;

  // Guard: if no room, don't render anything (but hooks were already called)
  if (!room) return null;

  return (
    <>
      <Modal
        open={!!room}
        onClose={onClose}
        title={`${room.code} – Bed Slots`}
        subtitle={
          <div className="flex items-center gap-2">
            <Badge tone={room.ac ? 'info' : 'neutral'}>{room.ac ? 'AC' : 'NON-AC'}</Badge>
            <Badge tone="neutral">{room.monthlyRent} per bed/mo</Badge>
          </div>
        }
        wide
      >
        <div className="space-y-4">
          {/* Header with Add Bed button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                <Bed size={20} />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Bed Management</h3>
                <p className="text-sm text-slate-500">
                  {bedSlots.length} bed slot{bedSlots.length !== 1 ? 's' : ''} in {roomMembers.length} occupied
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Btn
                variant="secondary"
                onClick={() => setAddingBed(true)}
                className="flex items-center gap-2"
              >
                <Plus size={18} />
                Add Bed
              </Btn>
              <Btn
                variant="secondary"
                onClick={onClose}
                className="flex items-center gap-2"
              >
                <X size={18} />
                Close
              </Btn>
            </div>
          </div>

          {/* Bed Grid - 3 columns on desktop, 2 on mobile */}
          {bedSlots.length > 0 ? (
            <div className="grid max-h-[50vh] grid-cols-3 gap-4 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
              {bedSlots.map((bed) => {
                const occupiedMember = getOccupiedMember(bed.bedIndex);
                const isOccupied = !!occupiedMember;

                return (
                  <Card
                    key={bed.id}
                    className={`flex flex-col gap-3 ${isOccupied ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isOccupied ? 'bg-red-100' : 'bg-emerald-100'}`}>
                          {isOccupied ? <User size={18} className="text-red-600" /> : <UserPlus size={18} className="text-emerald-600" />}
                        </div>
                        <span className="text-base font-bold">{bedLabel(bed.bedIndex)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {(bedSlots.length > 1 || isOccupied) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteBed(bed)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 hover:bg-red-100"
                            title="Delete bed"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (isOccupied && occupiedMember) {
                              setEditingMember(occupiedMember);
                            } else {
                              setShowAddMember(true);
                            }
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                        >
                          <MoreVertical size={18} />
                        </button>
                      </div>
                    </div>

                    {isOccupied && occupiedMember ? (
                      <div className="space-y-1">
                        <p className="font-semibold text-base">{occupiedMember.name}</p>
                        <p className="text-sm text-slate-500">
                          Bed {occupiedMember.bedIndex} • {BRANCH_MAP[occupiedMember.branch].short}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Free</p>
                    )}

                    <Badge tone={isOccupied ? 'bad' : 'good'}>
                      {isOccupied ? 'Occupied' : 'Free'}
                    </Badge>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <Bed size={32} className="mx-auto mb-2 text-slate-400" />
              <p className="text-base text-slate-500">No beds to display</p>
              <p className="text-sm text-slate-400 mt-1">Click "Add Bed" to create bed slots for {room.code}</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Add Bed Confirmation Modal */}
      <Modal
        open={addingBed}
        onClose={() => setAddingBed(false)}
        title="Add New Bed"
        subtitle={`This will add BED ${bedSlots.length + 1} to ${room.code}`}
      >
        <div className="space-y-4">
          <p className="text-base text-slate-600">
            Adding a bed will increase the total number of bed slots in {room.code}.
            This does not affect the room's sharing configuration or pricing.
          </p>
          <div className="flex gap-3 justify-end">
            <Btn variant="secondary" onClick={() => setAddingBed(false)}>
              Cancel
            </Btn>
            <Btn onClick={handleAddBed}>
              Add Bed {bedSlots.length + 1}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Add Member Modal */}
      <AddMemberModal
        open={showAddMember}
        onClose={() => setShowAddMember(false)}
        prefill={{
          branch: room.branch,
          floor: room.floor,
          roomCode: room.code,
          bedIndex: 0, // Will auto-select first available
        }}
      />

      {/* Edit Member Modal */}
      <EditMemberModal
        member={editingMember}
        onClose={() => setEditingMember(null)}
      />

      {/* Delete Bed Confirmation Dialog for occupied beds */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Cannot Delete Bed with Active Member"
        onConfirm={confirmDeleteBed}
        onCancel={() => setConfirmDelete(null)}
      >
        <p className="text-base text-slate-600 mb-4">
          Bed {confirmDelete?.bedIndex} is currently occupied by <strong>{memberToVacate?.name}</strong>.
          You must vacate or reassign this member before deleting the bed slot.
        </p>
        <div className="flex gap-3 justify-end">
          <Btn variant="secondary" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Btn>
          <Btn variant="danger" onClick={confirmDeleteBed}>
            Proceed (After Member Moved)
          </Btn>
        </div>
      </ConfirmDialog>
    </>
  );
}