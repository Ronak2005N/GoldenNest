import { useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Plus, Upload } from 'lucide-react';
import { useStore } from '../../../app/store/StoreProvider';
import { BRANCHES, BRANCH_MAP } from '../../../app/store/branches';
import type { BranchId } from '../../../app/store/types';
import { loadXlsx, xl } from '../../excel-sync/xlsx-lazy';
import { Badge, Btn, Modal } from '../../../shared/ui';
import { todayISO } from '../../../shared/lib/dates';
import { downloadMembersList, downloadMembersTemplate } from '../export';
import {
  buildRoomIndex,
  draftsToMembers,
  gridToDrafts,
  rowsToDrafts,
  splitRows,
  validateDrafts,
} from '../parse';
import type { DraftRow } from '../parse';

type Mode = 'paste' | 'upload' | 'grid';

interface GridRow {
  name: string;
  mobile: string;
  room: string;
  bed: string;
  rent: string;
  advance: string;
}

const emptyGridRow = (): GridRow => ({ name: '', mobile: '', room: '', bed: '', rent: '', advance: '' });

const PREVIEW_LIMIT = 40;

export function BulkMembersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, update } = useStore();
  const [branch, setBranch] = useState<BranchId>('PG1');
  const [mode, setMode] = useState<Mode>('paste');
  const [pasted, setPasted] = useState('');
  const [uploadRows, setUploadRows] = useState<string[][] | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [grid, setGrid] = useState<GridRow[]>(() => Array.from({ length: 8 }, emptyGridRow));
  const fileRef = useRef<HTMLInputElement>(null);

  const index = useMemo(
    () => buildRoomIndex(state.rooms, state.members),
    [state.rooms, state.members],
  );

  const drafts = useMemo<DraftRow[]>(() => {
    if (mode === 'paste') return rowsToDrafts(splitRows(pasted));
    if (mode === 'upload') return uploadRows ? rowsToDrafts(uploadRows) : [];
    return gridToDrafts(grid);
  }, [mode, pasted, uploadRows, grid]);

  const checked = useMemo(() => {
    const copy = drafts.map((d) => ({ ...d, errors: [...d.errors], warnings: [...d.warnings] }));
    validateDrafts(copy, index, branch);
    return copy;
  }, [drafts, index, branch]);

  const ready = checked.filter((d) => d.errors.length === 0);
  const skipped = checked.filter((d) => d.errors.length > 0);

  async function handleFile(file: File) {
    setUploadError('');
    try {
      await loadXlsx();
      const wb = xl().read(await file.arrayBuffer());
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('empty');
      const rows = xl().utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
      setUploadRows(rows);
      setUploadName(file.name);
    } catch {
      setUploadError('That file could not be read. Please choose an .xlsx or .csv file.');
      setUploadRows(null);
    }
  }

  function importMembers() {
    if (!ready.length) return;
    const today = todayISO();
    const { created, updated } = draftsToMembers(checked, index, branch, state.members, today);
    if (!created.length && !updated.length) return;

    update((s) => {
      const patched = new Map(updated.map((u) => [u.member.id, u.member]));
      const merged = s.members.map((m) => patched.get(m.id) ?? m);
      return { ...s, members: [...merged, ...created] };
    });

    const lines = [`Import finished for ${BRANCH_MAP[branch].short}.`];
    lines.push(`${created.length} new member(s) added.`);
    if (updated.length) {
      lines.push(`${updated.length} existing member(s) updated:`);
      for (const u of updated.slice(0, 12)) {
        lines.push(`• ${u.member.name}: ${u.changes.join(', ')}`);
      }
      if (updated.length > 12) lines.push(`…and ${updated.length - 12} more.`);
    }
    if (skipped.length) {
      lines.push(`${skipped.length} row(s) were skipped because of a problem.`);
    }
    window.alert(lines.join('\n'));

    setPasted('');
    setUploadRows(null);
    setUploadName('');
    setGrid(Array.from({ length: 8 }, emptyGridRow));
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Add many members at once"
      subtitle="Paste rows from Excel, upload a file, or type them here — check the preview before anything is saved."
    >
      <div className="space-y-5">
        {/* Which PG */}
        <div>
          <p className="mb-1.5 text-base font-semibold">Which PG are these members for?</p>
          <div className="flex flex-wrap gap-2">
            {BRANCHES.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBranch(b.id)}
                aria-pressed={branch === b.id}
                className={`press min-h-[54px] rounded-xl border px-5 text-base font-semibold ${
                  branch === b.id
                    ? 'border-brand bg-brand text-white'
                    : 'border-line bg-white/70 text-ink hover:bg-white'
                }`}
              >
                {b.short}
              </button>
            ))}
          </div>
          <p className="meta mt-2">
            A row may still name its own PG in a “PG Branch” column — that one wins.
          </p>
        </div>

        {/* Mode */}
        <div role="tablist" aria-label="How to add members" className="flex flex-wrap gap-2">
          {(
            [
              { id: 'paste', label: 'Paste from Excel' },
              { id: 'upload', label: 'Upload a file' },
              { id: 'grid', label: 'Type on screen' },
            ] as { id: Mode; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={mode === t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={`press min-h-[54px] rounded-xl border px-5 text-base font-semibold ${
                mode === t.id
                  ? 'border-brand/40 bg-brand-soft text-brand-dark'
                  : 'border-line bg-white/70 text-ink hover:bg-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mode === 'paste' ? (
          <div>
            <p className="text-base">
              In Excel or Google Sheets, select the rows and press <strong>Ctrl + C</strong>. Click in the
              box below and press <strong>Ctrl + V</strong>.
            </p>
            <p className="meta mt-1">
              Columns: Name · Mobile · Room · Bed · Monthly Rent · Advance · Joining Date · Occupation. Your
              own column names are recognised too — a first row of headings is fine.
            </p>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              spellCheck={false}
              placeholder={'Ravi Kumar\t9845012345\tG1\t1\t4500\nSuresh Babu\t9845076543\tG1\t2\t4500'}
              className="mt-3 h-[180px] w-full rounded-xl border border-line bg-white/80 p-3 font-mono text-base text-ink focus:border-brand focus:outline-none"
            />
          </div>
        ) : null}

        {mode === 'upload' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <Btn variant="secondary" onClick={() => fileRef.current?.click()}>
                <Upload size={22} aria-hidden /> Choose Excel or CSV file
              </Btn>
              <Btn variant="secondary" onClick={() => void downloadMembersTemplate(branch)}>
                <FileSpreadsheet size={22} aria-hidden /> Download blank template
              </Btn>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              aria-label="Choose a members spreadsheet"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            {uploadError ? <p className="font-semibold text-bad">{uploadError}</p> : null}
            {uploadName ? (
              <p className="text-base">
                Loaded <strong>{uploadName}</strong>. Check the preview below.
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === 'grid' ? (
          <div>
            <p className="text-base">
              Type the members straight in. Press <strong>Enter</strong> in a cell to jump to the same cell on
              the next row. Leave <strong>Advance</strong> empty if none was taken.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-y-1 text-left">
                <thead>
                  <tr className="meta">
                    <th className="px-2 font-semibold">Name</th>
                    <th className="px-2 font-semibold">Mobile</th>
                    <th className="px-2 font-semibold">Room</th>
                    <th className="px-2 font-semibold">Bed</th>
                    <th className="px-2 font-semibold">Rent</th>
                    <th className="px-2 font-semibold">Advance</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row, i) => (
                    <tr key={i}>
                      {(['name', 'mobile', 'room', 'bed', 'rent', 'advance'] as const).map((col) => (
                        <td key={col} className="px-1">
                          <input
                            value={row[col]}
                            inputMode={col === 'name' || col === 'room' ? 'text' : 'numeric'}
                            onChange={(e) => {
                              const v = e.target.value;
                              setGrid((g) => g.map((r, idx) => (idx === i ? { ...r, [col]: v } : r)));
                            }}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              e.preventDefault();
                              const inputs = Array.from(
                                document.querySelectorAll<HTMLInputElement>('[data-grid-input]'),
                              );
                              const pos = inputs.findIndex((el) => el === e.currentTarget);
                              const next = inputs[pos + 6]; // same column, next row
                              next?.focus();
                              next?.select();
                            }}
                            data-grid-input
                            aria-label={`Row ${i + 1} ${col}`}
                            className="min-h-[48px] w-full rounded-lg border border-line bg-white/80 px-3 text-base text-ink focus:border-brand focus:outline-none"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Btn
              variant="secondary"
              className="mt-3"
              onClick={() => setGrid((g) => [...g, ...Array.from({ length: 5 }, emptyGridRow)])}
            >
              <Plus size={20} aria-hidden /> Add 5 more rows
            </Btn>
          </div>
        ) : null}

        {/* Preview */}
        {checked.length > 0 ? (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone="good">{ready.length} ready to import</Badge>
              {skipped.length ? <Badge tone="bad">{skipped.length} skipped</Badge> : null}
            </div>
            <div className="max-h-[320px] overflow-y-auto overscroll-contain rounded-xl border border-line">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white/95">
                  <tr className="meta">
                    <th className="px-3 py-2 font-semibold">Row</th>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Mobile</th>
                    <th className="px-3 py-2 font-semibold">Room</th>
                    <th className="px-3 py-2 font-semibold">Bed</th>
                    <th className="px-3 py-2 font-semibold">Rent</th>
                    <th className="px-3 py-2 font-semibold">Advance</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {checked.slice(0, PREVIEW_LIMIT).map((d) => (
                    <tr key={d.line} className="border-t border-line">
                      <td className="num-sm px-3 py-2 text-slate-600">{d.line}</td>
                      <td className="px-3 py-2 font-semibold">{d.name || '—'}</td>
                      <td className="num-sm px-3 py-2">{d.mobile || '—'}</td>
                      <td className="px-3 py-2">
                        {d.roomCode || '—'}
                        {d.branch && d.branch !== branch ? ` · ${d.branch}` : ''}
                      </td>
                      <td className="num-sm px-3 py-2">{d.bedIndex ?? '—'}</td>
                      <td className="num-sm px-3 py-2">{d.monthlyRent ?? '—'}</td>
                      <td className="num-sm px-3 py-2">{d.advance ?? '—'}</td>
                      <td className="px-3 py-2">
                        {d.errors.length ? (
                          <span className="font-semibold text-bad">{d.errors[0]}</span>
                        ) : d.warnings.length ? (
                          <span className="text-warn">{d.warnings[0]}</span>
                        ) : (
                          <span className="font-semibold text-good">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {checked.length > PREVIEW_LIMIT ? (
              <p className="meta mt-2">
                Showing the first {PREVIEW_LIMIT} of {checked.length} rows — all of them are imported.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Btn variant="secondary" onClick={() => void downloadMembersList(state, branch)}>
            <Download size={20} aria-hidden /> Download this PG&apos;s member list (.xlsx)
          </Btn>
          <span className="flex-1" />
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={importMembers} disabled={!ready.length}>
            Import {ready.length} member{ready.length === 1 ? '' : 's'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
