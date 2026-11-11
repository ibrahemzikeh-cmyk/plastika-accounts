// Accounting engine: pure functions over the db object (no DOM), tested by tests.js.
(function (root) {
  const COLLS = ['products', 'contacts', 'sales', 'purchases', 'productions', 'adjustments', 'expenses', 'payments', 'partners', 'partnerTx', 'distributions', 'rates'];

  const blank = () => {
    const db = {
      version: 1,
      settings: {
        company: 'بلاستيكة', slogan: '3D Printing • Printers • Filament', phone: '0992246408', address: '',
        currency: '$', currency2: 'ل.س', rate: 0, openingCash: 0, shopPct: 16, roundStep: 10,
        filamentKg: 20, machineHour: 0.3, powerHour: 0.05, failPct: 5, retailMarkup: 100, wholesaleMarkup: 50,
        lastBackup: 0, updatedAt: 0
      }
    };
    COLLS.forEach(c => (db[c] = []));
    return db;
  };

  const r2 = n => Math.round(((+n || 0) + Number.EPSILON * Math.sign(+n || 0)) * 100) / 100;
  const live = (db, c) => db[c].filter(x => !x.deleted);
  const byId = (db, c, id) => db[c].find(x => x.id === id && !x.deleted);
  const docSub = d => d.lines.reduce((s, l) => s + (+l.qty || 0) * (+l.price || 0), 0);
  const docTotal = d => r2(docSub(d) - (+d.discount || 0));
  const sign = d => (d.ret ? -1 : 1);
  const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
  const monthRange = ym => [ym + '-01', ym + '-31'];

  function events(db, until) {
    const ev = [];
    const add = (c, type) => live(db, c).forEach(d => {
      if (!until || d.date <= until) ev.push({ type, d });
    });
    add('purchases', 'purchase'); add('sales', 'sale'); add('productions', 'production'); add('adjustments', 'adjust');
    return ev.sort((a, b) => a.d.date.localeCompare(b.d.date) || (a.d.createdAt || 0) - (b.d.createdAt || 0));
  }

  // Replays stock movements using weighted-average cost. Returns { productId: { qty, avg } }.
  function stock(db, until) {
    const st = {}, tracked = {};
    live(db, 'products').forEach(p => {
      tracked[p.id] = p.track !== false;
      st[p.id] = { qty: tracked[p.id] ? +p.stock || 0 : 0, avg: +p.cost || 0 };
    });
    const inc = (id, n, cost) => {
      if (!st[id] || !tracked[id]) return;
      const c = st[id], base = Math.max(c.qty, 0);
      c.avg = base + n > 0 ? (base * c.avg + n * cost) / (base + n) : cost;
      c.qty += n;
    };
    const dec = (id, n) => { if (st[id] && tracked[id]) st[id].qty -= n; };
    events(db, until).forEach(({ type, d }) => {
      if (type === 'purchase') {
        const sub = docSub(d), f = sub > 0 ? (sub - (+d.discount || 0)) / sub : 1;
        d.lines.forEach(l => inc(l.pid, +l.qty, +l.price * f));
      } else if (type === 'sale') {
        d.lines.forEach(l => (d.ret ? inc(l.pid, +l.qty, +l.cost || 0) : dec(l.pid, +l.qty)));
      } else if (type === 'production') {
        const matAvg = st[d.matPid] ? st[d.matPid].avg : 0;
        dec(d.matPid, +d.matQty);
        inc(d.pid, +d.qty, (+d.matQty * matAvg) / (+d.qty || 1));
      } else if (+d.qty > 0) {
        inc(d.pid, +d.qty, st[d.pid] ? st[d.pid].avg : 0);
      } else {
        dec(d.pid, -d.qty);
      }
    });
    return st;
  }

  const inventoryValue = db => {
    const st = stock(db);
    return r2(live(db, 'products').filter(p => p.track !== false).reduce((s, p) => s + st[p.id].qty * st[p.id].avg, 0));
  };

  function pl(db, from, to) {
    const o = { sales: 0, retail: 0, wholesale: 0, cogs: 0, expenses: 0, assets: 0, adj: 0, byCat: {}, count: 0 };
    live(db, 'sales').filter(s => inRange(s.date, from, to)).forEach(s => {
      const t = docTotal(s) * sign(s);
      o.sales += t; o.count++;
      o[s.mode === 'wholesale' ? 'wholesale' : 'retail'] += t;
      o.cogs += s.lines.reduce((c, l) => c + (+l.qty) * (+l.cost || 0), 0) * sign(s);
    });
    live(db, 'expenses').filter(e => inRange(e.date, from, to)).forEach(e => {
      if (e.asset) { o.assets += +e.amount; return; }
      o.expenses += +e.amount;
      o.byCat[e.category] = (o.byCat[e.category] || 0) + +e.amount;
    });
    live(db, 'adjustments').filter(a => inRange(a.date, from, to)).forEach(a => (o.adj += +a.value || 0));
    o.gross = o.sales - o.cogs;
    o.net = o.gross - o.expenses + o.adj;
    ['sales', 'retail', 'wholesale', 'cogs', 'expenses', 'assets', 'adj', 'gross', 'net'].forEach(k => (o[k] = r2(o[k])));
    return o;
  }

  function productSales(db, from, to) {
    const m = {};
    live(db, 'sales').filter(s => inRange(s.date, from, to)).forEach(s => {
      const sub = docSub(s), f = sub > 0 ? docTotal(s) / sub : 1;
      s.lines.forEach(l => {
        const k = l.pid || 'once:' + l.name;
        const x = (m[k] = m[k] || { pid: l.pid, name: l.name, qty: 0, revenue: 0, profit: 0 });
        const rev = l.qty * l.price * f * sign(s);
        x.qty += l.qty * sign(s); x.revenue += rev; x.profit += rev - l.qty * (l.cost || 0) * sign(s);
      });
    });
    return Object.values(m).map(x => ({ ...x, revenue: r2(x.revenue), profit: r2(x.profit) })).sort((a, b) => b.revenue - a.revenue);
  }

  // Positive means: a customer owes us / we owe a supplier.
  function contactBalance(db, c) {
    let b = +c.opening || 0;
    if (c.kind === 'customer') {
      live(db, 'sales').filter(s => s.contactId === c.id).forEach(s => (b += (docTotal(s) - (+s.paid || 0)) * sign(s)));
      live(db, 'payments').filter(p => p.contactId === c.id).forEach(p => (b += p.dir === 'in' ? -p.amount : +p.amount));
    } else {
      live(db, 'purchases').filter(s => s.contactId === c.id).forEach(s => (b += docTotal(s) - (+s.paid || 0)));
      live(db, 'payments').filter(p => p.contactId === c.id).forEach(p => (b += p.dir === 'out' ? -p.amount : +p.amount));
    }
    return r2(b);
  }

  const debts = db => {
    let receivable = 0, payable = 0;
    live(db, 'contacts').forEach(c => { const b = contactBalance(db, c); if (c.kind === 'customer') receivable += b; else payable += b; });
    return { receivable: r2(receivable), payable: r2(payable) };
  };

  // Every cash movement, newest first.
  function cashLog(db) {
    const name = id => { const c = byId(db, 'contacts', id); return c ? c.name : ''; };
    const log = [];
    const push = (date, amount, title, note, createdAt) => { if (amount) log.push({ date, amount: r2(amount), title, note: note || '', createdAt: createdAt || 0 }); };
    live(db, 'sales').forEach(s => push(s.date, (+s.paid || 0) * sign(s), (s.ret ? 'مرتجع #' : 'مبيعات #') + s.no, name(s.contactId) || 'زبون نقدي', s.createdAt));
    live(db, 'purchases').forEach(s => push(s.date, -(+s.paid || 0), 'مشتريات #' + s.no, name(s.contactId), s.createdAt));
    live(db, 'expenses').forEach(e => push(e.date, -e.amount, e.category, e.note, e.createdAt));
    live(db, 'payments').forEach(p => push(p.date, p.dir === 'in' ? +p.amount : -p.amount, p.dir === 'in' ? 'قبض من ' + name(p.contactId) : 'دفع إلى ' + name(p.contactId), p.note, p.createdAt));
    live(db, 'partnerTx').forEach(t => {
      const pn = (byId(db, 'partners', t.partnerId) || {}).name || '';
      push(t.date, t.type === 'capital' ? +t.amount : -t.amount, (t.type === 'capital' ? 'رأس مال: ' : 'سحب شريك: ') + pn, t.note, t.createdAt);
    });
    return log.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  const cash = db => r2((+db.settings.openingCash || 0) + cashLog(db).reduce((s, x) => s + x.amount, 0));

  function partnerAccount(db, p) {
    let capital = +p.openingCapital || 0, withdrawn = 0, profit = 0;
    live(db, 'partnerTx').filter(t => t.partnerId === p.id).forEach(t => { if (t.type === 'capital') capital += +t.amount; else withdrawn += +t.amount; });
    live(db, 'distributions').forEach(d => d.shares.filter(s => s.partnerId === p.id).forEach(s => (profit += +s.amount)));
    return { capital: r2(capital), withdrawn: r2(withdrawn), profit: r2(profit), balance: r2(capital + profit - withdrawn) };
  }

  // Splits a month's net profit; rounding remainder goes to the last partner so shares always sum exactly.
  function distributionPreview(db, ym, reservePct) {
    const [from, to] = monthRange(ym);
    const net = pl(db, from, to).net;
    const reserve = net > 0 ? r2(net * (+reservePct || 0) / 100) : 0;
    const distributable = r2(net - reserve);
    const partners = live(db, 'partners');
    let left = distributable;
    const shares = partners.map((p, i) => {
      const amount = i === partners.length - 1 ? r2(left) : r2(distributable * (+p.share || 0) / 100);
      left = r2(left - amount);
      return { partnerId: p.id, name: p.name, pct: +p.share || 0, amount };
    });
    return { ym, net, reservePct: +reservePct || 0, reserve, distributable, shares };
  }

  function balanceSheet(db) {
    const d = debts(db), inv = inventoryValue(db), c = cash(db), all = pl(db);
    const equipment = all.assets;
    const assets = r2(c + inv + d.receivable + equipment);
    const opening = live(db, 'products').filter(p => p.track !== false).reduce((s, p) => s + (+p.stock || 0) * (+p.cost || 0), 0)
      + (+db.settings.openingCash || 0)
      + live(db, 'contacts').reduce((s, x) => s + (x.kind === 'customer' ? 1 : -1) * (+x.opening || 0), 0);
    const partners = live(db, 'partners').reduce((s, p) => s + partnerAccount(db, p).balance, 0) - live(db, 'partners').reduce((s, p) => s + (+p.openingCapital || 0), 0);
    const distNet = live(db, 'distributions').reduce((s, x) => s + x.net, 0);
    const reserves = live(db, 'distributions').reduce((s, x) => s + x.reserve, 0);
    const undistributed = r2(all.net - distNet);
    const equity = r2(opening + partners + reserves + undistributed);
    return { cash: c, inventory: inv, receivable: d.receivable, equipment, assets, payable: d.payable, opening: r2(opening), partners: r2(partners), reserves: r2(reserves), undistributed, equity, diff: r2(assets - d.payable - equity) };
  }

  // Combines two copies of the data record by record; the most recently changed version wins.
  function merge(a, b) {
    const out = blank();
    COLLS.forEach(c => {
      const m = new Map();
      [...(a[c] || []), ...(b[c] || [])].forEach(x => {
        const cur = m.get(x.id);
        if (!cur || (x.updatedAt || 0) >= (cur.updatedAt || 0)) m.set(x.id, x);
      });
      out[c] = [...m.values()];
    });
    const sa = a.settings || {}, sb = b.settings || {};
    out.settings = { ...out.settings, ...((sb.updatedAt || 0) > (sa.updatedAt || 0) ? sb : sa) };
    return out;
  }

  const isValidBackup = o => !!o && typeof o === 'object' && !!o.settings && ['products', 'sales', 'purchases'].every(c => Array.isArray(o[c]));

  // Exchange rate in force on a date: the latest one set on or before it, else the earliest known.
  function rateAt(db, date) {
    const rs = live(db, 'rates').filter(r => +r.rate > 0).sort((a, b) => a.date.localeCompare(b.date));
    let found = null;
    rs.forEach(r => { if (!date || r.date <= date) found = r; });
    return found ? +found.rate : rs.length ? +rs[0].rate : +(db.settings && db.settings.rate) || 0;
  }

  root.Core = { COLLS, blank, r2, live, byId, docSub, docTotal, sign, inRange, monthRange, stock, inventoryValue, pl, productSales, contactBalance, debts, cashLog, cash, partnerAccount, distributionPreview, balanceSheet, merge, isValidBackup, rateAt };
})(typeof window !== 'undefined' ? window : globalThis);
