-- =====================================================================
-- File : 08_seed_projects.sql
-- Projects, tasks and the skills each task requires.
-- =====================================================================

INSERT INTO projects (code, name, description, department_id, lead_id, start_date, end_date, budget_hours, status) VALUES
('PRJ-CRM', 'Customer Portal Revamp',
 'Rebuild of the customer facing portal with a new design system and a Node.js API.',
 (SELECT department_id FROM departments WHERE code='ENG'), (SELECT employee_id FROM employees WHERE employee_code='EMP-001'),
 DATE '2025-01-15', CURRENT_DATE + 75, 1400, 'ACTIVE'),
('PRJ-MOB', 'Mobile Companion App',
 'React Native companion application for field staff.',
 (SELECT department_id FROM departments WHERE code='ENG'), (SELECT employee_id FROM employees WHERE employee_code='EMP-003'),
 DATE '2025-03-01', CURRENT_DATE + 110, 900, 'ACTIVE'),
('PRJ-DAT', 'Analytics Platform',
 'Central reporting warehouse, dashboards and scheduled reports.',
 (SELECT department_id FROM departments WHERE code='DATA'), (SELECT employee_id FROM employees WHERE employee_code='EMP-009'),
 DATE '2025-02-10', CURRENT_DATE + 60, 750, 'ACTIVE'),
('PRJ-UP',  'Infrastructure Upgrade',
 'Kubernetes migration, CI/CD pipelines and observability.',
 (SELECT department_id FROM departments WHERE code='ENG'), (SELECT employee_id FROM employees WHERE employee_code='EMP-004'),
 DATE '2025-01-05', CURRENT_DATE + 40, 1100, 'ACTIVE'),
('PRJ-WEB', 'Company Website Refresh',
 'Marketing site refresh and SEO improvement programme.',
 (SELECT department_id FROM departments WHERE code='MKT'), (SELECT employee_id FROM employees WHERE employee_code='EMP-013'),
 DATE '2025-04-01', CURRENT_DATE + 55, 500, 'PLANNED');

-- ---------------------------------------------------------------------
-- TASKS  (status starts as PENDING; the allocation engine assigns them)
-- ---------------------------------------------------------------------
INSERT INTO tasks (project_id, title, description, priority, estimated_hours, deadline, created_by, status) VALUES
-- PRJ-CRM
((SELECT project_id FROM projects WHERE code='PRJ-CRM'), 'Design the checkout flow wireframes',
 'Low and high fidelity wireframes for the new three step checkout.', 'HIGH', 14,
 CURRENT_DATE + 6, (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
((SELECT project_id FROM projects WHERE code='PRJ-CRM'), 'Build the checkout REST API',
 'Express endpoints for cart validation, payment intent and order creation with PostgreSQL persistence.',
 'CRITICAL', 26, CURRENT_DATE + 12, (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
((SELECT project_id FROM projects WHERE code='PRJ-CRM'), 'Migrate customer table to the new schema',
 'Normalise the legacy customer and address tables and write the migration script.',
 'CRITICAL', 18, CURRENT_DATE + 4, (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
((SELECT project_id FROM projects WHERE code='PRJ-CRM'), 'Checkout regression test suite',
 'Automated end to end coverage for the checkout flow.', 'HIGH', 16, CURRENT_DATE + 16,
 (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
-- PRJ-MOB
((SELECT project_id FROM projects WHERE code='PRJ-MOB'), 'Sprint planning app screen set',
 'Four React Native screens: login, task list, task detail and profile.', 'MEDIUM', 20,
 CURRENT_DATE + 18, (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
((SELECT project_id FROM projects WHERE code='PRJ-MOB'), 'Offline task synchronisation',
 'Conflict free sync of task state between device and API using timestamps.', 'HIGH', 22,
 CURRENT_DATE + 25, (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
-- PRJ-DAT
((SELECT project_id FROM projects WHERE code='PRJ-DAT'), 'Executive Power BI dashboard',
 'Six tile dashboard with weekly refresh from the reporting schema.', 'MEDIUM', 18,
 CURRENT_DATE + 9, (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
((SELECT project_id FROM projects WHERE code='PRJ-DAT'), 'Demand forecasting model',
 'Time series model predicting weekly demand with confidence bands.', 'HIGH', 30,
 CURRENT_DATE + 30, (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
((SELECT project_id FROM projects WHERE code='PRJ-DAT'), 'Warehouse schema documentation',
 'Data dictionary covering every table, column and metric definition.', 'LOW', 8,
 CURRENT_DATE + 20, (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
-- PRJ-UP
((SELECT project_id FROM projects WHERE code='PRJ-UP'), 'Containerise the API services',
 'Write Dockerfiles for the Node.js services and push images to the registry.', 'HIGH', 12,
 CURRENT_DATE + 5, (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
((SELECT project_id FROM projects WHERE code='PRJ-UP'), 'Zero downtime deployment pipeline',
 'Blue/green pipeline with automated rollback in Kubernetes.', 'CRITICAL', 24,
 CURRENT_DATE + 14, (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
((SELECT project_id FROM projects WHERE code='PRJ-UP'), 'Kubernetes cluster upgrade to 1.31',
 'Upgrade control plane and node pools without downtime.', 'CRITICAL', 10,
 CURRENT_DATE + 3, (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
((SELECT project_id FROM projects WHERE code='PRJ-UP'), 'Cost monitoring alerts',
 'Budget alarms and idle resource reports for the cloud account.', 'LOW', 6,
 CURRENT_DATE + 22, (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
-- PRJ-WEB
((SELECT project_id FROM projects WHERE code='PRJ-WEB'), 'Rewrite the landing page copy',
 'Conversion focused copy for six product pages.', 'MEDIUM', 10, CURRENT_DATE + 10,
 (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
((SELECT project_id FROM projects WHERE code='PRJ-WEB'), 'Technical SEO audit',
 'Crawl report, Core Web Vitals fixes and metadata cleanup.', 'MEDIUM', 9, CURRENT_DATE + 15,
 (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING'),
((SELECT project_id FROM projects WHERE code='PRJ-WEB'), 'Accessibility statement page',
 'Publish the VPAT style accessibility statement and contact form.', 'LOW', 5,
 CURRENT_DATE + 26, (SELECT user_id FROM users WHERE role='ADMIN'), 'PENDING');

-- ---------------------------------------------------------------------
-- TASK_SKILLS  (required skills per task, 1-5 level, mandatory flag)
-- ---------------------------------------------------------------------
INSERT INTO task_skills (task_id, skill_id, required_level, is_mandatory)
SELECT t.task_id, s.skill_id, v.level, v.mandatory
FROM (VALUES
  ('Design the checkout flow wireframes','UI Design',3.0,TRUE),
  ('Design the checkout flow wireframes','Figma',3.0,FALSE),
  ('Design the checkout flow wireframes','UX Research',2.0,FALSE),

  ('Build the checkout REST API','Node.js',4.0,TRUE),
  ('Build the checkout REST API','Express',3.5,TRUE),
  ('Build the checkout REST API','PostgreSQL',3.5,TRUE),
  ('Build the checkout REST API','API Testing',3.0,FALSE),

  ('Migrate customer table to the new schema','PostgreSQL',4.0,TRUE),
  ('Migrate customer table to the new schema','SQL',3.5,TRUE),

  ('Checkout regression test suite','Test Automation',3.5,TRUE),
  ('Checkout regression test suite','API Testing',3.0,FALSE),
  ('Checkout regression test suite','Selenium',3.0,FALSE),

  ('Sprint planning app screen set','React',4.0,TRUE),
  ('Sprint planning app screen set','HTML/CSS',3.0,FALSE),
  ('Sprint planning app screen set','UI Design',2.5,FALSE),

  ('Offline task synchronisation','React',3.5,TRUE),
  ('Offline task synchronisation','TypeScript',3.5,TRUE),
  ('Offline task synchronisation','PostgreSQL',3.0,FALSE),

  ('Executive Power BI dashboard','Power BI',3.5,TRUE),
  ('Executive Power BI dashboard','SQL',3.5,TRUE),
  ('Executive Power BI dashboard','Data Analysis',3.0,FALSE),

  ('Demand forecasting model','Machine Learning',3.5,TRUE),
  ('Demand forecasting model','Python',3.5,TRUE),
  ('Demand forecasting model','Data Analysis',3.0,FALSE),

  ('Warehouse schema documentation','SQL',3.0,TRUE),
  ('Warehouse schema documentation','Communication',2.5,FALSE),

  ('Containerise the API services','Docker',3.5,TRUE),
  ('Containerise the API services','Node.js',3.0,FALSE),
  ('Containerise the API services','CI/CD',3.0,FALSE),

  ('Zero downtime deployment pipeline','Kubernetes',3.5,TRUE),
  ('Zero downtime deployment pipeline','CI/CD',4.0,TRUE),
  ('Zero downtime deployment pipeline','AWS',3.0,FALSE),

  ('Kubernetes cluster upgrade to 1.31','Kubernetes',4.0,TRUE),
  ('Kubernetes cluster upgrade to 1.31','Docker',3.5,FALSE),

  ('Cost monitoring alerts','AWS',3.5,TRUE),
  ('Cost monitoring alerts','Data Analysis',2.5,FALSE),

  ('Rewrite the landing page copy','Content Writing',4.0,TRUE),
  ('Rewrite the landing page copy','SEO',3.0,FALSE),

  ('Technical SEO audit','SEO',3.5,TRUE),
  ('Technical SEO audit','Content Writing',3.0,FALSE),
  ('Technical SEO audit','HTML/CSS',3.0,FALSE),

  ('Accessibility statement page','Content Writing',3.0,TRUE),
  ('Accessibility statement page','HTML/CSS',3.0,TRUE),
  ('Accessibility statement page','UI Design',2.5,FALSE)
) AS v(task_title, skill_name, level, mandatory)
JOIN tasks t ON t.title = v.task_title
JOIN skills s ON s.name = v.skill_name;