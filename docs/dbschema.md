# Database Schema

**Project:** Resume Tracker API
**Database:** PostgreSQL
**Architecture:** Distributed Modular Monolith

---

## Notes

- All tables follow soft delete using `is_deleted` or `is_active`
- Multi-tenancy is handled using `company_id`
- RBAC is implemented using: **Roles → Modules → Permissions**
- Always filter active data where applicable

---

## Core Tables

### [Public Schema] - Company_Master

| Column Name      | Data Type    | Key                   |
| ---------------- | ------------ | --------------------- |
| company_id       | INT          | PK                    |
| company_name     | VARCHAR(200) |                       |
| industry_type_id | INT          | FK → Mst_IndustryType |
| company_size_id  | INT          | FK → Mst_Company_Size |
| company_email    | VARCHAR(150) |                       |
| phone_number     | VARCHAR(20)  |                       |
| company_address  | TEXT         |                       |
| pincode          | VARCHAR(10)  |                       |
| country_id       | INT          | FK → Mst_Country      |
| state_id         | INT          | FK → Mst_State        |
| city             | VARCHAR(100) |                       |
| admin_name       | VARCHAR(150) |                       |
| status_id        | VARCHAR(30)  |                       |
| approved_by      | INT          | FK                    |
| approved_date    | DATETIME     |                       |
| submitted_date   | DATETIME     |                       |
| is_deleted       | BOOLEAN      |                       |
| subdomain        | VARCHAR(200) | UNIQUE                |
| schema_name      | VARCHAR(200) |                       |

---

### [Public Schema] - Mst_Users

| Column Name | Data Type    | Key                 |
| ----------- | ------------ | ------------------- |
| user_id     | INT          | PK                  |
| username    | VARCHAR(150) |                     |
| password    | VARCHAR(255) |                     |
| status      | VARCHAR(20)  |                     |
| emp_id      | INT          | FK                  |
| company_id  | INT          | FK → Company_Master |
| role_id     | INT          | FK → tbl_Roles      |

---

### [Public Schema] - tbl_Roles

| Column Name | Data Type    | Key                 |
| ----------- | ------------ | ------------------- |
| role_id     | INT          | PK                  |
| company_id  | INT          | FK → Company_Master |
| role_name   | VARCHAR(100) |                     |
| is_active   | BOOLEAN      |                     |

---

### [Public Schema] - Mst_Permission

| Column Name     | Data Type   | Key |
| --------------- | ----------- | --- |
| permission_id   | INT         | PK  |
| permission_name | VARCHAR(50) |     |
| permission_code | VARCHAR(50) |     |

---

### [Public Schema] - Mst_Modules

| Column Name   | Data Type    | Key |
| ------------- | ------------ | --- |
| module_id     | INT          | PK  |
| module_name   | VARCHAR(50)  |     |
| module_code   | VARCHAR(500) |     |
| path          | VARCHAR(500) |     |
| icon          | VARCHAR(100) |     |
| display_order | INT          |     |
| is_active     | BOOLEAN      |     |

---

### [Public Schema] - tbl_Role_Permission

| Column Name   | Data Type | Key                 |
| ------------- | --------- | ------------------- |
| id            | INT       | PK                  |
| role_id       | INT       | FK → tbl_Roles      |
| module_id     | INT       | FK → Mst_Modules    |
| permission_id | INT       | FK → Mst_Permission |
| is_allowed    | BOOLEAN   |                     |

---

### [Public Schema] - tbl_CompanyModules

| Column Name | Data Type | Key              |
| ----------- | --------- | ---------------- |
| id          | INT       | PK               |
| role_id     | INT       | FK → tbl_Roles   |
| module_id   | INT       | FK → Mst_Modules |
| is_active   | BOOLEAN   |                  |

---

## Lookup Tables

### [Public Schema] - Mst_IndustryType

| Column Name        | Data Type    | Key |
| ------------------ | ------------ | --- |
| industry_type_id   | INT          | PK  |
| industry_type_name | VARCHAR(100) |     |
| is_active          | BOOLEAN      |     |

---

### [Public Schema] - Mst_Company_Size

| Column Name     | Data Type   | Key |
| --------------- | ----------- | --- |
| company_size_id | INT         | PK  |
| size_label      | VARCHAR(50) |     |
| is_active       | BOOLEAN     |     |

---

### [Public Schema] - Mst_Country

| Column Name  | Data Type    | Key |
| ------------ | ------------ | --- |
| country_id   | INT          | PK  |
| country_name | VARCHAR(100) |     |
| country_code | CHAR(3)      |     |
| is_active    | BOOLEAN      |     |

---

### [Public Schema] - Mst_State

| Column Name | Data Type    | Key              |
| ----------- | ------------ | ---------------- |
| state_id    | INT          | PK               |
| country_id  | INT          | FK → Mst_Country |
| state_name  | VARCHAR(100) |                  |
| state_code  | VARCHAR(10)  |                  |
| is_active   | BOOLEAN      |                  |

---

### [Public Schema] - Mst_City

| Column Name | Data Type    | Key            |
| ----------- | ------------ | -------------- |
| city_id     | INT          | PK             |
| state_id    | INT          | FK → Mst_State |
| city_name   | VARCHAR(100) |                |
| is_active   | BOOLEAN      |                |

---

### [Public Schema] - Mst_Dept

| Column Name      | Data Type    | Key                   |
| ---------------- | ------------ | --------------------- |
| department_id    | INT          | PK                    |
| industry_type_id | INT          | FK → Mst_IndustryType |
| department_name  | VARCHAR(100) |                       |
| company_id       | INT          | FK → Company_Master   |
| is_active        | BOOLEAN      |                       |

---

### [Public Schema] - Mst_Designation

| Column Name      | Data Type    | Key           |
| ---------------- | ------------ | ------------- |
| designation_id   | INT          | PK            |
| department_id    | INT          | FK → Mst_Dept |
| designation_name | VARCHAR(100) |               |
| is_active        | BOOLEAN      |               |

---

### [Public Schema] - Mst_Status

| Column Name | Data Type   | Key              |
| ----------- | ----------- | ---------------- |
| status_id   | INT         | PK               |
| status_name | VARCHAR(50) |                  |
| module_id   | INT         | FK → Mst_Modules |
| is_active   | BOOLEAN      |                  |

---

### [Public Schema] - System_Config

| Column Name  | Data Type    | Key |
| ------------ | ------------ | --- |
| config_id    | INT          | PK  |
| config_key   | VARCHAR(150) |     |
| config_value | VARCHAR(500) |     |

---


## Profile Module Tables

### [Mechsoft Schema] - company_profile_header

| Column Name       | Data Type | Key | Description                                                     |
| ----------------- | --------- | --- | --------------------------------------------------------------- |
| ProfileHeaderId   | INT       | PK  | Unique ID                                                       |
| company_id        | INT       | FK  | Unique Company Identifier                                       |
| status_id         | INT       | FK  | Unique Status Identifier                                        |
| isCompleted       | BOOLEAN   |     | When user clicks on final submission, then it will be true      |
| is_deleted        | BOOLEAN   |     | Soft delete flag (default: false)                               |
| created_by        | INT       |     | User who created the record                                     |
| created_date      | TIMESTAMP |     | Record creation timestamp                                       |
| modified_by       | INT       |     | User who last modified the record                               |
| modified_date     | TIMESTAMP |     | Record last modified timestamp                                  |

---

### [Mechsoft Schema] - tbl_profile_qa

| Column Name   | Data Type | Key | Description                              |
| ------------- | --------- | --- | ---------------------------------------- |
| id            | INT       | PK  | Unique ID                                |
| company_id    | INT       | FK  | Unique Company Identifier                |
| field_key     | VARCHAR   |     | Unique identifier (e.g., office_loc)     |
| question_text | VARCHAR   |     | The actual question AI will ask          |
| answer_value  | VARCHAR   |     | User validated answer                    |
| is_deleted    | BOOLEAN   |     | Soft delete flag (default: false)        |
| created_by    | INT       |     | User who created the record              |
| created_date  | TIMESTAMP |     | Record creation timestamp                |
| modified_by   | INT       |     | User who last modified the record        |
| modified_date | TIMESTAMP |     | Record last modified timestamp           |

---

### [Mechsoft Schema] - tbl_profile_qa_audit

| Column Name   | Data Type | Key | Description                             |
| ------------- | --------- | --- | --------------------------------------- |
| id            | INT       | PK  | Unique ID                               |
| qa_id         | INT       | FK  | Unique Answer Identifier                |
| company_id    | INT       | FK  | Unique Company Identifier               |
| answer_value  | VARCHAR   |     | Old answer                              |
| change_reason | VARCHAR   |     | AI's explanation for the change         |
| is_deleted    | BOOLEAN   |     | Soft delete flag (default: false)       |
| created_by    | INT       |     | User who created the record             |
| created_date  | TIMESTAMP |     | Record creation timestamp               |
| modified_by   | INT       |     | User who last modified the record       |
| modified_date | TIMESTAMP |     | Record last modified timestamp          |

---

### [Mechsoft Schema] - tbl_profile_ai_chat_session

| Column Name   | Data Type | Key | Description                              |
| ------------- | --------- | --- | ---------------------------------------- |
| id            | INT       | PK  | Unique ID                                |
| company_id    | INT       | FK  | Unique Company Identifier                |
| context_data  | JSONB     |     | Full conversational thread/context       |
| field_key     | VARCHAR   |     | Unique identifier (e.g., office_loc)     |
| is_deleted    | BOOLEAN   |     | Soft delete flag (default: false)        |
| created_by    | INT       |     | User who created the record              |
| created_date  | TIMESTAMP |     | Record creation timestamp                |
| modified_by   | INT       |     | User who last modified the record        |
| modified_date | TIMESTAMP |     | Record last modified timestamp           |

---

## Relationships Summary

| From Table                  | Relationship                          |
| --------------------------- | ------------------------------------- |
| Company_Master              | → Industry, Size, Country, State      |
| Mst_Users                   | → Company_Master, tbl_Roles           |
| tbl_Roles                   | → Company_Master                      |
| tbl_Role_Permission         | → Roles + Modules + Permissions       |
| tbl_CompanyModules          | → Roles + Modules                     |
| Mst_Dept                    | → Industry + Company                  |
| Mst_Designation             | → Department                          |
| Mst_State                   | → Country                             |
| Mst_City                    | → State                               |
| company_profile_header      | → Company_Master, Mst_Status          |
| tbl_profile_qa              | → Company_Master                      |
| tbl_profile_qa_audit        | → tbl_profile_qa, Company_Master      |
| tbl_profile_ai_chat_session | → Company_Master                      |


---

## Rules for AI / Development Guidelines

- Always use `company_id` for **tenant isolation**
- Do **NOT** fetch deleted or inactive records (`is_deleted = false`, `is_active = true`)
- RBAC flow: **Role → Module → Permission**
- Use **DB functions** instead of raw SQL queries
