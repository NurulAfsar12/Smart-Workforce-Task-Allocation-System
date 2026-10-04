-- =====================================================================
-- SMART WORKFORCE & TASK ALLOCATION DATABASE SYSTEM
-- File   : 03_functions.sql
-- Purpose: Workload calculation + rule based suitability scoring +
--          automatic task allocation engine (transaction safe).
--
-- Allocation rule set (all rules live in the database, not the app):
--   HARD FILTERS (must pass, otherwise employee is not eligible)
--     R1 employee is ACTIVE and flagged available
--     R2 no UNAVAILABLE availability record inside the work window
--     R3 every MANDATORY required skill is held at the required level
--     R4 allocated hours + estimated hours <= weekly capacity
--     R5 when a deadline exists the employee must have free capacity
--        before that deadline
--
--   SUITABILITY SCORE (0-100, weighted sum)
--     S1 skill score          45%  coverage(60%) + level adequacy(40%)
--     S2 workload score       25%  1 - utilisation after this assignment
--     S3 availability score   15%  free hours in the work window
--     S4 deadline score       10%  capacity left before the deadline
--     S5 experience score      5%  years of experience in required skills
-- =====================================================================

-- ---------------------------------------------------------------------
-- Workload helpers
-- ---------------------------------------------------------------------

-- Hours already committed to an employee by OPEN tasks.
CREATE OR REPLACE FUNCTION fn_employee_allocated_hours(p_employee_id INT)
RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(SUM(t.estimated_hours), 0)::NUMERIC
    FROM tasks t
    WHERE t.assigned_employee_id = p_employee_id
      AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'ON_HOLD');
$$;

-- Number of open tasks of an employee.
CREATE OR REPLACE FUNCTION fn_employee_open_tasks(p_employee_id INT)
RETURNS INT
LANGUAGE sql STABLE AS $$
    SELECT COUNT(*)::INT
    FROM tasks t
    WHERE t.assigned_employee_id = p_employee_id
      AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'ON_HOLD');
$$;

-- Working window of a task: today .. deadline (or +14 days default).
CREATE OR REPLACE FUNCTION fn_task_work_window(p_task_id INT)
RETURNS TABLE (win_start DATE, win_end DATE)
LANGUAGE sql STABLE AS $$
    SELECT CURRENT_DATE,
           COALESCE(t.deadline, CURRENT_DATE + 14)
    FROM tasks t
    WHERE t.task_id = p_task_id;
$$;

-- Hours an employee could work inside an arbitrary window, taking the
-- employee_availability records into account.
CREATE OR REPLACE FUNCTION fn_employee_window_capacity(
    p_employee_id INT,
    p_from DATE,
    p_to   DATE
) RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
    SELECT GREATEST(
        0::NUMERIC,
        -- capacity without any availability restriction
        (e.weekly_capacity_hours / 7) * (p_to - p_from + 1)
        -- minus capacity blocked by PARTIAL (50%) / UNAVAILABLE (100%) windows
        - COALESCE((
            SELECT SUM(
                (LEAST(a.date_to, p_to) - GREATEST(a.date_from, p_from) + 1)
                * (e.weekly_capacity_hours / 7)
            ) FILTER (WHERE a.status = 'PARTIAL')
            + SUM(
                (LEAST(a.date_to, p_to) - GREATEST(a.date_from, p_from) + 1)
                * (e.weekly_capacity_hours / 7)
            ) FILTER (WHERE a.status = 'UNAVAILABLE')
            FROM employee_availability a
            WHERE a.employee_id = p_employee_id
              AND a.date_from <= p_to
              AND a.date_to   >= p_from
              AND a.status IN ('PARTIAL','UNAVAILABLE')
        ), 0)::NUMERIC
    )
    FROM employees e
    WHERE e.employee_id = p_employee_id;
$$;

-- ---------------------------------------------------------------------
-- THE ALLOCATION ENGINE
-- Returns every employee evaluated for a task, ordered best first.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_task_candidates(
    p_task_id              INT,
    p_include_ineligible   BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    employee_id        INT,
    employee_name      TEXT,
    employee_code      TEXT,
    department_name    TEXT,
    job_title          TEXT,
    is_eligible        BOOLEAN,
    total_score        NUMERIC,
    skill_score        NUMERIC,
    workload_score     NUMERIC,
    availability_score NUMERIC,
    deadline_score     NUMERIC,
    experience_score   NUMERIC,
    matched_skills     INT,
    required_skills    INT,
    mandatory_skills   INT,
    mandatory_matched  INT,
    skill_coverage     NUMERIC,
    level_adequacy     NUMERIC,
    capacity_hours     NUMERIC,
    allocated_hours    NUMERIC,
    remaining_hours    NUMERIC,
    utilization_pct    NUMERIC,
    open_tasks         INT,
    avg_years_exp      NUMERIC,
    blocking_reasons   TEXT[]
)
LANGUAGE sql STABLE AS $$
WITH t AS (
    SELECT tk.task_id, tk.estimated_hours, tk.priority, tk.deadline,
           p.department_id AS project_department_id
    FROM tasks tk
    JOIN projects p ON p.project_id = tk.project_id
    WHERE tk.task_id = p_task_id
),
win AS (
    SELECT CURRENT_DATE::DATE AS w_start,
           COALESCE(t.deadline, CURRENT_DATE + 14)::DATE AS w_end,
           t.*,
           GREATEST(COALESCE(t.deadline, CURRENT_DATE + 14)::DATE - CURRENT_DATE + 1, 1) AS win_days
    FROM t
),
-- required skills of the task (left join so tasks without skills still work)
req AS (
    SELECT COUNT(*)::INT AS required_skills,
           COALESCE(SUM(CASE WHEN ts.is_mandatory THEN 1 ELSE 0 END), 0)::INT AS mandatory_skills
    FROM task_skills ts
    WHERE ts.task_id = p_task_id
),
emp AS (
    SELECT e.employee_id,
           (e.first_name || ' ' || e.last_name) AS employee_name,
           e.employee_code,
           d.name AS department_name,
           e.job_title,
           e.department_id,
           e.employment_status,
           e.is_available,
           e.weekly_capacity_hours AS capacity_hours
    FROM employees e
    JOIN departments d ON d.department_id = e.department_id
),
base AS (
    SELECT em.*,
           w.estimated_hours,
           w.priority,
           w.deadline,
           w.project_department_id,
           w.win_days,
           r.required_skills,
           r.mandatory_skills
    FROM emp em
    CROSS JOIN win w
    CROSS JOIN req r
),
-- skill evaluation per employee
skill_agg AS (
    SELECT b.employee_id,
           COUNT(ts.skill_id) FILTER (
               WHERE es.proficiency_level >= ts.required_level)          AS matched_skills,
           COUNT(ts.skill_id) FILTER (
               WHERE ts.is_mandatory
                 AND es.proficiency_level >= ts.required_level)         AS mandatory_matched,
           COALESCE(AVG(
               CASE WHEN es.proficiency_level IS NULL THEN NULL
                    ELSE LEAST(es.proficiency_level / NULLIF(ts.required_level, 0), 1)
               END
           ) FILTER (WHERE es.skill_id IS NOT NULL), 0)::NUMERIC        AS level_adequacy_sum,
           COALESCE(AVG(es.years_experience)
               FILTER (WHERE es.skill_id IS NOT NULL), 0)::NUMERIC      AS avg_years_exp
    FROM base b
    LEFT JOIN task_skills ts ON ts.task_id = p_task_id
    LEFT JOIN employee_skills es
           ON es.skill_id = ts.skill_id
          AND es.employee_id = b.employee_id
    GROUP BY b.employee_id
),
scored AS (
    SELECT b.*,
           COALESCE(fn_employee_allocated_hours(b.employee_id), 0)      AS allocated_hours,
           COALESCE(fn_employee_open_tasks(b.employee_id), 0)            AS open_tasks,
           sa.matched_skills,
           sa.mandatory_matched,
           sa.level_adequacy_sum,
           sa.avg_years_exp,
           GREATEST(b.capacity_hours - COALESCE(fn_employee_allocated_hours(b.employee_id), 0), 0)
                                                                        AS remaining_hours,
           -- is the employee blocked at any point of the work window?
           EXISTS (
               SELECT 1 FROM employee_availability a
               WHERE a.employee_id = b.employee_id
                 AND a.status = 'UNAVAILABLE'
                 AND a.date_from <= COALESCE(b.deadline, CURRENT_DATE + 14)
                 AND a.date_to   >= CURRENT_DATE
           )                                                              AS is_blocked,
           -- free capacity inside the work window
           fn_employee_window_capacity(
               b.employee_id, CURRENT_DATE,
               COALESCE(b.deadline, CURRENT_DATE + 14)
           ) - COALESCE(fn_employee_allocated_hours(b.employee_id), 0)
           - b.estimated_hours                                       AS window_slack,
           -- capacity available before the deadline (rule R5)
           (b.capacity_hours / 7) * b.win_days
             - COALESCE((
                 SELECT SUM(t2.estimated_hours)
                 FROM tasks t2
                 WHERE t2.assigned_employee_id = b.employee_id
                   AND t2.task_id <> p_task_id
                   AND t2.status IN ('ASSIGNED','IN_PROGRESS','REVIEW','ON_HOLD')
                   AND (t2.deadline IS NULL OR t2.deadline <= COALESCE(b.deadline, CURRENT_DATE + 14))
             ), 0)
             - b.estimated_hours                                      AS deadline_slack
    FROM base b
    JOIN skill_agg sa ON sa.employee_id = b.employee_id
),
final AS (
    SELECT s.*,
           -- ---------- component scores (0..1) ----------
           (CASE WHEN s.required_skills = 0 THEN 1
                 ELSE s.matched_skills::NUMERIC / s.required_skills END)          AS skill_coverage,
           LEAST(COALESCE(s.level_adequacy_sum, 0), 1)                            AS level_adequacy,
           CASE WHEN s.capacity_hours = 0 THEN 0
                ELSE GREATEST(LEAST(
                    1 - (s.allocated_hours + s.estimated_hours) / s.capacity_hours
                , 1), 0) END                                                       AS workload_ratio,
           CASE WHEN s.estimated_hours = 0 THEN 1
                ELSE GREATEST(LEAST(s.window_slack / s.estimated_hours, 1), 0) END AS availability_ratio,
           CASE WHEN s.deadline IS NULL THEN 1
                ELSE GREATEST(LEAST(s.deadline_slack
                          / GREATEST((s.capacity_hours / 7) * s.win_days, 1), 1), 0)
           END                                                                    AS deadline_ratio,
           LEAST(COALESCE(s.avg_years_exp, 0) / 10, 1)                            AS experience_ratio,
           (s.department_id = s.project_department_id)                            AS same_department
    FROM scored s
)
SELECT
    f.employee_id,
    f.employee_name,
    f.employee_code,
    f.department_name,
    COALESCE(f.job_title, '') AS job_title,

    -- ---------- eligibility ----------
    (f.employment_status = 'ACTIVE'
     AND f.is_available
     AND NOT f.is_blocked
     AND f.mandatory_matched = f.mandatory_skills
     AND (f.required_skills = 0 OR f.skill_coverage >= 0.5)
     AND (f.allocated_hours + f.estimated_hours) <= f.capacity_hours
     AND (f.deadline IS NULL OR f.deadline_slack >= 0)
    ) AS is_eligible,

    -- ---------- weighted total score ----------
    ROUND((
        100 * (
            0.45 * (0.60 * (CASE WHEN f.required_skills = 0 THEN 1
                                 ELSE f.skill_coverage END)
                  + 0.40 * f.level_adequacy)
          + 0.25 * f.workload_ratio
          + 0.15 * f.availability_ratio
          + 0.10 * f.deadline_ratio
          + 0.05 * f.experience_ratio
        )
        -- small bonus: same department as the project
        + CASE WHEN f.same_department THEN 2 ELSE 0 END
    )::NUMERIC, 2) AS total_score,

    ROUND(100 * (0.60 * (CASE WHEN f.required_skills = 0 THEN 1
                             ELSE f.skill_coverage END)
               + 0.40 * f.level_adequacy)::NUMERIC, 2)                   AS skill_score,
    ROUND(100 * f.workload_ratio::NUMERIC, 2)                             AS workload_score,
    ROUND(100 * f.availability_ratio::NUMERIC, 2)                         AS availability_score,
    ROUND(100 * f.deadline_ratio::NUMERIC, 2)                             AS deadline_score,
    ROUND(100 * f.experience_ratio::NUMERIC, 2)                           AS experience_score,

    f.matched_skills,
    f.required_skills,
    f.mandatory_skills,
    f.mandatory_matched,
    ROUND((CASE WHEN f.required_skills = 0 THEN 1
                ELSE f.skill_coverage END)::NUMERIC, 4)                   AS skill_coverage,
    ROUND(f.level_adequacy::NUMERIC, 4)                                   AS level_adequacy,
    f.capacity_hours,
    f.allocated_hours,
    GREATEST(f.capacity_hours - f.allocated_hours - f.estimated_hours, 0) AS remaining_hours,
    ROUND((CASE WHEN f.capacity_hours = 0 THEN 0
                ELSE 100 * (f.allocated_hours + f.estimated_hours) / f.capacity_hours
           END)::NUMERIC, 2)                                              AS utilization_pct,
    f.open_tasks,
    ROUND(f.avg_years_exp::NUMERIC, 2)                                    AS avg_years_exp,

    -- ---------- human readable reasons ----------
    ARRAY_REMOVE(ARRAY[
        CASE WHEN f.employment_status <> 'ACTIVE'
             THEN 'Employment status is ' || f.employment_status::text END,
        CASE WHEN NOT f.is_available
             THEN 'Employee is flagged unavailable' END,
        CASE WHEN f.is_blocked
             THEN 'Blocked by an unavailable period inside the work window' END,
        CASE WHEN f.mandatory_matched < f.mandatory_skills
             THEN 'Missing mandatory skills (' || f.mandatory_matched || '/'
                  || f.mandatory_skills || ')' END,
        CASE WHEN f.required_skills > 0 AND f.skill_coverage < 0.5
             THEN 'Skill coverage below 50%' END,
        CASE WHEN (f.allocated_hours + f.estimated_hours) > f.capacity_hours
             THEN 'No free capacity (' || ROUND(f.remaining_hours::NUMERIC, 1)
                  || 'h left of ' || ROUND(f.capacity_hours::NUMERIC, 1) || 'h)' END,
        CASE WHEN f.deadline IS NOT NULL AND f.deadline_slack < 0
             THEN 'Deadline not achievable with current workload' END
    ], NULL) AS blocking_reasons
FROM final f
WHERE p_include_ineligible
   OR (f.employment_status = 'ACTIVE'
       AND f.is_available
       AND NOT f.is_blocked
       AND f.mandatory_matched = f.mandatory_skills
       AND (f.required_skills = 0 OR f.skill_coverage >= 0.5)
       AND (f.allocated_hours + f.estimated_hours) <= f.capacity_hours
       AND (f.deadline IS NULL OR f.deadline_slack >= 0))
ORDER BY is_eligible DESC, total_score DESC, f.open_tasks ASC, f.employee_id ASC;
$$;

-- ---------------------------------------------------------------------
-- Allocate a task to the best candidate.
-- Must be called inside a transaction; it locks the task row so two
-- concurrent allocations can never pick the same overloaded employee.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_allocate_task(
    p_task_id   INT,
    p_user_id   INT DEFAULT NULL,      -- acting user (audit trail)
    p_employee_id INT DEFAULT NULL,    -- manual allocation, NULL = automatic
    p_force     BOOLEAN DEFAULT FALSE  -- allocate even without a valid candidate
)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
    v_task          tasks%ROWTYPE;
    v_best          RECORD;
    v_candidates    INT := 0;
    v_user          users%ROWTYPE;
BEGIN
    -- lock the task so concurrent allocations are serialised
    SELECT * INTO v_task FROM tasks WHERE task_id = p_task_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task % does not exist', p_task_id USING ERRCODE = 'P0002';
    END IF;

    IF v_task.status NOT IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS') THEN
        RAISE EXCEPTION 'Task % cannot be allocated while in status %',
            p_task_id, v_task.status USING ERRCODE = 'P0001';
    END IF;

    IF p_user_id IS NOT NULL THEN
        SELECT * INTO v_user FROM users WHERE user_id = p_user_id;
    END IF;

    -------------------------------------------------------------------
    -- MANUAL allocation
    -------------------------------------------------------------------
    IF p_employee_id IS NOT NULL THEN
        SELECT c.* INTO v_best
        FROM fn_task_candidates(p_task_id, TRUE) c
        WHERE c.employee_id = p_employee_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Employee % does not exist', p_employee_id
                USING ERRCODE = 'P0002';
        END IF;

        IF NOT v_best.is_eligible AND NOT p_force THEN
            RAISE EXCEPTION 'Employee % is not eligible: %',
                p_employee_id,
                COALESCE(ARRAY_TO_STRING(v_best.blocking_reasons, '; '), 'unknown reason')
                USING ERRCODE = 'P0001';
        END IF;
    ELSE
    -------------------------------------------------------------------
    -- AUTOMATIC allocation: pick the highest scoring eligible employee
    -------------------------------------------------------------------
        SELECT c.* INTO v_best
        FROM fn_task_candidates(p_task_id, FALSE) c
        WHERE c.is_eligible
        ORDER BY c.total_score DESC, c.open_tasks ASC
        LIMIT 1;

        IF NOT FOUND THEN
            IF NOT p_force THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'reason', 'NO_ELIGIBLE_EMPLOYEE',
                    'message', 'No employee satisfies the skill, availability and workload rules for this task.',
                    'task_id', p_task_id
                );
            END IF;
            RETURN jsonb_build_object(
                'success', false,
                'reason', 'NO_ELIGIBLE_EMPLOYEE',
                'message', 'No eligible employee and p_force was not set.',
                'task_id', p_task_id
            );
        END IF;
    END IF;

    SELECT COUNT(*)::INT INTO v_candidates FROM fn_task_candidates(p_task_id, FALSE);

    -------------------------------------------------------------------
    -- Release any previous active assignment (re-assignment case)
    -------------------------------------------------------------------
    UPDATE task_assignments
       SET state = 'REASSIGNED',
           released_at = NOW(),
           note = COALESCE(note, '') || ' [replaced by a new assignment]'
     WHERE task_id = p_task_id AND state = 'ACTIVE';

    -------------------------------------------------------------------
    -- Create the new assignment
    -------------------------------------------------------------------
    INSERT INTO task_assignments (
        task_id, employee_id, assigned_by, mode, state,
        suitability_score, score_breakdown, note
    ) VALUES (
        p_task_id,
        v_best.employee_id,
        p_user_id,
        CASE WHEN p_employee_id IS NULL THEN 'AUTO'::assignment_mode
             ELSE 'MANUAL'::assignment_mode END,
        'ACTIVE',
        v_best.total_score,
        jsonb_build_object(
            'skillScore',        v_best.skill_score,
            'workloadScore',     v_best.workload_score,
            'availabilityScore', v_best.availability_score,
            'deadlineScore',     v_best.deadline_score,
            'experienceScore',   v_best.experience_score,
            'skillCoverage',     v_best.skill_coverage,
            'levelAdequacy',     v_best.level_adequacy,
            'matchedSkills',     v_best.matched_skills,
            'requiredSkills',    v_best.required_skills,
            'mandatoryMatched',  v_best.mandatory_matched,
            'mandatoryTotal',    v_best.mandatory_skills,
            'capacityHours',     v_best.capacity_hours,
            'allocatedHours',    v_best.allocated_hours,
            'utilizationPct',    v_best.utilization_pct,
            'openTasks',         v_best.open_tasks,
            'eligibleCandidates',v_candidates,
            'blockingReasons',   to_jsonb(v_best.blocking_reasons)
        ),
        CASE WHEN p_employee_id IS NULL
             THEN 'Automatically allocated by the suitability engine'
             ELSE 'Manually allocated by ' || COALESCE(v_user.full_name, 'system')
        END
    );

    -------------------------------------------------------------------
    -- Update the task itself
    -------------------------------------------------------------------
    UPDATE tasks
       SET assigned_employee_id = v_best.employee_id,
           status              = 'ASSIGNED',
           assigned_at         = NOW(),
           updated_at          = NOW()
     WHERE task_id = p_task_id;

    RETURN jsonb_build_object(
        'success', true,
        'mode', CASE WHEN p_employee_id IS NULL THEN 'AUTO' ELSE 'MANUAL' END,
        'task_id', p_task_id,
        'employee', jsonb_build_object(
            'employee_id',   v_best.employee_id,
            'employee_name', v_best.employee_name,
            'employee_code', v_best.employee_code,
            'department',    v_best.department_name,
            'job_title',     v_best.job_title
        ),
        'score', v_best.total_score,
        'breakdown', jsonb_build_object(
            'skillScore',        v_best.skill_score,
            'workloadScore',     v_best.workload_score,
            'availabilityScore', v_best.availability_score,
            'deadlineScore',     v_best.deadline_score,
            'experienceScore',   v_best.experience_score
        ),
        'workload', jsonb_build_object(
            'capacityHours',  v_best.capacity_hours,
            'allocatedHours', v_best.allocated_hours,
            'remainingHours', v_best.remaining_hours,
            'utilizationPct', v_best.utilization_pct
        ),
        'eligibleCandidates', v_candidates
    );
END;
$$;

-- ---------------------------------------------------------------------
-- Move a task to the next workflow state.
--   * the legal transitions are enforced by trigger fn_validate_status()
--   * started_at / completed_at are filled by trigger fn_stamp_timestamps()
--   * the history row is written by trigger fn_log_task_status_history()
-- so this function stays a thin, consistent entry point for the API.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_task_transition(
    p_task_id   INT,
    p_to_status task_status,
    p_user_id   INT DEFAULT NULL,
    p_remarks   TEXT DEFAULT NULL
) RETURNS tasks
LANGUAGE plpgsql AS $$
DECLARE
    v_task   tasks%ROWTYPE;
    v_before task_status;
BEGIN
    SELECT status INTO v_before FROM tasks WHERE task_id = p_task_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task % does not exist', p_task_id USING ERRCODE = 'P0002';
    END IF;

    UPDATE tasks
       SET status     = p_to_status,
           updated_at = NOW(),
           progress_percent = CASE WHEN p_to_status = 'COMPLETED' THEN 100
                                   WHEN p_to_status = 'IN_PROGRESS' AND progress_percent = 0
                                        THEN 10
                                   ELSE progress_percent END
     WHERE task_id = p_task_id
     RETURNING * INTO v_task;

    -- attach the actor to the history row created by the trigger
    UPDATE task_history
       SET changed_by = p_user_id,
           remarks    = COALESCE(remarks, p_remarks)
     WHERE history_id = (
         SELECT history_id FROM task_history
         WHERE task_id = p_task_id AND to_status = p_to_status
         ORDER BY history_id DESC LIMIT 1
     );

    RETURN v_task;
END;
$$;

-- ---------------------------------------------------------------------
-- Workload summary of one employee (used by the employee detail page).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_employee_workload(p_employee_id INT)
RETURNS TABLE (
    employee_id        INT,
    employee_name      TEXT,
    department_name    TEXT,
    capacity_hours     NUMERIC,
    allocated_hours    NUMERIC,
    remaining_hours    NUMERIC,
    utilization_pct    NUMERIC,
    open_tasks         INT,
    overdue_tasks      INT,
    logged_hours       NUMERIC,
    avg_skill_level    NUMERIC,
    skill_count        INT
)
LANGUAGE sql STABLE AS $$
    SELECT e.employee_id,
           e.first_name || ' ' || e.last_name,
           d.name,
           e.weekly_capacity_hours,
           COALESCE(fn_employee_allocated_hours(e.employee_id), 0),
           GREATEST(e.weekly_capacity_hours
                    - COALESCE(fn_employee_allocated_hours(e.employee_id), 0), 0),
           ROUND((100 * COALESCE(fn_employee_allocated_hours(e.employee_id), 0)
                  / NULLIF(e.weekly_capacity_hours, 0))::NUMERIC, 2),
           COALESCE(fn_employee_open_tasks(e.employee_id), 0),
           (SELECT COUNT(*)::INT FROM tasks t
             WHERE t.assigned_employee_id = e.employee_id
               AND t.status NOT IN ('COMPLETED','CANCELLED')
               AND t.deadline < CURRENT_DATE),
           COALESCE((SELECT SUM(w.hours_spent) FROM work_logs w
                     WHERE w.employee_id = e.employee_id), 0),
           COALESCE((SELECT AVG(es.proficiency_level) FROM employee_skills es
                     WHERE es.employee_id = e.employee_id), 0),
           COALESCE((SELECT COUNT(*)::INT FROM employee_skills es
                     WHERE es.employee_id = e.employee_id), 0)
    FROM employees e
    JOIN departments d ON d.department_id = e.department_id
    WHERE e.employee_id = p_employee_id;
$$;