/**
 * Browser test for the data-safety fixes (GND-04 recovery mode, GND-03 safe
 * merging). Run with: npx tsx scripts/test-safety-fixes.ts
 * Requires `npm run preview` on :4173.
 */
import puppeteer from 'puppeteer-core';
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Puts one extra member into a backup file, so an import really has something
 * to merge (re-importing the app's own file would change nothing at all).
 */
function addMemberToBackup(sourcePath: string, outPath: string, name = 'Merged Kumar') {
  const wb = XLSX.read(fs.readFileSync(sourcePath), { type: 'buffer' });
  const sheet = wb.Sheets['Active_Members'];
  const rows = sheet
    ? (XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }) as Record<string, unknown>[])
    : [];
  const template = rows[0] ?? ({} as Record<string, unknown>);
  const row: Record<string, unknown> = { ...template };
  row['Member ID'] = 'mem_ui_import_1';
  row['Name'] = name;
  row['Occupation'] = 'Student';
  row['Mobile'] = '9845012345';
  row['Government ID'] = '[Aadhaar Redacted]';
  row['PG Branch'] = 'PG1';
  row['Floor'] = 'Ground';
  row['Room'] = 'G1';
  row['Bed No'] = 1;
  row['Start Date'] = '2026-11-01';
  row['Monthly Rent (₹)'] = 6000;
  row['Advance Amount (₹)'] = 0;
  row['Rent Due (₹)'] = 6000;
  row['Total Paid (₹)'] = 0;
  row['Total Due (₹)'] = 6000;
  row['Status'] = 'UNPAID';
  rows.push(row);
  wb.Sheets['Active_Members'] = XLSX.utils.json_to_sheet(rows);
  fs.writeFileSync(outPath, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
}

const BASE = 'http://localhost:4173';
const EXECUTABLE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
if (!EXECUTABLE) throw new Error('No Edge/Chrome found for the browser test.');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `  [${detail}]`}`);
}

async function clickByText(page: puppeteer.Page, selector: string, text: string): Promise<boolean> {
  return page.evaluate(
    (sel, txt) => {
      const el = [...document.querySelectorAll(sel)].find((n) => (n.textContent || '').includes(txt)) as
        | HTMLElement
        | undefined;
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
    text,
  );
}

async function hasText(page: puppeteer.Page, text: string): Promise<boolean> {
  return page.evaluate((t) => (document.body.innerText || '').includes(t), text);
}

async function waitForText(page: puppeteer.Page, text: string, timeout = 8000): Promise<boolean> {
  try {
    await page.waitForFunction((t) => (document.body.innerText || '').includes(t), { timeout }, text);
    return true;
  } catch {
    return false;
  }
}

const SEED_MEMBER = {
  id: 'mem_safety_1',
  name: 'Safety Test',
  occupation: 'Student',
  mobile: '9845012345',
  govtId: '[Aadhaar Redacted]',
  homeAddress: '',
  branch: 'PG1',
  floor: 'Ground',
  roomCode: 'G1',
  bedIndex: 1,
  billingType: 'monthly',
  startDate: '2026-10-18',
  monthlyRent: 5000,
  advance: { amount: 0, mode: 'Cash', cash: 0, upi: 0, card: 0, date: '2026-10-18' },
  payments: [],
  status: 'active',
};

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.message());
    try {
      await d.accept();
    } catch {
      /* already handled */
    }
  });
  page.on('pageerror', (e) => console.log(`  !! pageerror: ${String(e).slice(0, 200)}`));

  // --- GND-04: a damaged data file must never be replaced by sample data ------
  console.log('=== GND-04. A damaged data file stops the app instead of faking data ===');
  {
    const damaged = JSON.stringify({ version: 1, rooms: 'broken', members: [], staff: [] });
    await page.goto(`${BASE}/?page=dashboard`, { waitUntil: 'networkidle0' });
    await page.evaluate((raw) => {
      localStorage.setItem('golden-nest-state-v3', raw);
    }, damaged);
    await page.goto(`${BASE}/?page=dashboard`, { waitUntil: 'networkidle0' });
    await sleep(900);

    check('the recovery screen is shown', await hasText(page, 'Data Recovery Mode'));
    check('the owner is told not to panic', await hasText(page, 'Do not panic'));
    check(
      'the owner is told to upload the Excel backup',
      await hasText(page, 'upload your latest Excel backup'),
    );
    check('the damaged file can be kept for safekeeping', await hasText(page, 'Download the damaged data file'));
    check('no fake members are shown', !(await hasText(page, 'Safety Test')));

    const after = await page.evaluate(() => localStorage.getItem('golden-nest-state-v3') ?? '');
    check('the damaged file is left exactly as it was', after === damaged, after.slice(0, 60));

    // Reloading again must still show the recovery screen (nothing was overwritten).
    await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
    await sleep(700);
    check('the recovery screen is still there after a reload', await hasText(page, 'Data Recovery Mode'));
  }

  // --- GND-03: the import is a merge, and the owner sees it first -----------
  console.log('\n=== GND-03. An import merges and never deletes ===');
  {
    // Start clean, then put a member on the device.
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
    await sleep(600);
    await page.evaluate((member) => {
      const raw = localStorage.getItem('golden-nest-state-v3');
      const state = raw ? JSON.parse(raw) : {};
      state.members = [member];
      localStorage.setItem('golden-nest-state-v3', JSON.stringify(state));
    }, SEED_MEMBER);
    await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
    await sleep(700);
    check('the member is on the device', await hasText(page, 'Safety Test'));

    // Download a backup, then import it back.
    const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-safety-'));
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    await page.goto(`${BASE}/?page=dashboard`, { waitUntil: 'networkidle0' });
    await sleep(400);
    await clickByText(page, 'button', 'Download Full Excel Sheet');
    let file = '';
    for (let i = 0; i < 60 && !file; i++) {
      await sleep(250);
      const files = fs.readdirSync(downloadDir).filter((f) => f.endsWith('.xlsx'));
      if (files.length) file = files[0];
    }
    check('a backup file was produced', !!file, fs.readdirSync(downloadDir).join(','));

    if (file) {
      // Put one extra member into the file, so the import really has something
      // to merge (re-importing the app's own file would change nothing).
      const changed = path.join(downloadDir, 'with-a-new-member.xlsx');
      addMemberToBackup(path.join(downloadDir, file), changed, 'Merged Kumar');

      const input = await page.$('input[type="file"]');
      check('the import file input is there', !!input);
      if (input) {
        await input.uploadFile(changed);
        check('the preview is shown first', await waitForText(page, 'Check Before Importing'));
        check('the preview says nothing is deleted', await hasText(page, '0 will be deleted'));
        check('the preview mentions the safety promise', await hasText(page, 'Safe import'));

        await clickByText(page, 'button', 'Confirm Import');
        await sleep(900);
        check('the import finished', dialogs.some((d) => d.includes('Import complete')), dialogs.join(' | '));
        check('the summary says nothing was deleted', dialogs.some((d) => d.includes('0 deleted')));

        const state = await page.evaluate(() =>
          JSON.parse(localStorage.getItem('golden-nest-state-v3') ?? '{}'),
        );
        check('the member is still on the device', state.members?.some((m: any) => m.id === 'mem_safety_1'), true);
        check('no duplicate members', state.members?.filter((m: any) => m.id === 'mem_safety_1').length === 1, true);
        check('the new member from the file was added', state.members?.some((m: any) => m.id === 'mem_ui_import_1'), true);
      }
    }
    fs.rmSync(downloadDir, { recursive: true, force: true });
  }

  // --- GND-24: a full storage must warn the owner permanently ---------------
  console.log('\n=== GND-24. The storage-full warning stays on screen ===');
  {
    // Make every save fail, the way a full device does.
    await page.evaluateOnNewDocument(() => {
      const original = Storage.prototype.setItem;
      (window as unknown as { __restoreStorage?: () => void }).__restoreStorage = () => {
        Storage.prototype.setItem = original;
      };
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === 'golden-nest-state-v3') {
          const err = new Error('The quota has been exceeded.');
          err.name = 'QuotaExceededError';
          throw err;
        }
        return original.call(this, key, value);
      };
    });
    await page.goto(`${BASE}/?page=provisions`, { waitUntil: 'networkidle0' });
    await sleep(700);

    // Make a change: tap an item chip and save an expense.
    await clickByText(page, 'button', 'Gas Cylinder');
    await page.evaluate(() => {
      const input = document.querySelector('input[type="number"]') as HTMLInputElement | null;
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '500');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(200);
    await clickByText(page, 'button', 'Save Expense');
    await sleep(900);

    check(
      'the persistent storage-full banner is shown',
      await hasText(page, 'Storage Full: New changes cannot be saved'),
    );
    check(
      'it tells the owner to download the Excel backup',
      await hasText(page, 'Please download your Excel backup to secure your data'),
    );
    check('it offers a backup button', await hasText(page, 'Download backup now'));
    check('it is announced as an alert', await page.evaluate(() => !!document.querySelector('[role="alert"]')));

    // The warning stays up on the next screen too (the app is used without a
    // reload, so the failure is remembered).
    await clickByText(page, 'button', 'Dashboard (Profit & Loss)');
    await sleep(700);
    check('it stays visible on every screen', await hasText(page, 'Storage Full'));

    // Once the storage works again, the warning goes away.
    await page.evaluate(() => {
      (window as unknown as { __restoreStorage?: () => void }).__restoreStorage?.();
    });
    await clickByText(page, 'button', 'Daily Provisions');
    await sleep(700);
    await clickByText(page, 'button', 'Tea / Coffee Powder');
    await page.evaluate(() => {
      const input = document.querySelector('input[type="number"]') as HTMLInputElement | null;
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '100');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(200);
    await clickByText(page, 'button', 'Save Expense');
    await sleep(900);
    check('the warning clears once saving works again', !(await hasText(page, 'Storage Full')));
    check(
      'the change was saved to the device',
      await page.evaluate(() => {
        const raw = localStorage.getItem('golden-nest-state-v3');
        if (!raw) return false;
        const state = JSON.parse(raw);
        return (state.provisionExpenses ?? []).some((p: any) => p.amount === 100);
      }),
    );
  }

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL UI CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
