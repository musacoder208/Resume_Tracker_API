# Database Rules

> These rules **MUST** be followed for all modules.

---

## 1. General Rules

- Do **NOT** write raw SQL queries in Node.js
- All database operations **MUST** use PostgreSQL functions
- Repository layer must **ONLY** call DB functions
- No direct `SELECT` / `INSERT` / `UPDATE` / `DELETE` in Node.js

---

## 2. Function Creation

- Create PostgreSQL functions for **all** DB operations
- Function names should be meaningful based on purpose
- Do **NOT** hardcode function names in advance — derive from use case
- Functions must handle:
  - Filtering
  - Joins
  - Business-level data fetching

---

## 3. Function Output

- Always return **structured data (JSON)**
- Avoid returning raw unstructured results
- Use proper **column aliases**

---

## 4. Node.js Usage

Repository must call functions like:

```sql
SELECT * FROM function_name($1, $2);
```

- Only pass parameters
- Do **NOT** embed SQL logic in Node.js

---

## 5. Tenant Support

- Always include `company_id` (tenantId) in DB functions where applicable
- Ensure **data isolation per tenant**

---

## 6. Soft Delete & Active Data

Always apply the following filters — do **NOT** return inactive or deleted records:

```sql
is_deleted = false
is_active  = true
```

---

## 7. Security

- Prevent SQL injection using **parameterized queries**
- Do **NOT** concatenate strings in SQL

---

## 8. Output Requirement ⚠️ VERY IMPORTANT

When generating code, **ALWAYS** provide both of the following:

| # | Deliverable                        | Description                               |
|---|------------------------------------|-------------------------------------------|
| 1 | **Node.js repository function**    | The JS/TS function that calls the DB      |
| 2 | **PostgreSQL function definition** | The full SQL `CREATE OR REPLACE FUNCTION` |

> Both are **mandatory**. Never provide one without the other.

---

## 9. No Duplication

- Do **NOT** repeat logic in Node.js that already exists in the DB function
- Keep **business logic in the service layer only**

---

## 10. Consistency

- Follow the **same function pattern** across all modules
- Keep naming **consistent** throughout the codebase

---

## 11. Audit Columns ⚠️ MANDATORY

Every DB function **MUST** handle the following audit columns automatically. These are **not optional**.

### On INSERT — always set:

| Column          | Value to Set                         |
| --------------- | ------------------------------------ |
| `is_deleted`    | `FALSE` (hardcoded default)          |
| `created_by`    | Pass as parameter (logged-in userId) |
| `created_date`  | `NOW()` / `CURRENT_TIMESTAMP`        |
| `modified_by`   | `NULL`                               |
| `modified_date` | `NULL`                               |

### On UPDATE — always set:

| Column          | Value to Set                         |
| --------------- | ------------------------------------ |
| `modified_by`   | Pass as parameter (logged-in userId) |
| `modified_date` | `NOW()` / `CURRENT_TIMESTAMP`        |

> ⚠️ Do **NOT** update `created_by` or `created_date` during an UPDATE. These are **immutable** once set.

### Example Pattern in PostgreSQL Function:

```sql
-- INSERT example
INSERT INTO [schema name].table_name (
    company_id,
    field_key,
    answer_value,
    is_deleted,
    created_by,
    created_date,
    modified_by,
    modified_date
)
VALUES (
    p_company_id,
    p_field_key,
    p_answer_value,
    FALSE,
    p_created_by,
    NOW(),
    NULL,
    NULL
);

-- UPDATE example
UPDATE [schema name].table_name
SET
    answer_value  = p_answer_value,
    modified_by   = p_modified_by,
    modified_date = NOW()
WHERE id = p_id
  AND company_id = p_company_id
  AND is_deleted = FALSE;
```

---

## 12. Soft Delete Operation

- Never use physical `DELETE` statements
- Always perform soft delete by setting `is_deleted = TRUE` along with audit columns:

```sql
UPDATE [schema name].table_name
SET
    is_deleted    = TRUE,
    modified_by   = p_modified_by,
    modified_date = NOW()
WHERE id = p_id
  AND company_id = p_company_id;
```
