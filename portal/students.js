import { sb, requireSession } from './supabase-client.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let students = [];
let batches  = [];
let chosen   = null;

const session = await requireSession();

$('signOut').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.replace('index.html');
});

await boot();

// ---------------------------------------------------------------
async function boot() {
  const { data: profile } = await sb
    .from('profiles').select('role').eq('id', session.user.id).maybeSingle();

  if (profile?.role !== 'instructor') {
    $('loading').innerHTML =
      '<div class="card"><p class="empty">This page is for the instructor.</p></div>';
    setTimeout(() => window.location.replace('app.html'), 1800);
    return;
  }

  const { data } = await sb.from('batches').select('id, name').order('sort_order');
  batches = data ?? [];
  $('nBatch').innerHTML = '<option value="">No batch yet</option>' +
    batches.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');

  $('search').addEventListener('input', draw);
  $('showInactive').addEventListener('change', draw);
  $('addStudent').addEventListener('click', addStudent);
  $('nName').addEventListener('keydown', (e) => { if (e.key === 'Enter') addStudent(); });

  await load();
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

function arm(button, label, action) {
  button.addEventListener('click', async () => {
    if (button.dataset.armed !== '1') {
      button.dataset.armed = '1';
      button.classList.add('armed');
      const was = button.textContent;
      button.dataset.was = was;
      button.textContent = label;
      clearTimeout(button._t);
      button._t = setTimeout(() => {
        button.dataset.armed = '0';
        button.classList.remove('armed');
        button.textContent = button.dataset.was;
      }, 4000);
      return;
    }
    clearTimeout(button._t);
    await action();
  });
}

// ---------------------------------------------------------------
async function load() {
  const { data, error } = await sb
    .from('students')
    .select('id, full_name, contact_email, batch_id, joined_on, active, batches ( name )')
    .order('full_name');
  if (error) return toast(error.message, true);
  students = data ?? [];
  draw();
}

function draw() {
  const term = $('search').value.trim().toLowerCase();
  const showInactive = $('showInactive').checked;

  const shown = students.filter((s) =>
    (showInactive || s.active) &&
    (!term || s.full_name.toLowerCase().includes(term)));

  $('list').innerHTML = shown.length === 0
    ? '<li><p class="empty" style="padding:14px">Nobody yet.</p></li>'
    : shown.map((s) => `
        <li>
          <button data-id="${esc(s.id)}" class="${s.id === chosen?.id ? 'is-active' : ''}">
            <span class="nm">${esc(s.full_name)}${s.active ? '' : ' · inactive'}</span>
            <span class="pc">${esc(s.batches?.name?.split('·').pop()?.trim() ?? '—')}</span>
          </button>
        </li>`).join('');

  $('count').textContent = `${shown.length} of ${students.length}`;

  for (const button of $('list').querySelectorAll('button[data-id]')) {
    button.addEventListener('click', () => {
      chosen = students.find((s) => s.id === button.dataset.id);
      draw();
      open(chosen);
    });
  }
}

async function addStudent() {
  const full_name = $('nName').value.trim();
  if (!full_name) return toast('Give the student a name.', true);

  const { data, error } = await sb.from('students').insert({
    full_name,
    contact_email: $('nEmail').value.trim().toLowerCase() || null,
    batch_id:      $('nBatch').value || null,
    joined_on:     new Date().toISOString().slice(0, 10),
  }).select().single();

  if (error) return toast(error.message, true);

  $('nName').value = '';
  $('nEmail').value = '';
  toast('Student added');
  await load();
  chosen = students.find((s) => s.id === data.id);
  draw();
  open(chosen);
}

// ---------------------------------------------------------------
async function open(student) {
  $('detail').innerHTML = '<div class="card"><p class="empty">Loading…</p></div>';

  const count = (table) => sb.from(table)
    .select('*', { count: 'exact', head: true })
    .eq('student_id', student.id).then((r) => r.count ?? 0);

  const [{ data: links, error }, nProgress, nAssess, nPractice, nBadges] = await Promise.all([
    sb.from('guardianships')
      .select('profile_id, relation, profiles ( email, full_name )')
      .eq('student_id', student.id),
    count('progress'), count('assessments'), count('practice_sessions'), count('student_badges'),
  ]);

  if (error) return toast(error.message, true);

  const records = nProgress + nAssess + nPractice + nBadges;
  const breakdown = [
    [nProgress, 'step' + (nProgress === 1 ? '' : 's') + ' of progress'],
    [nAssess,   'assessment' + (nAssess === 1 ? '' : 's')],
    [nPractice, 'practice session' + (nPractice === 1 ? '' : 's')],
    [nBadges,   'badge' + (nBadges === 1 ? '' : 's')],
  ].filter(([n]) => n > 0).map(([n, label]) => n + ' ' + label).join(', ');

  $('detail').innerHTML = `
    <div class="card">
      <p class="eyebrow">Student</p>
      <div class="formgrid" style="grid-template-columns:2fr 1fr; margin-top:8px">
        <div class="field">
          <label for="eName">Name</label>
          <input id="eName" value="${esc(student.full_name)}" />
        </div>
        <div class="field">
          <label for="eBatch">Batch</label>
          <select id="eBatch">
            <option value="">No batch</option>
            ${batches.map((b) => `<option value="${esc(b.id)}"${b.id === student.batch_id ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field" style="margin-top:10px">
        <label for="eEmail">Their email — they sign in with this</label>
        <input id="eEmail" type="email" value="${esc(student.contact_email ?? '')}"
               placeholder="nobody can sign in until this is set" />
      </div>
      <div class="formgrid" style="grid-template-columns:1fr 1fr; margin-top:10px">
        <div class="field">
          <label for="eJoined">Joined</label>
          <input id="eJoined" type="date" value="${esc(student.joined_on ?? '')}" />
        </div>
        <div class="field">
          <label for="eActive">Status</label>
          <select id="eActive">
            <option value="true"${student.active ? ' selected' : ''}>Active</option>
            <option value="false"${student.active ? '' : ' selected'}>Inactive</option>
          </select>
        </div>
      </div>
      <div class="row-end">
        <button class="btn btn--sm" id="saveStudent">Save</button>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">Who can see this journey</h3>
      <p class="muted" style="margin:-8px 0 14px">
        The address above is linked automatically the first time they sign in.
        Add someone here as well to give a second person access — a parent
        alongside an older student, say.
      </p>

      ${links.length === 0
        ? '<p class="empty">Nobody yet — this dancer\'s records are visible only to you.</p>'
        : `<div class="chips" style="flex-direction:column; align-items:stretch">
            ${links.map((l) => `
              <div class="editrow" style="grid-template-columns:1fr auto auto">
                <span>
                  <strong style="font-weight:500; font-size:.86rem">${esc(l.profiles?.email ?? 'unknown')}</strong>
                  <span class="muted" style="font-size:.74rem"> · ${esc(l.relation ?? 'linked')}</span>
                </span>
                <span></span>
                <button class="iconbtn danger" data-unlink="${esc(l.profile_id)}" title="Remove access">✕</button>
              </div>`).join('')}
          </div>`}

      <h3 class="section-title" style="margin-top:20px">Give someone access</h3>
      <div class="formgrid" style="grid-template-columns:2fr 1fr">
        <div class="field">
          <label for="lEmail">Their email</label>
          <input id="lEmail" type="email" placeholder="parent@example.com" />
        </div>
        <div class="field">
          <label for="lRelation">Relation</label>
          <select id="lRelation">
            <option value="parent">Parent</option>
            <option value="guardian">Guardian</option>
            <option value="self">The student</option>
          </select>
        </div>
      </div>
      <div class="row-end"><button class="btn btn--sm" id="link">Link</button></div>
      <p class="muted" style="font-size:.74rem; margin-top:10px">
        If they have never signed in, ask them to visit the portal once and
        enter this address — then link them here.
      </p>
    </div>

    <div class="card">
      <h3 class="section-title">If they are leaving</h3>

      <div class="leaving">
        <div>
          <strong style="font-weight:500; font-size:.88rem">Mark inactive</strong>
          <p class="muted" style="font-size:.78rem; margin:3px 0 0">
            They disappear from your lists and can no longer sign in, but
            everything is kept. Choose this unless you are certain — students
            come back, and this is undoable.
          </p>
        </div>
        <button class="btn btn--sm" id="deactivate" ${student.active ? '' : 'disabled'}>
          ${student.active ? 'Mark inactive' : 'Already inactive'}
        </button>
      </div>

      ${student.active ? '' : `
        <div class="leaving">
          <div>
            <strong style="font-weight:500; font-size:.88rem">Bring back</strong>
            <p class="muted" style="font-size:.78rem; margin:3px 0 0">
              Return them to the active list, with their history intact.
            </p>
          </div>
          <button class="btn btn--sm" id="reactivate">Make active</button>
        </div>`}

      <div class="leaving leaving--danger">
        <div>
          <strong style="font-weight:500; font-size:.88rem; color:#8a2b2b">Delete permanently</strong>
          <p class="muted" style="font-size:.78rem; margin:3px 0 0">
            ${records === 0
              ? 'Nothing is recorded against them yet, so nothing would be lost.'
              : 'Erases <strong>' + esc(breakdown) + '</strong> along with the dancer. This cannot be undone.'}
            ${links.length > 0 ? ' ' + links.length + ' family login' + (links.length === 1 ? '' : 's') + ' would lose access.' : ''}
          </p>
        </div>
        <button class="iconbtn danger" id="delStudent" title="Delete permanently">Delete</button>
      </div>

      <div class="confirm" id="delConfirm" hidden>
        <p style="margin:0 0 4px; font-size:.88rem">
          Permanently erase <strong>${esc(student.full_name)}</strong>${records === 0 ? '' : ' and ' + records + ' record' + (records === 1 ? '' : 's')}?
        </p>
        <p class="muted" style="margin:0 0 12px; font-size:.78rem">
          ${records === 0 ? 'Nothing is recorded against them.' : esc(breakdown) + '.'}
          There is no undo and no backup.
        </p>
        <div class="row-end" style="margin:0">
          <button class="btn btn--sm" id="delCancel"
                  style="background:transparent; color:var(--ink); border-color:var(--line)">Cancel</button>
          <button class="btn btn--sm" id="delYes"
                  style="background:#8a2b2b; border-color:#8a2b2b">Yes, erase permanently</button>
        </div>
      </div>
    </div>
  `;

  wire(student);
}

// ---------------------------------------------------------------
function wire(student) {
  $('saveStudent').addEventListener('click', async () => {
    const patch = {
      full_name:     $('eName').value.trim(),
      contact_email: $('eEmail').value.trim().toLowerCase() || null,
      batch_id:      $('eBatch').value || null,
      joined_on:     $('eJoined').value || null,
      active:        $('eActive').value === 'true',
    };
    if (!patch.full_name) return toast('A name is required.', true);

    const { error } = await sb.from('students').update(patch).eq('id', student.id);
    if (error) return toast(error.message, true);
    toast('Saved');
    await load();
    chosen = students.find((s) => s.id === student.id);
    draw();
  });

  const setActive = async (value) => {
    const { error } = await sb.from('students').update({ active: value }).eq('id', student.id);
    if (error) return toast(error.message, true);
    toast(value ? 'Back on the active list' : 'Marked inactive');
    await load();
    chosen = students.find((x) => x.id === student.id);
    draw();
    open(chosen);
  };
  $('deactivate')?.addEventListener('click', () => setActive(false));
  $('reactivate')?.addEventListener('click', () => setActive(true));

  $('delStudent').addEventListener('click', () => {
    $('delConfirm').hidden = false;
    $('delStudent').hidden = true;
    $('delYes').focus();
  });

  $('delCancel').addEventListener('click', () => {
    $('delConfirm').hidden = true;
    $('delStudent').hidden = false;
  });

  $('delYes').addEventListener('click', async () => {
    $('delYes').disabled = true;
    $('delYes').textContent = 'Erasing…';

    // .select() makes the result honest: a delete blocked by a policy
    // succeeds with no error and removes nothing.
    const { data, error } = await sb.from('students')
      .delete().eq('id', student.id).select('id');

    if (error) {
      $('delYes').disabled = false;
      $('delYes').textContent = 'Yes, erase permanently';
      return toast('Could not delete: ' + error.message, true);
    }
    if (!data || data.length === 0) {
      $('delYes').disabled = false;
      $('delYes').textContent = 'Yes, erase permanently';
      return toast('Nothing was deleted — you may not have permission.', true);
    }

    chosen = null;
    $('detail').innerHTML = '<div class="card"><p class="empty">Student deleted.</p></div>';
    toast('Student deleted');
    await load();
  });

  $('link').addEventListener('click', async () => {
    const email = $('lEmail').value.trim().toLowerCase();
    if (!email) return toast('Enter an email address.', true);

    const { data: profile, error: lookupError } = await sb
      .from('profiles').select('id').ilike('email', email).maybeSingle();

    if (lookupError) return toast(lookupError.message, true);
    if (!profile) {
      return toast('No account with that address yet — invite them first.', true);
    }

    const { error } = await sb.from('guardianships').insert({
      profile_id: profile.id,
      student_id: student.id,
      relation:   $('lRelation').value,
    });

    if (error) {
      return toast(error.code === '23505' ? 'Already linked.' : error.message, true);
    }
    toast('Access granted');
    open(student);
  });

  for (const button of $('detail').querySelectorAll('[data-unlink]')) {
    arm(button, 'Remove access?', async () => {
      const { error } = await sb.from('guardianships').delete()
        .eq('student_id', student.id).eq('profile_id', button.dataset.unlink);
      if (error) return toast(error.message, true);
      toast('Access removed');
      open(student);
    });
  }
}
