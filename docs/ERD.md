# Entity Relationship Diagram

> Generated from the live `smart_workforce` database by
> `server/scripts/generateErd.mjs`. Re-run that script after any schema change.

- **13** base tables
- **8** reporting views (read models, no writes)
- All allocation logic lives in PostgreSQL functions; see
  [Allocation engine](#allocation-engine) below.

## Tables

```mermaid
erDiagram
  COMMENTS {
    integer comment_id PK
    integer task_id FK
    integer user_id FK
    text body
    timestamp with time zone created_at
    timestamp with time zone updated_at
  }
  DEPARTMENTS {
    integer department_id PK
    character varying(10) code
    character varying(120) name
    text description
    numeric(10,2) budget_hours
    timestamp with time zone created_at
  }
  EMPLOYEE_AVAILABILITY {
    integer availability_id PK
    integer employee_id FK
    date date_from
    date date_to
    availability_status status
    numeric(6,2) available_hours
    character varying(200) reason
  }
  EMPLOYEE_SKILLS {
    integer employee_id PK
    integer skill_id PK
    numeric(3,1) proficiency_level
    numeric(4,1) years_experience
    date last_used_on
    boolean is_primary
    timestamp with time zone created_at
    timestamp with time zone updated_at
  }
  EMPLOYEES {
    integer employee_id PK
    character varying(20) employee_code
    character varying(60) first_name
    character varying(60) last_name
    character varying(150) email
    character varying(25) phone
    character varying(100) job_title
    integer department_id FK
    integer manager_id FK
    date hire_date
    employment_status employment_status
    numeric(6,2) weekly_capacity_hours
    boolean is_available
    text avatar_url
    timestamp with time zone created_at
    timestamp with time zone updated_at
  }
  PROJECTS {
    integer project_id PK
    character varying(20) code
    character varying(150) name
    text description
    integer department_id FK
    integer lead_id FK
    date start_date
    date end_date
    numeric(10,2) budget_hours
    project_status status
    timestamp with time zone created_at
  }
  SKILLS {
    integer skill_id PK
    character varying(80) name
    skill_category category
    text description
    boolean is_active
    timestamp with time zone created_at
  }
  TASK_ASSIGNMENTS {
    integer assignment_id PK
    integer task_id FK
    integer employee_id FK
    integer assigned_by FK
    assignment_mode mode
    assignment_state state
    numeric(6,2) suitability_score
    jsonb score_breakdown
    timestamp with time zone assigned_at
    timestamp with time zone released_at
    text note
  }
  TASK_HISTORY {
    integer history_id PK
    integer task_id FK
    integer changed_by FK
    integer changed_by_employee FK
    character varying(40) action
    task_status from_status
    task_status to_status
    text remarks
    timestamp with time zone changed_at
  }
  TASK_SKILLS {
    integer task_id PK
    integer skill_id PK
    numeric(3,1) required_level
    boolean is_mandatory
  }
  TASKS {
    integer task_id PK
    integer project_id FK
    character varying(200) title
    text description
    task_status status
    task_priority priority
    numeric(6,2) estimated_hours
    numeric(8,2) actual_hours
    numeric(5,2) progress_percent
    date deadline
    integer assigned_employee_id FK
    timestamp with time zone assigned_at
    timestamp with time zone started_at
    timestamp with time zone completed_at
    integer created_by FK
    timestamp with time zone created_at
    timestamp with time zone updated_at
  }
  USERS {
    integer user_id PK
    character varying(150) email
    text password_hash
    character varying(120) full_name
    user_role role
    integer employee_id FK
    boolean is_active
    timestamp with time zone last_login_at
    timestamp with time zone created_at
  }
  WORK_LOGS {
    integer work_log_id PK
    integer task_id FK
    integer employee_id FK
    date log_date
    numeric(5,2) hours_spent
    text work_description
    timestamp with time zone created_at
  }

  TASKS project_id }o--|| PROJECTS project_id : "project_id"
  TASKS assigned_employee_id }o--o| EMPLOYEES employee_id : "assigned_employee_id"
  TASKS created_by }o--o| USERS user_id : "created_by"
  TASK_SKILLS task_id }o--|| TASKS task_id : "task_id"
  TASK_SKILLS skill_id }o--|| SKILLS skill_id : "skill_id"
  COMMENTS task_id }o--|| TASKS task_id : "task_id"
  COMMENTS user_id }o--o| USERS user_id : "user_id"
  EMPLOYEES department_id }o--|| DEPARTMENTS department_id : "department_id"
  USERS employee_id }o--o| EMPLOYEES employee_id : "employee_id"
  EMPLOYEE_SKILLS employee_id }o--|| EMPLOYEES employee_id : "employee_id"
  EMPLOYEE_SKILLS skill_id }o--|| SKILLS skill_id : "skill_id"
  EMPLOYEE_AVAILABILITY employee_id }o--|| EMPLOYEES employee_id : "employee_id"
  PROJECTS department_id }o--|| DEPARTMENTS department_id : "department_id"
  PROJECTS lead_id }o--o| EMPLOYEES employee_id : "lead_id"
  TASK_ASSIGNMENTS task_id }o--|| TASKS task_id : "task_id"
  TASK_ASSIGNMENTS employee_id }o--|| EMPLOYEES employee_id : "employee_id"
  TASK_ASSIGNMENTS assigned_by }o--o| USERS user_id : "assigned_by"
  WORK_LOGS task_id }o--|| TASKS task_id : "task_id"
  WORK_LOGS employee_id }o--|| EMPLOYEES employee_id : "employee_id"
  TASK_HISTORY task_id }o--|| TASKS task_id : "task_id"
  TASK_HISTORY changed_by }o--o| USERS user_id : "changed_by"
  TASK_HISTORY changed_by_employee }o--o| EMPLOYEES employee_id : "changed_by_employee"
```

### Check constraints

| Table | Constraint |
| --- | --- |
| `comments` | ((length(TRIM(BOTH FROM body)) > 0)) |
| `departments` | ((budget_hours >= (0)::numeric)) |
| `employee_availability` | ((date_to >= date_from)) |
| `employee_availability` | (((available_hours >= (0)::numeric) AND (available_hours <= (80)::numeric))) |
| `employee_skills` | (((proficiency_level >= (1)::numeric) AND (proficiency_level <= (5)::numeric))) |
| `employee_skills` | ((years_experience >= (0)::numeric)) |
| `employees` | (((manager_id IS NULL) OR (manager_id <> employee_id))) |
| `employees` | (((weekly_capacity_hours > (0)::numeric) AND (weekly_capacity_hours <= (80)::numeric))) |
| `projects` | (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date))) |
| `projects` | ((budget_hours >= (0)::numeric)) |
| `task_assignments` | (((suitability_score >= (0)::numeric) AND (suitability_score <= (100)::numeric))) |
| `task_skills` | (((required_level >= (1)::numeric) AND (required_level <= (5)::numeric))) |
| `tasks` | ((actual_hours >= (0)::numeric)) |
| `tasks` | ((estimated_hours > (0)::numeric)) |
| `tasks` | (((progress_percent >= (0)::numeric) AND (progress_percent <= (100)::numeric))) |
| `work_logs` | (((hours_spent > (0)::numeric) AND (hours_spent <= (24)::numeric))) |

## Reporting views

Views are read-only projections consumed by the dashboard, workload and
reports screens.

```mermaid
erDiagram
  V_ALLOCATION_LOG {
    integer assignment_id
    integer task_id
    character varying(200) task_title
    character varying(150) project_name
    integer employee_id
    text employee_name
    character varying(120) department_name
    assignment_mode mode
    assignment_state state
    numeric(6,2) suitability_score
    jsonb score_breakdown
    text skill_score
    text workload_score
    text availability_score
    text deadline_score
    integer eligible_candidates
    integer assigned_by
    character varying(120) assigned_by_name
    timestamp with time zone assigned_at
    timestamp with time zone released_at
    text note
  }
  V_DAILY_EFFORT {
    date log_date
    integer employee_id
    text employee_name
    character varying(120) department_name
    integer tasks_touched
    numeric hours_spent
  }
  V_DEADLINE_RISK {
    integer task_id
    character varying(150) project_name
    character varying(200) title
    task_status status
    task_priority priority
    integer assigned_employee_id
    text assigned_employee_name
    date deadline
    numeric(6,2) estimated_hours
    numeric(8,2) actual_hours
    integer days_left
    text risk_level
    numeric hours_variance
  }
  V_EMPLOYEE_PERFORMANCE {
    integer employee_id
    character varying(20) employee_code
    text employee_name
    character varying(120) department_name
    bigint completed_tasks
    numeric estimated_hours
    numeric actual_hours
    numeric estimation_error_pct
    bigint open_tasks
    bigint on_time_completions
    bigint late_completions
  }
  V_EMPLOYEE_WORKLOAD {
    integer employee_id
    character varying(20) employee_code
    text employee_name
    character varying(150) email
    character varying(25) phone
    character varying(100) job_title
    integer department_id
    character varying(120) department_name
    employment_status employment_status
    boolean is_available
    numeric(6,2) capacity_hours
    numeric allocated_hours
    numeric remaining_hours
    numeric utilization_pct
    text workload_level
    integer open_tasks
    integer overdue_tasks
    integer completed_tasks
    numeric logged_hours
    numeric avg_skill_level
    integer skill_count
    boolean on_leave_today
  }
  V_PROJECT_PROGRESS {
    integer project_id
    character varying(20) code
    character varying(150) project_name
    character varying(120) department_name
    project_status project_status
    date start_date
    date end_date
    numeric(10,2) budget_hours
    integer total_tasks
    numeric estimated_hours
    numeric actual_hours
    integer completed_tasks
    integer pending_tasks
    integer active_tasks
    integer cancelled_tasks
    numeric completion_pct
    numeric budget_usage_pct
  }
  V_SKILL_DEMAND_SUPPLY {
    integer skill_id
    character varying(80) skill_name
    skill_category category
    bigint qualified_employees
    numeric avg_proficiency
    bigint open_tasks_requiring
    numeric open_hours_required
    text supply_status
  }
  V_TASK_BOARD {
    integer task_id
    integer project_id
    character varying(20) project_code
    character varying(150) project_name
    character varying(200) title
    text description
    task_status status
    task_priority priority
    numeric(6,2) estimated_hours
    numeric(8,2) actual_hours
    numeric hours_variance
    numeric(5,2) progress_percent
    date deadline
    boolean is_overdue
    text deadline_state
    integer assigned_employee_id
    text assigned_employee_name
    character varying(20) assigned_employee_code
    character varying(120) employee_department
    timestamp with time zone assigned_at
    timestamp with time zone started_at
    timestamp with time zone completed_at
    timestamp with time zone created_at
    integer created_by
    text required_skills_text
    integer comment_count
    integer work_log_count
  }
```

| View | Purpose |
| --- | --- |
| `v_task_board` | Task list with project, assignee, effort variance, progress and deadline state. |
| `v_employee_workload` | Per-employee capacity, allocated/free hours, utilisation band, open and overdue counts. |
| `v_project_progress` | Project rollup: task counts by status, estimated vs actual hours, completion and budget usage. |
| `v_skill_demand_supply` | Supply (employees with a skill) vs demand (tasks requiring it) for gap analysis. |
| `v_deadline_risk` | Tasks at risk with the specific reason (no assignee, insufficient skills, capacity, deadline). |
| `v_employee_performance` | Logged hours, completed tasks, on-time rate and utilisation per employee. |
| `v_allocation_log` | Audit trail of automatic and manual allocations with score and reason. |
| `v_daily_effort` | Daily aggregated effort for the trend chart. |

## Allocation engine

`fn_task_candidates(task_id)` ranks every eligible employee for a task and
returns the score plus an explanation. `fn_allocate_task(task_id)` wraps the
top-ranked candidate in a transaction and writes to `task_assignments` and
`task_history`.

**Eligibility is a hard filter** — a candidate is removed entirely when:

- the employee is not `ACTIVE` or is marked unavailable
- the employee is on approved leave overlapping the task window
- the employee lacks a mandatory required skill
- the employee lacks any required skill at all
- the task would exceed the employee's weekly capacity
- the task deadline precedes the earliest possible completion

**Ranking weights** (the remainder of the 0-100 score):

| Factor | Weight |
| --- | --- |
| Skill match | 45 |
| Current workload | 25 |
| Availability | 15 |
| Deadline pressure | 10 |
| Relevant experience | 5 |
| Same-department bonus | +2 |

## Integrity rules

| Rule | Enforced by |
| --- | --- |
| Status transitions follow the workflow | `fn_validate_task_transition()` trigger |
| `tasks.actual_hours` matches logged time | `work_logs` sync triggers |
| Audit row for every task change | `task_history` trigger |
| Timestamps maintained automatically | `set_updated_at()` triggers |
| Work logged only by the assignee, within the estimate | `work_logs` validation trigger |
| Skills in use cannot be deleted | `task_skills` guard trigger |
