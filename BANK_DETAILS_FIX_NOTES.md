# Bank Details Fix Notes

## Root Cause: Double Serialization

Both `employees` and `contractors` tables define `bankDetails` as:
```
bankDetails: text("bankDetails", { mode: "json" })
```

Drizzle's `mode: "json"` automatically handles JSON.stringify on write and JSON.parse on read.

## Places that incorrectly JSON.stringify before writing:

1. **portalEmployeesRouter.ts:276** - EOR employer-fill submitOnboarding
   - `bankDetails: input.bankDetails ? JSON.stringify(input.bankDetails) : null`
   - FIX: Remove JSON.stringify → `bankDetails: input.bankDetails || null`

2. **portalEmployeesRouter.ts:811** - EOR self-service submitSelfServiceOnboarding
   - `bankDetails: input.bankDetails ? JSON.stringify(input.bankDetails) : null`
   - FIX: Remove JSON.stringify → `bankDetails: input.bankDetails || null`

## Places that correctly handle bankDetails (no change needed):

3. **portalEmployeesRouter.ts:767** - AOR self-service (our new code)
   - `bankDetails: input.bankDetails ? input.bankDetails : null` ✅ CORRECT

4. **portalContractorsRouter.ts:213** - AOR employer-fill (our new code)
   - Already handles both string and object ✅ CORRECT (but should simplify)

5. **server/routers/contractors.ts:122** - Admin create contractor
   - `bankDetails: input.bankDetails ? JSON.parse(input.bankDetails) : undefined`
   - Client sends JSON string, server parses it → passes object to Drizzle ✅ CORRECT

6. **server/routers/employees.ts:163** - Admin create employee
   - `...input` spread includes bankDetails as-is (object from client)
   - Drizzle auto-serializes ✅ CORRECT

## Remove bank details tab:

1. **PortalEmployeeDetail.tsx:222** - Remove "bank" TabsTrigger
2. **PortalEmployeeDetail.tsx:518-549** - Remove bank TabsContent
3. **Employees.tsx:849** - Remove "bank" from DetailTab type
4. **Employees.tsx:1109** - Remove bank tab from tabs list
5. **Employees.tsx:1603+** - Remove bank tab content
