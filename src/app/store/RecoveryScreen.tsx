import { useRef, useState } from 'react';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import type { AppState } from './types';
import { migrateState } from './migrate';
import { emptyState } from './seed';
import { applyWorkbook, readWorkbook } from '../../modules/excel-sync/import';
import { longDate } from '../../shared/lib/dates';
import { Badge, Btn, Card, Modal, PageIntro } from '../../shared/ui';

/**
 * Data Recovery Mode.
 *
 * The owner's saved data file could not be read. The app does **not** quietly
 * replace it with sample data — that would hide the problem and could destroy
 * the damaged file. Instead the app stops here and says exactly what to do.
 */
export function RecoveryScreen({
  damaged,
  onRestore,
  onStartFresh,
}: {
  /** The unreadable text exactly as it was found, for safekeeping. */
  damaged: string;
  /** The owner restored their data from an Excel backup. */
  onRestore: (next: AppState) => void;
  /** The owner chose to start again with empty records. */
  onStartFresh: (next: AppState) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmFresh, setConfirmFresh] = useState(false);

  async function restore(file: File) {
    setBusy(true);
    setError('');
    try {
      const wb = await readWorkbook(file);
      // The backup file is the whole truth — the rooms, Wi-Fi and meters it
      // carries come with it.
      const next = applyWorkbook(wb, migrateState(emptyState()));
      onRestore(next);
    } catch {
      setError('That file could not be read. Please choose the .xlsx backup you downloaded from the app.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function downloadDamaged() {
    const blob = new Blob([damaged], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GoldenNest_damaged_data_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return (
    <div className="min-h-screen bg-bad/[0.07] p-4 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <PageIntro
          title="Data Recovery Mode"
          hint="The app has stopped on purpose so that your saved data is not overwritten."
        />

        <Card className="mb-5 border-2 border-bad/50 bg-bad/[0.06]">
          <p className="flex items-center gap-2 text-2xl font-bold text-bad">
            <AlertTriangle size={30} aria-hidden /> Your data file is corrupted
          </p>
          <p className="mt-3 text-lg text-slate-800">
            Do not panic. <strong>Nothing has been deleted</strong> — the app simply cannot read the
            file it saved on this device, so it stopped instead of replacing it with something else.
          </p>
          <p className="mt-2 text-lg text-slate-800">
            <strong>Please upload your latest Excel backup to restore your data.</strong> The backup
            file you download from the app is a complete copy — restoring it brings your members,
            payments and expenses back.
          </p>
          <p className="mt-2 text-base text-slate-700">
            Do not clear this page or reinstall the app yet. First download the damaged file below and
            keep it safe — it may still be repairable.
          </p>
        </Card>

        <Card className="mb-5">
          <h2 className="headline">Step 1 — Keep the damaged file (for safekeeping)</h2>
          <p className="mt-1 text-base text-slate-700">
            This downloads the unreadable file exactly as it was found. Keep it somewhere safe.
          </p>
          <div className="mt-3">
            <Btn variant="secondary" onClick={downloadDamaged}>
              <Download size={22} aria-hidden /> Download the damaged data file
            </Btn>
          </div>
        </Card>

        <Card className="mb-5">
          <h2 className="headline">Step 2 — Restore from your Excel backup</h2>
          <p className="mt-1 text-base text-slate-700">
            Choose the last <span className="font-semibold">Download Full Excel Sheet (.xlsx)</span>{' '}
            file you saved. Everything in it comes back; anything on this device that is not in the
            file is kept.
          </p>
          <div className="mt-3">
            <Btn onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={22} aria-hidden /> {busy ? 'Reading backup…' : 'Upload your Excel backup'}
            </Btn>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            aria-label="Choose a Golden Nest Excel backup file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void restore(f);
            }}
          />
          {error ? <p className="mt-3 font-semibold text-bad">{error}</p> : null}
        </Card>

        <Card className="border-warn/40">
          <h2 className="headline">Step 3 — Only if you have no backup</h2>
          <p className="mt-1 text-base text-slate-700">
            You can start again with empty records. The rooms, Wi-Fi connections and EB meters stay —
            only members, payments and expenses are cleared.
          </p>
          <div className="mt-3">
            <Btn variant="danger" onClick={() => setConfirmFresh(true)}>
              Start again with empty records
            </Btn>
          </div>
        </Card>

        <p className="mt-4 text-base text-slate-600">
          <Badge tone="neutral">Recovered on {longDate(new Date().toISOString().slice(0, 10))}</Badge>
        </p>
      </div>

      {confirmFresh ? (
        <Modal
          open
          onClose={() => setConfirmFresh(false)}
          title="Start again with empty records?"
          subtitle="This cannot be undone"
        >
          <div className="space-y-4">
            <p className="text-base text-slate-700">
              The damaged file on this device will be replaced with empty records. Your rooms, Wi-Fi
              connections and EB meters are kept. Any members, payments and expenses on this device
              that could not be read are lost — download the damaged file first if you have not
              already.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <Btn
                variant="danger"
                full
                className="sm:flex-1"
                onClick={() => {
                  setConfirmFresh(false);
                  onStartFresh(migrateState(emptyState()));
                }}
              >
                Yes — start again with empty records
              </Btn>
              <Btn variant="secondary" full onClick={() => setConfirmFresh(false)}>
                Cancel
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
