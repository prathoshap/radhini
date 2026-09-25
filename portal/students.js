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
    .select('id, full_name, batch_id, joined_on, active, batches ( name )')
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
    batch_id:  $('nBatch').value || null,
    joined_on: new Date().toISOString().slice(0, 10),
  }).select().single();

  if (error) return toast(error.message, true);

  $('nName').value = '';
  toast('Student added');
  await load();
  chosen = students.find((s) => s.id === data.id);
  draw();
  open(chosen);
}

// ---------------------------------------------------------------
async function open(student) {
  $('detail').innerHTML = '<div class="card"><p class="empty">Loading…</p></div>';

  const { data: links, error } = await sb
    .from('guardianships')
    .select('profile_id, relation, profiles ( email, full_name )')
    .eq('student_id', student.id);

  if (error) return toast(error.message, true);

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
        <button class="iconbtn danger" id="delStudent" title="Delete student">✕</button>
        <button class="btn btn--sm" id="saveStudent">Save</button>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">Who can see this journey</h3>
      <p class="muted" style="margin:-8px 0 14px">
        The student themselves, or a parent. Anyone linked here sees this
        dancer's progress and nobody else's.
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
        They must already have an account. Invite them first from the Supabase
        dashboard: Authentication → Users → Add user.
      </p>
    </div>
  `;

  wire(student);
}

// ---------------------------------------------------------------
function wire(student) {
  $('saveStudent').addEventListener('click', async () => {
    const patch = {
      full_name: $('eName').value.trim(),
      batch_id:  $('eBatch').value || null,
      joined_on: $('eJoined').value || null,
      active:    $('eActive').value === 'true',
    };
    if (!patch.full_name) return toast('A name is required.', true);

    const { error } = await sb.from('students').update(patch).eq('id', student.id);
    if (error) return toast(error.message, true);
    toast('Saved');
    await load();
    chosen = students.find((s) => s.id === student.id);
    draw();
  });

  arm($('delStudent'), 'Delete + all records?', async () => {
    const { error } = await sb.from('students').delete().eq('id', student.id);
    if (error) return toast(error.message, true);
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
