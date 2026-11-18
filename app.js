// TanyaJer — antara muka penonton (laman statik untuk GitHub Pages).
// Data dibina oleh scripts/build.mjs ke dalam data/apps.json.
import { esc, norm, uniq, tokenize, bestSim, buildIndex, searchFaq, md, linkTimes } from './src/faq-core.js';

const $ = (s, r = document) => r.querySelector(s);
const state = { status: 'loading', site: {}, apps: [], route: { view: 'home' }, chats: {}, chatFor: null, cat: '', pending: null };
let msgSeq = 0;
const idxCache = new Map();

const getIndex = (app) => {
  if (!idxCache.has(app.id)) idxCache.set(app.id, buildIndex(app));
  return idxCache.get(app.id);
};
const currentApp = () => (state.route.view === 'chat' ? state.apps.find((a) => a.id === state.route.id) : null);
const chatOf = (id) => (state.chats[id] ||= []);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmtDate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'][m - 1]} ${y}`;
};
const answerHtml = (text, app) => linkTimes(md(text), app.video);

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

/* ---------------- Halaman utama: kategori, tab app & carian soalan ---------------- */
function notice() {
  if (state.status === 'error') return '<div class="notice">Data FAQ tidak dapat dimuatkan. Cuba muat semula halaman ini.</div>';
  if (state.status === 'offline') return '<div class="notice">Anda sedang offline — memaparkan FAQ yang disimpan.</div>';
  return '';
}
function categories() {
  const cats = uniq(state.apps.map((a) => a.category).filter(Boolean));
  const hasOther = state.apps.some((a) => !a.category);
  return cats.length >= 2 || (cats.length === 1 && hasOther) ? cats : [];
}
function renderHome() {
  $('#home-notice').innerHTML = notice();
  const grid = $('#app-grid');
  const raw = $('#home-search').value.trim();
  const q = norm(raw);
  // tab kategori
  const cats = categories();
  if (state.cat && !cats.includes(state.cat)) state.cat = '';
  $('#cat-tabs').hidden = !cats.length || !!q;
  $('#cat-tabs').innerHTML = cats.length ? ['', ...cats].map((c) => `<button class="cat${c === state.cat ? ' on' : ''}" type="button" role="tab" aria-selected="${c === state.cat}" data-cat="${esc(c)}">${c ? esc(c) : 'Semua'}</button>`).join('') : '';

  if (state.status === 'loading') { grid.innerHTML = '<div class="skel"></div>'.repeat(4); $('#home-results').innerHTML = ''; return; }
  if (state.status === 'error') { grid.innerHTML = ''; $('#home-results').innerHTML = ''; return; }
  if (!state.apps.length) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">📭</div>Belum ada aplikasi lagi.</div>'; return; }

  // carian soalan dalam semua FAQ
  const results = raw.length >= 3 ? searchAll(raw) : [];
  $('#home-results').innerHTML = results.length ? `<div class="res-head">Jawapan dari FAQ</div>${results.map((r, n) => `
    <button class="res" type="button" data-res="${n}">
      <span class="emo">${esc(r.app.emoji)}</span>
      <span class="res-txt"><b>${esc(r.app.faqs[r.i].q)}</b><span>${esc(r.app.name)}</span></span><span class="go">›</span>
    </button>`).join('')}` : '';
  state.homeResults = results;

  const list = state.apps.filter((a) => (q ? norm(a.name).includes(q) : !state.cat || a.category === state.cat));
  grid.innerHTML = list.length
    ? list.map((a) => `<a class="app-tab" href="#${encodeURIComponent(a.id)}" title="${esc(a.name)}"><span class="emo">${esc(a.emoji)}</span><span class="nm">${esc(a.name)}</span></a>`).join('')
    : (results.length ? '' : '<div class="empty" style="grid-column:1/-1">Tiada aplikasi atau soalan sepadan.</div>');
}
function searchAll(text) {
  const out = [];
  for (const app of state.apps) {
    const r = searchFaq(getIndex(app), text).filter((x) => x.score >= 0.32).slice(0, 2);
    for (const x of r) out.push({ app, i: x.i, score: x.score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
function openResult(n) {
  const r = state.homeResults?.[n]; if (!r) return;
  state.pending = { id: r.app.id, i: r.i, text: $('#home-search').value.trim() };
  go(r.app.id);
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
  $('#chat-sub').textContent = [`${app.faqs.length} soalan`, app.updated ? `dikemas kini ${fmtDate(app.updated)}` : ''].filter(Boolean).join(' · ');
  const vid = $('#btn-video');
  vid.hidden = !app.video; if (app.video) vid.href = app.video;
  if (state.chatFor !== app.id) { state.chatFor = app.id; renderAllMsgs(app); }
  // dari carian laman utama
  if (state.pending && state.pending.id === app.id) {
    const { i, text } = state.pending; state.pending = null;
    if (app.faqs[i]) {
      pushMsg(app, { role: 'user', text: text || app.faqs[i].q });
      pushMsg(app, { role: 'bot', ...answerFor(app, i, text), related: relatedTo(app, i) });
    }
  }
}
function renderAllMsgs(app) {
  const box = $('#msgs');
  box.innerHTML = '';
  const msgs = chatOf(app.id);
  if (!msgs.length) {
    const meta = [app.source ? `Sumber: <b>${esc(app.source)}</b>` : '', app.updated ? `Dikemas kini ${esc(fmtDate(app.updated))}` : ''].filter(Boolean).join(' · ');
    box.appendChild(el(`<div class="msg bot"><div class="bubble"><p>Hai! 👋 Tanya apa-apa tentang <strong>${esc(app.name)}</strong>.</p>
      <p class="muted" style="font-size:13px;margin-top:4px">Saya akan cari jawapan daripada ${app.faqs.length} soalan dalam FAQ.</p>
      ${meta ? `<p class="src-meta">📌 ${meta}</p>` : ''}
      ${app.video ? `<div style="margin-top:8px"><a class="chip ai" href="${esc(app.video)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">▶️ Tonton video tutorial</a></div>` : ''}</div></div>`));
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
function actionsHtml(m) {
  const fb = state.site.feedbackUrl;
  let h = '<div class="acts">';
  if (fb) {
    h += m.voted
      ? `<span class="thanks">${m.voted === 'up' ? '👍' : '👎'} Terima kasih atas maklum balas!</span>`
      : `<span class="lbl">Membantu?</span><button class="act" type="button" data-vote="up" data-mid="${m.id}" aria-label="Ya, membantu">👍</button><button class="act" type="button" data-vote="down" data-mid="${m.id}" aria-label="Tidak membantu">👎</button>`;
  }
  h += `<button class="act share" type="button" data-share="${m.id}">🔗 Kongsi</button></div>`;
  if (m.shareOpen) {
    const { url, text } = shareData(m);
    h += `<div class="share-row">
      <a class="chip" href="https://wa.me/?text=${encodeURIComponent(`${text}\n\n${url}`)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a class="chip" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}" target="_blank" rel="noopener noreferrer">Telegram</a>
      <button class="chip" type="button" data-copy="${m.id}">${m.copied ? '✓ Disalin' : '📋 Salin link'}</button></div>`;
  }
  return h;
}
function msgEl(m, app) {
  if (m.role === 'user') return el(`<div class="msg user"><div class="bubble">${esc(m.text)}</div></div>`);
  const faqs = app.faqs;
  let h = '';
  if (m.from === 'faq') h += `<div class="src"><b>${m.ai ? '✨ Ringkasan FAQ' : '📄 Dari FAQ'}</b><span>· ${esc(m.matchedQ)}</span></div>`;
  h += `<div class="md">${m.from === 'faq' ? answerHtml(m.text, app) : md(m.text)}</div>`;
  if (m.full) h += `<details class="full"><summary>Baca jawapan penuh</summary><div class="md">${answerHtml(m.full, app)}</div></details>`;
  if (m.from === 'faq') h += actionsHtml(m);
  if (m.suggestions?.length) {
    h += `<div style="margin-top:8px">${m.suggestions.map((i) => `<button class="chip" type="button" data-faq="${i}">${esc(faqs[i].q)}</button>`).join('')}</div>`;
  }
  if (m.from === 'none' || m.from === 'maybe') {
    h += `<div style="margin-top:8px"><button class="chip" type="button" data-act="allfaq">📋 Lihat semua FAQ</button>${contactBtn()}</div>`;
  }
  if (m.related?.length) {
    h += `<div class="related"><div class="lbl">Soalan berkaitan:</div>${m.related.map((i) => `<button class="chip" type="button" data-faq="${i}">${esc(faqs[i].q)}</button>`).join('')}</div>`;
  }
  return el(`<div class="msg bot" id="m-${m.id}"><div class="bubble">${h}</div></div>`);
}
function pushMsg(app, m) {
  m.id = ++msgSeq;
  m.appId = app.id;
  const msgs = chatOf(app.id);
  msgs.push(m);
  if (currentApp() === app) {
    if (msgs.length === 1) renderAllMsgs(app); else $('#msgs').appendChild(msgEl(m, app));
    renderChips(app);
    requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
  }
}
function refreshMsg(m) {
  const app = currentApp(); const node = document.getElementById(`m-${m.id}`);
  if (app && node) node.replaceWith(msgEl(m, app));
}
const findMsg = (id) => { const app = currentApp(); return app ? chatOf(app.id).find((x) => x.id === Number(id)) : null; };

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
    .filter((x) => x.s >= 0.6 && f.p.indexOf(f.p[x.k]) === x.k).sort((a, b) => b.s - a.s).slice(0, 3).sort((a, b) => a.k - b.k).map((x) => f.p[x.k]);
}
function answerFor(app, i, text) {
  const f = app.faqs[i];
  const pts = focusPoints(app, i, text);
  const short = pts.length ? pts.map((p) => `- ${p}`).join('\n') : (f.s || f.a);
  const same = norm(short) === norm(f.a);
  return { from: 'faq', faqIdx: i, question: text, matchedQ: f.q, text: short, full: same ? '' : f.a, ai: !!f.ai };
}
const relatedTo = (app, i) => searchFaq(getIndex(app), app.faqs[i].q).filter((r) => r.i !== i && r.score >= 0.25).slice(0, 3).map((r) => r.i);

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
  pushMsg(app, { role: 'bot', ...answerFor(app, i, ''), related: relatedTo(app, i) });
}

/* ---------------- 👍 / 👎 (dihantar ke Google Sheet pemilik) ---------------- */
function vote(m, v) {
  if (m.voted) return;
  m.voted = v; refreshMsg(m);
  const app = state.apps.find((a) => a.id === m.appId);
  const body = JSON.stringify({ type: 'feedback', app: app?.name || m.appId, question: m.question || '', faq: m.matchedQ, vote: v, page: location.href });
  try {
    fetch(state.site.feedbackUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, keepalive: true }).catch(() => {});
  } catch { /* abaikan */ }
}

/* ---------------- Kongsi jawapan ---------------- */
function shareData(m) {
  const app = state.apps.find((a) => a.id === m.appId);
  const f = app.faqs[m.faqIdx];
  const url = new URL(`faq/${app.id}.html${f.k ? `#${f.k}` : ''}`, location.href).href;
  const summary = String(f.s || f.a).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  const text = `❓ ${f.q}\n\n${summary.length > 280 ? summary.slice(0, 277).replace(/\s+\S*$/, '') + '…' : summary}`;
  return { url, text, title: `${app.name} · ${state.site.title || 'TanyaJer'}` };
}
async function share(m) {
  const d = shareData(m);
  if (navigator.share) {
    try { await navigator.share({ title: d.title, text: d.text, url: d.url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  m.shareOpen = !m.shareOpen; refreshMsg(m);
}
async function copyShare(m) {
  try { await navigator.clipboard.writeText(shareData(m).url); m.copied = true; }
  catch { m.copied = false; prompt?.('Salin link ini:', shareData(m).url); }
  refreshMsg(m);
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
    ? order.map((i) => `<details class="faq"><summary>${esc(app.faqs[i].q)}</summary><div class="ans">${answerHtml(app.faqs[i].a, app)}</div></details>`).join('')
    : '<div class="muted" style="padding:10px 2px">Tiada FAQ sepadan.</div>';
}

/* ---------------- Peristiwa ---------------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (t.id === 'brand' || t.id === 'chat-back' || d.act === 'home') return go('');
  if (t.id === 'btn-allfaq' || d.act === 'allfaq') return openSheet();
  if (t.id === 'sheet-close') return closeSheet();
  if (d.faq !== undefined) return showFaq(Number(d.faq));
  if (d.cat !== undefined) { state.cat = d.cat; return renderHome(); }
  if (d.res !== undefined) return openResult(Number(d.res));
  if (d.vote) { const m = findMsg(d.mid); if (m) vote(m, d.vote); return; }
  if (d.share) { const m = findMsg(d.share); if (m) share(m); return; }
  if (d.copy) { const m = findMsg(d.copy); if (m) copyShare(m); }
});
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
$('#sheet-search').addEventListener('input', renderSheet);
let homeTimer;
$('#home-search').addEventListener('input', () => { clearTimeout(homeTimer); homeTimer = setTimeout(renderHome, 120); });
$('#home-search').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault(); clearTimeout(homeTimer); renderHome();
  if (state.homeResults?.length) openResult(0);
  else { const a = $('#app-grid .app-tab'); if (a) a.click(); }
});
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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
route();
fetch('data/apps.json', { cache: 'no-cache' })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((data) => {
    state.site = data.site || {};
    state.apps = (data.apps || []).map((a) => ({ ...a, emoji: a.emoji || '📱', description: a.description || '', category: a.category || '', faqs: a.faqs || [] }));
    state.status = navigator.onLine === false ? 'offline' : 'ready';
    if (state.site.title) $('#site-title').textContent = state.site.title;
    if (state.site.heading) $('#site-heading').textContent = state.site.heading;
    if (state.site.tagline) $('#site-tagline').textContent = state.site.tagline;
    render();
  })
  .catch(() => { state.status = 'error'; render(); });
