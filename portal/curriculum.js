import { sb, requireSession } from './supabase-client.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let batches = [];
let chosen  = null;
let showArchived = false;

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

  await loadBatches();
  $('addBatch').addEventListener('click', addBatch);
  $('newBatch').addEventListener('keydown', (e) => { if (e.key === 'Enter') addBatch(); });

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

// A delete that needs two clicks. Cheaper than a modal and, unlike
// window.confirm, it cannot wedge the page.
function arm(button, label, action) {
  button.addEventListener('click', async () => {
    if (button.dataset.armed !== '1') {
      button.dataset.armed = '1';
      button.classList.add('armed');
      button.textContent = label;
      clearTimeout(button._t);
      button._t = setTimeout(() => {
        button.dataset.armed = '0';
        button.classList.remove('armed');
        button.textContent = '✕';
      }, 4000);
      return;
    }
    clearTimeout(button._t);
    await action();
  });
}

// ---------------------------------------------------------------
async function loadBatches() {
  const { data, error } = await sb.from('batches').select('*').order('sort_order');
  if (error) return toast(error.message, true);
  batches = data ?? [];

  $('batchList').innerHTML = batches.map((b) => `
    <li>
      <button data-id="${esc(b.id)}" class="${b.id === chosen?.id ? 'is-active' : ''}">
        <span class="nm">${esc(b.name)}</span>
      </button>
    </li>`).join('') || '<li><p class="empty" style="padding:12px">No batches yet.</p></li>';

  for (const button of $('batchList').querySelectorAll('button[data-id]')) {
    button.addEventListener('click', () => {
      chosen = batches.find((b) => b.id === button.dataset.id);
      loadBatches();
      openBatch(chosen);
    });
  }
}

async function addBatch() {
  const name = $('newBatch').value.trim();
  if (!name) return;
  const sort = Math.max(0, ...batches.map((b) => b.sort_order)) + 1;
  const { error } = await sb.from('batches').insert({ name, sort_order: sort });
  if (error) return toast(error.message, true);
  $('newBatch').value = '';
  toast('Batch added');
  await loadBatches();
}

// ---------------------------------------------------------------
async function openBatch(batch) {
  const { data: milestones, error } = await sb
    .from('milestones').select('*').eq('batch_id', batch.id).order('sort_order');
  if (error) return toast(error.message, true);

  const visible = (milestones ?? []).filter((m) => showArchived || !m.archived);

  const withSteps = await Promise.all(visible.map((m) =>
    sb.from('steps').select('*').eq('milestone_id', m.id).order('sort_order')
      .then((r) => ({ ...m, steps: (r.data ?? []).filter((s) => showArchived || !s.archived) }))));

  $('detail').innerHTML = `
    <div class="card">
      <div class="detail__head">
        <div style="flex:1">
          <p class="eyebrow">Batch</p>
          <input id="batchName" value="${esc(batch.name)}"
                 style="font-family:var(--serif); font-size:1.5rem; color:var(--plum);
                        border:1px solid transparent; background:transparent;
                        border-radius:9px; padding:4px 8px; width:100%" />
          <p class="muted" style="margin-top:4px">Click the name to rename it.</p>
        </div>
        <button class="iconbtn danger" id="delBatch" title="Delete batch">✕</button>
      </div>
    </div>

    <div class="card">
      <div class="detail__head">
        <h3 class="section-title" style="margin:0">Milestones</h3>
        <label class="muted" style="font-size:.74rem; display:flex; gap:6px; align-items:center">
          <input type="checkbox" id="showArchived"${showArchived ? ' checked' : ''} /> show archived
        </label>
      </div>
      <p class="muted" style="margin:6px 0 14px">
        In the order students work through them. Edits save when you click away.
        Archiving hides something without touching anyone's records.
      </p>
      <div id="milestones">
        ${withSteps.length === 0
          ? '<p class="empty">No milestones yet. Add the first one below.</p>'
          : withSteps.map((m, i) => `
            <div class="ms">
              <div class="ms__head">
                <input class="msname" data-id="${esc(m.id)}" value="${esc(m.name)}"
                       style="font-family:var(--accent); font-size:.94rem; color:var(--plum);
                              background:transparent; border:1px solid transparent;
                              border-radius:8px; padding:5px 8px; flex:1" />
                <button class="iconbtn" data-up="${esc(m.id)}" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
                <button class="iconbtn" data-down="${esc(m.id)}" ${i === withSteps.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
                ${m.archived
                  ? `<button class="iconbtn" data-restorems="${esc(m.id)}" title="Restore">↩</button>
                     <button class="iconbtn danger" data-delms="${esc(m.id)}" title="Delete permanently">✕</button>`
                  : `<button class="iconbtn" data-archms="${esc(m.id)}" title="Archive">⊘</button>`}
              </div>
              <div class="ms__body">
                <input class="msdesc" data-id="${esc(m.id)}" value="${esc(m.description ?? '')}"
                       placeholder="Short description shown to students"
                       style="width:100%; font-size:.8rem; color:var(--ink-soft);
                              border:1px solid transparent; background:transparent;
                              border-radius:8px; padding:6px 8px; margin-bottom:8px" />
                ${m.steps.map((s, j) => `
                  <div class="editrow">
                    <input class="stname" data-id="${esc(s.id)}" value="${esc(s.name)}" />
                    <button class="iconbtn" data-stup="${esc(s.id)}" data-ms="${esc(m.id)}" ${j === 0 ? 'disabled' : ''}>↑</button>
                    <button class="iconbtn" data-stdown="${esc(s.id)}" data-ms="${esc(m.id)}" ${j === m.steps.length - 1 ? 'disabled' : ''}>↓</button>
                    ${s.archived
                      ? `<button class="iconbtn" data-restorest="${esc(s.id)}" title="Restore">↩</button>
                         <button class="iconbtn danger" data-delst="${esc(s.id)}" title="Delete permanently">✕</button>`
                      : `<button class="iconbtn" data-archst="${esc(s.id)}" title="Archive">⊘</button>`}
                  </div>`).join('')}
                <div class="addline">
                  <input class="newstep" data-ms="${esc(m.id)}" placeholder="Add a step — e.g. Tatta Adavu 5" />
                  <button class="btn btn--sm" data-addst="${esc(m.id)}">Add</button>
                </div>
              </div>
            </div>`).join('')}
      </div>

      <div class="addline">
        <input id="newMilestone" placeholder="Add a milestone — e.g. Jatiswaram" />
        <button class="btn btn--sm" id="addMilestone">Add</button>
      </div>
    </div>
  `;

  wireBatch(batch);
  wireMilestones(batch, withSteps);
}

// ---------------------------------------------------------------
function wireBatch(batch) {
  const name = $('batchName');
  name.addEventListener('blur', async () => {
    const value = name.value.trim();
    if (!value || value === batch.name) { name.value = batch.name; return; }
    const { error } = await sb.from('batches').update({ name: value }).eq('id', batch.id);
    if (error) { name.value = batch.name; return toast(error.message, true); }
    batch.name = value;
    toast('Renamed');
    await loadBatches();
  });

  arm($('delBatch'), 'Delete batch?', async () => {
    const { error } = await sb.from('batches').delete().eq('id', batch.id);
    if (error) return toast(error.message, true);
    chosen = null;
    $('detail').innerHTML = '<div class="card"><p class="empty">Batch deleted.</p></div>';
    toast('Batch deleted');
    await loadBatches();
  });
}

function wireMilestones(batch, milestones) {
  const root = $('detail');
  const reopen = () => openBatch(batch);

  // rename milestone / description / step, on blur
  const saveOnBlur = (selector, table, field) => {
    for (const input of root.querySelectorAll(selector)) {
      const original = input.value;
      input.addEventListener('blur', async () => {
        const value = input.value.trim();
        if (value === original) return;
        if (!value && field === 'name') { input.value = original; return; }
        const { error } = await sb.from(table).update({ [field]: value || null }).eq('id', input.dataset.id);
        if (error) { input.value = original; return toast(error.message, true); }
        toast('Saved');
      });
    }
  };
  saveOnBlur('.msname', 'milestones', 'name');
  saveOnBlur('.msdesc', 'milestones', 'description');
  saveOnBlur('.stname', 'steps',      'name');

  // reorder by swapping sort_order with the neighbour
  const swap = async (table, list, id, delta) => {
    const i = list.findIndex((x) => x.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = list[i], b = list[j];
    const { error } = await sb.from(table).upsert([
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ]);
    if (error) return toast(error.message, true);
    reopen();
  };

  for (const button of root.querySelectorAll('[data-up]'))
    button.addEventListener('click', () => swap('milestones', milestones, button.dataset.up, -1));
  for (const button of root.querySelectorAll('[data-down]'))
    button.addEventListener('click', () => swap('milestones', milestones, button.dataset.down, +1));

  for (const button of root.querySelectorAll('[data-stup], [data-stdown]')) {
    const up = button.hasAttribute('data-stup');
    const id = up ? button.dataset.stup : button.dataset.stdown;
    const steps = milestones.find((m) => m.id === button.dataset.ms)?.steps ?? [];
    button.addEventListener('click', () => swap('steps', steps, id, up ? -1 : +1));
  }

  const setArchived = (table, id, value) => async () => {
    const { error } = await sb.from(table).update({ archived: value }).eq('id', id);
    if (error) return toast(error.message, true);
    toast(value ? 'Archived' : 'Restored');
    reopen();
  };

  for (const button of root.querySelectorAll('[data-archms]'))
    button.addEventListener('click', setArchived('milestones', button.dataset.archms, true));
  for (const button of root.querySelectorAll('[data-restorems]'))
    button.addEventListener('click', setArchived('milestones', button.dataset.restorems, false));
  for (const button of root.querySelectorAll('[data-archst]'))
    button.addEventListener('click', setArchived('steps', button.dataset.archst, true));
  for (const button of root.querySelectorAll('[data-restorest]'))
    button.addEventListener('click', setArchived('steps', button.dataset.restorest, false));

  const toggle = root.querySelector('#showArchived');
  if (toggle) toggle.addEventListener('change', () => { showArchived = toggle.checked; reopen(); });

  // permanent deletes, only offered on something already archived
  for (const button of root.querySelectorAll('[data-delms]')) {
    arm(button, 'Erase + all progress?', async () => {
      const { error } = await sb.from('milestones').delete().eq('id', button.dataset.delms);
      if (error) return toast(error.message, true);
      toast('Milestone deleted');
      reopen();
    });
  }
  for (const button of root.querySelectorAll('[data-delst]')) {
    arm(button, 'Delete step?', async () => {
      const { error } = await sb.from('steps').delete().eq('id', button.dataset.delst);
      if (error) return toast(error.message, true);
      toast('Step deleted');
      reopen();
    });
  }

  // adds
  for (const button of root.querySelectorAll('[data-addst]')) {
    const id    = button.dataset.addst;
    const input = root.querySelector(`.newstep[data-ms="${CSS.escape(id)}"]`);
    const add = async () => {
      const name = input.value.trim();
      if (!name) return;
      const steps = milestones.find((m) => m.id === id)?.steps ?? [];
      const sort  = Math.max(0, ...steps.map((s) => s.sort_order)) + 1;
      const { error } = await sb.from('steps').insert({ milestone_id: id, name, sort_order: sort });
      if (error) return toast(error.message, true);
      toast('Step added');
      reopen();
    };
    button.addEventListener('click', add);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  }

  const addMilestone = async () => {
    const name = $('newMilestone').value.trim();
    if (!name) return;
    const sort = Math.max(0, ...milestones.map((m) => m.sort_order)) + 1;
    const { error } = await sb.from('milestones')
      .insert({ batch_id: batch.id, name, sort_order: sort });
    if (error) return toast(error.message, true);
    toast('Milestone added');
    reopen();
  };
  $('addMilestone').addEventListener('click', addMilestone);
  $('newMilestone').addEventListener('keydown', (e) => { if (e.key === 'Enter') addMilestone(); });
}
