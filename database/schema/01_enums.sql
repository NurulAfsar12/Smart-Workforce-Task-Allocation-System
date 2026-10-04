-- =====================================================================
-- SMART WORKFORCE & TASK ALLOCATION DATABASE SYSTEM
-- File   : 01_enums.sql
-- Purpose: Define all enumerated (domain) types used across the schema.
--          Native ENUMs enforce domain integrity at the database level.
-- =====================================================================

-- Drop types (cascade) so the script is re-runnable in a clean order.
DROP TYPE IF EXISTS task_status         CASCADE;
DROP TYPE IF EXISTS task_priority       CASCADE;
DROP TYPE IF EXISTS project_status      CASCADE;
DROP TYPE IF EXISTS employment_status   CASCADE;
DROP TYPE IF EXISTS availability_status CASCADE;
DROP TYPE IF EXISTS user_role           CASCADE;
DROP TYPE IF EXISTS assignment_mode     CASCADE;
DROP TYPE IF EXISTS assignment_state    CASCADE;
DROP TYPE IF EXISTS skill_category      CASCADE;

-- Role of a system user. Allocation itself needs no manager role:
-- the rule engine in fn_allocate_task() performs the assignment.
CREATE TYPE user_role AS ENUM ('ADMIN', 'EMPLOYEE');

-- Lifecycle of an employee record.
CREATE TYPE employment_status AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'INACTIVE');

-- Day level availability of an employee (leave, training, workshop, ...).
CREATE TYPE availability_status AS ENUM ('AVAILABLE', 'PARTIAL', 'UNAVAILABLE');

-- Project lifecycle.
CREATE TYPE project_status AS ENUM ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- Main task workflow: PENDING -> ASSIGNED -> IN_PROGRESS -> REVIEW -> COMPLETED
CREATE TYPE task_status AS ENUM (
    'PENDING',     -- created, waiting for the allocation engine
    'ASSIGNED',    -- allocation engine picked an employee
    'IN_PROGRESS', -- employee started working
    'REVIEW',      -- work finished, waiting for review
    'COMPLETED',   -- reviewed and closed
    'ON_HOLD',     -- temporarily paused
    'CANCELLED'    -- dropped
);

-- Business priority of a task (drives scoring weights in the engine).
CREATE TYPE task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- How a task reached its assignee.
CREATE TYPE assignment_mode AS ENUM ('AUTO', 'MANUAL');

-- State of a task_assignment row (kept for full assignment history).
CREATE TYPE assignment_state AS ENUM ('ACTIVE', 'REASSIGNED', 'REVOKED', 'COMPLETED');

-- Skill grouping used for reports.
CREATE TYPE skill_category AS ENUM (
    'LANGUAGE', 'FRAMEWORK', 'DATABASE', 'DEVOPS',
    'DESIGN', 'TESTING', 'ANALYTICS', 'SOFT_SKILL', 'OTHER'
);