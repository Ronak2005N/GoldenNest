import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useStore } from '../../../app/store/StoreProvider';
import { exportExcel } from '../export';
import { applyWorkbook, readWorkbook } from '../import';
import { mergedAfterImport, previewImport } from '../preview';
import type { ImportPreview } from '../preview';
import { ImportPreviewModal } from './ImportPreviewModal';
import { Btn } from '../../../shared/ui';

/**
 * Prominent header actions: full Excel backup out, and restore/sync back in.
 *
 * The import is a safe merge: nothing on the device is ever deleted, and the
 * owner is shown exactly what will change before anything is saved.
 */
export function ExcelSyncButtons({
  compact = false,
  variant = 'primary',
}: {
  compact?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const { state, replaceState } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ preview: ImportPreview; file: File } | null>(null);

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
      // Show the owner what the import will do before anything is saved.
      setPending({ preview: previewImport(state, wb), file });
    } catch {
      window.alert(
        'That file could not be read as a Golden Nest backup (.xlsx). Please choose the file you downloaded from this app.',
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function confirmImport() {
    if (!pending) return;
    setBusy(true);
    try {
      const wb = await readWorkbook(pending.file);
      const next = applyWorkbook(wb, state);
      replaceState(next);
      window.alert(
        `Import complete.\n\n${pending.preview.added} record(s) added, ${pending.preview.updated} updated, ` +
          `0 deleted.\n\nNow on this device: ${next.members.length} members, ${next.rooms.length} rooms, ` +
          `${next.wifi.length} Wi-Fi connections and ${next.staff.length} staff.`,
      );
    } catch {
      window.alert('The import could not be completed. Nothing was changed.');
    } finally {
      setBusy(false);
      setPending(null);
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
        {busy ? 'Reading file…' : 'Load / Sync from Excel (.xlsx)'}
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
      {pending ? (
        <ImportPreviewModal
          preview={pending.preview}
          onConfirm={() => void confirmImport()}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </div>
  );
}

export { mergedAfterImport };
