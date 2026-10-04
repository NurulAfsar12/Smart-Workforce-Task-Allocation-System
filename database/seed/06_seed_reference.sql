-- =====================================================================
-- File : 06_seed_reference.sql
-- Departments, skills and availability windows.
-- =====================================================================

INSERT INTO departments (code, name, description, budget_hours) VALUES
('ENG',  'Engineering', 'Product engineering, platform and infrastructure teams', 3200),
('DES',  'Design',       'Product design and user experience', 800),
('QA',   'Quality',      'Test automation and manual quality assurance', 900),
('DATA', 'Data',         'Analytics, reporting and machine learning', 700),
('MKT',  'Marketing',    'Content, growth and communications', 500);

INSERT INTO skills (name, category, description) VALUES
('JavaScript',        'LANGUAGE',  'Core language of the web platform'),
('TypeScript',        'LANGUAGE',  'Typed JavaScript'),
('HTML/CSS',          'FRAMEWORK', 'Layout and styling fundamentals'),
('React',             'FRAMEWORK', 'Component based UI library'),
('Node.js',           'FRAMEWORK', 'Server side JavaScript runtime'),
('Express',           'FRAMEWORK', 'Minimal Node.js web framework'),
('Java',              'LANGUAGE',  'Enterprise backend language'),
('C#',                'LANGUAGE',  'Enterprise backend language'),
('Python',            'LANGUAGE',  'General purpose and data language'),
('PostgreSQL',        'DATABASE',  'Relational database'),
('MongoDB',           'DATABASE',  'Document database'),
('SQL',               'DATABASE',  'Query writing and optimisation'),
('Docker',            'DEVOPS',    'Container platform'),
('Kubernetes',        'DEVOPS',    'Container orchestration'),
('Linux',             'DEVOPS',    'Unix operating system administration'),
('AWS',               'DEVOPS',    'Cloud platform'),
('CI/CD',             'DEVOPS',    'Automated build and delivery pipelines'),
('Git',               'DEVOPS',    'Version control'),
('UI Design',         'DESIGN',    'Interface and visual design'),
('Figma',             'DESIGN',    'Collaborative design tool'),
('UX Research',       'DESIGN',    'User studies and usability testing'),
('Test Automation',   'TESTING',   'Automated test suite development'),
('Selenium',          'TESTING',   'Browser test automation'),
('API Testing',       'TESTING',   'Endpoint validation and contract tests'),
('Data Analysis',     'ANALYTICS', 'Data exploration and reporting'),
('Power BI',          'ANALYTICS', 'Business intelligence dashboards'),
('Machine Learning',  'ANALYTICS', 'Predictive modelling'),
('SEO',               'OTHER',     'Search engine optimisation'),
('Content Writing',   'SOFT_SKILL','Written communication'),
('Agile',             'SOFT_SKILL','Scrum and iterative delivery'),
('Communication',     'SOFT_SKILL','Team and stakeholder communication');