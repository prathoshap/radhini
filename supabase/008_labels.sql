-- =============================================================
--  Let Radhini word the portal herself.
--
--  The headings students read were fixed in the HTML. Everything the
--  curriculum calls itself is already hers to name; the frame around it
--  should be too.
--
--  default_value keeps the original wording, so "restore" is possible
--  without redeploying anything.
-- =============================================================

create table if not exists portal_labels (
  key           text primary key,
  value         text not null,
  default_value text not null,
  description   text,
  sort_order    int not null default 0
);

alter table portal_labels enable row level security;

drop policy if exists portal_labels_select on portal_labels;
drop policy if exists portal_labels_write  on portal_labels;

create policy portal_labels_select on portal_labels
  for select to authenticated using (true);
create policy portal_labels_write on portal_labels
  for all to authenticated using (is_instructor()) with check (is_instructor());

insert into portal_labels (key, value, default_value, description, sort_order) values
  ('title',            'My Dance Journey',            'My Dance Journey',            'Heading at the top of a student''s page', 1),
  ('subtitle',         'A record of your learning, practice and milestones.',
                       'A record of your learning, practice and milestones.',        'The line underneath it',                  2),
  ('tab_home',         'Home',                        'Home',                        'First tab',                               3),
  ('tab_tracker',      'Adavu Tracker',               'Adavu Tracker',               'Second tab',                              4),
  ('tab_assessment',   'Assessment',                  'Assessment',                  'Third tab',                               5),
  ('tab_achievements', 'Achievements',                'Achievements',                'Fourth tab',                              6),
  ('h_term',           'This term',                   'This term',                   'Heading over the four numbers',           7),
  ('h_path',           'Your learning path',          'Your learning path',          'Heading over the milestone list',         8),
  ('h_practice',       'Practice log',                'Practice log',                'Heading on the tracker tab',              9),
  ('h_achievements',   'Achievements',                'Achievements',                'Heading over the badges',                10),
  ('stat_steps',       'Adavus',                      'Adavus',                      'Under the first number',                 11),
  ('stat_milestones',  'Milestones',                  'Milestones',                  'Under the second number',                12),
  ('stat_practices',   'Practices',                   'Practices',                   'Under the third number',                 13),
  ('stat_badges',      'Badges',                      'Badges',                      'Under the fourth number',                14),
  ('current_prefix',   'Currently learning',          'Currently learning',          'Comes before the milestone name',        15),
  ('empty_badges',     'No badges yet — they appear here as you earn them.',
                       'No badges yet — they appear here as you earn them.',         'When a student has no badges',           16)
on conflict (key) do nothing;

-- ----------------------------------------------------------------
-- Restore everything to the wording the portal shipped with.
-- security definer so it can write through the policy, with the
-- instructor check done here rather than trusting the caller.
-- ----------------------------------------------------------------
create or replace function reset_portal_labels()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare changed integer;
begin
  if not is_instructor() then
    raise exception 'only the instructor can restore the wording';
  end if;
  update portal_labels set value = default_value where value is distinct from default_value;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

select key, value from portal_labels order by sort_order;
