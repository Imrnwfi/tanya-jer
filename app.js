// TanyaJer — antara muka pengguna (laman statik untuk GitHub Pages).
// Data dibina oleh scripts/build.mjs ke dalam data/apps.json.
import { esc, norm, uniq, tokenize, bestSim, buildIndex, searchFaq, md } from './src/faq-core.js';

const $ = (s, r = document) => r.querySelector(s);
const state = { status: 'loading', site: {}, apps: [], route: { view: 'home' }, chats: {}, chatFor: null };
let msgSeq = 0;
const idxCache = new Map();

const getIndex = (app) => {
  if (!idxCache.has(app.id)) idxCache.set(app.id, buildIndex(app));
  return idxCache.get(app.id);
};
const currentApp = () => (state.route.view === 'chat' ? state.apps.find((a) => a.id === state.route.id) : null);
const chatOf = (id) => (state.chats[id] ||= []);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

/* ---------------- Routing: #canva membuka terus soal jawab Canva ---------------- */
function route() {
  let h = '';
  try { h = decodeURIComponent(location.hash.slice(1)); } catch { h = location.hash.slice(1); }
  state.route = h ? { view: 'chat', id: h } : { view: 'home' };
  closeSheet();
  render();
  window.scrollTo(0, 0);
}
function go(h) {
  if (location.hash.slice(1) === h) route();
  else if (!h) { history.pushState(null, '', location.pathname + location.search); route(); }
  else location.hash = h;
}
function render() {
  const v = state.route.view;
  $('#view-home').hidden = v !== 'home';
  $('#view-chat').hidden = v !== 'chat';
  const app = currentApp();
  document.title = app ? `${app.name} · ${state.site.title || 'TanyaJer'}` : `${state.site.title || 'TanyaJer'} – Soal Jawab Tutorial`;
  if (v === 'home') renderHome(); else renderChat();
}

/* ---------------- Halaman utama ---------------- */
function notice() {
  if (state.status === 'error') return '<div class="notice">Data FAQ tidak dapat dimuatkan. Cuba muat semula halaman ini.</div>';
  return '';
}
function renderHome() {
  $('#home-notice').innerHTML = notice();
  const grid = $('#app-grid');
  if (state.status === 'loading') { grid.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>'; return; }
  if (state.status === 'error') { grid.innerHTML = ''; return; }
  const q = norm($('#home-search').value);
  const list = state.apps.filter((a) => !q || norm(`${a.name} ${a.description}`).includes(q));
  if (!state.apps.length) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">📭</div>Belum ada aplikasi lagi.</div>'; return; }
  if (!list.length) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Tiada aplikasi sepadan dengan carian.</div>'; return; }
  grid.innerHTML = list.map((a) => `<a class="app-card" href="#${encodeURIComponent(a.id)}" style="text-decoration:none;color:inherit">
      <span class="emo">${esc(a.emoji)}</span><span class="nm">${esc(a.name)}</span>
      ${a.description ? `<span class="ds">${esc(a.description)}</span>` : ''}
      <span class="ct">${a.faqs.length} soalan</span></a>`).join('');
}

/* ---------------- Soal jawab ---------------- */
function renderChat() {
  const app = currentApp();
  const miss = $('#chat-missing'), main = $('#chat-main');
  if (!app) {
    main.hidden = true; miss.hidden = false; state.chatFor = null;
    miss.innerHTML = state.status === 'loading'
      ? '<div class="empty" style="margin-top:24px">Memuatkan…</div>'
      : `${notice()}<div class="empty" style="margin-top:24px"><div class="big">🤔</div>Aplikasi ini tidak dijumpai.<div style="margin-top:12px"><button class="btn" type="button" data-act="home">← Lihat semua app</button></div></div>`;
    return;
  }
  miss.hidden = true; main.hidden = false;
  $('#chat-emo').textContent = app.emoji;
  $('#chat-name').textContent = app.name;
  $('#chat-sub').textContent = `${app.faqs.length} soalan dalam FAQ`;
  if (state.chatFor !== app.id) { state.chatFor = app.id; renderAllMsgs(app); }
}
function renderAllMsgs(app) {
  const box = $('#msgs');
  box.innerHTML = '';
  const msgs = chatOf(app.id);
  if (!msgs.length) {
    box.appendChild(el(`<div class="msg bot"><div class="bubble"><p>Hai! 👋 Tanya apa-apa tentang <strong>${esc(app.name)}</strong>.</p>
      <p class="muted" style="font-size:13px;margin-top:4px">Saya akan cari jawapan daripada ${app.faqs.length} soalan dalam FAQ.</p></div></div>`));
  }
  for (const m of msgs) box.appendChild(msgEl(m, app));
  renderChips(app);
}
function renderChips(app) {
  $('#chips').innerHTML = !chatOf(app.id).length
    ? app.faqs.slice(0, 4).map((f, i) => `<button class="chip" type="button" data-faq="${i}">${esc(f.q)}</button>`).join('')
    : '';
}
function contactBtn() {
  const { contactUrl, contactLabel } = state.site;
  if (!contactUrl || !/^(https?:|mailto:)/i.test(contactUrl)) return '';
  return `<a class="chip ai" href="${esc(contactUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">💬 ${esc(contactLabel || 'Tanya terus')}</a>`;
}
function msgEl(m, app) {
  if (m.role === 'user') return el(`<div class="msg user"><div class="bubble">${esc(m.text)}</div></div>`);
  const faqs = app.faqs;
  let h = '';
  if (m.from === 'faq') h += `<div class="src"><b>${m.ai ? '✨ Ringkasan FAQ' : '📄 Dari FAQ'}</b><span>· ${esc(m.matchedQ)}</span></div>`;
  h += `<div class="md">${md(m.text)}</div>`;
  if (m.full) h += `<details class="full"><summary>Baca jawapan penuh</summary><div class="md">${md(m.full)}</div></details>`;
  if (m.suggestions?.length) {
    h += `<div style="margin-top:8px">${m.suggestions.map((i) => `<button class="chip" type="button" data-faq="${i}">${esc(faqs[i].q)}</button>`).join('')}</div>`;
  }
  if (m.from === 'none' || m.from === 'maybe') {
    h += `<div style="margin-top:8px"><button class="chip" type="button" data-act="allfaq">📋 Lihat semua FAQ</button>${contactBtn()}</div>`;
  }
  if (m.related?.length) {
    h += `<div class="related"><div class="lbl">Soalan berkaitan:</div>${m.related.map((i) => `<button class="chip" type="button" data-faq="${i}">${esc(faqs[i].q)}</button>`).join('')}</div>`;
  }
  return el(`<div class="msg bot"><div class="bubble">${h}</div></div>`);
}
function pushMsg(app, m) {
  m.id = ++msgSeq;
  const msgs = chatOf(app.id);
  msgs.push(m);
  if (currentApp() === app) {
    if (msgs.length === 1) renderAllMsgs(app); else $('#msgs').appendChild(msgEl(m, app));
    renderChips(app);
    requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
  }
}
/* ---------------- Jawapan ringkas ----------------
   Setiap FAQ ada ringkasan (s) dan poin utama (p) yang dijana semasa build.
   Jika soalan penonton menyebut perkara khusus (cth "bujang", "BSN"), pilih poin yang berkaitan sahaja. */
function focusPoints(app, i, text) {
  const f = app.faqs[i];
  if (!text || !Array.isArray(f.p) || !f.p.length) return [];
  const idx = getIndex(app);
  const qTok = tokenize(f.q);
  const toks = uniq(tokenize(text)).filter((t) => !t.startsWith('q_') && !idx.nameT.has(t) && bestSim(t, qTok) < 0.7);
  if (!toks.length) return [];
  return f.p.map((p, k) => { const pt = tokenize(p); return { k, s: toks.reduce((n, t) => n + bestSim(t, pt), 0) / toks.length }; })
    .filter((x) => x.s >= 0.6).sort((a, b) => b.s - a.s).slice(0, 3).sort((a, b) => a.k - b.k).map((x) => f.p[x.k]);
}
function answerFor(app, i, text) {
  const f = app.faqs[i];
  const pts = focusPoints(app, i, text);
  const short = pts.length ? pts.map((p) => `- ${p}`).join('\n') : (f.s || f.a);
  const same = norm(short) === norm(f.a);
  return { from: 'faq', matchedQ: f.q, text: short, full: same ? '' : f.a, ai: !!f.ai };
}
function ask(text) {
  const app = currentApp();
  text = String(text || '').trim();
  if (!app || !text) return;
  pushMsg(app, { role: 'user', text });
  const results = searchFaq(getIndex(app), text);
  const top = results[0], second = results[1]?.score || 0;
  // Jawab terus bila padanan jelas; jika dua soalan hampir sama kuat, tunjuk yang terbaik + soalan berkaitan.
  if (top && top.score >= 0.3 && (top.score - second >= 0.06 || top.score >= 0.45)) {
    pushMsg(app, { role: 'bot', ...answerFor(app, top.i, text),
      related: results.slice(1, 4).filter((r) => r.score >= 0.25).map((r) => r.i) });
  } else if (top && top.score >= 0.2) {
    pushMsg(app, { role: 'bot', from: 'maybe', text: 'Saya tak pasti, tapi mungkin salah satu soalan ini yang anda maksudkan:',
      suggestions: results.slice(0, 3).filter((r) => r.score >= 0.14).map((r) => r.i) });
  } else {
    pushMsg(app, { role: 'bot', from: 'none',
      text: `Maaf, saya tak jumpa jawapan untuk soalan ini dalam FAQ ${app.name}. Cuba guna perkataan lain, atau semak senarai semua FAQ.` });
  }
}
function showFaq(i) {
  const app = currentApp();
  const f = app?.faqs[i];
  if (!f) return;
  pushMsg(app, { role: 'user', text: f.q });
  const related = searchFaq(getIndex(app), f.q).filter((r) => r.i !== i && r.score >= 0.25).slice(0, 3).map((r) => r.i);
  pushMsg(app, { role: 'bot', ...answerFor(app, i, ''), related });
}

/* ---------------- Senarai semua FAQ ---------------- */
function openSheet() {
  const app = currentApp(); if (!app) return;
  $('#sheet-title').textContent = `Semua FAQ · ${app.name}`;
  $('#sheet-search').value = '';
  renderSheet();
  $('#sheet').hidden = false;
}
function closeSheet() { $('#sheet').hidden = true; }
function renderSheet() {
  const app = currentApp(); if (!app) return;
  const q = $('#sheet-search').value.trim();
  const order = q ? searchFaq(getIndex(app), q).filter((r) => r.score >= 0.15).map((r) => r.i) : app.faqs.map((_, i) => i);
  $('#sheet-list').innerHTML = order.length
    ? order.map((i) => `<details class="faq"><summary>${esc(app.faqs[i].q)}</summary><div class="ans">${md(app.faqs[i].a)}</div></details>`).join('')
    : '<div class="muted" style="padding:10px 2px">Tiada FAQ sepadan.</div>';
}

/* ---------------- Peristiwa ---------------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.id === 'brand' || t.id === 'chat-back' || t.dataset.act === 'home') return go('');
  if (t.id === 'btn-allfaq' || t.dataset.act === 'allfaq') return openSheet();
  if (t.id === 'sheet-close') return closeSheet();
  if (t.dataset.faq !== undefined) return showFaq(Number(t.dataset.faq));
});
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
$('#sheet-search').addEventListener('input', renderSheet);
$('#home-search').addEventListener('input', renderHome);
$('#ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = $('#ask-input');
  const v = inp.value;
  inp.value = '';
  ask(v);
});
window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);

/* ---------------- Mula ---------------- */
route();
fetch('data/apps.json', { cache: 'no-cache' })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((data) => {
    state.site = data.site || {};
    state.apps = (data.apps || []).map((a) => ({ ...a, emoji: a.emoji || '📱', description: a.description || '', faqs: a.faqs || [] }));
    state.status = 'ready';
    if (state.site.title) $('#site-title').textContent = state.site.title;
    if (state.site.heading) $('#site-heading').textContent = state.site.heading;
    if (state.site.tagline) $('#site-tagline').textContent = state.site.tagline;
    render();
  })
  .catch(() => { state.status = 'error'; render(); });
