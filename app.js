'use strict';
const TOKEN_KEY = 'flagship_jwt_token';
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { user: null, projects: [], projectId: null, page: 'overview', flagPage: 1, search: '' };

async function api(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  const token = localStorage.getItem(TOKEN_KEY);
  if (opts.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', 'Bearer ' + token);
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 204) return null;
  const json = (res.headers.get('content-type') || '').includes('json');
  const data = json ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && (data.detail || data.title)) || 'HTTP ' + res.status);
  return data;
}

function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  $('#toast').append(el);
  setTimeout(() => el.remove(), 3500);
}

const NAV = [['overview', 'Dashboard'], ['flags', 'Feature Flags']];
const TODO = 'This page has not been converted yet. Original: src/pages/';

function renderNav() {
  $('#nav').innerHTML = NAV.map(([id, label]) =>
    `<a data-id="${id}" class="${state.page === id ? 'on' : ''}">${label}</a>`).join('');
}

async function renderOverview() {
  const d = await api('/api/v1/analytics/overview');
  const k = d.kpis;
  const items = [['Projects', k.totalProjects], ['Flags', k.totalFlags], ['Enabled', k.enabledFlags],
    ['Active rollouts', k.activeRollouts], ['Pending approvals', k.pendingApprovals], ['SDKs', k.connectedSdks]];
  $('#view').innerHTML = `<h1>Dashboard</h1>
    <div class="kpis">${items.map(([l, v]) => `<div class="card kpi"><span class="muted">${l}</span><b>${esc(v)}</b></div>`).join('')}</div>
    <div class="card"><h3>Rollout activity</h3><table><tr><th>Flag</th><th>Env</th><th>Rollout</th><th>State</th></tr>
    ${d.rolloutActivity.map((r) => `<tr><td><code>${esc(r.flagKey)}</code></td><td>${esc(r.environment)}</td>
    <td>${esc(r.rolloutPercentage)}%</td><td>${r.killSwitchActive ? '<span class="error">killed</span>' : r.enabled ? '<span class="on-t">on</span>' : '<span class="off-t">off</span>'}</td></tr>`).join('')}
    </table></div>`;
}

async function renderFlags() {
  const qs = new URLSearchParams({ projectId: state.projectId, page: state.flagPage, size: 12, archived: false });
  if (state.search) qs.set('search', state.search);
  const { items, total } = await api('/api/v1/flags?' + qs);
  $('#view').innerHTML = `<h1>Feature Flags <span class="muted">(${total})</span></h1>
    <div class="bar"><input id="q" placeholder="Search flags" value="${esc(state.search)}">
    <button class="btn ghost" id="prev">Prev</button><button class="btn ghost" id="next">Next</button></div>
    <div class="card"><table><tr><th>Name</th><th>Key</th><th>Type</th><th>Environments</th></tr>
    ${items.map((f) => `<tr><td>${esc(f.name)}</td><td><code>${esc(f.key)}</code></td><td><span class="tag">${esc(f.type)}</span></td>
    <td>${(f.configurations || []).map((c) => `<button class="btn ${c.kill_switch_active ? 'bad' : 'ghost'}" data-flag="${f.id}" data-env="${c.environment_id}" data-killed="${c.kill_switch_active}">
    ${esc(c.env_name)}: ${c.kill_switch_active ? 'KILLED' : c.enabled ? 'on' : 'off'}</button>`).join(' ')}</td></tr>`).join('')}
    </table></div>`;
  $('#q').onchange = (e) => { state.search = e.target.value.trim(); state.flagPage = 1; show(); };
  $('#prev').onclick = () => { if (state.flagPage > 1) { state.flagPage--; show(); } };
  $('#next').onclick = () => { if (state.flagPage * 12 < total) { state.flagPage++; show(); } };
  $('#view').querySelectorAll('[data-flag]').forEach((b) => b.onclick = async () => {
    const killed = b.dataset.killed === '1' || b.dataset.killed === 'true';
    if (!confirm(killed ? 'Clear kill switch?' : 'Activate kill switch?')) return;
    try {
      await api(`/api/v1/flags/${b.dataset.flag}/toggle-kill-switch`, { method: 'POST', body: JSON.stringify({
        environmentId: Number(b.dataset.env), killSwitchActive: !killed,
        reason: killed ? 'Operator cleared kill switch' : 'Operator triggered emergency kill switch' }) });
      toast('Kill switch updated'); show();
    } catch (e) { toast(e.message); }
  });
}

async function show() {
  renderNav();
  try {
    if (state.page === 'overview') await renderOverview();
    else await renderFlags();
  } catch (e) { $('#view').innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}

async function enter(user) {
  state.user = user;
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#user').textContent = `${user.name} · ${user.role}`;
  const { items } = await api('/api/v1/projects');
  state.projects = items;
  state.projectId = items[0] && items[0].id;
  $('#project').innerHTML = items.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  show();
}

function showLogin() {
  localStorage.removeItem(TOKEN_KEY);
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const res = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#email').value, password: $('#password').value }) });
    localStorage.setItem(TOKEN_KEY, res.token);
    await enter(res.user);
  } catch (err) { $('#loginError').textContent = err.message; }
};
$('#nav').onclick = (e) => { const id = e.target.dataset.id; if (id) { state.page = id; show(); } };
$('#project').onchange = (e) => { state.projectId = Number(e.target.value); state.flagPage = 1; show(); };
$('#logout').onclick = showLogin;
$('#theme').onclick = () => document.documentElement.classList.toggle('dark');

(async () => {
  if (!localStorage.getItem(TOKEN_KEY)) return showLogin();
  try { const { user } = await api('/api/v1/auth/me'); await enter(user); } catch { showLogin(); }
})();
