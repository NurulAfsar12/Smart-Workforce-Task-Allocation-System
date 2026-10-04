const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/workload/employees
 * The main workload screen: every employee with hours based utilisation.
 * This is the screen that proves two employees with the same task count
 * can carry very different amounts of work.
 */
const employees = asyncHandler(async (req, res) => {
  const { department_id, workload_level } = req.query;

  const rows = await db.queryMany(
    `SELECT * FROM v_employee_workload
      WHERE ($1::INT IS NULL OR department_id = $1::INT)
        AND ($2::TEXT IS NULL OR workload_level = $2::TEXT)
      ORDER BY utilization_pct DESC, employee_name`,
    [department_id || null, workload_level || null]
  );

  const totals = rows.reduce(
    (acc, r) => ({
      capacity: acc.capacity + Number(r.capacity_hours),
      allocated: acc.allocated + Number(r.allocated_hours),
      openTasks: acc.openTasks + Number(r.open_tasks),
      overdue: acc.overdue + Number(r.overdue_tasks),
    }),
    { capacity: 0, allocated: 0, openTasks: 0, overdue: 0 }
  );

  res.json({
    success: true,
    count: rows.length,
    summary: {
      total_capacity_hours: totals.capacity,
      total_allocated_hours: totals.allocated,
      total_remaining_hours: totals.capacity - totals.allocated,
      overall_utilization_pct:
        totals.capacity > 0 ? Math.round((totals.allocated / totals.capacity) * 10000) / 100 : 0,
      open_tasks: totals.openTasks,
      overdue_tasks: totals.overdue,
    },
    data: rows,
  });
});

/** GET /api/workload/:employeeId */
const employee = asyncHandler(async (req, res) => {
  const workload = await db.queryOne('SELECT * FROM fn_employee_workload($1)', [req.params.employeeId]);
  if (!workload) return res.status(404).json({ success: false, message: 'Employee not found' });
  res.json({ success: true, data: workload });
});

/**
 * GET /api/workload/heatmap
 * Allocation pressure per day for the next N days, based on the deadlines
 * of the open tasks. Shows where the team is going to run out of capacity.
 */
const heatmap = asyncHandler(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 21, 60);

  const daily = await db.queryMany(
    `WITH days AS (
       SELECT generate_series(CURRENT_DATE, CURRENT_DATE + $1::INT - 1, '1 day')::DATE AS day
     )
     SELECT d.day,
            COALESCE(SUM(t.estimated_hours), 0)     AS hours_due,
            COUNT(t.task_id)::INT                    AS tasks_due,
            COUNT(*) FILTER (WHERE t.priority IN ('HIGH','CRITICAL'))::INT AS critical_tasks,
            COALESCE(SUM(t.estimated_hours) FILTER (
                WHERE t.assigned_employee_id IS NULL), 0) AS unallocated_hours
       FROM days d
       LEFT JOIN tasks t
              ON t.deadline = d.day
             AND t.status NOT IN ('COMPLETED','CANCELLED')
      GROUP BY d.day
      ORDER BY d.day`,
    [days]
  );

  const byDepartment = await db.queryMany(
    `SELECT p.department_id, d.name AS department_name,
            COALESCE(SUM(t.estimated_hours), 0)                  AS allocated_hours,
            COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN t.actual_hours ELSE 0 END), 0) AS completed_hours,
            COUNT(t.task_id) FILTER (WHERE t.status NOT IN ('COMPLETED','CANCELLED'))::INT AS open_tasks,
            COUNT(t.task_id)::INT                                AS total_tasks
       FROM departments d
       LEFT JOIN projects p  ON p.department_id = d.department_id
       LEFT JOIN tasks t     ON t.project_id = p.project_id
      GROUP BY p.department_id, d.name
      ORDER BY allocated_hours DESC`,
    []
  );

  res.json({ success: true, days, daily, departments: byDepartment });
});

/** GET /api/workload/distribution - how many people sit in each workload band */
const distribution = asyncHandler(async (req, res) => {
  const rows = await db.queryMany(
    `SELECT workload_level,
            COUNT(*)::INT                AS employees,
            COALESCE(SUM(allocated_hours), 0) AS allocated_hours,
            COALESCE(SUM(capacity_hours), 0)  AS capacity_hours,
            COALESCE(SUM(open_tasks), 0)      AS open_tasks
       FROM v_employee_workload
      GROUP BY workload_level
      ORDER BY CASE workload_level WHEN 'OVERLOADED' THEN 1 WHEN 'HEAVY' THEN 2
                                   WHEN 'BALANCED' THEN 3 WHEN 'LIGHT' THEN 4
                                   WHEN 'FREE' THEN 5 ELSE 6 END`
  );
  res.json({ success: true, data: rows });
});

module.exports = { employees, employee, heatmap, distribution };