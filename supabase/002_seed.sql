-- =============================================================
--  Starter curriculum, lifted from the original portal design.
--  Run after 001_init.sql. Safe to edit or delete entirely —
--  Radhini can change all of this from the curriculum editor later.
--  Contains no real student data.
-- =============================================================

insert into batches (name, level, sort_order) values
  ('Batch 1 · Foundation',   'foundation',   1),
  ('Batch 2 · Intermediate', 'intermediate', 2),
  ('Batch 3 · Advanced',     'advanced',     3);

-- ---- Foundation ------------------------------------------------
with b as (select id from batches where level = 'foundation')
insert into milestones (batch_id, name, description, sort_order)
select b.id, m.name, m.description, m.sort_order from b, (values
  ('Nritta Foundations', 'Basic posture • Araimandi • Namaskaram', 1),
  ('Tatta Adavu',        'Steps 1–8 • Rhythm • Hand coordination', 2),
  ('Natta Adavu',        'Steps 1–8',                              3),
  ('Visharu Adavu',      'Balance • Extension • Precision',        4),
  ('Jati & Rhythm',      'Teermanam • Adi tala',                   5)
) as m(name, description, sort_order);

-- ---- Intermediate ----------------------------------------------
with b as (select id from batches where level = 'intermediate')
insert into milestones (batch_id, name, description, sort_order)
select b.id, m.name, m.description, m.sort_order from b, (values
  ('Foundation',         'Posture • Araimandi • Namaskaram', 1),
  ('Adavu Foundations',  'Tatta • Natta • Visharu',          2),
  ('Jathi & Rhythm',     'Jathis • Korvai • Teermanam',      3),
  ('Jatiswaram',         'Unlock after assessment',          4),
  ('Abhinaya',           'Expression • Character • Story',   5)
) as m(name, description, sort_order);

-- ---- Advanced --------------------------------------------------
with b as (select id from batches where level = 'advanced')
insert into milestones (batch_id, name, description, sort_order)
select b.id, m.name, m.description, m.sort_order from b, (values
  ('Varnam',             'Structure • Stamina • Layout',     1),
  ('Abhinaya',           'Sanchari • Bhava • Storytelling',  2),
  ('Padam & Javali',     'Subtlety • Interpretation',        3),
  ('Thillana',           'Speed • Precision • Finish',       4),
  ('Arangetram Prep',    'Full margam • Stage craft',        5)
) as m(name, description, sort_order);

-- ---- Steps for the two milestones the design showed in detail ---
with m as (
  select id from milestones
  where name = 'Natta Adavu'
    and batch_id = (select id from batches where level = 'foundation')
)
insert into steps (milestone_id, name, note, sort_order)
select m.id, s.name, s.note, s.sort_order from m, (values
  ('Step 1', null, 1), ('Step 2', null, 2), ('Step 3', null, 3), ('Step 4', null, 4),
  ('Step 5', null, 5), ('Step 6', null, 6), ('Step 7', null, 7), ('Step 8', null, 8)
) as s(name, note, sort_order);

with m as (
  select id from milestones
  where name = 'Jathi & Rhythm'
    and batch_id = (select id from batches where level = 'intermediate')
)
insert into steps (milestone_id, name, note, sort_order)
select m.id, s.name, s.note, s.sort_order from m, (values
  ('Jathi 1',       null, 1),
  ('Jathi 2',       null, 2),
  ('Jathi 3',       null, 3),
  ('Jathi 4',       null, 4),
  ('Korvai 1',      null, 5),
  ('Korvai 2',      null, 6),
  ('Teermanam',     null, 7),
  ('Full sequence', null, 8)
) as s(name, note, sort_order);

-- ---- Badges -----------------------------------------------------
insert into badges (name, icon, description, sort_order) values
  ('First Steps',     '🌱', 'Foundation complete',  1),
  ('Rhythm Keeper',   '🥁', '10 rhythm practices',  2),
  ('Practice Streak', '🔥', '4 weeks running',      3),
  ('Stage Ready',     '✨', 'Ready to perform',     4);
