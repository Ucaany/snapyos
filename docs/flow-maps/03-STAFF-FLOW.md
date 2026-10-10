# 03 — Staff Read-Only Flow

**Role**: `business_members.role = 'staff'` (business role)

**Route Group**: `(staff)` → `/staff/*`

**Purpose**: Staff melihat data operasional bisnis (outlets, photoboxes, packages, templates) tanpa akses write dan tanpa financial detail. Read-only shell untuk operasional booth.

---

## 1. Overview

Staff adalah role read-only untuk operasional photobox. Staff **tidak punya akses**:
- Write operation (CRUD outlets/photoboxes/packages/templates/vouchers/staff)
- Financial detail (revenue, profit, expenses, balance, withdrawal)
- Subscription & billing
- Settings (branding, payment credentials, retention)
- Admin platform

Staff **punya akses read-only**:
- Outlets list
- Photoboxes list + device status
- Packages list
- Templates list
- Sessions list (basic)
- Transactions list (basic, tanpa financial detail)

**Permission Matrix** (`src/lib/rbac.ts`):
```typescript
const PERMISSIONS = {
  staff: [
    "business:read",
    "outlet:read",
    "photobox:read",
    "package:read",
    "template:read",
    "session:read",
    "transaction:read",
    "customer:read",
  ],
};
```

**Enforcement**:
- Server-side: `getMembership(userId, businessId)` → non-member = 404
- `can(role, permission)` — check before render/action
- Guard composite `.eq('business_id', businessId)` → cross-tenant = 404
- Layout guard: `requireMembership()` di `(staff)/layout.tsx`

---

## 2. Staff Dashboard (Overview)

**Page**: `/staff` → `src/app/(staff)/staff/page.tsx`

**Server Actions**: `src/server/staff-dashboard.ts` (hypothetical — atau reuse subset dashboard.ts)
- `getStaffOverview` — metrics operasional tanpa financial detail

**Data Display**:
- Total Outlets (count active)
- Total Photoboxes (count online/offline/maintenance)
- Total Sessions Today (count)
- Total Sessions This Month
- Active Customers (count distinct customer_id this month)

**Metrics TIDAK ditampilkan** (financial):
- Revenue (gross/net)
- Discount amount
- Average transaction value
- Profit/expenses

**Data Flow**:
```
SSR page component → getStaffOverview(businessId)
   ↓ check role: staff (via getMembership)
   ↓ query: outlets count, photoboxes count by status, sessions count
   ↓ NO query transactions.final_amount (financial)
   ↓ render metric cards (operasional only)
```

**Components**: `Card` (Neo-Brutalism), `MetricCard` (operasional).

**Permission**: STAFF (read-only).

**File Locations**:
- Page: `src/app/(staff)/staff/page.tsx`
- Server: `src/server/staff-dashboard.ts`
- Layout: `src/app/(staff)/layout.tsx` (guard `requireMembership` + role check)

**Acceptance**: staff melihat metrics operasional tanpa revenue/profit; tidak ada tombol write action.

---

## 3. Outlets (Read-Only)

**Page**: `/staff/outlets` → `src/app/(staff)/staff/outlets/page.tsx`

**Server Actions**: `src/server/outlets.ts`
- `listOutlets` (reuse owner action, filtered by permission)

**Data Display**:
- List outlets: name, address, city, province, status
- NO analytics (revenue, transactions count)

**Data Flow**:
```
SSR → listOutlets(businessId)
   ↓ check role: staff (can('outlet:read'))
   ↓ query outlets .eq('business_id')
   ↓ return { data: Outlet[] } (tanpa analytics)
   ↓ render DataTable (read-only, no action buttons)
```

**UI**: `DataTable` tanpa action column (no edit/delete buttons).

**Components**: `DataTable`, `StatusBadge`.

**Permission**: STAFF (`outlet:read`).

**File Locations**:
- Page: `src/app/(staff)/staff/outlets/page.tsx`
- Server: `src/server/outlets.ts` (reuse, check permission)

**Acceptance**: staff melihat list outlets tanpa action buttons; tidak bisa CRUD.

---

## 4. Photoboxes (Read-Only)

**Page**: `/staff/photoboxes` → `src/app/(staff)/staff/photoboxes/page.tsx`

**Server Actions**: `src/server/photoboxes.ts`
- `listPhotoboxes` (reuse, filtered by permission + `member_photoboxes` access control)

**Data Display**:
- List photoboxes: name, slug, outlet, status, camera, printer, device_status
- Filter: staff hanya melihat photoboxes yang di-assign ke mereka (via `member_photoboxes` m2m — migration 0018)

**Data Flow**:
```
SSR → listPhotoboxes(businessId, userId)
   ↓ check role: staff
   ↓ query photoboxes:
      - join member_photoboxes where user_id = staff userId
      - OR all photoboxes jika owner/manager (tidak ada pembatasan)
   ↓ return { data: Photobox[] }
   ↓ render DataTable (read-only)
```

**Access Control** (`member_photoboxes` — migration 0018):
- Owner mengatur booth mana yang bisa diakses staff via `/dashboard/staff` (assign photoboxes per member)
- PK `(user_id, photobox_id)`
- Staff hanya melihat photoboxes yang di-assign
- Owner/Manager melihat semua

**UI**: `DataTable` tanpa action buttons, `StatusBadge` (online/offline/maintenance).

**Components**: `DataTable`, `StatusBadge`, device status display (read-only).

**Permission**: STAFF (`photobox:read`), filtered by `member_photoboxes`.

**File Locations**:
- Page: `src/app/(staff)/staff/photoboxes/page.tsx`
- Server: `src/server/photoboxes.ts` (check `member_photoboxes` join)
- Access Control: `src/lib/photobox-access.ts` (helper)

**Acceptance**: staff hanya melihat photoboxes yang di-assign; tidak bisa edit/delete; device status visible.

---

## 5. Packages (Read-Only)

**Page**: `/staff/packages` → `src/app/(staff)/staff/packages/page.tsx`

**Server Actions**: `src/server/catalog-actions.ts`
- `listPackages` (reuse)

**Data Display**:
- List packages: name, price (masked atau visible — tergantung kebijakan), photo_count, print_count, digital_output, is_active
- NO CRUD actions

**Data Flow**:
```
SSR → listPackages(businessId)
   ↓ check role: staff (can('package:read'))
   ↓ query packages .eq('business_id')
   ↓ return { data: Package[] }
   ↓ render DataTable (read-only)
```

**Price Display**:
- Kebijakan: staff **bisa melihat harga** (operasional perlu tahu harga package untuk assist customer)
- Jika kebijakan berubah → mask harga untuk staff (ganti dengan "—")

**UI**: `DataTable` tanpa action buttons.

**Components**: `DataTable`, `StatusBadge` (active/inactive).

**Permission**: STAFF (`package:read`).

**File Locations**:
- Page: `src/app/(staff)/staff/packages/page.tsx`
- Server: `src/server/catalog-actions.ts`

**Acceptance**: staff melihat list packages tanpa action buttons; harga visible (atau masked per kebijakan).

---

## 6. Templates (Read-Only)

**Page**: `/staff/templates` → `src/app/(staff)/staff/templates/page.tsx`

**Server Actions**: `src/server/templates.ts`
- `listTemplates` (reuse)

**Data Display**:
- Grid preview templates: thumbnail, name, category, is_active
- NO upload/edit/delete/builder actions

**Data Flow**:
```
SSR → listTemplates(businessId)
   ↓ check role: staff (can('template:read'))
   ↓ query templates .eq('business_id') or business_id IS NULL (global)
   ↓ return { data: Template[] }
   ↓ render grid preview (read-only)
```

**UI**: Grid preview (card) tanpa action buttons.

**Components**: `TemplateGrid`, `Card` preview.

**Permission**: STAFF (`template:read`).

**File Locations**:
- Page: `src/app/(staff)/staff/templates/page.tsx`
- Server: `src/server/templates.ts`

**Acceptance**: staff melihat templates tanpa action buttons; tidak bisa upload/edit/builder.

---

## 7. Sessions (Read-Only)

**Page**: `/staff/sessions` (backlog — belum ada dedicated page; list bisa di overview)

**Server Actions**: `src/server/sessions.ts` (hypothetical)
- `listSessions` (filtered by staff photobox access)

**Data Display**:
- List sessions: session_id, photobox, package, customer, status, started_at, completed_at
- Filter: staff hanya melihat sessions dari photoboxes yang di-assign (via `member_photoboxes`)

**Data Flow**:
```
SSR → listSessions(businessId, userId)
   ↓ check role: staff
   ↓ query sessions:
      - join photoboxes
      - join member_photoboxes where user_id = staff userId
      - OR all sessions jika owner/manager
   ↓ return { data: Session[] }
   ↓ render DataTable (read-only)
```

**UI**: `DataTable` tanpa action buttons, `StatusBadge` (active/completed/cancelled/expired).

**Components**: `DataTable`, `StatusBadge`.

**Permission**: STAFF (`session:read`), filtered by `member_photoboxes`.

**File Locations**:
- Page: `src/app/(staff)/staff/sessions/page.tsx` (backlog)
- Server: `src/server/sessions.ts`

**Acceptance**: staff melihat sessions dari photoboxes mereka; tidak bisa start/cancel session dari dashboard.

---

## 8. Transactions (Read-Only, Basic)

**Page**: `/staff/transactions` (backlog — atau subset di overview)

**Server Actions**: `src/server/transactions.ts`
- `listTransactions` (filtered, no financial detail)

**Data Display**:
- List transactions: transaction_id (number), date, customer, package, photobox, payment_method, status
- **NO financial detail**: gross_amount, discount_amount, final_amount **MASKED** atau tidak ditampilkan

**Data Flow**:
```
SSR → listTransactions(businessId, userId)
   ↓ check role: staff (can('transaction:read'))
   ↓ query transactions:
      - join photoboxes
      - join member_photoboxes where user_id = staff userId (filter)
      - OR all transactions jika owner/manager
   ↓ return { data: Transaction[] } (omit financial fields)
   ↓ render DataTable (read-only, no amount columns)
```

**Masked Fields**:
- `gross_amount` → "—"
- `discount_amount` → "—"
- `final_amount` → "—"

**Rationale**: staff tidak perlu melihat revenue per transaction (operasional cukup tahu status paid/pending).

**UI**: `DataTable` tanpa amount columns, `StatusBadge` (paid/pending/failed/cancelled).

**Components**: `DataTable`, `StatusBadge`.

**Permission**: STAFF (`transaction:read`), filtered by `member_photoboxes`.

**File Locations**:
- Page: `src/app/(staff)/staff/transactions/page.tsx` (backlog)
- Server: `src/server/transactions.ts` (check role, omit financial fields)

**Acceptance**: staff melihat transactions tanpa financial detail; hanya status & metadata operasional.

---

## 9. Customers (Read-Only)

**Page**: `/staff/customers` (backlog)

**Server Actions**: `src/server/customers.ts`
- `listCustomers` (reuse, filtered)

**Data Display**:
- List customers: name, phone, email
- **NO total_spending** (financial)

**Data Flow**:
```
SSR → listCustomers(businessId)
   ↓ check role: staff (can('customer:read'))
   ↓ query customers .eq('business_id')
   ↓ return { data: Customer[] } (omit total_spending)
   ↓ render DataTable (read-only)
```

**Masked Fields**:
- `total_spending` → tidak ditampilkan

**UI**: `DataTable` tanpa action buttons, no total_spending column.

**Components**: `DataTable`.

**Permission**: STAFF (`customer:read`).

**File Locations**:
- Page: `src/app/(staff)/staff/customers/page.tsx` (backlog)
- Server: `src/server/customers.ts`

**Acceptance**: staff melihat customers tanpa total_spending; tidak bisa CRUD.

---

## 10. Navigation (Staff Sidebar)

**Items** (6 halaman, read-only):
1. Overview (metrics operasional)
2. Outlets (list read-only)
3. Photoboxes (list read-only, filtered by `member_photoboxes`)
4. Packages (list read-only)
5. Templates (grid read-only)
6. Sessions (backlog — list read-only, filtered)

**Tidak Ada**:
- Dashboard (revenue)
- Analytics (revenue charts)
- Metrics (financial)
- Vouchers (tidak operasional untuk staff)
- Staff Management (tidak bisa manage staff)
- Transactions (backlog — atau subset tanpa amount)
- Customers (backlog)
- Finance (expenses, profit)
- Subscription
- Reports
- Settings

**Active State**: `src/lib/nav-active.ts` shared helper.

**Components**: `Sidebar` (brutalist vertical nav, lebih simple dari owner), `SidebarItem`.

**File Locations**:
- Layout: `src/app/(staff)/layout.tsx`
- Components: `src/components/layout/StaffSidebar.tsx`

---

## 11. Permission Matrix (Staff vs Owner/Manager)

| Feature                   | Owner       | Manager     | Staff       |
|---------------------------|-------------|-------------|-------------|
| Outlets (read)            | ✓           | ✓           | ✓           |
| Outlets (write)           | ✓           | ✓           | ✗           |
| Photoboxes (read)         | ✓ (all)     | ✓ (all)     | ✓ (assigned)|
| Photoboxes (write)        | ✓           | ✓           | ✗           |
| Packages (read)           | ✓           | ✓           | ✓           |
| Packages (write)          | ✓           | ✓           | ✗           |
| Templates (read)          | ✓           | ✓           | ✓           |
| Templates (write/builder) | ✓           | ✓           | ✗           |
| Sessions (read)           | ✓ (all)     | ✓ (all)     | ✓ (assigned)|
| Transactions (read)       | ✓ (full)    | ✓ (full)    | ✓ (basic)   |
| Transactions (amount)     | ✓           | ✓           | ✗ (masked)  |
| Customers (read)          | ✓ (full)    | ✓ (full)    | ✓ (basic)   |
| Customers (spending)      | ✓           | ✓           | ✗           |
| Vouchers                  | ✓           | ✓           | ✗           |
| Staff Management          | ✓           | ✓ (invite)  | ✗           |
| Finance                   | ✓           | ✓ (read)    | ✗           |
| Subscription              | ✓           | ✓ (read)    | ✗           |
| Settings                  | ✓           | ✓ (read)    | ✗           |
| Reports                   | ✓           | ✓           | ✗           |

**Legend**:
- ✓: full access
- ✓ (read): read-only
- ✓ (all): semua data
- ✓ (assigned): hanya data dari photoboxes yang di-assign via `member_photoboxes`
- ✓ (basic): subset tanpa financial detail
- ✗: tidak ada akses

**Enforcement** (`src/lib/rbac.ts`):
```typescript
export const PERMISSIONS: Record<BusinessRole, Permission[]> = {
  owner: ["*"],
  manager: [
    "business:read", "business:write",
    "outlet:*", "photobox:*", "package:*", "template:*", "voucher:*",
    "customer:*", "session:*", "transaction:read", "transaction:write",
    "finance:read", "analytics:read", "report:read",
    "staff:read", // NOT staff:write
  ],
  staff: [
    "business:read",
    "outlet:read",
    "photobox:read",
    "package:read",
    "template:read",
    "session:read",
    "transaction:read",
    "customer:read",
  ],
};

export function can(role: BusinessRole, permission: Permission): boolean {
  const perms = PERMISSIONS[role];
  if (perms.includes("*")) return true;
  return perms.includes(permission) || perms.includes(`${permission.split(":")[0]}:*`);
}
```

**Access Control Helper** (`src/lib/photobox-access.ts`):
```typescript
export async function getAccessiblePhotoboxes(
  businessId: string,
  userId: string,
  role: BusinessRole
): Promise<string[]> {
  if (role === "owner" || role === "manager") {
    // Owner/Manager: semua photoboxes
    const { data } = await supabase
      .from("photoboxes")
      .select("id")
      .eq("business_id", businessId);
    return data?.map(p => p.id) || [];
  }

  // Staff: hanya photoboxes yang di-assign via member_photoboxes
  const { data } = await supabase
    .from("member_photoboxes")
    .select("photobox_id")
    .eq("user_id", userId)
    .eq("business_id", businessId);
  return data?.map(mp => mp.photobox_id) || [];
}
```

---

## 12. Design System & Components

**Sama dengan owner dashboard**: Neo-Brutalism penuh (lihat `11-design-system.md` + `02-OWNER-DASHBOARD-FLOW.md` §18).

**Perbedaan**:
- Sidebar lebih simple (6 item vs 14+ item owner)
- Tidak ada action buttons (no create/edit/delete)
- Financial fields masked atau tidak ditampilkan

**Components Reuse**:
- `Card`, `DataTable`, `StatusBadge`, `Sidebar`, `Topbar` (workspace switcher tetap ada jika staff member di banyak business)

**File Locations**:
- Layout: `src/app/(staff)/layout.tsx`
- Components: `src/components/layout/StaffSidebar.tsx`
- Shared: `src/components/ui/*`, `src/components/dashboard/*` (reuse dengan prop `readOnly`)

---

## 13. Security & RBAC Enforcement

**Guard Layers**:
1. **Layout Guard** (`(staff)/layout.tsx`):
   ```typescript
   const membership = await getMembership(userId, businessId);
   if (!membership) redirect("/login");
   if (membership.role !== "staff") redirect("/dashboard"); // owner/manager → dashboard
   ```

2. **Server Actions**:
   ```typescript
   export async function listPhotoboxes(businessId: string, userId: string) {
     const membership = await getMembership(userId, businessId);
     if (!membership) throw new ApiError("FORBIDDEN", "Not a member");
     if (!can(membership.role, "photobox:read")) throw new ApiError("FORBIDDEN", "No permission");
     
     // Filter by member_photoboxes if staff
     const accessibleIds = await getAccessiblePhotoboxes(businessId, userId, membership.role);
     const { data } = await supabase
       .from("photoboxes")
       .select("*")
       .eq("business_id", businessId)
       .in("id", accessibleIds); // staff: filtered; owner/manager: all
     
     return data;
   }
   ```

3. **UI Conditional Render**:
   ```typescript
   {can(role, "photobox:write") && (
     <Button>Edit</Button>
   )}
   ```

**Tenant Isolation**:
- Semua query `.eq('business_id', businessId)` dari `getMembership()`
- Cross-tenant ID → 0 rows → 404 (tidak membocorkan existence)

**Audit**:
- Staff actions tidak masuk `audit_logs` (hanya owner/manager/admin actions)

**File Locations**:
- RBAC: `src/lib/rbac.ts`
- Tenant: `src/lib/tenant.ts`
- Access Control: `src/lib/photobox-access.ts`
- Guard: `src/app/(staff)/layout.tsx`

---

## 14. Acceptance Criteria

**Staff Role**:
- (AC 47) RBAC berjalan — staff tidak otomatis melihat seluruh financial info
- Staff melihat outlets/photoboxes/packages/templates read-only tanpa action buttons
- Staff hanya melihat photoboxes yang di-assign via `member_photoboxes`
- Staff melihat transactions tanpa amount (masked financial detail)
- Staff tidak bisa CRUD (create/update/delete) resource apa pun
- Staff tidak punya akses finance, subscription, settings, reports, vouchers, staff management
- Layout guard redirect staff ke `/staff` (bukan `/dashboard`)
- Permission check server-side — tidak hanya hide UI

**Status Implementasi**: SESUAI (inti) per audit 2026-09-15. Route group `(staff)` belum ada — backlog; staff saat ini redirect ke `/dashboard` dengan subset permission (bukan shell terpisah). Jika shell terpisah diaktifkan, semua halaman di dokumen ini harus diimplementasi dengan guard layout + filtered data.

---

## 15. Migration Impact

**Staff flow tidak memerlukan migration baru** (semua tabel sudah ada):
- `business_members` (role `staff` sudah ada)
- `member_photoboxes` (migration 0018 — access control staff per booth)

**Tabel dipakai**:
- `businesses`, `business_members`, `outlets`, `photoboxes`, `member_photoboxes`, `packages`, `templates`, `sessions`, `transactions`, `customers`.

**Migration historis terkait staff**:
- `0018`: `member_photoboxes` (akses booth per staff) — PK `(user_id, photobox_id)`

---

## 16. Routing Pattern

**Route Group**: `(staff)`

**Pages**:
- `/staff` — overview (metrics operasional)
- `/staff/outlets` — list read-only
- `/staff/photoboxes` — list read-only (filtered `member_photoboxes`)
- `/staff/packages` — list read-only
- `/staff/templates` — grid read-only
- `/staff/sessions` — backlog
- `/staff/transactions` — backlog

**Layout**: `src/app/(staff)/layout.tsx`
- Guard: `requireMembership()` + role check staff
- Sidebar: `StaffSidebar` (6 items)
- Topbar: workspace switcher, user menu (no notifications)

**File Locations**:
- Route group: `src/app/(staff)/`
- Layout: `src/app/(staff)/layout.tsx`
- Pages: `src/app/(staff)/staff/**`

---

## 17. POS Permission (Staff as Cashier)

**Role `cashier`** (bukan staff):
- POS add-on memperkenalkan role baru `cashier` (lihat `05-POS-TERMINAL-FLOW.md`)
- `cashier` punya permission `pos:sell`, `pos:read`, `business:read`, `outlet:read`
- `cashier` **bukan staff** — role terpisah untuk terminal kasir POS
- `staff` (role existing) **tidak punya permission POS** — tidak melihat POS terminal

**Distinction**:
- `staff`: operasional photobox read-only (outlets, photoboxes, packages, templates)
- `cashier`: terminal POS (product catalog, cart, payment) — tidak ada akses photobox

**Permission Matrix POS** (lihat `05-POS-TERMINAL-FLOW.md` §15):
```typescript
staff: [
  "business:read", "outlet:read", "photobox:read", "package:read", "template:read",
  "session:read", "transaction:read", "customer:read",
  // NOT pos:*
],
cashier: [
  "pos:sell", "pos:read", "business:read", "outlet:read",
  // NOT photobox:*, NOT package:*, NOT template:*, NOT session:*, NOT transaction:*
],
```

**Routing**:
- Staff: `/staff/*` (photobox operations)
- Cashier: `/pos/*` (POS terminal)

**Acceptance**: staff tidak melihat POS menu; cashier tidak melihat photobox menu; role terpisah.

---

**Next**: `04-KIOSK-CUSTOMER-FLOW.md` — alur pay-first lengkap customer photobox.
