-- =============================================================
--  Make Radhini the instructor.
--
--  Run after her login exists (Authentication → Users → Add user,
--  with Auto Confirm ticked). Safe to run more than once.
-- =============================================================

-- 1. Does she have a login at all?
select email, confirmed_at is not null as confirmed
from auth.users
where lower(email) = lower('radhiniprasad@gmail.com');
--    no row here  →  create the user in the dashboard first

-- 2. Backfill any login that never got a profile row.
insert into profiles (id, email, full_name)
select u.id, u.email,
       coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id);

-- 3. Promote her.
update profiles
   set role = 'instructor'
 where lower(email) = lower('radhiniprasad@gmail.com')
returning email, role;

-- 4. Who can do what now.
select email, role from profiles order by role, email;
