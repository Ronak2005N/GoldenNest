/**
 * Browser smoke test: renders every tab at desktop + mobile widths, checks for
 * horizontal overflow / JS errors, and drives the key flows end-to-end
 * (admit, payment, vacate wizard, persistent chips, Wi-Fi recharge, Excel round-trip).
 *
 * Run: npx tsx scripts/ui-smoke.ts   (requires `npm run preview` on :4173)
 */
import puppeteer from 'puppeteer-core';
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = 'http://localhost:4173';
const PAGES = ['dashboard', 'rooms', 'members', 'rent', 'water', 'eb', 'staff', 'wifi', 'provisions'];

/**
 * Puts one extra member into a backup file, so an import really has something
 * to do (re-importing the app's own file would change nothing at all).
 */
function addMemberToBackup(sourcePath: string, outPath: string, name = 'Imported Kumar') {
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

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
];
const EXECUTABLE = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!EXECUTABLE) throw new Error('No Edge/Chrome found for the UI smoke test.');

let failures = 0;
function check(label: string, ok: boolean, extra = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !extra ? '' : `  [${extra}]`}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Native dialogs (alert/confirm/prompt) are browser UI — record their text so
 * tests can assert on it; document.body.innerText never contains them. */
function dialogLog(page: puppeteer.Page): string[] {
  return ((page as unknown as { __dialogs?: string[] }).__dialogs ??= []);
}

async function newPage(browser: puppeteer.Browser, width: number, height: number) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  const dialogs = dialogLog(page);
  page.on('pageerror', (e) => console.log(`  !! pageerror: ${String(e).slice(0, 200)}`));
  page.on('dialog', async (d) => {
    dialogs.push(`[${d.type()}] ${d.message()}`);
    try {
      if (d.type() === 'prompt') await d.accept('UPI');
      else await d.accept();
    } catch {
      /* already handled */
    }
  });
  return page;
}

async function clickByText(page: puppeteer.Page, selector: string, text: string): Promise<boolean> {
  return page.evaluate(
    (sel, txt) => {
      const el = [...document.querySelectorAll(sel)].find((n) =>
        (n.textContent || '').includes(txt),
      ) as HTMLElement | undefined;
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

/** Vacant bed tiles carry their instruction in an aria-label, not as repeated body copy. */
async function clickByAriaLabel(page: puppeteer.Page, text: string): Promise<boolean> {
  return page.evaluate((t) => {
    const el = [...document.querySelectorAll('button')].find((n) =>
      (n.getAttribute('aria-label') || '').includes(t),
    ) as HTMLElement | undefined;
    if (!el) return false;
    el.click();
    return true;
  }, text);
}

async function hasAriaLabel(page: puppeteer.Page, text: string): Promise<boolean> {
  return page.evaluate(
    (t) => [...document.querySelectorAll('button')].some((n) => (n.getAttribute('aria-label') || '').includes(t)),
    text,
  );
}

async function waitForText(page: puppeteer.Page, text: string, timeout = 6000): Promise<boolean> {
  try {
    await page.waitForFunction((t) => (document.body.innerText || '').includes(t), { timeout }, text);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(fn: () => boolean | Promise<boolean>, timeout = 6000, interval = 150): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true;
    await sleep(interval);
  }
  return false;
}

async function fresh(browser: puppeteer.Browser, pageId: string, width = 1440, height = 900) {
  const page = await newPage(browser, width, height);
  await page.goto(`${BASE}/?page=${pageId}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/?page=${pageId}`, { waitUntil: 'networkidle0' });
  return page;
}

/**
 * The seed intentionally ships with no members (owner decision, 12 Nov 2026),
 * so member-dependent flows first admit one through the real UI: vacant bed →
 * fill the form → save. Returns true when the admit confirmation appeared.
 */
async function admitMember(page: puppeteer.Page, name: string): Promise<boolean> {
  await page.goto(`${BASE}/?page=rooms`, { waitUntil: 'networkidle0' });
  await sleep(300);
  if (!(await clickByAriaLabel(page, 'tap to admit'))) return false;
  if (!(await waitForText(page, 'Add New Member'))) return false;
  await page.type('input[placeholder="Type the full name"]', name);
  await page.type('input[placeholder="98450 12345"]', '9845012399');
  const numbers = await page.$$('[role="dialog"] input[type="number"]');
  if (!numbers.length) return false;
  await numbers[0].type('8500'); // monthly rent (first money field in the form)
  await clickByText(page, 'button', 'Save Member & Assign Bed');
  const saved = await waitFor(() =>
    dialogLog(page).some((m) => m.includes('admitted to')),
  );
  await sleep(300);
  return saved;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });

  // ---------- 1. every tab at desktop + mobile: no JS errors, no horizontal overflow ----------
  for (const vp of [
    { label: 'desktop', width: 1440, height: 900 },
    { label: 'mobile', width: 390, height: 844 },
  ]) {
    for (const id of PAGES) {
      const page = await newPage(browser, vp.width, vp.height);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`${BASE}/?page=${id}`, { waitUntil: 'networkidle0' });
      await sleep(300);
      const info = await page.evaluate(() => {
        const vw = window.innerWidth;
        const docW = document.documentElement.scrollWidth;
        const wide: string[] = [];
        if (docW > vw + 1) {
          for (const el of Array.from(document.querySelectorAll('body *'))) {
            const r = el.getBoundingClientRect();
            if (r.width > vw + 1 || r.right > vw + 1) {
              const cls = typeof el.className === 'string' ? el.className : '';
              wide.push(`${el.tagName}.${cls.slice(0, 70)} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
            }
          }
        }
        return { vw, docW, wide: wide.slice(0, 8) };
      });
      check(`${vp.label}/${id} renders`, (await page.evaluate(() => document.body.innerText.length)) > 400);
      check(`${vp.label}/${id} no JS errors`, errors.length === 0, errors.join(' | '));
      check(
        `${vp.label}/${id} no horizontal overflow`,
        info.docW <= info.vw + 1,
        `doc=${info.docW} vw=${info.vw} :: ${info.wide.join(' ;; ')}`,
      );
      await page.close();
    }
  }

  // ---------- 2. rooms: vacant bed opens the admit modal, then saves a member ----------
  {
    const page = await fresh(browser, 'rooms');
    check('rooms shows vacant beds', await hasAriaLabel(page, 'tap to admit'));
    await clickByAriaLabel(page, 'tap to admit');
    check('vacant bed opens Add Member modal', await waitForText(page, 'Add New Member'));
    check('admit modal pre-fills room', await hasText(page, 'Free bed'));
    await page.keyboard.press('Escape');
    await sleep(300);
    check('modal closes with Escape', (await page.$('[role="dialog"]')) === null);

    check('admit flow: member saved through the form', await admitMember(page, 'Ravi Test'));
    await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
    await sleep(300);
    check('admitted member appears in the members list', await hasText(page, 'Ravi Test'));
    await page.close();
  }

  // ---------- 3. rent: admit, record a full split payment → receipt → defaulter clears ----------
  {
    const page = await fresh(browser, 'rooms');
    check('admit before payment flow', await admitMember(page, 'Arjun Test'));
    await page.goto(`${BASE}/?page=rent`, { waitUntil: 'networkidle0' });
    await sleep(300);
    check('defaulters tab is default', await hasText(page, 'member(s) owe money'));
    await clickByText(page, 'button', 'Record Payment');
    check('payment modal opens', await waitForText(page, 'Record Rent Payment'));
    await clickByText(page, 'button', 'Fill balance in UPI');
    await clickByText(page, 'button', 'Save Payment & Show Receipt');
    check('receipt shown with split breakdown', await waitForText(page, 'Payment Receipt'));
    check('receipt shows UPI amount', await hasText(page, 'Paid in UPI'));
    await clickByText(page, 'button', 'Done');
    await sleep(200);
    const text = await page.evaluate(() => document.body.innerText);
    check('defaulter cleared after full payment', !text.includes('member(s) owe money'), text.slice(0, 120));
    await page.close();
  }

  // ---------- 4. members: vacate wizard runs 3 steps ----------
  {
    const page = await fresh(browser, 'rooms');
    check('admit before vacate flow', await admitMember(page, 'Vicky Test'));
    await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
    await sleep(300);
    await clickByText(page, 'button', 'Vacate / Leave PG');
    check('vacate step 1', await waitForText(page, 'Step 1 of 3'));
    await clickByText(page, 'button', 'Next: Cut Deductions');
    check('vacate step 2', await waitForText(page, 'Step 2 of 3'));
    check('net refund auto-calculated', await hasText(page, 'to return to member'));
    await clickByText(page, 'button', 'Next: Return Refund');
    check('vacate step 3', await waitForText(page, 'Step 3 of 3'));
    check('refund mode selector', await hasText(page, 'How will you return the refund?'));
    await clickByText(page, 'button', 'Back');
    check('back button returns to step 2', await waitForText(page, 'Step 2 of 3'));
    const closeBtn = await page.$('[aria-label="Close this window"]');
    if (closeBtn) await closeBtn.click();
    await sleep(200);
    await page.close();
  }

  // ---------- 5. provisions: new chip persists forever ----------
  {
    const page = await fresh(browser, 'provisions');
    await clickByText(page, 'button', 'Add Item Chip');
    check('chip input appears', await waitForText(page, 'New item name'));
    await page.type('input[placeholder="e.g. Water Motor Service"]', 'Water Motor Service');
    await clickByText(page, 'button', 'Save New Item Button');
    check('chip alert confirms save', await waitForText(page, 'saved permanently'));
    await page.reload({ waitUntil: 'networkidle0' });
    check('chip survives reload (localStorage)', await hasText(page, 'Water Motor Service'));
    await page.close();
  }

  // ---------- 6. wifi: recharge with an explicit plan length and amount --------
  {
    const page = await fresh(browser, 'wifi');
    check('expired wifi highlighted', await hasText(page, 'EXPIRED / DUE TODAY'));
    const beforeCount = await page.evaluate(
      () => (document.body.innerText.match(/EXPIRED \/ DUE TODAY/g) || []).length,
    );
    const alertSeen = waitFor(() =>
      dialogLog(page).some((m) => m.includes('New expiry date')),
      8000,
    );
    // The recharge is confirmed in the modal now — the plan length and the
    // amount are chosen by the owner, never assumed.
    await clickByText(page, 'button', 'Recharge Done');
    check('the recharge modal opens', await waitForText(page, 'How long is this recharge for?'));
    check('the plan length can be chosen', await hasText(page, '365 days'));
    check('the amount can be entered', await hasText(page, 'Amount paid'));
    await clickByText(page, 'button', 'Save Recharge');
    check('recharge confirm alert', await alertSeen, dialogLog(page).join(' | '));
    await sleep(400);
    const afterCount = await page.evaluate(
      () => (document.body.innerText.match(/EXPIRED \/ DUE TODAY/g) || []).length,
    );
    check('expired count dropped after recharge', afterCount < beforeCount, `${beforeCount} -> ${afterCount}`);
    await page.close();
  }

  // ---------- 7. Excel: download in browser, then re-import it ----------
  {
    const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-dl-'));
    const page = await fresh(browser, 'dashboard');
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });

    await clickByText(page, 'button', 'Download Full Excel Sheet');
    let file = '';
    for (let i = 0; i < 60 && !file; i++) {
      await sleep(250);
      const files = fs.readdirSync(downloadDir).filter((f) => f.endsWith('.xlsx'));
      if (files.length) file = files[0];
    }
    check('browser download produced .xlsx', !!file, fs.readdirSync(downloadDir).join(','));
    if (file) {
      const size = fs.statSync(path.join(downloadDir, file)).size;
      check('downloaded file is non-trivial', size > 40000, String(size));

      // Add one member to the file so the import really has something to do
      // (re-importing the app's own file would change nothing at all).
      const changed = path.join(downloadDir, 'with-a-new-member.xlsx');
      addMemberToBackup(path.join(downloadDir, file), changed);

      const input = await page.$('input[type="file"]');
      if (!input) {
        check('file input present for import', false);
      } else {
        await input.uploadFile(changed);
        // The import now shows a preview before it changes anything.
        const previewShown = await waitFor(
          () => hasText(page, 'Check Before Importing'),
          10000,
        );
        check('import preview shown before anything is saved', previewShown);
        check(
          'the preview says nothing is deleted',
          await hasText(page, 'will be deleted'),
        );
        check(
          'the preview promises zero deletions',
          await hasText(page, '0 will be deleted'),
        );
        check(
          'the preview says what will be added',
          await hasText(page, '+1 new'),
        );
        await clickByText(page, 'button', 'Confirm Import');
        const imported = await waitFor(() =>
          dialogLog(page).some((m) => m.includes('Import complete')),
          10000,
        );
        check('import finished with summary alert', imported, dialogLog(page).join(' | '));
        await sleep(300);
        check(
          'import summary names the loaded counts',
          dialogLog(page).some((m) => m.includes('Import complete') && m.includes('1 members')),
          dialogLog(page).join(' | '),
        );
        check(
          'import summary says nothing was deleted',
          dialogLog(page).some((m) => m.includes('0 deleted')),
          dialogLog(page).join(' | '),
        );
        await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
        await sleep(700);
        check(
          'the imported member is on the device',
          await hasText(page, 'Imported Kumar'),
        );
      }
    }
    await page.close();
    fs.rmSync(downloadDir, { recursive: true, force: true });
  }

  // ---------- 7. bulk member entry: paste rows → preview → import ----------
  {
    const page = await fresh(browser, 'members');
    await clickByText(page, 'button', 'Add Many Members');
    check('bulk modal opens', await waitForText(page, 'Add many members at once'));

    const rows = [
      'Name\tMobile\tRoom\tBed\tRent\tAdvance',
      'Bulk One\t9845000001\tG1\t1\t4500\t1000',
      'Bulk Two\t9845000002\tG1\t2\t4500\t0',
      'Bad Room\t9845000003\tZZ9\t1\t4500\t0',
    ].join('\n');
    await page.evaluate((text) => {
      const ta = document.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(ta, text);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, rows);
    await sleep(400);

    check('bulk preview counts ready rows', await hasText(page, '2 READY TO IMPORT'));
    check('bulk preview flags the bad row', await hasText(page, 'does not exist in PG1'));
    check('bulk import button is enabled', await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        (b.textContent || '').includes('Import 2 member'),
      ) as HTMLButtonElement | undefined;
      return !!btn && !btn.disabled;
    }));

    await clickByText(page, 'button', 'Import 2 member');
    await sleep(500);
    check('bulk import confirms with a summary', dialogLog(page).some((m) => m.includes('Import finished')));
    await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
    await sleep(400);
    check('bulk imported member appears in the list', await hasText(page, 'Bulk One'));
    check('bulk skipped row was not imported', !(await hasText(page, 'Bad Room')));
    await page.close();
  }

  // ---------- 8. water: a part-paid can bill says PART PAID, never PAID ----------
  {
    const page = await fresh(browser, 'water');
    // Log some cans for this month so there is a bill to settle.
    await clickByText(page, 'button', '+10 Cans');
    await clickByText(page, 'button', "Save Today's Cans");
    await sleep(400);
    check('cans were logged', await hasText(page, 'Cans delivered this month'));

    // Pay only part of the bill.
    const opened = await clickByText(page, 'button', 'as PAID');
    check('the settlement modal opens', await waitForText(page, 'Month-End Water Can Settlement'));
    const moneyInputs = await page.$$('[role="dialog"] input');
    if (moneyInputs.length) {
      await moneyInputs[0].type('20');
    }
    await clickByText(page, 'button', 'Mark as PAID');
    await sleep(500);
    check('the part payment was saved', dialogLog(page).some((m) => m.includes('marked as PAID')));

    const waterText = await page.evaluate(() => document.body.innerText);
    check('the badge says PART PAID', waterText.includes('PART PAID'), waterText.slice(0, 200));
    check('the badge does not say plain PAID', !/^PAID$/m.test(waterText), waterText.slice(0, 200));
    check('the rest of the bill is still owed', waterText.includes('is still owed to the vendor'));
    await page.close();
  }

  // ---------- 9. "Start From Zero": the books must really be empty ----------
  {
    const page = await fresh(browser, 'dashboard');
    // Put real records on the device first: demo rows in every PG and month.
    await clickByText(page, 'button', 'Load Demo Data Again');
    await sleep(800);
    const beforeText = await page.evaluate(() => document.body.innerText);
    check(
      'the demo data is on screen before the clear',
      !/Total Expenses This Month\s+₹0/.test(beforeText),
      beforeText.slice(beforeText.indexOf('Total Expenses This Month'), beforeText.indexOf('Total Expenses This Month') + 40),
    );

    await clickByText(page, 'button', 'Start From Zero');
    // The screen is rebuilt from the cleared file, so wait for the reload.
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => undefined);
    await sleep(800);

    const afterText = await page.evaluate(() => document.body.innerText);
    check(
      'the revenue is zero after the clear',
      /Total Revenue Collected\s+₹0/.test(afterText),
      afterText.slice(afterText.indexOf('Total Revenue Collected'), afterText.indexOf('Total Revenue Collected') + 40),
    );
    check(
      'the expenses are zero after the clear',
      /Total Expenses This Month\s+₹0/.test(afterText),
      afterText.slice(afterText.indexOf('Total Expenses This Month'), afterText.indexOf('Total Expenses This Month') + 40),
    );
    check('the owner is told the books were cleared', await hasText(page, 'Everything was cleared on'));
    check(
      'no record is left on the device',
      await page.evaluate(() => {
        const raw = localStorage.getItem('golden-nest-state-v2');
        if (!raw) return false;
        const s = JSON.parse(raw);
        let payments = 0;
        for (const m of s.members) payments += m.payments.length;
        return (
          s.members.length === 0 &&
          payments === 0 &&
          s.maintenance.length === 0 &&
          s.waterCans.length === 0 &&
          s.canSettlements.length === 0 &&
          s.waterTankers.length === 0 &&
          s.ebBills.length === 0 &&
          s.leasePayments.length === 0 &&
          s.catering.length === 0 &&
          s.staff.length === 0 &&
          s.staffAdvances.length === 0 &&
          s.staffPayouts.length === 0 &&
          s.wifiRecharges.length === 0 &&
          s.provisionExpenses.length === 0 &&
          s.provisionSettlements.length === 0 &&
          s.closedMonths.length === 0
        );
      }),
    );
    check('the setup is still there', await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('golden-nest-state-v2') || '{}');
      return s.rooms?.length === 48 && s.ebMeters?.length === 14 && s.wifi?.length === 14;
    }));
    await page.close();
  }

  // ---------- 10. dashboard: the liability card covers deposits, advance rent and staff ----------
  {
    const page = await fresh(browser, 'dashboard');
    check(
      'the dashboard shows the total liabilities card',
      await hasText(page, 'Total Liabilities & Advances Held'),
    );
    check(
      'the empty state is explained',
      await hasText(page, 'No deposits, advance rent or staff advances are held'),
    );

    // Admit a member with a security deposit so the card has something to show.
    await page.goto(`${BASE}/?page=rooms`, { waitUntil: 'networkidle0' });
    await sleep(300);
    await clickByAriaLabel(page, 'tap to admit');
    await waitForText(page, 'Add New Member');
    await page.type('input[placeholder="Type the full name"]', 'Liability Test');
    await page.type('input[placeholder="98450 12345"]', '9845012401');
    const numbers = await page.$$('[role="dialog"] input[type="number"]');
    if (numbers.length > 1) await numbers[0].type('8500');
    if (numbers.length > 1) await numbers[1].type('4000'); // the security deposit
    await clickByText(page, 'button', 'Save Member & Assign Bed');
    await sleep(600);

    await page.goto(`${BASE}/?page=dashboard`, { waitUntil: 'networkidle0' });
    await sleep(400);
    check(
      'the security deposit is on the liability card',
      await hasText(page, 'security deposits'),
    );
    check(
      'it says the money is not profit yet',
      await hasText(page, 'not counted as profit'),
    );
    await page.close();
  }

  await browser.close();
  console.log(failures === 0 ? '\nALL UI CHECKS PASSED' : `\n${failures} UI CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
