/**
 * Browser test for the operational fixes (GND-38 edit member, GND-13 void a
 * payment). Run with: npx tsx scripts/test-ops-fixes.ts
 * Requires `npm run preview` on :4173.
 *
 * It drives the real UI: open the Edit screen, change the rent, save, then
 * void a payment from the payment history and check the books afterwards.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

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

/** Same as hasText, but case does not matter (badges are shown in capitals). */
async function hasTextLoose(page: puppeteer.Page, text: string): Promise<boolean> {
  return page.evaluate(
    (t) => (document.body.innerText || '').toLowerCase().includes(t.toLowerCase()),
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

/** The saved app state, read straight out of localStorage. */
async function savedState(page: puppeteer.Page): Promise<any> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('golden-nest-state-v3') ?? '{}'));
}

/** A member with one paid month, seeded directly into storage. */
const SEED_MEMBER = {
  id: 'mem_ops_test',
  name: 'Ravi Kumar',
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
  payments: [
    {
      id: 'pay_ops_1',
      date: '2026-10-20',
      cycleKey: '2026-10-18',
      cash: 5000,
      upi: 0,
      card: 0,
    },
  ],
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

  // --- seed one member ---------------------------------------------------------
  await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
  await page.evaluate((member) => {
    const raw = localStorage.getItem('golden-nest-state-v3');
    const state = raw ? JSON.parse(raw) : {};
    state.members = [member];
    localStorage.setItem('golden-nest-state-v3', JSON.stringify(state));
  }, SEED_MEMBER);
  await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
  await sleep(700);
  check('the seeded member is on the page', await hasText(page, 'Ravi Kumar'));

  // --- GND-38: edit the member, change the rent --------------------------------
  {
    const opened = await clickByText(page, 'button', 'Edit Details');
    check('the Edit Details button opens the editor', opened);
    check('the editor is open', await waitForText(page, 'Save Changes'));

    // The rent box is the one inside the editor dialog.
    const changed = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const inputs = [...dialog.querySelectorAll('input[type="number"]')] as HTMLInputElement[];
      const rent = inputs[0];
      if (!rent) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(rent, '8000');
      rent.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });
    check('the rent box accepts the new amount', changed);
    await sleep(300);
    check('the screen explains the old price is kept', await hasText(page, 'nothing already paid is re-priced'));

    // The security deposit can be corrected / topped up in the same screen.
    const deposit = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const inputs = [...dialog.querySelectorAll('input[type="number"]')] as HTMLInputElement[];
      const box = inputs[1];
      if (!box) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(box, '2000');
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });
    check('the deposit box accepts the new amount', deposit);
    await sleep(300);

    await clickByText(page, 'button', 'Save Changes');
    await sleep(700);
    const state = await savedState(page);
    const m = state.members.find((x: any) => x.id === 'mem_ops_test');
    check('the rent history was written', Array.isArray(m.rentHistory) && m.rentHistory.length === 2, JSON.stringify(m.rentHistory));
    check('the old rate is kept from the joining date', m.rentHistory?.[0]?.amount === 5000);
    check('the new rate is recorded', m.rentHistory?.some((r: any) => r.amount === 8000), true);
    check('the member is still paid for October', m.payments.length === 1);
    check('the deposit was updated', m.advance?.amount === 2000, JSON.stringify(m.advance));
  }

  // --- GND-13: void a payment ---------------------------------------------------
  {
    const opened = await clickByText(page, 'button', 'Payment History');
    check('the payment history opens', opened);
    check('the payment is listed', await waitForText(page, '₹5,000'));

    await clickByText(page, 'button', 'Void this payment');
    check('the void confirmation appears', await waitForText(page, 'never deleted'));

    await clickByText(page, 'button', 'Yes — void this payment');
    await sleep(800);

    const state = await savedState(page);
    const m = state.members.find((x: any) => x.id === 'mem_ops_test');
    check('the payment record is still there', m.payments.length === 1, `payments=${m.payments.length}`);
    check('it is stamped as voided', !!m.payments[0].voidedAt, String(m.payments[0].voidedAt));
    check('the reason is kept', !!m.payments[0].voidReason);
    check('the amount on the record is untouched', m.payments[0].cash === 5000);
    check('the void is confirmed to the owner', dialogs.some((d) => d.includes('now voided')));
  }

  // --- the books after the void -------------------------------------------------
  {
    await page.goto(`${BASE}/?page=rent`, { waitUntil: 'networkidle0' });
    await sleep(800);
    check('the member is a defaulter again', await hasText(page, 'Total due'));
    const text = await page.evaluate(() => document.body.innerText || '');
    check('the balance is back to the full rent', text.includes('₹5,000'));
  }

  // --- GND-43: a provision bought on credit ------------------------------------
  console.log('\n=== GND-43. Buying provisions on credit ===');
  {
    await page.goto(`${BASE}/?page=provisions`, { waitUntil: 'networkidle0' });
    await sleep(700);

    // Tap an item, type the amount, mark it as credit and name the supplier.
    await clickByText(page, 'button', 'Milk');
    await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input[type="number"]')] as HTMLInputElement[];
      const amount = inputs[0];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(amount, '600');
      amount.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(200);
    await clickByText(page, 'button', 'On credit (not paid)');
    await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('input')].filter(
        (i) => (i as HTMLInputElement).type === 'text',
      ) as HTMLInputElement[];
      const supplier = boxes[boxes.length - 1];
      if (!supplier) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(supplier, 'Amul');
      supplier.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(200);
    check('the screen explains credit does not touch the cash', await hasText(page, 'do not touch this month'));
    await clickByText(page, 'button', 'Save Expense');
    await sleep(800);

    const state = await savedState(page);
    const creditRow = state.provisionExpenses.find((p: any) => p.item === 'Milk' && p.supplier === 'Amul');
    check('the purchase was saved', !!creditRow, JSON.stringify(state.provisionExpenses.slice(-2)));
    check('it is marked as credit', creditRow?.status, 'credit');
    check('the supplier was saved', creditRow?.supplier, 'Amul');
    check('the amount was saved', creditRow?.amount, 600);
    check('the owner is told it is not paid', dialogs.some((d) => d.includes('not paid yet')));

    // It shows up as money owed to the supplier.
    check('the credit balance is on screen', await hasText(page, 'Supplier credit balances'));
    check('the credit amount is on screen', await hasText(page, '₹600'));

    // Pay the supplier: the cash leaves and the balance is cleared.
    await clickByText(page, 'button', 'Pay Supplier');
    check('the payment window opens', await waitForText(page, 'Pay Amul'));
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const input = dialog?.querySelector('input[type="number"]') as HTMLInputElement | null;
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '600');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(200);
    await clickByText(page, 'button', 'Pay ₹600 to Amul');
    await sleep(900);

    const after = await savedState(page);
    check('the payment to the supplier was recorded', after.provisionSettlements?.length === 1, JSON.stringify(after.provisionSettlements));
    check('it was paid to Amul', after.provisionSettlements?.[0]?.supplier, 'Amul');
    check('the credit balance is cleared', !(await hasText(page, 'Supplier credit balances')));
  }

  // --- GND-20: a closed month cannot be changed ---------------------------------
  console.log('\n=== GND-20. A closed month is final ===');
  {
    await page.goto(`${BASE}/?page=dashboard`, { waitUntil: 'networkidle0' });
    await sleep(700);
    check('the month lock card is there', await hasText(page, 'Month Lock'));

    // Close the month that is being looked at (a finished month).
    const monthKey = await page.evaluate(() => {
      const sel = document.querySelector('select') as HTMLSelectElement | null;
      if (!sel) return '';
      const opt = [...sel.options].find((o) => o.value < new Date().toISOString().slice(0, 7));
      if (!opt) return '';
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(sel, opt.value);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return opt.value;
    });
    await sleep(800);
    check('a past month can be chosen', !!monthKey, monthKey);
    await clickByText(page, 'button', 'Lock ');
    await sleep(700);
    check('the owner is told the month is closed', dialogs.some((d) => d.includes('is now closed')));

    const state = await savedState(page);
    check('the closed month was saved', state.closedMonths?.some((c: any) => c.monthKey === monthKey), JSON.stringify(state.closedMonths));
    check('the screen shows it as closed', await hasTextLoose(page, 'is closed'));

    // A back-dated entry into that month is refused.
    const before = await savedState(page);
    const countBefore = before.provisionExpenses.length;
    await page.goto(`${BASE}/?page=provisions`, { waitUntil: 'networkidle0' });
    await sleep(700);
    await clickByText(page, 'button', 'Rice Bag');
    await page.evaluate((key) => {
      const dates = [...document.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
      const input = dates[0];
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, `${key}-05`);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, monthKey);
    await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input[type="number"]')] as HTMLInputElement[];
      const amount = inputs[0];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(amount, '500');
      amount.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(400);
    check('the closed month is explained on screen', await hasText(page, 'is closed'));
    const disabled = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Save Expense')) as HTMLButtonElement | undefined;
      return btn ? btn.disabled : null;
    });
    check('the save button is disabled', disabled, true);

    // Nothing was written into the closed month.
    const after = await savedState(page);
    check('nothing was added at all', after.provisionExpenses.length === countBefore,
      `before=${countBefore}, after=${after.provisionExpenses.length}`);

    // Unlock it again and the same entry works.
    await page.goto(`${BASE}/?page=dashboard`, { waitUntil: 'networkidle0' });
    await sleep(700);
    await clickByText(page, 'button', 'Unlock');
    await sleep(700);
    const opened = await savedState(page);
    check('the month was unlocked', !opened.closedMonths?.some((c: any) => c.monthKey === monthKey), JSON.stringify(opened.closedMonths));
  }

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL UI CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
