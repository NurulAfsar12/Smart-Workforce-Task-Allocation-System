-- =====================================================================
-- File : 07_seed_people.sql
-- Employees, login accounts and the employee <-> skill relationship.
--
-- Demo password for every account: Password123!
-- The bcrypt hash is produced by pgcrypto inside the database.
-- =====================================================================

INSERT INTO employees
(employee_code, first_name, last_name, email, phone, job_title, department_id,
 hire_date, employment_status, weekly_capacity_hours, is_available) VALUES
('EMP-001','Ayesha','Rahman','ayesha.rahman@smartworkforce.com','+8801711000001','Senior Full Stack Engineer',(SELECT department_id FROM departments WHERE code='ENG'), DATE '2019-03-11','ACTIVE',40, TRUE),
('EMP-002','Rahim','Uddin','rahimuddin@smartworkforce.com','+8801711000002','Backend Engineer',(SELECT department_id FROM departments WHERE code='ENG'),    DATE '2020-07-01','ACTIVE',40, TRUE),
('EMP-003','Nusrat','Jahan','nusratjahan@smartworkforce.com','+8801711000003','Frontend Engineer',(SELECT department_id FROM departments WHERE code='ENG'),  DATE '2021-01-18','ACTIVE',40, TRUE),
('EMP-004','Tanvir','Ahmed','tanvirahmed@smartworkforce.com','+8801711000004','DevOps Engineer',(SELECT department_id FROM departments WHERE code='ENG'),     DATE '2018-11-05','ACTIVE',40, TRUE),
('EMP-005','Farhana','Akter','farhanaakter@smartworkforce.com','+8801711000005','Senior UI Designer',(SELECT department_id FROM departments WHERE code='DES'),  DATE '2020-02-24','ACTIVE',40, TRUE),
('EMP-006','Imran','Hossain','imranhossain@smartworkforce.com','+8801711000006','UI Designer',(SELECT department_id FROM departments WHERE code='DES'),          DATE '2023-05-15','ACTIVE',32, TRUE),
('EMP-007','Sadia','Islam','sadiaislam@smartworkforce.com','+8801711000007','QA Automation Engineer',(SELECT department_id FROM departments WHERE code='QA'), DATE '2020-09-30','ACTIVE',40, TRUE),
('EMP-008','Shakib','Rahman','shakibrahman@smartworkforce.com','+8801711000008','QA Engineer',(SELECT department_id FROM departments WHERE code='QA'),            DATE '2022-04-12','ACTIVE',40, TRUE),
('EMP-009','Nasrin','Sultana','nasrinsultana@smartworkforce.com','+8801711000009','Data Analyst',(SELECT department_id FROM departments WHERE code='DATA'),       DATE '2021-08-02','ACTIVE',40, TRUE),
('EMP-010','Arif','Khan','arifkhan@smartworkforce.com','+8801711000010','Machine Learning Engineer',(SELECT department_id FROM departments WHERE code='DATA'),DATE '2022-11-20','ACTIVE',40, TRUE),
('EMP-011','Maliha','Chowdhury','maliachowdhury@smartworkforce.com','+8801711000011','Frontend Engineer',(SELECT department_id FROM departments WHERE code='ENG'), DATE '2023-02-06','ACTIVE',40, TRUE),
('EMP-012','Rubel','Mia','rubelmia@smartworkforce.com','+8801711000012','Backend Engineer',(SELECT department_id FROM departments WHERE code='ENG'),               DATE '2019-06-17','ACTIVE',45, TRUE),
('EMP-013','Sumaiya','Noor','sumaiyanoor@smartworkforce.com','+8801711000013','Content Strategist',(SELECT department_id FROM departments WHERE code='MKT'),           DATE '2021-12-01','ACTIVE',40, TRUE),
('EMP-014','Khaled','Mahmud','khaledmahmud@smartworkforce.com','+8801711000014','DevOps Engineer',(SELECT department_id FROM departments WHERE code='ENG'),           DATE '2020-10-19','ON_LEAVE',40, TRUE);

-- Line management (self referencing FK).
UPDATE employees SET manager_id = (SELECT employee_id FROM employees WHERE employee_code='EMP-001')
 WHERE employee_code IN ('EMP-002','EMP-003','EMP-004','EMP-011','EMP-012','EMP-014');
UPDATE employees SET manager_id = (SELECT employee_id FROM employees WHERE employee_code='EMP-005')
 WHERE employee_code = 'EMP-006';
UPDATE employees SET manager_id = (SELECT employee_id FROM employees WHERE employee_code='EMP-007')
 WHERE employee_code = 'EMP-008';
UPDATE employees SET manager_id = (SELECT employee_id FROM employees WHERE employee_code='EMP-009')
 WHERE employee_code = 'EMP-010';

-- ---------------------------------------------------------------------
-- Users: one ADMIN account plus one login per employee.
-- ---------------------------------------------------------------------
INSERT INTO users (email, password_hash, full_name, role, employee_id) VALUES
('admin@smartworkforce.com', crypt('Password123!', gen_salt('bf', 10)),
 'System Administrator', 'ADMIN', NULL);

INSERT INTO users (email, password_hash, full_name, role, employee_id)
SELECT e.email,
       crypt('Password123!', gen_salt('bf', 10)),
       e.first_name || ' ' || e.last_name,
       'EMPLOYEE',
       e.employee_id
FROM employees e;

-- ---------------------------------------------------------------------
-- EMPLOYEE_SKILLS (resolves the N:N relationship)
-- (code, skill, level 1-5, years of experience, primary?)
-- ---------------------------------------------------------------------
INSERT INTO employee_skills (employee_id, skill_id, proficiency_level, years_experience, is_primary, last_used_on)
SELECT e.employee_id, s.skill_id, v.level, v.yrs, v.is_primary, CURRENT_DATE - (v.yrs || ' years')::INTERVAL
FROM (VALUES
  -- EMP-001 Ayesha Rahman - senior full stack
  ('EMP-001','JavaScript',4.5,6,TRUE),  ('EMP-001','React',4.0,5,FALSE),  ('EMP-001','Node.js',4.5,6,TRUE),
  ('EMP-001','PostgreSQL',4.5,5,FALSE),('EMP-001','Express',4.0,5,FALSE), ('EMP-001','Git',4.5,6,FALSE),
  ('EMP-001','CI/CD',3.5,3,FALSE),      ('EMP-001','Agile',4.0,5,FALSE),  ('EMP-001','API Testing',4.0,4,FALSE),
  -- EMP-002 Rahim Uddin - backend
  ('EMP-002','Node.js',4.5,5,TRUE),     ('EMP-002','Express',4.5,5,TRUE),  ('EMP-002','PostgreSQL',4.0,4,FALSE),
  ('EMP-002','JavaScript',4.0,5,FALSE),('EMP-002','SQL',4.0,4,FALSE),     ('EMP-002','Git',4.0,5,FALSE),
  ('EMP-002','Docker',3.0,2,FALSE),     ('EMP-002','API Testing',3.5,3,FALSE),('EMP-002','Agile',3.5,4,FALSE),
  -- EMP-003 Nusrat Jahan - frontend
  ('EMP-003','React',4.5,4,TRUE),       ('EMP-003','JavaScript',4.5,4,TRUE),('EMP-003','HTML/CSS',5.0,5,FALSE),
  ('EMP-003','TypeScript',3.5,2,FALSE), ('EMP-003','UI Design',3.0,2,FALSE),('EMP-003','Git',3.5,4,FALSE),
  -- EMP-004 Tanvir Ahmed - devops
  ('EMP-004','Docker',4.5,5,TRUE),      ('EMP-004','Kubernetes',4.0,4,TRUE),('EMP-004','AWS',4.5,5,FALSE),
  ('EMP-004','CI/CD',4.5,5,TRUE),       ('EMP-004','Git',4.5,6,FALSE),     ('EMP-004','Linux',4.0,5,FALSE),
  -- EMP-005 Farhana Akter - senior design
  ('EMP-005','UI Design',4.5,6,TRUE),   ('EMP-005','Figma',5.0,6,TRUE),    ('EMP-005','UX Research',4.0,4,FALSE),
  ('EMP-005','HTML/CSS',4.0,6,FALSE),   ('EMP-005','Communication',4.0,5,FALSE),
  -- EMP-006 Imran Hossain - part time designer
  ('EMP-006','UI Design',3.0,2,TRUE),   ('EMP-006','Figma',4.0,3,FALSE),  ('EMP-006','HTML/CSS',3.0,2,FALSE),
  ('EMP-006','UX Research',2.5,1,FALSE),
  -- EMP-007 Sadia Islam - qa automation
  ('EMP-007','Test Automation',4.5,5,TRUE),('EMP-007','Selenium',4.5,4,TRUE),('EMP-007','API Testing',4.0,4,FALSE),
  ('EMP-007','JavaScript',3.5,3,FALSE), ('EMP-007','Agile',4.0,4,FALSE),  ('EMP-007','SQL',3.0,3,FALSE),
  -- EMP-008 Shakib Rahman - manual qa
  ('EMP-008','API Testing',3.5,3,TRUE), ('EMP-008','Test Automation',3.0,2,FALSE),('EMP-008','SQL',3.5,3,FALSE),
  ('EMP-008','Communication',4.0,4,FALSE),('EMP-008','Agile',3.5,3,FALSE),
  -- EMP-009 Nasrin Sultana - analyst
  ('EMP-009','SQL',4.5,5,TRUE),         ('EMP-009','Power BI',4.0,4,TRUE), ('EMP-009','Data Analysis',4.0,4,FALSE),
  ('EMP-009','PostgreSQL',3.5,3,FALSE), ('EMP-009','Python',3.0,3,FALSE),
  -- EMP-010 Arif Khan - ml engineer
  ('EMP-010','Python',4.5,5,TRUE),      ('EMP-010','Machine Learning',4.0,3,TRUE),('EMP-010','Data Analysis',4.0,4,FALSE),
  ('EMP-010','SQL',4.0,4,FALSE),        ('EMP-010','PostgreSQL',3.5,3,FALSE),
  -- EMP-011 Maliha Chowdhury - frontend
  ('EMP-011','React',3.5,2,TRUE),       ('EMP-011','JavaScript',4.0,3,TRUE),('EMP-011','HTML/CSS',4.5,3,FALSE),
  ('EMP-011','TypeScript',3.5,2,FALSE), ('EMP-011','UI Design',2.5,1,FALSE),
  -- EMP-012 Rubel Mia - backend (higher capacity 45h)
  ('EMP-012','Java',4.5,6,TRUE),        ('EMP-012','C#',4.0,4,FALSE),     ('EMP-012','PostgreSQL',4.0,5,TRUE),
  ('EMP-012','SQL',4.0,5,FALSE),        ('EMP-012','Docker',3.5,3,FALSE), ('EMP-012','API Testing',3.5,3,FALSE),
  ('EMP-012','Git',4.0,6,FALSE),
  -- EMP-013 Sumaiya Noor - content
  ('EMP-013','Content Writing',4.5,5,TRUE),('EMP-013','SEO',3.5,3,FALSE), ('EMP-013','Communication',4.0,4,FALSE),
  -- EMP-014 Khaled Mahmud - devops (on leave)
  ('EMP-014','AWS',4.0,4,TRUE),         ('EMP-014','Docker',4.0,4,FALSE), ('EMP-014','Kubernetes',4.5,4,FALSE),
  ('EMP-014','CI/CD',4.0,4,FALSE),      ('EMP-014','Linux',4.0,5,FALSE)
) AS v(emp_code, skill_name, level, yrs, is_primary)
JOIN employees e ON e.employee_code = v.emp_code
JOIN skills    s ON s.name = v.skill_name;
-- ---------------------------------------------------------------------
-- Availability records (must come after the employees exist).
--
-- Khaled Mahmud is on leave for the next two weeks, Imran Hossain works
-- part time and Farhana has a training block. These rows are what the
-- PARTIAL / UNAVAILABLE rules of the allocation engine react to.
-- ---------------------------------------------------------------------
INSERT INTO employee_availability (employee_id, date_from, date_to, status, available_hours, reason) VALUES
((SELECT employee_id FROM employees WHERE employee_code = 'EMP-014'),
 CURRENT_DATE, CURRENT_DATE + 13, 'UNAVAILABLE', 0, 'Annual leave'),
((SELECT employee_id FROM employees WHERE employee_code = 'EMP-006'),
 CURRENT_DATE, CURRENT_DATE + 2, 'PARTIAL', 16, 'Design system workshop'),
((SELECT employee_id FROM employees WHERE employee_code = 'EMP-005'),
 CURRENT_DATE + 5, CURRENT_DATE + 7, 'PARTIAL', 20, 'Accessibility training');
