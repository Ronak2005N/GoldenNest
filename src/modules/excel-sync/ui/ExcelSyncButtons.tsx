import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useStore } from '../../../app/store/StoreProvider';
import { exportExcel } from '../export';
import { applyWorkbook, readWorkbook } from '../import';
import { Btn } from '../../../shared/ui';

/** Prominent header actions: full Excel backup out, and restore/sync back in. */
export function ExcelSyncButtons({
  compact = false,
  variant = 'secondary',
}: {
  compact?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const { state, replaceState } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    try {
      await exportExcel(state);
    } catch {
      window.alert('Could not create the Excel file. Please try again.');
    }
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const wb = await readWorkbook(file);
      const ok = window.confirm(
        'Load this Excel file?\n\nEverything currently saved on this device will be replaced by the file contents. Continue?',
      );
      if (!ok) return;
      const next = applyWorkbook(wb, state);
      replaceState(next);
      window.alert(
        `Sync complete.\n\nLoaded ${next.members.length} members, ${next.rooms.length} rooms, ${next.wifi.length} Wi-Fi connections and ${next.staff.length} staff from the file.`,
      );
    } catch {
      window.alert(
        'That file could not be read as a Golden Nest backup (.xlsx). Please choose the file you downloaded from this app.',
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Btn variant={variant} onClick={handleDownload} className={compact ? 'px-4 text-base' : ''}>
        <Download size={22} aria-hidden />
        Download Full Excel Sheet (.xlsx)
      </Btn>
      <Btn variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy} className={compact ? 'px-4 text-base' : ''}>
        <Upload size={22} aria-hidden />
        {busy ? 'Loading file…' : 'Load / Sync from Excel (.xlsx)'}
      </Btn>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        aria-label="Choose a Golden Nest Excel backup file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
    </div>
  );
}
