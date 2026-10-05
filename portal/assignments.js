import { sb, requireSession } from './supabase-client.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let me = null;
let batches = [];

// ---------------------------------------------------------------
// ISO weeks: Monday-based, and the week holding the year's first
// Thursday is week 1. Worth getting right — "week 40" has to mean the
// same thing to her as it does to a calendar.
// ---------------------------------------------------------------
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function mondayOf(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (week - 1) * 7);
  return monday;
}

function weekRange(year, week) {
  const a = mondayOf(year, week);
  const b = new Date(a); b.setUTCDate(a.getUTCDate() + 6);
  const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(a)} – ${fmt(b)}`;
}

// ---------------------------------------------------------------
const session = await requireSession();
me = session.user;

$('signOut').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.replace('index.html');
});

await boot();

async function boot() {
  const { data: profile } = await sb
    .from('profiles').select('role').eq('id', me.id).maybeSingle();

  if (profile?.role !== 'instructor') {
    $('loading').innerHTML =
      '<div class="card"><p class="empty">This page is for the instructor.</p></div>';
    setTimeout(() => window.location.replace('app.html'), 1800);
    return;
  }

  const { data } = await sb.from('batches').select('id, name').order('sort_order');
  batches = data ?? [];
  if (batches.length === 0) {
    $('loading').innerHTML =
      '<div class="card"><p class="empty">No batches yet — add one in Curriculum.</p></div>';
    return;
  }

  $('batchPick').innerHTML = batches
    .map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');

  // This week, and the twelve before it.
  const now = isoWeek(new Date());
  const weeks = [];
  for (let i = 0; i < 13; i++) {
    let w = now.week - i, y = now.year;
    if (w < 1) { y -= 1; w += 52; }
    weeks.push({ y, w });
  }
  $('weekPick').innerHTML = weeks.map(({ y, w }, i) =>
    `<option value="${y}-${w}"${i === 0 ? ' selected' : ''}>Week ${w}${i === 0 ? ' · this week' : ''}</option>`).join('');

  $('batchPick').addEventListener('change', render);
  $('weekPick').addEventListener('change', render);

  await render();
  $('loading').hidden = true;
  $('main').hidden = false;
}

function toast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.className = 'toast is-on' + (isError ? ' is-err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, 2600);
}

window.addEventListener('error', (e) => {
  console.error(e.error ?? e.message);
  toast('Something went wrong on this page. ' + (e.message ?? ''), true);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast('Something went wrong: ' + (e.reason?.message ?? e.reason), true);
});

// ---------------------------------------------------------------
async function render() {
  const batchId = $('batchPick').value;
  const [year, week] = $('weekPick').value.split('-').map(Number);
  $('weekDates').textContent = weekRange(year, week);

  $('detail').innerHTML = '<div class="card"><p class="empty">Loading…</p></div>';

  const [assignment, students] = await Promise.all([
    sb.from('assignments').select('id, task')
      .eq('batch_id', batchId).eq('year', year).eq('week', week).maybeSingle(),
    sb.from('students').select('id, full_name')
      .eq('batch_id', batchId).eq('active', true).order('full_name'),
  ]);

  const roll = students.data ?? [];
  const set  = assignment.data ?? null;

  let doneOf = new Map();
  if (set) {
    const { data } = await sb.from('assignment_done')
      .select('student_id, done').eq('assignment_id', set.id);
    doneOf = new Map((data ?? []).map((r) => [r.student_id, r.done]));
  }

  const doneCount = roll.filter((s) => doneOf.get(s.id)).length;

  $('detail').innerHTML = `
    <div class="card">
      <p class="eyebrow">Week ${week}</p>
      <h2 style="font-size:1.4rem; color:var(--plum); margin-top:3px">What to practise</h2>
      <p class="muted" style="margin-top:4px">
        Written once for the whole batch. Students see it on their page.
      </p>
      <div class="field" style="margin-top:12px">
        <textarea id="task" placeholder="e.g. Thattu adavu steps 1–4, first and second speed. Namaskaram daily."
                  >${esc(set?.task ?? '')}</textarea>
      </div>
      <div class="row-end">
        <button class="btn btn--sm" id="saveTask">${set ? 'Update assignment' : 'Set assignment'}</button>
      </div>
    </div>

    ${!set ? '' : `
      <div class="card">
        <div class="detail__head">
          <h3 class="section-title" style="margin:0">Who has done it</h3>
          <span class="muted" id="tally">${doneCount} of ${roll.length}</span>
        </div>
        <p class="muted" style="margin:6px 0 14px">One tap each. Saves as you go.</p>
        ${roll.length === 0
          ? '<p class="empty">No active students in this batch.</p>'
          : `<div class="ticklist">
              ${roll.map((s) => {
                const done = doneOf.get(s.id) === true;
                return `
                  <button class="tick ${done ? 'is-done' : ''}" data-student="${esc(s.id)}" data-done="${done}">
                    <span class="tick__box">${done ? '✓' : ''}</span>
                    <span class="tick__name">${esc(s.full_name)}</span>
                    <span class="tick__state">${done ? 'Done' : 'Not done'}</span>
                  </button>`;
              }).join('')}
            </div>`}
      </div>`}
  `;

  wire(batchId, year, week, set, roll);
}

// ---------------------------------------------------------------
function wire(batchId, year, week, set, roll) {
  $('saveTask').addEventListener('click', async () => {
    const task = $('task').value.trim();
    if (!task) return toast('Write the assignment first.', true);

    const { error } = await sb.from('assignments').upsert({
      ...(set ? { id: set.id } : {}),
      batch_id: batchId, year, week, task, created_by: me.id,
    }, { onConflict: 'batch_id,year,week' });

    if (error) return toast('Could not save: ' + error.message, true);
    toast(set ? 'Assignment updated' : 'Assignment set');
    render();
  });

  for (const button of $('detail').querySelectorAll('.tick')) {
    button.addEventListener('click', async () => {
      const done = button.dataset.done !== 'true';

      // Flip first; a tick that waits on the network feels broken when
      // she is going down a list of fifteen.
      button.dataset.done = String(done);
      button.classList.toggle('is-done', done);
      button.querySelector('.tick__box').textContent = done ? '✓' : '';
      button.querySelector('.tick__state').textContent = done ? 'Done' : 'Not done';

      const { error } = await sb.from('assignment_done').upsert({
        assignment_id: set.id,
        student_id:    button.dataset.student,
        done,
        updated_by:    me.id,
      }, { onConflict: 'assignment_id,student_id' });

      if (error) {
        button.dataset.done = String(!done);
        button.classList.toggle('is-done', !done);
        button.querySelector('.tick__box').textContent = !done ? '✓' : '';
        button.querySelector('.tick__state').textContent = !done ? 'Done' : 'Not done';
        return toast('Could not save: ' + error.message, true);
      }

      const n = [...$('detail').querySelectorAll('.tick')].filter((b) => b.dataset.done === 'true').length;
      $('tally').textContent = `${n} of ${roll.length}`;
    });
  }
}
