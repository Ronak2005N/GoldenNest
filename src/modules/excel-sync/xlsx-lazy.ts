/**
 * Lazy SheetJS loader. The xlsx library (~400 kB) is only needed when the
 * owner actually downloads or restores a backup — loading it here keeps it
 * out of the app's first paint so the app opens instantly.
 */
let mod: typeof import('xlsx') | undefined;

/** Load SheetJS on first use (idempotent). Await this before using xl(). */
export async function loadXlsx(): Promise<typeof import('xlsx')> {
  return (mod ??= await import('xlsx'));
}

/** Runtime accessor for already-loaded SheetJS. Only valid after loadXlsx(). */
export function xl(): typeof import('xlsx') {
  if (!mod) throw new Error('xlsx not loaded — await loadXlsx() first');
  return mod;
}
