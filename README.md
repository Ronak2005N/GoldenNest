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
| Water Cans & Tankers | Daily can log + ₹20/can month-end settlement; same-day tanker payments |
| EB Bills, Lease & Catering | Per-branch meter cards (7/4/3/dynamic), owner lease, catering |
| Staff Salary & Advances | Cook/Assistant/Helper, advances, auto net salary payable |
| Wi-Fi Manager | 14 connections, copy password, expiry alerts, +30-day recharge |
| Daily Provisions | Persistent item chips + 3-tap expense entry |

## Business rules implemented exactly

- **Cycles:** monthly date-to-date (join on the 18th → cycle 18th→18th) and daily pro-rata
  (days × rate, default ₹500/day).
- **Rent status:** `PAID IN FULL` (green) / `PARTIAL — BALANCE DUE` (amber) / `UNPAID` (red);
  balance > 0 always stays on the defaulters list.
- **Vacate:** Refund = Advance − Maintenance deduction − Pending rent; maintenance is logged
  as PG revenue; bed frees immediately; member moves to vacated history.
- **Water:** cans accrue at ₹20/can (editable) and settle at month end with a split payment;
  tankers are paid the same day.
- **Staff:** Net payable = monthly salary − advances − already paid; 1-click pay remaining.
- **Wi-Fi:** individual expiry dates; red if expired, amber if within 5 days; recharge pushes
  expiry +30 days and logs the expense.
- **Privacy:** fresh installs start with **no sample people** (owner decision, 12 Nov 2026 —
  zero members and staff); every ID field defaults to `"[Aadhaar Redacted]"` — never a numeric
  ID. Rooms, Wi-Fi, water, EB, lease, catering and provision rows still seed so screens
  demonstrate themselves.

## Excel backup

`Download Full Excel Sheet (.xlsx)` exports 21 tabs (the 10 required views plus the supporting
data tables needed for a lossless restore). `Load / Sync from Excel (.xlsx)` replaces the
current data with the file's contents after a confirmation. `Dashboard_PnL` and `Defaulters`
are read-only views inside the workbook.

## Code layout (feature-sliced)

```
src/
  app/        shell, routing-by-tab, store (localStorage state, seed data, selectors)
  entities/   member rent/cycle math (shared business rules)
  modules/    members (modals), excel-sync (two-way xlsx engine)
  pages/      the 9 screens
  shared/     ui kit (elderly-accessible primitives) + lib (format, dates, whatsapp)
```
