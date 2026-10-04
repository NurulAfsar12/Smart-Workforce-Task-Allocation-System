const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const SELECT_DEPARTMENT = `
  SELECT d.department_id, d.code, d.name, d.description, d.budget_hours, d.created_at,
         (SELECT COUNT(*)::INT FROM employees e WHERE e.department_id = d.department_id) AS employee_count,
         (SELECT COUNT(*)::INT FROM projects p WHERE p.department_id = d.department_id) AS project_count
    FROM departments d`;

/** GET /api/departments */
const list = asyncHandler(async (req, res) => {
  const departments = await db.queryMany(`${SELECT_DEPARTMENT} ORDER BY d.name`);
  res.json({ success: true, data: departments });
});

/** GET /api/departments/:id */
const getOne = asyncHandler(async (req, res) => {
  const department = await db.queryOne(`${SELECT_DEPARTMENT} WHERE d.department_id = $1`, [
    req.params.id,
  ]);
  if (!department) throw ApiError.notFound('Department not found');
  res.json({ success: true, data: department });
});

/** POST /api/departments */
const create = asyncHandler(async (req, res) => {
  const { code, name, description, budget_hours = 0 } = req.body;
  const department = await db.queryOne(
    `INSERT INTO departments (code, name, description, budget_hours)
     VALUES ($1, $2, $3, $4)
     RETURNING department_id, code, name, description, budget_hours, created_at`,
    [code.toUpperCase(), name, description || null, budget_hours]
  );
  res.status(201).json({ success: true, data: department });
});

/** PUT /api/departments/:id */
const update = asyncHandler(async (req, res) => {
  const fields = ['code', 'name', 'description', 'budget_hours'];
  const provided = fields.filter((f) => req.body[f] !== undefined);
  if (!provided.length) throw ApiError.badRequest('No fields to update');

  const setClause = provided.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = provided.map((f) => (f === 'code' ? String(req.body[f]).toUpperCase() : req.body[f]));

  const department = await db.queryOne(
    `UPDATE departments SET ${setClause} WHERE department_id = $1
     RETURNING department_id, code, name, description, budget_hours`,
    [req.params.id, ...values]
  );
  if (!department) throw ApiError.notFound('Department not found');
  res.json({ success: true, data: department });
});

/** DELETE /api/departments/:id */
const remove = asyncHandler(async (req, res) => {
  const row = await db.queryOne('DELETE FROM departments WHERE department_id = $1 RETURNING department_id', [
    req.params.id,
  ]);
  if (!row) throw ApiError.notFound('Department not found');
  res.json({ success: true, message: 'Department deleted', data: row });
});

module.exports = { list, getOne, create, update, remove };