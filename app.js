// TanyaJer — antara muka penonton (laman statik untuk GitHub Pages).
// Data dibina oleh scripts/build.mjs ke dalam data/apps.json.
import { esc, norm, uniq, tokenize, bestSim, buildIndex, searchFaq, md, linkTimes } from './src/faq-core.js';

const $ = (s, r = document) => r.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* abaikan */ } },
};
const state = { status: 'loading', site: {}, apps: [], route: { view: 'home' }, chats: {}, chatFor: null, cat: '', pending: null, speakingId: null };
let msgSeq = 0;
const idxCache = new Map();

/* ---------------- Bahasa paparan (BM / English) ---------------- */
const I18N = {
  ms: {
    heading: 'Ada soalan tentang app dalam tutorial?',
    tagline: 'Pilih aplikasi, kemudian taip soalan anda. Jawapan diambil terus dari FAQ.',
    docTitle: 'Soal Jawab Tutorial', searchPh: 'Cari app atau taip soalan…', askPh: 'Taip soalan anda…', sheetPh: 'Cari dalam FAQ…',
    back: 'Kembali', send: 'Hantar', close: '✕ Tutup', watch: ' Tonton', official: ' Rasmi', allFaq: ' Semua FAQ', fontSize: 'Besarkan tulisan',
    answersFromFaq: 'Jawapan dari FAQ', all: 'Semua', noApps: 'Belum ada aplikasi lagi.', noMatchHome: 'Tiada aplikasi atau soalan sepadan.',
    loadErr: 'Data FAQ tidak dapat dimuatkan. Cuba muat semula halaman ini.', offline: 'Anda sedang offline — memaparkan FAQ yang disimpan.',
    loading: 'Memuatkan…', notFound: 'Aplikasi ini tidak dijumpai.', seeAll: '← Lihat semua app',
    nQ: '{n} soalan', updated: 'dikemas kini {d}', hi: 'Hai! 👋 Tanya apa-apa tentang <strong>{name}</strong>.',
    willSearch: 'Saya akan cari jawapan daripada {n} soalan dalam FAQ.', source: 'Sumber', updatedCap: 'Dikemas kini',
    watchVideo: '▶️ Tonton video tutorial', officialSite: 'Laman rasmi', fromFaq: '📄 Dari FAQ', aiSummary: '✨ Ringkasan FAQ', readFull: 'Baca jawapan penuh',
    helpful: 'Membantu?', yes: 'Ya, membantu', no: 'Tidak membantu', thanks: 'Terima kasih atas maklum balas!',
    share: '🔗 Kongsi', copyLink: '📋 Salin link', copied: '✓ Disalin', copyPrompt: 'Salin link ini:', listen: '🔊 Dengar', stop: '⏹ Henti',
    maybe: 'Saya tak pasti, tapi mungkin salah satu soalan ini yang anda maksudkan:',
    none: 'Maaf, saya tak jumpa jawapan untuk soalan ini dalam FAQ {name}. Cuba guna perkataan lain, atau semak senarai semua FAQ.',
    seeAllFaq: '📋 Lihat semua FAQ', related: 'Soalan berkaitan:', allFaqTitle: 'Semua FAQ · {name}', noFaqMatch: 'Tiada FAQ sepadan.',
    foot: '📄 Jawapan diringkaskan dari FAQ · tekan “Baca jawapan penuh” untuk butiran', footLog: ' · soalan direkod tanpa nama untuk menambah baik FAQ',
    newLbl: 'Baru', newCount: '🆕 {n} soalan baru / dikemas kini:', dlDefault: 'Tarikh tutup',
    dlLeft: '⏳ {label}: {n} hari lagi · {d}', dlToday: '⏳ {label}: hari ini! · {d}', dlPast: '✓ {label}: sudah tamat ({d})', dlTab: '⏳ {n}h',
    suggest: 'Cadangan:', dismiss: 'Tutup pengumuman', months: ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'],
  },
  en: {
    heading: 'Got a question about an app from the tutorial?',
    tagline: 'Pick an app, then type your question. Answers come straight from the FAQ.',
    docTitle: 'Tutorial Q&A', searchPh: 'Search apps or type a question…', askPh: 'Type your question…', sheetPh: 'Search the FAQ…',
    back: 'Back', send: 'Send', close: '✕ Close', watch: ' Watch', official: ' Official', allFaq: ' All FAQs', fontSize: 'Larger text',
    answersFromFaq: 'Answers from the FAQ', all: 'All', noApps: 'No apps yet.', noMatchHome: 'No matching apps or questions.',
    loadErr: 'The FAQ could not be loaded. Please reload this page.', offline: 'You are offline — showing saved FAQs.',
    loading: 'Loading…', notFound: 'This app was not found.', seeAll: '← See all apps',
    nQ: '{n} questions', updated: 'updated {d}', hi: 'Hi! 👋 Ask anything about <strong>{name}</strong>.',
    willSearch: "I'll search {n} FAQ questions for your answer.", source: 'Source', updatedCap: 'Updated',
    watchVideo: '▶️ Watch the tutorial', officialSite: 'Official website', fromFaq: '📄 From the FAQ', aiSummary: '✨ FAQ summary', readFull: 'Read full answer',
    helpful: 'Helpful?', yes: 'Yes, helpful', no: 'Not helpful', thanks: 'Thanks for your feedback!',
    share: '🔗 Share', copyLink: '📋 Copy link', copied: '✓ Copied', copyPrompt: 'Copy this link:', listen: '🔊 Listen', stop: '⏹ Stop',
    maybe: "I'm not sure, but you might mean one of these:",
    none: "Sorry, I couldn't find an answer in the {name} FAQ. Try different words, or browse all FAQs.",
    seeAllFaq: '📋 See all FAQs', related: 'Related questions:', allFaqTitle: 'All FAQs · {name}', noFaqMatch: 'No matching FAQ.',
    foot: '📄 Answers are summarised from the FAQ · tap “Read full answer” for details', footLog: ' · questions are logged anonymously to improve the FAQ',
    newLbl: 'New', newCount: '🆕 {n} new / updated questions:', dlDefault: 'Closing date',
    dlLeft: '⏳ {label}: {n} days left · {d}', dlToday: '⏳ {label}: today! · {d}', dlPast: '✓ {label}: closed ({d})', dlTab: '⏳ {n}d',
    suggest: 'Suggestions:', dismiss: 'Dismiss announcement', months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
};
let lang = store.get('tanya.lang') || ((navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'ms');
const t = (k, vars) => {
  const v = I18N[lang][k] ?? I18N.ms[k] ?? k;
  return Array.isArray(v) ? v : String(v).replace(/\{(\w+)\}/g, (_, x) => (vars && vars[x] != null ? vars[x] : ''));
};
function applyLang() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'ms';
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach((n) => { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
  const b = $('#btn-lang'); b.textContent = lang === 'en' ? 'BM' : 'EN'; b.setAttribute('aria-label', lang === 'en' ? 'Bahasa Melayu' : 'English');
  // tajuk & pengenalan: terjemah jika masih teks lalai
  const { heading, tagline } = state.site;
  $('#site-heading').textContent = !heading || heading === I18N.ms.heading ? t('heading') : heading;
  $('#site-tagline').textContent = !tagline || tagline === I18N.ms.tagline ? t('tagline') : tagline;
  $('#foot-note').textContent = t('foot') + (state.site.feedbackUrl ? t('footLog') : '');
}

/* ---------------- Saiz tulisan (A+) ---------------- */
let fontLevel = Number(store.get('tanya.fs')) || 0;
function applyFont() {
  document.documentElement.classList.remove('fs-1', 'fs-2');
  if (fontLevel) document.documentElement.classList.add(`fs-${fontLevel}`);
  const b = $('#btn-font'); b.textContent = ['A+', 'A++', 'A'][fontLevel]; b.setAttribute('aria-pressed', String(fontLevel > 0));
}

/* ---------------- Utiliti ---------------- */
const getIndex = (app) => {
  if (!idxCache.has(app.id)) idxCache.set(app.id, buildIndex(app));
  return idxCache.get(app.id);
};
const currentApp = () => (state.route.view === 'chat' ? state.apps.find((a) => a.id === state.route.id) : null);
const chatOf = (id) => (state.chats[id] ||= []);
const el = (html) => { const tp = document.createElement('template'); tp.innerHTML = html.trim(); return tp.content.firstElementChild; };
const fmtDate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${t('months')[m - 1]} ${y}`;
};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const answerHtml = (text, app) => linkTimes(md(text), app.video);
const daysFrom = (iso) => { const [y, m, d] = iso.split('-').map(Number); const a = new Date(y, m - 1, d), b = new Date(); b.setHours(0, 0, 0, 0); return Math.round((a - b) / 864e5); };

/* ---------------- 🆕 Baru & ⏳ tarikh tutup ---------------- */
const NEW_DAYS = 14;
const isRecent = (f) => !!f.n && -daysFrom(f.n) <= NEW_DAYS;
const appAllNew = (app) => app.faqs.length > 0 && app.faqs.every(isRecent);
const recentFaqs = (app) => (appAllNew(app) ? [] : app.faqs.map((f, i) => (isRecent(f) ? i : -1)).filter((i) => i >= 0));
const newTag = (app, f) => (isRecent(f) && !appAllNew(app) ? `<span class="new-badge">🆕 ${esc(t('newLbl'))}</span>` : '');
function deadlineText(app) {
  if (!app.deadline) return null;
  const n = daysFrom(app.deadline), label = app.deadlineLabel || t('dlDefault'), d = fmtDate(app.deadline);
  if (n > 0) return { text: t('dlLeft', { label, n, d }), soon: n <= 7, n };
  if (n === 0) return { text: t('dlToday', { label, d }), soon: true, n };
  if (n >= -7) return { text: t('dlPast', { label, d }), soon: false, n };
  return null;
}
const plain = (s) => String(s).replace(/\*\*/g, '').replace(/^\s*[-*•]\s+/gm, '').replace(/\s+/g, ' ').trim();
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };

/* ---------------- Statistik (Google Sheet pemilik, jika disambung) ---------------- */
function track(type, data) {
  const url = state.site.feedbackUrl; if (!url) return;
  try {
    fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type, ...data }) }).catch(() => {});
  } catch { /* abaikan */ }
}
function trackVisit(name) {
  if (!name) return;
  const k = `tanya.v.${name}`;
  try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch { /* abaikan */ }
  track('visit', { app: name });
}

/* ---------------- Pengumuman ---------------- */
function dismissed() { try { return JSON.parse(store.get('tanya.dismissed') || '[]'); } catch { return []; } }
function annHtml(text, url, until) {
  if (!text || (until && today() > until)) return '';
  const id = hash(text);
  if (dismissed().includes(id)) return '';
  const body = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)} →</a>` : esc(text);
  return `<div class="announce" role="status"><span class="a-ic">📢</span><div class="a-txt">${body}</div><button class="a-x" type="button" data-dismiss="${id}" aria-label="${esc(t('dismiss'))}">✕</button></div>`;
}
function renderAnnounce() {
  const s = state.site, app = currentApp();
  const site = annHtml(s.announce, s.announceUrl, s.announceUntil);
  $('[data-slot=home]').innerHTML = site;
  $('[data-slot=chat]').innerHTML = (app && annHtml(app.announce, '', app.announceUntil)) || site;
}

/* ---------------- Routing: #canva membuka terus soal jawab Canva ---------------- */
function route() {
  let h = '';
  try { h = decodeURIComponent(location.hash.slice(1)); } catch { h = location.hash.slice(1); }
  state.route = h ? { view: 'chat', id: h } : { view: 'home' };
  closeSheet();
  if (window.speechSynthesis) { speechSynthesis.cancel(); state.speakingId = null; }
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
  const title = state.site.title || 'TanyaJer';
  document.title = app ? `${app.name} · ${title}` : `${title} – ${t('docTitle')}`;
  renderAnnounce();
  if (v === 'home') renderHome(); else renderChat();
  if (state.status === 'ready') trackVisit(app ? app.name : (v === 'home' ? 'Laman utama' : ''));
}

/* ---------------- Halaman utama: kategori, tab app & carian soalan ---------------- */
function notice() {
  if (state.status === 'error') return `<div class="notice">${esc(t('loadErr'))}</div>`;
  if (state.status === 'offline') return `<div class="notice">${esc(t('offline'))}</div>`;
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
  const cats = categories();
  if (state.cat && !cats.includes(state.cat)) state.cat = '';
  $('#cat-tabs').hidden = !cats.length || !!q;
  $('#cat-tabs').innerHTML = cats.length ? ['', ...cats].map((c) => `<button class="cat${c === state.cat ? ' on' : ''}" type="button" role="tab" aria-selected="${c === state.cat}" data-cat="${esc(c)}">${c ? esc(c) : esc(t('all'))}</button>`).join('') : '';

  if (state.status === 'loading') { grid.innerHTML = '<div class="skel"></div>'.repeat(4); $('#home-results').innerHTML = ''; return; }
  if (state.status === 'error') { grid.innerHTML = ''; $('#home-results').innerHTML = ''; return; }
  if (!state.apps.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">📭</div>${esc(t('noApps'))}</div>`; return; }

  const results = raw.length >= 3 ? searchAll(raw) : [];
  $('#home-results').innerHTML = results.length ? `<div class="res-head">${esc(t('answersFromFaq'))}</div>${results.map((r, n) => `
    <button class="res" type="button" data-res="${n}">
      <span class="emo">${esc(r.app.emoji)}</span>
      <span class="res-txt"><b>${esc(r.app.faqs[r.i].q)}</b><span>${esc(r.app.name)}</span></span><span class="go">›</span>
    </button>`).join('')}` : '';
  state.homeResults = results;

  const list = state.apps.filter((a) => (q ? norm(a.name).includes(q) : !state.cat || a.category === state.cat));
  grid.innerHTML = list.length
    ? list.map((a) => {
      const dl = deadlineText(a), rec = recentFaqs(a).length;
      const badge = dl && dl.n >= 0 && dl.n <= 30 ? `<span class="tab-badge${dl.soon ? ' soon' : ''}">${esc(t('dlTab', { n: dl.n }))}</span>`
        : appAllNew(a) ? `<span class="tab-badge new">${esc(t('newLbl'))}</span>`
        : rec ? `<span class="tab-badge new">🆕 ${rec}</span>` : '';
      return `<a class="app-tab" href="#${encodeURIComponent(a.id)}" title="${esc(a.name)}"><span class="emo">${esc(a.emoji)}</span><span class="nm">${esc(a.name)}</span>${badge}</a>`;
    }).join('')
    : (results.length ? '' : `<div class="empty" style="grid-column:1/-1">${esc(t('noMatchHome'))}</div>`);
}
function searchAll(text) {
  const out = [];
  for (const app of state.apps) {
    for (const x of searchFaq(getIndex(app), text).filter((r) => r.score >= 0.32).slice(0, 2)) out.push({ app, i: x.i, score: x.score });
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
      ? `<div class="empty" style="margin-top:24px">${esc(t('loading'))}</div>`
      : `${notice()}<div class="empty" style="margin-top:24px"><div class="big">🤔</div>${esc(t('notFound'))}<div style="margin-top:12px"><button class="btn" type="button" data-act="home">${esc(t('seeAll'))}</button></div></div>`;
    return;
  }
  miss.hidden = true; main.hidden = false;
  $('#chat-emo').textContent = app.emoji;
  $('#chat-name').textContent = app.name;
  $('#chat-sub').textContent = [t('nQ', { n: app.faqs.length }), app.updated ? t('updated', { d: fmtDate(app.updated) }) : ''].filter(Boolean).join(' · ');
  const vid = $('#btn-video'); vid.hidden = !app.video; if (app.video) vid.href = app.video;
  const dl = deadlineText(app), dlEl = $('#deadline');
  dlEl.hidden = !dl; if (dl) { dlEl.textContent = dl.text; dlEl.classList.toggle('soon', dl.soon); }
  const off = $('#btn-official'); off.hidden = !app.official; if (app.official) { off.href = app.official; off.title = app.officialLabel || t('officialSite'); }
  if (state.chatFor !== app.id) { state.chatFor = app.id; renderAllMsgs(app); }
  if (state.pending && state.pending.id === app.id) {
    const { i, text } = state.pending; state.pending = null;
    if (app.faqs[i]) {
      pushMsg(app, { role: 'user', text: text || app.faqs[i].q });
      pushMsg(app, { role: 'bot', ...answerFor(app, i, text), related: relatedTo(app, i) });
      track('question', { app: app.name, question: text || app.faqs[i].q, faq: app.faqs[i].q, status: 'jawab' });
    }
  }
}
function renderAllMsgs(app) {
  const box = $('#msgs');
  box.innerHTML = '';
  const msgs = chatOf(app.id);
  if (!msgs.length) {
    const meta = [app.source ? `${esc(t('source'))}: <b>${esc(app.source)}</b>` : '', app.updated ? `${esc(t('updatedCap'))} ${esc(fmtDate(app.updated))}` : ''].filter(Boolean).join(' · ');
    const links = [
      app.video ? `<a class="chip ai" href="${esc(app.video)}" target="_blank" rel="noopener noreferrer">${esc(t('watchVideo'))}</a>` : '',
      app.official ? `<a class="chip ai" href="${esc(app.official)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(app.officialLabel || t('officialSite'))}</a>` : '',
    ].join('');
    box.appendChild(el(`<div class="msg bot"><div class="bubble"><p>${t('hi', { name: esc(app.name) })}</p>
      <p class="muted" style="font-size:.87em;margin-top:4px">${esc(t('willSearch', { n: app.faqs.length }))}</p>
      ${meta ? `<p class="src-meta">📌 ${meta}</p>` : ''}
      ${links ? `<div class="links">${links}</div>` : ''}
      ${recentFaqs(app).length ? `<div class="related"><div class="lbl">${esc(t('newCount', { n: recentFaqs(app).length }))}</div>${recentFaqs(app).slice(0, 4).map((i) => `<button class="chip" type="button" data-faq="${i}">${esc(app.faqs[i].q)}</button>`).join('')}</div>` : ''}</div></div>`));
  }
  for (const m of msgs) box.appendChild(msgEl(m, app));
  renderChips(app);
}
function renderChips(app) {
  const shown = new Set(recentFaqs(app).slice(0, 4));
  $('#chips').innerHTML = !chatOf(app.id).length
    ? app.faqs.map((f, i) => i).filter((i) => !shown.has(i)).slice(0, 4).map((i) => `<button class="chip" type="button" data-faq="${i}">${esc(app.faqs[i].q)}</button>`).join('')
    : '';
}
function contactBtn() {
  const { contactUrl, contactLabel } = state.site;
  if (!contactUrl || !/^(https?:|mailto:)/i.test(contactUrl)) return '';
  return `<a class="chip ai" href="${esc(contactUrl)}" target="_blank" rel="noopener noreferrer">💬 ${esc(contactLabel || 'Tanya terus')}</a>`;
}
function actionsHtml(m) {
  let h = '<div class="acts">';
  if (state.site.feedbackUrl) {
    h += m.voted
      ? `<span class="thanks">${m.voted === 'up' ? '👍' : '👎'} ${esc(t('thanks'))}</span>`
      : `<span class="lbl">${esc(t('helpful'))}</span><button class="act" type="button" data-vote="up" data-mid="${m.id}" aria-label="${esc(t('yes'))}">👍</button><button class="act" type="button" data-vote="down" data-mid="${m.id}" aria-label="${esc(t('no'))}">👎</button>`;
  }
  h += '<span class="acts-r">';
  if (window.speechSynthesis) h += `<button class="act link" type="button" data-speak="${m.id}">${esc(state.speakingId === m.id ? t('stop') : t('listen'))}</button>`;
  h += `<button class="act link" type="button" data-share="${m.id}">${esc(t('share'))}</button></span></div>`;
  if (m.shareOpen) {
    const { url, text } = shareData(m);
    h += `<div class="share-row">
      <a class="chip" href="https://wa.me/?text=${encodeURIComponent(`${text}\n\n${url}`)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a class="chip" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}" target="_blank" rel="noopener noreferrer">Telegram</a>
      <button class="chip" type="button" data-copy="${m.id}">${esc(m.copied ? t('copied') : t('copyLink'))}</button></div>`;
  }
  return h;
}
function msgEl(m, app) {
  if (m.role === 'user') return el(`<div class="msg user"><div class="bubble">${esc(m.text)}</div></div>`);
  const faqs = app.faqs;
  let h = '';
  if (m.from === 'faq') h += `<div class="src"><b>${esc(m.ai ? t('aiSummary') : t('fromFaq'))}</b>${newTag(app, faqs[m.faqIdx])}<span>· ${esc(m.matchedQ)}</span></div>`;
  const text = m.from === 'maybe' ? t('maybe') : m.from === 'none' ? t('none', { name: app.name }) : m.text;
  h += `<div class="md">${m.from === 'faq' ? answerHtml(text, app) : md(text)}</div>`;
  if (m.full) h += `<details class="full"><summary>${esc(t('readFull'))}</summary><div class="md">${answerHtml(m.full, app)}</div></details>`;
  if (m.from === 'faq') h += actionsHtml(m);
  if (m.suggestions?.length) {
    h += `<div style="margin-top:8px">${m.suggestions.map((i) => `<button class="chip" type="button" data-faq="${i}">${esc(faqs[i].q)}</button>`).join('')}</div>`;
  }
  if (m.from === 'none' || m.from === 'maybe') {
    h += `<div style="margin-top:8px"><button class="chip" type="button" data-act="allfaq">${esc(t('seeAllFaq'))}</button>${contactBtn()}</div>`;
  }
  if (m.related?.length) {
    h += `<div class="related"><div class="lbl">${esc(t('related'))}</div>${m.related.map((i) => `<button class="chip" type="button" data-faq="${i}">${esc(faqs[i].q)}</button>`).join('')}</div>`;
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
  const toks = uniq(tokenize(text)).filter((x) => !x.startsWith('q_') && !idx.nameT.has(x) && bestSim(x, qTok) < 0.7);
  if (!toks.length) return [];
  return f.p.map((p, k) => { const pt = tokenize(p); return { k, s: toks.reduce((n, x) => n + bestSim(x, pt), 0) / toks.length }; })
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
    pushMsg(app, { role: 'bot', ...answerFor(app, top.i, text), related: results.slice(1, 4).filter((r) => r.score >= 0.25).map((r) => r.i) });
    track('question', { app: app.name, question: text, faq: app.faqs[top.i].q, status: 'jawab' });
  } else if (top && top.score >= 0.2) {
    pushMsg(app, { role: 'bot', from: 'maybe', suggestions: results.slice(0, 3).filter((r) => r.score >= 0.14).map((r) => r.i) });
    track('question', { app: app.name, question: text, faq: app.faqs[top.i].q, status: 'mungkin' });
  } else {
    pushMsg(app, { role: 'bot', from: 'none' });
    track('question', { app: app.name, question: text, faq: '', status: 'tiada' });
  }
}
function showFaq(i, typed) {
  const app = currentApp();
  const f = app?.faqs[i];
  if (!f) return;
  pushMsg(app, { role: 'user', text: f.q });
  pushMsg(app, { role: 'bot', ...answerFor(app, i, ''), related: relatedTo(app, i) });
  if (typed) track('question', { app: app.name, question: typed, faq: f.q, status: 'cadangan' });
}

/* ---------------- Cadangan semasa menaip ---------------- */
function suggest() {
  const app = currentApp(); if (!app) return;
  const v = $('#ask-input').value.trim();
  if (v.length < 2) { renderChips(app); return; }
  const res = searchFaq(getIndex(app), v).filter((r) => r.score >= 0.22).slice(0, 4);
  if (res.length) {
    $('#chips').innerHTML = `<div class="sug-lbl">${esc(t('suggest'))}</div>${res.map((r) => `<button class="chip sug" type="button" data-sug="${r.i}">${esc(app.faqs[r.i].q)}</button>`).join('')}`;
  } else renderChips(app);
}

/* ---------------- 👍 / 👎 ---------------- */
function vote(m, v) {
  if (m.voted) return;
  m.voted = v; refreshMsg(m);
  const app = state.apps.find((a) => a.id === m.appId);
  track('feedback', { app: app?.name || m.appId, question: m.question || '', faq: m.matchedQ, vote: v });
}

/* ---------------- 🔊 Dengar jawapan ---------------- */
function speak(m) {
  const synth = window.speechSynthesis; if (!synth) return;
  const was = state.speakingId;
  synth.cancel();
  state.speakingId = null;
  const prev = was && findMsg(was); if (prev) refreshMsg(prev);
  if (was === m.id) return;
  const u = new SpeechSynthesisUtterance(plain(`${m.matchedQ}. ${m.text}`));
  const voices = synth.getVoices();
  const v = voices.find((x) => /^ms/i.test(x.lang)) || voices.find((x) => /^id/i.test(x.lang));
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'ms-MY';
  u.rate = 0.95;
  const done = () => { if (state.speakingId === m.id) { state.speakingId = null; refreshMsg(m); } };
  u.onend = done; u.onerror = done;
  state.speakingId = m.id; refreshMsg(m);
  synth.speak(u);
}

/* ---------------- Kongsi jawapan ---------------- */
function shareData(m) {
  const app = state.apps.find((a) => a.id === m.appId);
  const f = app.faqs[m.faqIdx];
  const url = new URL(f.k ? `faq/${app.id}/${f.k}.html` : `faq/${app.id}.html`, location.href).href;
  const summary = plain(f.s || f.a);
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
  catch { m.copied = false; window.prompt?.(t('copyPrompt'), shareData(m).url); }
  refreshMsg(m);
}

/* ---------------- Senarai semua FAQ ---------------- */
function openSheet() {
  const app = currentApp(); if (!app) return;
  $('#sheet-title').textContent = t('allFaqTitle', { name: app.name });
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
    ? order.map((i) => `<details class="faq"><summary>${esc(app.faqs[i].q)} ${newTag(app, app.faqs[i])}</summary><div class="ans">${answerHtml(app.faqs[i].a, app)}</div></details>`).join('')
    : `<div class="muted" style="padding:10px 2px">${esc(t('noFaqMatch'))}</div>`;
}

/* ---------------- Peristiwa ---------------- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (b.id === 'brand' || b.id === 'chat-back' || d.act === 'home') return go('');
  if (b.id === 'btn-allfaq' || d.act === 'allfaq') return openSheet();
  if (b.id === 'sheet-close') return closeSheet();
  if (b.id === 'btn-lang') {
    lang = lang === 'en' ? 'ms' : 'en'; store.set('tanya.lang', lang);
    applyLang(); state.chatFor = null; render(); return;
  }
  if (b.id === 'btn-font') { fontLevel = (fontLevel + 1) % 3; store.set('tanya.fs', String(fontLevel)); applyFont(); return; }
  if (d.dismiss) { const list = dismissed(); list.push(d.dismiss); store.set('tanya.dismissed', JSON.stringify(list.slice(-30))); renderAnnounce(); return; }
  if (d.faq !== undefined) return showFaq(Number(d.faq));
  if (d.sug !== undefined) { const typed = $('#ask-input').value.trim(); $('#ask-input').value = ''; return showFaq(Number(d.sug), typed); }
  if (d.cat !== undefined) { state.cat = d.cat; return renderHome(); }
  if (d.res !== undefined) return openResult(Number(d.res));
  if (d.vote) { const m = findMsg(d.mid); if (m) vote(m, d.vote); return; }
  if (d.speak) { const m = findMsg(d.speak); if (m) speak(m); return; }
  if (d.share) { const m = findMsg(d.share); if (m) share(m); return; }
  if (d.copy) { const m = findMsg(d.copy); if (m) copyShare(m); }
});
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
$('#sheet-search').addEventListener('input', renderSheet);
let homeTimer, sugTimer;
$('#home-search').addEventListener('input', () => { clearTimeout(homeTimer); homeTimer = setTimeout(renderHome, 120); });
$('#home-search').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault(); clearTimeout(homeTimer); renderHome();
  if (state.homeResults?.length) openResult(0);
  else { const a = $('#app-grid .app-tab'); if (a) a.click(); }
});
$('#ask-input').addEventListener('input', () => { clearTimeout(sugTimer); sugTimer = setTimeout(suggest, 110); });
$('#ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  clearTimeout(sugTimer);
  const inp = $('#ask-input');
  const v = inp.value;
  inp.value = '';
  ask(v);
});
window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);
if (window.speechSynthesis) speechSynthesis.getVoices();

/* ---------------- Mula ---------------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
applyFont();
applyLang();
route();
fetch('data/apps.json', { cache: 'no-cache' })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((data) => {
    state.site = data.site || {};
    state.apps = (data.apps || []).map((a) => ({ ...a, emoji: a.emoji || '📱', description: a.description || '', category: a.category || '', faqs: a.faqs || [] }));
    state.status = navigator.onLine === false ? 'offline' : 'ready';
    if (state.site.title) $('#site-title').textContent = state.site.title;
    applyLang();
    render();
  })
  .catch(() => { state.status = 'error'; render(); });
