import type { AppState } from './types';
import { APP_STATE_VERSION } from './types';
import { addMonths, todayISO } from '../../shared/lib/dates';

/**
 * Brings older saved data up to date with the current shape of the app.
 *
 * The storage key never changes, so a PG owner keeps every record they have
 * already entered. This function only fills in the fields that newer versions
 * of the app understand (EB bill due dates, Wi-Fi validity, staff dates) and
 * leaves every rupee, date and name exactly as it was.
 */
export function migrateState(state: AppState): AppState {
  const today = todayISO();

  const ebMeters = state.ebMeters.map((m) => {
    const cycleMonths = m.cycleMonths && m.cycleMonths > 0 ? m.cycleMonths : 2;
    if (m.dueDate) return { ...m, cycleMonths };
    // Work the first due date out from the last bill that was actually paid.
    const bills = state.ebBills.filter((b) => b.meterId === m.id);
    const lastPaid = bills
      .map((b) => b.paidDate)
      .filter(Boolean)
      .sort()
      .pop();
    const anchor = lastPaid || today;
    return { ...m, cycleMonths, dueDate: addMonths(anchor, cycleMonths) };
  });

  const wifi = state.wifi.map((w) => ({
    ...w,
    validityDays: w.validityDays && w.validityDays > 0 ? w.validityDays : 30,
  }));

  const staff = state.staff.map((s) => ({
    ...s,
    joinDate: s.joinDate || undefined,
    leftDate: s.leftDate || undefined,
  }));

  // Provisions bought before quantities and credit existed: they were paid for
  // in cash on the day, exactly as the app always counted them.
  const provisionExpenses = (state.provisionExpenses ?? []).map((p) => ({
    ...p,
    status: p.status ?? ('paid' as const),
  }));

  return {
    ...state,
    version: APP_STATE_VERSION,
    ebMeters,
    wifi,
    staff,
    provisionExpenses,
    // Newer lists start empty — no record is ever invented or lost.
    provisionSettlements: state.provisionSettlements ?? [],
    closedMonths: state.closedMonths ?? [],
  };
}
