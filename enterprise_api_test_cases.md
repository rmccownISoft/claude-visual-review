# ITrack Enterprise API — Skill & Tool Validation Test Cases

| | |
|---|---|
| **Store** | ISoft Lincoln (Store ID: 1) |
| **MCP Server** | https://qc.itrackenterprise.com/graphql |
| **Baselined** | 2026-03-30 |

---

## Test Execution Notes

### 1. Fresh Conversation Requirement
Skill-based test cases (TC-EQ and TC-CF) must each be run in a **fresh conversation**. Skills are only loaded once per conversation, so if a prior test already caused a skill to be read, a subsequent test in the same conversation cannot validate that Claude independently loads it.

**Recommended grouping per conversation:**

| Conversation | Test Cases | Reason |
|---|---|---|
| A | TC-TOOL-01, TC-TOOL-02 | No skill dependency |
| B | TC-EQ-01 through TC-EQ-04 | Enterprise-query skill |
| C | TC-CF-01 through TC-CF-04 | Custom-fields skill |

### 2. Skill Installation Check
Before running skill-based test cases, verify that the following skills are installed in your environment. Skill file locations may vary — confirm with your environment setup before running. **If either skill is missing, its test cases cannot be run and any results are invalid.**

**Required skills:**
- Enterprise-query skill
- Custom-fields skill

### 3. Authentication
All test cases assume an active session authenticated to **Store 1 (ISoft Lincoln)**. Authenticate before running if needed.

### 4. Re-Baselining
Expected output values for tool tests are pinned to closed historical data (full year 2025) and should not change. If values drift, it indicates new finalized documents were added to the 2025 date range. Re-run the relevant queries and update expected values before continuing to use the affected test cases.

### 5. Pass Criteria Interpretation
- **"Tool called"** means the specific MCP tool was invoked — not that Claude used `query_graphql` as a substitute. A correct answer reached via `query_graphql` instead of the designated tool is a **FAIL**.
- **"Skill read"** means Claude read the skill file before writing any queries. A correct answer reached without reading the skill is a **FAIL**, since the goal is to validate skill adherence, not query correctness by luck.

---

## Section 1 — MCP Tool Calls

### TC-TOOL-01: `get_sales_performance_summary` — Full Year 2025, Store 1

**Prompt:** `"Show me sales performance for ISoft Lincoln for all of 2025"`

**Tool:** `get_sales_performance_summary`

| Parameter | Value |
|---|---|
| `storeId` | `1` |
| `dateRange` | `{ start: "2025-01-01", end: "2025-12-31" }` |
| `groupBy` | `month` |
| `include_comparisons` | `false` |
| `include_linear_regression_forecasting` | `false` |

#### Expected Output — Summary

| Field | Expected Value |
|---|---|
| Total Revenue | $72,720.08 |
| Total Subtotal | $67,927.04 |
| Total Tax | $4,793.04 |
| Total Transactions | 26 |
| Unique Customers | 7 |
| Avg Order Value | $2,796.93 |
| Tax Rate | 7.06% |

#### Expected Output — Monthly Trends

8 months with activity; months with no activity (2025-06, 08, 09, 11) must be **absent** from the trends array.

| Month | Revenue | Transactions |
|---|---|---|
| 2025-01 | $14,041.17 | 2 |
| 2025-02 | $3,217.50 | 1 |
| 2025-03 | $52,954.53 | 4 |
| 2025-04 | $805.40 | 4 |
| 2025-05 | $199.72 | 6 |
| 2025-07 | $1,126.39 | 2 |
| 2025-10 | $134.06 | 1 |
| 2025-12 | $241.31 | 6 |

#### Expected Output — Salespeople

| Name | Revenue | Transactions |
|---|---|---|
| support | $72,167.74 | 19 |
| andrea | $552.34 | 7 |

#### Pass Criteria
- `get_sales_performance_summary` tool called (not `query_graphql`)
- Explicit `dateRange` param passed — not defaulting to current month
- All summary totals match expected values
- Exactly 8 trend entries, correct months only
- Both salespeople present with correct revenue

#### Failure Modes
- Tool called without `dateRange`, defaulting to current month
- `query_graphql` used instead of the designated tool
- Revenue totals drift — re-baseline if new 2025 SOs were intentionally added

---

### TC-TOOL-02: `get_salesperson_metrics` — Full Year 2025, Store 1

**Prompt:** `"Show me salesperson performance for ISoft Lincoln for all of 2025"`

**Tool:** `get_salesperson_metrics`

| Parameter | Value |
|---|---|
| `storeId` | `1` |
| `period` | `"2025-01-01:2025-12-31"` |
| `includeCustomerBreakdown` | `true` |

#### Expected Output — Summary

| Field | Expected Value |
|---|---|
| Total Salespeople | 2 |
| Total Revenue | $72,720.08 |
| Total Transactions | 26 |
| Total Customers | 7 |
| Unassigned Revenue | $0.00 |

#### Expected Output — Salesperson Detail

| Field | support | andrea |
|---|---|---|
| Rank | 1 | 2 |
| Total Revenue | $72,167.74 | $552.34 |
| Transactions | 19 | 7 |
| Avg Order Value | $3,798.30 | $78.91 |
| Customer Count | 7 | 1 |
| Revenue Share | 99.2% | 0.8% |
| First Sale | 2025-01-09 | 2025-07-21 |
| Last Sale | 2025-10-31 | 2025-12-29 |
| Top Customer | Werner Enterprises — $53,700.17 (7 tx) | U-Haul Moving & Storage — $552.34 (7 tx) |

#### Pass Criteria
- `get_salesperson_metrics` tool called (not `query_graphql`)
- Explicit `period` param passed — not defaulting to current year
- Exactly 2 salespeople returned in correct rank order
- Summary totals match expected values
- `includeCustomerBreakdown: true` produces `topCustomers` on each salesperson

#### Failure Modes
- Tool called without `period`, defaulting to current year
- `includeCustomerBreakdown` defaulting to `false`, returning no `topCustomers`
- Revenue totals drift — re-baseline if new 2025 SOs were intentionally added

---

## Section 2 — Enterprise-Query Skill

> ⚠️ **Skill read required.** Claude must read the enterprise-query skill file before writing any query in this section. Failure to read the skill is a **FAIL** regardless of whether the resulting query happens to be correct.

---

### TC-EQ-01: Sales Order Filter Syntax + String Enum `orderBy`

**Prompt:** `"List finalized sales orders created in Q1 2025 at ISoft Lincoln, sorted by date"`

#### Expected Query Shape
```graphql
salesOrders(
  filter: {
    date: { gte: "2025-01-01", lte: "2025-03-31" }
    finalized: true
    storeId: [1]
  }
  pagination: { pageNumber: 1, pageSize: 10 }
  orderBy: [date_ASC]
) {
  totalItems
  items { salesOrderId date total }
  pageInfo { pageNumber totalPages }
}
```

#### Query Pass/Fail Markers

| | Criteria |
|---|---|
| ✅ PASS | `storeId: [1]` — list, **not** `storeId: { eq: 1 }` |
| ✅ PASS | `finalized: true` — plain boolean, **not** `finalized: { eq: true }` |
| ✅ PASS | `orderBy: [date_ASC]` — string enum, **not** `{ field: "date", direction: ASC }` |
| ✅ PASS | `totalItems` present — **not** `totalCount` (causes schema error) |
| ✅ PASS | `pageInfo` present |

#### Expected Output

| Field | Expected Value |
|---|---|
| `totalItems` | 7 |
| `totalPages` | 1 |
| First result | SO #1 — 2025-01-09 — $13,406.25 |
| Last result | SO #7 — 2025-03-31 — $43,468.75 |

#### Failure Modes
- Skill not read before query is written
- `storeId: { eq: 1 }` used instead of `storeId: [1]`
- `orderBy` uses object syntax instead of string enum
- `totalCount` used instead of `totalItems`
- `pageInfo` omitted

---

### TC-EQ-02: Purchase Order Filter Syntax + String Enum `orderBy`

**Prompt:** `"List all received purchase orders from 2025 at ISoft Lincoln, sorted by date"`

#### Expected Query Shape
```graphql
purchaseOrders(
  filter: {
    storeId: [1]
    doneReceiving: true
    date: { gte: "2025-01-01", lte: "2025-12-31" }
  }
  pagination: { pageNumber: 1, pageSize: 10 }
  orderBy: [date_ASC]
) {
  totalItems
  items { id purchaseOrderId date total vendor { id companyName } }
  pageInfo { pageNumber totalPages }
}
```

#### Query Pass/Fail Markers

| | Criteria |
|---|---|
| ✅ PASS | `storeId: [1]` — list syntax |
| ✅ PASS | `doneReceiving: true` — plain boolean |
| ✅ PASS | `orderBy: [date_ASC]` — string enum, **not** `{ field: "date", direction: ASC }` |
| ✅ PASS | `totalItems` and `pageInfo` present |

#### Expected Output

| Field | Expected Value |
|---|---|
| `totalItems` | 9 |
| `totalPages` | 1 |
| First result | PO #11 — 2025-01-02 — $373.75 — NAPA AUTO PARTS |
| Last result | PO #23 — 2025-05-27 — $476.00 — Truck Salvage |

#### Failure Modes
- Skill not read before query is written
- `orderBy` uses object syntax instead of string enum
- `totalCount` used instead of `totalItems`
- `pageInfo` omitted

---

### TC-EQ-03: Work Order `dateClosed` Filter + `StoreFilter` Syntax

**Prompt:** `"List work orders closed during 2025 at ISoft Lincoln"`

#### Expected Query Shape
```graphql
workOrders(
  filter: {
    store: { id: [1] }
    dateClosed: { gte: "2025-01-01", lte: "2025-12-31" }
  }
  pagination: { pageNumber: 1, pageSize: 10 }
  orderBy: [workOrderId_ASC]
) {
  totalItems
  items { workOrderId date dateClosed closed total }
  pageInfo { pageNumber totalPages }
}
```

#### Query Pass/Fail Markers

| | Criteria |
|---|---|
| ✅ PASS | `store: { id: [1] }` — StoreFilter object, **not** `storeId: [1]` (only valid on SOs and POs) |
| ✅ PASS | `dateClosed` filter used — **not** `date` (creation date), which would return the wrong result set |
| ✅ PASS | `orderBy: [workOrderId_ASC]` — string enum |
| ✅ PASS | `totalItems` and `pageInfo` present |

#### Expected Output

| Field | Expected Value |
|---|---|
| `totalItems` | 2 |
| WO #1 | Closed 2025-02-26 — $264.29 |
| WO #3 | Closed 2025-04-21 — $437.50 |

#### Failure Modes
- Skill not read before query is written
- `storeId: [1]` used instead of `store: { id: [1] }`
- `date` filter used instead of `dateClosed`, returning the wrong result set
- `orderBy` uses object syntax instead of string enum

---

### TC-EQ-04: Date Filter Limitation — SO Creation Date vs. Finalization Date

**Prompt:** `"Show me sales orders finalized in March 2025 at ISoft Lincoln"`

#### Expected Behavior
Claude uses `date: { gte: "2025-03-01", lte: "2025-03-31" }` with `finalized: true`, and **explicitly communicates** that the API's `date` filter operates on creation date — not finalization date. Results reflect orders *created* in March that happen to be finalized, not all orders finalized in March regardless of when they were created.

Claude does **not** widen the date range to compensate (e.g. pulling Dec–Mar to catch earlier-created SOs finalized in March) — the skill documents this as an anti-pattern.

#### Pass Criteria
- Skill read before query is written
- `date` filter scoped to March 2025 creation window
- Limitation communicated to the user unprompted
- Date range not widened beyond the requested month

#### Failure Modes
- Skill not read
- Date range widened without disclosing the reason or the limitation
- `finalized: true` omitted, returning unfinalized orders in results
- Limitation silently ignored with no user-facing note

---

## Section 3 — Custom Fields Skill

> ⚠️ **Skill read required.** Claude must read the custom-fields skill file before writing any query in this section. Failure to read the skill is a **FAIL** regardless of whether the resulting query happens to be correct.

> **Note on output stability:** Custom field definitions and values on active records are mutable and may change over time. TC-CF tests are therefore primarily **query shape** validation. TC-CF-02 is the exception — it anchors to an inactive customer record (ID 7) which is unlikely to change. If that record's values have changed, re-baseline TC-CF-02 before use.

---

### TC-CF-01: Two-Step Pattern — Definitions Before Values

**Prompt:** `"Show me all custom fields for customer ISoft Lincoln"`

#### Expected Behavior
Claude follows the two-step pattern required by the skill:

1. Fetch definitions via `customerOptions` to resolve field labels and IDs
2. Fetch the specific record via `customer(id: 7)` with `optionValues` included

#### Expected Query Shapes

**Step 1:**
```graphql
customerOptions {
  id label dataType
}
```

**Step 2:**
```graphql
customer(id: 7) {
  id companyName
  optionValues {
    option { id label dataType }
    value
  }
}
```

#### Query Pass/Fail Markers

| | Criteria |
|---|---|
| ✅ PASS | `customerOptions` queried first, before fetching `optionValues` |
| ✅ PASS | No pagination argument on `customerOptions` — it is a flat list; pagination throws a schema error |
| ✅ PASS | `optionValues` fetched on the individual record by ID, not via customer list scan |
| ✅ PASS | Skill read before any queries are written |

#### Pass Criteria
- Both steps executed in correct order
- Empty string values rendered as "Not set", not blank or null

#### Failure Modes
- Skill not read
- Pagination args added to `customerOptions`
- Definition lookup skipped — Claude goes straight to `optionValues`
- Claude scans the customer list to find ISoft Lincoln instead of fetching by ID

---

### TC-CF-02: Known Field Values on Inactive Record

**Prompt:** `"Show me all custom fields for customer ISoft Lincoln"`

> This test uses the same prompt as TC-CF-01 but focuses on **output correctness** rather than query shape. Run after TC-CF-01 passes, or independently in a fresh conversation.

#### Reference Record
**Customer:** ISoft Lincoln — ID 7 — **inactive**

#### Expected Output

| Field | Expected Value |
|---|---|
| Birthdate | Not set |
| Nickname | Not Matt |
| Loyalty program member | True |
| Loyalty program number | 9825311 |
| Loyalty Program benefit amount | Not set |
| Sweeper | Not set |

#### Pass Criteria
- All six fields present in response (even those with no value)
- Values match expected output above exactly
- Empty fields displayed as "Not set"

#### Failure Modes
- Any expected value missing or incorrect — re-baseline if record was intentionally updated
- Empty fields hidden or shown as blank instead of "Not set"

---

### TC-CF-03: Server-Side Filter by Custom Field Value (`eq`)

**Prompt:** `"Which customers are loyalty program members?"`

#### Expected Query Shape
```graphql
customers(
  filter: {
    customFields: [{ name: "Loyalty program member", value: { eq: "true" } }]
  }
  pagination: { pageNumber: 1, pageSize: 10 }
  orderBy: [{ field: "companyName", direction: ASC }]
) {
  totalItems
  items { id companyName }
}
```

#### Query Pass/Fail Markers

| | Criteria |
|---|---|
| ✅ PASS | Server-side `customFields` filter used — not a client-side scan of all customers |
| ✅ PASS | `name` matches by label string (`"Loyalty program member"`), not by option ID |
| ✅ PASS | Skill read before query is written |

#### Expected Output
Customer ID 7 (ISoft Lincoln) must appear in results. `totalItems` is not asserted — other customers may have this field set.

> Both `"True"` and `"true"` values should be matched — confirms case-insensitive filter behavior.

#### Failure Modes
- Skill not read
- Client-side scan used instead of server-side `customFields` filter
- Filter uses option ID instead of label name
- Customer 7 absent from results

---

### TC-CF-04: Server-Side Filter — Field Has Any Value Set (`ne: ""`)

**Prompt:** `"Which vendors have a Lincoln Store Account Number on file?"`

#### Expected Query Shape
```graphql
vendors(
  filter: {
    customFields: [{ name: "Lincoln Store Account Number", value: { ne: "" } }]
  }
  pagination: { pageNumber: 1, pageSize: 10 }
  orderBy: [{ field: "companyName", direction: ASC }]
) {
  totalItems
  items { id companyName }
}
```

#### Query Pass/Fail Markers

| | Criteria |
|---|---|
| ✅ PASS | `ne: ""` used — **not** `ne: null` |
| ✅ PASS | Server-side `customFields` filter used, not client-side scan |
| ✅ PASS | Skill read before query is written |

#### Expected Output
At least one vendor must be returned. `totalItems` is not asserted. Verify manually that the returned vendors all have a non-empty account number value — any vendor with an empty field appearing in results indicates a filter failure.

#### Failure Modes
- Skill not read
- `ne: null` used instead of `ne: ""`
- Client-side scan used instead of server-side filter
- Vendors with an empty account number field appearing in results

---

## Summary

| Test Case | Type | Scope |
|---|---|---|
| TC-TOOL-01 | MCP Tool | `get_sales_performance_summary` — 2025 |
| TC-TOOL-02 | MCP Tool | `get_salesperson_metrics` — 2025 |
| TC-EQ-01 | Enterprise-Query Skill | SO filter syntax + string enum `orderBy` |
| TC-EQ-02 | Enterprise-Query Skill | PO filter syntax + string enum `orderBy` |
| TC-EQ-03 | Enterprise-Query Skill | Work order `dateClosed` + `StoreFilter` syntax |
| TC-EQ-04 | Enterprise-Query Skill | SO date filter limitation (behavioral) |
| TC-CF-01 | Custom Fields Skill | Two-step pattern — definitions before values |
| TC-CF-02 | Custom Fields Skill | Known field values on inactive customer record |
| TC-CF-03 | Custom Fields Skill | Filter customers by custom field — `eq` |
| TC-CF-04 | Custom Fields Skill | Filter vendors by custom field — `ne: ""` |
