/**
 * Browser-level audit checks (run with: npx tsx scripts/test-audit-browser.ts)
 * Requires `npm run preview` on :4173.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = 'http://localhost:4173';
const EXECUTABLE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
if (!EXECUTABLE) throw new Error('No Edge/Chrome found.');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let reproduced = 0;
let checked = 0;
function repro(label: string, ok: boolean, detail = '') {
  checked += 1;
  if (ok) reproduced += 1;
  console.log(`${ok ? 'REPRODUCED' : 'not reproduced'}  ${label}${detail ? `  [${detail}]` : ''}`);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('dialog', async (d) => { await d.accept(); });

  console.log('=== B1. A failure while reading saved data wipes the owner\u2019s records ===');
  {
    await page.goto(`${BASE}/?page=dashboard`, { waitUntil: 'networkidle0' });
    // A saved state that is not the data we saved: valid JSON, broken shape.
    const broken = JSON.stringify({ version: 1, rooms: [], members: [], ebMeters: null, staff: [], wifi: [] });
    await page.evaluate((raw) => {
      localStorage.setItem('golden-nest-state-v3', raw);
    }, broken);
    await page.goto(`${BASE}/?page=dashboard`, { waitUntil: 'networkidle0' });
    await sleep(900);
    const after = await page.evaluate(() => localStorage.getItem('golden-nest-state-v3') ?? '');
    const bodyText = await page.evaluate(() => document.body.innerText || '');
    repro(
      'a broken saved state is replaced by the sample data and written back over the original',
      after !== broken,
      `the damaged file was ${after === broken ? 'left alone' : 'overwritten'}`,
    );
    repro(
      'the owner is shown fake data instead of being told the file is damaged',
      !bodyText.includes('Data Recovery Mode'),
      'the recovery screen is shown',
    );
    repro(
      'the damaged file is not explained to the owner',
      !(bodyText.includes('Data Recovery Mode') && bodyText.includes('Do not panic')),
      'the recovery screen explains what happened',
    );
  }

  console.log('\n=== B2. A negative amount can be typed into a money box ===');
  {
    await page.goto(`${BASE}/?page=provisions`, { waitUntil: 'networkidle0' });
    await sleep(500);
    const value = await page.evaluate(() => {
      const input = document.querySelector('input[type="number"]') as HTMLInputElement | null;
      if (!input) return 'NO_INPUT';
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '-5000');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.value;
    });
    repro(
      'a money box accepts -5000 even though it is set to min=0',
      value === '-5000',
      `input value = "${value}"`,
    );
  }

  console.log('\n=== B3. The app keeps running when the device cannot save ===');
  {
    await page.goto(`${BASE}/?page=dashboard`, { waitUntil: 'networkidle0' });
    await sleep(400);
    const blocked = await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      (window as unknown as { __origSetItem: typeof Storage.prototype.setItem }).__origSetItem = original;
      Storage.prototype.setItem = function () {
        throw new DOMException('QuotaExceededError');
      };
      return true;
    });
    await sleep(300);
    const text = await page.evaluate(() => document.body.innerText);
    repro(
      'when saving fails the page still looks normal and the owner is only told via a popup',
      blocked && !/could not save|not saved|offline/i.test(text),
      'no persistent banner on the screen',
    );
  }

  await browser.close();
  console.log(`\n${reproduced} of ${checked} browser problems reproduced.`);
}
main();
