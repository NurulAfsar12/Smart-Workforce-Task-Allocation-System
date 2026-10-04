-- =====================================================================
-- SMART WORKFORCE & TASK ALLOCATION DATABASE SYSTEM
-- File   : 05_views.sql
-- Purpose: Reusable read models for the dashboard and the reports module.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Live workload of every employee (hours based, not task count based).
-- This view is the direct answer to the problem statement:
-- two employees with 2 tasks can have completely different workloads.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_employee_workload AS
SELECT
    e.employee_id,
    e.employee_code,
    e.first_name || ' ' || e.last_name              AS employee_name,
    e.email,
    e.phone,
    e.job_title,
    d.department_id,
    d.name                                           AS department_name,
    e.employment_status,
    e.is_available,
    e.weekly_capacity_hours                          AS capacity_hours,
    COALESCE(fn_employee_allocated_hours(e.employee_id), 0)          AS allocated_hours,
    GREATEST(e.weekly_capacity_hours
             - COALESCE(fn_employee_allocated_hours(e.employee_id), 0), 0) AS remaining_hours,
    ROUND((100 * COALESCE(fn_employee_allocated_hours(e.employee_id), 0)
           / NULLIF(e.weekly_capacity_hours, 0))::NUMERIC, 2)         AS utilization_pct,
    CASE
        WHEN e.employment_status <> 'ACTIVE'                       THEN 'INACTIVE'
        WHEN COALESCE(fn_employee_allocated_hours(e.employee_id),0) = 0 THEN 'FREE'
        WHEN COALESCE(fn_employee_allocated_hours(e.employee_id),0)
             <= e.weekly_capacity_hours * 0.5                       THEN 'LIGHT'
        WHEN COALESCE(fn_employee_allocated_hours(e.employee_id),0)
             <= e.weekly_capacity_hours * 0.8                       THEN 'BALANCED'
        WHEN COALESCE(fn_employee_allocated_hours(e.employee_id),0)
             <= e.weekly_capacity_hours                             THEN 'HEAVY'
        ELSE 'OVERLOADED'
    END                                             AS workload_level,
    COALESCE(fn_employee_open_tasks(e.employee_id), 0)               AS open_tasks,
    (SELECT COUNT(*)::INT FROM tasks t
      WHERE t.assigned_employee_id = e.employee_id
        AND t.status NOT IN ('COMPLETED','CANCELLED')
        AND t.deadline < CURRENT_DATE)               AS overdue_tasks,
    (SELECT COUNT(*)::INT FROM tasks t
      WHERE t.assigned_employee_id = e.employee_id
        AND t.status IN ('COMPLETED'))               AS completed_tasks,
    COALESCE((SELECT SUM(w.hours_spent) FROM work_logs w
               WHERE w.employee_id = e.employee_id), 0) AS logged_hours,
    COALESCE((SELECT AVG(es.proficiency_level) FROM employee_skills es
               WHERE es.employee_id = e.employee_id), 0) AS avg_skill_level,
    COALESCE((SELECT COUNT(*)::INT FROM employee_skills es
               WHERE es.employee_id = e.employee_id), 0)  AS skill_count,
    EXISTS (SELECT 1 FROM employee_availability a
             WHERE a.employee_id = e.employee_id
               AND a.status = 'UNAVAILABLE'
               AND a.date_from <= CURRENT_DATE
               AND a.date_to   >= CURRENT_DATE)         AS on_leave_today
FROM employees e
JOIN departments d ON d.department_id = e.department_id;

-- ---------------------------------------------------------------------
-- Project progress with hour budget consumption.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_project_progress AS
SELECT
    p.project_id,
    p.code,
    p.name                                              AS project_name,
    d.name                                              AS department_name,
    p.status                                            AS project_status,
    p.start_date,
    p.end_date,
    p.budget_hours,
    COUNT(t.task_id)::INT                               AS total_tasks,
    COALESCE(SUM(t.estimated_hours), 0)                 AS estimated_hours,
    COALESCE(SUM(t.actual_hours), 0)                    AS actual_hours,
    COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END), 0)::INT AS completed_tasks,
    COALESCE(SUM(CASE WHEN t.status IN ('PENDING') THEN 1 ELSE 0 END), 0)::INT  AS pending_tasks,
    COALESCE(SUM(CASE WHEN t.status IN ('ASSIGNED','IN_PROGRESS','REVIEW') THEN 1 ELSE 0 END), 0)::INT AS active_tasks,
    COALESCE(SUM(CASE WHEN t.status IN ('CANCELLED') THEN 1 ELSE 0 END), 0)::INT AS cancelled_tasks,
    ROUND((100.0 * COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END), 0)
           / NULLIF(COUNT(t.task_id), 0))::NUMERIC, 2)  AS completion_pct,
    ROUND((100.0 * COALESCE(SUM(t.estimated_hours), 0)
           / NULLIF(p.budget_hours, 0))::NUMERIC, 2)    AS budget_usage_pct
FROM projects p
JOIN departments d ON d.department_id = p.department_id
LEFT JOIN tasks t  ON t.project_id = p.project_id
GROUP BY p.project_id, p.code, p.name, d.name, p.status,
         p.start_date, p.end_date, p.budget_hours;

-- ---------------------------------------------------------------------
-- Task board row: everything the UI needs in one join.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_task_board AS
SELECT
    t.task_id,
    t.project_id,
    pr.code                AS project_code,
    pr.name                AS project_name,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.estimated_hours,
    t.actual_hours,
    ROUND(t.actual_hours - t.estimated_hours, 2) AS hours_variance,
    t.progress_percent,
    t.deadline,
    (t.deadline IS NOT NULL AND t.deadline < CURRENT_DATE
        AND t.status NOT IN ('COMPLETED','CANCELLED'))            AS is_overdue,
    (CASE
        WHEN t.status IN ('COMPLETED','CANCELLED') THEN NULL
        WHEN t.deadline IS NULL                          THEN 'NO_DEADLINE'
        WHEN t.deadline < CURRENT_DATE                   THEN 'OVERDUE'
        WHEN t.deadline <= CURRENT_DATE + 2              THEN 'DUE_SOON'
        ELSE 'ON_TRACK'
     END)                                                AS deadline_state,
    t.assigned_employee_id,
    (e.first_name || ' ' || e.last_name)                AS assigned_employee_name,
    e.employee_code                                       AS assigned_employee_code,
    d.name                                                AS employee_department,
    t.assigned_at,
    t.started_at,
    t.completed_at,
    t.created_at,
    t.created_by,
    COALESCE((SELECT STRING_AGG(s.name || ' (L' || ts.required_level || ')', ', ')
               FROM task_skills ts JOIN skills s ON s.skill_id = ts.skill_id
              WHERE ts.task_id = t.task_id), '')         AS required_skills_text,
    (SELECT COUNT(*)::INT FROM comments c WHERE c.task_id = t.task_id) AS comment_count,
    (SELECT COUNT(*)::INT FROM work_logs w WHERE w.task_id = t.task_id) AS work_log_count
FROM tasks t
JOIN projects pr       ON pr.project_id = t.project_id
LEFT JOIN employees e  ON e.employee_id = t.assigned_employee_id
LEFT JOIN departments d ON d.department_id = e.department_id;

-- ---------------------------------------------------------------------
-- Skill demand vs. supply: which skills are scarce in the organisation?
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_skill_demand_supply AS
SELECT
    s.skill_id,
    s.name                                     AS skill_name,
    s.category,
    COALESCE(sup.qualified_employees, 0)      AS qualified_employees,
    COALESCE(sup.avg_proficiency, 0)           AS avg_proficiency,
    COALESCE(dem.open_tasks, 0)                AS open_tasks_requiring,
    COALESCE(dem.open_hours, 0)                AS open_hours_required,
    CASE
        WHEN COALESCE(dem.open_tasks, 0) = 0                       THEN 'IDLE'
        WHEN COALESCE(sup.qualified_employees, 0) = 0              THEN 'CRITICAL_GAP'
        WHEN COALESCE(sup.qualified_employees, 0) <= 1             THEN 'SCARCE'
        ELSE 'AVAILABLE'
    END                                        AS supply_status
FROM skills s
LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT es.employee_id) AS qualified_employees,
           ROUND(AVG(es.proficiency_level), 2) AS avg_proficiency
    FROM employee_skills es
    JOIN employees e ON e.employee_id = es.employee_id
    WHERE es.skill_id = s.skill_id
      AND es.proficiency_level >= 2
      AND e.employment_status = 'ACTIVE'
) sup ON TRUE
LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT t.task_id) AS open_tasks,
           COALESCE(SUM(t.estimated_hours), 0) AS open_hours
    FROM task_skills ts
    JOIN tasks t ON t.task_id = ts.task_id
    WHERE ts.skill_id = s.skill_id
      AND t.status IN ('PENDING','ASSIGNED','IN_PROGRESS','REVIEW')
) dem ON TRUE
WHERE s.is_active;

-- ---------------------------------------------------------------------
-- Allocation audit: every assignment with its suitability score.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_allocation_log AS
SELECT
    a.assignment_id,
    a.task_id,
    t.title              AS task_title,
    pr.name              AS project_name,
    a.employee_id,
    e.first_name || ' ' || e.last_name  AS employee_name,
    d.name               AS department_name,
    a.mode,
    a.state,
    a.suitability_score,
    a.score_breakdown,
    COALESCE(a.score_breakdown ->> 'skillScore', NULL)        AS skill_score,
    COALESCE(a.score_breakdown ->> 'workloadScore', NULL)     AS workload_score,
    COALESCE(a.score_breakdown ->> 'availabilityScore', NULL) AS availability_score,
    COALESCE(a.score_breakdown ->> 'deadlineScore', NULL)     AS deadline_score,
    COALESCE((a.score_breakdown ->> 'eligibleCandidates')::INT, NULL) AS eligible_candidates,
    a.assigned_by,
    u.full_name          AS assigned_by_name,
    a.assigned_at,
    a.released_at,
    a.note
FROM task_assignments a
JOIN tasks t       ON t.task_id = a.task_id
JOIN projects pr   ON pr.project_id = t.project_id
JOIN employees e   ON e.employee_id = a.employee_id
JOIN departments d ON d.department_id = e.department_id
LEFT JOIN users u  ON u.user_id = a.assigned_by;

-- ---------------------------------------------------------------------
-- Employee performance report (completed work only).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_employee_performance AS
SELECT
    e.employee_id,
    e.employee_code,
    e.first_name || ' ' || e.last_name  AS employee_name,
    d.name                              AS department_name,
    COUNT(t.task_id) FILTER (WHERE t.status = 'COMPLETED')        AS completed_tasks,
    COALESCE(SUM(t.estimated_hours) FILTER (WHERE t.status = 'COMPLETED'), 0) AS estimated_hours,
    COALESCE(SUM(t.actual_hours) FILTER (WHERE t.status = 'COMPLETED'), 0)    AS actual_hours,
    ROUND(COALESCE(AVG(
        (t.actual_hours - t.estimated_hours) / NULLIF(t.estimated_hours, 0)
    ) FILTER (WHERE t.status = 'COMPLETED'), 0)::NUMERIC * 100, 2)  AS estimation_error_pct,
    COUNT(t.task_id) FILTER (WHERE t.status NOT IN ('COMPLETED','CANCELLED'))    AS open_tasks,
    COUNT(t.task_id) FILTER (
        WHERE t.status = 'COMPLETED' AND t.deadline IS NOT NULL
          AND t.completed_at::DATE <= t.deadline)                AS on_time_completions,
    COUNT(t.task_id) FILTER (
        WHERE t.status = 'COMPLETED' AND t.deadline IS NOT NULL
          AND t.completed_at::DATE > t.deadline)                 AS late_completions
FROM employees e
JOIN departments d ON d.department_id = e.department_id
LEFT JOIN tasks t  ON t.assigned_employee_id = e.employee_id
GROUP BY e.employee_id, e.employee_code, e.first_name, e.last_name, d.name;

-- ---------------------------------------------------------------------
-- Daily / weekly effort log used by the reports screen.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_daily_effort AS
SELECT
    w.log_date,
    e.employee_id,
    e.first_name || ' ' || e.last_name AS employee_name,
    d.name                             AS department_name,
    COUNT(DISTINCT w.task_id)::INT      AS tasks_touched,
    SUM(w.hours_spent)                  AS hours_spent
FROM work_logs w
JOIN employees e   ON e.employee_id = w.employee_id
JOIN departments d ON d.department_id = e.department_id
GROUP BY w.log_date, e.employee_id, e.first_name, e.last_name, d.name;

-- ---------------------------------------------------------------------
-- Overdue and at-risk tasks (deadline risk report).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_deadline_risk AS
SELECT
    b.task_id,
    b.project_name,
    b.title,
    b.status,
    b.priority,
    b.assigned_employee_id,
    b.assigned_employee_name,
    b.deadline,
    b.estimated_hours,
    b.actual_hours,
    (b.deadline - CURRENT_DATE)                          AS days_left,
    CASE
        WHEN b.is_overdue                          THEN 'OVERDUE'
        WHEN b.deadline IS NULL                    THEN 'NO_DEADLINE'
        WHEN b.deadline - CURRENT_DATE <= 2        THEN 'CRITICAL'
        WHEN b.deadline - CURRENT_DATE <= 5        THEN 'AT_RISK'
        ELSE 'ON_TRACK'
    END                                             AS risk_level,
    b.hours_variance
FROM v_task_board b
WHERE b.status NOT IN ('COMPLETED','CANCELLED');