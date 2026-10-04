const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/** Shared column list so list and detail never drift apart. */
const EMPLOYEE_COLUMNS = `
  e.employee_id, e.employee_code, e.first_name, e.last_name,
  e.first_name || ' ' || e.last_name AS employee_name,
  e.email, e.phone, e.job_title,
  e.department_id, d.name AS department_name,
  e.manager_id,
  (m.first_name || ' ' || m.last_name) AS manager_name,
  e.hire_date, e.employment_status, e.weekly_capacity_hours, e.is_available, e.avatar_url,
  e.created_at, e.updated_at`;

/**
 * GET /api/employees
 * Filters: search, department_id, status, availability, workload_level
 * Sorting:  sort_by (employee_name|department|utilization_pct|allocated_hours)
 */
const list = asyncHandler(async (req, res) => {
  const { search, department_id, status, availability, workload_level, sort_by = 'employee_name', order = 'asc' } = req.query;

  const allowedSort = {
    employee_name: 'w.employee_name',
    department: 'w.department_name',
    utilization: 'w.utilization_pct',
    allocated: 'w.allocated_hours',
    remaining: 'w.remaining_hours',
    open_tasks: 'w.open_tasks',
    overdue: 'w.overdue_tasks',
    capacity: 'w.capacity_hours',
  };
  const sortColumn = allowedSort[sort_by] || allowedSort.employee_name;
  const sortOrder = String(order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const employees = await db.queryMany(
    `SELECT w.*,
            u.user_id, u.is_active AS account_active,
            COALESCE(sk.skills, '') AS skill_names
       FROM v_employee_workload w
       LEFT JOIN users u ON u.employee_id = w.employee_id
       LEFT JOIN LATERAL (
         SELECT STRING_AGG(s.name, ', ' ORDER BY s.name) AS skills
           FROM employee_skills es
           JOIN skills s ON s.skill_id = es.skill_id
          WHERE es.employee_id = w.employee_id
       ) sk ON TRUE
      WHERE ($1::TEXT IS NULL OR
             w.employee_name ILIKE '%' || $1 || '%'
             OR w.employee_code ILIKE '%' || $1 || '%'
             OR COALESCE(w.job_title,'') ILIKE '%' || $1 || '%')
        AND ($2::INT IS NULL OR w.department_id = $2::INT)
        AND ($3::TEXT IS NULL OR w.employment_status::TEXT = $3)
        AND ($4::TEXT IS NULL OR w.workload_level = $4)
        AND ($5::TEXT IS NULL OR w.is_available::TEXT = $5)
      ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, w.employee_name`,
    [search || null, department_id || null, status || null, workload_level || null, availability || null]
  );

  res.json({ success: true, count: employees.length, data: employees });
});

/** GET /api/employees/:id - profile, workload, skills and recent tasks */
const getOne = asyncHandler(async (req, res) => {
  const employee = await db.queryOne(
    `SELECT ${EMPLOYEE_COLUMNS}
       FROM employees e
       JOIN departments d ON d.department_id = e.department_id
       LEFT JOIN employees m ON m.employee_id = e.manager_id
      WHERE e.employee_id = $1`,
    [req.params.id]
  );
  if (!employee) throw ApiError.notFound('Employee not found');

  const [workload, skills, tasks, availability] = await Promise.all([
    db.queryOne('SELECT * FROM fn_employee_workload($1)', [req.params.id]),
    db.queryMany(
      `SELECT es.skill_id, es.proficiency_level, es.years_experience, es.is_primary, es.last_used_on,
              s.name AS skill_name, s.category
         FROM employee_skills es
         JOIN skills s ON s.skill_id = es.skill_id
        WHERE es.employee_id = $1
        ORDER BY es.is_primary DESC, es.proficiency_level DESC, s.name`,
      [req.params.id]
    ),
    db.queryMany(
      `SELECT task_id, title, status, priority, estimated_hours, actual_hours, deadline, is_overdue
         FROM v_task_board
        WHERE assigned_employee_id = $1
        ORDER BY status = 'COMPLETED', deadline NULLS LAST, task_id
        LIMIT 25`,
      [req.params.id]
    ),
    db.queryMany(
      `SELECT availability_id, date_from, date_to, status, available_hours, reason
         FROM employee_availability
        WHERE employee_id = $1 AND date_to >= CURRENT_DATE - 30
        ORDER BY date_from DESC`,
      [req.params.id]
    ),
  ]);

  res.json({
    success: true,
    data: { ...employee, workload, skills, tasks, availability },
  });
});

const CREATE_FIELDS = [
  'employee_code', 'first_name', 'last_name', 'email', 'phone', 'job_title',
  'department_id', 'manager_id', 'hire_date', 'employment_status',
  'weekly_capacity_hours', 'is_available', 'avatar_url',
];

/** POST /api/employees */
const create = asyncHandler(async (req, res) => {
  const provided = CREATE_FIELDS.filter((f) => req.body[f] !== undefined);
  if (!provided.includes('employee_code') || !provided.includes('first_name')) {
    throw ApiError.badRequest('employee_code, first_name and last_name are required');
  }

  const placeholders = provided.map((_, i) => `$${i + 1}`);
  const values = provided.map((f) => {
    const v = req.body[f];
    if (v === '') return null;
    if (f === 'employment_status') return v;
    return v;
  });

  const employee = await db.queryOne(
    `INSERT INTO employees (${provided.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING employee_id, employee_code,
               first_name || ' ' || last_name AS employee_name,
               email, phone, job_title, department_id, manager_id, hire_date,
               employment_status, weekly_capacity_hours, is_available`,
    values
  );

  res.status(201).json({ success: true, data: employee });
});

/** PUT /api/employees/:id */
const update = asyncHandler(async (req, res) => {
  const provided = CREATE_FIELDS.filter((f) => req.body[f] !== undefined);
  if (!provided.length) throw ApiError.badRequest('No fields to update');

  const setClause = provided.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = provided.map((f) => (req.body[f] === '' ? null : req.body[f]));

  const employee = await db.queryOne(
    `UPDATE employees SET ${setClause} WHERE employee_id = $1
     RETURNING employee_id, employee_code,
               first_name || ' ' || last_name AS employee_name,
               email, phone, job_title, department_id, manager_id, hire_date,
               employment_status, weekly_capacity_hours, is_available`,
    [req.params.id, ...values]
  );
  if (!employee) throw ApiError.notFound('Employee not found');
  res.json({ success: true, data: employee });
});

/** DELETE /api/employees/:id */
const remove = asyncHandler(async (req, res) => {
  const row = await db.queryOne('DELETE FROM employees WHERE employee_id = $1 RETURNING employee_id', [
    req.params.id,
  ]);
  if (!row) throw ApiError.notFound('Employee not found');
  res.json({ success: true, message: 'Employee deleted', data: row });
});

// -------------------------------------------------------------------------
// Employee skills
// -------------------------------------------------------------------------

/** GET /api/employees/:id/skills */
const listSkills = asyncHandler(async (req, res) => {
  const skills = await db.queryMany(
    `SELECT es.*, s.name AS skill_name, s.category
       FROM employee_skills es
       JOIN skills s ON s.skill_id = es.skill_id
      WHERE es.employee_id = $1
      ORDER BY es.is_primary DESC, es.proficiency_level DESC`,
    [req.params.id]
  );
  res.json({ success: true, data: skills });
});

/**
 * POST /api/employees/:id/skills
 * Uses ON CONFLICT so re-adding a skill updates the level instead of failing.
 */
const addSkill = asyncHandler(async (req, res) => {
  const { skill_id, proficiency_level = 3, years_experience = 0, is_primary = false, last_used_on } = req.body;

  const row = await db.queryOne(
    `INSERT INTO employee_skills (employee_id, skill_id, proficiency_level, years_experience, is_primary, last_used_on)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (employee_id, skill_id) DO UPDATE
       SET proficiency_level = EXCLUDED.proficiency_level,
           years_experience  = EXCLUDED.years_experience,
           is_primary        = EXCLUDED.is_primary,
           last_used_on      = EXCLUDED.last_used_on,
           updated_at        = NOW()
     RETURNING employee_id, skill_id, proficiency_level, years_experience, is_primary, last_used_on`,
    [req.params.id, skill_id, proficiency_level, years_experience, is_primary, last_used_on || null]
  );
  res.status(201).json({ success: true, data: row });
});

/** DELETE /api/employees/:id/skills/:skillId */
const removeSkill = asyncHandler(async (req, res) => {
  const row = await db.queryOne(
    'DELETE FROM employee_skills WHERE employee_id = $1 AND skill_id = $2 RETURNING skill_id',
    [req.params.id, req.params.skillId]
  );
  if (!row) throw ApiError.notFound('That skill is not assigned to this employee');
  res.json({ success: true, message: 'Skill removed', data: row });
});

// -------------------------------------------------------------------------
// Availability
// -------------------------------------------------------------------------

/** GET /api/employees/:id/availability */
const listAvailability = asyncHandler(async (req, res) => {
  const rows = await db.queryMany(
    `SELECT availability_id, date_from, date_to, status, available_hours, reason
       FROM employee_availability
      WHERE employee_id = $1
      ORDER BY date_from DESC`,
    [req.params.id]
  );
  res.json({ success: true, data: rows });
});

/** POST /api/employees/:id/availability */
const addAvailability = asyncHandler(async (req, res) => {
  const { date_from, date_to, status = 'AVAILABLE', available_hours = 0, reason } = req.body;
  if (!date_from || !date_to) throw ApiError.badRequest('date_from and date_to are required');

  const row = await db.queryOne(
    `INSERT INTO employee_availability (employee_id, date_from, date_to, status, available_hours, reason)
     VALUES ($1, $2, $3, $4::availability_status, $5, $6)
     RETURNING *`,
    [req.params.id, date_from, date_to, status, available_hours, reason || null]
  );

  // Keep the fast availability flag in sync with the new record.
  if (status === 'UNAVAILABLE' && date_from <= new Date() && date_to >= new Date()) {
    await db.query('UPDATE employees SET is_available = FALSE WHERE employee_id = $1', [req.params.id]);
  }

  res.status(201).json({ success: true, data: row });
});

/** DELETE /api/employees/:id/availability/:availabilityId */
const removeAvailability = asyncHandler(async (req, res) => {
  const row = await db.queryOne(
    'DELETE FROM employee_availability WHERE availability_id = $1 AND employee_id = $2 RETURNING availability_id',
    [req.params.availabilityId, req.params.id]
  );
  if (!row) throw ApiError.notFound('Availability record not found');
  res.json({ success: true, message: 'Availability record removed', data: row });
});

/** GET /api/employees/:id/tasks */
const listTasks = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const tasks = await db.queryMany(
    `SELECT * FROM v_task_board
      WHERE assigned_employee_id = $1
        AND ($2::TEXT IS NULL OR status::TEXT = $2)
      ORDER BY deadline NULLS LAST, task_id`,
    [req.params.id, status || null]
  );
  res.json({ success: true, data: tasks });
});

module.exports = {
  list, getOne, create, update, remove,
  listSkills, addSkill, removeSkill,
  listAvailability, addAvailability, removeAvailability,
  listTasks,
};