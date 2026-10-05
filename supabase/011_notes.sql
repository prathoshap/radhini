-- =============================================================
--  An assessment is just a note.
--
--  Rhythm / precision / coordination out of 100 asked Radhini to put a
--  number on things she would rather describe. What the student reads
--  is the sentence at the bottom; that is the whole of it.
--
--  The score columns stay, nullable and unwritten, so nothing already
--  recorded is lost. Nothing reads them any more.
-- =============================================================

alter table assessments alter column milestone_id drop not null;

comment on column assessments.rhythm is
  'Retired 2026-10-05. Kept so existing rows survive; nothing writes it.';
comment on column assessments.precision_score is
  'Retired 2026-10-05. Kept so existing rows survive; nothing writes it.';
comment on column assessments.coordination is
  'Retired 2026-10-05. Kept so existing rows survive; nothing writes it.';

-- A note with nothing in it helps nobody.
alter table assessments drop constraint if exists assessments_note_not_blank;
alter table assessments add constraint assessments_note_not_blank
  check (note is null or length(btrim(note)) > 0);

select count(*) as existing_assessments,
       count(*) filter (where note is not null and btrim(note) <> '') as with_a_note
from assessments;
