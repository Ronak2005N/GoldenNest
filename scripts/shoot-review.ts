/**
 * Batched visual capture for the frosted-glass restyle.
 * Shoots every page at desktop + mobile, records JS errors and overflow.
 * Run: npx tsx scripts/shoot-review.ts   (requires `npm run preview` on :4173)
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:4173';
const PAGES = ['dashboard', 'rooms', 'members', 'rent', 'water', 'eb', 'staff', 'wifi', 'provisions'];
const OUT = path.join('.impeccable', 'review');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const EXECUTABLE = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!EXECUTABLE) throw new Error('No Edge/Chrome found.');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });

  let errors = 0;
  for (const vp of [
    { tag: 'desktop', width: 1440, height: 900 },
    { tag: 'mobile', width: 390, height: 844 },
  ]) {
    for (const id of PAGES) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height });
      const errs: string[] = [];
      page.on('pageerror', (e) => errs.push(String(e)));
      await page.goto(`${BASE}/?page=${id}`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE}/?page=${id}`, { waitUntil: 'networkidle0' });
      await sleep(700); // let the lazy chart chunk land
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      const name = `${vp.tag}-${id}.png`;
      await page.screenshot({ path: path.join(OUT, name), fullPage: vp.tag === 'desktop' });
      if (errs.length || overflow) errors += 1;
      console.log(
        `${errs.length || overflow ? 'FAIL' : 'PASS'}  ${name}` +
          (errs.length ? `  js: ${errs.join(' | ')}` : '') +
          (overflow ? '  horizontal overflow' : ''),
      );
      await page.close();
    }
  }

  // one modal shot (frosted overlay) at desktop
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE}/?page=rooms`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/?page=rooms`, { waitUntil: 'networkidle0' });
    await sleep(500);
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => (b.getAttribute('aria-label') || '').includes('tap to admit'),
      ) as HTMLElement | undefined;
      if (btn) btn.click();
      return !!btn;
    });
    await sleep(500);
    const hasDialog = !!(await page.$('[role="dialog"]'));
    await page.screenshot({ path: path.join(OUT, 'desktop-modal.png') });
    console.log(`${clicked && hasDialog ? 'PASS' : 'FAIL'}  desktop-modal.png`);
    if (!clicked || !hasDialog) errors += 1;
    await page.close();
  }

  // bulk member entry (paste mode with rows, so the preview is visible)
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
    await sleep(400);
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        (b.textContent || '').includes('Add Many Members'),
      ) as HTMLElement | undefined;
      if (btn) btn.click();
      return !!btn;
    });
    await sleep(400);
    await page.evaluate(() => {
      const ta = document.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement | null;
      if (!ta) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(
        ta,
        [
          'Name\tMobile\tRoom\tBed\tRent\tAdvance',
          'Ravi Kumar\t9845012345\tG1\t1\t4500\t2000',
          'Suresh Babu\t9845076543\tG1\t2\t4500\t0',
          'Unknown Room\t9845099999\tZZ9\t1\t4500\t0',
        ].join('\n'),
      );
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, 'desktop-bulk.png') });
    const hasPreview = await page.evaluate(() =>
      (document.body.innerText || '').includes('READY TO IMPORT'),
    );
    console.log(`${clicked && hasPreview ? 'PASS' : 'FAIL'}  desktop-bulk.png`);
    if (!clicked || !hasPreview) errors += 1;
    await page.close();
  }

  await browser.close();
  console.log(errors === 0 ? '\nCAPTURE: ALL PASS' : `\nCAPTURE: ${errors} FAILURE(S)`);
  process.exit(errors === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
