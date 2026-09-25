import { sb, requireSession } from './supabase-client.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUSES = [
  ['not_started',         'Not started'],
  ['practising',          'Practising'],
  ['awaiting_assessment', 'Awaiting assessment'],
  ['complete',            'Complete'],
];

let me       = null;
let roster   = [];    // student_summary rows
let batches  = [];
let selected = null;

// ---------------------------------------------------------------
const session = await requireSession();
me = session.user;
$('whoami').textContent = me.email;

$('signOut').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.replace('index.html');
});

await boot();

// ---------------------------------------------------------------
async function boot() {
  // Gate on the real thing: ask the database whether we are the instructor.
  // The client cannot fake this — every write below is checked again by RLS.
  const { data: profile, error } = await sb
    .from('profiles').select('role').eq('id', me.id).maybeSingle();

  if (error) return stop(error.message);
  if (profile?.role !== 'instructor') {
    return stop('This page is for the instructor. Redirecting to your journey…', () =>
      setTimeout(() => window.location.replace('app.html'), 1800));
  }

  const [b, r] = await Promise.all([
    sb.from('batches').select('id, name').order('sort_order'),
    sb.from('student_summary').select('*').order('full_name'),
  ]);

  batches = b.data ?? [];
  roster  = r.data ?? [];

  $('batchFilter').insertAdjacentHTML('beforeend',
    batches.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join(''));

  $('batchFilter').addEventListener('change', drawRoster);
  $('search').addEventListener('input', drawRoster);

  drawRoster();
  $('loading').hidden = true;
  $('main').hidden = false;
}

function stop(message, then) {
  $('loading').innerHTML = `<div class="card"><p class="empty">${esc(message)}</p></div>`;
  if (then) then();
}

function toast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.className = 'toast is-on' + (isError ? ' is-err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, 2600);
}

// ---------------------------------------------------------------
function drawRoster() {
  const batch = $('batchFilter').value;
  const term  = $('search').value.trim().toLowerCase();

  const shown = roster.filter((s) =>
    (!batch || s.batch_id === batch) &&
    (!term  || (s.full_name ?? '').toLowerCase().includes(term)));

  $('rosterList').innerHTML = shown.length === 0
    ? '<li><p class="empty" style="padding:14px">No students match.</p></li>'
    : shown.map((s) => `
        <li>
          <button data-id="${esc(s.student_id)}" class="${s.student_id === selected?.student_id ? 'is-active' : ''}">
            <span class="nm">${esc(s.full_name)}</span>
            <span class="pc">${s.percent_complete ?? 0}%</span>
          </button>
        </li>`).join('');

  $('rosterCount').textContent =
    `${shown.length} of ${roster.length} student${roster.length === 1 ? '' : 's'}`;

  for (const button of $('rosterList').querySelectorAll('button[data-id]')) {
    button.addEventListener('click', () => {
      selected = roster.find((s) => s.student_id === button.dataset.id);
      drawRoster();
      openStudent(selected);
    });
  }
}

// ---------------------------------------------------------------
async function openStudent(student) {
  $('detail').innerHTML = '<div class="card"><p class="empty">Loading…</p></div>';

  const [milestones, progress, assessments, badges, awarded] = await Promise.all([
    sb.from('milestone_progress').select('*').eq('student_id', student.student_id).order('sort_order'),
    sb.from('progress').select('step_id, status').eq('student_id', student.student_id),
    sb.from('assessments').select('id, rhythm, precision_score, coordination, note, assessed_on, milestones ( name )')
      .eq('student_id', student.student_id).order('assessed_on', { ascending: false }).limit(5),
    sb.from('badges').select('id, name, icon').order('sort_order'),
    sb.from('student_badges').select('badge_id').eq('student_id', student.student_id),
  ]);

  const path     = milestones.data ?? [];
  const statusOf = new Map((progress.data ?? []).map((p) => [p.step_id, p.status]));
  const held     = new Set((awarded.data ?? []).map((r) => r.badge_id));

  const stepsByMilestone = await Promise.all(path.map((m) =>
    sb.from('steps').select('id, name, sort_order')
      .eq('milestone_id', m.milestone_id).eq('archived', false).order('sort_order')
      .then((r) => ({ milestone: m, steps: r.data ?? [] }))));

  $('detail').innerHTML = `
    <div class="card">
      <div class="detail__head">
        <div>
          <p class="eyebrow">${esc(student.batch_name ?? 'No batch')}</p>
          <h2 style="font-size:1.5rem; color:var(--plum)">${esc(student.full_name)}</h2>
          <p class="muted">${student.steps_complete ?? 0} of ${student.steps_total ?? 0} steps ·
             ${student.milestones_complete ?? 0}/${student.milestones_total ?? 0} milestones ·
             ${student.percent_complete ?? 0}% overall</p>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">Progress</h3>
      <p class="muted" style="margin:-8px 0 14px">Changes save the moment you pick them.</p>
      ${stepsByMilestone.map(({ milestone, steps }) => `
        <div class="ms">
          <div class="ms__head">
            <h4>${esc(milestone.name)}</h4>
            <span class="ms__pct">${milestone.completed_steps}/${milestone.total_steps}</span>
          </div>
          <div class="ms__body">
            ${steps.length === 0
              ? '<p class="muted" style="font-size:.8rem">No steps defined for this milestone yet.</p>'
              : steps.map((step) => {
                  const status = statusOf.get(step.id) ?? 'not_started';
                  return `
                    <div class="steprow">
                      <span class="sname">${esc(step.name)}</span>
                      <select data-step="${esc(step.id)}" data-status="${status}">
                        ${STATUSES.map(([v, label]) =>
                          `<option value="${v}"${v === status ? ' selected' : ''}>${label}</option>`).join('')}
                      </select>
                    </div>`;
                }).join('')}
          </div>
        </div>`).join('')}
    </div>

    <div class="card">
      <h3 class="section-title">Record an assessment</h3>
      <div class="formgrid">
        <div class="field">
          <label for="aRhythm">Rhythm</label>
          <input id="aRhythm" type="number" min="0" max="100" placeholder="0–100" />
        </div>
        <div class="field">
          <label for="aPrecision">Precision</label>
          <input id="aPrecision" type="number" min="0" max="100" placeholder="0–100" />
        </div>
        <div class="field">
          <label for="aCoord">Coordination</label>
          <input id="aCoord" type="number" min="0" max="100" placeholder="0–100" />
        </div>
      </div>
      <div class="field" style="margin-top:12px">
        <label for="aMilestone">Milestone</label>
        <select id="aMilestone">
          ${path.map((m) => `<option value="${esc(m.milestone_id)}">${esc(m.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="margin-top:12px">
        <label for="aNote">Note to the student</label>
        <textarea id="aNote" placeholder="What went well, and what to work on next."></textarea>
      </div>
      <div class="row-end"><button class="btn btn--sm" id="saveAssessment">Save assessment</button></div>

      ${(assessments.data ?? []).length === 0 ? '' : `
        <h3 class="section-title" style="margin-top:22px">Recent</h3>
        ${assessments.data.map((a) => `
          <div class="teacher-note" style="margin-top:8px">
            <strong style="font-style:normal">${esc(a.milestones?.name ?? '')}</strong>
            <span class="muted"> · ${esc(a.assessed_on)}</span><br />
            ${a.note ? '“' + esc(a.note) + '”' : '<span class="muted">No note</span>'}
          </div>`).join('')}`}
    </div>

    <div class="card">
      <h3 class="section-title">Badges</h3>
      <div class="chips" id="badgeChips">
        ${(badges.data ?? []).map((b) => `
          <button class="chip ${held.has(b.id) ? 'is-on' : ''}" data-badge="${esc(b.id)}">
            <span>${esc(b.icon ?? '✦')}</span> ${esc(b.name)}
          </button>`).join('')}
      </div>
      <p class="muted" style="margin-top:10px; font-size:.74rem">Click to award or withdraw.</p>
    </div>
  `;

  wireProgress(student);
  wireAssessment(student);
  wireBadges(student, held);
}

// ---------------------------------------------------------------
function wireProgress(student) {
  for (const select of $('detail').querySelectorAll('select[data-step]')) {
    select.addEventListener('change', async () => {
      const previous = select.dataset.status;
      const status   = select.value;
      select.disabled = true;

      const { error } = await sb.from('progress').upsert({
        student_id: student.student_id,
        step_id:    select.dataset.step,
        status,
        updated_by: me.id,
      }, { onConflict: 'student_id,step_id' });

      select.disabled = false;

      if (error) {
        select.value = previous;                 // put it back; nothing was saved
        toast('Could not save: ' + error.message, true);
        return;
      }

      select.dataset.status = status;
      toast('Saved');
      await refreshRoster(student.student_id);
    });
  }
}

function wireAssessment(student) {
  $('saveAssessment').addEventListener('click', async () => {
    const value = (id) => {
      const raw = $(id).value.trim();
      return raw === '' ? null : Math.max(0, Math.min(100, Number(raw)));
    };

    const row = {
      student_id:      student.student_id,
      milestone_id:    $('aMilestone').value,
      rhythm:          value('aRhythm'),
      precision_score: value('aPrecision'),
      coordination:    value('aCoord'),
      note:            $('aNote').value.trim() || null,
      assessed_by:     me.id,
    };

    if (!row.milestone_id) return toast('Pick a milestone first.', true);

    const { error } = await sb.from('assessments').insert(row);
    if (error) return toast('Could not save: ' + error.message, true);

    toast('Assessment saved');
    openStudent(student);
  });
}

function wireBadges(student, held) {
  for (const chip of $('badgeChips').querySelectorAll('button[data-badge]')) {
    chip.addEventListener('click', async () => {
      const id  = chip.dataset.badge;
      const has = held.has(id);
      chip.disabled = true;

      const { error } = has
        ? await sb.from('student_badges').delete()
            .eq('student_id', student.student_id).eq('badge_id', id)
        : await sb.from('student_badges').insert({
            student_id: student.student_id, badge_id: id });

      chip.disabled = false;
      if (error) return toast('Could not save: ' + error.message, true);

      has ? held.delete(id) : held.add(id);
      chip.classList.toggle('is-on', !has);
      toast(has ? 'Badge withdrawn' : 'Badge awarded');
    });
  }
}

// Pull the recomputed percentage back after a change.
async function refreshRoster(studentId) {
  const { data } = await sb.from('student_summary').select('*').eq('student_id', studentId).maybeSingle();
  if (!data) return;
  const i = roster.findIndex((s) => s.student_id === studentId);
  if (i >= 0) roster[i] = data;
  if (selected?.student_id === studentId) selected = data;
  drawRoster();
}
