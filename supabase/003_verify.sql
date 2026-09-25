-- =============================================================
--  Read-only health check. Changes nothing. Run any time.
--  Expect: every table protected, no table with 0 policies,
--  both views security_invoker, seed counts non-zero.
-- =============================================================

-- 1. Is row level security actually on, and does each table have policies?
select
  c.relname                                   as table_name,
  case when c.relrowsecurity then 'on' else 'OFF — PROBLEM' end as rls,
  count(p.polname)                            as policies,
  case when count(p.polname) = 0 then 'NO POLICIES — PROBLEM' else 'ok' end as verdict
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relname;

-- 2. Do the views respect the caller's permissions?
--    Both must say 'security_invoker ok'.
select
  c.relname as view_name,
  case
    when array_to_string(c.reloptions, ',') like '%security_invoker=true%'
      then 'security_invoker ok'
    else 'LEAKS PAST RLS — PROBLEM'
  end as verdict
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
order by c.relname;

-- 3. Did the seed land?
select 'batches' as t, count(*) from batches
union all select 'milestones', count(*) from milestones
union all select 'steps',      count(*) from steps
union all select 'badges',     count(*) from badges
order by 1;

-- 4. Helper functions present?
select proname,
       case when prosecdef then 'security definer ok' else 'MISSING DEFINER — PROBLEM' end
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('is_instructor', 'can_view_student', 'handle_new_user', 'guard_profile_role')
order by proname;
