# Kalaashaala Student Portal — how to run it

Everything below is done from the portal itself. You never need to touch
anything technical.

## Signing in

Go to **radhinirao.com/portal**, type your email, press the button. A link
arrives in your inbox — click it and you are in. There is no password.

The link works once and expires after an hour. If it is not in your inbox,
look in spam; mark it "not spam" so the next one arrives properly.

## The four pages

Once signed in, the header has:

| Page | For |
|---|---|
| **Progress** | Marking what each student has completed |
| **Students** | Adding dancers and giving families access |
| **Curriculum** | Changing the syllabus itself |
| **Student view** | Seeing exactly what a family sees |

## Adding a new student

1. **Students** → type the name, choose the batch → *Add student*
2. If a parent should see the progress, enter their email under
   **Who can see this journey** and choose the relation

The parent must already have an account. Ask whoever set this up to invite
them, or invite them yourself from the Supabase dashboard if you have it.

A parent with two children gets linked to both, and sees a dropdown to
switch between them.

## Marking progress

**Progress** → choose a student → each step has a dropdown:

- *Not started*
- *Practising*
- *Awaiting assessment*
- *Complete*

Changes save the moment you choose them. Percentages update on their own.

Below that you can record an assessment — rhythm, precision, coordination,
and a note the student reads — and award badges.

## Recording practice

On the same page, **Practice log**: date, minutes, an optional note. This
feeds the "Practices" count the student sees.

## Changing the syllabus

**Curriculum** → choose a batch. You can rename anything by clicking on it,
reorder with the arrows, and add milestones or steps with the boxes at the
bottom.

To remove something, use **⊘ archive** rather than deleting. Archiving hides
it from students but keeps every record. Deleting a milestone erases every
student's progress against it and cannot be undone.

## When a student leaves

**Students** → choose them → set *Status* to **Inactive**. They disappear
from the lists but their history is kept, which matters if they come back.

## What families can see

Only their own dancer, and only what you have marked. They cannot change
anything — every edit in this portal is yours alone. A parent cannot see
another family's child; this is enforced by the database, not just hidden
in the page.

## If something looks wrong

**radhinirao.com/portal/debug.html** shows what the portal thinks is going
on. Send a screenshot of it to whoever maintains this.
