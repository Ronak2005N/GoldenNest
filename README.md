# Golden Nest PG Manager

Men's PG management for 4 branches (PG1 Main, PG2 Bus Stop, PG3 Opposite Main, PG4 Padur
Panchayat) — built for an elderly owner, on laptop and phone, with zero server/database:
everything is saved in the browser (`localStorage`) and moved between devices with a two-way
Excel (`.xlsx`) backup.

## Run

```bash
npm install
npm run dev      # local development
npm run build    # type-check + production build (must pass with zero errors)
npm run preview  # serve the production build
```

## Deploy to Vercel

1. Push this folder to a Git repository (or use `vercel` CLI).
2. Import the project — Vercel auto-detects Vite. Framework: **Vite**, Build: `npm run build`,
   Output: `dist`. No environment variables needed.
3. Deploy. The app is fully static; nothing runs on the server.

## Screens (9 tabs)

| Tab | What it does |
|---|---|
| Dashboard | Month/branch P&L: 5 big-number cards + bar, donut and line charts |
| Rooms & Vacant Beds | Exact room numbers per PG, filters, green vacant beds → one-tap admit |
| Members | Active members + "Left PG (Vacated)" history, add/payment/vacate modals |
| Rent & Defaulters | Split payments (Cash/UPI/Card), defaulters list, WhatsApp reminders, receipts |
| Water Cans & Tankers | Daily can log + ₹20/can month-end settlement **per PG**; same-day tanker payments |
| EB Bills, Lease & Catering | Per-branch meter cards (7/4/3/dynamic) with **next-bill due dates**, owner lease, catering |
| Staff Salary & Advances | Cook/Assistant/Helper, advances, auto net salary payable, **mark as left** |
| Wi-Fi Manager | 14 connections, copy password, expiry alerts, recharge of any length (30/60/90/365 days) |
| Daily Provisions | Persistent item chips + 3-tap expense entry, quantity & unit price, supplier, **buy on credit** and pay the supplier later |

## Business rules implemented exactly

- **Cycles:** monthly date-to-date (join on the 18th → cycle 18th→18th) and daily pro-rata
  (days × rate, default ₹500/day).
- **The month rolls over by itself:** nothing is stored as "paid for October". The app works out
  which cycle is running from today's date, so on the 18th of the next month every member
  automatically becomes due again. No job, no cron, no data to update.
- **Extra money carries forward by itself:** if a member pays ₹2,000 more than the rent, that
  ₹2,000 is applied to the next month's bill automatically.
- **Old dues are not forgotten:** a month left unpaid stays on the defaulter list with its own
  amount instead of disappearing when the month rolls over. Months from before the app started
  keeping records for that member are shown as unknown, never as unpaid — the app never invents
  a debt.
- **Pay the month in advance:** the Record Payment screen asks which month the money is for —
  this month, the next month, or a month that is still open from before.
- **Rent status:** `PAID IN FULL` (green) / `PARTIAL — BALANCE DUE` (amber) / `UNPAID` (red);
  a balance > 0 always stays on the defaulters list.
- **Vacate:** Refund = Advance + extra rent paid − Maintenance deduction − Pending rent;
  maintenance is logged as PG revenue; bed frees immediately; member moves to vacated history.
- **Water:** cans accrue at ₹20/can (editable) and settle at month end **per PG** — paying PG1's
  bill never marks PG2 as paid. Tankers are paid the same day.
- **EB:** every meter carries its billing cycle (usually every 2 months) and a next-bill due date;
  recording a bill pushes the due date forward automatically.
- **Staff:** Net payable = monthly salary − advances − already paid; 1-click pay remaining.
  A person marked as left stops counting from the month after they left.
- **Wi-Fi:** individual expiry dates; red if expired, amber if within 5 days; a recharge adds
  however many days the plan is worth and logs the expense.
- **Dashboard:** pending rent for a finished month is measured on the **last day of that month**,
  so an old month shows what was outstanding back then — a rent paid in November for October never
  makes October look settled. The month being reported can be given as a month (`2026-10`) or a day.
- **Provisions can be bought on credit:** quantity, price per unit and supplier are recorded with
  every entry. Goods bought on credit never touch that month's cash — they stay a liability until
  the supplier is paid, and the payment to the supplier is the cash row (exactly like the water can
  vendor).
- **Closed months are final:** a month the owner has closed cannot be changed by accident — no
  back-dated payment, no void, no expense edit inside it. Unlocking is one click, and closing a
  month never deletes anything.
- **Privacy:** fresh installs start with **no sample people** (owner decision, 12 Nov 2026 —
  zero members and staff); every ID field defaults to `"[Aadhaar Redacted]"` — never a numeric
  ID. Rooms, Wi-Fi, water, EB, lease, catering and provision rows still seed so screens
  demonstrate themselves.

## Tests

```bash
npm run test:p0        # rent ledger, revenue, defaulters, records are never rewritten
npm run test:p1        # safe Excel import (merge, never delete) + import preview
npm run test:p2        # staff proration, EB accrual, Wi-Fi plan prices, shared costs
npm run test:p3        # staff advance carry-over, water settlements as cash, storage-full banner
npm run test:p4        # provisions & credit, as-of arrears, month locking, Excel losslessness
npm run test:rent      # rent-cycle maths: rollover, carry-forward, old dues, pay-in-advance
npm run test:month     # staff leaving, per-PG water settlement, month-scoped dashboard
npm run test:excel     # two-way .xlsx round-trip against the owner's real backup file
npm run test:audit     # the standing list of suspected problems: how many are still there
npm run test:ui        # browser smoke test (needs `npm run preview` running on :4173)
npm run test:ops       # browser test: edit member, void a payment, credit purchase, month lock
npm run test:safety    # browser test: damaged-file recovery, safe import, storage-full warning
```

## Excel backup

`Download Full Excel Sheet (.xlsx)` exports every view plus the supporting data tables needed for
a lossless restore (including `Rent_History`, `Provision_Settlements` and `Closed_Months`).
`Load / Sync from Excel (.xlsx)` **merges** the file into the device: records are added or
updated, records that are only on the device are kept, and **nothing is ever deleted** — the owner
sees a preview of exactly what will change before confirming. `Dashboard_PnL` and `Defaulters`
are read-only views inside the workbook. Older backup files (saved before a column existed) still
load: the missing fields simply keep their old meaning.

## Code layout (feature-sliced)

```
src/
  app/        shell, routing-by-tab, store (localStorage state, seed data, selectors)
  entities/   member rent/cycle math (shared business rules)
  modules/    members (modals), excel-sync (two-way xlsx engine)
  pages/      the 9 screens
  shared/     ui kit (elderly-accessible primitives) + lib (format, dates, whatsapp)
```
