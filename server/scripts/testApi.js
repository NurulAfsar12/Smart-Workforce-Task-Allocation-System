/* eslint-disable no-console */
/**
 * End-to-end API check against a running server.
 *   npm start          (in another terminal)
 *   npm run db:test    (or: node scripts/testApi.js)
 *
 * Exercises: login -> CRUD reads -> task creation -> automatic allocation
 *            -> candidate preview -> work logs -> workflow -> reports.
 */

const BASE = process.env.API_URL || 'http://localhost:5000';

let token = null;
let passed = 0;
let failed = 0;

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

function check(label, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label} ${extra}`);
  }
}

function section(title) {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

(async () => {
  console.log(`Testing ${BASE}\n`);

  section('1. Authentication');
  const badLogin = await api('POST', '/api/auth/login', { email: 'admin@smartworkforce.com', password: 'wrong' });
  check('rejects a wrong password', badLogin.status === 401);

  const login = await api('POST', '/api/auth/login', {
    email: 'admin@smartworkforce.com',
    password: 'Password123!',
  });
  check('admin can log in', login.status === 200 && !!login.body.token);
  token = login.body.token;
  check('admin role is returned', login.body.user?.role === 'ADMIN');

  const noAuth = await fetch(`${BASE}/api/employees`).then((r) => r.status);
  check('protected route rejects anonymous access', noAuth === 401);

  const me = await api('GET', '/api/auth/me');
  check('GET /auth/me returns the user', me.body.user?.email === 'admin@smartworkforce.com');

  const employeeLogin = await api('POST', '/api/auth/login', {
    email: 'tanvirahmed@smartworkforce.com',
    password: 'Password123!',
  });
  check('employee can log in', employeeLogin.status === 200 && employeeLogin.body.user.role === 'EMPLOYEE');
  check('employee session carries the employee record',
    employeeLogin.body.user?.employee?.employee_id > 0);

  section('2. Reference data');
  const departments = await api('GET', '/api/departments');
  check('departments are listed', departments.body.count === undefined && departments.body.data.length === 5,
    JSON.stringify(departments.body).slice(0, 120));

  const skills = await api('GET', '/api/skills');
  check('skills are listed', skills.body.data.length >= 30, `got ${skills.body.data?.length}`);

  const projects = await api('GET', '/api/projects');
  check('projects include progress', typeof projects.body.data[0]?.completion_pct === 'number');

  section('3. Employees and workload');
  const employees = await api('GET', '/api/employees');
  check('employees are listed with workload', employees.body.data.length === 14);
  const withWorkload = employees.body.data.every((e) => e.capacity_hours !== undefined);
  check('every employee row carries hours based workload', withWorkload);

  const search = await api('GET', '/api/employees?search=tanvir');
  check('search filter works', search.body.data.length === 1, `got ${search.body.data?.length}`);

  const sorted = await api('GET', '/api/employees?sort_by=utilization&order=desc');
  const utils = sorted.body.data.map((e) => Number(e.utilization_pct));
  check('sorting by utilisation descending works',
    utils.every((v, i) => i === 0 || utils[i - 1] >= v));

  const detail = await api('GET', `/api/employees/${employees.body.data[0].employee_id}`);
  check('employee detail includes skills', Array.isArray(detail.body.data.skills));
  check('employee detail includes workload function output',
    detail.body.data.workload?.capacity_hours !== undefined);

  section('4. Task creation and automatic allocation');
  const createTask = await api('POST', '/api/tasks', {
    project_id: projects.body.data[0].project_id,
    title: 'E2E TEST: build the audit log endpoint',
    description: 'Created by scripts/testApi.js',
    priority: 'HIGH',
    estimated_hours: 9,
    deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    required_skills: [
      { skill_id: 5, required_level: 3.5, is_mandatory: true },  // Node.js
      { skill_id: 10, required_level: 3, is_mandatory: true },   // PostgreSQL
    ],
    auto_allocate: true,
  });
  check('task created', createTask.status === 201 && createTask.body.data.task_id > 0,
    JSON.stringify(createTask.body).slice(0, 200));

  const taskId = createTask.body.data?.task_id;
  check('auto allocation ran during creation', createTask.body.allocation?.allocated === true,
    JSON.stringify(createTask.body.allocation).slice(0, 200));

  const allocatedTo = createTask.body.allocation?.employee?.employee_name;
  const allocScore = createTask.body.allocation?.score;
  console.log(`       -> allocated to ${allocatedTo} with score ${allocScore}`);

  const detailAfter = await api('GET', `/api/tasks/${taskId}`);
  check('task status is ASSIGNED', detailAfter.body.data.status === 'ASSIGNED');
  check('required skills were stored', detailAfter.body.data.required_skills.length === 2);
  check('assignment score breakdown was stored',
    typeof detailAfter.body.data.assignments[0]?.score_breakdown?.skillScore === 'number');
  check('task history was written by the trigger', detailAfter.body.data.history.length > 0);

  section('5. Candidate ranking');
  const candidates = await api('GET', `/api/tasks/${taskId}/candidates`);
  check('candidates are returned', candidates.body.count > 0);
  check('candidates are ordered by score',
    candidates.body.candidates.every((c, i, arr) => i === 0 || arr[i - 1].total_score >= c.total_score));
  const top = candidates.body.candidates[0];
  console.log(`       -> best candidate ${top?.employee_name} (${top?.total_score}), ` +
              `skill=${top?.skill_score} workload=${top?.workload_score}`);
  check('score components are present',
    ['skill_score', 'workload_score', 'availability_score', 'deadline_score']
      .every((k) => typeof top[k] === 'number'));

  const preview = await api('GET', `/api/allocation/preview/${taskId}`);
  check('preview explains the decision', !!preview.body.explanation?.headline);
  console.log(`       -> ${preview.body.explanation.headline}`);

  const explain = await api('GET', `/api/allocation/explain/${taskId}/${top.employee_id}`);
  check('per-employee explanation works', !!explain.body.data.explanation);

  section('6. Work logs and workflow');
  const employeeToken = employeeLogin.body.token;
  token = employeeToken;
  const myTasks = await api('GET', '/api/tasks?my_tasks=true');
  check('employee sees only their own tasks',
    myTasks.body.data.every((t) => t.assigned_employee_id === employeeLogin.body.user.employee.employee_id),
    `saw ${myTasks.body.data.length} tasks`);
  token = login.body.token;

  const wrongEmployee = await api('POST', `/api/tasks/${taskId}/logs`, {
    hours_spent: 2, work_description: 'should be rejected by the trigger',
    employee_id: 999999,
  });
  check('work log for an unassigned employee is rejected by the trigger',
    wrongEmployee.status >= 400, `got ${wrongEmployee.status}`);

  // The employee who holds the task logs their own hours.
  const holderEmail = await api('GET', `/api/employees?search=${encodeURIComponent(allocatedTo)}`);
  const holderId = holderEmail.body.data[0]?.employee_id;
  token = await api('POST', '/api/auth/login', {
    email: holderEmail.body.data[0]?.email,
    password: 'Password123!',
  }).then((r) => r.body.token);

  const addLog = await api('POST', `/api/tasks/${taskId}/logs`, {
    hours_spent: 3.5, work_description: 'audit log table and endpoint',
  });
  check('the assignee can log hours', addLog.status === 201, JSON.stringify(addLog.body).slice(0, 150));
  check('task actual_hours updated by trigger',
    Number(addLog.body.task_hours?.actual_hours) === 3.5,
    `actual=${addLog.body.task_hours?.actual_hours}`);

  token = login.body.token;
  const start = await api('POST', `/api/tasks/${taskId}/transition`, { status: 'IN_PROGRESS' });
  check('ASSIGNED -> IN_PROGRESS allowed', start.status === 200 && start.body.data.status === 'IN_PROGRESS',
    JSON.stringify(start.body).slice(0, 150));
  check('started_at stamped by trigger', !!start.body.data.started_at);

  const illegal = await api('POST', `/api/tasks/${taskId}/transition`, { status: 'ASSIGNED' });
  check('IN_PROGRESS -> ASSIGNED is rejected by the trigger', illegal.status === 422,
    `got ${illegal.status}`);

  const review = await api('POST', `/api/tasks/${taskId}/transition`, { status: 'REVIEW' });
  check('IN_PROGRESS -> REVIEW allowed', review.status === 200);

  const done = await api('POST', `/api/tasks/${taskId}/transition`, { status: 'COMPLETED' });
  check('REVIEW -> COMPLETED allowed', done.status === 200);
  check('completed_at stamped by trigger', !!done.body.data.completed_at);
  check('progress set to 100 on completion', Number(done.body.data.progress_percent) === 100);

  const logAfterComplete = await api('POST', `/api/tasks/${taskId}/logs`, { hours_spent: 1 });
  check('logging hours on a completed task is rejected', logAfterComplete.status >= 400,
    `got ${logAfterComplete.status}`);

  const history = await api('GET', `/api/tasks/${taskId}/history`);
  const actions = history.body.data.map((h) => h.action);
  check('history contains CREATED, ASSIGNED, HOURS_LOGGED and STATUS_CHANGE',
    ['CREATED', 'ASSIGNED', 'HOURS_LOGGED', 'STATUS_CHANGE'].every((a) => actions.includes(a)),
    actions.join(','));

  section('7. Re-assignment and manual override');
  const release = await api('POST', `/api/tasks/${taskId}/release`, { note: 'e2e cleanup' });
  check('cannot release a completed task', release.status >= 400, `got ${release.status}`);

  const rel2 = await api('POST', '/api/tasks', {
    project_id: projects.body.data[0].project_id,
    title: 'E2E TEST: reassignment flow',
    estimated_hours: 6,
    auto_allocate: true,
  });
  const rel2Id = rel2.body.data.task_id;
  const releaseOk = await api('POST', `/api/tasks/${rel2Id}/release`, {});
  check('release returns the task to PENDING',
    releaseOk.status === 200 && releaseOk.body.data.status === 'PENDING',
    JSON.stringify(releaseOk.body).slice(0, 150));

  const manual = await api('POST', `/api/tasks/${rel2Id}/assign`, { employee_id: 12 });
  check('manual allocation works', manual.status === 200 && manual.body.data.mode === 'MANUAL',
    JSON.stringify(manual.body).slice(0, 200));

  const allocationLog = await api('GET', '/api/allocation/log');
  check('allocation log records AUTO and MANUAL',
    new Set(allocationLog.body.data.map((a) => a.mode)).has('AUTO') &&
    new Set(allocationLog.body.data.map((a) => a.mode)).has('MANUAL'));

  section('8. Batch allocation');
  const batch = await api('POST', '/api/allocation/run', {});
  check('batch allocation processed the pending tasks', batch.status === 200 && batch.body.data.processed > 0,
    JSON.stringify(batch.body).slice(0, 150));
  console.log(`       -> ${batch.body.data.allocated} allocated, ${batch.body.data.unallocated} without a match`);
  if (batch.body.data.unallocated > 0) {
    const failed = batch.body.data.results.find((r) => !r.allocated);
    console.log(`       -> blocked: "${failed.title}" (${failed.reason})`);
  }

  section('9. Reports');
  const dashboard = await api('GET', '/api/reports/dashboard');
  check('dashboard totals load', typeof dashboard.body.data.totals.active_employees === 'number');
  check('dashboard reports auto allocations', dashboard.body.data.totals.auto_allocations > 0);

  const workload = await api('GET', '/api/workload');
  check('workload summary calculates totals',
    workload.body.summary.total_capacity_hours > 0 && workload.body.summary.open_tasks > 0);
  check('no employee exceeds capacity', workload.body.data.every((e) => Number(e.allocated_hours) <= Number(e.capacity_hours)),
    workload.body.data.filter((e) => Number(e.allocated_hours) > Number(e.capacity_hours)).map((e) => e.employee_name).join(','));

  const heatmap = await api('GET', '/api/workload/heatmap?days=14');
  check('workload heatmap returns one row per day', heatmap.body.daily.length === 14);

  const risk = await api('GET', '/api/reports/deadline-risk');
  check('deadline risk report loads', risk.body.data.length > 0);

  const supply = await api('GET', '/api/reports/skills');
  check('skill demand/supply report loads', supply.body.data.length > 0);
  const gaps = supply.body.data.filter((s) => s.supply_status === 'CRITICAL_GAP');
  console.log(`       -> ${gaps.length} skill(s) with no qualified employee`);

  const performance = await api('GET', '/api/reports/performance');
  check('performance report loads', performance.body.data.length === 14);

  const effort = await api('GET', '/api/reports/effort?days=30');
  check('effort report loads', effort.body.by_employee.length > 0);

  section('10. Validation and authorisation');
  const invalid = await api('POST', '/api/tasks', {
    project_id: projects.body.data[0].project_id,
    title: 'no hours',
  });
  check('missing estimated_hours is rejected', invalid.status === 400);

  const badEnum = await api('POST', '/api/tasks', {
    project_id: projects.body.data[0].project_id,
    title: 'bad priority',
    estimated_hours: 5,
    priority: 'SUPER_URGENT',
  });
  check('invalid enum value is rejected', badEnum.status === 400);

  const negative = await api('POST', '/api/employees', {
    employee_code: 'E2E-NEG', first_name: 'Test', last_name: 'User',
    email: 'e2e@test.com', department_id: 1, weekly_capacity_hours: -5,
  });
  check('negative capacity is rejected by validation', negative.status === 400);

  token = employeeLogin.body.token;
  const forbidden = await api('POST', '/api/departments', { code: 'HACK', name: 'Nope' });
  check('employees cannot create departments', forbidden.status === 403, `got ${forbidden.status}`);
  token = login.body.token;

  const notFound = await api('GET', '/api/tasks/99999999');
  check('missing task returns 404', notFound.status === 404);

  const missingRoute = await api('GET', '/api/does-not-exist');
  check('unknown route returns 404', missingRoute.status === 404);

  // -------------------------------------------------------------------------
  // Regression tests for two privilege-escalation holes found by security
  // review. Both previously returned success to an ordinary EMPLOYEE.
  // -------------------------------------------------------------------------
  section('11. Security regression (privilege escalation)');
  token = login.body.token;
  const secTask = await api('POST', '/api/tasks', {
    project_id: projects.body.data[0].project_id,
    title: 'E2E SECURITY PROBE',
    estimated_hours: 1,
    priority: 'LOW',
  });
  const secTaskId = secTask.body.task_id || secTask.body.data?.task_id;

  token = employeeLogin.body.token;

  // Hole 1: POST /api/tasks/:id/allocate had no requireRole('ADMIN').
  const escalateAllocate = await api('POST', `/api/tasks/${secTaskId}/allocate`, {});
  check('employee cannot run auto-allocation', escalateAllocate.status === 403,
    `got ${escalateAllocate.status} - this endpoint must be ADMIN only`);
  const stillPending = await (async () => {
    token = login.body.token;
    const r = await api('GET', `/api/tasks/${secTaskId}`);
    return r.body.data?.status;
  })();
  check('task was NOT allocated by the employee', stillPending === 'PENDING',
    `status is ${stillPending}`);

  // Hole 2: POST /api/tasks/:id/transition had no ownership check, so any
  // employee could advance or close a colleague's task.
  const otherTask = await (async () => {
    token = login.body.token;
    const list = await api('GET', '/api/tasks?status=IN_PROGRESS');
    return list.body.data?.find((t) => t.assigned_employee_id);
  })();

  if (otherTask) {
    token = employeeLogin.body.token;
    const selfEmployeeId = employeeLogin.body.user?.employee?.employee_id;
    const isOwn = otherTask.assigned_employee_id === selfEmployeeId;

    const escalateTransition = await api('POST', `/api/tasks/${otherTask.task_id}/transition`, {
      status: 'REVIEW',
    });
    if (isOwn) {
      check('assignee may advance their own task', escalateTransition.status === 200,
        `got ${escalateTransition.status}`);
    } else {
      check('employee cannot transition a colleague\'s task', escalateTransition.status === 403,
        `got ${escalateTransition.status} - ownership must be enforced`);

      const escalateComplete = await api('POST', `/api/tasks/${otherTask.task_id}/transition`, {
        status: 'COMPLETED',
      });
      check('employee cannot complete a colleague\'s task', escalateComplete.status === 403,
        `got ${escalateComplete.status}`);

      const escalateCancel = await api('POST', `/api/tasks/${otherTask.task_id}/transition`, {
        status: 'CANCELLED',
      });
      check('employee cannot cancel a colleague\'s task', escalateCancel.status === 403,
        `got ${escalateCancel.status}`);
    }
  } else {
    console.log('  SKIP  no IN_PROGRESS task available for the ownership checks');
  }

  // An unassigned task must not be transitionable by an employee either.
  const escalateUnassigned = await api('POST', `/api/tasks/${secTaskId}/transition`, {
    status: 'IN_PROGRESS',
  });
  check('employee cannot transition an unassigned task', escalateUnassigned.status === 403,
    `got ${escalateUnassigned.status}`);

  token = login.body.token;
  const adminTransitions = await api('POST', `/api/tasks/${secTaskId}/transition`, { status: 'ON_HOLD' });
  check('admin may still transition any task', adminTransitions.status === 200,
    `got ${adminTransitions.status}`);

  // Response hardening.
  const health = await fetch(`${BASE}/health`);
  check('X-Powered-By header is not advertised', !health.headers.get('x-powered-by'));
  check('security headers are present (nosniff)',
    health.headers.get('x-content-type-options') === 'nosniff');
  check('security headers are present (frame denial)',
    health.headers.get('x-frame-options') !== null);

  section('Cleanup');
  const delSec = await api('DELETE', `/api/tasks/${secTaskId}`);
  check('security probe task deleted', delSec.status === 200);
  const del1 = await api('DELETE', `/api/tasks/${taskId}`);
  check('test task deleted', del1.status === 200);
  const del2 = await api('DELETE', `/api/tasks/${rel2Id}`);
  check('second test task deleted', del2.status === 200);

  console.log(`\n${'='.repeat(46)}`);
  console.log(`  passed: ${passed}   failed: ${failed}`);
  console.log('='.repeat(46));
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nTest run crashed:', err.message);
  process.exit(1);
});