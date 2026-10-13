-- ----------------------------------------------------------------------------
-- programs
-- Structured department/program reference data, replacing free-text
-- users.program going forward. Flat table (department columns duplicated on
-- each row) rather than a separate departments table, since the department
-- list itself never needs independent CRUD - it only ever appears attached
-- to a program. Seeded once below with NWSSU's official college/program list.
-- ----------------------------------------------------------------------------
create table programs (
  id uuid primary key default gen_random_uuid(),
  department_code text not null,
  department_name text not null,
  program_code text not null unique,
  program_name text not null,
  created_at timestamptz not null default now()
);

create index idx_programs_department_code on programs (department_code);

comment on table programs is
  'Official NWSSU college (department) and program/course list. program_code is globally unique across departments, so it alone identifies a program.';

insert into programs (department_code, department_name, program_code, program_name) values
  ('CAT', 'College of Agriculture and Technology', 'BAT', 'BACHELOR OF AGRICULTURAL TECHNOLOGY'),
  ('CAT', 'College of Agriculture and Technology', 'BSAG AGRONOMY', 'BACHELOR OF SCIENCE IN AGRICULTURE (MAJOR IN AGRONOMY)'),
  ('CAT', 'College of Agriculture and Technology', 'BSAG ANIMAL SCIENCE', 'BACHELOR OF SCIENCE IN AGRICULTURE (MAJOR IN ANIMAL SCIENCE)'),
  ('CAT', 'College of Agriculture and Technology', 'BSAG HORTICULTURE', 'BACHELOR OF SCIENCE IN AGRICULTURE (MAJOR IN HORTICULTURE)'),
  ('CAT', 'College of Agriculture and Technology', 'BSFT', 'BACHELOR OF SCIENCE IN FOOD TECHNOLOGY'),
  ('CAT', 'College of Agriculture and Technology', 'BSIT AUTOMOTIVE', 'BACHELOR OF SCIENCE IN INDUSTRIAL TECHNOLOGY (MAJOR IN AUTOMOTIVE TECHNOLOGY)'),
  ('CAT', 'College of Agriculture and Technology', 'BSIT ELECTRICAL', 'BACHELOR OF SCIENCE IN INDUSTRIAL TECHNOLOGY (MAJOR IN ELECTRICAL TECHNOLOGY)'),
  ('CAT', 'College of Agriculture and Technology', 'BSIT ELECTRONICS', 'BACHELOR OF SCIENCE IN INDUSTRIAL TECHNOLOGY (MAJOR IN ELECTRONICS TECHNOLOGY)'),
  ('CAT', 'College of Agriculture and Technology', 'BSIT MT', 'BACHELOR OF SCIENCE OF INDUSTRIAL TECHNOLOGY (MECHANICAL TECHNOLOGY)'),

  ('CCIS', 'College of Computing and Information Sciences', 'BSCS', 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE'),
  ('CCIS', 'College of Computing and Information Sciences', 'BSEMC', 'BACHELOR OF SCIENCE IN ENTERTAINMENT AND MULTIMEDIA COMMUNICATIONS'),
  ('CCIS', 'College of Computing and Information Sciences', 'BSIS', 'BACHELOR OF SCIENCE IN INFORMATION SYSTEM'),
  ('CCIS', 'College of Computing and Information Sciences', 'BSINFOT', 'BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY'),

  ('CCJS', 'College of Criminal Justice and Sciences', 'BSCD', 'BACHELOR OF SCIENCE IN COMMUNITY DEVELOPMENT'),
  ('CCJS', 'College of Criminal Justice and Sciences', 'BSCRIM', 'BACHELOR OF SCIENCE IN CRIMINOLOGY'),
  ('CCJS', 'College of Criminal Justice and Sciences', 'BSDEVCOM', 'BACHELOR OF SCIENCE IN DEVELOPMENT COMMUNICATION'),
  ('CCJS', 'College of Criminal Justice and Sciences', 'BSES (EPM)', 'BACHELOR OF SCIENCE IN ENVIRONMENTAL SCIENCE (EPM)'),
  ('CCJS', 'College of Criminal Justice and Sciences', 'BSES (NRM)', 'BACHELOR OF SCIENCE IN ENVIRONMENTAL SCIENCE (NRM)'),
  ('CCJS', 'College of Criminal Justice and Sciences', 'BSISM', 'BACHELOR OF SCIENCE IN INDUSTRIAL SECURITY MANAGEMENT'),
  ('CCJS', 'College of Criminal Justice and Sciences', 'BSLEA', 'BACHELOR OF SCIENCE IN LAW ENFORCEMENT ADMINISTRATION'),

  ('CEA', 'College of Engineering and Architecture', 'BSARCH', 'BACHELOR OF SCIENCE IN ARCHITECTURE'),
  ('CEA', 'College of Engineering and Architecture', 'BSCE CEM', 'BACHELOR OF SCIENCE IN CIVIL ENGINEERING (CONSTRUCTION ENGINEERING AND MANAGEMENT)'),
  ('CEA', 'College of Engineering and Architecture', 'BSCPE', 'BACHELOR OF SCIENCE IN COMPUTER ENGINEERING'),
  ('CEA', 'College of Engineering and Architecture', 'BSEE', 'BACHELOR OF SCIENCE IN ELECTRICAL ENGINEERING'),
  ('CEA', 'College of Engineering and Architecture', 'BSECE', 'BACHELOR OF SCIENCE IN ELECTRONICS ENGINEERING'),
  ('CEA', 'College of Engineering and Architecture', 'BSME', 'BACHELOR OF SCIENCE IN MECHANICAL ENGINEERING'),

  ('COED', 'College of Education', 'BEED GEN', 'BACHELOR OF ELEMENTARY EDUCATION - GENERAL EDUCATION'),
  ('COED', 'College of Education', 'BPED', 'BACHELOR OF PHYSICAL EDUCATION'),
  ('COED', 'College of Education', 'BSED ENGLISH', 'BACHELOR IN SECONDARY EDUCATION (MAJOR IN ENGLISH)'),
  ('COED', 'College of Education', 'BSED FILIPINO', 'BACHELOR OF SECONDARY EDUCATION (MAJOR IN FILIPINO)'),
  ('COED', 'College of Education', 'BSED MATH', 'BACHELOR OF SECONDARY EDUCATION (MAJOR IN MATHEMATICS)'),
  ('COED', 'College of Education', 'BSED SCIENCE', 'BACHELOR OF SECONDARY EDUCATION (MAJOR IN SCIENCE)'),
  ('COED', 'College of Education', 'BSED SOCIAL STUDIES', 'BACHELOR OF SECONDARY EDUCATION (MAJOR IN SOCIAL STUDIES)'),
  ('COED', 'College of Education', 'BSED VALUES EDUCATIO', 'BACHELOR OF SECONDARY EDUCATION (MAJOR IN VALUES EDUCATION)'),
  ('COED', 'College of Education', 'BTLED', 'BACHELOR OF TECHNOLOGY AND LIVELIHOOD EDUCATION'),
  ('COED', 'College of Education', 'BTVTED', 'BACHELOR OF TECHNICAL-VOCATIONAL TEACHER EDUCATION'),

  ('COM', 'College of Management', 'BSBA', 'BACHELOR OF SCIENCE IN BUSINESS ADMINISTRATION (MAJOR IN MARKETING MANAGEMENT)'),
  ('COM', 'College of Management', 'BSEntrep', 'BACHELOR OF SCIENCE IN ENTREPRENEURSHIP'),
  ('COM', 'College of Management', 'BSOAD', 'BACHELOR OF SCIENCE IN OFFICE ADMINISTRATION'),
  ('COM', 'College of Management', 'BSHM', 'BACHELOR OF SCIENCE IN HOSPITALITY MANAGEMENT'),
  ('COM', 'College of Management', 'BSTM', 'BACHELOR OF SCIENCE IN TOURISM MANAGEMENT'),

  ('CON', 'College of Nursing', 'BSN', 'BACHELOR OF SCIENCE IN NURSING');

-- ----------------------------------------------------------------------------
-- users: structured program reference, alongside the existing free-text
-- `program` column (kept, unused going forward, as an audit trail of
-- whatever was typed/imported before this migration).
-- ----------------------------------------------------------------------------
alter table users
  add column department_code text,
  add column program_code text references programs(program_code);

comment on column users.program is
  'Legacy free-text program/course value. Superseded by program_code/department_code (FK to programs) as of this migration; retained only as a pre-migration audit trail.';

-- One-time best-effort backfill: map existing free-text `program` values to
-- the new structured columns wherever they unambiguously match an official
-- program name. Anything that doesn't match (test/seed data using programs
-- NWSSU doesn't actually offer, e.g. "BS Psychology") is intentionally left
-- null here for an admin to fix up by hand via the Accounts UI - guessing at
-- those would risk mis-assigning a real student's program.
update users u
set department_code = p.department_code,
    program_code = p.program_code
from programs p
where u.program_code is null
  and u.program is not null
  and (
    lower(u.program) = lower(p.program_name)
    or lower(u.program) = lower('BS ' || replace(p.program_name, 'BACHELOR OF SCIENCE IN ', ''))
  );

create index idx_users_program_code on users (program_code);
