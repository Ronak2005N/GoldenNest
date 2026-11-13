import { Check, ShieldCheck } from 'lucide-react';
import type { ImportPreview } from '../preview';
import { Badge, Btn, Modal } from '../../../shared/ui';

/**
 * Shows the owner exactly what an Excel import will do before it does it.
 *
 * The most important line on this screen is the last one: **0 records will be
 * deleted**. An import adds what is new and updates what changed; nothing on
 * this device is ever thrown away.
 */
export function ImportPreviewModal({
  preview,
  onConfirm,
  onCancel,
}: {
  preview: ImportPreview;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const changed = preview.added + preview.updated;
  const lines = preview.lines.filter((l) => l.added > 0 || l.updated > 0);

  return (
    <Modal
      open
      onClose={onCancel}
      wide
      title="Check Before Importing"
      subtitle="Nothing is changed until you press Confirm Import."
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-good/35 bg-good/[0.08] p-4">
          <p className="flex items-center gap-2 text-lg font-bold text-good">
            <ShieldCheck size={24} aria-hidden /> Safe import — nothing is deleted
          </p>
          <p className="mt-1 text-base text-slate-700">
            {changed === 0
              ? 'This file has nothing new for this device. You can close this screen.'
              : `Found ${preview.added} new record(s) and ${preview.updated} existing record(s) that will be updated.`}
          </p>
        </div>

        {lines.length > 0 ? (
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.label} className="well px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-semibold">{l.label}</p>
                  <span className="text-base">
                    {l.added > 0 ? (
                      <span className="font-semibold text-good">+{l.added} new</span>
                    ) : null}
                    {l.added > 0 && l.updated > 0 ? ' · ' : null}
                    {l.updated > 0 ? (
                      <span className="font-semibold text-warn">{l.updated} updated</span>
                    ) : null}
                  </span>
                </div>
                {l.names.length > 0 ? (
                  <p className="mt-1 text-base text-slate-600">{l.names.slice(0, 8).join(' · ')}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {preview.staysLeft.length > 0 ? (
          <div className="rounded-xl bg-warn/[0.12] px-4 py-3 text-base text-slate-800">
            <Badge tone="warn">Stays left PG</Badge>{' '}
            {preview.staysLeft.join(', ')} — these members have left the PG on this device and stay
            left, whatever the file says.
          </div>
        ) : null}

        <div className="rounded-2xl border border-good/40 bg-good/[0.06] p-4">
          <p className="text-lg font-bold text-good">
            {preview.added} record(s) will be added · {preview.updated} will be updated ·{' '}
            {preview.deleted} will be deleted
          </p>
          <p className="mt-1 text-base text-slate-700">
            {preview.kept} record(s) on this device are not in the file. They are all kept.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Btn full className="sm:flex-1" onClick={onConfirm} disabled={changed === 0}>
            <Check size={20} aria-hidden /> Confirm Import
          </Btn>
          <Btn variant="secondary" full onClick={onCancel}>
            Cancel
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
