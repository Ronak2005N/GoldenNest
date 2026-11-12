import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const EXECUTABLE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
const BASE = 'http://localhost:4173';

const browser = await puppeteer.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 400));

await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    (b.textContent || '').includes('Add New Member'),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 500));

const measure = async (page, mode) => {
  const result = await page.evaluate(async (legacy) => {
    const scroller = document.querySelector('[role="dialog"] .overflow-y-auto');
    if (!scroller) return { error: 'no scroller' };
    const run = async (withBlur) => {
      const s = document.createElement('style');
      if (withBlur) {
        s.textContent =
          '.scrim-in{backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}' +
          '.glass-panel{backdrop-filter:blur(22px) saturate(1.5);-webkit-backdrop-filter:blur(22px) saturate(1.5)}';
        document.head.appendChild(s);
      }
      // warm-up frames so the first measurement is not a cold-start artefact
      for (let i = 0; i < 30; i += 1) {
        scroller.scrollTop += 18;
        await new Promise((r) => requestAnimationFrame(r));
      }
      const frames = [];
      let last = performance.now();
      let raf;
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      for (let i = 0; i < 90; i += 1) {
        scroller.scrollTop += 18;
        await new Promise((r) => requestAnimationFrame(r));
      }
      cancelAnimationFrame(raf);
      s.remove();
      const sorted = frames.slice(5).sort((a, b) => a - b);
      return {
        avgMs: Number((sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2)),
        p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
      };
    };
    return run(legacy);
  }, mode);
  return result;
};

console.log('modal scroll (old, full-page blur):  ', JSON.stringify(await measure(page, true)));
console.log('modal scroll (now, no viewport blur):', JSON.stringify(await measure(page, false)));
console.log('modal scroll (old again):             ', JSON.stringify(await measure(page, true)));
console.log('modal scroll (now again):             ', JSON.stringify(await measure(page, false)));

// Same probe on the whole page (rooms grid with many cards)
await page.goto(`${BASE}/?page=rooms`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 500));
const pageScroll = await page.evaluate(async () => {
  const frames = [];
  let last = performance.now();
  let raf;
  const tick = () => {
    const now = performance.now();
    frames.push(now - last);
    last = now;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  for (let i = 0; i < 90; i += 1) {
    window.scrollBy(0, 24);
    await new Promise((r) => requestAnimationFrame(r));
  }
  cancelAnimationFrame(raf);
  const sorted = frames.slice(5).sort((a, b) => a - b);
  return {
    avgMs: Number((sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2)),
    p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
  };
});
console.log('page scroll:', JSON.stringify(pageScroll));

// Typing probe: how long does the form take to react to one keystroke?
await page.goto(`${BASE}/?page=members`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    (b.textContent || '').includes('Add New Member'),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 400));
const typing = await page.evaluate(async () => {
  const input = document.querySelector('[role="dialog"] input[placeholder="Type the full name"]');
  if (!input) return { error: 'no input' };
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  const times = [];
  for (let i = 0; i < 20; i += 1) {
    const t0 = performance.now();
    setter?.call(input, `Ravi Kumar ${i}`);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return {
    medianMs: Number(times[Math.floor(times.length / 2)].toFixed(2)),
    p95Ms: Number(times[Math.floor(times.length * 0.95)].toFixed(2)),
  };
});
console.log('typing latency:', JSON.stringify(typing));

await browser.close();
