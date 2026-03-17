# P0 Issues #2 and #3: Date Object Written to Text Column - Audit Findings

## CONFIRMED: All Date-to-text issues from test plan are present, PLUS additional ones discovered

### P0 #2a: employees.ts Date-to-text (6 locations) - CONFIRMED
Schema: `startDate: text("startDate")`, `endDate: text("endDate")`, `dateOfBirth: text("dateOfBirth")`, `visaExpiryDate: text("visaExpiryDate")`

| Location | Line | Code | Column Type |
|---|---|---|---|
| Create | 169 | `startDate: new Date(input.startDate)` | text |
| Create | 170 | `endDate: new Date(input.endDate)` | text |
| Create | 171 | `dateOfBirth: new Date(input.dateOfBirth)` | text |
| Update | 258 | `updateData.startDate = new Date(input.data.startDate)` | text |
| Update | 263 | `updateData.endDate = new Date(input.data.endDate)` | text |
| Update | 268 | `updateData.dateOfBirth = new Date(input.data.dateOfBirth)` | text |
| Update | 273 | `updateData.visaExpiryDate = new Date(input.data.visaExpiryDate)` | text |

**Total: 7 locations** (test plan said 6, but visaExpiryDate is also affected)

### P0 #2b: customers.ts Contract Date-to-text (6 locations) - CONFIRMED
Schema: `signedDate: text("signedDate")`, `effectiveDate: text("effectiveDate")`, `expiryDate: text("expiryDate")`

| Location | Line | Code | Column Type |
|---|---|---|---|
| Contract Create | 629 | `signedDate: new Date(input.signedDate + "T00:00:00Z")` | text |
| Contract Create | 630 | `effectiveDate: new Date(input.effectiveDate + "T00:00:00Z")` | text |
| Contract Create | 631 | `expiryDate: new Date(input.expiryDate + "T00:00:00Z")` | text |
| Contract Update | 661 | `updateData.signedDate = new Date(input.data.signedDate + "T00:00:00Z")` | text |
| Contract Update | 662 | `updateData.effectiveDate = new Date(input.data.effectiveDate + "T00:00:00Z")` | text |
| Contract Update | 663 | `updateData.expiryDate = new Date(input.data.expiryDate + "T00:00:00Z")` | text |

### P0 #2c: customers.ts Pricing Date-to-text (4 locations) - NEW DISCOVERY
Schema: `effectiveFrom: text("effectiveFrom")`, `effectiveTo: text("effectiveTo")`

| Location | Line | Code | Column Type |
|---|---|---|---|
| Pricing Create | 227 | `effectiveFrom: new Date(input.effectiveFrom + "T00:00:00Z")` | text |
| Pricing Create | 228 | `effectiveTo: new Date(input.effectiveTo + "T00:00:00Z")` | text |
| Batch Create | 272 | `effectiveFrom: new Date(input.effectiveFrom + "T00:00:00Z")` | text |
| Batch Create | 273 | `effectiveTo: new Date(input.effectiveTo + "T00:00:00Z")` | text |

### P0 #2d: leave.ts Date-to-text (4 locations) - NEW DISCOVERY
Schema: `startDate: text("startDate")`, `endDate: text("endDate")`

| Location | Line | Code | Column Type |
|---|---|---|---|
| Create (split) | 231 | `startDate: new Date(split.startDate)` | text |
| Create (split) | 232 | `endDate: new Date(split.endDate)` | text |
| Update | 348 | `updateData.startDate = new Date(input.data.startDate)` | text |
| Update | 349 | `updateData.endDate = new Date(input.data.endDate)` | text |

### P0 #3: exchangeRateService.ts Date-to-text - CONFIRMED
Schema: `effectiveDate: text("effectiveDate").notNull()` with unique index on `(fromCurrency, toCurrency, effectiveDate)`

The `upsertExchangeRate` function accepts `effectiveDate: Date` and passes it directly to the insert.
The router creates `new Date(input.effectiveDate)` and passes it.
The fetch service creates `new Date(data.date + "T00:00:00Z")` and passes it.

This causes the unique index to fail because Date.toString() produces "Thu Mar 05 2026 00:00:00 GMT+0000" instead of "2026-03-05", so onDuplicateKeyUpdate never matches.

### P0 #3b: invoiceGeneration.ts Date handling - PARTIALLY FIXED
The `generateInvoicesFromPayroll` function accepts `payrollMonth: Date` and internally converts to string with `payrollMonthStr`. This is a workaround but the function signature is still Date, and the router passes `new Date(input.payrollMonth)`. The internal conversion to string appears correct for the invoiceMonth write, but the Date object is still passed to sub-functions.

### invoices.ts sentDate/paidDate - NOT AN ISSUE
Schema: `sentDate: integer("sentDate", { mode: "timestamp" })`, `paidDate: integer("paidDate", { mode: "timestamp" })`
These are timestamp columns, so `new Date()` is correct here.
