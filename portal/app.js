import { sb, requireSession } from './supabase-client.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUS_LABEL = {
  not_started:         'Not started',
  practising:          'Progressing',
  awaiting_assessment: 'Progressing',   // retired in 009; kept for old rows
  complete:            'Learnt',
};

let dancers = [];     // every student this login may see
let current = null;   // the one on screen
let labels  = {};     // wording, editable by the instructor

/** Radhini's wording, over whatever the HTML shipped with. */
async function applyLabels() {
  const { data, error } = await sb.from('portal_labels').select('key, value');
  if (error) return;                       // fall back to what is in the HTML
  labels = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  for (const el of document.querySelectorAll('[data-label]')) {
    const text = labels[el.dataset.label];
    if (text) el.textContent = text;
  }
  if (labels.title) document.title = labels.title + ' — Kalaashaala';
}

// ---------------------------------------------------------------
// Boot
// ---------------------------------------------------------------
const session = await requireSession();
$('whoami').textContent = session.user.email;

$('signOut').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.replace('index.html');
});

// Role decides two things: whether the console link shows, and where an
// instructor with no dancers of their own should be sent.
const rolePromise = sb.from('profiles').select('role').eq('id', session.user.id)
  .maybeSingle().then(({ data }) => data?.role ?? 'student');

rolePromise.then((role) => { $('teacherLink').hidden = role !== 'instructor'; });

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

await applyLabels();
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
    // The teacher is not a parent. Landing her on an empty student view is
    // a dead end; send her where the work happens.
    if (await rolePromise === 'instructor') {
      window.location.replace('teacher.html');
      return;
    }
    return fail('We do not have a dancer registered against this email address '
      + 'yet. Ask Radhini to add it, then sign in again — it links itself.');
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

  const [summary, milestones, badges, tally] = await Promise.all([
    sb.from('student_summary').select('*').eq('student_id', student.id).maybeSingle(),
    sb.from('milestone_progress').select('*').eq('student_id', student.id).order('sort_order'),
    sb.from('student_badges').select('awarded_on, badges ( name, icon, description )').eq('student_id', student.id),
    sb.from('assignment_tally').select('assignments_set, assignments_done').eq('student_id', student.id).maybeSingle(),
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
  const currentWithSteps  = path.find((m) => Number(m.percent_complete) < 100 && m.total_steps > 0) ?? null;
  $('currentMilestone').textContent = currentMilestone
    ? `${labels.current_prefix ?? 'Currently learning'} · ${currentMilestone.name}`
    : 'All milestones complete';
  $('milestoneCount').textContent =
    `${s.milestones_complete ?? 0} of ${s.milestones_total ?? 0} milestones complete`;

  $('statSteps').textContent      = s.steps_complete ?? 0;
  $('statMilestones').textContent = `${s.milestones_complete ?? 0}/${s.milestones_total ?? 0}`;
  $('statPractices').textContent  = tally.data?.assignments_done ?? 0;
  $('statBadges').textContent     = (badges.data ?? []).length;

  // ---- badges
  $('badgeGrid').innerHTML = (badges.data ?? []).length === 0
    ? `<p class="empty">${esc(labels.empty_badges ?? 'No badges yet — they appear here as you earn them.')}</p>`
    : badges.data.map((row) => `
        <div class="stat">
          <div style="font-size:1.3rem">${esc(row.badges?.icon ?? '✦')}</div>
          <div style="font-size:.82rem; font-weight:500">${esc(row.badges?.name)}</div>
          <div class="lbl">${esc(row.badges?.description ?? '')}</div>
        </div>`).join('');

  // ---- learning path, with the detail Radhini sees
  const cur = await loadCurriculum(student, path);
  renderPath(student, path, currentMilestone, cur);

  // ---- practice / assignment
  await renderAssignment(student);

  await Promise.all([
    renderTracker(student, path, currentWithSteps, cur),
    renderAssessment(student),
  ]);

  $('loading').hidden = true;
  $('main').hidden = false;
}

// Steps, statuses and speeds for the whole batch. Loaded once so the
// path and the tracker can never disagree with each other.
async function loadCurriculum(student, path) {
  const ids = path.map((m) => m.milestone_id);

  const [steps, progress, speeds, meta] = await Promise.all([
    ids.length
      ? sb.from('steps').select('id, name, milestone_id, sort_order')
          .in('milestone_id', ids).eq('archived', false).order('sort_order')
      : Promise.resolve({ data: [] }),
    sb.from('progress').select('step_id, status').eq('student_id', student.id),
    sb.from('step_speed').select('step_id, speed, status').eq('student_id', student.id),
    sb.from('milestones').select('id, tracks_speed').eq('batch_id', student.batch_id),
  ]);

  const byMilestone = new Map();
  for (const st of steps.data ?? []) {
    if (!byMilestone.has(st.milestone_id)) byMilestone.set(st.milestone_id, []);
    byMilestone.get(st.milestone_id).push(st);
  }

  const speedOf = new Map();
  for (const row of speeds.data ?? []) {
    if (!speedOf.has(row.step_id)) speedOf.set(row.step_id, {});
    speedOf.get(row.step_id)[row.speed] = row.status;
  }

  return {
    byMilestone,
    speedOf,
    statusOf:    new Map((progress.data ?? []).map((p) => [p.step_id, p.status])),
    tracksSpeed: new Map((meta.data ?? []).map((m) => [m.id, m.tracks_speed])),
  };
}

function renderPath(student, path, currentMilestone, cur) {
  const { byMilestone, speedOf, statusOf, tracksSpeed } = cur;

  $('path').innerHTML = path.length === 0
    ? '<p class="empty">No curriculum set for this batch yet.</p>'
    : path.map((m, i) => {
        const done = Number(m.percent_complete) === 100;
        const here = !done && m.milestone_id === currentMilestone?.milestone_id;
        const state = done ? 'is-complete' : here ? 'is-current' : '';
        const label = done ? 'Complete' : here ? 'In progress' : 'Upcoming';
        const mySteps = byMilestone.get(m.milestone_id) ?? [];
        const speedy  = tracksSpeed.get(m.milestone_id) === true;
        const stateOf = (id) => statusOf.get(id) ?? 'not_started';

        return `
          <div class="step ${state}" data-ms="${esc(m.milestone_id)}">
            <div class="dot">${done ? '✓' : i + 1}</div>
            <div class="step__main">
              <div class="name">${esc(m.name)}</div>
              <div class="meta">${m.total_steps > 0
                ? m.completed_steps + ' of ' + m.total_steps + ' steps'
                : esc(STATUS_LABEL[m.milestone_status] ?? 'Not started')}</div>
              ${mySteps.length === 0 ? '' : `
                <span class="boxes">
                  ${mySteps.map((st) => `<i class="box is-${stateOf(st.id)}" title="${esc(st.name)}"></i>`).join('')}
                </span>`}
            </div>
            <div class="badge">${label}</div>
          </div>
          ${mySteps.length === 0 ? '' : `
            <div class="step__detail" data-for="${esc(m.milestone_id)}" hidden>
              ${mySteps.map((st) => {
                const stat = stateOf(st.id);
                const sp = speedOf.get(st.id) ?? {};
                return `
                  <div class="substep">
                    <span class="substep__name">${esc(st.name)}</span>
                    ${speedy ? `
                      <span class="substep__speeds">
                        ${[1, 2, 3].map((n) => `<i class="box is-${sp[n] ?? 'not_started'}"></i>`).join('')}
                      </span>` : ''}
                    <span class="steplabel is-${stat}">${esc(STATUS_LABEL[stat])}</span>
                  </div>`;
              }).join('')}
            </div>`}`;
      }).join('');

  // Tap a milestone to see what is inside it.
  for (const row of $('path').querySelectorAll('.step[data-ms]')) {
    const detail = $('path').querySelector(`.step__detail[data-for="${CSS.escape(row.dataset.ms)}"]`);
    if (!detail) return;
    row.classList.add('is-tappable');
    row.addEventListener('click', () => {
      detail.hidden = !detail.hidden;
      row.classList.toggle('is-open', !detail.hidden);
    });
  }

}

// ---------------------------------------------------------------
// What Radhini set for the batch, and whether it is ticked off.
async function renderAssignment(student) {
  const { data } = await sb
    .from('assignment_done')
    .select('done, assignments ( year, week, task )')
    .eq('student_id', student.id)
    .limit(12);

  const weeks = (data ?? [])
    .filter((r) => r.assignments)
    .sort((a, b) => b.assignments.year - a.assignments.year || b.assignments.week - a.assignments.week);

  const latest = weeks[0];

  $('practiceCount').textContent = weeks.filter((w) => w.done).length;
  $('practiceTime').textContent  = latest ? 'Week ' + latest.assignments.week : '—';

  const box = $('assignmentBox');
  if (!box) return;

  box.innerHTML = !latest
    ? '<p class="empty">Nothing set yet.</p>'
    : `
      <p class="eyebrow">Week ${latest.assignments.week}</p>
      <p style="font-size:1rem; line-height:1.65; margin:6px 0 12px">${esc(latest.assignments.task)}</p>
      <span class="steplabel is-${latest.done ? 'complete' : 'not_started'}">${latest.done ? 'Done' : 'Not done yet'}</span>
      ${weeks.length < 2 ? '' : `
        <div style="margin-top:18px">
          ${weeks.slice(1).map((w) => `
            <div class="editrow" style="grid-template-columns:auto 1fr auto">
              <span class="muted" style="font-size:.72rem; min-width:62px">Week ${w.assignments.week}</span>
              <span style="font-size:.82rem">${esc(w.assignments.task)}</span>
              <span class="steplabel is-${w.done ? 'complete' : 'not_started'}">${w.done ? 'Done' : 'Not done'}</span>
            </div>`).join('')}
        </div>`}`;
}

// ---------------------------------------------------------------
// Every section, not just the one in progress. A student should be able
// to see where they stand on all of it.
function renderTracker(student, path, current, cur) {
  const { byMilestone, speedOf, statusOf, tracksSpeed } = cur;

  if (path.length === 0) {
    $('trackerTitle').textContent = 'Nothing set yet';
    $('stepGrid').innerHTML = '<p class="empty">Your teacher has not set up the syllabus yet.</p>';
    $('trackerNote').hidden = true;
    return;
  }

  $('trackerTitle').textContent = current ? current.name : 'Everything so far';

  $('stepGrid').innerHTML = path.map((m) => {
    const steps  = byMilestone.get(m.milestone_id) ?? [];
    const speedy = tracksSpeed.get(m.milestone_id) === true;
    const here   = current && m.milestone_id === current.milestone_id;

    // A section with no steps carries a status of its own.
    if (steps.length === 0) {
      const st = m.milestone_status ?? 'not_started';
      return `
        <section class="tsec ${here ? 'is-here' : ''}">
          <header class="tsec__head">
            <h4>${esc(m.name)}</h4>
            <span class="steplabel is-${st}">${esc(STATUS_LABEL[st])}</span>
          </header>
        </section>`;
    }

    const learnt = steps.filter((x) => (statusOf.get(x.id) ?? 'not_started') === 'complete').length;

    return `
      <section class="tsec ${here ? 'is-here' : ''}">
        <header class="tsec__head">
          <h4>${esc(m.name)}</h4>
          <span class="tsec__count">${learnt} of ${steps.length} learnt</span>
        </header>
        <div class="tsec__steps">
          ${steps.map((step) => {
            const st = statusOf.get(step.id) ?? 'not_started';
            const sp = speedOf.get(step.id) ?? {};
            return `
              <div class="tstep is-${st}">
                <span class="tstep__name">${esc(step.name)}</span>
                ${speedy ? `
                  <span class="tstep__speeds" title="First, second and third speed">
                    ${[1, 2, 3].map((n) => `<i class="box is-${sp[n] ?? 'not_started'}"></i>`).join('')}
                  </span>` : ''}
                <span class="steplabel is-${st}">${esc(STATUS_LABEL[st])}</span>
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }).join('');

  const totalSteps = path.reduce((n, m) => n + (byMilestone.get(m.milestone_id) ?? []).length, 0);
  const totalDone  = path.reduce((n, m) =>
    n + (byMilestone.get(m.milestone_id) ?? [])
          .filter((x) => (statusOf.get(x.id) ?? 'not_started') === 'complete').length, 0);

  $('trackerNote').hidden = false;
  $('trackerNote').innerHTML = totalSteps === 0
    ? '<strong>Nothing to tick off yet.</strong>'
    : `<strong>${totalDone} of ${totalSteps} learnt across every section.</strong> ` +
      (totalDone === totalSteps
        ? 'Every one of them. Wonderful.'
        : 'Amber means you are working on it; green means your teacher has marked it learnt.');
}

// ---------------------------------------------------------------
async function renderAssessment(student) {
  const { data } = await sb
    .from('assessments')
    .select('note, assessed_on')
    .eq('student_id', student.id)
    .not('note', 'is', null)
    .order('assessed_on', { ascending: false })
    .limit(10);

  const notes = data ?? [];

  if (notes.length === 0) {
    $('assessTitle').textContent = 'Nothing yet';
    $('assessBars').innerHTML =
      '<p class="empty">Notes from Radhini will appear here after your classes.</p>';
    $('assessNote').hidden = true;
    return;
  }

  $('assessTitle').textContent = notes.length === 1 ? 'From Radhini' : 'Notes from Radhini';
  $('assessBars').innerHTML = '';
  $('assessNote').hidden = false;
  $('assessNote').innerHTML = notes.map((n) => `
    <div class="note-entry">
      <span class="note-entry__date">${esc(n.assessed_on)}</span>
      <p>“${esc(n.note)}”</p>
    </div>`).join('');
}
