const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/skills - optional ?category= & ?search= */
const list = asyncHandler(async (req, res) => {
  const { category, search } = req.query;

  const skills = await db.queryMany(
    `SELECT s.skill_id, s.name, s.category, s.description, s.is_active, s.created_at,
            COALESCE(cnt.employee_count, 0)  AS employee_count,
            COALESCE(cnt.avg_level, 0)       AS avg_proficiency
       FROM skills s
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS employee_count, ROUND(AVG(proficiency_level), 2) AS avg_level
           FROM employee_skills es
           JOIN employees e ON e.employee_id = es.employee_id
          WHERE es.skill_id = s.skill_id AND e.employment_status = 'ACTIVE'
       ) cnt ON TRUE
      WHERE ($1::TEXT IS NULL OR s.category::TEXT = $1)
        AND ($2::TEXT IS NULL OR s.name ILIKE '%' || $2 || '%')
      ORDER BY s.category, s.name`,
    [category || null, search || null]
  );

  res.json({ success: true, count: skills.length, data: skills });
});

const getOne = asyncHandler(async (req, res) => {
  const skill = await db.queryOne('SELECT * FROM skills WHERE skill_id = $1', [req.params.id]);
  if (!skill) throw ApiError.notFound('Skill not found');

  const employees = await db.queryMany(
    `SELECT es.employee_id, e.employee_code,
            e.first_name || ' ' || e.last_name AS employee_name,
            d.name AS department_name,
            es.proficiency_level, es.years_experience, es.is_primary
       FROM employee_skills es
       JOIN employees e    ON e.employee_id = es.employee_id
       JOIN departments d ON d.department_id = e.department_id
      WHERE es.skill_id = $1
      ORDER BY es.proficiency_level DESC, es.years_experience DESC`,
    [req.params.id]
  );

  res.json({ success: true, data: { ...skill, employees } });
});

const create = asyncHandler(async (req, res) => {
  const { name, category = 'OTHER', description } = req.body;
  const skill = await db.queryOne(
    `INSERT INTO skills (name, category, description)
     VALUES ($1, $2::skill_category, $3)
     RETURNING *`,
    [name, category, description || null]
  );
  res.status(201).json({ success: true, data: skill });
});

const update = asyncHandler(async (req, res) => {
  const fields = ['name', 'category', 'description', 'is_active'];
  const provided = fields.filter((f) => req.body[f] !== undefined);
  if (!provided.length) throw ApiError.badRequest('No fields to update');

  const setClause = provided.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const skill = await db.queryOne(
    `UPDATE skills SET ${setClause} WHERE skill_id = $1 RETURNING *`,
    [req.params.id, ...provided.map((f) => req.body[f])]
  );
  if (!skill) throw ApiError.notFound('Skill not found');
  res.json({ success: true, data: skill });
});

const remove = asyncHandler(async (req, res) => {
  const row = await db.queryOne('DELETE FROM skills WHERE skill_id = $1 RETURNING skill_id', [req.params.id]);
  if (!row) throw ApiError.notFound('Skill not found');
  res.json({ success: true, message: 'Skill deleted', data: row });
});

module.exports = { list, getOne, create, update, remove };