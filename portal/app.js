import { sb, requireSession } from './supabase-client.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUS_LABEL = {
  not_started:         'Not started',
  practising:          'Practising',
  awaiting_assessment: 'Assessment needed',
  complete:            'Complete',
};

let dancers = [];     // every student this login may see
let current = null;   // the one on screen

// ---------------------------------------------------------------
// Boot
// ---------------------------------------------------------------
const session = await requireSession();
$('whoami').textContent = session.user.email;

$('signOut').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.replace('index.html');
});

// Show the console link only to the instructor. Cosmetic only — the console
// itself re-checks, and RLS refuses writes regardless of what the UI shows.
sb.from('profiles').select('role').eq('id', session.user.id).maybeSingle()
  .then(({ data }) => { $('teacherLink').hidden = data?.role !== 'instructor'; });

$('tabs').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-panel]');
  if (!button) return;
  for (const b of $('tabs').children) b.classList.toggle('is-active', b === button);
  for (const name of ['home', 'tracker', 'assessment', 'achievements']) {
    $('panel-' + name).hidden = name !== button.dataset.panel;
  }
});

$('studentSwitch').addEventListener('change', (e) => {
  current = dancers.find((d) => d.id === e.target.value);
  render(current);
});

await start();

// ---------------------------------------------------------------
async function start() {
  // RLS decides what comes back here: a family sees only their own
  // dancers, so there is no filter to write on our side.
  const { data, error } = await sb
    .from('guardianships')
    .select('students ( id, full_name, batch_id, batches ( name ) )');

  if (error) return fail(error.message);

  dancers = (data ?? []).map((row) => row.students).filter(Boolean);

  if (dancers.length === 0) {
    return fail('No dancer is linked to this account yet. Please contact Radhini.');
  }

  if (dancers.length > 1) {
    const sel = $('studentSwitch');
    sel.hidden = false;
    sel.innerHTML = dancers
      .map((d) => `<option value="${esc(d.id)}">${esc(d.full_name)}</option>`)
      .join('');
  }

  current = dancers[0];
  await render(current);
}

function fail(message) {
  $('loading').innerHTML = `<div class="card"><p class="empty">${esc(message)}</p></div>`;
}

// ---------------------------------------------------------------
async function render(student) {
  $('loading').hidden = false;
  $('main').hidden = true;

  const [summary, milestones, badges, practice] = await Promise.all([
    sb.from('student_summary').select('*').eq('student_id', student.id).maybeSingle(),
    sb.from('milestone_progress').select('*').eq('student_id', student.id).order('sort_order'),
    sb.from('student_badges').select('awarded_on, badges ( name, icon, description )').eq('student_id', student.id),
    sb.from('practice_sessions').select('minutes').eq('student_id', student.id),
  ]);

  const s     = summary.data ?? {};
  const path  = milestones.data ?? [];
  const batch = student.batches?.name ?? 'Unassigned';

  // ---- header + hero
  $('batchLabel').textContent = batch;
  $('heroBatch').textContent  = batch;
  $('heroName').textContent   = `${student.full_name}'s journey`;

  const pct = Number(s.percent_complete ?? 0);
  $('ring').dataset.pct = pct + '%';
  $('ring').style.background =
    `conic-gradient(var(--gold) 0 ${pct}%, #eae1d6 ${pct}% 100%)`;

  // "current" = first milestone that is not finished
  const currentMilestone = path.find((m) => Number(m.percent_complete) < 100) ?? null;
  $('currentMilestone').textContent = currentMilestone
    ? `Currently learning · ${currentMilestone.name}`
    : 'All milestones complete';
  $('milestoneCount').textContent =
    `${s.milestones_complete ?? 0} of ${s.milestones_total ?? 0} milestones complete`;

  $('statSteps').textContent      = s.steps_complete ?? 0;
  $('statMilestones').textContent = `${s.milestones_complete ?? 0}/${s.milestones_total ?? 0}`;
  $('statPractices').textContent  = (practice.data ?? []).length;
  $('statBadges').textContent     = (badges.data ?? []).length;

  // ---- learning path
  $('path').innerHTML = path.length === 0
    ? '<p class="empty">No curriculum set for this batch yet.</p>'
    : path.map((m, i) => {
        const done = Number(m.percent_complete) === 100;
        const here = !done && m.milestone_id === currentMilestone?.milestone_id;
        const state = done ? 'is-complete' : here ? 'is-current' : '';
        const label = done ? 'Complete' : here ? 'In progress' : 'Upcoming';
        return `
          <div class="step ${state}">
            <div class="dot">${done ? '✓' : i + 1}</div>
            <div>
              <div class="name">${esc(m.name)}</div>
              <div class="meta">${m.completed_steps} of ${m.total_steps} steps</div>
            </div>
            <div class="badge">${label}</div>
          </div>`;
      }).join('');

  // ---- practice log
  const minutes = (practice.data ?? []).reduce((total, r) => total + (r.minutes ?? 0), 0);
  $('practiceCount').textContent = (practice.data ?? []).length;
  $('practiceTime').textContent  =
    minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;

  // ---- badges
  $('badgeGrid').innerHTML = (badges.data ?? []).length === 0
    ? '<p class="empty">No badges yet — they appear here as you earn them.</p>'
    : badges.data.map((row) => `
        <div class="stat">
          <div style="font-size:1.3rem">${esc(row.badges?.icon ?? '✦')}</div>
          <div style="font-size:.82rem; font-weight:500">${esc(row.badges?.name)}</div>
          <div class="lbl">${esc(row.badges?.description ?? '')}</div>
        </div>`).join('');

  await Promise.all([
    renderTracker(student, currentMilestone),
    renderAssessment(student, currentMilestone),
  ]);

  $('loading').hidden = true;
  $('main').hidden = false;
}

// ---------------------------------------------------------------
async function renderTracker(student, milestone) {
  if (!milestone) {
    $('trackerTitle').textContent = 'Nothing in progress';
    $('stepGrid').innerHTML = '<p class="empty">Every milestone is complete. Wonderful.</p>';
    $('trackerNote').hidden = true;
    return;
  }

  $('trackerTitle').textContent = milestone.name;

  // Steps and progress come back separately — progress rows only exist once
  // the teacher has touched a step, so anything missing is "not started".
  const [steps, progress] = await Promise.all([
    sb.from('steps').select('id, name, note, sort_order')
      .eq('milestone_id', milestone.milestone_id).order('sort_order'),
    sb.from('progress').select('step_id, status').eq('student_id', student.id),
  ]);

  const statusOf = new Map((progress.data ?? []).map((p) => [p.step_id, p.status]));

  $('stepGrid').innerHTML = (steps.data ?? []).map((step, i) => {
    const status = statusOf.get(step.id) ?? 'not_started';
    const done   = status === 'complete';
    return `
      <div class="tile ${done ? 'is-complete' : ''}">
        <div class="mark">${done ? '✓' : i + 1}</div>
        <b>${esc(step.name)}</b>
        <span>${esc(step.note || STATUS_LABEL[status])}</span>
      </div>`;
  }).join('');

  const remaining = milestone.total_steps - milestone.completed_steps;
  $('trackerNote').hidden = false;
  $('trackerNote').innerHTML =
    `<strong>${milestone.completed_steps} of ${milestone.total_steps} complete.</strong> ` +
    (remaining === 0
      ? 'Ready for your teacher’s final assessment.'
      : `${remaining} to go before the next milestone unlocks.`);
}

// ---------------------------------------------------------------
async function renderAssessment(student, milestone) {
  const { data } = await sb
    .from('assessments')
    .select('rhythm, precision_score, coordination, note, assessed_on, milestones ( name )')
    .eq('student_id', student.id)
    .order('assessed_on', { ascending: false })
    .limit(1);

  const latest = data?.[0];

  if (!latest) {
    $('assessTitle').textContent = 'No assessment yet';
    $('assessBars').innerHTML = '<p class="empty">Your teacher’s assessment will appear here.</p>';
    $('assessNote').hidden = true;
    return;
  }

  $('assessTitle').textContent = latest.milestones?.name ?? milestone?.name ?? '';

  const rows = [
    ['Rhythm',       latest.rhythm],
    ['Precision',    latest.precision_score],
    ['Coordination', latest.coordination],
  ];

  $('assessBars').innerHTML = rows.map(([label, value]) => `
    <div class="ass">
      <strong style="font-size:.82rem; font-weight:500">${label}</strong>
      <div class="bar"><i style="width:${Number(value ?? 0)}%"></i></div>
      <div class="muted" style="font-size:.72rem">${value == null ? 'Not scored' : value + '%'}</div>
    </div>`).join('');

  if (latest.note) {
    $('assessNote').hidden = false;
    $('assessNote').innerHTML = `“${esc(latest.note)}”`;
  } else {
    $('assessNote').hidden = true;
  }
}
