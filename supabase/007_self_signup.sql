-- =============================================================
--  Let a student simply sign in and see their progress.
--
--  Radhini records an email when she adds a dancer. Whoever signs in
--  with that address is linked to that dancer automatically — no
--  invitation, no dashboard, no admin key anywhere near the browser.
--
--  Why this is safe: signing in requires clicking a link sent to that
--  address, so a session proves control of the inbox. Knowing the
--  address is not enough. The email Radhini types is the credential,
--  and she is the only one who can set it.
-- =============================================================

alter table students add column if not exists contact_email text;

create index if not exists students_contact_email
  on students (lower(contact_email)) where contact_email is not null;

-- ----------------------------------------------------------------
-- Link a profile to every dancer carrying its address.
-- security definer: guardianships are instructor-only, and this runs
-- on behalf of the system rather than the person signing in.
-- ----------------------------------------------------------------
create or replace function link_profile_by_email(p_profile uuid, p_email text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare linked integer;
begin
  insert into guardianships (profile_id, student_id, relation)
  select p_profile, s.id, 'self'
  from students s
  where s.contact_email is not null
    and lower(s.contact_email) = lower(p_email)
  on conflict (profile_id, student_id) do nothing;

  get diagnostics linked = row_count;
  return linked;
end;
$$;

-- ----------------------------------------------------------------
-- Both orders have to work: the dancer added first, or the person
-- signing in first.
-- ----------------------------------------------------------------

-- 1. Someone signs in → link them to any dancer already expecting them.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  perform link_profile_by_email(new.id, new.email);
  return new;
end;
$$;

-- 2. Radhini sets an email on a dancer → link whoever already has it.
create or replace function link_student_to_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.contact_email is not null
     and (tg_op = 'INSERT' or new.contact_email is distinct from old.contact_email) then
    insert into guardianships (profile_id, student_id, relation)
    select p.id, new.id, 'self'
    from profiles p
    where lower(p.email) = lower(new.contact_email)
    on conflict (profile_id, student_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists students_autolink on students;
create trigger students_autolink
  after insert or update of contact_email on students
  for each row execute function link_student_to_profile();

-- ----------------------------------------------------------------
-- Catch up anyone already in both tables but never linked.
-- ----------------------------------------------------------------
insert into guardianships (profile_id, student_id, relation)
select p.id, s.id, 'self'
from profiles p
join students s on lower(s.contact_email) = lower(p.email)
where s.contact_email is not null
on conflict (profile_id, student_id) do nothing;

select s.full_name, s.contact_email, p.email as linked_login
from students s
left join guardianships g on g.student_id = s.id
left join profiles p on p.id = g.profile_id
order by s.full_name;
