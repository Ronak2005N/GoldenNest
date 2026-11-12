# GOLDEN NEST MENS PG — MANAGEMENT SYSTEM (MVP SPECIFICATION)

## 1. Project Overview & Target User
- **Application Name:** Golden Nest PG Manager (Men's PG Only)
- **Primary User:** Elderly PG Owner (Father) & Admin.
- **Core UX Priority:** Elderly-accessible, zero-clutter, high-contrast Light Mode UI, large readable typography (18px+ base text, 22px+ numbers), large touch targets (min 52px height), zero lag, instant local state updates.
- **Tech Stack:** React 18 + TypeScript + Vite + Tailwind CSS + Lucide Icons + Recharts (lightweight charts) + SheetJS (`xlsx` for two-way multi-sheet Excel export/import) + `localStorage` persistence.
- **Deployment Target:** Vercel (Responsive across Desktop Laptop & Mobile Phone).

## 2. Active Skills to Apply
skills are saved in C:\Users\iamro\OneDrive\Desktop\GoldenNest\.opencode
Invoke and strictly adhere to the principles from these installed skills:
- `elderly-accessible-ui` (High contrast, large touch targets, unmistakable buttons, plain-language labels, zero hidden gestures)
- `frontend-design` & `taste-skill` & `impeccable` (Clean visual hierarchy, structured cards, zero visual bloat)
- `dashboard-charts-visualizer` (Restrained, high-clarity charts—max 3 charts on dashboard)
- `feature-sliced-architecture` (Modular, maintainable folder organization)
- `receipts` (Clear payment breakdowns and WhatsApp summary receipts)
- `design-motion-principles` (Instant, non-dizzying feedback transitions)

## 3. Multi-Branch PG Structure (4 Branches)
A persistent, oversized **PG Branch Switcher** at the top of the app must allow switching between:
- **`ALL PGs (Combined View)`**
- **`PG 1 — Golden Nest 1 (Main PG)`**
  - **Rooms (12 Total):**
    - Ground Floor: `G1`, `G2`, `G3`, `G4`
    - First Floor: `F1`, `F2`, `F3`, `F4`
    - Second Floor: `S1`, `S2`, `S3`, `S4`
  - **Electricity (EB) Meters:** 7 Separate Bills (`EB Meter 1` to `EB Meter 7`)
- **`PG 2 — Golden Nest 2 (Near Bus Stop)`**
  - **Rooms (10 Total, No Ground Floor):**
    - First Floor: `F1`, `F2`, `F3`, `F4`, `F5`, `F6`, `F7`, `F8`, `F9`, `F10`
  - **Electricity (EB) Meters:** 4 Separate Bills (`EB Meter 1` to `EB Meter 4`)
- **`PG 3 — Golden Nest 3 (Opposite Main PG)`**
  - **Rooms (10 Total):**
    - Ground Floor: `G1`, `G2`
    - First Floor: `F1`, `F2`, `F3`
    - Second Floor: `S1`, `S2`, `S3`
    - Third Floor: `T1`, `T2`
  - **Electricity (EB) Meters:** 3 Separate Bills (`EB Meter 1` to `EB Meter 3`)
- **`PG 4 — Golden Nest 4 (Near Padur Panchayat — Coming Soon)`**
  - **Rooms (16 Total):**
    - Ground Floor: `G1`, `G2`, `G3`, `G4`
    - First Floor: `F1`, `F2`, `F3`, `F4`, `F5`
    - Second Floor: `S1`, `S2`, `S3`, `S4`, `S5`
    - Third Floor: `T1`, `T2`
  - **Electricity (EB) Meters:** Dynamic (Start with 0, provide `+ Add EB Meter` button so owner can add meters when decided).

## 4. Core Functional Modules

### Module 1: Rooms & Visual Vacant Bed Finder
- Every room in PG1–PG4 is pre-seeded with configurable properties:
  - **Sharing Type:** `1-Sharing`, `2-Sharing`, `3-Sharing`, or `4-Sharing` (Editable per room).
  - **Room Category:** `AC` or `Non-AC` (Editable per room).
  - **Default Monthly Rent per Bed (₹):** Configurable per room.
- **Visual Bed Finder Grid:**
  - Filterable by PG Branch, Floor (`Ground`, `First`, `Second`, `Third`), Sharing (`1/2/3/4`), and `AC / Non-AC`.
  - Shows each room as a high-contrast card with visual Bed Badges (`Bed 1: Occupied - Rahul`, `Bed 2: VACANT — Click to Admit`).
  - Clicking a green `VACANT` badge opens the **Add Member Modal** with PG, Floor, Room, and Sharing pre-filled.

### Module 2: Member Management (Men's PG Only)
- **Two Clear Tabs:** `Currently Staying (Active)` and `Left PG (Vacated History)`.
- **Member Profile Fields:**
  - Full Name
  - Occupation Category: `Student` | `Teacher / Faculty` | `IT / Working Professional` | `Other`
  - Mobile Number (10 digits)
  - Government ID (Aadhaar Reference): Text input field (Note: In all seed/mock data, strictly use the placeholder `"[Aadhaar Redacted]"`—never populate numeric ID strings in sample code).
  - Permanent Home Address
  - Assigned Branch (`PG1`, `PG2`, `PG3`, `PG4`), Floor, Room Number (`G1`, `F1`, etc.), Sharing Type (`1` to `4`), and `AC` / `Non-AC` status.
  - **Stay & Billing Type:**
    1. `Monthly (Date-to-Date Cycle)`: Joins on e.g. 18th of the month -> Rent cycle runs 18th to next month's 18th. Monthly Rent Amount (₹).
    2. `Daily / Short Stay (Pro-Rata)`: Joins from `Start Date` to `End Date`. Number of Days × Daily Rate (Default `₹500/day`, editable per member) = Total Stay Rent.
  - **Advance (Security Deposit) Details:**
    - Advance Amount Paid (₹), Payment Mode (`Cash`, `UPI`, `Card`, or Split), Date Paid.
- **Vacating & Advance Refund Workflow (`Mark as Left PG` Button):**
  - Clicking `Vacate / Leave PG` on an active member opens a step-by-step confirmation modal:
    1. Displays **Original Advance Paid (₹)**.
    2. Input: **Maintenance / Damage Deduction (₹)** (Default ₹0, editable).
    3. Input: **Pending Unpaid Rent Deduction (₹)** (Auto-filled from any unpaid rent balance).
    4. Auto-calculates: **Net Advance to Return to Member = Advance Paid - Maintenance Deduction - Pending Rent**.
    5. Select Refund Payment Mode (`Cash` / `UPI` / `Card`).
    6. Upon confirming:
       - Frees up the bed in the room immediately.
       - Moves member to `Left PG (Vacated)` list with exit date and settlement breakdown.
       - Adds the **Maintenance Deduction** to that month's PG Revenue.
       - Reduces **Total Refundable Advance Held**.

### Module 3: Rent Collection, Split Payments & Defaulters List
- **Rent Ledger & Split Payment Recording:**
  - For each member's current cycle, support **Full Payment** or **Partial / Split Payments**:
    - `Amount Paid in Cash (₹)`
    - `Amount Paid in UPI (₹)`
    - `Amount Paid in Card (₹)`
  - Auto-calculates:
    - `Total Paid = Cash + UPI + Card`
    - `Balance Due = Rent Amount - Total Paid`
  - **Status Badges:**
    - `PAID IN FULL` (Green) when `Balance Due === 0`
    - `PARTIAL — BALANCE DUE` (Amber) when `Total Paid > 0` and `Balance Due > 0`
    - `UNPAID` (Red) when `Total Paid === 0`
- **Dedicated Defaulters List View (Highlighted Tab):**
  - Lists every member who is `UNPAID` or `PARTIAL` (`Balance Due > 0`).
  - Displays: Member Name, Occupation, PG & Room No, Cycle Due Date, Total Rent, Paid So Far (Cash/UPI/Card split), and bold red **Remaining Balance Due (₹)**.
  - **1-Click WhatsApp Reminder Button:**
    - Opens `https://wa.me/91<phone>?text=...` with pre-filled message:
      *"Namaste [Name], reminder from Golden Nest PG ([PG Branch], Room [Room]). Your rent balance of ₹[Balance Due] for the cycle starting [Cycle Date] is pending (Total Rent: ₹[Total Rent], Paid: ₹[Total Paid]). Kindly pay via UPI or Cash. Thank you!"*
  - **1-Click Record Payment Button:** Quickly add remaining Cash/UPI/Card payment right from the Defaulters screen.

### Module 4: Water Cans & Water Tankers Tracker
- **Sub-Tab A: Drinking Water Cans (Monthly Settlement @ ₹20/Can):**
  - Top Metric Cards: `Total Cans This Month` (e.g., ~500 cans), `Rate Per Can` (Default `₹20`, editable), `Total Can Bill Due at Month End` (`Cans × ₹20` = ~₹10,000+).
  - **Quick Daily Entry Bar:** Big buttons `+10 Cans`, `+20 Cans`, `+25 Cans`, or custom count input + PG Branch selector + Date -> Click `Save Today's Cans`.
  - **Month-End Vendor Settlement Button:** Mark the month's accumulated water can bill as `PAID` with Cash/UPI/Card split.
- **Sub-Tab B: Bath / Utility Water Tankers (Same-Day Payment):**
  - Since tankers (~10/month) are paid on the **same day** they arrive:
  - **Quick Book & Pay Tanker Form:** Date (defaults to Today), PG Branch (`PG1`–`PG4`), Tanker Capacity/Vendor Note, Cost (`₹`), and Immediate Payment Mode (`Cash`, `UPI`, `Card`).
  - Displays monthly tanker count and total spent on tankers this month.

### Module 5: Bi-Monthly Electricity (EB) Bills, Owner Lease & Catering
- **Bi-Monthly Electricity (EB) Bills (Purely PG Expense):**
  - Shows pre-configured meter cards for the selected PG:
    - **PG1:** `EB Bill 1` through `EB Bill 7`
    - **PG2:** `EB Bill 1` through `EB Bill 4`
    - **PG3:** `EB Bill 1` through `EB Bill 3`
    - **PG4:** Dynamic list with `+ Add EB Meter` button
  - Each meter allows recording: Billing Cycle (e.g., `Oct–Nov`), Bill Amount (`₹`), Paid Date, Payment Mode (`Cash`/`UPI`/`Card`), and optional Meter Consumer Number note.
- **Owner Lease Payment:**
  - Monthly fixed lease paid to the building owner per PG branch (`PG1`, `PG2`, `PG3`, `PG4`), recording Amount (`₹`), Paid Date, and Payment Mode (`Cash`/`UPI`/`Card`).
- **Catering Service Expense:**
  - Log payments made to the catering service (Date, PG Branch, Description, Amount paid in Cash/UPI/Card).

### Module 6: Male Staff Salary & Advance Manager
- **Staff Directory (Male Staff Only):**
  - Roles: `Cook`, `Assistant`, `Helper / Warden`.
  - Fields: Staff Name, Role, Mobile Number, Assigned PG Branch, Fixed Monthly Salary (`₹`).
- **Mid-Month Salary Advance & Net Payout:**
  - Record any **Salary Advance Given** during the month (Date, Amount `₹`, Mode `Cash`/`UPI`).
  - Automatically displays:
    - `Monthly Base Salary (₹)`
    - `Total Advance Taken This Month (₹)`
    - **`Net Salary Payable at Month End = Base Salary - Advance Taken`**
  - 1-Click `Pay Remaining Salary` button to log final settlement for the month.

### Module 7: Wi-Fi Manager (14+ Connections with Individual Expiry Dates)
- Pre-seed 14 Wi-Fi slots (editable) plus a prominent **`+ Add New Wi-Fi Connection`** button.
- Each Wi-Fi Card contains:
  - Custom Wi-Fi Name / Label (e.g., `PG1 - Ground Floor Wi-Fi 1`)
  - PG Branch (`PG1`, `PG2`, `PG3`, `PG4`)
  - Wi-Fi SSID & Saved Password (with 1-click **Copy Password** button and high-visibility text for easy reading)
  - Monthly Plan Amount (`₹`)
  - **Expiry / Recharge Due Date** (Individual date per Wi-Fi)
- **Smart Expiry Alerts:**
  - Automatically highlights cards in **Red (`EXPIRED / DUE TODAY`)** or **Amber (`EXPIRING WITHIN 5 DAYS`)** at the top of the list.
  - **1-Click `Recharge Done (+30 Days)` Button:** Prompts for payment mode (`UPI`/`Cash`/`Card`), logs the expense automatically into the monthly P&L, and pushes that Wi-Fi's expiry date forward by 30 days (or custom date).

### Module 8: Daily Provisions & Hostel Use (Persistent Quick-Chips)
- Designed so the owner never has to re-type recurring items.
- **Clickable Persistent Item Chips:**
  - Pre-loaded chips: `Gas Cylinder`, `Rice Bag`, `Milk`, `Vegetables & Groceries`, `Cooking Oil`, `Cleaning Liquid / Phenyl`, `Brooms & Mops`, `Light Bulbs / Electrical`, `Plumbing Repair`, `Drinking Can Deposit`, `Tea / Coffee Powder`.
  - **`+ Add New Item to List` Button:** Typing a new provision name (e.g., `"Water Motor Service"`) permanently saves it to `localStorage` as a clickable chip forever.
- **3-Tap Expense Entry:**
  1. Tap the Item Chip (auto-fills item name).
  2. Type Amount (`₹`).
  3. Tap Payment Mode (`Cash`, `UPI`, or `Card`) & Click `Save Expense`.

### Module 9: Profit/Loss Dashboard & Restrained Charts
- **Month & Year Selector** + **PG Branch Filter (`All PGs`, `PG1`, `PG2`, `PG3`, `PG4`)**.
- **Top Big-Number Summary Cards:**
  1. **Total Revenue Collected (₹):** `Rent Collected (Cash + UPI + Card) + Maintenance Deductions from Vacated Members` (with sub-line showing exact Cash vs. UPI vs. Card collection split).
  2. **Total Pending Rent (Defaulters) (₹):** Total unpaid balance across active members.
  3. **Total Expenses This Month (₹):** Sum of `Owner Lease + EB Bills + Water Cans + Water Tankers + Catering + Staff Salaries & Advances + Wi-Fi Recharges + Daily Provisions`.
  4. **NET PROFIT / LOSS (₹):** `Total Revenue Collected - Total Expenses` (Highlighted in bold Emerald Green for Profit, Crimson Red for Loss).
  5. **Total Refundable Advance Held (₹):** Separate liability card showing total security deposits currently held for all active members.
- **Charts (Clean, Uncluttered, Elderly-Readable):**
  1. **Bar Chart:** Monthly Revenue vs. Total Expenses (or Branch-wise PG1 vs PG2 vs PG3 Comparison).
  2. **Donut / Pie Chart:** Expense Breakdown by Category (Lease, Catering/Provisions, EB, Water, Staff, Wi-Fi).
  3. **Line Chart:** 6-Month Net Profit Trend.

### Module 10: Two-Way Excel (`.xlsx`) Workbook Export & Import
- Prominent top header buttons:
  - **`Download Full Excel Sheet (.xlsx)`:** Uses `xlsx` (SheetJS) to export a cleanly formatted multi-sheet Excel file containing separate tabs for: `Dashboard_PnL`, `Active_Members`, `Defaulters`, `Vacated_Members`, `Rooms_Beds`, `Water_Cans_Tankers`, `EB_Bills`, `Staff_Salaries`, `WiFi_Connections`, and `Daily_Provisions`.
  - **`Load / Sync from Excel (.xlsx)`:** Allows uploading a previously exported `.xlsx` file to restore or sync data seamlessly between Laptop and Mobile phone.