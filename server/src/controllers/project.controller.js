const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/projects */
const list = asyncHandler(async (req, res) => {
  const { status, department_id, search } = req.query;

  const projects = await db.queryMany(
    `SELECT p.*,
            d.name AS department_name,
            (e.first_name || ' ' || e.last_name) AS lead_name,
            v.total_tasks, v.completed_tasks, v.active_tasks, v.pending_tasks,
            v.cancelled_tasks, v.estimated_hours, v.actual_hours,
            v.completion_pct, v.budget_usage_pct
       FROM projects p
       JOIN departments d ON d.department_id = p.department_id
       LEFT JOIN employees e ON e.employee_id = p.lead_id
       JOIN v_project_progress v ON v.project_id = p.project_id
      WHERE ($1::TEXT IS NULL OR p.status::TEXT = $1)
        AND ($2::INT  IS NULL OR p.department_id = $2::INT)
        AND ($3::TEXT IS NULL OR p.name ILIKE '%' || $3 || '%' OR p.code ILIKE '%' || $3 || '%')
      ORDER BY p.status, p.name`,
    [status || null, department_id || null, search || null]
  );

  res.json({ success: true, count: projects.length, data: projects });
});

/** GET /api/projects/:id */
const getOne = asyncHandler(async (req, res) => {
  const project = await db.queryOne(
    `SELECT p.*, d.name AS department_name,
            (e.first_name || ' ' || e.last_name) AS lead_name,
            v.total_tasks, v.completed_tasks, v.active_tasks, v.pending_tasks,
            v.estimated_hours, v.actual_hours, v.completion_pct, v.budget_usage_pct
       FROM projects p
       JOIN departments d ON d.department_id = p.department_id
       LEFT JOIN employees e ON e.employee_id = p.lead_id
       JOIN v_project_progress v ON v.project_id = p.project_id
      WHERE p.project_id = $1`,
    [req.params.id]
  );
  if (!project) throw ApiError.notFound('Project not found');

  const tasks = await db.queryMany(
    `SELECT task_id, title, status, priority, estimated_hours, actual_hours,
            deadline, assigned_employee_id, assigned_employee_name, is_overdue
       FROM v_task_board
      WHERE project_id = $1
      ORDER BY deadline NULLS LAST, task_id`,
    [req.params.id]
  );

  res.json({ success: true, data: { ...project, tasks } });
});

const FIELDS = ['code', 'name', 'description', 'department_id', 'lead_id', 'start_date', 'end_date', 'budget_hours', 'status'];

/** POST /api/projects */
const create = asyncHandler(async (req, res) => {
  const provided = FIELDS.filter((f) => req.body[f] !== undefined);
  if (!provided.includes('name') || !provided.includes('department_id')) {
    throw ApiError.badRequest('name and department_id are required');
  }

  const placeholders = provided.map((_, i) => `$${i + 1}`);
  const project = await db.queryOne(
    `INSERT INTO projects (${provided.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING project_id, code, name, department_id, lead_id, start_date, end_date, budget_hours, status`,
    provided.map((f) => (req.body[f] === '' ? null : req.body[f]))
  );

  res.status(201).json({ success: true, data: project });
});

/** PUT /api/projects/:id */
const update = asyncHandler(async (req, res) => {
  const provided = FIELDS.filter((f) => req.body[f] !== undefined);
  if (!provided.length) throw ApiError.badRequest('No fields to update');

  const setClause = provided.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const project = await db.queryOne(
    `UPDATE projects SET ${setClause} WHERE project_id = $1
     RETURNING project_id, code, name, department_id, lead_id, start_date, end_date, budget_hours, status`,
    [req.params.id, ...provided.map((f) => (req.body[f] === '' ? null : req.body[f]))]
  );
  if (!project) throw ApiError.notFound('Project not found');
  res.json({ success: true, data: project });
});

/** DELETE /api/projects/:id - cascades to its tasks */
const remove = asyncHandler(async (req, res) => {
  const row = await db.queryOne('DELETE FROM projects WHERE project_id = $1 RETURNING project_id', [
    req.params.id,
  ]);
  if (!row) throw ApiError.notFound('Project not found');
  res.json({ success: true, message: 'Project and its tasks deleted', data: row });
});

/** GET /api/projects/:id/tasks */
const listTasks = asyncHandler(async (req, res) => {
  const tasks = await db.queryMany(
    `SELECT * FROM v_task_board WHERE project_id = $1
      ORDER BY CASE status WHEN 'IN_PROGRESS' THEN 1 WHEN 'ASSIGNED' THEN 2
                           WHEN 'REVIEW' THEN 3 WHEN 'PENDING' THEN 4 ELSE 5 END,
               deadline NULLS LAST, task_id`,
    [req.params.id]
  );
  res.json({ success: true, count: tasks.length, data: tasks });
});

module.exports = { list, getOne, create, update, remove, listTasks };