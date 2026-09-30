import { sb, requireSession } from './supabase-client.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Radhini's three, in her words. 'awaiting_assessment' is retired —
// 009 folded anything sitting there into 'practising'.
const STATUSES = [
  ['not_started', 'Not started'],
  ['practising',  'Progressing'],
  ['complete',    'Learnt'],
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

  $('batchFilter').addEventListener('change', () => { selected = null; drawRoster(); });
  $('studentPick').addEventListener('change', () => {
    selected = roster.find((s) => s.student_id === $('studentPick').value) ?? null;
    if (selected) openStudent(selected);
    else $('detail').innerHTML = '<div class="card"><p class="empty">Choose a student.</p></div>';
  });

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
  const shown = roster.filter((s) => !batch || s.batch_id === batch);

  $('studentPick').innerHTML =
    '<option value="">Choose a student…</option>' +
    shown.map((s) =>
      `<option value="${esc(s.student_id)}"${s.student_id === selected?.student_id ? ' selected' : ''}>` +
      `${esc(s.full_name)} · ${s.percent_complete ?? 0}%</option>`).join('');

  $('rosterCount').textContent = shown.length === roster.length
    ? `${roster.length} student${roster.length === 1 ? '' : 's'}`
    : `${shown.length} of ${roster.length}`;

  if (selected && !shown.some((s) => s.student_id === selected.student_id)) {
    selected = null;
    $('detail').innerHTML = '<div class="card"><p class="empty">Choose a student.</p></div>';
  }
}

// ---------------------------------------------------------------
async function openStudent(student) {
  $('detail').innerHTML = '<div class="card"><p class="empty">Loading…</p></div>';

  const [milestones, progress, assessments, badges, awarded, practice] = await Promise.all([
    sb.from('milestone_progress').select('*').eq('student_id', student.student_id).order('sort_order'),
    sb.from('progress').select('step_id, status').eq('student_id', student.student_id),
    sb.from('assessments').select('id, rhythm, precision_score, coordination, note, assessed_on, milestones ( name )')
      .eq('student_id', student.student_id).order('assessed_on', { ascending: false }).limit(5),
    sb.from('badges').select('id, name, icon').order('sort_order'),
    sb.from('student_badges').select('badge_id').eq('student_id', student.student_id),
    sb.from('practice_sessions').select('id, session_date, minutes, note')
      .eq('student_id', student.student_id).order('session_date', { ascending: false }).limit(8),
  ]);

  const path     = milestones.data ?? [];
  const statusOf = new Map((progress.data ?? []).map((p) => [p.step_id, p.status]));
  const held     = new Set((awarded.data ?? []).map((r) => r.badge_id));
  const totalMinutes = (practice.data ?? []).reduce((t, p) => t + (p.minutes ?? 0), 0);

  const [meta, speeds] = await Promise.all([
    sb.from('milestones').select('id, tracks_speed').eq('batch_id', student.batch_id),
    sb.from('step_speed').select('step_id, speed, status').eq('student_id', student.student_id),
  ]);

  const tracksSpeed = new Map((meta.data ?? []).map((m) => [m.id, m.tracks_speed]));

  // step_id -> { 1: status, 2: status, 3: status }
  const speedOf = new Map();
  for (const row of speeds.data ?? []) {
    if (!speedOf.has(row.step_id)) speedOf.set(row.step_id, {});
    speedOf.get(row.step_id)[row.speed] = row.status;
  }

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
             ${student.milestones_complete ?? 0} of ${student.milestones_total ?? 0} milestones</p>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">Progress</h3>
      <p class="muted" style="margin:-8px 0 14px">Changes save the moment you pick them.</p>
      ${stepsByMilestone.map(({ milestone, steps }) => {
        const speedy = tracksSpeed.get(milestone.milestone_id) === true;
        const stepState = (id) => statusOf.get(id) ?? 'not_started';
        return `
        <div class="ms" data-ms="${esc(milestone.milestone_id)}">
          <div class="ms__head" data-toggle="${esc(milestone.milestone_id)}">
            <span class="ms__chev">›</span>
            <h4>${esc(milestone.name)}</h4>
            <span class="boxes">
              ${steps.map((st) => `<i class="box is-${stepState(st.id)}" title="${esc(st.name)}"></i>`).join('')}
            </span>
            <span class="ms__pct">${steps.length ? milestone.completed_steps + '/' + milestone.total_steps : ''}</span>
          </div>

          <div class="ms__body" hidden>
            ${steps.length === 0
              ? `<div class="steprow" style="border-bottom:0">
                   <span class="sname muted">${esc(milestone.name)} as a whole</span>
                   <select data-milestone="${esc(milestone.milestone_id)}"
                           data-status="${esc(milestone.milestone_status ?? 'not_started')}">
                     ${STATUSES.map(([v, label]) =>
                       `<option value="${v}"${v === (milestone.milestone_status ?? 'not_started') ? ' selected' : ''}>${label}</option>`).join('')}
                   </select>
                 </div>`
              : steps.map((step) => {
                  const status = stepState(step.id);
                  if (!speedy) {
                    return `
                      <div class="steprow">
                        <span class="sname">${esc(step.name)}</span>
                        <select data-step="${esc(step.id)}" data-status="${status}">
                          ${STATUSES.map(([v, label]) =>
                            `<option value="${v}"${v === status ? ' selected' : ''}>${label}</option>`).join('')}
                        </select>
                      </div>`;
                  }
                  const sp = speedOf.get(step.id) ?? {};
                  return `
                    <div class="steprow steprow--speed">
                      <span class="sname">${esc(step.name)}</span>
                      <span class="speedset">
                        <span class="speedlbl">Speed</span>
                        ${[1, 2, 3].map((n) => {
                          const st = sp[n] ?? 'not_started';
                          return `<button class="box box--tap is-${st}"
                                          data-step="${esc(step.id)}" data-speed="${n}"
                                          data-status="${st}"
                                          title="Speed ${n} — ${STATUSES.find(([v]) => v === st)[1]}"
                                          aria-label="Speed ${n}, ${STATUSES.find(([v]) => v === st)[1]}"></button>`;
                        }).join('')}
                      </span>
                      <span class="steplabel is-${status}">${STATUSES.find(([v]) => v === status)[1]}</span>
                    </div>`;
                }).join('')}
          </div>
        </div>`;
      }).join('')}
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
      <h3 class="section-title">Practice log</h3>
      <p class="muted" style="margin:-8px 0 14px">
        ${totalMinutes >= 60
          ? Math.floor(totalMinutes / 60) + 'h ' + (totalMinutes % 60) + 'm'
          : totalMinutes + 'm'} across ${(practice.data ?? []).length} recorded session${(practice.data ?? []).length === 1 ? '' : 's'}.
      </p>
      <div class="formgrid">
        <div class="field">
          <label for="pDate">Date</label>
          <input id="pDate" type="date" value="${new Date().toISOString().slice(0, 10)}" />
        </div>
        <div class="field">
          <label for="pMinutes">Minutes</label>
          <input id="pMinutes" type="number" min="1" max="600" placeholder="e.g. 45" />
        </div>
        <div class="field">
          <label for="pNote">Note</label>
          <input id="pNote" placeholder="Optional" />
        </div>
      </div>
      <div class="row-end"><button class="btn btn--sm" id="addPractice">Add session</button></div>

      ${(practice.data ?? []).length === 0 ? '' : `
        <div style="margin-top:16px">
          ${practice.data.map((p) => `
            <div class="editrow" style="grid-template-columns:auto 1fr auto">
              <span class="muted" style="font-size:.78rem; min-width:92px">${esc(p.session_date)}</span>
              <span style="font-size:.82rem">${p.minutes ?? 0} min${p.note ? ' · ' + esc(p.note) : ''}</span>
              <button class="iconbtn danger" data-delpractice="${esc(p.id)}" title="Remove">✕</button>
            </div>`).join('')}
        </div>`}
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
  wirePractice(student);
}

// ---------------------------------------------------------------
const CYCLE = ['not_started', 'practising', 'complete'];

function paint(el, status) {
  el.classList.remove('is-not_started', 'is-practising', 'is-complete');
  el.classList.add('is-' + status);
  el.dataset.status = status;
}

function wireProgress(student) {
  // Expand a milestone to see its steps. Collapsed, the boxes on the
  // header already say where the student stands.
  for (const head of $('detail').querySelectorAll('.ms__head[data-toggle]')) {
    head.addEventListener('click', () => {
      const ms = head.closest('.ms');
      const body = ms.querySelector('.ms__body');
      body.hidden = !body.hidden;
      ms.classList.toggle('is-open', !body.hidden);
    });
  }

  // A speed box cycles: not started -> progressing -> learnt.
  for (const box of $('detail').querySelectorAll('.box--tap')) {
    box.addEventListener('click', async (e) => {
      e.stopPropagation();
      const previous = box.dataset.status;
      const next = CYCLE[(CYCLE.indexOf(previous) + 1) % CYCLE.length];

      paint(box, next);
      box.disabled = true;

      const { error } = await sb.from('step_speed').upsert({
        student_id: student.student_id,
        step_id:    box.dataset.step,
        speed:      Number(box.dataset.speed),
        status:     next,
        updated_by: me.id,
      }, { onConflict: 'student_id,step_id,speed' });

      box.disabled = false;
      if (error) {
        paint(box, previous);
        return toast('Could not save: ' + error.message, true);
      }

      // The database derives the step from its three speeds; reflect it.
      const row = box.closest('.steprow');
      const states = [...row.querySelectorAll('.box--tap')].map((b) => b.dataset.status);
      const derived = states.every((x) => x === 'complete') ? 'complete'
                    : states.some((x) => x !== 'not_started') ? 'practising'
                    : 'not_started';

      const label = row.querySelector('.steplabel');
      label.textContent = STATUSES.find(([v]) => v === derived)[1];
      paint(label, derived);

      const ms = box.closest('.ms');
      const idx = [...ms.querySelectorAll('.steprow')].indexOf(row);
      const headBox = ms.querySelectorAll('.ms__head .box')[idx];
      if (headBox) paint(headBox, derived);

      toast('Saved');
      await refreshRoster(student.student_id);
    });
  }

  for (const select of $('detail').querySelectorAll('select[data-milestone]')) {
    select.addEventListener('change', async () => {
      const previous = select.dataset.status;
      const status   = select.value;
      select.disabled = true;

      const { error } = await sb.from('milestone_status').upsert({
        student_id:   student.student_id,
        milestone_id: select.dataset.milestone,
        status,
        updated_by:   me.id,
      }, { onConflict: 'student_id,milestone_id' });

      select.disabled = false;
      if (error) {
        select.value = previous;
        toast('Could not save: ' + error.message, true);
        return;
      }
      select.dataset.status = status;
      toast('Saved');
      await refreshRoster(student.student_id);
    });
  }

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

      const ms = select.closest('.ms');
      const row = select.closest('.steprow');
      if (ms && row) {
        const idx = [...ms.querySelectorAll('.steprow')].indexOf(row);
        const headBox = ms.querySelectorAll('.ms__head .box')[idx];
        if (headBox) paint(headBox, status);
      }

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

function wirePractice(student) {
  $('addPractice').addEventListener('click', async () => {
    const minutes = Number($('pMinutes').value);
    if (!minutes || minutes < 1) return toast('How many minutes?', true);

    const { error } = await sb.from('practice_sessions').insert({
      student_id:   student.student_id,
      session_date: $('pDate').value || new Date().toISOString().slice(0, 10),
      minutes,
      note:         $('pNote').value.trim() || null,
    });

    if (error) return toast('Could not save: ' + error.message, true);
    toast('Session added');
    openStudent(student);
  });

  for (const button of $('detail').querySelectorAll('[data-delpractice]')) {
    button.addEventListener('click', async () => {
      const { error } = await sb.from('practice_sessions').delete().eq('id', button.dataset.delpractice);
      if (error) return toast('Could not remove: ' + error.message, true);
      toast('Session removed');
      openStudent(student);
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
