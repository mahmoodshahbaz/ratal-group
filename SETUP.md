# Ratal Group ERP — Setup Guide
**2-Day Sprint | Phase 1 | July 2026**

---

## STEP 1 — Database Schema (Supabase)

1. Open **Supabase Dashboard** → SQL Editor → New Query
2. Copy entire contents of `supabase/schema.sql` → Paste → Run
3. Copy entire contents of `supabase/seed_contractors.sql` → Paste → Run
4. Verify: Table Editor should show ~26 tables

---

## STEP 2 — Create Your First Admin User

1. Supabase Dashboard → Authentication → Users → Invite User
2. Enter email: `admin@ratal.com`
3. After user is created, go to SQL Editor and run:

```sql
UPDATE user_profiles
SET role = 'SUPERADMIN', entity_code = 'ALL', full_name = 'Mahmood Shahbaz'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@ratal.com');
```

---

## STEP 3 — Run the React App

```bash
cd C:\ratal-group
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## STEP 4 — Deploy Edge Function (Telegram Notifications)

Install Supabase CLI if needed:
```bash
npm install -g supabase
```

Login and link your project:
```bash
supabase login
supabase link --project-ref qjwqoqvbfygmymtiqfnt
```

Set secrets (replace with your actual service_role key from Supabase → Settings → API):
```bash
supabase secrets set TELEGRAM_BOT_TOKEN=8760676844:AAGvfj-caDhfxHaD-Hyv_1jpPxz5NrPEu20
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Deploy the function:
```bash
supabase functions deploy telegram-notify
```

---

## STEP 5 — Set Up Telegram Webhooks

Run `supabase/webhooks.sql` in Supabase SQL Editor.

**OR** set up via Dashboard:
- Dashboard → Database → Webhooks → Create new webhook
- For each table: `money_requests`, `purchase_orders`, `expenses`, `overtime_submissions`, `food_allowances`
- URL: `https://qjwqoqvbfygmymtiqfnt.supabase.co/functions/v1/telegram-notify`
- Events: INSERT, UPDATE
- Headers: `Authorization: Bearer <service_role_key>`

---

## STEP 6 — Build & Deploy to DigitalOcean

```bash
npm run build
# dist/ folder is ready to upload
```

Upload to DigitalOcean App Platform or serve with nginx.

---

## MOBILE FORMS — Shareable Links

| Form | URL |
|------|-----|
| Expense | `https://app.ratalgroup.com/forms/expense` |
| Food Allowance | `https://app.ratalgroup.com/forms/food-allowance` |
| Overtime | `https://app.ratalgroup.com/forms/overtime` |
| Money Request | `https://app.ratalgroup.com/forms/money-request` |

Share these links via Telegram to field teams.

---

## WHAT'S BUILT

### Database (schema.sql)
- 26 tables with full RLS policies
- Auto-numbering: MR-2026-0001, PO-2026-0001
- Updated_at triggers on all main tables
- Role-based access: SUPERADMIN > ADMIN > DEPT_HEAD > PROJECT_MANAGER > TRAVEL_AGENT > FIELD_EMPLOYEE

### React App
- Login (Arabic + English toggle)
- Entity switcher: RAT (Blue) | GWT (Green) | ACCSYS (Purple)
- Role-filtered navigation — each role sees only what they're allowed
- **17 pages**: Dashboard, Tickets, Customers, Airlines, BSP, Refunds, Projects, Contractors, Purchase Orders (multi-line), Money Requests, Invoices (ZATCA QR), Payments, Reports, Employees, Payroll, Overtime, Food Allowance
- **Invoice Print View** — proper ZATCA-compliant printable invoice with QR code

### Mobile Forms (shareable URLs)
- `/forms/expense` — full expense with photo, GPS, VAT toggle
- `/forms/food-allowance` — SAR 30/20 per day, remote check
- `/forms/overtime` — auto-calculates OT rate (Basic÷30÷8×1.5)
- `/forms/money-request` — multi-line with IBAN per line

### Edge Function (telegram-notify)
- Triggered on money_request, PO, expense, OT, food allowance inserts/updates
- Sends Telegram to right people per workflow stage
- Uses @RatalGroupBot token

---

## PENDING (Phase 1 completion)

- [ ] Add employees with their Telegram Chat IDs
- [ ] Test login and confirm entity filtering works
- [ ] Run `npm run dev` and test each page
- [ ] Deploy Edge Function with your service_role key
- [ ] Set up Supabase webhooks
- [ ] Connect DigitalOcean for hosting

---

## FILES CHANGED / CREATED

```
C:\ratal-group\
├── src/
│   ├── App.jsx                    ← REWRITTEN (routes + role-filter nav)
│   ├── main.jsx                   ← UPDATED (BrowserRouter + AuthProvider)
│   ├── lib/
│   │   └── useAuth.js             ← NEW (auth context + permission matrix)
│   ├── pages/
│   │   ├── Contractors.jsx        ← NEW
│   │   ├── InvoicePrint.jsx       ← NEW (ZATCA print view)
│   │   ├── PurchaseOrders.jsx     ← REWRITTEN (multi-line items)
│   │   └── Invoices.jsx           ← UPDATED (print button)
│   └── forms/
│       ├── FormExpense.jsx        ← NEW (mobile-first, GPS, photo)
│       ├── FormFoodAllowance.jsx  ← NEW (mobile-first)
│       ├── FormOvertime.jsx       ← NEW (auto OT calc)
│       └── FormMoneyRequest.jsx   ← NEW (multi-line IBAN)
└── supabase/
    ├── schema.sql                 ← NEW (26 tables + RLS)
    ├── seed_contractors.sql       ← NEW (Nokia, Cisco, etc.)
    ├── webhooks.sql               ← NEW (Telegram triggers)
    └── functions/
        └── telegram-notify/
            └── index.ts           ← NEW (Edge Function)
```
