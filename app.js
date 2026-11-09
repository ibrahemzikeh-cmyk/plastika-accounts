// UI layer. All calculations live in core.js.
const C = window.Core;
const { r2, live, byId, docTotal, sign, monthRange } = C;
const $ = (s, r = document) => r.querySelector(s);
const dlg = $('#dlg');
let db = C.blank();
let view = 'home';
let submitFn = null;
const ui = { month: ym(), q: '', cat: '', contactTab: 'customer', repFrom: '', repTo: '', distMonth: prevYm() };

function today() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function ym() { return today().slice(0, 7); }
function shiftYm(m, by) { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + by, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function prevYm() { return shiftYm(ym(), -1); }
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const ymName = m => MONTHS[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
const monthOpts = (val, n = 36) => Array.from({ length: n }, (_, i) => shiftYm(ym(), -i)).map(m => `<option value="${m}" ${m === val ? 'selected' : ''}>${ymName(m)}</option>`).join('');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => (+n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const money = n => `<span class="num">${num(n)} ${esc(db.settings.currency)}</span>`;
const plain = n => `${num(n)} ${db.settings.currency}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400); };

// ---------- storage ----------
const IDB = {
  open: () => new Promise((ok, no) => { const r = indexedDB.open('plastika', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }),
  async get() { const d = await IDB.open(); return new Promise((ok, no) => { const r = d.transaction('kv').objectStore('kv').get('db'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); },
  async put(v) { const d = await IDB.open(); return new Promise((ok, no) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, 'db'); t.oncomplete = ok; t.onerror = () => no(t.error); }); }
};
async function saveNow() {
  try { await IDB.put(JSON.parse(JSON.stringify(db))); }
  catch (e) { try { localStorage.setItem('plastika', JSON.stringify(db)); } catch (e2) { toast('تعذر حفظ البيانات على هذا الجهاز'); } }
}
function save() { saveNow(); render(); Sync.schedule(); }
async function load() {
  let d = null;
  try { d = await IDB.get(); } catch (e) { /* fall back below */ }
  if (!d) { try { d = JSON.parse(localStorage.getItem('plastika') || 'null'); } catch (e) { /* no saved data */ } }
  if (d && C.isValidBackup(d)) { const b = C.blank(); db = { ...b, ...d, settings: { ...b.settings, ...d.settings } }; }
}
function upsert(coll, rec) {
  const now = Date.now();
  if (rec.id) { const i = db[coll].findIndex(x => x.id === rec.id); db[coll][i] = { ...db[coll][i], ...rec, updatedAt: now }; return db[coll][i]; }
  const n = { ...rec, id: uid(), createdAt: now, updatedAt: now };
  db[coll].push(n); return n;
}
function removeRec(coll, id) { const r = db[coll].find(x => x.id === id); if (r) Object.keys(r).forEach(k => { if (!['id', 'createdAt'].includes(k)) delete r[k]; }); if (r) { r.deleted = true; r.updatedAt = Date.now(); } }

// ---------- icons / nav ----------
const P = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6', sales: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4', buy: 'M3 4h2l2.4 12h11l2-8H6.4M9 21h.01M18 21h.01',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8', users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  money: 'M3 6h18v12H3zM12 15a3 3 0 100-6 3 3 0 000 6M6 9v.01M18 15v.01', exp: 'M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6', part: 'M8 12a4 4 0 100-8 4 4 0 000 8M16 12a4 4 0 100-8 4 4 0 000 8M2 21c0-4 3-6 6-6s6 2 6 6M14 15.5c3.5-1 8 1 8 5.5',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 00-2 .4 1.7 1.7 0 00-.6 1.3H11a1.7 1.7 0 00-.6-1.3 1.7 1.7 0 00-2-.4l-.2.1-2-3.4.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1V10a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1 2-3.4.2.1a1.7 1.7 0 002-.4A1.7 1.7 0 0011 2h4a1.7 1.7 0 00.6 1.3 1.7 1.7 0 002 .4l.2-.1 2 3.4-.1.1a1.7 1.7 0 00-.3 1.9 1.7 1.7 0 001.5 1v4a1.7 1.7 0 00-1.5 1z', more: 'M4 6h16M4 12h16M4 18h16'
};
const icon = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n]}"/></svg>`;
const NAV = [['home', 'الرئيسية', 'home'], ['sales', 'المبيعات', 'sales'], ['purchases', 'المشتريات', 'buy'], ['products', 'المنتجات والأسعار', 'box'], ['contacts', 'العملاء والموردون', 'users'], ['expenses', 'المصاريف', 'exp'], ['cash', 'الصندوق', 'money'], ['partners', 'الشركاء والأرباح', 'part'], ['reports', 'التقارير', 'chart'], ['settings', 'الإعدادات', 'gear']];
const BOTTOM = [['home', 'الرئيسية', 'home'], ['sales', 'المبيعات', 'sales'], ['products', 'المنتجات', 'box'], ['partners', 'الشركاء', 'part']];

const badge = () => { const st = Sync.status(); return `<span class="sync-badge" data-s="${st.state}">${st.label}</span>`; };
function renderNav() {
  $('#side').innerHTML = `<div class="brand"><img src="icons/icon-192.png" alt=""><div>${esc(db.settings.company)}<br>${badge()}</div></div>` + NAV.map(([v, t, i]) => `<button class="nav ${v === view ? 'on' : ''}" data-act="go" data-v="${v}">${icon(i)}${t}</button>`).join('');
  const inBottom = BOTTOM.some(b => b[0] === view);
  $('#bottom').innerHTML = BOTTOM.map(([v, t, i]) => `<button class="${v === view ? 'on' : ''}" data-act="go" data-v="${v}">${icon(i)}${t}</button>`).join('') + `<button class="${inBottom ? '' : 'on'}" data-act="moreMenu">${icon('more')}المزيد</button>`;
}
function render() { renderNav(); $('#view').innerHTML = Views[view](); }

const header = (title, btns = '') => `<div class="head"><h1>${title}</h1><div class="btns">${btns}</div></div>`;
const empty = t => `<div class="empty">${t}</div>`;
const f = (label, name, val = '', type = 'text', extra = '') => `<label class="f">${label}<input name="${name}" type="${type}" value="${esc(val)}" ${type === 'number' ? 'step="any" inputmode="decimal"' : ''} ${extra}></label>`;
const sel = (label, name, opts, val, extra = '') => `<label class="f">${label}<select name="${name}" ${extra}>${opts.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select></label>`;
const area = (label, name, val = '') => `<label class="f">${label}<textarea name="${name}">${esc(val)}</textarea></label>`;

function modal(title, body, onSubmit, foot = '') {
  submitFn = onSubmit;
  dlg.innerHTML = `<form id="mf" novalidate><div class="dh"><h2 style="margin:0">${title}</h2><button type="button" data-act="close" aria-label="إغلاق">×</button></div><div class="db">${body}<p class="err" id="err"></p></div>
  ${onSubmit || foot ? `<div class="df">${onSubmit ? '<button class="btn pri">حفظ</button>' : ''}${foot}</div>` : ''}</form>`;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}
const closeModal = () => dlg.close();
const fail = m => { $('#err').textContent = m; $('#err').scrollIntoView({ block: 'nearest' }); return false; };
const formData = () => Object.fromEntries(new FormData($('#mf')).entries());
const delBtn = (coll, id) => id ? `<button type="button" class="btn danger" data-act="del" data-c="${coll}" data-id="${id}">حذف</button>` : '';

// ---------- constants ----------
const CATS = ['منتج جاهز', 'قطعة', 'تصميم', 'طابعة 3D', 'فيلامنت', 'إكسسوار', 'خدمة طباعة'];
const UNITS = ['قطعة', 'كغ', 'غرام', 'بكرة', 'ساعة', 'متر'];
const EXP_CATS = ['كهرباء', 'إيجار', 'صيانة وقطع', 'شحن وتوصيل', 'إعلانات', 'رواتب', 'تغليف', 'إنترنت واتصالات', 'أخرى'];
const ASSET_CAT = 'شراء معدات وأصول';

// ---------- views ----------
const Views = {
  home() {
    const [from, to] = monthRange(ym());
    const p = C.pl(db, from, to), d = C.debts(db), c = C.cash(db), st = C.stock(db);
    const low = live(db, 'products').filter(x => x.track !== false && +x.minStock > 0 && st[x.id].qty <= +x.minStock);
    const isEmpty = !live(db, 'products').length && !live(db, 'sales').length;
    const second = db.settings.currency2 && +db.settings.rate ? `<small class="num">${num(p.net * db.settings.rate)} ${esc(db.settings.currency2)}</small>` : '';
    const stale = !isEmpty && Date.now() - (db.settings.lastBackup || 0) > 7 * 864e5;
    return `<div class="head"><div class="head-l"><img class="logo" src="icons/icon-192.png" alt="شعار بلاستيكة"><div><h1>${esc(db.settings.company)}</h1><span class="hint">${ymName(ym())}</span> ${badge()}</div></div></div>
    ${isEmpty ? `<div class="card"><h2>أهلاً بك 👋</h2><p class="hint">ابدأ بإضافة منتجاتك وشركائك، أو جرّب البرنامج ببيانات تجريبية.</p><div class="btns"><button class="btn pri" data-act="go" data-v="products">إضافة منتجات</button>${Sync.connected() ? '' : '<button class="btn" data-act="demo">تحميل بيانات تجريبية</button>'}</div></div>` : ''}
    ${stale ? `<div class="note">لم تأخذ نسخة احتياطية منذ أكثر من أسبوع. <a href="#" data-act="backup" style="color:var(--orange)">خذ نسخة الآن</a></div>` : ''}
    <div class="quick">
      <button class="btn pri" data-act="newDoc" data-k="sale">${icon('sales')}بيع</button>
      <button class="btn" data-act="newDoc" data-k="purchase">${icon('buy')}شراء</button>
      <button class="btn" data-act="expense">${icon('exp')}مصروف</button>
      <button class="btn" data-act="payment">${icon('money')}قبض/دفع</button>
    </div>
    <div class="kpis">
      <div class="kpi hero"><span>صافي ربح الشهر</span><b class="${p.net < 0 ? 'neg' : ''}">${money(p.net)}</b>${second}</div>
      <div class="kpi"><span>مبيعات الشهر</span><b>${money(p.sales)}</b><small>${p.count} فاتورة</small></div>
      <div class="kpi"><span>الصندوق</span><b>${money(c)}</b></div>
      <div class="kpi"><span>قيمة المخزون</span><b>${money(C.inventoryValue(db))}</b></div>
      <div class="kpi"><span>لنا عند الزبائن</span><b>${money(d.receivable)}</b></div>
      <div class="kpi"><span>علينا للموردين</span><b>${money(d.payable)}</b></div>
    </div>
    <div class="card chart"><div class="head" style="margin-bottom:6px"><h2 style="margin:0">آخر 6 أشهر</h2><div class="legend"><span><i style="background:${CH.a}"></i>المبيعات</span><span><i style="background:${CH.b}"></i>صافي الربح</span></div></div>${chart()}<div class="readout" id="readout">اضغط على أي شهر لعرض أرقامه</div></div>
    ${low.length ? `<div class="card"><h2>مخزون منخفض</h2><div class="rows">${low.map(x => `<div><span>${esc(x.name)}</span><span class="warn num">${num(st[x.id].qty)} ${esc(x.unit)}</span></div>`).join('')}</div></div>` : ''}`;
  },

  sales: () => docList('sale'),
  purchases: () => docList('purchase'),

  products() {
    const st = C.stock(db), q = ui.q.trim().toLowerCase();
    const ps = live(db, 'products').filter(p => (!ui.cat || p.category === ui.cat) && (!q || (p.name + ' ' + (p.sku || '')).toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const moves = [...live(db, 'productions').map(x => ({ ...x, c: 'productions' })), ...live(db, 'adjustments').map(x => ({ ...x, c: 'adjustments' }))].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 15);
    const pname = id => (byId(db, 'products', id) || {}).name || '—';
    return header('المنتجات والأسعار', `<button class="btn pri" data-act="product">+ منتج</button><button class="btn" data-act="production">طباعة/إنتاج</button><button class="btn" data-act="adjust">تعديل جرد</button>`) + `
    <div class="filters"><input placeholder="بحث بالاسم أو الرمز" value="${esc(ui.q)}" data-filter="q" aria-label="بحث"><select data-filter="cat" aria-label="التصنيف"><option value="">كل التصنيفات</option>${CATS.map(c => `<option ${c === ui.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="list">${ps.map(p => {
      const s = st[p.id], lowS = p.track !== false && +p.minStock > 0 && s.qty <= +p.minStock;
      return `<button class="item" data-act="product" data-id="${p.id}"><div><b>${esc(p.name)}</b><span class="sub">${esc(p.category || '')}${p.track !== false ? ` · التكلفة ${money(s.avg)}` : ''}</span>
      ${p.track !== false ? `<span class="tag ${lowS ? 'alert' : ''}">المخزون: <span class="num">${num(s.qty)}</span> ${esc(p.unit)}</span>` : '<span class="tag">بدون مخزون</span>'}</div>
      <div class="end"><b>${money(p.retail)}</b><span class="sub">جملة ${money(p.wholesale)}</span></div></button>`;
    }).join('') || empty('لا توجد منتجات بعد')}</div>
    ${moves.length ? `<h2 style="margin-top:18px">آخر حركات الإنتاج والجرد</h2><div class="list">${moves.map(m => `<div class="item static"><div><b>${m.c === 'productions' ? 'إنتاج: ' + esc(pname(m.pid)) : 'جرد: ' + esc(pname(m.pid))}</b><span class="sub num">${m.date}</span><span class="sub">${m.c === 'productions' ? `استهلاك ${num(m.matQty)} ${esc((byId(db, 'products', m.matPid) || {}).unit || '')} من ${esc(pname(m.matPid))}` : esc(m.reason || '')}</span></div><div class="end"><b class="num">${m.qty > 0 ? '+' : ''}${num(m.qty)}</b><br><button class="btn danger" style="min-height:36px;padding:2px 10px" data-act="del" data-c="${m.c}" data-id="${m.id}">حذف</button></div></div>`).join('')}</div>` : ''}`;
  },

  contacts() {
    const k = ui.contactTab, q = ui.q.trim().toLowerCase();
    const cs = live(db, 'contacts').filter(c => c.kind === k && (!q || (c.name + (c.phone || '')).toLowerCase().includes(q))).map(c => ({ ...c, bal: C.contactBalance(db, c) })).sort((a, b) => b.bal - a.bal);
    return header('العملاء والموردون', `<button class="btn pri" data-act="contact">+ جديد</button><button class="btn" data-act="payment">قبض/دفع</button>`) + `
    <div class="filters"><select data-filter="contactTab" aria-label="النوع"><option value="customer" ${k === 'customer' ? 'selected' : ''}>الزبائن</option><option value="supplier" ${k === 'supplier' ? 'selected' : ''}>الموردون</option></select><input placeholder="بحث" value="${esc(ui.q)}" data-filter="q" aria-label="بحث"></div>
    <div class="list">${cs.map(c => `<button class="item" data-act="statement" data-id="${c.id}"><div><b>${esc(c.name)}</b><span class="sub num">${esc(c.phone || '')}</span></div><div class="end"><b class="${c.bal > 0 ? 'warn' : ''}">${money(c.bal)}</b><span class="sub">${c.bal > 0 ? (k === 'customer' ? 'عليه دين' : 'مستحق له') : c.bal < 0 ? 'رصيد مقدّم' : 'مسدد'}</span></div></button>`).join('') || empty('لا يوجد أحد بعد')}</div>`;
  },

  expenses() {
    const [from, to] = monthRange(ui.month);
    const es = live(db, 'expenses').filter(e => C.inRange(e.date, from, to)).sort((a, b) => b.date.localeCompare(a.date));
    const p = C.pl(db, from, to);
    return header('المصاريف', `<button class="btn pri" data-act="expense">+ مصروف</button>`) + `
    <div class="filters"><select data-filter="month" aria-label="الشهر">${monthOpts(ui.month)}</select></div>
    <div class="kpis"><div class="kpi"><span>مصاريف الشهر</span><b>${money(p.expenses)}</b></div><div class="kpi"><span>شراء معدات</span><b>${money(p.assets)}</b><small>لا تُخصم من الربح</small></div></div>
    <div class="list">${es.map(e => `<button class="item" data-act="expense" data-id="${e.id}"><div><b>${esc(e.category)}</b><span class="sub"><span class="num">${e.date}</span> ${esc(e.note || '')}</span></div><div class="end"><b>${money(e.amount)}</b></div></button>`).join('') || empty('لا توجد مصاريف هذا الشهر')}</div>`;
  },

  cash() {
    const log = C.cashLog(db).filter(x => x.date.startsWith(ui.month));
    const inn = log.filter(x => x.amount > 0).reduce((s, x) => s + x.amount, 0), out = log.filter(x => x.amount < 0).reduce((s, x) => s + x.amount, 0);
    return header('الصندوق', `<button class="btn pri" data-act="payment">قبض/دفع</button>`) + `
    <div class="kpis"><div class="kpi hero"><span>الرصيد الحالي</span><b>${money(C.cash(db))}</b></div><div class="kpi"><span>داخل هذا الشهر</span><b class="pos">${money(inn)}</b></div><div class="kpi"><span>خارج هذا الشهر</span><b class="neg">${money(-out)}</b></div></div>
    <div class="filters"><select data-filter="month" aria-label="الشهر">${monthOpts(ui.month)}</select></div>
    <div class="list">${log.map(x => `<div class="item static"><div><b>${esc(x.title)}</b><span class="sub"><span class="num">${x.date}</span> ${esc(x.note)}</span></div><div class="end"><b class="${x.amount > 0 ? 'pos' : 'neg'} num">${x.amount > 0 ? '+' : '−'}${num(Math.abs(x.amount))}</b></div></div>`).join('') || empty('لا توجد حركات هذا الشهر')}</div>`;
  },

  partners() {
    const ps = live(db, 'partners');
    const sum = r2(ps.reduce((s, p) => s + (+p.share || 0), 0));
    const existing = live(db, 'distributions').find(d => d.ym === ui.distMonth);
    const pct = ui.reserve ?? db.settings.reservePct;
    const pv = C.distributionPreview(db, ui.distMonth, pct);
    const dists = live(db, 'distributions').sort((a, b) => b.ym.localeCompare(a.ym));
    const shown = existing || pv;
    const changed = existing && C.distributionPreview(db, existing.ym, existing.reservePct).net !== existing.net;
    return header('الشركاء والأرباح', `<button class="btn pri" data-act="partner">+ شريك</button><button class="btn" data-act="partnerTx">رأس مال / سحب</button>`) + `
    ${ps.length && sum !== 100 ? `<div class="note">مجموع نسب الشركاء <b class="num">${num(sum)}%</b> ويجب أن يكون 100% قبل تقسيم الأرباح.</div>` : ''}
    <div class="list" style="margin-bottom:14px">${ps.map(p => { const a = C.partnerAccount(db, p); return `<button class="item" data-act="partnerView" data-id="${p.id}"><div><b>${esc(p.name)}</b> <span class="tag num">${num(p.share)}%</span><span class="sub">رأس المال ${money(a.capital)} · أرباح ${money(a.profit)} · مسحوبات ${money(a.withdrawn)}</span></div><div class="end"><b class="${a.balance < 0 ? 'neg' : ''}">${money(a.balance)}</b><span class="sub">الرصيد</span></div></button>`; }).join('') || empty('أضف الشركاء ونسبة كل واحد')}</div>
    <div class="card"><h2>تقسيم أرباح الشهر</h2>
      <div class="grid2"><label class="f">الشهر<select data-filter="distMonth">${monthOpts(ui.distMonth)}</select></label>
      <label class="f">نسبة تبقى بالشركة %<input type="number" inputmode="decimal" id="reserve" value="${esc(existing ? existing.reservePct : pct)}" ${existing ? 'disabled' : ''}></label></div>
      ${changed ? `<div class="note">تغيّرت أرقام هذا الشهر بعد اعتماد التقسيم (الصافي الحالي ${money(C.distributionPreview(db, existing.ym, existing.reservePct).net)}). ألغِ التقسيم واعتمده من جديد.</div>` : ''}
      <div class="rows" id="distRows">${distRows(shown)}</div>
      <div class="btns" style="margin-top:12px">${existing ? `<span class="tag" style="align-self:center">معتمد</span><button class="btn danger" data-act="del" data-c="distributions" data-id="${existing.id}">إلغاء التقسيم</button>` : `<button class="btn pri" data-act="approve">اعتماد التقسيم</button>`}<button class="btn" data-act="printDist">طباعة</button></div>
      <p class="hint" style="margin-top:10px">الاعتماد يضيف حصة كل شريك إلى رصيده. عند استلام المبلغ سجّله كسحب ليخرج من الصندوق.</p>
    </div>
    ${dists.length ? `<h2>التقسيمات المعتمدة</h2><div class="list">${dists.map(d => `<button class="item" data-act="pickDist" data-m="${d.ym}"><div><b>${ymName(d.ym)}</b><span class="sub">${d.shares.map(s => esc(s.name) + ': ' + plain(s.amount)).join(' · ')}</span></div><div class="end"><b>${money(d.distributable)}</b></div></button>`).join('')}</div>` : ''}`;
  },

  reports() {
    const from = ui.repFrom || ym() + '-01', to = ui.repTo || today();
    const p = C.pl(db, from, to), ps = C.productSales(db, from, to).slice(0, 15), bs = C.balanceSheet(db);
    const months = Array.from({ length: 12 }, (_, i) => shiftYm(ym(), -i));
    const row = (t, v, cls = '') => `<div class="${cls}"><span>${t}</span>${money(v)}</div>`;
    const margin = p.sales ? Math.round(p.net / p.sales * 100) : 0;
    return header('التقارير', `<button class="btn" data-act="printReport">طباعة</button>`) + `
    <div class="grid2">${`<label class="f">من<input type="date" value="${from}" data-filter="repFrom"></label><label class="f">إلى<input type="date" value="${to}" data-filter="repTo"></label>`}</div>
    <div id="reportBody">
    <div class="card"><h2>الأرباح والخسائر <span class="tag num">${from} ← ${to}</span></h2><div class="rows">
      ${row('مبيعات المفرق', p.retail)}${row('مبيعات الجملة', p.wholesale)}${row('إجمالي المبيعات', p.sales, 'total')}
      ${row('تكلفة البضاعة المباعة', -p.cogs)}${row('مجمل الربح', p.gross, 'total')}
      ${Object.entries(p.byCat).map(([k, v]) => row(esc(k), -v)).join('')}
      ${p.adj ? row('فروقات الجرد والتالف', p.adj) : ''}
      ${row(`صافي الربح (${margin}%)`, p.net, 'total')}
    </div></div>
    <div class="card"><h2>الأكثر مبيعاً</h2>${ps.length ? `<div class="table"><table><tr><th>المنتج</th><th>الكمية</th><th>الإيراد</th><th>الربح</th></tr>${ps.map(x => `<tr><td>${esc(x.name)}</td><td class="num">${num(x.qty)}</td><td>${money(x.revenue)}</td><td>${money(x.profit)}</td></tr>`).join('')}</table></div>` : empty('لا توجد مبيعات بهذه الفترة')}</div>
    <div class="card"><h2>مقارنة الأشهر</h2><div class="table"><table><tr><th>الشهر</th><th>المبيعات</th><th>المصاريف</th><th>صافي الربح</th></tr>${months.map(m => { const [a, b] = monthRange(m), x = C.pl(db, a, b); return `<tr><td>${ymName(m)}</td><td>${money(x.sales)}</td><td>${money(x.expenses)}</td><td class="${x.net < 0 ? 'neg' : ''}">${money(x.net)}</td></tr>`; }).join('')}</table></div></div>
    <div class="card"><h2>المركز المالي الآن</h2><div class="rows">
      ${row('الصندوق', bs.cash)}${row('المخزون', bs.inventory)}${row('ديون على الزبائن', bs.receivable)}${row('المعدات', bs.equipment)}${row('مجموع الأصول', bs.assets, 'total')}
      ${row('ديون الموردين', bs.payable)}${row('الأرصدة الافتتاحية', bs.opening)}${row('حسابات الشركاء', bs.partners)}${row('أرباح محتجزة', bs.reserves)}${row('أرباح لم تُقسم بعد', bs.undistributed)}
      ${Math.abs(bs.diff) > 1 ? row('فرق تقييم المخزون', bs.diff) : ''}
    </div></div>
    </div>
    <div class="card"><h2>تصدير إلى Excel</h2><div class="btns"><button class="btn" data-act="csv" data-t="sales">المبيعات</button><button class="btn" data-act="csv" data-t="purchases">المشتريات</button><button class="btn" data-act="csv" data-t="products">المنتجات</button><button class="btn" data-act="csv" data-t="expenses">المصاريف</button><button class="btn" data-act="csv" data-t="contacts">الديون</button></div></div>`;
  },

  settings() {
    const s = db.settings;
    return header('الإعدادات') + `<form id="setf"><div class="card"><h2>الشركة</h2><div class="grid2">${f('اسم الشركة', 'company', s.company)}${f('الهاتف', 'phone', s.phone, 'tel')}</div>${f('العنوان', 'address', s.address)}</div>
    <div class="card"><h2>العملة والرصيد الافتتاحي</h2><div class="grid2">${f('العملة الأساسية', 'currency', s.currency)}${f('الصندوق عند البدء', 'openingCash', s.openingCash, 'number')}${f('عملة ثانية (اختياري)', 'currency2', s.currency2, 'text', 'placeholder="ل.س"')}${f('سعر الصرف', 'rate', s.rate, 'number')}</div></div>
    <div class="card"><h2>افتراضات حاسبة الطباعة</h2><div class="grid2">${f('سعر كغ الفيلامنت', 'filamentKg', s.filamentKg, 'number')}${f('اهتلاك الطابعة / ساعة', 'machineHour', s.machineHour, 'number')}${f('كهرباء / ساعة', 'powerHour', s.powerHour, 'number')}${f('نسبة الفشل %', 'failPct', s.failPct, 'number')}${f('هامش المفرق %', 'retailMarkup', s.retailMarkup, 'number')}${f('هامش الجملة %', 'wholesaleMarkup', s.wholesaleMarkup, 'number')}</div></div>
    <button class="btn pri block" style="margin-bottom:14px">حفظ الإعدادات</button></form>
    ${syncCard()}
    <div class="card"><h2>النسخ الاحتياطي</h2><p class="hint">خذ نسخة على ملف بين فترة وأخرى. «دمج نسخة» يبقي أحدث تعديل لكل سجل.</p>
    <div class="btns"><button class="btn pri" data-act="backup">تنزيل نسخة</button>${navigator.canShare ? '<button class="btn" data-act="shareBackup">مشاركة النسخة</button>' : ''}<button class="btn" data-act="importBackup">دمج نسخة</button></div></div>
    <div class="card"><h2>منطقة الخطر</h2><button class="btn danger" data-act="wipe">مسح كل البيانات</button></div>`;
  }
};

function syncCard() {
  if (Sync.connected()) {
    return `<div class="card"><h2>المزامنة ${badge()}</h2><p class="hint">مسجّل باسم <span class="num">${esc(Sync.email())}</span>. التعديلات تصل لباقي الأجهزة خلال ثوانٍ، وبدون نت تُحفظ هنا وتُرفع لاحقاً.</p><p class="hint" id="syncMsg">${esc(Sync.status().message)}</p><div class="btns"><button class="btn pri" data-act="syncNow">مزامنة الآن</button><button class="btn" data-act="syncLogout">تسجيل الخروج</button></div></div>`;
  }
  return `<form id="syncf" class="card"><h2>المزامنة بين الأجهزة</h2><p class="hint">سجّل الدخول لتظهر نفس البيانات على كل الأجهزة. أي بيانات موجودة على هذا الجهاز ستُضاف إلى الحساب المشترك.</p>
  ${Sync.needsProject() ? f('رابط المشروع', 'url', '', 'url', 'dir="ltr" placeholder="https://xxxx.supabase.co" autocomplete="off"') + f('المفتاح العام (anon)', 'key', '', 'text', 'dir="ltr" autocomplete="off"') : ''}
  ${f('البريد الإلكتروني', 'email', '', 'email', 'dir="ltr" autocomplete="username"')}${f('كلمة المرور', 'password', '', 'password', 'dir="ltr" autocomplete="current-password"')}
  <p class="err" id="syncErr"></p><button class="btn pri block" id="syncBtn">تسجيل الدخول</button></form>`;
}

function distRows(d) {
  return `<div><span>صافي ربح ${ymName(d.ym)}</span>${money(d.net)}</div><div><span>يبقى بالشركة</span>${money(d.reserve)}</div><div class="total"><span>للتوزيع</span>${money(d.distributable)}</div>` +
    d.shares.map(s => `<div><span>${esc(s.name)} <span class="tag num">${num(s.pct)}%</span></span>${money(s.amount)}</div>`).join('');
}

const CH = { a: '#e06c00', b: '#3a86d8' };
function chart() {
  const ms = Array.from({ length: 6 }, (_, i) => shiftYm(ym(), -i));
  const data = ms.map(m => { const [a, b] = monthRange(m), p = C.pl(db, a, b); return { m, s: p.sales, n: p.net }; });
  const max = Math.max(1, ...data.map(d => Math.max(d.s, d.n))), min = Math.min(0, ...data.map(d => d.n));
  const W = 600, H = 230, top = 8, h = H - top - 36, sc = v => (v / (max - min)) * h, base = top + sc(max), slot = W / 6, bw = 22;
  const bar = (x, v, col) => { const bh = Math.max(v ? 2 : 0, Math.abs(sc(v))); return `<rect x="${x}" y="${v >= 0 ? base - bh : base}" width="${bw}" height="${bh}" rx="4" fill="${col}"/>`; };
  // Slots run oldest on the right, matching right-to-left reading.
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="المبيعات وصافي الربح لآخر ستة أشهر">
  <line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)"/>
  ${data.map((d, i) => { const x = i * slot, c = x + slot / 2; return `${bar(c - bw - 1, d.s, CH.a)}${bar(c + 1, d.n, CH.b)}
  <text x="${c}" y="${H - 8}" text-anchor="middle" fill="var(--muted)" font-size="21">${MONTHS[+d.m.slice(5) - 1].replace('تشرين ', 'ت.').replace('كانون ', 'ك.').replace('الأول', '1').replace('الثاني', '2')}</text>
  <rect class="hit" x="${x}" y="0" width="${slot}" height="${H}" data-act="readout" data-t="${esc(ymName(d.m))}: مبيعات ${esc(plain(d.s))} · صافي ربح ${esc(plain(d.n))}"><title>${esc(ymName(d.m))}: ${esc(plain(d.s))} / ${esc(plain(d.n))}</title></rect>`; }).join('')}</svg>`;
}

function docList(kind) {
  const isS = kind === 'sale', coll = isS ? 'sales' : 'purchases', [from, to] = monthRange(ui.month), q = ui.q.trim().toLowerCase();
  const cname = id => (byId(db, 'contacts', id) || {}).name || (isS ? 'زبون نقدي' : 'مورد غير محدد');
  const ds = live(db, coll).filter(d => C.inRange(d.date, from, to) && (!q || (cname(d.contactId) + ' ' + d.no + ' ' + d.lines.map(l => l.name).join(' ')).toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
  const total = ds.reduce((s, d) => s + docTotal(d) * sign(d), 0);
  return header(isS ? 'المبيعات' : 'المشتريات', `<button class="btn pri" data-act="newDoc" data-k="${kind}">+ ${isS ? 'فاتورة بيع' : 'فاتورة شراء'}</button>`) + `
  <div class="filters"><select data-filter="month" aria-label="الشهر">${monthOpts(ui.month)}</select><input placeholder="بحث" value="${esc(ui.q)}" data-filter="q" aria-label="بحث"></div>
  <div class="kpis"><div class="kpi"><span>المجموع</span><b>${money(total)}</b><small>${ds.length} فاتورة</small></div></div>
  <div class="list">${ds.map(d => { const t = docTotal(d), rem = r2(t - (+d.paid || 0)); return `<button class="item" data-act="openDoc" data-k="${kind}" data-id="${d.id}"><div><b>#${d.no} ${esc(cname(d.contactId))}</b> ${d.ret ? '<span class="tag alert">مرتجع</span>' : ''} ${isS ? `<span class="tag">${d.mode === 'wholesale' ? 'جملة' : 'مفرق'}</span>` : ''}<span class="sub"><span class="num">${d.date}</span> · ${esc(d.lines.map(l => l.name).join('، '))}</span></div><div class="end"><b>${money(t)}</b>${rem > 0 ? `<span class="sub warn">باقي ${money(rem)}</span>` : '<span class="sub">مدفوعة</span>'}</div></button>`; }).join('') || empty('لا توجد فواتير بهذا الشهر')}</div>`;
}

// ---------- invoice form ----------
let cur = null;
function nextNo(coll) { return db[coll].reduce((m, d) => Math.max(m, d.no || 0), 0) + 1; }

function openDocForm(kind, rec) {
  const isS = kind === 'sale';
  const c = rec && byId(db, 'contacts', rec.contactId);
  cur = { kind, lines: rec ? rec.lines.map(l => ({ ...l })) : [], paidTouched: !!rec };
  const names = live(db, 'contacts').filter(x => x.kind === (isS ? 'customer' : 'supplier')).map(x => `<option value="${esc(x.name)}">`).join('');
  modal(rec ? `تعديل فاتورة #${rec.no}` : (isS ? 'فاتورة بيع' : 'فاتورة شراء'), `
  <div class="grid2">${f('التاريخ', 'date', rec ? rec.date : today(), 'date')}${isS ? sel('نوع السعر', 'mode', [['retail', 'مفرق'], ['wholesale', 'جملة']], rec ? rec.mode : 'retail', 'id="mode"') : ''}</div>
  <label class="f">${isS ? 'الزبون (اتركه فارغاً للنقدي)' : 'المورد'}<input name="contact" list="cl" value="${esc(c ? c.name : '')}" autocomplete="off"><datalist id="cl">${names}</datalist></label>
  ${isS ? `<label class="check"><input type="checkbox" name="ret" ${rec && rec.ret ? 'checked' : ''}> هذه الفاتورة مرتجع من زبون</label>` : ''}
  <div class="picker"><input id="pk" placeholder="ابحث عن منتج لإضافته..." autocomplete="off" aria-label="بحث عن منتج"><div class="pk-res" id="pkr"></div></div>
  <div id="lines"></div>
  <div class="grid2">${f('خصم', 'discount', rec ? rec.discount : 0, 'number', 'id="disc"')}${f('المدفوع', 'paid', rec ? rec.paid : 0, 'number', 'id="paid"')}</div>
  <div class="rows card" id="tot"></div>
  ${area('ملاحظة', 'note', rec ? rec.note : '')}`, () => saveDoc(kind, rec), delBtn(isS ? 'sales' : 'purchases', rec && rec.id));
  drawLines();
}

function linePrice(p) {
  if (cur.kind === 'purchase') return r2(C.stock(db)[p.id].avg);
  return +($('#mode').value === 'wholesale' ? p.wholesale : p.retail) || 0;
}
function drawPicker() {
  const q = $('#pk').value.trim().toLowerCase(), box = $('#pkr');
  if (!q) { box.innerHTML = ''; return; }
  const st = C.stock(db);
  const res = live(db, 'products').filter(p => (p.name + ' ' + (p.sku || '')).toLowerCase().includes(q)).slice(0, 8);
  box.innerHTML = res.map(p => `<button type="button" data-act="pick" data-id="${p.id}"><span>${esc(p.name)}</span><span class="sub num" style="color:var(--muted)">${p.track !== false ? num(st[p.id].qty) + ' ' + esc(p.unit) : ''}</span></button>`).join('') +
    (res.some(p => p.name.toLowerCase() === q) ? '' : `<button type="button" data-act="quickProduct"><span class="warn">+ إضافة «${esc($('#pk').value.trim())}» كمنتج جديد</span></button>`);
}
function addLine(p) {
  const ex = cur.lines.find(l => l.pid === p.id);
  if (ex) ex.qty = +ex.qty + 1; else cur.lines.push({ pid: p.id, name: p.name, qty: 1, price: linePrice(p) });
  $('#pk').value = ''; drawPicker(); drawLines(); $('#pk').focus();
}
function drawLines() {
  $('#lines').innerHTML = cur.lines.map((l, i) => `<div class="line"><div class="line-t"><span>${esc(l.name)}</span><button type="button" data-act="rmLine" data-i="${i}" aria-label="حذف السطر">✕</button></div>
  <div class="line-g"><label>الكمية<input type="number" step="any" inputmode="decimal" data-l="qty" data-i="${i}" value="${l.qty}"></label><label>السعر<input type="number" step="any" inputmode="decimal" data-l="price" data-i="${i}" value="${l.price}"></label><label>المجموع<output id="ls${i}" class="num">${num(l.qty * l.price)}</output></label></div><div class="hint warn" id="lw${i}" style="margin:4px 0 0"></div></div>`).join('') || '<p class="hint">لم تتم إضافة منتجات بعد</p>';
  updateTotals();
}
function updateTotals() {
  if (!cur) return;
  const d = { lines: cur.lines, discount: $('#disc').value };
  const t = docTotal(d);
  if (!cur.paidTouched) $('#paid').value = t;
  const rem = r2(t - (+$('#paid').value || 0));
  let extra = '';
  if (cur.kind === 'sale') {
    const st = C.stock(db);
    const cost = cur.lines.reduce((s, l) => s + l.qty * (st[l.pid] ? st[l.pid].avg : 0), 0);
    extra = `<div><span>الربح المتوقع</span>${money(t - cost)}</div>`;
    const isRet = $('#mf').elements.ret.checked;
    cur.lines.forEach((l, i) => {
      const p = byId(db, 'products', l.pid), w = $('#lw' + i);
      if (w) w.textContent = !isRet && p && p.track !== false && +l.qty > st[l.pid].qty ? `المتوفر ${num(st[l.pid].qty)} فقط` : '';
    });
  }
  $('#tot').innerHTML = `<div class="total"><span>الإجمالي</span>${money(t)}</div><div><span>الباقي</span>${money(rem)}</div>${extra}`;
}
function resolveContact(name, kind) {
  name = name.trim();
  if (!name) return '';
  const ex = live(db, 'contacts').find(c => c.kind === kind && c.name === name);
  return ex ? ex.id : upsert('contacts', { name, kind, phone: '', opening: 0 }).id;
}
function saveDoc(kind, rec) {
  const v = formData(), isS = kind === 'sale', coll = isS ? 'sales' : 'purchases';
  if (!v.date) return fail('اختر التاريخ');
  if (!cur.lines.length) return fail('أضف منتجاً واحداً على الأقل');
  if (cur.lines.some(l => !(+l.qty > 0) || +l.price < 0)) return fail('تحقق من الكميات والأسعار');
  const discount = +v.discount || 0, paid = +v.paid || 0;
  if (discount < 0 || paid < 0) return fail('الخصم والمدفوع لا يمكن أن يكونا بالسالب');
  const total = docTotal({ lines: cur.lines, discount });
  if (total < 0) return fail('الخصم أكبر من قيمة الفاتورة');
  if (paid > total) return fail('المدفوع أكبر من إجمالي الفاتورة');
  if (paid < total && !v.contact.trim()) return fail(`اكتب اسم ${isS ? 'الزبون' : 'المورد'} لتسجيل الباقي دَيناً عليه`);
  const st = isS ? C.stock(db, v.date) : null;
  const lines = cur.lines.map(l => ({ ...l, qty: +l.qty, price: +l.price, ...(isS ? { cost: Math.round((st[l.pid] ? st[l.pid].avg : l.cost || 0) * 1e4) / 1e4 } : {}) }));
  const doc = { date: v.date, contactId: resolveContact(v.contact, isS ? 'customer' : 'supplier'), discount, paid, note: v.note, lines };
  if (isS) { doc.mode = v.mode; doc.ret = !!v.ret; }
  if (rec) doc.id = rec.id; else doc.no = nextNo(coll);
  const saved = upsert(coll, doc);
  closeModal(); save(); toast('تم الحفظ');
  if (isS) showInvoice(saved);
  return true;
}

function invoiceHtml(s) {
  const c = byId(db, 'contacts', s.contactId), t = docTotal(s), rem = r2(t - (+s.paid || 0)), S = db.settings;
  return `<div class="inv"><div class="inv-h"><div><h2 style="margin:0">${esc(S.company)}</h2><div class="sub num">${esc(S.phone)}</div><div class="sub">${esc(S.address)}</div></div><img src="icons/icon-192.png" alt=""></div>
  <div class="rows"><div><span>${s.ret ? 'إشعار مرتجع' : 'فاتورة'} رقم</span><b class="num">${s.no}</b></div><div><span>التاريخ</span><span class="num">${s.date}</span></div><div><span>الزبون</span><span>${esc(c ? c.name : 'زبون نقدي')}</span></div></div>
  <div class="table" style="margin:10px 0"><table><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr>${s.lines.map(l => `<tr><td style="white-space:normal">${esc(l.name)}</td><td class="num">${num(l.qty)}</td><td class="num">${num(l.price)}</td><td class="num">${num(l.qty * l.price)}</td></tr>`).join('')}</table></div>
  <div class="rows">${+s.discount ? `<div><span>الخصم</span>${money(s.discount)}</div>` : ''}<div class="total"><span>الإجمالي</span>${money(t)}</div>${S.currency2 && +S.rate ? `<div><span>بالعملة الثانية</span><span class="num">${num(t * S.rate)} ${esc(S.currency2)}</span></div>` : ''}<div><span>المدفوع</span>${money(s.paid)}</div><div><span>الباقي</span>${money(rem)}</div></div>${s.note ? `<p class="hint">${esc(s.note)}</p>` : ''}</div>`;
}
function showInvoice(s) {
  modal(`فاتورة #${s.no}`, invoiceHtml(s), null, `<button type="button" class="btn pri" data-act="printInv" data-id="${s.id}">طباعة / PDF</button><button type="button" class="btn" data-act="waInv" data-id="${s.id}">واتساب</button><button type="button" class="btn" data-act="editDoc" data-k="sale" data-id="${s.id}">تعديل</button>`);
}
function printHtml(html) { if (dlg.open) closeModal(); $('#print').innerHTML = html; setTimeout(() => window.print(), 80); }

// ---------- CSV / backup ----------
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function csv(name, rows) {
  const cell = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s) && isNaN(+s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  download(name + '.csv', '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
const backupName = () => `plastika-backup-${today()}.json`;
function markBackup() { db.settings.lastBackup = Date.now(); saveNow(); }

// ---------- demo ----------
function loadDemo() {
  const d = C.blank(); d.settings = { ...db.settings, openingCash: 500 };
  const mk = (coll, o, t = Date.now()) => { const r = { id: uid(), createdAt: t, updatedAt: t, ...o }; d[coll].push(r); return r; };
  const pla = mk('products', { name: 'فيلامنت PLA أسود', category: 'فيلامنت', unit: 'كغ', sku: 'PLA-BK', cost: 18, stock: 5, retail: 30, wholesale: 25, minStock: 3, track: true });
  const vase = mk('products', { name: 'مزهرية حلزونية', category: 'منتج جاهز', unit: 'قطعة', sku: 'VS-01', cost: 0, stock: 0, retail: 15, wholesale: 10, minStock: 3, track: true });
  const key = mk('products', { name: 'ميدالية مفاتيح', category: 'قطعة', unit: 'قطعة', sku: 'KY-01', cost: 0, stock: 0, retail: 4, wholesale: 2.5, minStock: 10, track: true });
  const dsg = mk('products', { name: 'تصميم ثلاثي الأبعاد حسب الطلب', category: 'تصميم', unit: 'قطعة', sku: '', cost: 0, stock: 0, retail: 40, wholesale: 40, minStock: 0, track: false });
  const c1 = mk('contacts', { name: 'زبون تجريبي', kind: 'customer', phone: '', opening: 0 });
  const c2 = mk('contacts', { name: 'محل جملة تجريبي', kind: 'customer', phone: '', opening: 0 });
  const s1 = mk('contacts', { name: 'مورد تجريبي', kind: 'supplier', phone: '', opening: 0 });
  const a = mk('partners', { name: 'الشريك الأول', share: 60, openingCapital: 0 });
  mk('partners', { name: 'الشريك الثاني', share: 40, openingCapital: 0 });
  mk('partnerTx', { date: shiftYm(ym(), -5) + '-01', partnerId: a.id, type: 'capital', amount: 1000, note: 'رأس مال تجريبي' });
  let no = 1, pno = 1, t = Date.now() - 1e7;
  for (let i = 5; i >= 0; i--) {
    const m = shiftYm(ym(), -i), day = n => { const x = `${m}-${String(n).padStart(2, '0')}`; return x > today() ? today() : x; };
    mk('purchases', { no: pno++, date: day(1), contactId: s1.id, discount: 0, paid: 200, lines: [{ pid: pla.id, name: pla.name, qty: 10, price: 20 + (i % 3) }], note: '' }, t += 1000);
    mk('productions', { date: day(2), pid: vase.id, qty: 20, matPid: pla.id, matQty: 4, note: '' }, t += 1000);
    mk('productions', { date: day(2), pid: key.id, qty: 60, matPid: pla.id, matQty: 1.5, note: '' }, t += 1000);
    const sale = (dt, contactId, mode, q1, q2, q3, paidPart) => {
      const st = C.stock(d, dt), P = mode === 'wholesale' ? 'wholesale' : 'retail';
      const lines = [[vase, q1], [key, q2], [dsg, q3]].filter(x => x[1]).map(([p, q]) => ({ pid: p.id, name: p.name, qty: q, price: p[P], cost: Math.round(st[p.id].avg * 1e4) / 1e4 }));
      const tot = lines.reduce((s, l) => s + l.qty * l.price, 0);
      mk('sales', { no: no++, date: dt, contactId, mode, discount: 0, paid: paidPart == null ? tot : paidPart, lines, ret: false, note: '' }, t += 1000);
    };
    sale(day(6), '', 'retail', 5 + (5 - i), 10, 1);
    sale(day(14), c2.id, 'wholesale', 8, 30, 0, 100);
    sale(day(20), c1.id, 'retail', 3, 8, 1);
    mk('payments', { date: day(25), contactId: c2.id, dir: 'in', amount: 40, note: '' }, t += 1000);
    mk('expenses', { date: day(3), category: 'كهرباء', amount: 25 + i * 2, note: '' }, t += 1000);
    mk('expenses', { date: day(4), category: 'إيجار', amount: 60, note: '' }, t += 1000);
  }
  db = d; save(); toast('تم تحميل البيانات التجريبية');
}

// ---------- actions ----------
const A = {
  go(d) { view = d.v; ui.q = ''; ui.cat = ''; if (dlg.open) closeModal(); render(); window.scrollTo(0, 0); },
  close: closeModal,
  moreMenu() { modal('القائمة', `<div class="list">${NAV.map(([v, t, i]) => `<button type="button" class="item" data-act="go" data-v="${v}"><div style="display:flex;gap:10px;align-items:center">${icon(i)}<b>${t}</b></div></button>`).join('')}</div>`); },
  demo: loadDemo,
  readout(d) { $('#readout').textContent = d.t; },
  newDoc(d) { openDocForm(d.k); },
  openDoc(d) { const coll = d.k === 'sale' ? 'sales' : 'purchases', r = byId(db, coll, d.id); if (d.k === 'sale') showInvoice(r); else openDocForm('purchase', r); },
  editDoc(d) { openDocForm(d.k, byId(db, 'sales', d.id)); },
  pick(d) { addLine(byId(db, 'products', d.id)); },
  quickProduct() { const name = $('#pk').value.trim(); const p = upsert('products', { name, category: CATS[0], unit: 'قطعة', sku: '', cost: 0, stock: 0, retail: 0, wholesale: 0, minStock: 0, track: true }); saveNow(); addLine(p); },
  rmLine(d) { cur.lines.splice(+d.i, 1); drawLines(); },
  printInv(d) { printHtml(invoiceHtml(byId(db, 'sales', d.id))); },
  waInv(d) {
    const s = byId(db, 'sales', d.id), c = byId(db, 'contacts', s.contactId), t = docTotal(s);
    const txt = `${db.settings.company}\nفاتورة #${s.no} - ${s.date}\n` + s.lines.map(l => `${l.name} × ${num(l.qty)} = ${plain(l.qty * l.price)}`).join('\n') + `\nالإجمالي: ${plain(t)}\nالمدفوع: ${plain(s.paid)}\nالباقي: ${plain(t - s.paid)}`;
    const phone = c && c.phone ? c.phone.replace(/\D/g, '') : '';
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
  },
  del(d) {
    const used = d.c === 'contacts' ? [...live(db, 'sales'), ...live(db, 'purchases'), ...live(db, 'payments')].some(x => x.contactId === d.id)
      : d.c === 'products' ? [...live(db, 'sales'), ...live(db, 'purchases')].some(x => x.lines.some(l => l.pid === d.id)) || [...live(db, 'productions'), ...live(db, 'adjustments')].some(x => x.pid === d.id || x.matPid === d.id)
        : d.c === 'partners' ? live(db, 'partnerTx').some(x => x.partnerId === d.id) || live(db, 'distributions').some(x => x.shares.some(s => s.partnerId === d.id)) : false;
    if (used) return toast('لا يمكن الحذف لوجود حركات مرتبطة به');
    if (!confirm('هل أنت متأكد من الحذف؟')) return;
    removeRec(d.c, d.id); if (dlg.open) closeModal(); save(); toast('تم الحذف');
  },

  product(d) {
    const p = d.id ? byId(db, 'products', d.id) : null, S = db.settings;
    modal(p ? 'تعديل منتج' : 'منتج جديد', `
    ${f('الاسم', 'name', p ? p.name : '', 'text', 'required')}
    <div class="grid2">${sel('التصنيف', 'category', CATS, p ? p.category : CATS[0])}${sel('الوحدة', 'unit', UNITS, p ? p.unit : UNITS[0])}${f('الرمز (اختياري)', 'sku', p ? p.sku : '')}${f('تنبيه عند مخزون', 'minStock', p ? p.minStock : 0, 'number')}</div>
    <div class="grid2">${f('سعر المفرق', 'retail', p ? p.retail : 0, 'number', 'id="retail"')}${f('سعر الجملة', 'wholesale', p ? p.wholesale : 0, 'number', 'id="wholesale"')}${f('تكلفة الوحدة', 'cost', p ? p.cost : 0, 'number', 'id="pcost"')}${f('المخزون الافتتاحي', 'stock', p ? p.stock : 0, 'number')}</div>
    <label class="check"><input type="checkbox" name="track" ${!p || p.track !== false ? 'checked' : ''}> يتابع مخزونه (ألغِها للخدمات والتصاميم)</label>
    <details><summary>حاسبة تكلفة الطباعة وتسعيرها</summary>
      <div class="grid2" style="margin-top:8px">
      ${f('وزن القطعة (غرام)', 'c_g', '', 'number', 'data-calc')}${f('سعر كغ الفيلامنت', 'c_kg', S.filamentKg, 'number', 'data-calc')}
      ${f('ساعات الطباعة', 'c_h', '', 'number', 'data-calc')}${f('اهتلاك + كهرباء / ساعة', 'c_mh', r2(+S.machineHour + +S.powerHour), 'number', 'data-calc')}
      ${f('عمل وتشطيب', 'c_l', 0, 'number', 'data-calc')}${f('نسبة الفشل %', 'c_f', S.failPct, 'number', 'data-calc')}
      ${f('هامش المفرق %', 'c_r', S.retailMarkup, 'number', 'data-calc')}${f('هامش الجملة %', 'c_w', S.wholesaleMarkup, 'number', 'data-calc')}</div>
      <div class="rows" id="calcR"></div><button type="button" class="btn block" data-act="applyCalc" style="margin-top:8px">تطبيق الأسعار المقترحة</button>
      <p class="hint" style="margin-top:8px">الحاسبة للتسعير فقط. الكهرباء والإيجار الفعليان تسجلهما بالمصاريف، فلا تدخل تكلفتهما بحقل «تكلفة الوحدة» حتى لا تُخصم مرتين.</p>
    </details>`, () => {
      const v = formData();
      if (!v.name.trim()) return fail('اكتب اسم المنتج');
      if (live(db, 'products').some(x => x.name === v.name.trim() && x.id !== d.id)) return fail('يوجد منتج بنفس الاسم');
      const rec = { name: v.name.trim(), category: v.category, unit: v.unit, sku: v.sku, minStock: +v.minStock || 0, retail: +v.retail || 0, wholesale: +v.wholesale || 0, cost: +v.cost || 0, stock: +v.stock || 0, track: !!v.track };
      if (d.id) rec.id = d.id;
      upsert('products', rec); closeModal(); save(); toast('تم الحفظ'); return true;
    }, delBtn('products', d.id));
    calc();
  },
  applyCalc() { const r = calc(); $('#retail').value = r.retail; $('#wholesale').value = r.wholesale; if (!+$('#pcost').value) $('#pcost').value = r.material; toast('تم تطبيق الأسعار'); },

  production() {
    const ps = live(db, 'products').filter(p => p.track !== false);
    if (ps.length < 2) return toast('أضف المنتج والمادة الخام أولاً');
    const opts = ps.map(p => [p.id, p.name]), mats = ps.filter(p => p.category === 'فيلامنت');
    modal('تسجيل طباعة / إنتاج', `<p class="hint">يخصم المادة من المخزون ويضيف القطع الجاهزة بتكلفة المادة.</p>
    ${f('التاريخ', 'date', today(), 'date')}${sel('المنتج الناتج', 'pid', opts, ps.find(p => p.category !== 'فيلامنت')?.id)}${f('عدد القطع الناتجة', 'qty', 1, 'number')}
    ${sel('المادة المستخدمة', 'matPid', (mats.length ? mats : ps).map(p => [p.id, `${p.name} (${p.unit})`]))}${f('الكمية المستهلكة (بالغرام إذا كانت الوحدة كغ)', 'mat', '', 'number')}`, () => {
      const v = formData(), mat = byId(db, 'products', v.matPid);
      if (v.pid === v.matPid) return fail('المنتج والمادة يجب أن يكونا مختلفين');
      if (!(+v.qty > 0) || !(+v.mat > 0) || !v.date) return fail('أدخل الكميات والتاريخ');
      upsert('productions', { date: v.date, pid: v.pid, qty: +v.qty, matPid: v.matPid, matQty: mat.unit === 'كغ' ? +v.mat / 1000 : +v.mat });
      closeModal(); save(); toast('تم تسجيل الإنتاج'); return true;
    });
  },
  adjust() {
    const ps = live(db, 'products').filter(p => p.track !== false);
    if (!ps.length) return toast('أضف منتجات أولاً');
    modal('تعديل جرد', `<p class="hint">للتالف والطبعات الفاشلة أو فرق الجرد. النقص يُخصم من الربح.</p>${f('التاريخ', 'date', today(), 'date')}${sel('المنتج', 'pid', ps.map(p => [p.id, `${p.name} (${p.unit})`]))}${sel('النوع', 'dir', [['-1', 'نقص / تالف'], ['1', 'زيادة']], '-1')}${f('الكمية', 'qty', '', 'number')}${f('السبب', 'reason', 'طبعة فاشلة')}`, () => {
      const v = formData();
      if (!(+v.qty > 0) || !v.date) return fail('أدخل الكمية والتاريخ');
      const qty = +v.qty * +v.dir, avg = C.stock(db, v.date)[v.pid].avg;
      upsert('adjustments', { date: v.date, pid: v.pid, qty, value: r2(qty * avg), reason: v.reason });
      closeModal(); save(); toast('تم الحفظ'); return true;
    });
  },
  contact(d) {
    const c = d.id ? byId(db, 'contacts', d.id) : null;
    modal(c ? 'تعديل' : 'زبون / مورد جديد', `${f('الاسم', 'name', c ? c.name : '')}${sel('النوع', 'kind', [['customer', 'زبون'], ['supplier', 'مورد']], c ? c.kind : ui.contactTab)}${f('الهاتف', 'phone', c ? c.phone : '', 'tel')}${f('رصيد افتتاحي (دين قديم)', 'opening', c ? c.opening : 0, 'number')}`, () => {
      const v = formData();
      if (!v.name.trim()) return fail('اكتب الاسم');
      const r = { name: v.name.trim(), kind: v.kind, phone: v.phone, opening: +v.opening || 0 }; if (d.id) r.id = d.id;
      upsert('contacts', r); closeModal(); save(); toast('تم الحفظ'); return true;
    }, delBtn('contacts', d.id));
  },
  statement(d) {
    const c = byId(db, 'contacts', d.id), isC = c.kind === 'customer', rows = [];
    if (+c.opening) rows.push({ date: '', t: 'رصيد افتتاحي', v: +c.opening });
    live(db, isC ? 'sales' : 'purchases').filter(s => s.contactId === c.id).forEach(s => { rows.push({ date: s.date, t: `${s.ret ? 'مرتجع' : 'فاتورة'} #${s.no}`, v: docTotal(s) * sign(s) }); if (+s.paid) rows.push({ date: s.date, t: `مدفوع #${s.no}`, v: -s.paid * sign(s) }); });
    live(db, 'payments').filter(p => p.contactId === c.id).forEach(p => rows.push({ date: p.date, t: p.dir === 'in' ? 'قبض' : 'دفع', v: (p.dir === (isC ? 'in' : 'out') ? -1 : 1) * p.amount, id: p.id }));
    rows.sort((a, b) => a.date.localeCompare(b.date));
    let run = 0;
    modal(esc(c.name), `<div class="kpi hero" style="margin-bottom:10px"><span>الرصيد</span><b>${money(C.contactBalance(db, c))}</b></div><div class="table"><table><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th><th>الرصيد</th></tr>${rows.map(r => `<tr><td class="num">${r.date}</td><td>${r.t}</td><td class="num">${num(r.v)}</td><td class="num">${num(run = r2(run + r.v))}</td></tr>`).join('')}</table></div>`, null,
      `<button type="button" class="btn pri" data-act="payment" data-c="${c.id}">${isC ? 'قبض دفعة' : 'دفع دفعة'}</button><button type="button" class="btn" data-act="contact" data-id="${c.id}">تعديل</button>`);
  },
  payment(d) {
    const cs = live(db, 'contacts');
    if (!cs.length) return toast('أضف زبوناً أو مورداً أولاً');
    const c = d.c ? byId(db, 'contacts', d.c) : null;
    modal('قبض أو دفع', `${f('التاريخ', 'date', today(), 'date')}${sel('الجهة', 'contactId', cs.map(x => [x.id, `${x.name} (${x.kind === 'customer' ? 'زبون' : 'مورد'}) - ${plain(C.contactBalance(db, x))}`]), c ? c.id : '')}${sel('النوع', 'dir', [['in', 'قبض (داخل للصندوق)'], ['out', 'دفع (خارج من الصندوق)']], c && c.kind === 'supplier' ? 'out' : 'in')}${f('المبلغ', 'amount', '', 'number')}${f('ملاحظة', 'note')}`, () => {
      const v = formData();
      if (!(+v.amount > 0) || !v.date) return fail('أدخل المبلغ والتاريخ');
      upsert('payments', { date: v.date, contactId: v.contactId, dir: v.dir, amount: +v.amount, note: v.note });
      closeModal(); save(); toast('تم التسجيل'); return true;
    });
  },
  expense(d) {
    const e = d.id ? byId(db, 'expenses', d.id) : null;
    modal(e ? 'تعديل مصروف' : 'مصروف جديد', `${f('التاريخ', 'date', e ? e.date : today(), 'date')}${sel('البند', 'category', [...EXP_CATS, ASSET_CAT], e ? e.category : EXP_CATS[0])}${f('المبلغ', 'amount', e ? e.amount : '', 'number')}${f('ملاحظة', 'note', e ? e.note : '')}<p class="hint">بند «${ASSET_CAT}» (مثل شراء طابعة) يخرج من الصندوق ولا يُخصم من ربح الشهر.</p>`, () => {
      const v = formData();
      if (!(+v.amount > 0) || !v.date) return fail('أدخل المبلغ والتاريخ');
      const r = { date: v.date, category: v.category, amount: +v.amount, note: v.note, asset: v.category === ASSET_CAT }; if (d.id) r.id = d.id;
      upsert('expenses', r); closeModal(); save(); toast('تم الحفظ'); return true;
    }, delBtn('expenses', d.id));
  },
  partner(d) {
    const p = d.id ? byId(db, 'partners', d.id) : null;
    modal(p ? 'تعديل شريك' : 'شريك جديد', `${f('الاسم', 'name', p ? p.name : '')}${f('نسبة الأرباح %', 'share', p ? p.share : '', 'number')}${f('رأس مال سابق (موجود قبل البرنامج)', 'openingCapital', p ? p.openingCapital : 0, 'number')}<p class="hint">تغيير النسبة يطبق على التقسيمات القادمة فقط.</p>`, () => {
      const v = formData();
      if (!v.name.trim()) return fail('اكتب الاسم');
      if (!(+v.share >= 0 && +v.share <= 100)) return fail('النسبة بين 0 و100');
      const r = { name: v.name.trim(), share: +v.share, openingCapital: +v.openingCapital || 0 }; if (d.id) r.id = d.id;
      upsert('partners', r); closeModal(); save(); toast('تم الحفظ'); return true;
    }, delBtn('partners', d.id));
  },
  partnerView(d) {
    const p = byId(db, 'partners', d.id), a = C.partnerAccount(db, p);
    const txs = live(db, 'partnerTx').filter(t => t.partnerId === p.id).sort((x, y) => y.date.localeCompare(x.date));
    modal(esc(p.name), `<div class="rows card"><div><span>رأس المال</span>${money(a.capital)}</div><div><span>أرباح موزعة</span>${money(a.profit)}</div><div><span>مسحوبات</span>${money(a.withdrawn)}</div><div class="total"><span>الرصيد</span>${money(a.balance)}</div></div>
    <div class="list">${txs.map(t => `<div class="item static"><div><b>${t.type === 'capital' ? 'رأس مال' : 'سحب'}</b><span class="sub"><span class="num">${t.date}</span> ${esc(t.note || '')}</span></div><div class="end">${money(t.amount)}<br><button type="button" class="btn danger" style="min-height:36px;padding:2px 10px" data-act="del" data-c="partnerTx" data-id="${t.id}">حذف</button></div></div>`).join('') || empty('لا توجد حركات')}</div>`, null,
      `<button type="button" class="btn pri" data-act="partnerTx" data-id="${p.id}">رأس مال / سحب</button><button type="button" class="btn" data-act="partner" data-id="${p.id}">تعديل</button>`);
  },
  partnerTx(d) {
    const ps = live(db, 'partners');
    if (!ps.length) return toast('أضف شريكاً أولاً');
    modal('حركة شريك', `${f('التاريخ', 'date', today(), 'date')}${sel('الشريك', 'partnerId', ps.map(p => [p.id, p.name]), d.id || '')}${sel('النوع', 'type', [['withdraw', 'سحب / استلام أرباح'], ['capital', 'إضافة رأس مال']], 'withdraw')}${f('المبلغ', 'amount', '', 'number')}${f('ملاحظة', 'note')}`, () => {
      const v = formData();
      if (!(+v.amount > 0) || !v.date) return fail('أدخل المبلغ والتاريخ');
      upsert('partnerTx', { date: v.date, partnerId: v.partnerId, type: v.type, amount: +v.amount, note: v.note });
      closeModal(); save(); toast('تم التسجيل'); return true;
    });
  },
  approve() {
    const ps = live(db, 'partners');
    if (!ps.length) return toast('أضف الشركاء أولاً');
    if (r2(ps.reduce((s, p) => s + +p.share, 0)) !== 100) return toast('مجموع النسب يجب أن يكون 100%');
    const pct = +$('#reserve').value || 0;
    if (pct < 0 || pct > 100) return toast('نسبة الاحتجاز بين 0 و100');
    const pv = C.distributionPreview(db, ui.distMonth, pct);
    if (!pv.net) return toast('لا يوجد ربح بهذا الشهر');
    if (!confirm(`اعتماد تقسيم ${ymName(ui.distMonth)} بقيمة ${plain(pv.distributable)}؟`)) return;
    upsert('distributions', { ...pv, date: today() }); ui.reserve = undefined; save(); toast('تم اعتماد التقسيم');
  },
  pickDist(d) { ui.distMonth = d.m; render(); window.scrollTo(0, 0); },
  printDist() {
    const ex = live(db, 'distributions').find(x => x.ym === ui.distMonth);
    printHtml(`<div class="inv"><div class="inv-h"><h2>تقسيم الأرباح - ${ymName(ui.distMonth)}</h2><img src="icons/icon-192.png" alt=""></div><div class="rows">${distRows(ex || C.distributionPreview(db, ui.distMonth, +$('#reserve').value || 0))}</div></div>`);
  },
  printReport() { printHtml(`<h2>${esc(db.settings.company)} - تقرير</h2>${$('#reportBody').innerHTML}`); },
  csv(d) {
    const cname = id => (byId(db, 'contacts', id) || {}).name || '';
    const st = C.stock(db);
    const T = {
      sales: () => [['رقم', 'التاريخ', 'الزبون', 'النوع', 'مرتجع', 'الإجمالي', 'المدفوع', 'الباقي', 'الأصناف'], ...live(db, 'sales').map(s => [s.no, s.date, cname(s.contactId), s.mode === 'wholesale' ? 'جملة' : 'مفرق', s.ret ? 'نعم' : '', docTotal(s), s.paid, r2(docTotal(s) - s.paid), s.lines.map(l => `${l.name} x${l.qty}`).join(' | ')])],
      purchases: () => [['رقم', 'التاريخ', 'المورد', 'الإجمالي', 'المدفوع', 'الباقي', 'الأصناف'], ...live(db, 'purchases').map(s => [s.no, s.date, cname(s.contactId), docTotal(s), s.paid, r2(docTotal(s) - s.paid), s.lines.map(l => `${l.name} x${l.qty}`).join(' | ')])],
      products: () => [['الاسم', 'التصنيف', 'الوحدة', 'المخزون', 'التكلفة', 'المفرق', 'الجملة'], ...live(db, 'products').map(p => [p.name, p.category, p.unit, p.track !== false ? r2(st[p.id].qty) : '', r2(st[p.id].avg), p.retail, p.wholesale])],
      expenses: () => [['التاريخ', 'البند', 'المبلغ', 'ملاحظة'], ...live(db, 'expenses').map(e => [e.date, e.category, e.amount, e.note])],
      contacts: () => [['الاسم', 'النوع', 'الهاتف', 'الرصيد'], ...live(db, 'contacts').map(c => [c.name, c.kind === 'customer' ? 'زبون' : 'مورد', c.phone, C.contactBalance(db, c)])]
    };
    csv('plastika-' + d.t, T[d.t]());
  },
  async syncNow() { toast(await Sync.run() ? 'تمت المزامنة' : Sync.status().message || 'تعذرت المزامنة'); },
  syncLogout() {
    if (!confirm('تسجيل الخروج من المزامنة؟ البيانات تبقى على هذا الجهاز.')) return;
    Sync.logout(); render();
  },
  backup() { download(backupName(), JSON.stringify(db), 'application/json'); markBackup(); toast('تم تنزيل النسخة'); },
  async shareBackup() {
    const file = new File([JSON.stringify(db)], backupName(), { type: 'application/json' });
    if (!navigator.canShare({ files: [file] })) return A.backup();
    try { await navigator.share({ files: [file], title: 'نسخة بلاستيكة' }); markBackup(); } catch (e) { /* user cancelled */ }
  },
  importBackup() { $('#file').click(); },
  wipe() {
    if (Sync.connected()) return toast('سجّل الخروج من المزامنة أولاً');
    if (prompt('سيتم مسح كل البيانات من هذا الجهاز نهائياً. اكتب كلمة: مسح') !== 'مسح') return;
    const s = db.settings; db = C.blank(); db.settings = { ...db.settings, company: s.company, phone: s.phone, address: s.address, currency: s.currency }; save(); toast('تم المسح');
  }
};

function calc() {
  const v = formData(), g = +v.c_g || 0;
  const material = r2(g / 1000 * (+v.c_kg || 0));
  const base = material + (+v.c_h || 0) * (+v.c_mh || 0);
  const full = r2(base * (1 + (+v.c_f || 0) / 100) + (+v.c_l || 0));
  const out = { material, full, retail: r2(full * (1 + (+v.c_r || 0) / 100)), wholesale: r2(full * (1 + (+v.c_w || 0) / 100)) };
  $('#calcR').innerHTML = `<div><span>تكلفة المادة</span>${money(material)}</div><div><span>التكلفة الكاملة</span>${money(full)}</div><div class="total"><span>مفرق مقترح</span>${money(out.retail)}</div><div class="total"><span>جملة مقترح</span>${money(out.wholesale)}</div>`;
  return out;
}

// ---------- events ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.tagName === 'A') e.preventDefault();
  A[el.dataset.act](el.dataset, el);
});
dlg.addEventListener('submit', e => { e.preventDefault(); if (submitFn) submitFn(); });
dlg.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'pk') drawPicker();
  if (t.dataset.l) { const l = cur.lines[+t.dataset.i]; l[t.dataset.l] = +t.value || 0; $('#ls' + t.dataset.i).textContent = num(l.qty * l.price); updateTotals(); }
  if (t.id === 'paid') cur.paidTouched = true;
  if (t.id === 'disc') updateTotals();
  if (t.id === 'paid') updateTotals();
  if ('calc' in t.dataset) calc();
});
dlg.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'mode') { cur.lines.forEach(l => { const p = byId(db, 'products', l.pid); if (p) l.price = linePrice(p); }); drawLines(); }
  if (t.name === 'ret') updateTotals();
});
$('#view').addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'reserve') { ui.reserve = +t.value || 0; $('#distRows').innerHTML = distRows(C.distributionPreview(db, ui.distMonth, ui.reserve)); return; }
  if (t.dataset.filter !== 'q') return;
  ui.q = t.value; const pos = t.selectionStart; render();
  const n = $('[data-filter="q"]'); n.focus(); n.setSelectionRange(pos, pos);
});
$('#view').addEventListener('change', e => { const k = e.target.dataset.filter; if (k && k !== 'q') { ui[k] = e.target.value; render(); } });
$('#view').addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'syncf') {
    const btn = $('#syncBtn'); btn.disabled = true; $('#syncErr').textContent = '';
    try { await Sync.login(Object.fromEntries(new FormData(e.target).entries())); render(); toast('تم ربط الجهاز'); }
    catch (err) { $('#syncErr').textContent = err.message; btn.disabled = false; }
    return;
  }
  if (e.target.id !== 'setf') return;
  const v = Object.fromEntries(new FormData(e.target).entries());
  ['openingCash', 'rate', 'filamentKg', 'machineHour', 'powerHour', 'failPct', 'retailMarkup', 'wholesaleMarkup'].forEach(k => (v[k] = +v[k] || 0));
  db.settings = { ...db.settings, ...v, updatedAt: Date.now() }; save(); toast('تم الحفظ');
});
$('#file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const o = JSON.parse(await file.text());
    if (!C.isValidBackup(o)) throw new Error('bad file');
    const b = C.blank();
    db = C.merge(db, { ...b, ...o }); save(); Sync.resendAll(); toast('تم دمج النسخة');
  } catch (err) { toast('الملف غير صالح'); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

(async () => {
  await load();
  render();
  Sync.start();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
})();
