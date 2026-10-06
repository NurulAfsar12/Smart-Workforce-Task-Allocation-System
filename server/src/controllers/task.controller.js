const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const allocationService = require('../services/allocation.service');

const TASK_STATUSES = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'ON_HOLD', 'CANCELLED'];

/**
 * GET /api/tasks
 * Filters: status, priority, project_id, assigned_employee_id,
 *          department_id, search, overdue, unassigned
 */
const list = asyncHandler(async (req, res) => {
  const {
    status, priority, project_id, assigned_employee_id, department_id,
    search, overdue, unassigned, my_tasks, limit = 100, offset = 0,
  } = req.query;

  const employeeFilter = my_tasks === 'true' && req.user.role !== 'ADMIN'
    ? req.user.employee_id
    : assigned_employee_id || null;

  const tasks = await db.queryMany(
    `SELECT * FROM v_task_board
      WHERE ($1::TEXT IS NULL OR status::TEXT = $1)
        AND ($2::TEXT IS NULL OR priority::TEXT = $2)
        AND ($3::INT  IS NULL OR project_id = $3::INT)
        AND ($4::INT  IS NULL OR assigned_employee_id = $4::INT)
        AND ($5::INT  IS NULL OR (SELECT p.department_id FROM projects p WHERE p.project_id = v_task_board.project_id) = $5::INT)
        AND ($6::TEXT IS NULL OR title ILIKE '%' || $6 || '%' OR description ILIKE '%' || $6 || '%')
        AND ($7::TEXT IS NULL OR is_overdue::TEXT = $7)
        AND ($8::TEXT IS NULL OR (assigned_employee_id IS NULL)::TEXT = $8)
      ORDER BY CASE status WHEN 'IN_PROGRESS' THEN 1 WHEN 'ASSIGNED' THEN 2
                           WHEN 'REVIEW' THEN 3 WHEN 'PENDING' THEN 4
                           WHEN 'ON_HOLD' THEN 5 ELSE 6 END,
               deadline NULLS LAST, task_id
      LIMIT $9 OFFSET $10`,
    [
      status || null, priority || null, project_id || null, employeeFilter,
      department_id || null, search || null,
      overdue === 'true' ? 'true' : null,
      unassigned === 'true' ? 'true' : null,
      Number(limit), Number(offset),
    ]
  );

  res.json({ success: true, count: tasks.length, data: tasks });
});

/** GET /api/tasks/:id - full detail for the task drawer */
const getOne = asyncHandler(async (req, res) => {
  const task = await db.queryOne('SELECT * FROM v_task_board WHERE task_id = $1', [req.params.id]);
  if (!task) throw ApiError.notFound('Task not found');

  const [requiredSkills, assignments, workLogs, history, comments] = await Promise.all([
    db.queryMany(
      `SELECT ts.skill_id, ts.required_level, ts.is_mandatory, s.name AS skill_name, s.category
         FROM task_skills ts
         JOIN skills s ON s.skill_id = ts.skill_id
        WHERE ts.task_id = $1
        ORDER BY ts.is_mandatory DESC, ts.required_level DESC`,
      [req.params.id]
    ),
    db.queryMany(
      `SELECT assignment_id, employee_id, employee_name, mode, state,
              suitability_score, score_breakdown, assigned_at, released_at, note
         FROM v_allocation_log
        WHERE task_id = $1
        ORDER BY assigned_at DESC`,
      [req.params.id]
    ),
    db.queryMany(
      `SELECT work_log_id, employee_id, log_date, hours_spent, work_description
         FROM work_logs WHERE task_id = $1 ORDER BY log_date DESC, work_log_id DESC`,
      [req.params.id]
    ),
    db.queryMany(
      `SELECT h.*, u.full_name AS changed_by_name
         FROM task_history h
         LEFT JOIN users u ON u.user_id = h.changed_by
        WHERE h.task_id = $1
        ORDER BY h.changed_at DESC, h.history_id DESC`,
      [req.params.id]
    ),
    db.queryMany(
      `SELECT c.comment_id, c.body, c.created_at, c.updated_at, u.full_name, u.role
         FROM comments c
         LEFT JOIN users u ON u.user_id = c.user_id
        WHERE c.task_id = $1
        ORDER BY c.created_at`,
      [req.params.id]
    ),
  ]);

  res.json({
    success: true,
    data: { ...task, required_skills: requiredSkills, assignments, work_logs: workLogs, history, comments },
  });
});

/**
 * POST /api/tasks
 * Creates a task and, when auto_allocate is true, immediately runs the
 * database allocation engine for it. Both actions happen in one
 * transaction so a task is never created without its skills.
 */
const create = asyncHandler(async (req, res) => {
  const {
    project_id, title, description, priority = 'MEDIUM',
    estimated_hours, deadline, auto_allocate = false,
    required_skills = [],
  } = req.body;

  if (!project_id || !title || !estimated_hours) {
    throw ApiError.badRequest('project_id, title and estimated_hours are required');
  }

  const result = await db.transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO tasks (project_id, title, description, priority, estimated_hours, deadline, created_by)
       VALUES ($1, $2, $3, $4::task_priority, $5, $6, $7)
       RETURNING *`,
      [project_id, title, description || null, priority, estimated_hours, deadline || null, req.user.user_id]
    );
    const task = rows[0];

    for (const entry of required_skills) {
      const skillId = entry.skill_id ?? entry;
      const level = entry.required_level ?? entry.level ?? 3;
      const mandatory = entry.is_mandatory ?? true;
      await client.query(
        `INSERT INTO task_skills (task_id, skill_id, required_level, is_mandatory)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (task_id, skill_id) DO NOTHING`,
        [task.task_id, skillId, level, mandatory]
      );
    }

    return task;
  });

  let allocation = null;
  if (auto_allocate) {
    allocation = await allocationService.allocate(result.task_id, { userId: req.user.user_id });
  }

  res.status(201).json({
    success: true,
    data: result,
    allocation: allocation
      ? { allocated: allocation.allocated, employee: allocation.employee, score: allocation.score, message: allocation.message }
      : null,
  });
});

const UPDATE_FIELDS = ['title', 'description', 'priority', 'estimated_hours', 'deadline', 'progress_percent', 'project_id'];

/** PUT /api/tasks/:id */
const update = asyncHandler(async (req, res) => {
  const provided = UPDATE_FIELDS.filter((f) => req.body[f] !== undefined);
  if (!provided.length) throw ApiError.badRequest('No fields to update');

  const setClause = provided.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const task = await db.queryOne(
    `UPDATE tasks SET ${setClause} WHERE task_id = $1 RETURNING *`,
    [req.params.id, ...provided.map((f) => req.body[f])]
  );
  if (!task) throw ApiError.notFound('Task not found');
  res.json({ success: true, data: task });
});

/** DELETE /api/tasks/:id */
const remove = asyncHandler(async (req, res) => {
  const row = await db.queryOne('DELETE FROM tasks WHERE task_id = $1 RETURNING task_id', [req.params.id]);
  if (!row) throw ApiError.notFound('Task not found');
  res.json({ success: true, message: 'Task deleted', data: row });
});

// -------------------------------------------------------------------------
// Allocation
// -------------------------------------------------------------------------

/** GET /api/tasks/:id/candidates - suitability ranking for this task */
const candidates = asyncHandler(async (req, res) => {
  const includeIneligible = req.query.include_ineligible !== 'false';
  const payload = await allocationService.getCandidates(req.params.id, includeIneligible);
  res.json({ success: true, ...payload });
});

/** POST /api/tasks/:id/allocate - automatic allocation */
const allocate = asyncHandler(async (req, res) => {
  const outcome = await allocationService.allocate(req.params.id, {
    userId: req.user.user_id,
    force: req.body?.force === true,
  });

  if (!outcome.allocated) {
    // 409: the request was valid, no employee qualified
    return res.status(409).json({
      success: false,
      reason: outcome.reason,
      message: outcome.message,
      task_id: Number(req.params.id),
    });
  }

  res.json({
    success: true,
    message: `Task allocated to ${outcome.employee.employee_name}`,
    data: outcome,
  });
});

/** POST /api/tasks/:id/assign - manual allocation to a chosen employee */
const assignManually = asyncHandler(async (req, res) => {
  const employeeId = req.body.employee_id;
  if (!employeeId) throw ApiError.badRequest('employee_id is required');

  const outcome = await allocationService.assignManually(req.params.id, employeeId, {
    userId: req.user.user_id,
    force: req.body.force === true,
  });

  res.json({
    success: true,
    message: `Task assigned to ${outcome.employee.employee_name}`,
    data: outcome,
  });
});

/** POST /api/tasks/:id/release - unassign and return to the pending pool */
const release = asyncHandler(async (req, res) => {
  const task = await allocationService.release(req.params.id, {
    userId: req.user.user_id,
    note: req.body?.note || null,
  });
  res.json({ success: true, message: 'Assignment released, task is PENDING again', data: task });
});

/**
 * Statuses the current assignee may move a task to on their own initiative.
 * PENDING is excluded because returning a task to the pool releases the
 * assignment, which is an administrative act (POST /:id/release). CANCELLED
 * is excluded because cancelling kills other people's plans.
 */
const SELF_SERVICE_STATUSES = ['IN_PROGRESS', 'REVIEW', 'COMPLETED', 'ON_HOLD'];

/** POST /api/tasks/:id/transition - move through the workflow */
const transition = asyncHandler(async (req, res) => {
  const { status, remarks } = req.body;
  if (!TASK_STATUSES.includes(status)) {
    throw ApiError.badRequest(`status must be one of: ${TASK_STATUSES.join(', ')}`);
  }

  // Authorisation: an admin may drive any task; anyone else may only drive a
  // task assigned to them, and only into a self-service status. Without this
  // any employee could close a colleague's task and corrupt the workload and
  // performance reports that read from task_history.
  if (req.user.role !== 'ADMIN') {
    const current = await db.queryOne(
      'SELECT task_id, assigned_employee_id FROM tasks WHERE task_id = $1',
      [req.params.id]
    );
    if (!current) throw ApiError.notFound(`Task ${req.params.id} not found`);
    if (current.assigned_employee_id !== req.user.employee_id) {
      throw ApiError.forbidden('You can only change the status of tasks assigned to you');
    }
    if (!SELF_SERVICE_STATUSES.includes(status)) {
      throw ApiError.forbidden(`Only an administrator may move a task to ${status}`);
    }
  }

  const task = await allocationService.transition(req.params.id, status, {
    userId: req.user.user_id,
    remarks: remarks || null,
  });

  res.json({ success: true, message: `Task moved to ${status}`, data: task });
});

// -------------------------------------------------------------------------
// Task skills
// -------------------------------------------------------------------------

/** PUT /api/tasks/:id/skills - replace the required skill set */
const setSkills = asyncHandler(async (req, res) => {
  const skills = req.body.skills;
  if (!Array.isArray(skills)) throw ApiError.badRequest('skills must be an array');

  await db.transaction(async (client) => {
    await client.query('DELETE FROM task_skills WHERE task_id = $1', [req.params.id]);
    for (const entry of skills) {
      await client.query(
        `INSERT INTO task_skills (task_id, skill_id, required_level, is_mandatory)
         VALUES ($1, $2, $3, $4)`,
        [
          req.params.id,
          entry.skill_id ?? entry,
          entry.required_level ?? entry.level ?? 3,
          entry.is_mandatory ?? true,
        ]
      );
    }
  });

  const rows = await db.queryMany(
    `SELECT ts.skill_id, ts.required_level, ts.is_mandatory, s.name AS skill_name
       FROM task_skills ts JOIN skills s ON s.skill_id = ts.skill_id
      WHERE ts.task_id = $1`,
    [req.params.id]
  );

  res.json({ success: true, message: 'Required skills updated', data: rows });
});

// -------------------------------------------------------------------------
// Work logs
// -------------------------------------------------------------------------

/** GET /api/tasks/:id/logs */
const listLogs = asyncHandler(async (req, res) => {
  const rows = await db.queryMany(
    `SELECT w.*, e.first_name || ' ' || e.last_name AS employee_name
       FROM work_logs w
       JOIN employees e ON e.employee_id = w.employee_id
      WHERE w.task_id = $1
      ORDER BY w.log_date DESC, w.work_log_id DESC`,
    [req.params.id]
  );
  res.json({ success: true, data: rows });
});

/** POST /api/tasks/:id/logs - log working hours */
const addLog = asyncHandler(async (req, res) => {
  const { log_date, hours_spent, work_description } = req.body;
  if (!hours_spent || Number(hours_spent) <= 0) throw ApiError.badRequest('hours_spent must be greater than 0');

  // The database only accepts a log from the employee currently holding the
  // task (trigger fn_validate_work_log), so:
  //  - employees always log for themselves
  //  - an admin without an employee record logs on behalf of the assignee
  let employeeId = req.user.employee_id;
  if (req.user.role === 'ADMIN' && req.body.employee_id) employeeId = req.body.employee_id;
  if (!employeeId) {
    employeeId = await db.queryOne(
      'SELECT assigned_employee_id FROM tasks WHERE task_id = $1',
      [req.params.id]
    )?.assigned_employee_id;
  }
  if (!employeeId) {
    throw ApiError.badRequest(
      'This task has no assignee, so hours cannot be logged against it'
    );
  }

  const row = await db.queryOne(
    `INSERT INTO work_logs (task_id, employee_id, log_date, hours_spent, work_description)
     VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5)
     RETURNING *`,
    [req.params.id, employeeId, log_date || null, hours_spent, work_description || null]
  );

  const task = await db.queryOne('SELECT actual_hours, estimated_hours, progress_percent FROM tasks WHERE task_id = $1', [
    req.params.id,
  ]);

  res.status(201).json({
    success: true,
    message: `${hours_spent}h logged`,
    data: row,
    task_hours: task,
  });
});

/** DELETE /api/tasks/:taskId/logs/:logId */
const deleteLog = asyncHandler(async (req, res) => {
  const row = await db.queryOne('DELETE FROM work_logs WHERE work_log_id = $1 RETURNING work_log_id', [
    req.params.logId,
  ]);
  if (!row) throw ApiError.notFound('Work log not found');
  res.json({ success: true, message: 'Work log removed', data: row });
});

// -------------------------------------------------------------------------
// Comments & history
// -------------------------------------------------------------------------

/** POST /api/tasks/:id/comments */
const addComment = asyncHandler(async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) throw ApiError.badRequest('Comment body cannot be empty');

  const row = await db.queryOne(
    'INSERT INTO comments (task_id, user_id, body) VALUES ($1, $2, $3) RETURNING *',
    [req.params.id, req.user.user_id, body]
  );
  res.status(201).json({ success: true, data: row });
});

/** GET /api/tasks/:id/history */
const getHistory = asyncHandler(async (req, res) => {
  const rows = await db.queryMany(
    `SELECT h.*, u.full_name AS changed_by_name,
            e.first_name || ' ' || e.last_name AS changed_by_employee
       FROM task_history h
       LEFT JOIN users u      ON u.user_id = h.changed_by
       LEFT JOIN employees e  ON e.employee_id = h.changed_by_employee
      WHERE h.task_id = $1
      ORDER BY h.changed_at DESC, h.history_id DESC`,
    [req.params.id]
  );
  res.json({ success: true, data: rows });
});

module.exports = {
  list, getOne, create, update, remove,
  candidates, allocate, assignManually, release, transition,
  setSkills, listLogs, addLog, deleteLog,
  addComment, getHistory,
};