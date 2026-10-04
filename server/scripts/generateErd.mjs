/**
 * Regenerates docs/ERD.md from the live PostgreSQL schema.
 *
 * The diagram is derived from information_schema rather than maintained by
 * hand, so it cannot drift away from the database it documents.
 *
 *   node scripts/generateErd.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'ERD.md');

const client = new pg.Client({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'smart_workforce',
});

await client.connect();

const { rows: columns } = await client.query(`
  SELECT c.relname            AS table_name,
         c.relkind            AS kind,
         a.attname            AS column_name,
         format_type(a.atttypid, a.atttypmod) AS data_type,
         a.attnotnull         AS not_null,
         pg_get_expr(d.adbin, d.adrelid) AS default_expr
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm')
  ORDER BY c.relname, a.attnum
`);

const { rows: constraints } = await client.query(`
  SELECT tc.table_name,
         tc.constraint_type,
         kcu.column_name,
         ccu.table_name  AS foreign_table,
         ccu.column_name AS foreign_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
   AND kcu.table_schema = tc.table_schema
  LEFT JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.table_schema = tc.table_schema
  WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
`);

const { rows: pkRows } = await client.query(`
  SELECT rel.relname AS table_name, att.attname AS column_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ord(attnum, ordinality) ON true
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ord.attnum
  WHERE n.nspname = 'public' AND con.contype = 'p'
  ORDER BY rel.relname, ord.ordinality
`);

const { rows: checks } = await client.query(`
  SELECT rel.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public' AND con.contype = 'c'
  ORDER BY rel.relname, con.conname
`);

await client.end();

// --- group -----------------------------------------------------------------
const tables = new Map();
const views = new Map();

for (const row of columns) {
  const bucket = row.kind === 'r' ? tables : views;
  if (!bucket.has(row.table_name)) bucket.set(row.table_name, []);
  bucket.get(row.table_name).push(row);
}

// Composite primary keys are common (junction tables), so collect them as sets.
const pks = new Map();
for (const row of pkRows) {
  if (!pks.has(row.table_name)) pks.set(row.table_name, new Set());
  pks.get(row.table_name).add(row.column_name);
}

const fkColumns = new Set();
for (const c of constraints) {
  if (c.constraint_type === 'FOREIGN KEY') fkColumns.add(`${c.table_name}.${c.column_name}`);
}

const checksByTable = new Map();
for (const c of checks) {
  if (!checksByTable.has(c.table_name)) checksByTable.set(c.table_name, []);
  checksByTable.get(c.table_name).push(c);
}

/** Mermaid identifiers must be alphanumeric+underscore. */
const alias = (name) => name.toUpperCase();
const NL = String.fromCharCode(10);

function block(name, cols) {
  const pk = pks.get(name) || new Set();
  const lines = [`  ${alias(name)} {`];
  for (const c of cols) {
    const type = c.data_type.replace(/\s+/g, ' ');
    const key = pk.has(c.column_name) ? 'PK' : fkColumns.has(`${name}.${c.column_name}`) ? 'FK' : '';
    lines.push(`    ${type} ${c.column_name}${key ? ` ${key}` : ''}`);
  }
  lines.push('  }');
  return lines.join(NL);
}

/** CHECK constraints read better as prose than as diagram nodes. */
function checkRows() {
  const out = [];
  for (const [table, list] of [...checksByTable.entries()].sort()) {
    for (const c of list) {
      if (/NOT NULL/.test(c.definition)) continue;
      const def = c.definition.replace(/^CHECK\s*/, '').replace(/\s+/g, ' ');
      out.push(`| \`${table}\` | ${def} |`);
    }
  }
  return out;
}

// A nullable foreign key is optional on the parent side (`o|`), otherwise it is
// mandatory (`||`). Getting this wrong would misrepresent the schema.
const optionalFk = new Set();
for (const c of columns) {
  if (c.not_null) continue;
  if (fkColumns.has(`${c.table_name}.${c.column_name}`)) optionalFk.add(`${c.table_name}.${c.column_name}`);
}

const relationships = constraints
  .filter((c) => c.foreign_table && c.foreign_table !== c.table_name && c.foreign_column)
  .map((c) => {
    const parent = optionalFk.has(`${c.table_name}.${c.column_name}`) ? 'o|' : '||';
    return `  ${alias(c.table_name)} ${c.column_name} }o--${parent} ${alias(c.foreign_table)} ${c.foreign_column} : "${c.column_name}"`;
  });

const tableNames = [...tables.keys()].sort();
const viewNames = [...views.keys()].sort();

const md = `# Entity Relationship Diagram

> Generated from the live \`smart_workforce\` database by
> \`server/scripts/generateErd.mjs\`. Re-run that script after any schema change.

- **${tableNames.length}** base tables
- **${viewNames.length}** reporting views (read models, no writes)
- All allocation logic lives in PostgreSQL functions; see
  [Allocation engine](#allocation-engine) below.

## Tables

\`\`\`mermaid
erDiagram
${tableNames.map((t) => block(t, tables.get(t))).join('\n')}

${relationships.join('\n')}
\`\`\`

### Check constraints

| Table | Constraint |
| --- | --- |
${checkRows().join('\n')}

## Reporting views

Views are read-only projections consumed by the dashboard, workload and
reports screens.

\`\`\`mermaid
erDiagram
${viewNames.map((v) => block(v, views.get(v))).join('\n')}
\`\`\`

| View | Purpose |
| --- | --- |
| \`v_task_board\` | Task list with project, assignee, effort variance, progress and deadline state. |
| \`v_employee_workload\` | Per-employee capacity, allocated/free hours, utilisation band, open and overdue counts. |
| \`v_project_progress\` | Project rollup: task counts by status, estimated vs actual hours, completion and budget usage. |
| \`v_skill_demand_supply\` | Supply (employees with a skill) vs demand (tasks requiring it) for gap analysis. |
| \`v_deadline_risk\` | Tasks at risk with the specific reason (no assignee, insufficient skills, capacity, deadline). |
| \`v_employee_performance\` | Logged hours, completed tasks, on-time rate and utilisation per employee. |
| \`v_allocation_log\` | Audit trail of automatic and manual allocations with score and reason. |
| \`v_daily_effort\` | Daily aggregated effort for the trend chart. |

## Allocation engine

\`fn_task_candidates(task_id)\` ranks every eligible employee for a task and
returns the score plus an explanation. \`fn_allocate_task(task_id)\` wraps the
top-ranked candidate in a transaction and writes to \`task_assignments\` and
\`task_history\`.

**Eligibility is a hard filter** — a candidate is removed entirely when:

- the employee is not \`ACTIVE\` or is marked unavailable
- the employee is on approved leave overlapping the task window
- the employee lacks a mandatory required skill
- the employee lacks any required skill at all
- the task would exceed the employee's weekly capacity
- the task deadline precedes the earliest possible completion

**Ranking weights** (the remainder of the 0-100 score):

| Factor | Weight |
| --- | --- |
| Skill match | 45 |
| Current workload | 25 |
| Availability | 15 |
| Deadline pressure | 10 |
| Relevant experience | 5 |
| Same-department bonus | +2 |

## Integrity rules

| Rule | Enforced by |
| --- | --- |
| Status transitions follow the workflow | \`fn_validate_task_transition()\` trigger |
| \`tasks.actual_hours\` matches logged time | \`work_logs\` sync triggers |
| Audit row for every task change | \`task_history\` trigger |
| Timestamps maintained automatically | \`set_updated_at()\` triggers |
| Work logged only by the assignee, within the estimate | \`work_logs\` validation trigger |
| Skills in use cannot be deleted | \`task_skills\` guard trigger |
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, md, 'utf8');

console.log(`Wrote ${OUT}`);
console.log(`  ${tableNames.length} tables, ${viewNames.length} views, ${relationships.length} relationships`);
