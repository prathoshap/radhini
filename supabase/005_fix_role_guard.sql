-- =============================================================
--  Fix: the role guard also blocked the SQL editor.
--
--  guard_profile_role reverted any role change unless the caller was
--  already an instructor. In the SQL editor there is no JWT, so
--  auth.uid() is null, is_instructor() is false, and the promotion the
--  README tells you to run silently did nothing.
--
--  A null auth.uid() means the dashboard, a migration, or the service
--  key — none of which are the browser, and all of which are trusted.
--  The guard should only stand between a signed-in user and their own
--  role.
-- =============================================================

create or replace function guard_profile_role()
returns trigger language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null          -- not the dashboard or a migration
     and not is_instructor() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

-- Now it applies.
update profiles
   set role = 'instructor'
 where lower(email) = lower('prathoshap@gmail.com')
returning email, role;
