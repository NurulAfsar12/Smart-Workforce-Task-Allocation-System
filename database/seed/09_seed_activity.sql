-- =====================================================================
-- File : 09_seed_activity.sql
-- Runs the automatic allocation engine over the seeded tasks, moves them
-- through the task workflow, logs working hours and adds comments.
--
-- This file is the live demonstration of the rule engine: every status
-- change below happens through fn_allocate_task() / fn_task_transition(),
-- and the history rows are written by the triggers.
--
-- Order matters and mirrors real work:
--   allocate -> start -> log hours -> review -> complete
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. AUTOMATIC ALLOCATION
--    fn_allocate_task() is called for every task. Three tasks are left
--    untouched on purpose so the UI always has PENDING work to show.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_title  TEXT;
    v_result JSONB;
    v_ok     INT := 0;
    v_skip   INT := 0;
    v_admin  INT := (SELECT user_id FROM users WHERE email = 'admin@smartworkforce.com');
BEGIN
    FOREACH v_title IN ARRAY ARRAY[
        'Design the checkout flow wireframes',
        'Build the checkout REST API',
        'Migrate customer table to the new schema',
        'Checkout regression test suite',
        'Sprint planning app screen set',
        'Offline task synchronisation',
        'Executive Power BI dashboard',
        'Demand forecasting model',
        'Warehouse schema documentation',
        'Containerise the API services',
        'Zero downtime deployment pipeline',
        'Kubernetes cluster upgrade to 1.31',
        'Rewrite the landing page copy'
    ] LOOP
        SELECT fn_allocate_task(t.task_id, v_admin)
          INTO v_result
          FROM tasks t
         WHERE t.title = v_title;

        IF (v_result ->> 'success')::BOOLEAN THEN
            v_ok := v_ok + 1;
            RAISE NOTICE 'ALLOCATED  % -> % (score %)',
                v_title, v_result -> 'employee' ->> 'employee_name', v_result ->> 'score';
        ELSE
            v_skip := v_skip + 1;
            RAISE NOTICE 'NO MATCH  % -> %', v_title, v_result ->> 'message';
        END IF;
    END LOOP;

    RAISE NOTICE '--- allocation finished: % allocated, % without eligible employee ---', v_ok, v_skip;
END $$;

-- ---------------------------------------------------------------------
-- 2. WORK STARTS
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_admin INT := (SELECT user_id FROM users WHERE email = 'admin@smartworkforce.com');
    r RECORD;
BEGIN
    FOR r IN
        SELECT task_id, title FROM tasks
         WHERE title IN ('Build the checkout REST API',
                         'Migrate customer table to the new schema',
                         'Checkout regression test suite',
                         'Sprint planning app screen set',
                         'Executive Power BI dashboard',
                         'Containerise the API services',
                         'Design the checkout flow wireframes',
                         'Warehouse schema documentation',
                         'Rewrite the landing page copy',
                         'Demand forecasting model')
    LOOP
        PERFORM fn_task_transition(r.task_id, 'IN_PROGRESS', v_admin, 'Work started');
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3. WORK LOGS
--    Trigger fn_recalc_task_hours() keeps tasks.actual_hours in sync and
--    trigger fn_validate_work_log() only accepts logs from the assignee.
-- ---------------------------------------------------------------------
INSERT INTO work_logs (task_id, employee_id, log_date, hours_spent, work_description)
SELECT t.task_id, t.assigned_employee_id,
       CURRENT_DATE - d.days_ago AS log_date,
       d.hours, d.note
FROM (VALUES
  ('Design the checkout flow wireframes', 1, 4.0, 'Cart and address step sketches'),
  ('Design the checkout flow wireframes', 2, 5.5, 'Payment step wireframes and review notes'),
  ('Design the checkout flow wireframes', 3, 4.0, 'High fidelity screens and handoff notes'),
  ('Build the checkout REST API',        1, 6.0, 'Cart validation endpoints'),
  ('Build the checkout REST API',        2, 7.0, 'Payment intent integration'),
  ('Build the checkout REST API',        3, 5.5, 'Order creation and tests'),
  ('Migrate customer table to the new schema', 1, 5.0, 'Schema analysis and normalisation plan'),
  ('Migrate customer table to the new schema', 2, 6.5, 'Migration script and rollback path'),
  ('Checkout regression test suite',    1, 3.5, 'Test plan and fixtures'),
  ('Checkout regression test suite',    2, 4.0, 'API contract tests'),
  ('Sprint planning app screen set',    1, 6.0, 'Login and profile screens'),
  ('Sprint planning app screen set',    2, 5.0, 'Task list and task detail screens'),
  ('Executive Power BI dashboard',     1, 4.5, 'Data model and first two tiles'),
  ('Executive Power BI dashboard',     2, 5.0, 'Refresh pipeline and remaining tiles'),
  ('Containerise the API services',     1, 3.0, 'Base Dockerfile for the API service'),
  ('Containerise the API services',     2, 3.5, 'Worker service image and registry push'),
  ('Warehouse schema documentation',   1, 4.0, 'Table and column dictionary'),
  ('Warehouse schema documentation',   2, 3.5, 'Metric definitions and review'),
  ('Rewrite the landing page copy',     1, 5.0, 'First three pages rewritten'),
  ('Rewrite the landing page copy',     2, 4.5, 'Remaining pages and meta descriptions'),
  ('Demand forecasting model',          1, 8.0, 'Baseline time series model and error metrics')
) AS d(task_title, days_ago, hours, note)
JOIN tasks t ON t.title = d.task_title
WHERE t.assigned_employee_id IS NOT NULL;

-- Progress follows the logged effort.
UPDATE tasks
   SET progress_percent = LEAST(
         95, ROUND(100 * actual_hours / NULLIF(estimated_hours, 0))::NUMERIC, 0
       )
 WHERE status IN ('ASSIGNED','IN_PROGRESS','REVIEW')
   AND actual_hours > 0;

-- ---------------------------------------------------------------------
-- 4. REVIEW AND COMPLETION
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_admin INT := (SELECT user_id FROM users WHERE email = 'admin@smartworkforce.com');
BEGIN
    -- design task: submitted for review, then approved
    PERFORM fn_task_transition(
        (SELECT task_id FROM tasks WHERE title='Design the checkout flow wireframes'),
        'REVIEW', v_admin, 'Submitted for review');
    PERFORM fn_task_transition(
        (SELECT task_id FROM tasks WHERE title='Design the checkout flow wireframes'),
        'COMPLETED', v_admin, 'Approved by product owner');

    PERFORM fn_task_transition(
        (SELECT task_id FROM tasks WHERE title='Warehouse schema documentation'),
        'REVIEW', v_admin, 'Dictionary ready for review');
    PERFORM fn_task_transition(
        (SELECT task_id FROM tasks WHERE title='Warehouse schema documentation'),
        'COMPLETED', v_admin, 'Delivered');

    PERFORM fn_task_transition(
        (SELECT task_id FROM tasks WHERE title='Rewrite the landing page copy'),
        'REVIEW', v_admin, 'Copy deck sent to marketing');
    PERFORM fn_task_transition(
        (SELECT task_id FROM tasks WHERE title='Rewrite the landing page copy'),
        'COMPLETED', v_admin, 'Published');

    -- the model is finished but still waiting for review
    PERFORM fn_task_transition(
        (SELECT task_id FROM tasks WHERE title='Demand forecasting model'),
        'REVIEW', v_admin, 'Awaiting data team review');
END $$;

-- Two deadlines are tightened after allocation so the demo data contains
-- one overdue task and one task that was completed late.
UPDATE tasks SET deadline = CURRENT_DATE - 2
 WHERE title = 'Containerise the API services';

UPDATE tasks SET deadline = CURRENT_DATE - 3
 WHERE title = 'Rewrite the landing page copy';

-- ---------------------------------------------------------------------
-- 5. COMMENTS
-- ---------------------------------------------------------------------
INSERT INTO comments (task_id, user_id, body)
SELECT t.task_id, u.user_id, v.body
FROM (VALUES
  ('Build the checkout REST API',
   'The payment intent endpoint needs an idempotency key before we can ship this.'),
  ('Build the checkout REST API',
   'Agreed, I added it to the API contract and will cover it with a test.'),
  ('Checkout regression test suite',
   'Fixtures are ready on the QA branch. Please review the payment mocks.'),
  ('Migrate customer table to the new schema',
   'Rollback script tested against a copy of production, took 40 seconds.'),
  ('Executive Power BI dashboard',
   'Finance asked for a currency selector on the revenue tile.'),
  ('Design the checkout flow wireframes',
   'Approved with the accessibility notes already applied.')
) AS v(task_title, body)
JOIN tasks t ON t.title = v.task_title
CROSS JOIN LATERAL (
    SELECT user_id FROM users
     WHERE employee_id = t.assigned_employee_id
     LIMIT 1
) u;

-- ---------------------------------------------------------------------
-- 6. SUMMARY
-- ---------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE '-----------------------------------------------------------';
    RAISE NOTICE 'Employees      : %', (SELECT COUNT(*) FROM employees);
    RAISE NOTICE 'Skills         : %', (SELECT COUNT(*) FROM skills);
    RAISE NOTICE 'Employee skills: %', (SELECT COUNT(*) FROM employee_skills);
    RAISE NOTICE 'Projects       : %', (SELECT COUNT(*) FROM projects);
    RAISE NOTICE 'Tasks          : %', (SELECT COUNT(*) FROM tasks);
    RAISE NOTICE 'Assignments    : %', (SELECT COUNT(*) FROM task_assignments);
    RAISE NOTICE 'Work logs      : %', (SELECT COUNT(*) FROM work_logs);
    RAISE NOTICE 'History rows   : %', (SELECT COUNT(*) FROM task_history);
    RAISE NOTICE '-----------------------------------------------------------';
END $$;