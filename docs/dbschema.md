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
| is_active   | BOOLEAN     |                  |

---

### [Public Schema] - System_Config

| Column Name  | Data Type    | Key |
| ------------ | ------------ | --- |
| config_id    | INT          | PK  |
| config_key   | VARCHAR(150) |     |
| config_value | VARCHAR(500) |     |

---

### [Public Schema] - Mst_JobTitle

| Column Name      | Data Type    | Key                   | Description                        |
| ---------------- | ------------ | --------------------- | ---------------------------------- |
| id               | INT          | PK                    | Unique ID                          |
| industry_type_id | INT          | FK → Mst_IndustryType |                                    |
| title            | VARCHAR(150) |                       |                                    |
| is_deleted       | BOOLEAN      |                       | Soft delete flag (default: false)  |
| created_by       | INT          |                       | User who created the record        |
| created_date     | TIMESTAMP    |                       | Record creation timestamp          |
| modified_by      | INT          |                       | User who last modified the record  |
| modified_date    | TIMESTAMP    |                       | Record last modified timestamp     |

---

### [Public Schema] - Mst_Seniority

| Column Name   | Data Type    | Key | Description                        |
| ------------- | ------------ | --- | ---------------------------------- |
| id            | INT          | PK  | Unique ID                          |
| name          | VARCHAR(100) |     |                                    |
| is_deleted    | BOOLEAN      |     | Soft delete flag (default: false)  |
| created_by    | INT          |     | User who created the record        |
| created_date  | TIMESTAMP    |     | Record creation timestamp          |
| modified_by   | INT          |     | User who last modified the record  |
| modified_date | TIMESTAMP    |     | Record last modified timestamp     |

---

## Profile Module Tables

### [Mechsoft Schema] - company_profile_header

| Column Name     | Data Type | Key | Description                                                |
| --------------- | --------- | --- | ---------------------------------------------------------- |
| ProfileHeaderId | INT       | PK  | Unique ID                                                  |
| company_id      | INT       | FK  | Unique Company Identifier                                  |
| status_id       | INT       | FK  | Unique Status Identifier                                   |
| isCompleted     | BOOLEAN   |     | When user clicks on final submission, then it will be true |
| is_deleted      | BOOLEAN   |     | Soft delete flag (default: false)                          |
| created_by      | INT       |     | User who created the record                                |
| created_date    | TIMESTAMP |     | Record creation timestamp                                  |
| modified_by     | INT       |     | User who last modified the record                          |
| modified_date   | TIMESTAMP |     | Record last modified timestamp                             |

---

### [Mechsoft Schema] - tbl_profile_qa

| Column Name   | Data Type | Key | Description                          |
| ------------- | --------- | --- | ------------------------------------ |
| id            | INT       | PK  | Unique ID                            |
| company_id    | INT       | FK  | Unique Company Identifier            |
| field_key     | VARCHAR   |     | Unique identifier (e.g., office_loc) |
| question_text | TEXT      |     | The actual question AI will ask      |
| answer_value  | JSONB     |     | User validated answer                |
| is_deleted    | BOOLEAN   |     | Soft delete flag (default: false)    |
| created_by    | INT       |     | User who created the record          |
| created_date  | TIMESTAMP |     | Record creation timestamp            |
| modified_by   | INT       |     | User who last modified the record    |
| modified_date | TIMESTAMP |     | Record last modified timestamp       |

---

### [Mechsoft Schema] - tbl_profile_qa_audit

| Column Name   | Data Type | Key | Description                       |
| ------------- | --------- | --- | --------------------------------- |
| id            | INT       | PK  | Unique ID                         |
| qa_id         | INT       | FK  | Unique Answer Identifier          |
| company_id    | INT       | FK  | Unique Company Identifier         |
| question_text | TEXT      |     | The actual question AI will ask   |
| answer_value  | JSONB     |     | Old answer                        |
| change_reason | VARCHAR   |     | AI's explanation for the change   |
| is_deleted    | BOOLEAN   |     | Soft delete flag (default: false) |
| created_by    | INT       |     | User who created the record       |
| created_date  | TIMESTAMP |     | Record creation timestamp         |
| modified_by   | INT       |     | User who last modified the record |
| modified_date | TIMESTAMP |     | Record last modified timestamp    |

---

### [Mechsoft Schema] - tbl_profile_ai_chat_session

| Column Name   | Data Type | Key | Description                          |
| ------------- | --------- | --- | ------------------------------------ |
| id            | INT       | PK  | Unique ID                            |
| company_id    | INT       | FK  | Unique Company Identifier            |
| context_data  | JSONB     |     | Full conversational thread/context   |
| field_key     | VARCHAR   |     | Unique identifier (e.g., office_loc) |
| is_deleted    | BOOLEAN   |     | Soft delete flag (default: false)    |
| created_by    | INT       |     | User who created the record          |
| created_date  | TIMESTAMP |     | Record creation timestamp            |
| modified_by   | INT       |     | User who last modified the record    |
| modified_date | TIMESTAMP |     | Record last modified timestamp       |

---

## JD Module Tables

### [Mechsoft Schema] - tbl_jd_header

| Column Name    | Data Type | Key                    | Description                       |
| -------------- | --------- | ---------------------- | --------------------------------- |
| jd_id          | INT       | PK                     | Unique ID                         |
| company_id     | INT       | FK → Company_Master    |                                   |
| job_title_id   | INT       | FK → Mst_JobTitle      |                                   |
| seniority_id   | INT       | FK → Mst_Seniority     |                                   |
| min_exp        | INT       |                        |                                   |
| max_exp        | INT       |                        |                                   |
| is_active      | BOOLEAN   |                        |                                   |
| status_id      | INT       | FK → Mst_Status        |                                   |
| start_date     | DATETIME  |                        |                                   |
| end_date       | DATETIME  |                        |                                   |
| is_deleted     | BOOLEAN   |                        | Soft delete flag (default: false) |
| created_by     | INT       |                        | User who created the record       |
| created_date   | TIMESTAMP |                        | Record creation timestamp         |
| modified_by    | INT       |                        | User who last modified the record |
| modified_date  | TIMESTAMP |                        | Record last modified timestamp    |

---

### [Mechsoft Schema] - tbl_jd_qa

| Column Name   | Data Type | Key             | Description                       |
| ------------- | --------- | --------------- | --------------------------------- |
| id            | INT       | PK              | Unique ID                         |
| jd_id         | INT       | FK → tbl_jd_header |                                |
| field_key     | VARCHAR   |                 |                                   |
| question_text | VARCHAR   |                 |                                   |
| answer_value  | VARCHAR   |                 |                                   |
| mode          | VARCHAR   |                 |                                   |
| is_deleted    | BOOLEAN   |                 | Soft delete flag (default: false) |
| created_by    | INT       |                 | User who created the record       |
| created_date  | TIMESTAMP |                 | Record creation timestamp         |
| modified_by   | INT       |                 | User who last modified the record |
| modified_date | TIMESTAMP |                 | Record last modified timestamp    |

---

### [Mechsoft Schema] - tbl_jd_qa_audit

| Column Name   | Data Type | Key             | Description                       |
| ------------- | --------- | --------------- | --------------------------------- |
| audit_id      | INT       | PK              | Unique ID                         |
| jd_id         | INT       | FK → tbl_jd_header |                                |
| field_key     | VARCHAR   |                 |                                   |
| question_text | VARCHAR   |                 |                                   |
| answer_value  | VARCHAR   |                 |                                   |
| mode          | VARCHAR   |                 |                                   |
| is_deleted    | BOOLEAN   |                 | Soft delete flag (default: false) |
| created_by    | INT       |                 | User who created the record       |
| created_date  | TIMESTAMP |                 | Record creation timestamp         |
| modified_by   | INT       |                 | User who last modified the record |
| modified_date | TIMESTAMP |                 | Record last modified timestamp    |

---

### [Mechsoft Schema] - tbl_jd_ai_chat_data

| Column Name   | Data Type | Key                | Description                                          |
| ------------- | --------- | ------------------ | ---------------------------------------------------- |
| id            | INT       | PK                 | Unique ID                                            |
| jd_id         | INT       | FK → tbl_jd_header |                                                      |
| qa_history    | JSONB     |                    | The full chat log between the AI and User (JSON)     |
| jd_theory     | TEXT      |                    | The final AI-generated job description theory     |
| field_key     | VARCHAR   |                    |                                                      |
| is_deleted    | BOOLEAN   |                    | Soft delete flag (default: false)                    |
| created_by    | INT       |                    | User who created the record                          |
| created_date  | TIMESTAMP |                    | Record creation timestamp                            |
| modified_by   | INT       |                    | User who last modified the record                    |
| modified_date | TIMESTAMP |                    | Record last modified timestamp                       |

---

### [Mechsoft Schema] - tbl_jd_weightage_header

| Column Name    | Data Type | Key                | Description                     |
| -------------- | --------- | ------------------ | ------------------------------- |
| weightage_id   | INT       | PK                 | Unique ID                       |
| jd_id          | INT       | FK → tbl_jd_header | Refers to the ID from JD_Master |
| weightage_json | JSONB     |                    |                                 |

---

### [Mechsoft Schema] - tbl_jd_weightage_Capability

| Column Name  | Data Type | Key                                  | Description                                              |
| ------------ | --------- | ------------------------------------ | -------------------------------------------------------- |
| id           | INT       | PK                                   | Unique ID                                                |
| weightage_id | INT       | FK → tbl_jd_weightage_header         | Refers to the weightage_id from tbl_jd_weightage_header  |
| capability   | VARCHAR   |                                      |                                                          |
| weight       | DECIMAL   |                                      |                                                          |
| required     | []        |                                      |                                                          |
| optional     | []        |                                      |                                                          |
| description  | VARCHAR   |                                      |                                                          |

---

### [Mechsoft Schema] - tbl_jd_weightage_Capability_Audit

| Column Name  | Data Type | Key                                  | Description                                              |
| ------------ | --------- | ------------------------------------ | -------------------------------------------------------- |
| audit_id     | INT       | PK                                   | Unique ID                                                |
| id           | INT       |                                      |                                                          |
| weightage_id | INT       | FK → tbl_jd_weightage_header         | Refers to the weightage_id from tbl_jd_weightage_header  |
| capability   | VARCHAR   |                                      |                                                          |
| weight       | DECIMAL   |                                      |                                                          |
| required     | []        |                                      |                                                          |
| optional     | []        |                                      |                                                          |
| description  | VARCHAR   |                                      |                                                          |

---

## Candidate Module Tables

### [Mechsoft Schema] - tbl_candidates_header

| Column Name       | Data Type     | Key                | Description                       |
| ----------------- | ------------- | ------------------ | --------------------------------- |
| candidate_id      | BIGSERIAL     | PK                 | Unique Candidate ID               |
| jd_id             | BIGINT        | FK → tbl_jd_header |                                   |
| full_name         | VARCHAR(255)  |                    |                                   |
| email             | VARCHAR(255)  |                    |                                   |
| phone             | VARCHAR(50)   |                    |                                   |
| location          | VARCHAR(255)  |                    |                                   |
| linkedin_url      | TEXT          |                    |                                   |
| github_url        | TEXT          |                    |                                   |
| portfolio_links   | TEXT[]        |                    |                                   |
| current_job_title | VARCHAR(255)  |                    |                                   |
| current_company   | VARCHAR(255)  |                    |                                   |
| total_experience  | NUMERIC(5,2)  |                    |                                   |
| resume_file_name  | TEXT          |                    |                                   |
| resume_file_path  | TEXT          |                    |                                   |
| candidate_json    | JSONB         |                    |                                   |
| is_deleted        | BOOLEAN       |                    | Soft delete flag (default: false) |
| created_by        | BIGINT        |                    | User who created the record       |
| created_date      | TIMESTAMP     |                    | Record creation timestamp         |
| modified_by       | BIGINT        |                    | User who last modified the record |
| modified_date     | TIMESTAMP     |                    | Record last modified timestamp    |

---

### [Mechsoft Schema] - tbl_candidate_skills

| Column Name        | Data Type    | Key                        | Description                       |
| ------------------ | ------------ | -------------------------- | --------------------------------- |
| candidate_skill_id | BIGSERIAL    | PK                         | Unique ID                         |
| candidate_id       | BIGINT       | FK → tbl_candidates_header |                                   |
| skill_type         | VARCHAR(50)  |                            |                                   |
| skills             | TEXT[]       |                            |                                   |
| is_deleted         | BOOLEAN      |                            | Soft delete flag (default: false) |
| created_by         | BIGINT       |                            | User who created the record       |
| created_date       | TIMESTAMP    |                            | Record creation timestamp         |
| modified_by        | BIGINT       |                            | User who last modified the record |
| modified_date      | TIMESTAMP    |                            | Record last modified timestamp    |

---

### [Mechsoft Schema] - tbl_candidate_education

| Column Name      | Data Type    | Key                        | Description                       |
| ---------------- | ------------ | -------------------------- | --------------------------------- |
| education_id     | BIGSERIAL    | PK                         | Unique ID                         |
| candidate_id     | BIGINT       | FK → tbl_candidates_header |                                   |
| degree           | VARCHAR(255) |                            |                                   |
| field_of_study   | VARCHAR(255) |                            |                                   |
| institution_name | VARCHAR(255) |                            |                                   |
| is_deleted       | BOOLEAN      |                            | Soft delete flag (default: false) |
| created_by       | BIGINT       |                            | User who created the record       |
| created_date     | TIMESTAMP    |                            | Record creation timestamp         |
| modified_by      | BIGINT       |                            | User who last modified the record |
| modified_date    | TIMESTAMP    |                            | Record last modified timestamp    |

---

### [Mechsoft Schema] - tbl_candidate_experience

| Column Name   | Data Type    | Key                        | Description                       |
| ------------- | ------------ | -------------------------- | --------------------------------- |
| experience_id | BIGSERIAL    | PK                         | Unique ID                         |
| candidate_id  | BIGINT       | FK → tbl_candidates_header |                                   |
| company_name  | VARCHAR(255) |                            |                                   |
| job_title     | VARCHAR(255) |                            |                                   |
| work_location | VARCHAR(255) |                            |                                   |
| start_date    | VARCHAR(100) |                            |                                   |
| end_date      | VARCHAR(100) |                            |                                   |
| company_size  | VARCHAR(100) |                            |                                   |
| is_deleted    | BOOLEAN      |                            | Soft delete flag (default: false) |
| created_by    | BIGINT       |                            | User who created the record       |
| created_date  | TIMESTAMP    |                            | Record creation timestamp         |
| modified_by   | BIGINT       |                            | User who last modified the record |
| modified_date | TIMESTAMP    |                            | Record last modified timestamp    |

---

### [Mechsoft Schema] - tbl_candidate_responsibilities

| Column Name       | Data Type | Key                        | Description                       |
| ----------------- | --------- | -------------------------- | --------------------------------- |
| responsibility_id | BIGSERIAL | PK                         | Unique ID                         |
| candidate_id      | BIGINT    | FK → tbl_candidates_header |                                   |
| responsibilities  | TEXT[]    |                            |                                   |
| is_deleted        | BOOLEAN   |                            | Soft delete flag (default: false) |
| created_by        | BIGINT    |                            | User who created the record       |
| created_date      | TIMESTAMP |                            | Record creation timestamp         |
| modified_by       | BIGINT    |                            | User who last modified the record |
| modified_date     | TIMESTAMP |                            | Record last modified timestamp    |

---

### [Mechsoft Schema] - tbl_candidate_score_header

| Column Name   | Data Type     | Key                        | Description                       |
| ------------- | ------------- | -------------------------- | --------------------------------- |
| score_id      | BIGSERIAL     | PK                         | Unique Score ID                   |
| candidate_id  | BIGINT        | FK → tbl_candidates_header |                                   |
| base_score    | NUMERIC(10,2) |                            |                                   |
| final_score   | NUMERIC(10,2) |                            |                                   |
| verdict       | VARCHAR(100)  |                            |                                   |
| score_json    | JSONB         |                            |                                   |
| is_deleted    | BOOLEAN       |                            | Soft delete flag (default: false) |
| created_by    | INT           |                            | User who created the record       |
| created_date  | TIMESTAMP     |                            | Record creation timestamp         |
| modified_by   | INT           |                            | User who last modified the record |
| modified_date | TIMESTAMP     |                            | Record last modified timestamp    |

---

### [Mechsoft Schema] - tbl_candidate_score_header_audit

| Column Name   | Data Type     | Key                                 | Description                       |
| ------------- | ------------- | ----------------------------------- | --------------------------------- |
| audit_id      | BIGSERIAL     | PK                                  | Unique Audit ID                   |
| score_id      | BIGINT        | FK → tbl_candidate_score_header     |                                   |
| candidate_id  | BIGINT        | FK → tbl_candidates_header          |                                   |
| base_score    | NUMERIC(10,2) |                                     |                                   |
| final_score   | NUMERIC(10,2) |                                     |                                   |
| verdict       | VARCHAR(100)  |                                     |                                   |
| score_json    | JSONB         |                                     |                                   |
| is_deleted    | BOOLEAN       |                                     | Soft delete flag (default: false) |
| created_by    | INT           |                                     | User who created the record       |
| created_date  | TIMESTAMP     |                                     | Record creation timestamp         |
| modified_by   | INT           |                                     | User who last modified the record |
| modified_date | TIMESTAMP     |                                     | Record last modified timestamp    |
| audited_by    | INT           |                                     | User who performed the audit      |
| audited_date  | TIMESTAMP     |                                     | Audit timestamp                   |

---

### [Mechsoft Schema] - tbl_candidate_score_group

| Column Name         | Data Type     | Key                                  | Description                       |
| ------------------- | ------------- | ------------------------------------ | --------------------------------- |
| group_score_id      | BIGSERIAL     | PK                                   | Unique Group Score ID             |
| score_id            | BIGINT        | FK → tbl_candidate_score_header      |                                   |
| group_key           | VARCHAR(200)  |                                      |                                   |
| group_score         | NUMERIC(10,3) |                                      |                                   |
| weight              | NUMERIC(10,2) |                                      |                                   |
| penalty_factor      | NUMERIC(10,3) |                                      |                                   |
| final_contribution  | NUMERIC(10,2) |                                      |                                   |
| missing_required    | TEXT[]        |                                      |                                   |
| present_required    | TEXT[]        |                                      |                                   |
| optional_present    | TEXT[]        |                                      |                                   |
| optional_missing    | TEXT[]        |                                      |                                   |
| llm_classifications | JSONB         |                                      |                                   |
| is_deleted          | BOOLEAN       |                                      | Soft delete flag (default: false) |
| created_by          | INT           |                                      | User who created the record       |
| created_date        | TIMESTAMP     |                                      | Record creation timestamp         |
| modified_by         | INT           |                                      | User who last modified the record |
| modified_date       | TIMESTAMP     |                                      | Record last modified timestamp    |

---

### [Mechsoft Schema] - tbl_candidate_score_group_audit

| Column Name         | Data Type     | Key                                  | Description                       |
| ------------------- | ------------- | ------------------------------------ | --------------------------------- |
| audit_id            | BIGSERIAL     | PK                                   | Unique Audit ID                   |
| group_score_id      | BIGINT        | FK → tbl_candidate_score_group       |                                   |
| score_id            | BIGINT        | FK → tbl_candidate_score_header      |                                   |
| group_key           | VARCHAR(200)  |                                      |                                   |
| group_score         | NUMERIC(10,3) |                                      |                                   |
| weight              | NUMERIC(10,2) |                                      |                                   |
| penalty_factor      | NUMERIC(10,3) |                                      |                                   |
| final_contribution  | NUMERIC(10,2) |                                      |                                   |
| missing_required    | TEXT[]        |                                      |                                   |
| present_required    | TEXT[]        |                                      |                                   |
| optional_present    | TEXT[]        |                                      |                                   |
| optional_missing    | TEXT[]        |                                      |                                   |
| llm_classifications | JSONB         |                                      |                                   |
| is_deleted          | BOOLEAN       |                                      | Soft delete flag (default: false) |
| created_by          | INT           |                                      | User who created the record       |
| created_date        | TIMESTAMP     |                                      | Record creation timestamp         |
| modified_by         | INT           |                                      | User who last modified the record |
| modified_date       | TIMESTAMP     |                                      | Record last modified timestamp    |
| audited_by          | INT           |                                      | User who performed the audit      |
| audited_date        | TIMESTAMP     |                                      | Audit timestamp                   |

---

### [Mechsoft Schema] - tbl_candidate_feedbacktype

| Column Name      | Data Type    | Key | Description                       |
| ---------------- | ------------ | --- | --------------------------------- |
| feedback_type_id | BIGSERIAL    | PK  | Unique Feedback Type ID           |
| feedback_type    | VARCHAR(200) |     |                                   |
| is_active        | BOOLEAN      |     |                                   |
| is_deleted       | BOOLEAN      |     | Soft delete flag                  |
| created_by       | INT          |     | User who created the record       |
| created_date     | TIMESTAMP    |     | Record creation timestamp         |
| modified_by      | INT          |     | User who last modified the record |
| modified_date    | TIMESTAMP    |     | Record last modified timestamp    |

---

### [Mechsoft Schema] - tbl_candidate_hr_feedbacks

| Column Name      | Data Type | Key                                       | Description                       |
| ---------------- | --------- | ----------------------------------------- | --------------------------------- |
| id               | BIGSERIAL | PK                                        | Unique Feedback ID                |
| candidate_id     | BIGINT    | FK → tbl_candidates_header                |                                   |
| feedback_type_id | BIGINT    | FK → tbl_candidate_feedbacktype           |                                   |
| user_feedback    | TEXT      |                                           |                                   |
| is_deleted       | BOOLEAN   |                                           | Soft delete flag                  |
| created_by       | INT       |                                           | User who created the record       |
| created_date     | TIMESTAMP |                                           | Record creation timestamp         |
| modified_by      | INT       |                                           | User who last modified the record |
| modified_date    | TIMESTAMP |                                           | Record last modified timestamp    |

---

## Relationships Summary

| From Table                  | Relationship                               |
| --------------------------- | ------------------------------------------ |
| Company_Master              | → Industry, Size, Country, State           |
| Mst_Users                   | → Company_Master, tbl_Roles                |
| tbl_Roles                   | → Company_Master                           |
| tbl_Role_Permission         | → Roles + Modules + Permissions            |
| tbl_CompanyModules          | → Roles + Modules                          |
| Mst_Dept                    | → Industry + Company                       |
| Mst_Designation             | → Department                               |
| Mst_State                   | → Country                                  |
| Mst_City                    | → State                                    |
| Mst_JobTitle                | → Mst_IndustryType                         |
| company_profile_header      | → Company_Master, Mst_Status               |
| tbl_profile_qa              | → Company_Master                           |
| tbl_profile_qa_audit        | → tbl_profile_qa, Company_Master           |
| tbl_profile_ai_chat_session | → Company_Master                           |
| tbl_jd_header               | → Company_Master, Mst_JobTitle, Mst_Seniority, Mst_Status |
| tbl_jd_qa                   | → tbl_jd_header                            |
| tbl_jd_qa_audit             | → tbl_jd_header                            |
| tbl_jd_ai_chat_data         | → tbl_jd_header                            |
| tbl_jd_weightage_header          | → tbl_jd_header                            |
| tbl_jd_weightage_Capability      | → tbl_jd_weightage_header                  |
| tbl_jd_weightage_Capability_Audit | → tbl_jd_weightage_header                 |
| tbl_candidates_header       | → tbl_jd_header                            |
| tbl_candidate_skills        | → tbl_candidates_header                    |
| tbl_candidate_education     | → tbl_candidates_header                    |
| tbl_candidate_experience    | → tbl_candidates_header                    |
| tbl_candidate_responsibilities | → tbl_candidates_header                 |
| tbl_candidate_score_header     | → tbl_candidates_header                 |
| tbl_candidate_score_header_audit | → tbl_candidate_score_header          |
| tbl_candidate_score_group      | → tbl_candidate_score_header            |
| tbl_candidate_score_group_audit  | → tbl_candidate_score_group, tbl_candidate_score_header |
| tbl_candidate_feedbacktype       | (lookup table)                                          |
| tbl_candidate_hr_feedbacks       | → tbl_candidates_header, tbl_candidate_feedbacktype     |

---

## Rules for AI / Development Guidelines

- Always use `company_id` for **tenant isolation**
- Do **NOT** fetch deleted or inactive records (`is_deleted = false`, `is_active = true`)
- RBAC flow: **Role → Module → Permission**
- Use **DB functions** instead of raw SQL queries
