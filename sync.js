// Cloud sync over the Supabase REST API. The device stays the working copy, so the app keeps working offline.
// Requires supabase-setup.sql to have been run on the project.
globalThis.Sync = (() => {
  // Fill these once the project exists so that partners only need to sign in.
  const PROJECT = {
    url: 'https://urrnczuenavufxrqypum.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycm5jenVlbmF2dWZ4cnF5cHVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNTUyNzksImV4cCI6MjEwOTgzMTI3OX0.ceN997ahd4H78jPULloaWmHr8EVO2kYrWCat160M330'
  };
  const STORE = 'plastika-sync', BATCH = 400, PAGE = 1000, OVERLAP_MS = 10000, POLL_MS = 15000;
  const LABELS = { idle: 'متزامن', syncing: 'جارٍ المزامنة', offline: 'بدون نت', error: 'خطأ بالمزامنة', auth: 'سجّل الدخول' };

  let s = read(), state = 'off', message = '', running = false, again = false, timer = null, pendingRender = false;

  function read() {
    let o = {};
    try { o = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { /* first run */ }
    return { url: '', key: '', email: '', access: '', refresh: '', expires: 0, cursor: '', lastPush: 0, ...o };
  }
  function write() { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* storage blocked */ } }
  const projectUrl = () => PROJECT.url || s.url;
  const projectKey = () => PROJECT.key || s.key;
  const connected = () => !!(s.refresh && projectUrl() && projectKey());

  function setState(v, m = '') {
    state = v; message = m;
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.sync-badge').forEach(el => { el.textContent = LABELS[v] || ''; el.dataset.s = v; });
    const st = document.querySelector('#syncMsg');
    if (st) st.textContent = m;
  }

  class SyncError extends Error { constructor(kind, msg) { super(msg); this.kind = kind; } }

  async function authRequest(body, grant) {
    let r;
    try {
      r = await fetch(`${projectUrl()}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { apikey: projectKey(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) { throw new SyncError('offline', 'تعذر الوصول إلى الخادم'); }
    if (!r.ok) throw new SyncError('auth', grant === 'password' ? 'البريد أو كلمة المرور غير صحيحة' : 'انتهت الجلسة، سجّل الدخول من جديد');
    const j = await r.json();
    s.access = j.access_token; s.refresh = j.refresh_token; s.expires = Date.now() + j.expires_in * 1000;
    write();
  }
  async function token() {
    if (Date.now() > s.expires - 60000) await authRequest({ refresh_token: s.refresh }, 'refresh_token');
    return s.access;
  }
  async function api(path, opts = {}) {
    const t = await token();
    let r;
    try {
      r = await fetch(projectUrl() + path, { ...opts, headers: { apikey: projectKey(), Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' } });
    } catch (e) { throw new SyncError('offline', 'لا يوجد اتصال، التعديلات محفوظة وسترفع لاحقاً'); }
    if (r.status === 401 || r.status === 403) throw new SyncError('error', 'هذا البريد غير مضاف لأعضاء الشركة بقاعدة البيانات');
    if (!r.ok) throw new SyncError('error', 'خطأ من الخادم (' + r.status + ')');
    return r.status === 204 ? null : r.json();
  }

  function changedItems() {
    const items = [];
    Core.COLLS.forEach(c => db[c].forEach(x => { if ((x.updatedAt || 0) > s.lastPush) items.push({ key: `${c}:${x.id}`, data: x, client_updated: x.updatedAt }); }));
    if ((db.settings.updatedAt || 0) > s.lastPush) {
      const { lastBackup, ...shared } = db.settings;
      items.push({ key: 'settings:main', data: shared, client_updated: db.settings.updatedAt });
    }
    return items;
  }
  async function push() {
    const items = changedItems();
    for (let i = 0; i < items.length; i += BATCH) {
      await api('/rest/v1/rpc/push_records', { method: 'POST', body: JSON.stringify({ items: items.slice(i, i + BATCH) }) });
    }
    if (items.length) { s.lastPush = Math.max(s.lastPush, ...items.map(x => x.client_updated)); write(); }
  }

  function applyRow(row) {
    const i = row.key.indexOf(':'), coll = row.key.slice(0, i), id = row.key.slice(i + 1);
    if (coll === 'settings') {
      if (row.client_updated <= (db.settings.updatedAt || 0)) return false;
      db.settings = { ...db.settings, ...row.data };
      return true;
    }
    if (!Core.COLLS.includes(coll)) return false;
    const at = db[coll].findIndex(x => x.id === id);
    if (at < 0) { db[coll].push(row.data); return true; }
    if ((db[coll][at].updatedAt || 0) >= row.client_updated) return false;
    db[coll][at] = row.data;
    return true;
  }
  async function pull() {
    let changed = false, newest = s.cursor, offset = 0, rows;
    const since = s.cursor ? `&synced_at=gte.${encodeURIComponent(new Date(new Date(s.cursor).getTime() - OVERLAP_MS).toISOString())}` : '';
    do {
      rows = await api(`/rest/v1/records?select=key,data,client_updated,synced_at${since}&order=synced_at.asc,key.asc&limit=${PAGE}&offset=${offset}`);
      rows.forEach(r => { if (applyRow(r)) changed = true; newest = r.synced_at; });
      offset += PAGE;
    } while (rows.length === PAGE);
    if (newest !== s.cursor) { s.cursor = newest; write(); }
    return changed;
  }

  function refreshScreen() {
    if (typeof document === 'undefined') return;
    const a = document.activeElement;
    if (a && a.closest && a.closest('#view') && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { pendingRender = true; return; }
    pendingRender = false;
    render();
  }

  async function run() {
    if (!connected()) return false;
    if (running) { again = true; return false; }
    running = true;
    let ok = false;
    try {
      setState('syncing');
      await push();
      const changed = await pull();
      if (changed) { await saveNow(); refreshScreen(); } else if (pendingRender) refreshScreen();
      setState('idle', 'آخر مزامنة: ' + new Date().toLocaleTimeString('en-GB'));
      ok = true;
    } catch (e) {
      setState(e.kind || 'error', e.message);
    }
    running = false;
    if (again) { again = false; return run(); }
    return ok;
  }

  let debounce = null;
  const schedule = () => { if (!connected()) return; clearTimeout(debounce); debounce = setTimeout(run, 1200); };

  function start(runNow = true) {
    if (!connected()) return;
    if (runNow) run();
    if (timer) return;
    timer = setInterval(() => { if (!document.hidden) run(); }, POLL_MS);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
  }

  async function login({ url, key, email, password }) {
    const prev = { ...s };
    if (!PROJECT.url) {
      s.url = String(url || '').trim().replace(/\/+$/, '');
      s.key = String(key || '').trim();
      if (!/^https?:\/\/.+/.test(s.url) || !s.key) { s = prev; throw new SyncError('error', 'تحقق من رابط المشروع والمفتاح'); }
    }
    try {
      await authRequest({ email: email.trim(), password }, 'password');
    } catch (e) { s = prev; write(); throw e; }
    s.email = email.trim(); s.cursor = ''; s.lastPush = 0;
    write();
    const ok = await run();
    if (!ok && state === 'error') { const m = message; logout(); throw new SyncError('error', m); }
    start(false);
  }

  function logout() {
    s = { ...s, email: '', access: '', refresh: '', expires: 0, cursor: '', lastPush: 0 };
    write();
    clearInterval(timer); timer = null;
    setState('off');
  }

  return {
    login, logout, run, schedule, start, connected,
    needsProject: () => !PROJECT.url,
    email: () => s.email,
    status: () => ({ state, label: LABELS[state] || '', message }),
    resendAll() { s.lastPush = 0; write(); schedule(); }
  };
})();
