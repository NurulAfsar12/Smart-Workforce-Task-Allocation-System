const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const allocationService = require('../services/allocation.service');

/** GET /api/allocation/pending - tasks waiting to be allocated */
const pending = asyncHandler(async (req, res) => {
  const rows = await db.queryMany(
    `SELECT task_id, project_id, project_name, title, description, priority,
            estimated_hours, deadline, required_skills_text
       FROM v_task_board
      WHERE status = 'PENDING'
      ORDER BY CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
                             WHEN 'MEDIUM'  THEN 3 ELSE 4 END,
               deadline NULLS LAST`
  );
  res.json({ success: true, count: rows.length, data: rows });
});

/**
 * GET /api/allocation/preview/:taskId
 * Candidate table + a plain English explanation of the decision, so the
 * reasoning of the engine is visible instead of a black box.
 */
const preview = asyncHandler(async (req, res) => {
  const payload = await allocationService.getCandidates(req.params.taskId, true);
  const best = payload.candidates.find((c) => c.is_eligible) || null;

  const explanation = best
    ? {
        chosen: best.employee_name,
        headline: `${best.employee_name} scored highest at ${best.total_score}/100`,
        reasons: [
          `Matches ${best.matched_skills} of ${best.required_skills} required skills`,
          best.mandatory_matched === best.mandatory_skills
            ? 'All mandatory skills are covered'
            : `${best.mandatory_skills - best.mandatory_matched} mandatory skill(s) missing`,
          `${best.allocated_hours}h already allocated of ${best.capacity_hours}h capacity (${best.utilization_pct}% used)`,
          best.deadline
            ? `Deadline ${String(best.deadline).slice(0, 10)} is achievable with the current workload`
            : 'No deadline pressure',
        ],
        score_breakdown: {
          skill: best.skill_score,
          workload: best.workload_score,
          availability: best.availability_score,
          deadline: best.deadline_score,
          experience: best.experience_score,
        },
      }
    : {
        chosen: null,
        headline: 'No employee satisfies every rule for this task',
        reasons: [],
      };

  res.json({ success: true, ...payload, explanation });
});

/** POST /api/allocation/run - run the engine over every PENDING task */
const run = asyncHandler(async (req, res) => {
  const outcome = await allocationService.runBatch({
    userId: req.user.user_id,
    projectId: req.body?.project_id || null,
  });

  res.json({
    success: true,
    message: `${outcome.allocated} of ${outcome.processed} pending task(s) allocated automatically`,
    data: outcome,
  });
});

/** GET /api/allocation/log */
const log = asyncHandler(async (req, res) => {
  const rows = await db.queryMany(
    `SELECT assignment_id, task_id, task_title, project_name, employee_id, employee_name,
            department_name, mode, state, suitability_score, skill_score, workload_score,
            availability_score, deadline_score, eligible_candidates,
            assigned_by_name, assigned_at, released_at, note
       FROM v_allocation_log
      ORDER BY assigned_at DESC
      LIMIT $1`,
    [Math.min(Number(req.query.limit) || 100, 500)]
  );
  res.json({ success: true, count: rows.length, data: rows });
});

/**
 * GET /api/allocation/explain/:taskId/:employeeId
 * Why this employee was or was not chosen - one row, fully expanded.
 */
const explain = asyncHandler(async (req, res) => {
  const rows = await db.queryMany('SELECT * FROM fn_task_candidates($1, TRUE)', [req.params.taskId]);
  const candidate = rows.find((r) => r.employee_id === Number(req.params.employeeId));
  if (!candidate) return res.status(404).json({ success: false, message: 'Employee not a candidate for this task' });

  res.json({
    success: true,
    data: {
      ...candidate,
      explanation: candidate.is_eligible
        ? `Eligible with a suitability score of ${candidate.total_score}/100`
        : `Not eligible: ${(candidate.blocking_reasons || []).join('; ')}`,
    },
  });
});

module.exports = { pending, preview, run, log, explain };