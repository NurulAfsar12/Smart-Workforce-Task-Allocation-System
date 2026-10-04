-- =====================================================================
-- File : 00_install.sql
-- Master script: builds the complete database from an empty cluster.
-- Usage (from the project root):
--   psql -U postgres -f database/00_install.sql
-- or
--   npm run db:setup   (in the server folder)
-- =====================================================================

\set ON_ERROR_STOP on

\echo '>>> Creating database smart_workforce ...'
SELECT 'CREATE DATABASE smart_workforce'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'smart_workforce')
\gexec

\connect smart_workforce

\echo '>>> 1/6  Enumerated types'
\ir schema/01_enums.sql
\echo '>>> 2/6  Tables, keys and constraints'
\ir schema/02_tables.sql
\echo '>>> 3/6  Functions and the allocation engine'
\ir functions/03_functions.sql
\echo '>>> 4/6  Triggers'
\ir triggers/04_triggers.sql
\echo '>>> 5/6  Reporting views'
\ir views/05_views.sql
\echo '>>> 6/6  Demo data (runs the allocation engine)'
\ir seed/06_seed_reference.sql
\ir seed/07_seed_people.sql
\ir seed/08_seed_projects.sql
\ir seed/09_seed_activity.sql

\echo ''
\echo '================================================================='
\echo ' Database ready. Demo logins (password: Password123!)'
\echo '   admin@smartworkforce.com      role ADMIN'
\echo '   ayesha.rahman@smartworkforce.com   EMPLOYEE'
\echo '   tanvirahmed@smartworkforce.com     EMPLOYEE'
\echo '================================================================='