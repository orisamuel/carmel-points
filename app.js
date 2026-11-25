'use strict';
/* הנקודות של כרמל: the whole front end. Vanilla JS, no build step.
   Everything personal (photos, prizes, words, phone numbers) comes from the server, and only
   after login. Writes go through an outbox: the screen shows them at once, the server catches up. */

// ============================================================ basics
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('cp.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cp.' + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem('cp.' + k); } catch { /* private mode */ } },
};
const uid = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 24);
const two = (n) => String(n).padStart(2, '0');
const int = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; };
const fmtNum = (n) => Number(n || 0).toLocaleString('he-IL');
const NAME = { dad: 'אבא', mom: 'אמא', carmel: 'כרמל' };
const ROLE_OF = { 'אבא': 'dad', 'אמא': 'mom', 'כרמל': 'carmel' };
// The mood buttons and every word about feelings come from the server (texts.gs), after login.
const moodOf = (v, key) => (v.moodDefs || []).find((d) => d.key === key) || null;
const moodLabel = (v, key) => { const d = moodOf(v, key); return d ? `${d.e} ${d.t}` : ''; };
const TX = (v, k) => (v.texts && v.texts[k]) || '';
const ST ={ pending: 'ממתינה', approved: 'אושרה', declined: 'לא הפעם', canceled: 'בוטלה', delivered: 'קיבלה' };
const TZ = 'Asia/Jerusalem';

// local testing only: point the site at the mock server with ?api=http://127.0.0.1:8792
if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  const a = new URLSearchParams(location.search).get('api');
  if (a) CONFIG.SCRIPT_URL = a;
}

// ============================================================ the ladder
const UNITS = [
  { name: 'טונטון', many: 'טונטונים', e: '🐋', size: 14400 },
  { name: 'צל"ש', many: 'צל"שים', e: '🎖️', size: 1440 },
  { name: "צ'ונגון", many: "צ'ונגונים", e: '🍡', size: 480 },
  { name: 'מגדנה', many: 'מגדנות', e: '🍬', size: 120 },
  { name: 'כוכב', many: 'כוכבים', e: '⭐', size: 20 },
  { name: 'נקודה', many: 'נקודות', e: '✨', size: 1 },
];
function parts(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  const out = [];
  for (const u of UNITS) { const c = Math.floor(n / u.size); if (c) { out.push({ u, c }); n -= c * u.size; } }
  return out;
}
const unitWord = (u, c) => (c === 1 ? u.name : `${c} ${u.many}`);
function amountText(n) {
  const p = parts(n);
  if (!p.length) return '0 נקודות';
  const w = p.map(({ u, c }) => unitWord(u, c));
  if (w.length === 1) return w[0];
  const last = w.pop();
  return w.join(', ') + (/^\d/.test(last) ? ' ו-' : ' ו') + last;
}
const topEmoji = (n) => (parts(n)[0] || { u: UNITS[5] }).u.e;
function coinsHTML(n, big) {
  const p = parts(n);
  const coin = (e, c, label) => `<span class="coin"><span class="e" aria-hidden="true">${e}</span><b class="num">${c}</b>${esc(label)}</span>`;
  const inner = p.length ? p.map(({ u, c }) => coin(u.e, c, c === 1 ? u.name : u.many)).join('') : coin('✨', 0, 'נקודות');
  return `<div class="coins${big ? ' big' : ''}">${inner}</div>`;
}
function starBar(n) {
  n = Math.max(0, n);
  const rem = n % 20, need = 20 - rem;
  return `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="20" aria-valuenow="${rem}" aria-label="התקדמות לכוכב הבא"><i style="width:${(rem / 20) * 100}%"></i></div>
    <p class="sub">עוד ${need === 1 ? 'נקודה אחת' : need + ' נקודות'} לכוכב הבא ⭐</p>`;
}
// Amounts are always said in the ladder's own things (2 מגדנות), never as a big number of points.
// The amount picker: how many + which thing. Stored as points underneath.
const PICK = [...UNITS].reverse();                                   // נקודה, כוכב, מגדנה, ...
function splitAmount(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  for (const u of UNITS) if (n && n % u.size === 0) return { qty: n / u.size, size: u.size };
  return { qty: n, size: 1 };
}
function pickerHTML(points, fields) {
  const { qty, size } = points ? splitAmount(points) : { qty: '', size: 20 };   // empty: starts on כוכבים
  const q = fields ? draftVal(fields.qty, qty || '') : (qty || '');
  const s = int(fields ? draftVal(fields.unit, size) : size) || 20;
  const fq = fields ? ` data-field="${fields.qty}"` : '', fu = fields ? ` data-field="${fields.unit}"` : '';
  return `<div class="amount">
    <input class="in num" type="number" inputmode="numeric" min="1" value="${esc(q)}" data-amt-qty${fq} aria-label="כמה">
    <select class="in" data-amt-unit${fu} aria-label="מה">${PICK.map((u) => `<option value="${u.size}"${u.size === s ? ' selected' : ''}>${u.e} ${int(q) === 1 ? u.name : u.many}</option>`).join('')}</select>
  </div>`;
}
const readAmount = (el) => { const q = int($('[data-amt-qty]', el).value), s = int($('[data-amt-unit]', el).value); return q > 0 && s > 0 ? q * s : 0; };
// "1 כוכב", "3 כוכבים": the names in the list follow the number
function relabelPicker(box) {
  const one = int($('[data-amt-qty]', box).value) === 1;
  $$('[data-amt-unit] option', box).forEach((o) => { const u = PICK.find((x) => x.size === int(o.value)); if (u) o.textContent = `${u.e} ${one ? u.name : u.many}`; });
}
const setAmount = (el, points) => { const { qty, size } = splitAmount(points); $('[data-amt-qty]', el).value = qty; $('[data-amt-unit]', el).value = String(size); relabelPicker($('.amount', el) || el); };
function ladderHTML() {
  const rows = [[20, 'נקודות', '✨', 'כוכב', '⭐'], [6, 'כוכבים', '⭐', 'מגדנה', '🍬'], [4, 'מגדנות', '🍬', "צ'ונגון", '🍡'], [3, "צ'ונגונים", '🍡', 'צל"ש', '🎖️'], [10, 'צל"שים', '🎖️', 'טונטון', '🐋']];
  return `<div class="conv">${rows.map(([n, a, ea, b, eb]) => `<div class="conv-row"><span class="conv-from"><span class="e" aria-hidden="true">${ea}</span>${n} ${esc(a)}</span><span class="conv-eq" aria-hidden="true">=</span><span class="conv-to"><span class="e" aria-hidden="true">${eb}</span>${esc(b)}</span></div>`).join('')}</div>`;
}

// ============================================================ time
const fmtWhen = (ms) => new Intl.DateTimeFormat('he-IL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms);
function ago(ms) {
  if (!ms) return '';
  const d = Date.now() - ms;
  if (d < 60e3) return 'עכשיו';
  const m = Math.round(d / 60e3);
  if (m < 60) return m === 1 ? 'לפני דקה' : `לפני ${m} דקות`;
  const h = Math.round(d / 3600e3);
  if (h < 24) return h === 1 ? 'לפני שעה' : h === 2 ? 'לפני שעתיים' : `לפני ${h} שעות`;
  return new Intl.DateTimeFormat('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms);
}
function untilParts(t) {
  let d = Math.max(0, t - Date.now());
  const days = Math.floor(d / 864e5); d -= days * 864e5;
  const h = Math.floor(d / 36e5); d -= h * 36e5;
  const m = Math.floor(d / 6e4); d -= m * 6e4;
  return { days, h, m, s: Math.floor(d / 1e3) };
}
function shortUntil(t) {
  const p = untilParts(t);
  if (p.days) return `עוד ${p.days === 1 ? 'יום' : p.days + ' ימים'} ו-${p.h} שעות`;
  if (p.h) return `עוד ${p.h === 1 ? 'שעה' : p.h + ' שעות'} ו-${p.m} דקות`;
  return `עוד ${p.m} דקות`;
}
const toLocalInput = (ms) => {
  if (!ms) return '';
  const d = new Date(Number(ms));
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
};
const fromLocalInput = (s) => (s ? new Date(s).getTime() || 0 : 0);
function nextThursday15() {
  const d = new Date();
  const add = (4 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + add); d.setHours(15, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 7);
  return d.getTime();
}
const fmtPhone = (p) => (/^9725\d{8}$/.test(p || '') ? '0' + p.slice(3, 5) + '-' + p.slice(5) : '');

// ============================================================ state
const S = {
  token: LS.get('token', ''),
  role: LS.get('role', ''),
  server: LS.get('state', null),
  photos: LS.get('photos', null),
  outbox: LS.get('outbox', []),
  tab: LS.get('tab', ''),
  draft: LS.get('draft', {}),
  lastMoodSeen: LS.get('lastMoodSeen', ''),
  shownLocal: LS.get('shownLocal', {}),
  img: null, fresh: new Set(), flushing: false, refreshing: false, sheetOpen: false, ignorePop: 0,
  login: { role: LS.get('lastRole', ''), status: null },
};
const isParent = () => S.role === 'dad' || S.role === 'mom';
const saveDraft = () => {
  const keep = {};
  for (const [k, v] of Object.entries(S.draft)) if (!k.startsWith('code')) keep[k] = v;   // codes never touch storage
  LS.set('draft', keep);
};

// ============================================================ server
class AuthError extends Error {}
async function api(action, payload = {}, tries = 2) {
  if (!CONFIG.SCRIPT_URL) throw new Error('האתר עוד לא מחובר לשרת');
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(CONFIG.SCRIPT_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },     // text/plain: no CORS preflight
        body: JSON.stringify({ ...payload, action, token: S.token }), signal: ctrl.signal,
      });
      const j = await res.json();
      if (j && j.authError) { signOut(j.message); throw new AuthError(j.message); }
      return j;
    } catch (e) {
      if (e instanceof AuthError || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1200));
    } finally { clearTimeout(timer); }
  }
  throw new Error('no answer');
}

function setNet(ok) {
  const el = $('#net');
  if (ok) { el.classList.add('hidden'); return; }
  el.textContent = S.outbox.length ? 'אין חיבור כרגע. מה ששלחת יישלח כשיחזור.' : 'אין חיבור כרגע. מוצג המצב האחרון.';
  el.classList.remove('hidden');
}

function applyState(st) {
  if (!st || !st.success) return;
  const prev = S.server;
  // A slow answer that left the server before a newer one must not put old data back.
  if (prev && prev.role === st.role && st.now && prev.now && st.now < prev.now) return;
  S.server = st;
  LS.set('state', st);
  if (st.role && st.role !== S.role) { S.role = st.role; LS.set('role', st.role); }
  if (isParent()) noticeMood(prev, st);
  if (st.photos && (!S.photos || S.photos.version !== st.photos)) loadPhotos();
  render();
}

async function refresh() {
  if (!S.token || S.refreshing) return;
  S.refreshing = true;
  try {
    if (S.outbox.length) await flush();
    const st = await api('getState');
    setNet(true);
    applyState(st);
  } catch (e) { if (!(e instanceof AuthError)) setNet(false); }
  finally { S.refreshing = false; }
}

// The outbox: each write keeps its own id, so sending it twice does nothing twice.
function send(action, payload) {
  const p = { ...payload, at: Date.now() };
  S.outbox.push({ action, payload: p });
  LS.set('outbox', S.outbox);
  render();
  flush();
  return p;
}
async function flush() {
  if (S.flushing || !S.token || !S.outbox.length) return;
  S.flushing = true;
  try {
    while (S.outbox.length && S.token) {
      const it = S.outbox[0];
      let r;
      try { r = await api(it.action, it.payload); }
      catch (e) { if (!(e instanceof AuthError)) setNet(false); return; }
      setNet(true);
      S.outbox.shift();
      LS.set('outbox', S.outbox);
      if (r && r.success) { if (r.state) applyState(r.state); }
      else { toast((r && r.message) || 'משהו לא הצליח'); try { applyState(await api('getState')); } catch { /* next poll */ } }
    }
  } finally { S.flushing = false; render(); }
}
function beaconOutbox() {
  if (!S.token || !S.outbox.length || !navigator.sendBeacon) return;
  for (const it of S.outbox) {
    try { navigator.sendBeacon(CONFIG.SCRIPT_URL, JSON.stringify({ ...it.payload, action: it.action, token: S.token })); } catch { /* the next visit resends */ }
  }
}

// What the screen shows: the server's state, plus the writes still on their way.
const OVERLAY = {
  requestPoints(v, p) { v.requests.unshift({ id: p.id, at: p.at, points: p.points, reason: p.reason || '', status: ST.pending, _pending: true }); },
  cancelRequest(v, p) { const r = v.requests.find((x) => x.id === p.id); if (r && r.status === ST.pending) r.status = ST.canceled; },
  setMood(v, p) { v.moods = [{ id: p.id, at: p.at, mood: p.mood, _pending: true }]; },
  orderPrize(v, p) {
    const pr = v.prizes.find((x) => x.id === p.prizeId); if (!pr) return;
    v.orders.unshift({ id: p.id, at: p.at, prizeId: pr.id, name: pr.emoji + ' ' + pr.name, price: pr.price, status: ST.pending, _pending: true });
    v.reserved += pr.price;
  },
  cancelOrder(v, p) { const o = v.orders.find((x) => x.id === p.id); if (o && o.status === ST.pending) { o.status = ST.canceled; v.reserved -= o.price; } },
  readWords(v, p) { v.words.forEach((w) => { if (p.ids.includes(w.id) && !w.read) w.read = p.at; }); },
  givePoints(v, p) { v.ledger.unshift({ id: p.id, at: p.at, who: NAME[S.role], points: p.points, reason: p.reason || '', type: 'מתנה', _pending: true }); v.balance += p.points; },
  deleteGrant(v, p) { const i = v.ledger.findIndex((x) => x.id === p.id); if (i >= 0) { v.balance -= v.ledger[i].points; v.ledger.splice(i, 1); } },
  decideRequest(v, p) {
    const r = v.requests.find((x) => x.id === p.id); if (!r || r.status !== ST.pending) return;
    r.by = NAME[S.role];
    if (p.approve) {
      const pts = p.points || r.points;
      r.status = ST.approved; r.got = pts; v.balance += pts;
      v.ledger.unshift({ id: 'r-' + r.id, at: p.at, who: NAME[S.role], points: pts, reason: r.reason, type: 'בקשה', _pending: true });
    } else r.status = ST.declined;
  },
  decideOrder(v, p) {
    const o = v.orders.find((x) => x.id === p.id); if (!o || o.status !== ST.pending) return;
    v.reserved -= o.price;
    if (p.approve) {
      o.status = ST.approved; v.balance -= o.price;
      v.ledger.unshift({ id: 'o-' + o.id, at: p.at, who: NAME[S.role], points: -o.price, reason: o.name, type: 'פרס', _pending: true });
    } else o.status = ST.declined;
  },
  deliverOrder(v, p) { const o = v.orders.find((x) => x.id === p.id); if (o && o.status === ST.approved) o.status = ST.delivered; },
  writeWords(v, p) { v.words.unshift({ id: p.id, at: p.at, from: NAME[S.role], text: p.text, kind: p.kind, read: 0, shown: 0, _pending: true }); },
  deleteWords(v, p) { v.words = v.words.filter((w) => w.id !== p.id); },
  setHomeAt(v, p) { v.homeAt = p.homeAt; },
  savePrize(v, p) {
    const x = v.prizes.find((z) => z.id === p.id);
    if (x) Object.assign(x, { emoji: p.emoji, name: p.name, price: p.price, active: p.active !== false });
    else v.prizes.push({ id: p.id, emoji: p.emoji, name: p.name, price: p.price, active: p.active !== false, _pending: true });
    v.prizes.sort((a, b) => a.price - b.price);
  },
  setPhone(v, p) { v.phones[p.role] = p.norm || ''; },
  saveRule(v, p) {
    const x = v.rules.find((z) => z.id === p.id);
    if (x) Object.assign(x, { emoji: p.emoji, text: p.text, points: p.points, active: p.active !== false });
    else v.rules.push({ id: p.id, emoji: p.emoji, text: p.text, points: p.points, active: p.active !== false, _pending: true });
  },
  deleteRule(v, p) { v.rules = v.rules.filter((x) => x.id !== p.id); },
};
function view() {
  const v = JSON.parse(JSON.stringify(S.server || {}));
  for (const k of ['prizes', 'rules', 'requests', 'orders', 'ledger', 'words', 'moods', 'hardNotes']) v[k] = v[k] || [];
  v.phones = v.phones || {}; v.codes = v.codes || {};
  v.balance = v.balance || 0; v.reserved = v.reserved || 0;
  for (const it of S.outbox) { const f = OVERLAY[it.action]; if (f) try { f(v, it.payload); } catch { /* ignore a stale write */ } }
  return v;
}

// ============================================================ photos (only after login)
function blobUrl(dataUrl) {
  try {
    const i = dataUrl.indexOf(',');
    const mime = (dataUrl.slice(0, i).match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(dataUrl.slice(i + 1));
    const u8 = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
    return URL.createObjectURL(new Blob([u8], { type: mime }));
  } catch { return dataUrl; }
}
function preparePhotos() {
  const p = S.photos;
  S.img = null;
  if (!p) return;
  S.img = { avatars: {}, hero: p.hero ? blobUrl(p.hero) : '', gallery: (p.gallery || []).map((g) => ({ src: blobUrl(g.src), w: g.w, h: g.h })) };
  for (const k of Object.keys(p.avatars || {})) S.img.avatars[k] = blobUrl(p.avatars[k]);
}
async function loadPhotos() {
  if (S.loadingPhotos || !S.token) return;
  S.loadingPhotos = true;
  try {
    const r = await api('getPhotos');
    if (r && r.success && r.version) {
      S.photos = { version: r.version, avatars: r.avatars || {}, hero: r.hero || '', gallery: r.gallery || [] };
      LS.set('photos', S.photos);
      preparePhotos();
      render();
    }
  } catch { /* the next state brings the version again */ }
  finally { S.loadingPhotos = false; }
}
function av(who, cls = '') {
  const role = ROLE_OF[who] || who;
  const src = S.img && S.img.avatars[role];
  const label = NAME[role] || who || '';
  return src ? `<img class="av ${cls}" src="${src}" alt="${esc(label)}">` : `<span class="av ${cls}" aria-hidden="true">${esc(label.charAt(0))}</span>`;
}

// ============================================================ login
function showLogin(msg = '') {
  $('#app').classList.add('hidden');
  const el = $('#login');
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="ladder-art" aria-hidden="true">⭐🍬🍡🎖️🐋</div>
    <h1>הנקודות של כרמל</h1>
    <section class="card stack">
      <h2>מי נכנס?</h2>
      <div class="who">
        <button type="button" data-role="dad"><span class="e" aria-hidden="true">👨</span>אבא</button>
        <button type="button" data-role="mom"><span class="e" aria-hidden="true">👩</span>אמא</button>
        <button type="button" data-role="carmel"><span class="e" aria-hidden="true">👧</span>כרמל</button>
      </div>
      <div id="codeBox" class="stack hidden">
        <p id="loginHint" class="hint"></p>
        <div class="pw"><input id="code" class="in" type="password" autocomplete="current-password" placeholder="הקוד שלך" aria-label="הקוד"><button type="button" id="showCode">להציג</button></div>
        <div id="code2Box" class="pw hidden"><input id="code2" class="in" type="password" autocomplete="new-password" placeholder="שוב, לאישור" aria-label="הקוד שוב"></div>
        <button id="enter" type="button" class="btn block" disabled>כניסה</button>
      </div>
      <p id="loginErr" class="err">${esc(msg)}</p>
    </section>`;
  hideBoot();
  $$('.who button', el).forEach((b) => b.addEventListener('click', () => { S.login.role = b.dataset.role; LS.set('lastRole', b.dataset.role); $('#loginErr').textContent = ''; updateLogin(); $('#code').focus(); }));
  $('#code').addEventListener('input', updateLogin);
  $('#code2').addEventListener('input', updateLogin);
  for (const id of ['#code', '#code2']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('#enter').disabled) doLogin(); });
  $('#showCode').addEventListener('click', () => {
    const show = $('#code').type === 'password';
    $('#code').type = $('#code2').type = show ? 'text' : 'password';
    $('#showCode').textContent = show ? 'להסתיר' : 'להציג';
  });
  $('#enter').addEventListener('click', doLogin);
  updateLogin();
  api('status').then((r) => { S.login.status = r; updateLogin(); }).catch((e) => { $('#loginErr').textContent = e.message === 'האתר עוד לא מחובר לשרת' ? e.message : 'אין חיבור לשרת. בודקים את האינטרנט ומנסים שוב.'; });
}
function updateLogin() {
  const role = S.login.role, st = S.login.status;
  $$('.who button').forEach((b) => b.classList.toggle('on', b.dataset.role === role));
  $('#codeBox').classList.toggle('hidden', !role);
  if (!role) return;
  const first = role === 'dad' && st && st.firstRun;
  const notYet = role === 'dad' && st && st.setupNeeded;
  const noCode = st && !first && st.codes && !st.codes[role];
  $('#code2Box').classList.toggle('hidden', !first);
  $('#code').closest('.pw').classList.toggle('hidden', !!noCode);
  $('#enter').classList.toggle('hidden', !!noCode);
  $('#loginHint').textContent = first ? 'פעם ראשונה: בוחרים קוד של 8 תווים לפחות, למשל מילה שרק אתה יודע.'
    : notYet ? 'האתר עוד לא הופעל: מריצים את setup בעורך הסקריפט, וחוזרים לכאן.'
    : noCode ?(role === 'carmel' ? 'עוד אין לך קוד. אבא או אמא קובעים אותו אצלם.' : 'עוד אין קוד לאמא. אבא קובע אותו אצלו.')
    : 'מקלידים את הקוד פעם אחת, והטלפון זוכר.';
  $('#code').autocomplete = first ? 'new-password' : 'current-password';
  $('#enter').textContent = first ? 'שומרים ונכנסים' : 'כניסה';
  const c = $('#code').value.trim();
  $('#enter').disabled = first ? c.length < 8 || c !== $('#code2').value.trim() : !c;
}
async function doLogin() {
  const role = S.login.role, code = $('#code').value.trim();
  $('#enter').disabled = true;
  $('#loginErr').textContent = '';
  try {
    const r = await api('login', { role, code });
    if (!r.success) throw new Error(r.message || 'לא הצלחנו להיכנס');
    S.token = r.token; S.role = r.role;
    LS.set('token', S.token); LS.set('role', S.role);
    S.tab = '';
    start();
  } catch (e) {
    $('#loginErr').textContent = e.message && !/fetch|network|abort/i.test(e.message) ? e.message : 'אין חיבור לשרת. מנסים שוב עוד רגע.';
    updateLogin();
  }
}
function signOut(msg) {
  S.token = ''; S.server = null; S.outbox = []; S.photos = null; S.img = null; S.draft = {};
  for (const k of ['token', 'role', 'state', 'outbox', 'photos', 'draft', 'tab', 'shownLocal', 'lastMoodSeen']) LS.del(k);
  closeSheet();
  showLogin(msg || '');
}
async function logout() {
  try { await api('logout', {}, 1); } catch { /* signing out anyway */ }
  signOut('יצאת מהטלפון הזה.');
}

// ============================================================ render
const CARMEL_TABS = [
  { id: 'home', e: '🏠', label: 'בית' },
  { id: 'shop', e: '🎁', label: 'חנות' },
  { id: 'words', e: '💌', label: 'מילים', badge: (v) => v.words.filter((w) => !w.read).length },
  { id: 'earn', e: '📖', label: 'איך צוברים' },
];
const PARENT_TABS = [
  { id: 'now', e: '⭐', label: 'עכשיו', badge: (v) => v.requests.filter((r) => r.status === ST.pending).length + v.orders.filter((o) => o.status === ST.pending).length },
  { id: 'pwords', e: '💌', label: 'מילים' },
  { id: 'pshop', e: '🎁', label: 'חנות' },
  { id: 'pearn', e: '📖', label: 'איך צוברים' },
  { id: 'settings', e: '⚙️', label: 'הגדרות' },
];
function render() {
  if (!S.token) return;
  const v = view();
  const tabs = isParent() ? PARENT_TABS : CARMEL_TABS;
  if (!tabs.some((t) => t.id === S.tab)) S.tab = tabs[0].id;
  // Only touch the DOM when something changed: a poll that brings nothing new keeps the
  // page exactly as it is (scroll, the photo strip, a half-typed field).
  const html = (isParent() ? PARENT_VIEWS : CARMEL_VIEWS)[S.tab](v);
  const tabsHtml = tabs.map((t) => {
    const n = t.badge ? t.badge(v) : 0;
    return `<button type="button" data-act="tab" data-tab="${t.id}" class="${t.id === S.tab ? 'on' : ''}"${t.id === S.tab ? ' aria-current="page"' : ''}><span class="e" aria-hidden="true">${t.e}</span>${t.label}${n ? `<span class="badge">${n}</span>` : ''}</button>`;
  }).join('');
  if (html !== S.viewHtml) {
    const keep = captureFocus();
    $('#view').innerHTML = html;
    S.viewHtml = html;
    restoreFocus(keep);
  }
  if (tabsHtml !== S.tabsHtml) { $('#tabs').innerHTML = tabsHtml; S.tabsHtml = tabsHtml; }
  tick();
  if (!isParent() && S.tab === 'words') markRead(v);
}
function captureFocus() {
  const a = document.activeElement;
  if (!a || !a.dataset || !a.dataset.field || !$('#view').contains(a)) return null;
  return { field: a.dataset.field, s: a.selectionStart, e: a.selectionEnd };
}
function restoreFocus(k) {
  if (!k) return;
  const el = $(`#view [data-field="${k.field}"]`);
  if (!el) return;
  el.focus({ preventScroll: true });
  try { if (k.s !== null && k.s !== undefined) el.setSelectionRange(k.s, k.e); } catch { /* number inputs */ }
}
const draftVal = (k, d = '') => (S.draft[k] !== undefined ? S.draft[k] : d);
const tagFor = (st) => {
  const cls = st === ST.pending ? 'wait' : st === ST.approved || st === ST.delivered ? 'yes' : 'no';
  const label = st === ST.pending ? '⏳ מחכה' : st === ST.approved ? '✓ אושרה' : st === ST.delivered ? '🎉 קיבלת' : st;
  return `<span class="tag ${cls}">${esc(label)}</span>`;
};
const sending = (x) => (x._pending ? ' <span class="meta pending-dot">שולח...</span>' : '');

// ---------------------------------------------------------------- Carmel
function countHTML(v) {
  const hero = S.img && S.img.hero;
  const style = hero ? ` style="background-image:url('${hero}')"` : '';
  const t = v.homeAt;
  if (t && t > Date.now()) {
    return `<section class="count"${style} aria-label="ספירה לאחור הביתה">
      <div>
        <p class="count-k">עוד</p>
        <div class="clock" data-countdown="${t}">
          <span data-days><b data-u="d">0</b><small>ימים</small></span>
          <span><b data-u="h">00</b><small>שעות</small></span>
          <span><b data-u="m">00</b><small>דקות</small></span>
          <span><b data-u="s">00</b><small>שניות</small></span>
        </div>
      </div>
      <p class="count-when">🏠 הביתה: ${esc(fmtWhen(t))}</p>
    </section>`;
  }
  const home = t && Date.now() - t < 3 * 864e5;
  return `<section class="count"${style}>
    <p class="count-when">${home ? '' : '🏠 הביתה: עוד לא נקבע מתי'}</p>
    <p class="count-home">${home ? '🏠 את בבית!' : ''}</p></section>`;
}
function nextPrizeHTML(v) {
  const avail = v.balance - v.reserved;
  const can = v.prizes.filter((p) => p.price <= avail);
  if (can.length) return `<p class="sub">יש לך מספיק ל${can.length === 1 ? 'פרס אחד' : '-' + can.length + ' פרסים'} בחנות 🎁</p>`;
  const next = v.prizes.filter((p) => p.price > avail).sort((a, b) => a.price - b.price)[0];
  return next ? `<p class="sub">הכי קרוב: ${esc(next.emoji)} ${esc(next.name)}. חסר לך ${esc(amountText(next.price - Math.max(0, avail)))}.</p>` : '';
}
function homeView(v) {
  const last = v.moods[0];
  const recent = (last && Date.now() - last.at < 6 * 3600e3) ? last.mood : '';
  const defs = v.moodDefs || [];
  const inner = (d) => `<span class="e" aria-hidden="true">${esc(d.e)}</span><span>${esc(d.t)}</span>`;
  const moodBtn = (d) => `<button type="button" class="mood m-${esc(d.key)}${recent === d.key ? ' picked' : ''}" data-act="mood" data-mood="${esc(d.key)}">${inner(d)}</button>`;
  // A button that cannot be pressed: it jumps away from the finger (see flee()).
  const runBtn = (d) => `<div class="run-zone"><button type="button" class="mood m-${esc(d.key)} run" data-run="${esc(d.key)}">${inner(d)}</button></div>`;
  const reqs = v.requests.filter((r) => r.status === ST.pending || Date.now() - r.at < 3 * 864e5).slice(0, 5);
  const led = v.ledger.slice(0, 4);
  return `
  <header class="top">${av('carmel')}<div class="hi"><small>היי</small><b>כרמל</b></div><button type="button" class="icon-btn" data-act="menu" aria-label="עוד">⋯</button></header>
  ${countHTML(v)}
  <section class="card">
    <h2>יש לך</h2>
    <div style="margin-top:10px">${coinsHTML(Math.max(0, v.balance), true)}</div>
    ${starBar(v.balance)}
    ${v.reserved > 0 ? `<p class="sub">מזה ${esc(amountText(v.reserved))} בצד, להזמנה שמחכה לאישור.</p>` : ''}
    ${nextPrizeHTML(v)}
    <div class="btns" style="margin-top:12px"><button type="button" class="btn" data-act="ask">✋ לבקש נקודות</button><button type="button" class="btn ghost" data-act="tab" data-tab="earn">📖 איך צוברים</button></div>
  </section>
  <section class="card">
    <h2>איך את?</h2>
    ${defs.length ? `<div class="moods">${defs.filter((d) => !d.runaway).map(moodBtn).join('')}</div>${defs.filter((d) => d.runaway).map(runBtn).join('')}` : '<p class="sub">רגע...</p>'}
    ${last && moodOf(v, last.mood) ? `<p class="sub">סימנת: ${esc(moodLabel(v, last.mood))} · ${ago(last.at)}${sending(last)}</p>` : ''}
  </section>
  ${reqs.length ? `<section class="card"><h2>הבקשות שלי</h2><div class="list">${reqs.map(myRequest).join('')}</div></section>` : ''}
  ${led.length ? `<section class="card"><h2>מה קרה לאחרונה</h2><div class="list">${led.map(ledgerItem).join('')}</div></section>` : ''}`;
}
function myRequest(r) {
  const got = r.status === ST.approved && r.got && r.got !== r.points ? `<p class="meta">אושרו ${esc(amountText(r.got))}!</p>` : '';
  const note = r.note ? `<p class="meta">${esc(r.by)}: "${esc(r.note)}"</p>` : '';
  return `<div class="item"><div class="t"><b>✋ ${esc(amountText(r.points))}</b>${r.reason ? `<p>"${esc(r.reason)}"</p>` : ''}${got}${note}<time>${ago(r.at)}</time>${sending(r)}</div>
    <div class="stack" style="justify-items:end">${tagFor(r.status)}${r.status === ST.pending && !r._pending ? `<button type="button" class="del" data-act="cancelRequest" data-id="${esc(r.id)}">ביטול</button>` : ''}</div></div>`;
}
// A line in the points history: the amount in the ladder's things, with + for given and − for a prize.
const signedAmount = (x) => `<span class="pts ${x.points >= 0 ? 'plus' : 'minus'}"><span aria-hidden="true">${x.points >= 0 ? '+' : '−'}</span> ${topEmoji(Math.abs(x.points))} ${esc(amountText(Math.abs(x.points)))}</span>`;
function ledgerItem(x) {
  const what = x.type === 'פרס' ? esc(x.reason) : `${esc(x.who)}${x.reason ? ': ' + esc(x.reason) : ''}`;
  return `<div class="item"><div class="t">${signedAmount(x)}<p>${what}</p><time>${ago(x.at)}</time>${sending(x)}</div></div>`;
}
function shopView(v) {
  const avail = v.balance - v.reserved;
  const open = v.orders.filter((o) => o.status === ST.pending || o.status === ST.approved);
  const past = v.orders.filter((o) => o.status === ST.delivered || o.status === ST.declined).slice(0, 6);
  const prize = (p) => {
    const can = avail >= p.price;
    const pct = Math.max(0, Math.min(100, Math.round((Math.max(0, avail) / p.price) * 100)));
    return `<article class="prize${can ? ' can' : ''}">
      <div class="pe" aria-hidden="true">${esc(p.emoji)}</div>
      <div class="pm"><b>${esc(p.name)}</b><span class="price"><span class="e" aria-hidden="true">${topEmoji(p.price)}</span> ${esc(amountText(p.price))}</span>
      ${can ? `<div><button type="button" class="btn sm" data-act="order" data-id="${esc(p.id)}">אני רוצה!</button></div>`
        : `<div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div><span class="meta">חסר לך ${esc(amountText(p.price - Math.max(0, avail)))}</span>`}
      </div></article>`;
  };
  const orderRow = (o) => `<div class="item"><div class="t"><b>${esc(o.name)}</b><time>${ago(o.at)}</time>${sending(o)}</div>
    <div class="stack" style="justify-items:end">${tagFor(o.status)}${o.status === ST.pending && !o._pending ? `<button type="button" class="del" data-act="cancelOrder" data-id="${esc(o.id)}">ביטול</button>` : ''}</div></div>`;
  return `
  <header class="top"><div class="hi"><small>החנות</small><b>מה בא לך?</b></div></header>
  <section class="card">
    <h2>פנוי לקנייה</h2>
    <div style="margin-top:10px">${coinsHTML(Math.max(0, avail))}</div>
    ${v.reserved > 0 ? `<p class="sub">ועוד ${esc(amountText(v.reserved))} בצד, להזמנה שמחכה לאישור.</p>` : ''}
  </section>
  ${open.length ? `<section class="card"><h2>ההזמנות שלי</h2><div class="list">${open.map(orderRow).join('')}</div></section>` : ''}
  <div class="stack">${v.prizes.length ? v.prizes.map(prize).join('') : '<p class="empty">עוד אין פרסים בחנות.</p>'}</div>
  ${past.length ? `<section class="card"><h2>היו פעם</h2><div class="list">${past.map(orderRow).join('')}</div></section>` : ''}`;
}
function wordCard(w, parent, v) {
  const isNew = !parent && (!w.read || S.fresh.has(w.id));
  let status = '';
  if (parent) status = w.kind === 'hard' ? (w.shown ? `נפתח ${w.shown === 1 ? 'פעם אחת' : w.shown + ' פעמים'}` : 'עוד לא נפתח') : (w.read ? 'נקרא ✓' : 'עוד לא נקרא');
  return `<article class="word${isNew ? ' new' : ''}">${av(w.from)}
    <div class="grow"><div class="row between"><b>${esc(w.from)}</b><time class="meta">${ago(w.at)}</time></div>
    ${isNew ? '<span class="new-tag">חדש</span>' : ''}
    ${parent && w.kind === 'hard' ? `<span class="tag hard">${esc(TX(v, 'hardKind'))}</span>` : ''}
    <p>${esc(w.text)}</p>
    ${parent ? `<div class="row between"><span class="meta">${status}${sending(w)}</span>${w._pending ? '' : `<button type="button" class="del" data-act="delWords" data-id="${esc(w.id)}">מחיקה</button>`}</div>` : ''}
    </div></article>`;
}
function wordsView(v) {
  const g = (S.img && S.img.gallery) || [];
  return `
  <header class="top"><div class="hi"><small>מילים טובות</small><b>מהבית</b></div></header>
  ${g.length ? `<div class="gallery">${g.map((x) => `<img src="${x.src}" width="${x.w}" height="${x.h}" alt="" loading="lazy">`).join('')}</div>` : ''}
  <div class="stack">${v.words.length ? v.words.map((w) => wordCard(w, false, v)).join('') : '<p class="empty">עוד אין כאן מילים 💌</p>'}</div>`;
}
function markRead(v) {
  const ids = v.words.filter((w) => !w.read && !w._pending).map((w) => w.id);
  if (!ids.length) return;
  ids.forEach((id) => S.fresh.add(id));
  send('readWords', { ids });
}
// "איך צוברים": how points are earned (the parents' list) and the conversion table. Same tab
// for everyone; the parents also edit the list here.
function earnView(v) {
  const parent = isParent();
  const rules = v.rules.filter((x) => parent || x.active);
  const rule = (x) => `<div class="item${x.active ? '' : ' pending-dot'}"><span class="rule-e" aria-hidden="true">${esc(x.emoji)}</span>
    <div class="t"><p>${esc(x.text)}</p>${x.points ? `<span class="price"><span class="e" aria-hidden="true">${topEmoji(x.points)}</span> ${esc(amountText(x.points))}</span>` : ''}${parent && !x.active ? '<span class="meta"> · מוסתר</span>' : ''}${sending(x)}</div>
    ${parent ? `<button type="button" class="btn ghost sm" data-act="editRule" data-id="${esc(x.id)}">עריכה</button>` : ''}</div>`;
  return `
  <header class="top"><div class="hi"><small>${parent ? 'מה כרמל רואה' : 'כל מה שצריך לדעת'}</small><b>איך צוברים</b></div></header>
  <section class="card">
    <div class="row between"><h2>איך צוברים נקודות</h2>${parent ? '<button type="button" class="btn sm" data-act="editRule" data-id="">+ עוד דרך</button>' : ''}</div>
    <p class="sub">את הנקודות נותנים אבא ואמא${parent ? '. כרמל יכולה לבקש' : ', ואפשר גם לבקש'}.</p>
    ${rules.length ? `<div class="list">${rules.map(rule).join('')}</div>` : (parent ? '<p class="hint">כאן כותבים על מה מקבלים נקודות, וכמה. כרמל רואה את זה בלשונית "איך צוברים".</p>' : '')}
    ${parent ? '' : '<div class="btns" style="margin-top:12px"><button type="button" class="btn" data-act="ask">✋ לבקש נקודות</button></div>'}
  </section>
  <section class="card">
    <h2>טבלת ההמרה</h2>
    ${ladderHTML()}
    <p class="sub">בחנות קונים פרסים בכל אחד מהם.</p>
  </section>`;
}
const CARMEL_VIEWS = { home: homeView, shop: shopView, words: wordsView, earn: earnView };

// ---------------------------------------------------------------- parents
function setupCard(v) {
  const hasHard = v.words.some((w) => w.kind === 'hard');
  const hasPhone = !!(v.phones.dad || v.phones.mom);
  if (v.codes.carmel && v.codes.mom && hasPhone && hasHard) return '';
  const li = (done, text, tab, btn) => `<li>${done ? '✅' : '⬜'} ${text}${done ? '' : ` <button type="button" class="link" data-act="tab" data-tab="${tab}">${btn}</button>`}</li>`;
  return `<section class="card"><h2>צעדים ראשונים</h2><ol class="steps">
    ${li(v.codes.carmel, 'קוד לכרמל', 'settings', 'להגדרות')}
    ${li(v.codes.mom, 'קוד לאמא', 'settings', 'להגדרות')}
    ${li(hasPhone, esc(TX(v, 'stepPhone')), 'settings', 'להגדרות')}
    ${li(hasHard, esc(TX(v, 'stepHard')), 'pwords', 'למילים')}
  </ol></section>`;
}
function homeLine(v) {
  if (!v.homeAt) return `<div class="row between"><span class="meta">🏠 הביתה: לא נקבע</span><button type="button" class="btn ghost sm" data-act="homeSheet">לקבוע</button></div>`;
  const future = v.homeAt > Date.now();
  return `<div class="row between"><span class="meta">🏠 הביתה: ${esc(fmtWhen(v.homeAt))}${future ? ` · <span data-countdown-short="${v.homeAt}"></span>` : ''}</span><button type="button" class="btn ghost sm" data-act="homeSheet">לשנות</button></div>`;
}
function reqDecide(r) {
  return `<div class="decide">
    <div class="row between"><b>✋ כרמל מבקשת ${esc(amountText(r.points))}</b><time class="meta">${ago(r.at)}</time></div>
    ${r.reason ? `<p style="margin:0">"${esc(r.reason)}"</p>` : ''}
    <div class="stack" style="gap:6px"><span class="meta">כמה לאשר</span>${pickerHTML(r.points, { qty: 'apq-' + r.id, unit: 'apu-' + r.id })}</div>
    <div class="btns"><button type="button" class="btn ok sm" data-act="approveReq" data-id="${esc(r.id)}">לאשר</button><button type="button" class="btn ghost sm" data-act="declineReq" data-id="${esc(r.id)}">לא הפעם</button></div>
  </div>`;
}
function orderDecide(o) {
  return `<div class="decide">
    <div class="row between"><b>🎁 כרמל רוצה: ${esc(o.name)}</b><time class="meta">${ago(o.at)}</time></div>
    <p class="meta" style="margin:0">${topEmoji(o.price)} ${esc(amountText(o.price))}</p>
    <div class="btns"><button type="button" class="btn ok sm" data-act="approveOrder" data-id="${esc(o.id)}">לאשר</button><button type="button" class="btn ghost sm" data-act="declineOrder" data-id="${esc(o.id)}">לא הפעם</button></div>
  </div>`;
}
function orderDeliver(o) {
  return `<div class="decide"><div class="row between"><b>${esc(o.name)}</b><span class="tag yes">✓ אושר</span></div>
    <button type="button" class="btn ghost sm" data-act="deliverOrder" data-id="${esc(o.id)}">היא קיבלה את זה</button></div>`;
}
function nowView(v) {
  const last = v.moods[0];
  const lastDef = last && moodOf(v, last.mood);
  const hard = lastDef && lastDef.hard && Date.now() - last.at < 12 * 3600e3;
  const reqs = v.requests.filter((r) => r.status === ST.pending);
  const ords = v.orders.filter((o) => o.status === ST.pending);
  const deliver = v.orders.filter((o) => o.status === ST.approved);
  const g = int(draftVal('giveQty', 0)) * int(draftVal('giveUnit', 20));
  const chips = [5, 20, 120, 480].map((n) => `<button type="button" class="chip${g === n ? ' on' : ''}" data-act="pickGive" data-pts="${n}">${topEmoji(n)} ${esc(amountText(n))}</button>`).join('');
  const led = v.ledger.slice(0, 12);
  const moods = v.moods.slice(0, 10);
  return `
  <header class="top">${av(S.role)}<div class="hi"><small>שלום</small><b>${NAME[S.role]}</b></div><button type="button" class="icon-btn" data-act="menu" aria-label="עוד">⋯</button></header>
  ${setupCard(v)}
  <section class="card kid">
    <div class="row">${av('carmel')}<div class="grow"><b style="font-size:18px">כרמל</b><div class="meta">${lastDef ? `${esc(moodLabel(v, last.mood))} · ${ago(last.at)}` : 'עוד לא סימנה איך היא'}</div></div></div>
    ${hard ? `<div class="alert">${esc(lastDef.e)} כרמל סימנה "${esc(lastDef.t)}" ${ago(last.at)}.</div>` : ''}
    <div><span class="meta">יש לה</span><div style="margin-top:8px">${coinsHTML(Math.max(0, v.balance))}</div></div>
    ${homeLine(v)}
  </section>
  ${reqs.length || ords.length || deliver.length ? `<section class="card"><h2>מחכה לכם</h2><div class="stack">${reqs.map(reqDecide).join('')}${ords.map(orderDecide).join('')}${deliver.map(orderDeliver).join('')}</div></section>` : ''}
  <section class="card stack">
    <h2>לתת נקודות</h2>
    <div class="chips">${chips}</div>
    <div class="stack" style="gap:6px"><span class="f">כמה</span>${pickerHTML(0, { qty: 'giveQty', unit: 'giveUnit' })}</div>
    <label class="f">על מה? (כרמל תראה את זה)<input class="in" maxlength="200" data-field="giveWhy" value="${esc(draftVal('giveWhy', ''))}" placeholder="למשל: על האומץ"></label>
    <button type="button" class="btn block" data-act="give">לתת</button>
  </section>
  ${led.length ? `<section class="card"><h2>נקודות אחרונות</h2><div class="list">${led.map((x) => parentLedgerItem(x)).join('')}</div></section>` : ''}
  ${moods.length ? `<section class="card"><h2>מצב רוח</h2><div class="list">${moods.map((m) => { const d = moodOf(v, m.mood); return `<div class="item"><span aria-hidden="true">${d ? esc(d.e) : ''}</span><div class="t"><p>${d ? esc(d.t) : ''}</p><time>${ago(m.at)}</time></div></div>`; }).join('')}</div></section>` : ''}`;
}
function parentLedgerItem(x) {
  const what = x.type === 'פרס' ? esc(x.reason) : `${esc(x.who)}${x.type === 'בקשה' ? ' (בקשה)' : ''}${x.reason ? ': ' + esc(x.reason) : ''}`;
  return `<div class="item"><div class="t">${signedAmount(x)}<p>${what}</p><time>${ago(x.at)}</time>${sending(x)}</div>
    ${x.type === 'מתנה' && !x._pending ? `<button type="button" class="del" data-act="delGrant" data-id="${esc(x.id)}">מחיקה</button>` : ''}</div>`;
}
function pwordsView(v) {
  const kind = draftVal('wkind', 'regular');
  return `
  <header class="top"><div class="hi"><small>לכתוב לכרמל</small><b>מילים טובות</b></div></header>
  <section class="card stack">
    <div class="seg"><button type="button" data-act="wkind" data-k="regular" class="${kind === 'regular' ? 'on' : ''}">${esc(TX(v, 'regularKind'))}</button><button type="button" data-act="wkind" data-k="hard" class="${kind === 'hard' ? 'on' : ''}">${esc(TX(v, 'hardKind'))}</button></div>
    <p class="hint">${esc(TX(v, kind === 'hard' ? 'hardHint' : 'regularHint'))}</p>
    <textarea class="in" maxlength="2000" data-field="wtext" placeholder="${esc(TX(v, kind === 'hard' ? 'hardPlaceholder' : 'regularPlaceholder'))}">${esc(draftVal('wtext', ''))}</textarea>
    <button type="button" class="btn block" data-act="sendWords">לשלוח</button>
  </section>
  <div class="stack">${v.words.length ? v.words.map((w) => wordCard(w, true, v)).join('') : '<p class="empty">עוד לא נכתבו מילים.</p>'}</div>`;
}
function pshopView(v) {
  const orders = v.orders.slice(0, 20);
  const orderRow = (o) => {
    let act = '';
    if (!o._pending && o.status === ST.pending) act = `<div class="btns"><button type="button" class="btn ok sm" data-act="approveOrder" data-id="${esc(o.id)}">לאשר</button><button type="button" class="btn ghost sm" data-act="declineOrder" data-id="${esc(o.id)}">לא הפעם</button></div>`;
    if (!o._pending && o.status === ST.approved) act = `<button type="button" class="btn ghost sm" data-act="deliverOrder" data-id="${esc(o.id)}">היא קיבלה את זה</button>`;
    const label = o.status === ST.delivered ? '🎉 קיבלה' : o.status === ST.approved ? '✓ אושרה' : o.status === ST.pending ? '⏳ מחכה' : o.status;
    return `<div class="item"><div class="t stack" style="gap:6px"><div class="row between"><b>${esc(o.name)}</b><span class="tag">${esc(label)}</span></div><span class="meta">${esc(amountText(o.price))} · ${ago(o.at)}${o.by ? ' · ' + esc(o.by) : ''}</span>${act}</div></div>`;
  };
  const prizeRow = (p) => `<div class="item${p.active ? '' : ' pending-dot'}"><span style="font-size:26px" aria-hidden="true">${esc(p.emoji)}</span><div class="t"><b>${esc(p.name)}</b><p class="meta">${topEmoji(p.price)} ${esc(amountText(p.price))}${p.active ? '' : ' · מוסתר'}${sending(p)}</p></div><button type="button" class="btn ghost sm" data-act="editPrize" data-id="${esc(p.id)}">עריכה</button></div>`;
  return `
  <header class="top"><div class="hi"><small>החנות של כרמל</small><b>פרסים והזמנות</b></div></header>
  <section class="card"><h2>הזמנות</h2>${orders.length ? `<div class="list">${orders.map(orderRow).join('')}</div>` : '<p class="empty">עוד לא הוזמן כלום.</p>'}</section>
  <section class="card"><div class="row between"><h2>הפרסים</h2><button type="button" class="btn sm" data-act="editPrize" data-id="">+ פרס חדש</button></div><div class="list">${v.prizes.map(prizeRow).join('')}</div></section>`;
}
function settingsView(v) {
  const codeRow = (r) => `<div class="stack" style="gap:6px">
    <div class="row between"><b>${NAME[r]}${r === S.role ? ' (אני)' : ''}</b><span class="tag ${v.codes[r] ? 'yes' : 'wait'}">${v.codes[r] ? 'יש קוד' : 'אין קוד'}</span></div>
    <div class="split"><input class="in" type="password" autocomplete="new-password" data-field="code_${r}" value="${esc(draftVal('code_' + r, ''))}" placeholder="${r === S.role ? 'קוד חדש שלי' : 'קוד חדש ל' + NAME[r]}" aria-label="קוד חדש ל${NAME[r]}"><button type="button" class="btn sm" data-act="setCode" data-role="${r}">שמירה</button></div></div>`;
  const phoneRow = (r) => `<label class="f">הנייד של ${NAME[r]}<div class="split"><input class="in" type="tel" inputmode="tel" dir="ltr" data-field="phone_${r}" value="${esc(draftVal('phone_' + r, fmtPhone(v.phones[r])))}" placeholder="05X-XXXXXXX"><button type="button" class="btn sm" data-act="savePhone" data-role="${r}">שמירה</button></div></label>`;
  return `
  <header class="top"><div class="hi"><small>הגדרות</small><b>${NAME[S.role]}</b></div></header>
  <section class="card stack"><h2>🏠 הביתה</h2>${homeLine(v)}</section>
  <section class="card stack"><h2>💬 וואטסאפ</h2>
    <p class="hint">${esc(TX(v, 'phoneHint'))}</p>
    ${phoneRow('dad')}${phoneRow('mom')}
  </section>
  <section class="card stack"><h2>🔑 קודים</h2>
    <p class="hint">8 תווים לפחות, למשל מילה שרק הוא יודע. מקלידים פעם אחת בכל טלפון. קוד חדש מוציא את הטלפונים הישנים של אותו אחד.</p>
    ${codeRow('carmel')}${codeRow('mom')}${codeRow('dad')}
  </section>
  <section class="card stack"><h2>הטלפון הזה</h2><button type="button" class="btn ghost" data-act="logout">יציאה</button></section>`;
}
const PARENT_VIEWS = { now: nowView, pwords: pwordsView, pshop: pshopView, pearn: earnView, settings: settingsView };

// ============================================================ sheets and toasts
function openSheet(html, onOpen) {
  $('#sheet').innerHTML = '<div class="grab" aria-hidden="true"></div>' + html;
  const w = $('#sheetWrap');
  w.classList.remove('hidden'); w.setAttribute('aria-hidden', 'false');
  if (!S.sheetOpen) { S.sheetOpen = true; history.pushState({ sheet: 1 }, ''); }
  if (onOpen) onOpen($('#sheet'));
}
function closeSheet(fromPop) {
  if (!S.sheetOpen) return;
  S.sheetOpen = false;
  const w = $('#sheetWrap');
  w.classList.add('hidden'); w.setAttribute('aria-hidden', 'true');
  $('#sheet').innerHTML = '';
  if (fromPop !== true) { S.ignorePop++; history.back(); }
}
window.addEventListener('popstate', () => {
  if (S.ignorePop > 0) { S.ignorePop--; return; }
  if (S.sheetOpen) closeSheet(true);
});
function toast(msg, opts = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${opts.action ? `<button type="button" data-act="toastAction">${esc(opts.action)}</button>` : ''}`;
  t.classList.remove('hidden');
  S.toastFn = opts.onAction || null;
  clearTimeout(S.toastTimer);
  S.toastTimer = setTimeout(() => t.classList.add('hidden'), opts.ms || (opts.action ? 7000 : 3200));
}
const hideToast = () => $('#toast').classList.add('hidden');

function menuSheet() {
  openSheet(`<h3>${NAME[S.role]}</h3>
    <button type="button" class="btn ghost block" data-act="myCodeSheet">להחליף את הקוד שלי</button>
    <button type="button" class="btn ghost block" data-act="logout">יציאה מהטלפון הזה</button>`);
}
function myCodeSheet() {
  openSheet(`<h3>קוד חדש</h3><p class="hint">8 תווים לפחות. הטלפונים האחרים שלך ייצאו, והטלפון הזה נשאר.</p>
    <input id="myCode1" class="in" type="password" autocomplete="new-password" placeholder="הקוד החדש">
    <input id="myCode2" class="in" type="password" autocomplete="new-password" placeholder="שוב, לאישור">
    <p id="myCodeErr" class="err"></p>
    <button type="button" class="btn block" data-act="saveMyCode">שמירה</button>`);
}
// quick picks for an amount picker inside a sheet: they fill the picker and light up
const quickPicks = (list, act) => `<div class="chips">${list.map((n) => `<button type="button" class="chip" data-act="${act}" data-pts="${n}">${topEmoji(n)} ${esc(amountText(n))}</button>`).join('')}</div>`;
function syncPicks(el) {
  const n = readAmount(el);
  $$('.chip[data-pts]', el).forEach((c) => c.classList.toggle('on', int(c.dataset.pts) === n));
}
function askSheet() {
  openSheet(`<h3>✋ לבקש נקודות</h3>
    <p class="sub">אבא ואמא יחליטו כמה.</p>
    ${quickPicks([5, 20, 120], 'pickAmount')}
    <div class="stack" style="gap:6px"><span class="f">כמה</span>${pickerHTML(20)}</div>
    <label class="f">על מה?<textarea id="askWhy" class="in" maxlength="200" placeholder="למשל: עבר עוד יום"></textarea></label>
    <button type="button" class="btn block" data-act="sendAsk">לשלוח לאבא ולאמא</button>`, (el) => {
    syncPicks(el);
    el.addEventListener('input', () => syncPicks(el));
  });
}
function pickNote(v) {
  const notes = v.hardNotes || [];
  if (!notes.length) return null;
  let best = null, n = Infinity;
  for (const x of notes) {
    const c = (x.shown || 0) + (S.shownLocal[x.id] || 0);
    if (c < n || (c === n && Math.random() < 0.5)) { best = x; n = c; }
  }
  S.shownLocal[best.id] = (S.shownLocal[best.id] || 0) + 1;
  LS.set('shownLocal', S.shownLocal);
  return best;
}
function hardSheet(note, v, def) {
  const msg = encodeURIComponent(def.wa || def.t);
  const wa = (n) => `https://wa.me/${encodeURIComponent(n)}?text=${msg}`;
  const btns = [];
  if (v.phones.dad) btns.push(`<a class="btn" href="${wa(v.phones.dad)}" target="_blank" rel="noopener">💬 לאבא</a>`);
  if (v.phones.mom) btns.push(`<a class="btn" href="${wa(v.phones.mom)}" target="_blank" rel="noopener">💬 לאמא</a>`);
  if (!btns.length) btns.push(`<a class="btn" href="https://wa.me/?text=${msg}" target="_blank" rel="noopener">💬 לשלוח בוואטסאפ</a>`);
  openSheet(`
    ${note ? `<div class="note-card">${av(note.from, 'sm')}<div><b>${esc(note.from)}</b><p>${esc(note.text)}</p></div></div>` : `<h3>${esc(def.e)}</h3>`}
    <p class="sub">${esc(TX(v, 'hardSheet'))}</p>
    <div class="btns">${btns.join('')}</div>
    <button type="button" class="btn ghost block" data-act="closeSheet">סגירה</button>`);
}
function homeSheet(v) {
  openSheet(`<h3>🏠 מתי הביתה?</h3>
    <input id="homeAt" class="in" type="datetime-local" value="${toLocalInput(v.homeAt && v.homeAt > Date.now() ? v.homeAt : nextThursday15())}">
    <div class="chips"><button type="button" class="chip" data-act="homePreset">חמישי הקרוב, 15:00</button></div>
    <button type="button" class="btn block" data-act="saveHome">שמירה</button>
    ${v.homeAt ? '<button type="button" class="btn ghost block" data-act="clearHome">בלי תאריך</button>' : ''}`);
}
function prizeSheet(p) {
  openSheet(`<h3>${p ? 'עריכת פרס' : 'פרס חדש'}</h3>
    <div class="split" style="grid-template-columns:84px 1fr"><label class="f">סמל<input id="prEmoji" class="in" maxlength="8" value="${esc(p ? p.emoji : '🎁')}" style="text-align:center;font-size:24px"></label>
    <label class="f">הפרס<input id="prName" class="in" maxlength="80" value="${esc(p ? p.name : '')}"></label></div>
    <div class="stack" style="gap:6px"><span class="f">מחיר</span>${pickerHTML(p ? p.price : 0)}</div>
    <label class="row"><input id="prActive" type="checkbox"${!p || p.active ? ' checked' : ''}> מופיע בחנות</label>
    <p id="prErr" class="err"></p>
    <button type="button" class="btn block" data-act="savePrize" data-id="${p ? esc(p.id) : ''}">שמירה</button>`);
}
function ruleSheet(x) {
  openSheet(`<h3>${x ? 'עריכה' : 'עוד דרך לצבור'}</h3>
    <div class="split" style="grid-template-columns:84px 1fr"><label class="f">סמל<input id="ruEmoji" class="in" maxlength="8" value="${esc(x ? x.emoji : '⭐')}" style="text-align:center;font-size:24px"></label>
    <label class="f">על מה?<input id="ruText" class="in" maxlength="140" value="${esc(x ? x.text : '')}"></label></div>
    <div class="stack" style="gap:6px"><span class="f">כמה מקבלים (אפשר להשאיר ריק)</span>${pickerHTML(x ? x.points : 0)}</div>
    <label class="row"><input id="ruActive" type="checkbox"${!x || x.active ? ' checked' : ''}> כרמל רואה את זה</label>
    <p id="ruErr" class="err"></p>
    <button type="button" class="btn block" data-act="saveRule" data-id="${x ? esc(x.id) : ''}">שמירה</button>
    ${x ? `<button type="button" class="btn ghost block" data-act="delRule" data-id="${esc(x.id)}">מחיקה</button>` : ''}`);
}

// ============================================================ actions
function noticeMood(prev, st) {
  const last = (st.moods || [])[0];
  if (!last || last.id === S.lastMoodSeen) return;
  const first = !S.lastMoodSeen && !prev;
  S.lastMoodSeen = last.id;
  LS.set('lastMoodSeen', last.id);
  const d = moodOf(st, last.mood);
  if (!first && d && d.hard && Date.now() - last.at < 12 * 3600e3) toast(`${d.e} כרמל סימנה "${d.t}" ${ago(last.at)}`, { ms: 9000 });
}
const ACTS = {
  tab(b) {
    S.tab = b.dataset.tab; LS.set('tab', S.tab);
    S.fresh = new Set();
    closeSheet();
    render();
    window.scrollTo(0, 0);
  },
  closeSheet: () => closeSheet(),
  toastAction() { hideToast(); const f = S.toastFn; S.toastFn = null; if (f) f(); },
  menu: menuSheet,
  myCodeSheet,
  async saveMyCode() {
    const a = $('#myCode1').value.trim(), b = $('#myCode2').value.trim();
    if (a.length < 8) { $('#myCodeErr').textContent = '8 תווים לפחות'; return; }
    if (a !== b) { $('#myCodeErr').textContent = 'שני הקודים לא זהים'; return; }
    try {
      const r = await api('changeMyCode', { code: a });
      if (!r.success) throw new Error(r.message);
      closeSheet(); toast('🔑 הקוד הוחלף');
      if (r.state) applyState(r.state);
    } catch (e) { if ($('#myCodeErr')) $('#myCodeErr').textContent = e.message || 'לא נשמר. מנסים שוב.'; }
  },
  logout,
  ask: askSheet,
  pickAmount(b) { setAmount($('#sheet'), int(b.dataset.pts)); syncPicks($('#sheet')); },
  sendAsk() {
    const points = readAmount($('#sheet')), reason = $('#askWhy').value.trim();
    if (points < 1) { toast('כמה?'); return; }
    send('requestPoints', { id: uid(), points, reason });
    closeSheet(); toast('✋ הבקשה נשלחה לאבא ולאמא');
  },
  mood(b) {
    const v = view(), def = moodOf(v, b.dataset.mood);
    if (!def || def.runaway) return;
    const note = def.hard ? pickNote(v) : null;
    send('setMood', { id: uid(), mood: def.key, noteId: note ? note.id : '' });
    if (def.hard) hardSheet(note, v, def);
    else toast(def.reply || 'אבא ואמא יראו את זה');
  },
  order(b) {
    const p = view().prizes.find((x) => x.id === b.dataset.id); if (!p) return;
    openSheet(`<div class="prize"><div class="pe" aria-hidden="true">${esc(p.emoji)}</div><div class="pm"><b>${esc(p.name)}</b><span class="price">${esc(amountText(p.price))}</span></div></div>
      <p class="sub">אבא ואמא יאשרו, ועד אז הנקודות שמורות בצד.</p>
      <button type="button" class="btn block" data-act="confirmOrder" data-id="${esc(p.id)}">להזמין</button>
      <button type="button" class="btn ghost block" data-act="closeSheet">לא עכשיו</button>`);
  },
  confirmOrder(b) { send('orderPrize', { id: uid(), prizeId: b.dataset.id }); closeSheet(); toast('🎁 ההזמנה נשלחה!'); },
  cancelOrder(b) { send('cancelOrder', { id: b.dataset.id }); },
  cancelRequest(b) { send('cancelRequest', { id: b.dataset.id }); },
  pickGive(b) { const { qty, size } = splitAmount(int(b.dataset.pts)); S.draft.giveQty = String(qty); S.draft.giveUnit = String(size); saveDraft(); render(); },
  give() {
    const points = int(S.draft.giveQty) * (int(S.draft.giveUnit) || 20), reason = String(S.draft.giveWhy || '').trim();
    if (points < 1) { toast('כמה?'); return; }
    const p = send('givePoints', { id: uid(), points, reason });
    delete S.draft.giveQty; delete S.draft.giveUnit; delete S.draft.giveWhy; saveDraft(); render();
    toast(`⭐ נתת לכרמל ${amountText(points)}`, { action: 'ביטול', onAction: () => send('deleteGrant', { id: p.id }) });
  },
  delGrant(b) {
    const x = view().ledger.find((y) => y.id === b.dataset.id); if (!x) return;
    openSheet(`<h3>למחוק את הנקודות האלה?</h3><p>${topEmoji(x.points)} ${esc(amountText(x.points))}${x.reason ? `: "${esc(x.reason)}"` : ''}</p>
      <button type="button" class="btn block" data-act="confirmDelGrant" data-id="${esc(x.id)}">למחוק</button>
      <button type="button" class="btn ghost block" data-act="closeSheet">ביטול</button>`);
  },
  confirmDelGrant(b) { send('deleteGrant', { id: b.dataset.id }); closeSheet(); },
  approveReq(b) {
    const r = view().requests.find((x) => x.id === b.dataset.id); if (!r) return;
    const box = b.closest('.decide');
    const points = (box && readAmount(box)) || r.points;
    send('decideRequest', { id: r.id, approve: true, points });
    delete S.draft['apq-' + r.id]; delete S.draft['apu-' + r.id]; saveDraft();
    toast(`✓ אושרו ${amountText(points)}`);
  },
  declineReq(b) { send('decideRequest', { id: b.dataset.id, approve: false }); },
  approveOrder(b) { send('decideOrder', { id: b.dataset.id, approve: true }); toast('✓ אושר. הנקודות ירדו.'); },
  declineOrder(b) { send('decideOrder', { id: b.dataset.id, approve: false }); },
  deliverOrder(b) { send('deliverOrder', { id: b.dataset.id }); },
  wkind(b) { S.draft.wkind = b.dataset.k; saveDraft(); render(); },
  sendWords() {
    const text = String(S.draft.wtext || '').trim();
    if (!text) { toast('מה לכתוב?'); return; }
    const kind = draftVal('wkind', 'regular');
    send('writeWords', { id: uid(), text, kind });
    delete S.draft.wtext; saveDraft(); render();
    toast(kind === 'hard' ? TX(view(), 'hardSent') || '✓ נשמר' : '💌 נשלח לכרמל');
  },
  delWords(b) {
    openSheet(`<h3>למחוק?</h3><p class="sub">כרמל לא תראה את זה יותר.</p>
      <button type="button" class="btn block" data-act="confirmDelWords" data-id="${esc(b.dataset.id)}">למחוק</button>
      <button type="button" class="btn ghost block" data-act="closeSheet">ביטול</button>`);
  },
  confirmDelWords(b) { send('deleteWords', { id: b.dataset.id }); closeSheet(); },
  homeSheet() { homeSheet(view()); },
  homePreset() { $('#homeAt').value = toLocalInput(nextThursday15()); },
  saveHome() {
    const ms = fromLocalInput($('#homeAt').value);
    if (!ms) { toast('בוחרים תאריך ושעה'); return; }
    send('setHomeAt', { homeAt: ms }); closeSheet(); toast('🏠 נשמר');
  },
  clearHome() { send('setHomeAt', { homeAt: 0 }); closeSheet(); },
  editPrize(b) { prizeSheet(view().prizes.find((x) => x.id === b.dataset.id) || null); },
  savePrize(b) {
    const name = $('#prName').value.trim(), emoji = $('#prEmoji').value.trim() || '🎁', price = readAmount($('#sheet'));
    if (!name) { $('#prErr').textContent = 'איך קוראים לפרס?'; return; }
    if (price < 1) { $('#prErr').textContent = 'מה המחיר?'; return; }
    send('savePrize', { id: b.dataset.id || 'p' + uid(), emoji, name, price, active: $('#prActive').checked });
    closeSheet(); toast('🎁 נשמר');
  },
  editRule(b) { ruleSheet(view().rules.find((x) => x.id === b.dataset.id) || null); },
  saveRule(b) {
    const text = $('#ruText').value.trim(), emoji = $('#ruEmoji').value.trim() || '⭐', points = readAmount($('#sheet'));
    if (!text) { $('#ruErr').textContent = 'על מה מקבלים נקודות?'; return; }
    send('saveRule', { id: b.dataset.id || 'u' + uid(), emoji, text, points, active: $('#ruActive').checked });
    closeSheet(); toast('📖 נשמר');
  },
  delRule(b) {
    openSheet(`<h3>למחוק?</h3><p class="sub">זה ייעלם גם אצל כרמל.</p>
      <button type="button" class="btn block" data-act="confirmDelRule" data-id="${esc(b.dataset.id)}">למחוק</button>
      <button type="button" class="btn ghost block" data-act="closeSheet">ביטול</button>`);
  },
  confirmDelRule(b) { send('deleteRule', { id: b.dataset.id }); closeSheet(); },
  savePhone(b) {
    const role = b.dataset.role, raw = String(draftVal('phone_' + role, '')).trim();
    let d = raw.replace(/\D/g, '');
    if (d.startsWith('972')) d = d.slice(3);
    if (d.startsWith('0')) d = d.slice(1);
    if (raw && !/^5\d{8}$/.test(d)) { toast('מספר נייד ישראלי: 10 ספרות שמתחילות ב-05'); return; }
    send('setPhone', { role, phone: raw, norm: raw ? '972' + d : '' });
    delete S.draft['phone_' + role]; saveDraft();
    toast(raw ? '💬 נשמר' : 'המספר נמחק');
  },
  async setCode(b) {
    const role = b.dataset.role, code = String(S.draft['code_' + role] || '').trim();
    if (code.length < 8) { toast('קוד של 8 תווים לפחות'); return; }
    b.disabled = true;
    try {
      const r = await api(role === S.role ? 'changeMyCode' : 'setCode', { role, code });
      if (!r.success) throw new Error(r.message);
      delete S.draft['code_' + role];
      toast(role === S.role ? '🔑 הקוד שלך הוחלף' : `🔑 נשמר קוד ל${NAME[role]}. ספרו לה אותו בעל פה או בהודעה פרטית.`, { ms: 7000 });
      if (r.state) applyState(r.state); else render();
    } catch (e) { toast(e.message && !/fetch|network|abort/i.test(e.message) ? e.message : 'לא נשמר. מנסים שוב עוד רגע.'); b.disabled = false; }
  },
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const f = ACTS[b.dataset.act];
  if (f) { e.preventDefault(); f(b, e); }
});
document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('[data-amt-qty]')) relabelPicker(e.target.closest('.amount'));
  const f = e.target.dataset && e.target.dataset.field;
  if (!f) return;
  S.draft[f] = e.target.value;
  saveDraft();
  if (f === 'giveQty' || f === 'giveUnit') {
    const n = int(S.draft.giveQty) * (int(S.draft.giveUnit) || 20);
    $$('#view .chip[data-act="pickGive"]').forEach((c) => c.classList.toggle('on', int(c.dataset.pts) === n));
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheetOpen) closeSheet(); });

// The runaway button: it moves before a finger (or a mouse) can press it. pointerdown fires
// before the tap completes, so the button is already elsewhere when the finger lifts.
function flee(btn, e) {
  const zone = btn.parentElement;
  const z = zone.getBoundingClientRect(), b = btn.getBoundingClientRect();
  const maxX = Math.max(0, z.width - b.width), maxY = Math.max(0, z.height - b.height);
  const px = e && e.clientX !== undefined ? e.clientX - z.left : -1e4, py = e && e.clientY !== undefined ? e.clientY - z.top : -1e4;
  const curX = b.left - z.left, curY = b.top - z.top;
  let x = 0, y = 0;
  for (let i = 0; i < 30; i++) {
    x = Math.random() * maxX; y = Math.random() * maxY;
    const farFromFinger = px < x - 24 || px > x + b.width + 24 || py < y - 24 || py > y + b.height + 24;
    const reallyMoved = Math.abs(x - curX) + Math.abs(y - curY) > Math.min(120, (maxX + maxY) / 2);
    if (farFromFinger && reallyMoved) break;
  }
  btn.classList.add('moved');
  btn.style.left = Math.round(x) + 'px';
  btn.style.top = Math.round(y) + 'px';
}
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest && e.target.closest('[data-run]');
  if (b) { e.preventDefault(); flee(b, e); }
}, true);
document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const b = e.target.closest && e.target.closest('[data-run]');
  if (b) flee(b, e);
});
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-run]');
  if (b) { e.preventDefault(); flee(b); }
}, true);

// ============================================================ clock
function tick() {
  $$('[data-countdown]').forEach((el) => {
    const t = Number(el.dataset.countdown);
    if (t <= Date.now()) { if (S.passed !== t) { S.passed = t; render(); } return; }
    const p = untilParts(t);
    const set = (u, val) => { const x = el.querySelector(`[data-u="${u}"]`); if (x && x.textContent !== val) x.textContent = val; };
    set('d', String(p.days)); set('h', two(p.h)); set('m', two(p.m)); set('s', two(p.s));
    const box = el.querySelector('[data-days]');
    if (box) box.classList.toggle('hidden', p.days === 0);
  });
  $$('[data-countdown-short]').forEach((el) => {
    const t = Number(el.dataset.countdownShort);
    const txt = t > Date.now() ? shortUntil(t) : 'הגיע הזמן';
    if (el.textContent !== txt) el.textContent = txt;
  });
}

// ============================================================ boot
function hideBoot() { $('#boot').classList.add('hidden'); }
function start() {
  $('#login').classList.add('hidden');
  $('#login').innerHTML = '';
  $('#app').classList.remove('hidden');
  if (S.photos) preparePhotos();
  render();
  hideBoot();
  refresh();
  if (!S.photos) loadPhotos();
}
function boot() {
  if (S.token && S.role) start(); else showLogin();
  setInterval(tick, 1000);
  setInterval(() => { if (document.visibilityState === 'visible' && S.token) refresh(); }, CONFIG.POLL_MS || 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.token) refresh(); });
  window.addEventListener('online', () => { if (S.token) refresh(); });
  window.addEventListener('pagehide', beaconOutbox);
}
boot();
