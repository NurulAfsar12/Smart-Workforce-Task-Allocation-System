const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/reports/dashboard - KPI cards plus the small charts */
const dashboard = asyncHandler(async (req, res) => {
  const [totals, byStatus, byPriority, workload, recentTasks, topPerformers, skillGaps] =
    await Promise.all([
      db.queryOne(
        `SELECT
           (SELECT COUNT(*)::INT FROM employees WHERE employment_status = 'ACTIVE') AS active_employees,
           (SELECT COUNT(*)::INT FROM departments)  AS departments,
           (SELECT COUNT(*)::INT FROM skills)      AS skills,
           (SELECT COUNT(*)::INT FROM projects WHERE status = 'ACTIVE') AS active_projects,
           (SELECT COUNT(*)::INT FROM tasks)        AS total_tasks,
           (SELECT COUNT(*)::INT FROM tasks WHERE status = 'PENDING')    AS pending_tasks,
           (SELECT COUNT(*)::INT FROM tasks WHERE status = 'COMPLETED')  AS completed_tasks,
           (SELECT COUNT(*)::INT FROM tasks WHERE status NOT IN ('COMPLETED','CANCELLED')
              AND deadline < CURRENT_DATE)                                 AS overdue_tasks,
           (SELECT COALESCE(SUM(estimated_hours),0) FROM tasks
             WHERE status NOT IN ('COMPLETED','CANCELLED'))                AS open_estimated_hours,
           (SELECT COALESCE(SUM(hours_spent),0) FROM work_logs
             WHERE log_date >= CURRENT_DATE - 30)                          AS logged_hours_30d,
           (SELECT COALESCE(SUM(estimated_hours),0) - COALESCE(SUM(actual_hours),0)
              FROM tasks WHERE status = 'COMPLETED')                         AS hours_variance,
           (SELECT ROUND(AVG(suitability_score),2) FROM task_assignments
             WHERE state = 'ACTIVE' AND suitability_score IS NOT NULL)     AS avg_suitability,
           (SELECT COUNT(*)::INT FROM task_assignments WHERE mode = 'AUTO') AS auto_allocations`
      ),
      db.queryMany(
        `SELECT status::TEXT, COUNT(*)::INT AS count
           FROM tasks GROUP BY status ORDER BY count DESC`
      ),
      db.queryMany(
        `SELECT priority::TEXT, COUNT(*)::INT AS count
           FROM tasks GROUP BY priority
          ORDER BY CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
                                 WHEN 'MEDIUM' THEN 3 ELSE 4 END`
      ),
      db.queryMany(
        `SELECT workload_level, COUNT(*)::INT AS employees,
                COALESCE(SUM(allocated_hours),0) AS allocated_hours
           FROM v_employee_workload
          GROUP BY workload_level`
      ),
      db.queryMany(
        `SELECT task_id, title, status, priority, project_name, deadline,
                assigned_employee_name, is_overdue, estimated_hours, actual_hours
           FROM v_task_board
          WHERE status NOT IN ('COMPLETED','CANCELLED')
          ORDER BY deadline NULLS LAST
          LIMIT 8`
      ),
      db.queryMany(
        `SELECT employee_name, department_name, completed_tasks,
                estimated_hours, actual_hours, on_time_completions, late_completions
           FROM v_employee_performance
          WHERE completed_tasks > 0
          ORDER BY completed_tasks DESC, on_time_completions DESC
          LIMIT 5`
      ),
      db.queryMany(
        `SELECT skill_name, supply_status, qualified_employees, open_tasks_requiring, open_hours_required
           FROM v_skill_demand_supply
          WHERE supply_status IN ('CRITICAL_GAP','SCARCE') AND open_tasks_requiring > 0
          ORDER BY supply_status, open_tasks_requiring DESC
          LIMIT 6`
      ),
    ]);

  res.json({
    success: true,
    data: { totals, by_status: byStatus, by_priority: byPriority, workload, recent_tasks: recentTasks, top_performers: topPerformers, skill_gaps: skillGaps },
  });
});

/** GET /api/reports/workload - full workload table with filters */
const workload = asyncHandler(async (req, res) => {
  const rows = await db.queryMany(
    `SELECT * FROM v_employee_workload
      ORDER BY utilization_pct DESC, employee_name`
  );
  res.json({ success: true, count: rows.length, data: rows });
});

/** GET /api/reports/projects */
const projects = asyncHandler(async (req, res) => {
  const rows = await db.queryMany(
    `SELECT * FROM v_project_progress ORDER BY completion_pct DESC, project_name`
  );
  res.json({ success: true, count: rows.length, data: rows });
});

/** GET /api/reports/skills - skill demand vs supply */
const skills = asyncHandler(async (req, res) => {
  const rows = await db.queryMany(
    `SELECT * FROM v_skill_demand_supply
      ORDER BY
        CASE supply_status WHEN 'CRITICAL_GAP' THEN 1 WHEN 'SCARCE' THEN 2
                           WHEN 'AVAILABLE' THEN 3 ELSE 4 END,
        open_tasks_requiring DESC, skill_name`
  );
  res.json({ success: true, count: rows.length, data: rows });
});

/** GET /api/reports/performance */
const performance = asyncHandler(async (req, res) => {
  const rows = await db.queryMany(
    `SELECT * FROM v_employee_performance ORDER BY completed_tasks DESC, employee_name`
  );
  res.json({ success: true, count: rows.length, data: rows });
});

/** GET /api/reports/deadline-risk */
const deadlineRisk = asyncHandler(async (req, res) => {
  const rows = await db.queryMany(
    `SELECT * FROM v_deadline_risk
      ORDER BY CASE risk_level WHEN 'OVERDUE' THEN 1 WHEN 'CRITICAL' THEN 2
                               WHEN 'AT_RISK' THEN 3 ELSE 4 END,
               deadline NULLS LAST`
  );

  const summary = rows.reduce((acc, r) => {
    acc[r.risk_level] = (acc[r.risk_level] || 0) + 1;
    return acc;
  }, {});

  res.json({ success: true, count: rows.length, summary, data: rows });
});

/** GET /api/reports/allocation-log - every automatic and manual decision */
const allocationLog = asyncHandler(async (req, res) => {
  const { mode, limit = 200 } = req.query;
  const rows = await db.queryMany(
    `SELECT * FROM v_allocation_log
      WHERE ($1::TEXT IS NULL OR mode::TEXT = $1)
      ORDER BY assigned_at DESC
      LIMIT $2`,
    [mode || null, Number(limit)]
  );
  res.json({ success: true, count: rows.length, data: rows });
});

/** GET /api/reports/effort - logged hours per day and employee */
const effort = asyncHandler(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 180);

  const rows = await db.queryMany(
    `SELECT * FROM v_daily_effort
      WHERE log_date >= CURRENT_DATE - $1::INT
      ORDER BY log_date DESC, hours_spent DESC`,
    [days]
  );

  const byDay = await db.queryMany(
    `SELECT log_date, SUM(hours_spent) AS hours_spent, COUNT(DISTINCT employee_id)::INT AS employees
       FROM v_daily_effort
      WHERE log_date >= CURRENT_DATE - $1::INT
      GROUP BY log_date ORDER BY log_date`,
    [days]
  );

  res.json({ success: true, days, by_day: byDay, by_employee: rows });
});

module.exports = { dashboard, workload, projects, skills, performance, deadlineRisk, allocationLog, effort };