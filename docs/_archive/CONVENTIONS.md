> **Purpose**: Unified coding standards for all AI Agents and developers working on this project. Following these conventions ensures code consistency across 78,000+ lines of TypeScript.

---

## 1. File Organization

### Naming Rules

| Type | Convention | Example |
|:---|:---|:---|
| Admin router | `server/routers/<feature>.ts` (camelCase) | `invoiceGeneration.ts` |
| Portal router | `server/portal/routers/portal<Feature>Router.ts` | `portalInvoicesRouter.ts` |
| Worker router | `server/worker/routers/worker<Feature>Router.ts` | `workerPayslipsRouter.ts` |
| Service | `server/services/<feature>Service.ts` | `creditNoteService.ts` |
| Test | `server/<feature>.test.ts` (kebab-case OK) | `finance-phase1.test.ts` |
| Page | `client/src/pages/<Feature>.tsx` (PascalCase) | `Invoices.tsx` |
| Portal page | `client/src/pages/portal/Portal<Feature>.tsx` | `PortalEmployees.tsx` |
| Worker page | `client/src/pages/worker/Worker<Feature>.tsx` | `WorkerProfile.tsx` |
| Component | `client/src/components/<Component>.tsx` | `Layout.tsx` |
| Utility | `client/src/lib/<name>.ts` | `format.ts`, `i18n.ts` |

### When to Split Files

Split a router file into `server/routers/<feature>.ts` when it exceeds **150 lines**. Split a page component when it exceeds **500 lines** — extract sub-components into the same file or a co-located component file. Service files in `server/services/` should contain **one cohesive business operation** (e.g., invoice generation, deposit calculation).

---

## 2. Backend Patterns

### Procedure Structure

Every tRPC procedure follows this pattern: choose the correct middleware, define Zod input, call db/service, return result.

```typescript
// ✅ Correct pattern
import { financeManagerProcedure } from "../procedures";
import { z } from "zod";

export const invoicesRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      status: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      return await getInvoiceList(input);
    }),

  updateStatus: financeManagerProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["draft", "pending_review", "sent", "paid", "void"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await updateInvoiceStatus(input.id, input.status);
      await logAuditEvent(ctx.user, "invoice.statusChange", { ... });
      return result;
    }),
});
```

### Procedure Middleware Selection

| Middleware | Import From | Allowed Roles | Use For |
|:---|:---|:---|:---|
| `publicProcedure` | `_core/trpc` | Anyone (no auth) | Public data, auth endpoints |
| `protectedProcedure` | `_core/trpc` | Any authenticated user | Read-only views |
| `userProcedure` | `procedures.ts` | Any authenticated user | General read/write |
| `customerManagerProcedure` | `procedures.ts` | admin, customer_manager | Customer/employee CRUD |
| `operationsManagerProcedure` | `procedures.ts` | admin, operations_manager | Payroll/leave/adjustments |
| `financeManagerProcedure` | `procedures.ts` | admin, finance_manager | Invoices/billing/vendors |
| `adminProcedure` | `procedures.ts` | admin only | System settings, user management |
| `protectedPortalProcedure` | `portal/portalTrpc.ts` | Portal users (auto-injects customerId) | All client portal data access |
| `protectedWorkerProcedure` | `worker/workerTrpc.ts` | Worker users (auto-injects workerId) | All worker portal data access |

### Database Query Patterns

Query helpers in `server/db.ts` return raw Drizzle results. They do NOT throw errors — the caller (procedure) handles error responses.

```typescript
// ✅ Correct: query helper returns data
export async function getCustomerById(id: number) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  return customer ?? null;
}

// ✅ Correct: procedure handles the null case
getById: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ input }) => {
    const customer = await getCustomerById(input.id);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND" });
    return customer;
  }),
```

### Audit Logging
All write operations on core entities should log to `auditLogs`. Use the helper pattern:

```typescript
await db.insert(auditLogs).values({
  userId: ctx.user.id,
  userName: ctx.user.name,
  action: "invoice.create",        // entity.verb format
  entityType: "invoice",
  entityId: newInvoice.id,
  details: JSON.stringify({ invoiceNumber, total }),
  createdAt: new Date(),
});
```

---

## 3. Frontend Patterns

### Page Component Structure

Every page follows this structure: imports → hooks → loading/error states → render.

```tsx
// ✅ Standard page pattern
export default function Invoices() {
  const { t } = useI18n();
  const { data, isLoading } = trpc.invoices.list.useQuery({ page: 1 });

  if (isLoading) return <LoadingSkeleton />;

  return (
    <Layout breadcrumb={["GEA", t("nav.invoices")]}>
      {/* Page content */}
    </Layout>
  );
}
```

### Mutation with Optimistic Updates

Use optimistic updates for list operations (add, edit, delete, toggle). Use `invalidate` for critical operations (payments, status changes).

```tsx
// ✅ Optimistic update for list operations
const utils = trpc.useUtils();
const deleteMutation = trpc.customers.delete.useMutation({
  onMutate: async ({ id }) => {
    await utils.customers.list.cancel();
    const prev = utils.customers.list.getData();
    utils.customers.list.setData(undefined, (old) =>
      old ? { ...old, items: old.items.filter(c => c.id !== id) } : old
    );
    return { prev };
  },
  onError: (_err, _vars, context) => {
    if (context?.prev) utils.customers.list.setData(undefined, context.prev);
  },
  onSettled: () => utils.customers.list.invalidate(),
});

// ✅ Invalidate for critical operations
const statusMutation = trpc.invoices.updateStatus.useMutation({
  onSuccess: () => {
    utils.invoices.getById.invalidate({ id });
    utils.invoices.list.invalidate();
    toast.success(t("invoice.statusUpdated"));
  },
});
```

### Pagination Pattern

Pages with lists use URL-synced pagination to preserve page state across navigation:

```tsx
const searchString = useSearch();
const [, setLocation] = useLocation();

// Initialize page from URL
const [page, setPage] = useState(() => {
  const params = new URLSearchParams(searchString);
  return parseInt(params.get("page") || "1", 10);
});

// Skip filter reset on initial mount
const isInitialMount = useRef(true);
useEffect(() => {
  if (isInitialMount.current) {
    isInitialMount.current = false;
    return;
  }
  setPage(1);
}, [search, statusFilter]);

// Sync page from URL on navigation
useEffect(() => {
  const params = new URLSearchParams(searchString);
  const urlPage = parseInt(params.get("page") || "1", 10);
  setPage(urlPage);
}, [searchString]);
```

Detail pages pass `from_page` in the URL so the list page can restore the correct page on back navigation.

---

## 4. Date & Time Rules
All date handling follows these rules without exception.

**Storage**: UTC millisecond timestamps in the database (`timestamp` columns or `bigint` for custom timestamps).

**Display**: Always use the centralized formatters from `client/src/lib/format.ts`:

| Function | Output Format | Use Case |
|:---|:---|:---|
| `formatDate(value)` | `28 Feb 2026` | General dates |
| `formatMonth(value)` | `Feb 2026` | Payroll months, invoice months |
| `formatMonthLong(value)` | `February 2026` | Long month display |
| `formatDateTime(value)` | `28 Feb 2026, 14:30` | Timestamps with time |

**Cutoff logic**: Uses Beijing time (UTC+8). Monthly cutoff is the **5th at 00:00 Beijing time**. The `YYYY-MM` string format is used for payroll months and invoice months (e.g., `"2026-02"`).

**Anti-pattern**: Never use `new Date().toLocaleDateString()` directly in components. Never store timezone-dependent strings in the database.

---

## 5. Currency & Amount Rules

**Formatting**: Always use `formatAmount(value, currency)` from `format.ts`.

| Currency Group | Decimal Places | Example |
|:---|:---:|:---|
| KRW, VND, IDR | 0 | `KRW 5,000,000` |
| All others | 2 | `USD 1,234.56` |

**Employee salary currency**: Automatically locked to the country's legal currency. Cannot be manually selected. Defined in the `countries` table's `currency` field.

**Invoice currency**: Uses the customer's `settlementCurrency`. When employee salary currency differs from invoice currency, exchange rate conversion is applied.

**Exchange rate markup**: Stored separately as `exchangeRateWithMarkup`. The markup percentage is configured per billing entity.

**Anti-pattern**: Never format amounts with `toFixed(2)` directly. Never hardcode currency symbols.

---

## 6. i18n Translation Rules

The system supports English (en) and Chinese (zh). All user-facing text must be translated.

**Translation file**: `client/src/lib/i18n.ts` contains the `translations` dictionary and the Zustand-based i18n store. All pages use the `useI18n()` hook and `t("key")` pattern for translations.

**Adding translations**: Add keys to both `en` and `zh` sections simultaneously. Use dot-notation keys organized by module:

```typescript
// ✅ Correct key naming
"invoice.status.draft": "Draft",           // en
"invoice.status.draft": "草稿",            // zh
"employee.field.baseSalary": "Base Salary", // en
"employee.field.baseSalary": "基本工资",    // zh
```

**Status labels**: Use the `statusLabels` object for all status display. Never use `.replace("_", " ")` or manual string manipulation on enum values.

---

## 7. Status Display Pattern

All entity statuses use a centralized badge pattern with consistent color coding:

| Status Category | Color | Examples |
|:---|:---|:---|
| Active / Paid / Approved | Green | `active`, `paid`, `approved`, `signed` |
| Draft / Pending | Yellow/Amber | `draft`, `pending_review`, `submitted` |
| Sent / In Progress | Blue | `sent`, `onboarding`, `application_submitted` |
| Cancelled / Void / Terminated | Red | `cancelled`, `void`, `terminated`, `rejected` |
| Locked / Overdue | Orange | `locked`, `overdue`, `expired` |

---

## 8. Common Anti-Patterns

These patterns have caused bugs in the past. Avoid them.

| Anti-Pattern | Correct Approach |
|:---|:---|
| Creating new objects in render as query inputs | Stabilize with `useState(() => ...)` or `useMemo` |
| Storing file bytes in database BLOB columns | Use `storagePut()` to Alibaba Cloud OSS, store URL in database |
| Hardcoding port numbers in server code | Use `process.env.PORT` or let the framework assign |
| Importing admin procedures in portal code | Use separate `protectedPortalProcedure` |
| Comparing role strings with `===` | Use `hasRole()` or `hasAnyRole()` from `shared/roles.ts` |
| Using `new Date()` in render (unstable reference) | Use `useState(() => new Date())` |
| Nesting `<a>` inside `<Link>` | Pass children directly to `<Link>` |
| Using empty string `""` as `<Select.Item>` value | Every item must have a non-empty value |
| Hardcoding `window.location.origin` for auth redirects | Use server-provided URLs from environment variables |
| Editing files in `server/_core/` | These are framework files — do not modify |

---

## 9. Technical Stack & Architecture

This section provides a high-level overview of the core technologies used in the GEA Platform.

### Authentication
Authentication is handled via **JWT + bcrypt + HttpOnly Cookie**. This is a unified system across all three portals.
- **Admin Auth**: JWT signed with HS256 via the `jose` library, stored in an HttpOnly cookie. Logic is in `server/_core/adminAuth.ts` and `server/_core/authRoutes.ts`.
- **Portal Auth**: JWT + bcrypt with an invite-based registration flow. Logic is in `server/portal/portalAuth.ts`.
- **Worker Auth**: JWT + bcrypt with an invite-based registration flow. Logic is in `server/worker/workerAuth.ts`.
- The primary environment variable for signing is `JWT_SECRET`.
- The initial admin user is created at startup using `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD`.

### Database
The database is **SQLite**, accessed via `@libsql/client` with `drizzle-orm/libsql` as the ORM. The `drizzle.config.ts` specifies `dialect: "sqlite"`. In production, the database file is located at `/app/data/production.db` within the Docker container.

### Deployment
 The entire system is self-hosted on **Alibaba Cloud Malaysia (ap-southeast-3)** using **Docker Compose, Nginx, and Certbot for SSL**. It is fully independent and does not rely on any external platform services. The public-facing domains are:
- **Admin Portal**: `admin.extendglobal.ai`
- **Client Portal**: `app.extendglobal.ai`
- **Worker Portal**: `worker.extendglobal.ai`

### File Storage
File storage uses **Alibaba Cloud OSS**, which is compatible with the S3 API. The `@aws-sdk/client-s3` library is used to interact with it. Configuration is managed through environment variables: `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, `OSS_REGION`, `OSS_BUCKET`, and `OSS_ENDPOINT`.

### AI Services
All AI-powered features are routed through a central `aiGatewayService.ts`. This gateway directs requests to **Alibaba Cloud DashScope** models like `qwen-turbo` and `qwen-max`. The API key is configured via the `DASHSCOPE_API_KEY` environment variable.
