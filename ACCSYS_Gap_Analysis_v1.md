# ACCSYS System — Gap Analysis Report
**Prepared:** 28 September 2026  
**Based on:** ACCSYS_System_Reference_v4 (with Mahmood's inline corrections) + full codebase survey (150+ files)

---

## HOW TO READ THIS REPORT

Each gap is numbered and tagged:

- 🔴 **CRITICAL** — Blocks a core business workflow; must be built before go-live (1 Jan 2027)
- 🟠 **HIGH** — Important feature; significant friction if missing
- 🟡 **MEDIUM** — Nice-to-have or affects reporting accuracy
- 🟢 **LOW** — Phase 2 or cosmetic

**Source tags:**
- `[DOC]` — Explicitly marked ⚠ MISSING in the v4 document
- `[CODE]` — Found by codebase survey; not mentioned in document
- `[CORRECTION]` — Mahmood's ✅ inline note that needs a code change

---

## SECTION A — CONFIRMED MISSING FEATURES (⚠ in document)

### G1 🔴 Rules Matrix in Settings `[DOC]`
**What's missing:** A visual admin UI in Settings where SUPERADMIN can enable/disable each shareable form and module per role (STAFF_DH, STAFF_PM, FIELD_EMPLOYEE, SUBCONTRACTOR, etc.) without code changes.  
**Current state:** `Settings.jsx` has 5 tabs: Company, Banking, Payroll, System, Telegram. No Rules Matrix tab. `FormLanding.jsx` reads `auth.allowedForms` from the QR token, but there is no admin page to configure which forms each role can access.  
**Impact:** Every time a new form is created or a role's access needs changing, a developer must edit code.  
**Fix needed:** New "Rules Matrix" tab in `Settings.jsx` → read/write a `form_access_rules` table keyed by `(role, form_key)`. `FormLanding.jsx` reads this table at runtime instead of hardcoded defaults.

---

### G2 🟠 Fleet Penalty Notification Mechanism `[DOC]`
**What's missing:** When a Fleet penalty (traffic fine, accident, speeding) is recorded against a driver, a push notification must be sent to that employee automatically.  
**Current state:** `Vehicles.jsx` records violations and penalties. No trigger or Supabase Edge Function sends a notification to the employee when a penalty is added.  
**Fix needed:** On INSERT into fleet penalties table → call the existing Notifications Edge Function → create notification of type `PENALTY_RECORDED` for the employee.

---

### G3 🟠 Single-Source QR Token Rules (Config-Driven) `[DOC]`
**What's missing:** QR token expiry rules, OTP handling, and session duration must all be configurable from one Settings sub-page without code changes.  
**Current state:** `QRManager.jsx` lets admins set a per-token expiry date (or leave it permanent). There is no global config for default token lifetime, auto-expiry on day end, or OTP policy.  
**Fix needed:** Add a "QR & Token Rules" section inside the System tab of Settings: default_token_lifetime_days, auto_expire_daily (boolean), allow_permanent_tokens (boolean). QRManager reads these defaults when generating new tokens.

---

### G4 🔴 "Post Opening Balances" Batch Button in Bulk Upload `[DOC]`
**What's missing:** After loading the Opening Balances sheet, a "Post Opening Balances" button must create Journal Entries for all `opening_balances` rows where `je_posted = FALSE`. JE: DR/CR the relevant ledger account; CR/DR Opening Balance Equity.  
**Current state:** `BulkUpload.jsx` imports the Opening Balances sheet into the `opening_balances` table. There is no "Post" button.  
**Impact:** Go-live balances as of 31 Dec 2026 cannot be posted. All three entities need this for 1 Jan 2027 launch.  
**Fix needed:** Add "Post Opening Balances" button to `BulkUpload.jsx` → call a Supabase RPC `post_opening_balances(entity_id)` that iterates unpublished rows and creates JEs.

---

### G5 🟠 Salary Slip Template in Template Library `[DOC]`
**What's missing:** `SalarySlip` is referenced in the Template Library section (Section 11.2) as a required template, but it is not present in the current template seedings.  
**Current state:** `TemplateLibrary.jsx` manages templates from `document_templates` table. The DB seed data does not include a SalarySlip template. `Payroll.jsx` generates payslips using a hardcoded HTML block rather than pulling from the template library.  
**Fix needed:** (1) Create a `SalarySlip` HTML template in the Template Library (similar to Money Request template). (2) `Payroll.jsx` printPayslip() should call `printDocument('SalarySlip', data)` via `templatePrint.js` instead of using the inline HTML.  
**Payslip filename format:** `EMP-001_280126001_JanSlip.pdf` (from Mahmood's correction ✅)

---

### G6 🟠 DH Acknowledgment System for Accounts Payments `[DOC]`
**What's missing:** When Accounts pays a supplier/subcon invoice (via Payments module), the DH must receive a notification and acknowledge receipt within the escalation timeline (Days 0–15 reminders, Days 15–30 warning badge, Day 30+ blocks new money requests for that party).  
**Current state:** `MoneyRequests.jsx` has a `DH_ACKNOWLEDGED` status field, and the mockup designs were completed. However, no automated reminder scheduling, escalation logic, or blocking enforcement has been built.  
**Impact:** Core acknowledgment workflow (the "gate" system) is not functional.  
**Fix needed:**  
- A Supabase Edge Function (or scheduled job) that checks all unacknowledged payments daily  
- Day 0-15: sends daily Telegram reminder to DH  
- Day 15-30: marks as WARNING (orange badge visible in Money Requests and DH Dashboard)  
- Day 30+: blocks new money requests for that supplier/subcon party  
- When DH acknowledges via DH Dashboard → clears warning + unblocks

---

### G7 🟡 Incoming PDF Parsers for ZTE, Mobi Serve, Cisco, Solutions `[DOC]`
**What's missing:** `IncomingPOImport.jsx` currently parses SBM/IBM-format PDFs. Additional parsers are needed for ZTE, Mobi Serve, Cisco, and Solutions formats.  
**Current state:** Only SBM/IBM parser is implemented. The document flags this as missing.  
**Blocker:** Sample PDFs from these clients are needed before parsers can be written.  
**Action for Mahmood:** Please provide one sample PDF from each of ZTE, Mobi Serve, Cisco, and Solutions. Once received, parsers can be built in 1–2 days per client.

---

## SECTION B — CORRECTIONS FROM MAHMOOD'S INLINE NOTES (✅ → code changes required)

### C1 🟠 Expense Claims Must Move to Operations Module `[CORRECTION]`
**Mahmood's note:** Expense Claims are admin-driven (generated from daily expense records by Admin), NOT submitted directly by employees through a QR form.  
**Current state:** `/forms/expense-claim` is a shareable form accessible via QR. `FormExpenseClaim.jsx` allows any employee to self-submit.  
**Fix needed:** Remove `/forms/expense-claim` from the shareable forms grid (FormLanding). The admin-facing `ExpensesPage.jsx` should be the primary workflow. The shareable form can remain as a read-only status viewer for employees.

---

### C2 🟠 Party Balance Pop-Up Should WARN, Not BLOCK `[CORRECTION]`
**Mahmood's note:** When selecting a party with an outstanding balance in a Money Request, show a warning pop-up but do NOT prevent the request from proceeding.  
**Current state:** `MoneyRequests.jsx` line ~331: `return false // blocked` — the party balance check blocks submission.  
**Fix needed:** Change the party balance check to a non-blocking warning modal (user can proceed after acknowledging).

---

### C3 🟡 LOCAL_SUPPLIER Uses PO Request Form for Purchases `[CORRECTION]`
**Mahmood's note:** LOCAL_SUPPLIER party type should use the Shareable PO Request form (`/forms/po-request`) to record purchases in the DB, not Expense Claims.  
**Current state:** This is a workflow clarification. `FormPORequest.jsx` exists and is wired.  
**Fix needed:** Add UI guidance/tooltip in `FormMoneyRequest.jsx` when LOCAL_SUPPLIER is selected: "For Local Supplier purchases, use the PO Request form instead."

---

### C4 🟡 Citibank Bank Discount for Nokia Invoices `[CORRECTION]`
**Mahmood's note:** Nokia pays through Citibank. A bank discount of 1.2–2% of invoice value is deducted at the time of payment.  
**Current state:** `Invoices.jsx` has a generic `discount_amount` field with no Nokia/Citibank-specific logic. No automatic discount calculation tied to client or bank.  
**Fix needed:** In `PaymentReceipts.jsx` and `Payments.jsx`, when client is Nokia (or when bank = Citibank), prompt for a bank discount %. Auto-calculate the discount amount and post a separate JE line for bank charges.

---

### C5 🟡 Expense Claims Per Project No (3 Projects = 3 Claims) `[CORRECTION]`
**Mahmood's note:** If an employee works on 3 projects in a month, they submit 3 separate expense claims (one per Job No), not one combined claim.  
**Current state:** `FormExpenseClaim.jsx` creates one claim per employee per period, without project-level separation.  
**Fix needed:** Redesign `FormExpenseClaim.jsx` to group daily expense records by Job No and create one claim record per (employee, period, job_no) combination.

---

### C6 🟡 Expense Claims Max 30 Lines; 50+ Lines = 2 Forms, Same Reference `[CORRECTION]`
**Mahmood's note:** Each expense claim form has a maximum of 30 line items. If an employee has 50 expenses, they submit 2 forms with the same reference number.  
**Current state:** No line limit is enforced.  
**Fix needed:** Add 30-line limit enforcement in the expense claim submission. If records exceed 30, auto-split into Claim A and Claim B with suffix (`REF-001-A`, `REF-001-B`).

---

### C7 🟡 Expense Claims NOT Connected to Payroll `[CORRECTION]`
**Mahmood's note:** Expense Claims settlement is a separate Finance workflow (Finance approves → pays the balance). It does NOT feed Payroll.  
**Current state:** Based on codebase review, Payroll.jsx does not pull from expense_claims — this appears already correct. Verify no accidental linkage was added.  
**Action:** Confirm `Payroll.jsx` does not reference expense_claims or expense_records in its calculation.

---

### C8 🟡 VENDOR Party Type = Cisco, Huawei, Juniper, HP — Not Expense Claims `[CORRECTION]`
**Mahmood's note:** VENDOR type is reserved for major equipment vendors (Cisco, Huawei, Juniper, HP). Expense claims are not applicable to vendors.  
**Current state:** Party balance pop-up and expense claim workflows do not differentiate vendor type.  
**Fix needed:** In the expense claim flow, if a party type is VENDOR, do not show it as a valid payee. Add a tooltip or filter.

---

## SECTION C — GAPS FOUND BY CODEBASE SURVEY (not in document)

### N1 🔴 Vacation/Leave NOT Wired into Payroll Calculation `[CODE]`
**What's missing:** When an employee takes unpaid leave, the payroll calculation should deduct the proportional days from basic salary. Approved leave should also affect working days count.  
**Current state:** `Payroll.jsx` calculates salary based on fixed monthly salary with no leave deduction logic. `Vacations.jsx` manages leave requests and approvals but there is no bridge from approved leave → payroll deduction for unpaid days. No `days_absent` or `unpaid_days` field is pulled into the payroll run.  
**Fix needed:** Payroll run should: (1) query approved leave records for the pay period, (2) count unpaid leave days, (3) deduct `(basic_salary / 30) × unpaid_days` from gross pay.

---

### N2 🔴 EOSB Offboarding Not Automated `[CODE]`
**What's missing:** When an employee is terminated or resigns, the system should: (1) stop future payroll runs for that employee, (2) calculate final EOSB (End of Service Benefits) automatically, (3) create the settlement JE, (4) mark the employee as inactive.  
**Current state:** `Loans.jsx` has a manual EOS Calculator tab — a user can input values and see the EOSB calculation. But there is no automated offboarding trigger, no JE creation, and no Payroll exclusion mechanism.  
**Fix needed:** Add an "Offboard Employee" action in `Employees.jsx` → triggers: (1) set employee status to INACTIVE, (2) auto-populate EOS Calculator with actual join date + basic salary, (3) create EOSB JE on confirmation, (4) exclude from future payroll runs.

---

### N3 🟠 Expense Claim Grace Period Not Implemented `[CODE]`
**What's missing:** If an employee misses the September claim deadline (25th Sep), they get a one-month grace window to submit September + October together by end of October. After October 31st with no submission → blocked. Block lifts only after submission AND Accounts confirms physical receipts.  
**Current state:** `FormExpenseClaim.jsx` has a simple cutoff rule: after 25th → force previous month. There is no grace period logic, no two-month bundled claim, and no blocking mechanism after the grace window expires.  
**Fix needed:** Add grace period logic: if previous month has unsubmitted expenses, allow current + previous month bundled claim. After 30 days of no submission → `claim_blocked = true` on employee record → block all shareable forms until Admin manually unblocks after physical receipt confirmation.

---

### N4 🟠 DH Escalation Auto-Reminders Not Built `[CODE]`
**What's missing:** The full escalation pipeline for DH acknowledgment of supplier/subcon/contra transfer payments:
- Day 0: Payment recorded → Notification sent to DH
- Days 1–15: Daily reminder (Telegram + in-app)
- Days 15–30: WARNING badge appears on party in Money Requests, DH Dashboard shows orange/red indicator
- Day 30+: BLOCKED — that party cannot be selected in new money requests

**Current state:** The mockup was designed. `MoneyRequests.jsx` has `DH_ACKNOWLEDGED` status. `FieldPayments.jsx` has `ACKNOWLEDGED` status. But no scheduled job or Edge Function sends daily reminders, escalates badges, or enforces the Day 30 block against specific parties.  
**Fix needed:** Supabase Edge Function (cron, daily) that checks unacknowledged payment records and fires reminders/escalation logic per the timeline above.

---

### N5 🟠 FieldNotifications Missing Required Notification Types `[CODE]`
**What's missing:** Section 11.4 of the document lists 6 required notification types. Only 3 are present in `FieldNotifications.jsx`.

| Notification Type | In App? |
|---|---|
| Salary Credited | ❌ Missing — TYPE_META has no `SALARY_CREDITED` |
| Penalty Recorded | ❌ Missing — no `PENALTY_RECORDED` type |
| Money Request Approved | ✅ (ADVANCE_ISSUED covers this) |
| Expense Claim Approved | ✅ (CLAIM_APPROVED) |
| Leave Approved/Rejected | ❌ Missing — no `LEAVE_APPROVED` / `LEAVE_REJECTED` types |
| Document Expiry Alert | ❌ Missing — no `DOC_EXPIRY` type |

**Fix needed:** Add `SALARY_CREDITED`, `PENALTY_RECORDED`, `LEAVE_APPROVED`, `LEAVE_REJECTED`, `DOC_EXPIRY` to `TYPE_META` in `FieldNotifications.jsx` and to the Notifications Edge Function dispatch logic.

---

### N6 🟡 Food Allowance Daily Rate Should Pull from Employee Record `[CODE]`
**What's missing:** The document states the daily food allowance rate is "non-editable — pulled from employee record. Range SAR 20–100."  
**Current state:** `FormFoodAllowance.jsx` hardcodes `daily_rate: 30` as a default. The rate is not fetched from the employee's `food_allowance_rate` field.  
**Fix needed:** (1) Confirm `employees` table has `food_allowance_rate` column. (2) `FormFoodAllowance.jsx` should fetch and display the employee's rate on load; the field must be read-only.

---

### N7 🟡 Compliance Document Expiry → Notification Not Triggered `[CODE]`
**What's missing:** When an employee's Iqama, Passport, or Driving License is expiring within 30 days, the system should send a `DOC_EXPIRY` notification automatically.  
**Current state:** `Compliance.jsx` displays expiry dates with colour-coded alerts. No automated notification is sent to HR or the employee.  
**Fix needed:** Supabase scheduled function (daily) → query compliance records expiring within 30 days → create notification type `DOC_EXPIRY` for each affected employee + HR admin.

---

### N8 🟡 SelfService Missing Notification Viewing `[CODE]`
**What's missing:** Section 11 of the document says employees should be able to view salary credit confirmations and pending acknowledgments from Self Service.  
**Current state:** `SelfService.jsx` has 4 tabs: Payslip, Leaves, Loans, Overtime. No notifications tab. Employees cannot see their own notification history or pending payment confirmations from Self Service.  
**Fix needed:** Add a "Notifications" tab to `SelfService.jsx` showing the employee's own notification history (filtered by their `employee_id`).

---

### N9 🟡 Fixed Assets Monthly Depreciation JE Not Auto-Generated `[CODE]`
**What's missing:** Section 9.2 states "Monthly depreciation JE auto-generated via Recurring Journals."  
**Current state:** `FixedAssets.jsx` has the depreciation calculation logic (`calcMonthlyDepr()`). `RecurringJournals.jsx` exists. But there is no link between them — Fixed Assets do not create recurring journal entries automatically.  
**Fix needed:** When a fixed asset is activated, create a Recurring Journal entry for monthly depreciation. Or add a "Post Depreciation" button in `FixedAssets.jsx` that creates JEs for all assets for the selected month.

---

### N10 🟡 Budget Module: Departmental Budget Lines Not Linked to Payroll/HR `[CODE]`
**What's missing:** The document states budget lines include Labour, Food, Overtime, Subcontracting. Labour should reflect actual payroll costs; Overtime should pull from approved OT records.  
**Current state:** `Budget.jsx` pulls actual vs budget from journal entries (account-level). It does not have a direct feed from Payroll totals or OT approvals — it relies on JEs having been posted correctly.  
**Fix needed:** This is mostly correct by design (all costs flow through JEs). Verify that Payroll JEs post to the correct COA account codes that Budget uses for "Labour" lines. Document this mapping.

---

### N11 🟡 Payslip Filename Format Not Standardized `[CODE]`
**Mahmood's correction:** Payslip filename must follow `EMP-001_280126001_JanSlip.pdf` format.  
**Current state:** `Payroll.jsx` generates filenames ad-hoc. The exact format from the document (`{employee_id}_{date_stamp}_{MonthSlip}.pdf`) is not enforced.  
**Fix needed:** Standardize filename generation in `Payroll.jsx` printPayslip() to match the exact format.

---

### N12 🟡 Contra Transfer Acknowledgment (ANB-77 / ANB-39) `[CODE]`
**What's missing:** The DH acknowledgment gate (G6 above) applies specifically to contra transfers between ANB-77 and ANB-39. These contra transfers appear in `FormFieldPayment.jsx` as card selections, but when Accounts records an ANB-77 → ANB-39 transfer, there is no DH acknowledgment trigger.  
**Current state:** `FieldPayments.jsx` records field payment sessions with card assignments. There is no separate contra transfer acknowledgment record type that feeds the escalation pipeline.  
**Fix needed:** When a contra transfer is recorded in `FieldPayments.jsx` or `Payments.jsx`, create an acknowledgment record for the DH of the relevant department. Apply the same Day 0/15/30 escalation (same as G6).

---

## SECTION D — PHASE 2 ITEMS (document explicitly defers these)

### P1 🟢 Excel UserForms Integration
**Document note:** Phase 2 — users fill employee/contractor data in Excel; form submits directly to DB. Not in current scope.

### P2 🟢 Invoice Types 6–10
**Pending Mahmood confirmation on what invoice types 6–10 are.** Current `Invoices.jsx` handles types 1–5 (Standard, Credit Note, Proforma, Retention Release, Milestone). Provide the remaining types when ready.

### P3 🟢 Project Cost Summary Report
**Document status:** "Planned" — Budget vs Actual per Job No as a Report. `Budget.jsx` partially covers this but not as a named Report.

### P4 🟢 Employee Deployment Report  
**Document status:** "Planned" — Who is on which site on which dates.

### P5 🟢 Vehicle Expiry Report  
**Document status:** "Planned" — Insurance/MVPI/Registration/Saher expiring in N days. `Compliance.jsx` covers employees; a vehicle-specific version is needed.

### P6 🟢 Outstanding Money Request Pools Report  
**Document status:** "Planned" — Unspent project cash by Job No.

---

## SECTION E — SUMMARY TABLE

| # | Gap | Priority | Status |
|---|---|---|---|
| G1 | Rules Matrix in Settings | 🔴 CRITICAL | Not built |
| G2 | Fleet Penalty Notifications | 🟠 HIGH | Not built |
| G3 | QR Token Rules (config-driven) | 🟠 HIGH | Partial (per-token only) |
| G4 | Post Opening Balances button | 🔴 CRITICAL | Not built |
| G5 | Salary Slip Template | 🟠 HIGH | Not in Template Library |
| G6 | DH Acknowledgment (Accounts payments) | 🔴 CRITICAL | Not built |
| G7 | ZTE/Mobi/Cisco/Solutions PDF parsers | 🟠 HIGH | Awaiting sample PDFs |
| C1 | Expense Claims → Operations (not shareable) | 🟠 HIGH | Needs code change |
| C2 | Party balance = WARN not BLOCK | 🟠 HIGH | Needs 1-line code fix |
| C3 | LOCAL_SUPPLIER → PO Request form | 🟡 MEDIUM | UI guidance needed |
| C4 | Citibank/Nokia bank discount | 🟡 MEDIUM | Generic field exists; no logic |
| C5 | Expense Claims per Project No | 🟡 MEDIUM | Needs redesign |
| C6 | Expense Claims 30-line limit | 🟡 MEDIUM | Not enforced |
| C7 | Expense Claims NOT in Payroll | 🟡 MEDIUM | Confirm (likely OK) |
| C8 | VENDOR type filter from expense claims | 🟡 MEDIUM | UI filter needed |
| N1 | Leave/Vacation → Payroll deduction | 🔴 CRITICAL | Not built |
| N2 | EOSB automated offboarding | 🔴 CRITICAL | Manual calc only |
| N3 | Expense Claim Grace Period | 🟠 HIGH | Not implemented |
| N4 | DH Escalation auto-reminders | 🟠 HIGH | Not built |
| N5 | Missing notification types (5 types) | 🟠 HIGH | 4 types missing |
| N6 | Food Allowance rate from employee record | 🟡 MEDIUM | Hardcoded at SAR 30 |
| N7 | Compliance expiry → auto notification | 🟡 MEDIUM | Not built |
| N8 | SelfService: Notifications tab | 🟡 MEDIUM | Tab missing |
| N9 | Fixed Assets → recurring depreciation JE | 🟡 MEDIUM | Not auto-linked |
| N10 | Budget: Labour line ↔ Payroll COA mapping | 🟡 MEDIUM | Verify mapping |
| N11 | Payslip filename format | 🟡 MEDIUM | Not standardized |
| N12 | Contra transfer DH acknowledgment | 🟡 MEDIUM | Not built |

---

## RECOMMENDED BUILD ORDER (before 1 Jan 2027 go-live)

**Sprint 1 — Critical blockers:**
1. G4: Post Opening Balances button (needed on Day 1)
2. N1: Leave → Payroll deduction (needed for first payroll run)
3. N2: EOSB offboarding (needed before any employee leaves)
4. G6 + N4: DH Acknowledgment system + escalation logic

**Sprint 2 — Core workflow corrections:**
5. C2: Party balance warn-not-block (1-line fix)
6. G1: Rules Matrix in Settings
7. C1: Move Expense Claims to Operations admin flow
8. N3: Expense Claim grace period
9. G5: Salary Slip template

**Sprint 3 — Notifications & compliance:**
10. N5: Add missing notification types
11. G2: Fleet penalty notification
12. N7: Compliance expiry auto-notification
13. G3: QR token config in Settings

**Sprint 4 — Corrections & reports:**
14. C5/C6: Expense claim per-project + 30-line limit
15. N9: Fixed Asset depreciation JEs
16. C4: Citibank discount logic
17. N6: Food allowance rate from employee record
18. N8: SelfService notifications tab
19. N11: Payslip filename format
20. N12: Contra transfer acknowledgment

**Awaiting input (can run in parallel):**
- G7: PDF parsers → waiting for sample PDFs from Mahmood

---

*End of Gap Analysis. Please review and confirm priority order before coding begins.*
