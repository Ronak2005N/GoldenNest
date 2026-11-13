/** Bed slot utilities for the Golden Nest PG Manager */

import type { AppState, BranchId, BedSlot, Room } from './types';

/**
 * Get all bed slots belonging to a specific room.
 * Returns slots sorted by bedIndex (1, 2, 3, ...).
 */
export function getBedSlotsForRoom(state: AppState, roomId: string): BedSlot[] {
  return state.bedSlots
    .filter((bs) => bs.roomId === roomId)
    .sort((a, b) => a.bedIndex - b.bedIndex);
}

/**
 * Get all bed slots for a specific branch and room code.
 * Convenience function combining room lookup with slot retrieval.
 */
export function getBedSlotsForRoomCode(state: AppState, branch: BranchId, roomCode: string): BedSlot[] {
  const room = state.rooms.find((r) => r.branch === branch && r.code === roomCode);
  if (!room) return [];
  return getBedSlotsForRoom(state, room.id);
}

/**
 * Find the bed slot that a member is occupying.
 * Returns undefined if the member is not assigned to an active bed slot
 * or if the bed slot no longer exists.
 */
export function findOccupiedBedSlot(state: AppState, memberBedIndex: number, roomId: string): BedSlot | undefined {
  return state.bedSlots.find((bs) => bs.roomId === roomId && bs.bedIndex === memberBedIndex);
}

/**
 * Get the current occupancy status of a bed slot.
 * Returns the active member occupying it, or undefined if free.
 */
export function getOccupantForBed(state: AppState, roomId: string, bedIndex: number) {
  return state.members.find(
    (m) => m.status === 'active' && m.branch + '|' + m.roomCode === getRoomKey(state, roomId) && m.bedIndex === bedIndex
  );
}

/**
 * Get the room ID from a branch and room code.
 */
function getRoomKey(state: AppState, roomId: string): string {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return '';
  return room.branch + '|' + room.code;
}

/**
 * Find the next available bed index in a room.
 * If all beds up to the room's sharing are taken, returns the next index
 * (for new beds to be added).
 */
export function getNextAvailableBedIndex(state: AppState, roomId: string): number | null {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return null;

  // Get all bed slots that are currently occupied
  const occupiedBeds = new Set(
    state.members
      .filter((m) => {
        const room = state.rooms.find((r) => r.id === roomId);
        return (
          m.status === 'active' &&
          room &&
          m.branch === room.branch &&
          m.roomCode === room.code
        );
      })
      .map((m) => m.bedIndex)
  );

  // Find the first free bed index from 1 to room.sharing (default beds)
  for (let i = 1; i <= room.sharing; i++) {
    if (!occupiedBeds.has(i)) {
      return i;
    }
  }

  // If all default beds are taken, return the next index for adding new beds
  const existingSlots = getBedSlotsForRoom(state, roomId);
  if (existingSlots.length === 0) {
    return 1;
  }
  const maxIndex = Math.max(...existingSlots.map((s) => s.bedIndex));
  return maxIndex + 1;
}

/**
 * Check if a specific bed index is available in the given room.
 */
export function isBedAvailable(state: AppState, roomId: string, bedIndex: number): boolean {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return false;

  // Check if bedroom slot exists and has an active member
  const hasMember = state.members.some(
    (m) =>
      m.status === 'active' &&
      m.branch === room.branch &&
      m.roomCode === room.code &&
      m.bedIndex === bedIndex
  );

  return !hasMember;
}

/**
 * Get all free bed indices in a room.
 * Includes all existing bed slots (not just room.sharing).
 */
export function getFreeBedIndices(state: AppState, roomId: string): number[] {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return [];

  // First, collect all bed slots that exist
  const existingSlots = getBedSlotsForRoom(state, roomId);

  // If no bed slots exist yet, return default range based on sharing
  if (existingSlots.length === 0) {
    return Array.from({ length: room.sharing }, (_, i) => i + 1);
  }

  const occupiedBeds = new Set(
    state.members
      .filter((m) => m.status === 'active')
      .filter((m) => {
        const r = state.rooms.find((room) => room.id === roomId);
        return r ? m.branch === r.branch && m.roomCode === r.code : false;
      })
      .map((m) => m.bedIndex)
  );

  return existingSlots.map((bs) => bs.bedIndex).filter((idx) => !occupiedBeds.has(idx));
}

/**
 * Create a new bed slot for a room.
 * Returns the created bed slot.
 */
export function createBedSlot(
  roomId: string,
  bedIndex: number
): BedSlot {
  return {
    id: `bed_${roomId}_${bedIndex}`,
    roomId,
    bedIndex,
  };
}

/**
 * Generate the display label for a bed ("BED 1", "BED 2", etc.).
 */
export function bedLabel(bedIndex: number): string {
  return `BED ${bedIndex}`;
}

/**
 * Get the maximum bed index in a room (for validation).
 */
export function getMaxBedIndex(state: AppState, roomId: string): number {
  const slots = getBedSlotsForRoom(state, roomId);
  if (slots.length === 0) {
    const room = state.rooms.find((r) => r.id === roomId);
    return room?.sharing ?? 0;
  }
  return Math.max(...slots.map((s) => s.bedIndex));
}