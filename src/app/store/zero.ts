import type { AppState } from './types';
import { emptyState } from './seed';
import { migrateState } from './migrate';

/**
 * The zero state of a device.
 *
 * Every rupee of real data is cleared — members, members who have left, all
 * payments, pending rent, staff, water cans and settlements, tankers, EB bills,
 * lease, catering, Wi-Fi recharges, provisions, supplier credit and closed
 * months — so the profit starts at ₹0 and the owner feeds the real numbers in
 * from the beginning.
 *
 * The **setup** is deliberately kept: the rooms, the EB meters, the Wi-Fi
 * connections, the can rate and the item buttons. That is the furniture of the
 * PG, not the accounts, and keeping it means the app is ready to use at once.
 */
export function zeroedState(prev: AppState): AppState {
  const fresh = migrateState(emptyState());
  return {
    ...fresh,
    rooms: prev.rooms,
    ebMeters: prev.ebMeters,
    wifi: prev.wifi,
    provisionChips: prev.provisionChips.length ? prev.provisionChips : fresh.provisionChips,
    canRate: prev.canRate,
  };
}
