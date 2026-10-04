-- =====================================================================
-- SMART WORKFORCE & TASK ALLOCATION DATABASE SYSTEM
-- File   : 02_tables.sql
-- Purpose: Create all base tables with primary keys, foreign keys,
--          unique constraints, CHECK constraints and indexes.
-- Design : 3NF. Every non-key attribute depends only on the whole key.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. DEPARTMENTS  (root of the organisation tree)
-- ---------------------------------------------------------------------
CREATE TABLE departments (
    department_id   SERIAL PRIMARY KEY,
    code            VARCHAR(10)  NOT NULL UNIQUE,
    name            VARCHAR(120) NOT NULL UNIQUE,
    description     TEXT,
    budget_hours    NUMERIC(10,2) NOT NULL DEFAULT 0
                    CHECK (budget_hours >= 0),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE departments IS 'Organisational units. 1:N with employees and projects.';

-- ---------------------------------------------------------------------
-- 2. EMPLOYEES
-- ---------------------------------------------------------------------
CREATE TABLE employees (
    employee_id             SERIAL PRIMARY KEY,
    employee_code           VARCHAR(20)  NOT NULL UNIQUE,
    first_name              VARCHAR(60)  NOT NULL,
    last_name               VARCHAR(60)  NOT NULL,
    email                   VARCHAR(150) NOT NULL UNIQUE,
    phone                   VARCHAR(25),
    job_title               VARCHAR(100),
    department_id           INT          NOT NULL
                            REFERENCES departments(department_id)
                            ON DELETE RESTRICT ON UPDATE CASCADE,
    manager_id              INT          REFERENCES employees(employee_id)
                            ON DELETE SET NULL,
    hire_date               DATE         NOT NULL DEFAULT CURRENT_DATE,
    employment_status       employment_status NOT NULL DEFAULT 'ACTIVE',
    -- Weekly working capacity: the basis of every workload calculation.
    weekly_capacity_hours   NUMERIC(6,2) NOT NULL DEFAULT 40
                            CHECK (weekly_capacity_hours > 0 AND weekly_capacity_hours <= 80),
    -- Fast availability flag; detailed day level data lives in
    -- employee_availability (multi valued attribute -> own table, 1NF).
    is_available            BOOLEAN      NOT NULL DEFAULT TRUE,
    avatar_url              TEXT,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_employee_not_self_manager
        CHECK (manager_id IS NULL OR manager_id <> employee_id)
);

CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_employees_status     ON employees(employment_status);
CREATE INDEX idx_employees_manager     ON employees(manager_id);

-- ---------------------------------------------------------------------
-- 3. USERS  (login accounts; 1:1 optional link to an employee)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id         SERIAL PRIMARY KEY,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   TEXT         NOT NULL,
    full_name       VARCHAR(120) NOT NULL,
    role            user_role    NOT NULL DEFAULT 'EMPLOYEE',
    employee_id     INT          UNIQUE
                    REFERENCES employees(employee_id)
                    ON DELETE SET NULL ON UPDATE CASCADE,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- An EMPLOYEE account must be linked to a real employee record,
-- while an ADMIN account does not need one.
ALTER TABLE users ADD CONSTRAINT chk_employee_user_link
    CHECK (role = 'ADMIN' OR employee_id IS NOT NULL);

-- ---------------------------------------------------------------------
-- 4. SKILLS  (master list, normalised out of employees and tasks)
-- ---------------------------------------------------------------------
CREATE TABLE skills (
    skill_id     SERIAL PRIMARY KEY,
    name         VARCHAR(80)  NOT NULL UNIQUE,
    category     skill_category NOT NULL DEFAULT 'OTHER',
    description  TEXT,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 5. EMPLOYEE_SKILLS  (resolves the N:N relation employees <-> skills)
-- ---------------------------------------------------------------------
CREATE TABLE employee_skills (
    employee_id        INT NOT NULL
                       REFERENCES employees(employee_id)
                       ON DELETE CASCADE ON UPDATE CASCADE,
    skill_id           INT NOT NULL
                       REFERENCES skills(skill_id)
                       ON DELETE CASCADE ON UPDATE CASCADE,
    proficiency_level  NUMERIC(3,1) NOT NULL DEFAULT 1
                       CHECK (proficiency_level >= 1 AND proficiency_level <= 5),
    years_experience   NUMERIC(4,1) NOT NULL DEFAULT 0
                       CHECK (years_experience >= 0),
    last_used_on       DATE,
    is_primary         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (employee_id, skill_id)
);

CREATE INDEX idx_employee_skills_skill ON employee_skills(skill_id);

-- ---------------------------------------------------------------------
-- 6. EMPLOYEE_AVAILABILITY  (1:N, day level availability records)
-- ---------------------------------------------------------------------
CREATE TABLE employee_availability (
    availability_id   SERIAL PRIMARY KEY,
    employee_id       INT  NOT NULL
                      REFERENCES employees(employee_id)
                      ON DELETE CASCADE ON UPDATE CASCADE,
    date_from         DATE NOT NULL,
    date_to           DATE NOT NULL,
    status            availability_status NOT NULL DEFAULT 'AVAILABLE',
    -- Hours the employee can realistically work inside that window.
    available_hours   NUMERIC(6,2) NOT NULL DEFAULT 0
                      CHECK (available_hours >= 0 AND available_hours <= 80),
    reason            VARCHAR(200),

    CONSTRAINT chk_availability_window CHECK (date_to >= date_from)
);

CREATE INDEX idx_availability_employee ON employee_availability(employee_id, date_from, date_to);

-- ---------------------------------------------------------------------
-- 7. PROJECTS
-- ---------------------------------------------------------------------
CREATE TABLE projects (
    project_id     SERIAL PRIMARY KEY,
    code           VARCHAR(20)  NOT NULL UNIQUE,
    name           VARCHAR(150) NOT NULL,
    description    TEXT,
    department_id  INT          NOT NULL
                   REFERENCES departments(department_id)
                   ON DELETE RESTRICT ON UPDATE CASCADE,
    lead_id        INT          REFERENCES employees(employee_id)
                   ON DELETE SET NULL,
    start_date     DATE,
    end_date       DATE,
    budget_hours   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (budget_hours >= 0),
    status         project_status NOT NULL DEFAULT 'PLANNED',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_project_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_projects_department ON projects(department_id);
CREATE INDEX idx_projects_status     ON projects(status);

-- ---------------------------------------------------------------------
-- 8. TASKS
-- ---------------------------------------------------------------------
CREATE TABLE tasks (
    task_id                SERIAL PRIMARY KEY,
    project_id             INT NOT NULL
                           REFERENCES projects(project_id)
                           ON DELETE CASCADE ON UPDATE CASCADE,
    title                  VARCHAR(200) NOT NULL,
    description            TEXT,
    status                 task_status NOT NULL DEFAULT 'PENDING',
    priority               task_priority NOT NULL DEFAULT 'MEDIUM',
    estimated_hours        NUMERIC(6,2) NOT NULL CHECK (estimated_hours > 0),
    -- actual_hours is maintained by trigger fn_sync_task_actual_hours()
    -- from the WORK_LOGS rows; never written directly by the app.
    actual_hours           NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (actual_hours >= 0),
    progress_percent       NUMERIC(5,2) NOT NULL DEFAULT 0
                           CHECK (progress_percent >= 0 AND progress_percent <= 100),
    deadline               DATE,
    assigned_employee_id   INT REFERENCES employees(employee_id)
                           ON DELETE SET NULL ON UPDATE CASCADE,
    assigned_at            TIMESTAMPTZ,
    started_at             TIMESTAMPTZ,
    completed_at           TIMESTAMPTZ,
    created_by             INT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Denormalised guard: an assigned/completed task must have an assignee.
    CONSTRAINT chk_task_assignee_when_assigned CHECK (
        status NOT IN ('ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED')
        OR assigned_employee_id IS NOT NULL
    ),
    CONSTRAINT chk_task_completion_stamps CHECK (
        (status = 'COMPLETED' AND completed_at IS NOT NULL)
        OR status <> 'COMPLETED'
    )
);

CREATE INDEX idx_tasks_project   ON tasks(project_id);
CREATE INDEX idx_tasks_assignee  ON tasks(assigned_employee_id);
CREATE INDEX idx_tasks_status    ON tasks(status);
CREATE INDEX idx_tasks_deadline  ON tasks(deadline);

-- ---------------------------------------------------------------------
-- 9. TASK_SKILLS  (N:N between tasks and skills, with required level)
-- ---------------------------------------------------------------------
CREATE TABLE task_skills (
    task_id        INT NOT NULL REFERENCES tasks(task_id)  ON DELETE CASCADE ON UPDATE CASCADE,
    skill_id       INT NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE ON UPDATE CASCADE,
    required_level NUMERIC(3,1) NOT NULL DEFAULT 1
                   CHECK (required_level >= 1 AND required_level <= 5),
    -- Mandatory skills are a hard filter in the allocation engine.
    is_mandatory   BOOLEAN NOT NULL DEFAULT TRUE,

    PRIMARY KEY (task_id, skill_id)
);

CREATE INDEX idx_task_skills_skill ON task_skills(skill_id);

-- ---------------------------------------------------------------------
-- 10. TASK_ASSIGNMENTS  (history of who got what, when and why)
-- ---------------------------------------------------------------------
CREATE TABLE task_assignments (
    assignment_id     SERIAL PRIMARY KEY,
    task_id           INT NOT NULL REFERENCES tasks(task_id)      ON DELETE CASCADE ON UPDATE CASCADE,
    employee_id       INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE ON UPDATE CASCADE,
    assigned_by       INT REFERENCES users(user_id) ON DELETE SET NULL,
    mode              assignment_mode  NOT NULL DEFAULT 'AUTO',
    state             assignment_state NOT NULL DEFAULT 'ACTIVE',
    suitability_score NUMERIC(6,2) CHECK (suitability_score >= 0 AND suitability_score <= 100),
    -- Full breakdown of the score, stored as JSONB for auditing.
    score_breakdown   JSONB,
    assigned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at       TIMESTAMPTZ,
    note              TEXT,

    CONSTRAINT chk_assignment_release CHECK (
        (state = 'ACTIVE' AND released_at IS NULL)
        OR (state <> 'ACTIVE' AND released_at IS NOT NULL)
    )
);

CREATE INDEX idx_assignments_task     ON task_assignments(task_id);
CREATE INDEX idx_assignments_employee ON task_assignments(employee_id);
-- Only one active assignment per task.
CREATE UNIQUE INDEX uq_active_assignment_per_task
    ON task_assignments(task_id) WHERE state = 'ACTIVE';

-- ---------------------------------------------------------------------
-- 11. WORK_LOGS  (hours actually spent)
-- ---------------------------------------------------------------------
CREATE TABLE work_logs (
    work_log_id        SERIAL PRIMARY KEY,
    task_id            INT NOT NULL REFERENCES tasks(task_id)      ON DELETE CASCADE ON UPDATE CASCADE,
    employee_id        INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE ON UPDATE CASCADE,
    log_date           DATE NOT NULL DEFAULT CURRENT_DATE,
    hours_spent        NUMERIC(5,2) NOT NULL CHECK (hours_spent > 0 AND hours_spent <= 24),
    work_description   TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A log may only be added by the employee currently holding the task.
    CONSTRAINT uq_worklog_task_employee_day UNIQUE (task_id, employee_id, log_date)
);

CREATE INDEX idx_worklogs_task     ON work_logs(task_id);
CREATE INDEX idx_worklogs_employee ON work_logs(employee_id, log_date);

-- ---------------------------------------------------------------------
-- 12. TASK_HISTORY  (audit trail, filled by trigger)
-- ---------------------------------------------------------------------
CREATE TABLE task_history (
    history_id   SERIAL PRIMARY KEY,
    task_id      INT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE ON UPDATE CASCADE,
    changed_by   INT REFERENCES users(user_id) ON DELETE SET NULL,
    changed_by_employee INT REFERENCES employees(employee_id) ON DELETE SET NULL,
    action       VARCHAR(40) NOT NULL,
    from_status  task_status,
    to_status    task_status,
    remarks      TEXT,
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_history_task ON task_history(task_id, changed_at DESC);

-- ---------------------------------------------------------------------
-- 13. COMMENTS
-- ---------------------------------------------------------------------
CREATE TABLE comments (
    comment_id  SERIAL PRIMARY KEY,
    task_id     INT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id     INT REFERENCES users(user_id) ON DELETE CASCADE,
    body        TEXT NOT NULL CHECK (LENGTH(TRIM(body)) > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_task ON comments(task_id, created_at);