# PRODUCT — Golden Nest PG Manager

## Product truth
Golden Nest PG Manager is a single-owner, local-first web app for running a men's paying-guest
business with four branches in and around Padur, Tamil Nadu. The sole daily user is the owner — an
elderly man who uses it on a laptop at home and on an Android phone at the PGs. Every design
decision is subordinated to his confidence: he must always know where he is, what happened, and
what to do next, without help.

## Modes
- **Operate** (dominant): daily record-keeping — rent in, expenses out, beds, staff, Wi-Fi.
- **Read** (secondary): the monthly P&L dashboard and charts.
There is no Persuade surface. No marketing language anywhere in the UI.

## Scope (what the product does)
1. Four pre-seeded PG branches with their exact room numbers (PG1: 12 rooms + 7 EB meters;
   PG2: 10 rooms, no ground floor, + 4 meters; PG3: 10 rooms + 3 meters; PG4: 16 rooms,
   dynamic meters, marked "Coming Soon").
2. Rooms with sharing (1–4), AC/Non-AC, editable rent, and a visual bed grid where green =
   vacant and admits a member in one tap.
3. Members (men only) with monthly date-to-date cycles and daily pro-rata stays, advance
   deposits, partial/split (Cash + UPI + Card) rent payments, receipts, WhatsApp reminders,
   and a 3-step vacate wizard that settles the advance refund.
4. Water cans (daily log, ₹20/can month-end settlement) and tankers (same-day payment).
5. EB meter bills, owner lease, catering expenses.
6. Male staff (Cook / Assistant / Helper) with advances and auto net-payable salary.
7. 14 Wi-Fi connections with passwords, copy button, per-connection expiry and +30-day recharge.
8. Persistent provision chips saved forever, 3-tap expense entry, with quantity, price per unit
   and supplier; goods may be bought **on credit** and the supplier is paid later.
9. P&L dashboard: 5 big-number cards + bar (branch comparison), donut (expense breakdown),
   line (6-month net profit) charts. A finished month is reported **as of its last day**, and a
   month the owner has **closed** cannot be changed by accident until it is unlocked.
10. Two-way `.xlsx` backup/restore (SheetJS), plus reset-to-sample / reset-to-empty.
All state lives in `localStorage`. Zero server, zero database.

## Non-negotiable constraints
- **Privacy:** seed/sample records never contain numeric Aadhaar/ID digits — always
  `"[Aadhaar Redacted]"`.
- **Business math is fixed by the owner:** refund = advance − maintenance − unpaid rent;
  net salary = monthly salary − advances; cans settle at month end; tankers pay same day.
- **Nothing is scheduled.** There is no cron and no stored "paid for October" flag. Every
  period is derived from today's date, so a new month needs no data entry and no update job.
- **The app never guesses a debt.** Months before the app kept its first record for a member
  are unknown, not unpaid. Only months it can see are claimed.
- **A PG's water bill is a PG's bill.** Settling PG1's can bill never marks PG2 as paid.
- **A person who has left is not paid forever.** Staff salary stops accruing from the month
  after they leave; Wi-Fi and EB carry their own next-due dates instead of a fixed 30 days.
- **A closed month is final.** Nothing can be back-dated into it, voided inside it or edited in
  it until the owner unlocks it. Closing a month never deletes a record.
- **Money that had not arrived is not money.** Goods bought on credit and an unpaid electricity
  bill are liabilities, not cash; a finished month is reported on its last day, so a late payment
  never rewrites what that month looked like.

## Assumptions made (from the build brief, flagged for review)
- Sample members and staff are NOT pre-loaded — the owner confirmed on 12 November 2026 that fresh
  installs start with zero members and staff ("start real records"). Rooms, EB meters, Wi-Fi, water,
  lease, catering and provision sample rows still seed so every screen demonstrates itself.
  Member import/export is verified against the sample backup
  `GoldenNest_PG_Backup_2026-11-11.xlsx` at the project root (Aadhaar redacted throughout).
- Accent colour: deep marigold `#B45309` (user choice) on warm white `#F8FAFC`, ink `#0F172A`.
- Default daily rate ₹500/day, default can rate ₹20/can, both editable.
- Staff payroll is accrued in full every month for the P&L; advances/payouts track hand-over.
- Water can expense accrues in the month the cans were delivered; settlement records payment.

## Experience principles (elderly-accessible-ui, enforced in code)
- Body text ≥ 18px (root font-size set to 18px), key numbers 22–28px bold, tabular numerals.
- Every button/touch target ≥ 52px tall; no icon-only controls without text labels.
- Daylight high-contrast light theme; status badges always colour **plus** words
  (PAID IN FULL / PARTIAL / UNPAID), never colour alone.
- Plain-English labels next to every term: "Defaulters (Unpaid Rent)", "Left PG (Vacated)".
- Written-out dates ("18 November 2026"), explicit outcomes after every save
  ("…Bed 2 is now free"), confirm dialogs before destructive actions.
- Motion: transitions ≤ 150–200ms, press feedback only; `prefers-reduced-motion` honoured.
- Navigation always visible: labelled sidebar on laptop, labelled bottom nav on phone;
  oversized persistent PG branch switcher at the top of every screen.
