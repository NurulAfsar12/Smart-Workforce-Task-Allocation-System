const db = require('../config/db');
const ApiError = require('../utils/ApiError');

/**
 * THIN WRAPPER AROUND THE DATABASE ALLOCATION ENGINE.
 *
 * All allocation rules live in PostgreSQL (fn_allocate_task,
 * fn_task_candidates). This service only:
 *   - opens a transaction so a failure rolls back completely
 *   - maps the JSONB result of the function to an HTTP response
 *
 * This keeps the "where the intelligence lives" question unambiguous:
 * the business rules are in the database, the API just triggers them.
 */

/** Ranked candidate list for a task (drives the "who should get this?" table). */
async function getCandidates(taskId, includeIneligible = true) {
  const task = await db.queryOne('SELECT task_id, title, status FROM tasks WHERE task_id = $1', [taskId]);
  if (!task) throw ApiError.notFound(`Task ${taskId} not found`);

  const rows = await db.queryMany(
    'SELECT * FROM fn_task_candidates($1, $2) ORDER BY is_eligible DESC, total_score DESC',
    [taskId, includeIneligible]
  );

  return {
    task: {
      task_id: task.task_id,
      title: task.title,
      status: task.status,
      estimated_hours: task.estimated_hours,
      deadline: task.deadline,
      priority: task.priority,
    },
    count: rows.length,
    eligible_count: rows.filter((r) => r.is_eligible).length,
    candidates: rows,
  };
}

/**
 * Automatic allocation.
 * Returns { allocated: true, employee, score } or
 *         { allocated: false, reason: 'NO_ELIGIBLE_EMPLOYEE' }.
 */
async function allocate(taskId, { userId = null, employeeId = null, force = false } = {}) {
  const result = await db.transaction(async (client) => {
    const { rows } = await client.query('SELECT fn_allocate_task($1, $2, $3, $4) AS result', [
      taskId,
      userId,
      employeeId,
      force,
    ]);
    return rows[0].result;
  });

  if (!result || result.success !== true) {
    return {
      allocated: false,
      reason: result?.reason || 'UNKNOWN',
      message: result?.message || 'Allocation failed',
      task_id: taskId,
    };
  }

  return { allocated: true, ...result };
}

/** Throwing variant used by the endpoints that should return 4xx. */
async function allocateOrThrow(taskId, options = {}) {
  const outcome = await allocate(taskId, options);
  if (!outcome.allocated) {
    throw ApiError.unprocessable(outcome.message, {
      reason: outcome.reason,
      task_id: taskId,
    });
  }
  return outcome;
}

/** Release the current assignment and put the task back in the PENDING pool. */
async function release(taskId, { userId = null, note = null } = {}) {
  return db.transaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE task_assignments
          SET state = 'REVOKED', released_at = NOW(),
              note = COALESCE(note,'') || COALESCE(' | revoked: ' || $2, '')
        WHERE task_id = $1 AND state = 'ACTIVE'`,
      [taskId, note]
    );

    if (rowCount === 0) throw ApiError.badRequest('This task has no active assignment to release');

    // The function returns the tasks composite type. It must be selected
    // with * in FROM position so node-postgres expands it into columns
    // instead of handing back an opaque string.
    const { rows } = await client.query(
      'SELECT * FROM fn_task_transition($1, $2::task_status, $3, $4)',
      [taskId, 'PENDING', userId, note || 'Assignment released, task returned to the pending pool']
    );

    return rows[0];
  });
}

/** Manual override: assign to a specific employee (still validated by the DB). */
async function assignManually(taskId, employeeId, { userId = null, force = false } = {}) {
  return allocateOrThrow(taskId, { userId, employeeId, force });
}

/** Move a task through the workflow using the database transition rules. */
async function transition(taskId, toStatus, { userId = null, remarks = null } = {}) {
  return db.transaction(async (client) => {
    // SELECT * FROM fn(...) expands the tasks composite into columns.
    const { rows } = await client.query(
      'SELECT * FROM fn_task_transition($1, $2::task_status, $3, $4)',
      [taskId, toStatus, userId, remarks]
    );
    return rows[0];
  });
}

/**
 * Run the engine across every PENDING task, in priority order so the most
 * urgent work is placed first. Used by the "Run auto-allocation" button.
 */
async function runBatch({ userId = null, projectId = null } = {}) {
  const pending = await db.queryMany(
    `SELECT task_id, title, priority, deadline, estimated_hours
       FROM tasks
      WHERE status = 'PENDING'
        AND ($1::INT IS NULL OR project_id = $1::INT)
      ORDER BY CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
                             WHEN 'MEDIUM'  THEN 3 ELSE 4 END,
               deadline NULLS LAST,
               task_id`,
    [projectId]
  );

  const results = [];
  for (const task of pending) {
    // Each task is its own transaction: one failure must not stop the batch.
    const outcome = await allocate(task.task_id, { userId });
    results.push({
      task_id: task.task_id,
      title: task.title,
      priority: task.priority,
      allocated: outcome.allocated,
      employee_id: outcome.employee?.employee_id ?? null,
      employee_name: outcome.employee?.employee_name ?? null,
      score: outcome.score ?? null,
      reason: outcome.allocated ? null : outcome.reason,
    });
  }

  return {
    processed: results.length,
    allocated: results.filter((r) => r.allocated).length,
    unallocated: results.filter((r) => !r.allocated).length,
    results,
  };
}

module.exports = {
  getCandidates,
  allocate,
  allocateOrThrow,
  assignManually,
  release,
  transition,
  runBatch,
};