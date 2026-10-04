-- =====================================================================
-- SMART WORKFORCE & TASK ALLOCATION DATABASE SYSTEM
-- File   : 04_triggers.sql
-- Purpose: Business rules that must hold no matter which client writes:
--           status transition matrix, timestamp stamping, automatic
--           task history, actual_hours synchronisation and updated_at.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Trigger functions
-- ---------------------------------------------------------------------

-- Generic updated_at maintenance.
CREATE OR REPLACE FUNCTION fn_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

-- Legal status transitions of the task workflow:
--   PENDING    -> ASSIGNED | ON_HOLD | CANCELLED
--   ASSIGNED   -> IN_PROGRESS | ON_HOLD | PENDING (re-assign) | CANCELLED
--   IN_PROGRESS-> REVIEW | ON_HOLD | CANCELLED
--   REVIEW     -> COMPLETED | IN_PROGRESS (sent back) | CANCELLED
--   ON_HOLD    -> PENDING | ASSIGNED | IN_PROGRESS | CANCELLED
--   COMPLETED / CANCELLED are terminal states.
CREATE OR REPLACE FUNCTION fn_validate_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_allowed BOOLEAN := FALSE;
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;                       -- nothing to validate
    END IF;

    v_allowed := CASE OLD.status
        WHEN 'PENDING'     THEN NEW.status IN ('ASSIGNED','ON_HOLD','CANCELLED')
        WHEN 'ASSIGNED'    THEN NEW.status IN ('IN_PROGRESS','ON_HOLD','PENDING','CANCELLED')
        WHEN 'IN_PROGRESS' THEN NEW.status IN ('REVIEW','ON_HOLD','CANCELLED')
        WHEN 'REVIEW'      THEN NEW.status IN ('COMPLETED','IN_PROGRESS','CANCELLED')
        WHEN 'ON_HOLD'     THEN NEW.status IN ('PENDING','ASSIGNED','IN_PROGRESS','CANCELLED')
        ELSE FALSE                        -- COMPLETED / CANCELLED
    END;

    IF NOT v_allowed THEN
        RAISE EXCEPTION
            'Illegal task status transition: % -> % (task %)',
            OLD.status, NEW.status, OLD.task_id
            USING ERRCODE = '23514';
    END IF;

    -- A task that goes back to PENDING must not keep an assignee.
    IF NEW.status = 'PENDING' THEN
        NEW.assigned_employee_id := NULL;
        NEW.assigned_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- Keep started_at / completed_at consistent with the status, no matter
-- whether the row was updated by the API, a trigger or a manual query.
CREATE OR REPLACE FUNCTION fn_stamp_timestamps()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'IN_PROGRESS' AND NEW.started_at IS NULL THEN
        NEW.started_at := NOW();
    END IF;

    IF NEW.status = 'COMPLETED' THEN
        NEW.completed_at := COALESCE(OLD.completed_at, NOW());
        NEW.progress_percent := 100;
    END IF;

    IF NEW.status IN ('PENDING','ASSIGNED') THEN
        NEW.completed_at := NULL;
    END IF;

    IF NEW.assigned_employee_id IS NOT NULL AND NEW.assigned_at IS NULL
       AND NEW.status IN ('ASSIGNED','IN_PROGRESS','REVIEW') THEN
        NEW.assigned_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

-- Every task movement is written to TASK_HISTORY automatically.
CREATE OR REPLACE FUNCTION fn_log_task_status_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO task_history (task_id, action, to_status, remarks)
        VALUES (NEW.task_id, 'CREATED', NEW.status, 'Task created');
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO task_history (task_id, action, from_status, to_status, remarks)
        VALUES (NEW.task_id, 'STATUS_CHANGE', OLD.status, NEW.status, NULL);
    ELSIF NEW.assigned_employee_id IS DISTINCT FROM OLD.assigned_employee_id THEN
        INSERT INTO task_history (task_id, action, from_status, to_status, remarks)
        VALUES (NEW.task_id, 'ASSIGNEE_CHANGED', OLD.status, NEW.status,
                'Assignee changed from ' || COALESCE(OLD.assigned_employee_id::text,'none')
                || ' to ' || COALESCE(NEW.assigned_employee_id::text,'none'));
    ELSIF NEW.progress_percent IS DISTINCT FROM OLD.progress_percent THEN
        INSERT INTO task_history (task_id, action, from_status, to_status, remarks)
        VALUES (NEW.task_id, 'PROGRESS_UPDATED', OLD.status, NEW.status,
                'Progress ' || OLD.progress_percent || '% -> ' || NEW.progress_percent || '%');
    END IF;

    RETURN NEW;
END;
$$;

-- tasks.actual_hours is always the SUM of the WORK_LOGS rows.
CREATE OR REPLACE FUNCTION fn_recalc_task_hours()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_task_id INT := COALESCE(NEW.task_id, OLD.task_id);
BEGIN
    UPDATE tasks t
       SET actual_hours = COALESCE((
               SELECT SUM(w.hours_spent) FROM work_logs w WHERE w.task_id = v_task_id
           ), 0)
     WHERE t.task_id = v_task_id;
    RETURN NULL;
END;
$$;

-- An employee may only log hours on a task assigned to them, and the
-- task must not be closed yet.
CREATE OR REPLACE FUNCTION fn_validate_work_log()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_task tasks%ROWTYPE;
BEGIN
    SELECT * INTO v_task FROM tasks WHERE task_id = NEW.task_id;

    IF v_task.assigned_employee_id IS DISTINCT FROM NEW.employee_id THEN
        RAISE EXCEPTION 'Employee % cannot log hours on task % (assigned to %)',
            NEW.employee_id, NEW.task_id, v_task.assigned_employee_id
            USING ERRCODE = '23514';
    END IF;

    IF v_task.status IN ('COMPLETED','CANCELLED') THEN
        RAISE EXCEPTION 'Task % is % - hours cannot be logged',
            NEW.task_id, v_task.status USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

-- Log work on the task history as well (audit trail of effort).
CREATE OR REPLACE FUNCTION fn_log_work_log_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO task_history (task_id, changed_by_employee, action, remarks)
        VALUES (NEW.task_id, NEW.employee_id, 'HOURS_LOGGED',
                NEW.hours_spent || 'h logged on ' || NEW.log_date
                || COALESCE(' - ' || LEFT(NEW.work_description, 120), ''));
    ELSE
        INSERT INTO task_history (task_id, changed_by_employee, action, remarks)
        VALUES (NEW.task_id, NEW.employee_id, 'HOURS_LOG_UPDATED',
                'Work log ' || NEW.work_log_id || ' changed');
    END IF;
    RETURN NULL;
END;
$$;

-- Creating an assignment records the allocation in the task history.
CREATE OR REPLACE FUNCTION fn_log_assignment_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO task_history (task_id, changed_by, action, remarks)
    VALUES (NEW.task_id, NEW.assigned_by, 'ASSIGNED',
            'Allocation mode ' || NEW.mode::text
            || CASE WHEN NEW.suitability_score IS NOT NULL
                    THEN ', suitability score ' || NEW.suitability_score ELSE '' END);
    RETURN NEW;
END;
$$;

-- Closing an assignment moves the task to the next logical step.
CREATE OR REPLACE FUNCTION fn_sync_assignment_task()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.state = 'COMPLETED' AND OLD.state = 'ACTIVE' THEN
        UPDATE tasks
           SET status = 'COMPLETED', completed_at = NOW(), progress_percent = 100,
               updated_at = NOW()
         WHERE task_id = NEW.task_id;
    END IF;
    RETURN NEW;
END;
$$;

-- A skill can only be removed from an employee when no open task needs it.
CREATE OR REPLACE FUNCTION fn_guard_skill_removal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_open INT;
BEGIN
    SELECT COUNT(*) INTO v_open
    FROM task_skills ts
    JOIN tasks t ON t.task_id = ts.task_id
    WHERE ts.skill_id = OLD.skill_id
      AND t.status IN ('PENDING','ASSIGNED','IN_PROGRESS','REVIEW');

    IF v_open > 0 THEN
        RAISE EXCEPTION
            'Skill % is required by % open task(s) and cannot be removed from employee %',
            OLD.skill_id, v_open, OLD.employee_id
            USING ERRCODE = '23514';
    END IF;

    RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------
-- Trigger registration (numbered so execution order is deterministic)
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_01_departments_touch   ON departments;
CREATE TRIGGER trg_01_departments_touch
    BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_02_employees_touch      ON employees;
CREATE TRIGGER trg_02_employees_touch
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_02_projects_touch       ON projects;
CREATE TRIGGER trg_02_projects_touch
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_02_employee_skills_touch ON employee_skills;
CREATE TRIGGER trg_02_employee_skills_touch
    BEFORE UPDATE ON employee_skills
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_02_comments_touch       ON comments;
CREATE TRIGGER trg_02_comments_touch
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- --- tasks -------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_01_tasks_validate_status ON tasks;
CREATE TRIGGER trg_01_tasks_validate_status
    BEFORE UPDATE OF status ON tasks
    FOR EACH ROW EXECUTE FUNCTION fn_validate_status();

DROP TRIGGER IF EXISTS trg_02_tasks_stamp ON tasks;
CREATE TRIGGER trg_02_tasks_stamp
    BEFORE INSERT OR UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION fn_stamp_timestamps();

DROP TRIGGER IF EXISTS trg_03_tasks_history ON tasks;
CREATE TRIGGER trg_03_tasks_history
    AFTER INSERT OR UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION fn_log_task_status_history();

-- --- work logs ---------------------------------------------------------
DROP TRIGGER IF EXISTS trg_01_work_logs_validate ON work_logs;
CREATE TRIGGER trg_01_work_logs_validate
    BEFORE INSERT OR UPDATE ON work_logs
    FOR EACH ROW EXECUTE FUNCTION fn_validate_work_log();

DROP TRIGGER IF EXISTS trg_02_work_logs_recalc ON work_logs;
CREATE TRIGGER trg_02_work_logs_recalc
    AFTER INSERT OR UPDATE OR DELETE ON work_logs
    FOR EACH ROW EXECUTE FUNCTION fn_recalc_task_hours();

DROP TRIGGER IF EXISTS trg_03_work_logs_history ON work_logs;
CREATE TRIGGER trg_03_work_logs_history
    AFTER INSERT OR UPDATE ON work_logs
    FOR EACH ROW EXECUTE FUNCTION fn_log_work_log_history();

-- --- assignments -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_01_assignments_history ON task_assignments;
CREATE TRIGGER trg_01_assignments_history
    AFTER INSERT ON task_assignments
    FOR EACH ROW EXECUTE FUNCTION fn_log_assignment_history();

DROP TRIGGER IF EXISTS trg_02_assignments_sync ON task_assignments;
CREATE TRIGGER trg_02_assignments_sync
    AFTER UPDATE ON task_assignments
    FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state)
    EXECUTE FUNCTION fn_sync_assignment_task();

-- --- employee skills ---------------------------------------------------
DROP TRIGGER IF EXISTS trg_01_employee_skills_guard ON employee_skills;
CREATE TRIGGER trg_01_employee_skills_guard
    BEFORE DELETE ON employee_skills
    FOR EACH ROW EXECUTE FUNCTION fn_guard_skill_removal();