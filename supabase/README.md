# Kalaashaala Student Portal — database

Run these once, in order, in the Supabase SQL editor.

| File | What it does |
|---|---|
| `001_init.sql` | Tables, triggers, row level security, derived views |
| `002_seed.sql` | Starter curriculum and badges. No real student data. |

## Setup

1. Create a Supabase project. **Pick an EU region** (Frankfurt or Stockholm) —
   this cannot be changed later without a migration.
2. SQL editor → paste `001_init.sql` → Run.
3. SQL editor → paste `002_seed.sql` → Run.
4. Authentication → Providers → enable **Email**, and turn **off** "Confirm password".
   We use magic links only; no passwords are ever stored or handled.
5. Sign in once through the portal with Radhini's email so her row exists,
   then promote her (see below).

## Making Radhini the instructor

Everyone signs up as a `student` by default. There is no way to promote
yourself through the app — the `profiles_guard_role` trigger silently reverts
it. Promotion happens here, deliberately:

```sql
update profiles set role = 'instructor' where lower(email) = lower('her@address')
returning email, role;
```

`returning` matters — without it a no-op update looks identical to a
successful one. This needs `005_fix_role_guard.sql` to have been run; before
that migration the guard reverted changes made here too.

## Checking the security actually works

Worth doing before any real student data goes in. In the SQL editor, run as a
specific user by setting the request context:

```sql
-- pretend to be a given login
select set_config('request.jwt.claims',
  json_build_object('sub', '<that profile id>', 'role', 'authenticated')::text, true);
set role authenticated;

select * from students;   -- expect: only their own dancers
update progress set status = 'complete';  -- expect: 0 rows. families never write.

reset role;
```

The same check as the instructor should return every student, and the update
should succeed.

## Shape of the permissions

- **Curriculum** (batches, milestones, steps, badges) — any signed-in user may read.
- **Dancers and their records** — a family reads only the dancers linked to them
  through `guardianships`. The instructor reads all.
- **Writes** — instructor only, on every table without exception.

That last rule is deliberate and comes from the original design: *"Mark each
item only after teacher approval."* Students and parents cannot mark their own
progress, which also means a compromised family account cannot alter records.

## Notes

- Progress percentages are never stored. `milestone_progress` and
  `student_summary` derive them from completed steps, so they cannot go stale.
- `security_invoker = true` on both views is load-bearing. Without it the views
  would bypass row level security entirely.
- The two helper functions are `security definer` on purpose: they read tables
  that are themselves behind RLS, and would otherwise recurse.
