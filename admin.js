// TanyaJer — halaman admin.
// Menyimpan app & fail FAQ terus ke repo GitHub melalui GitHub API (guna token pemilik),
// kemudian GitHub Actions membina dan menerbitkan semula laman secara automatik.
import { esc, parseCSV, rowsToFaq, parseJSONFaq, parseText, pdfItemsToText, slugify } from './src/faq-core.js';

const API = 'https://api.github.com';
const SUPPORTED = ['csv', 'tsv', 'json', 'txt', 'md', 'markdown', 'docx', 'pdf'];
const MAX_BYTES = 10 * 1024 * 1024;
const MAMMOTH = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const $ = (s, r = document) => r.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* abaikan */ } },
};
const S = { owner: '', repo: '', branch: 'main', token: '', config: { site: {}, apps: {} }, files: [], live: {}, editor: null, watch: null, busy: false };

/* ---------------- Utiliti ---------------- */
function detectRepo() {
  const saved = store.get('tanya.repo');
  if (/^[\w.-]+\/[\w.-]+$/.test(saved)) { const [owner, repo] = saved.split('/'); return { owner, repo }; }
  const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  if (m) {
    const seg = location.pathname.split('/').filter(Boolean)[0];
    return { owner: m[1], repo: seg && !/\.html?$/i.test(seg) ? seg : `${m[1]}.github.io` };
  }
  return { owner: '', repo: '' };
}
const repoPath = (p) => `/repos/${S.owner}/${S.repo}${p}`;
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
const extOf = (name) => (name.split('.').pop() || '').toLowerCase();
const fileId = (name) => slugify(name.replace(/\.[^.]+$/, '').split('__')[0]);
const titleCase = (s) => s.replace(/[-_]+/g, ' ').trim().replace(/\b\p{L}/gu, (c) => c.toUpperCase());

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const textToB64 = (t) => bytesToB64(new TextEncoder().encode(t));
const b64ToText = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

async function gh(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (auth && S.token) headers.Authorization = `Bearer ${S.token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error((data && data.message) || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return data;
}
function errMsg(e) {
  const m = String(e?.message || e);
  if (e?.status === 401) return 'Token tidak sah atau sudah tamat tempoh. Buat token baru.';
  if (e?.status === 403 && /rate limit/i.test(m)) return 'Had permintaan GitHub dicapai. Cuba lagi sebentar nanti.';
  if (e?.status === 403) return 'Token tiada kebenaran. Pastikan "Contents: Read and write" untuk repo ini.';
  if (e?.status === 404) return 'Repo tidak dijumpai, atau token tiada akses kepada repo ini.';
  if (e?.status === 409 || e?.status === 422) return 'Data di GitHub baru berubah. Cuba simpan sekali lagi.';
  if (e instanceof TypeError) return 'Tiada sambungan internet, atau GitHub tidak dapat dicapai.';
  return m;
}
function setStatus(sel, msg, kind) { const s = $(sel); if (!s) return; s.textContent = msg || ''; s.className = 'status' + (kind ? ' ' + kind : ''); }
function banner(html, kind) { $('#banner').innerHTML = html ? `<div class="banner ${kind || ''}">${html}</div>` : ''; }

/* ---------------- Paparan ---------------- */
function show(view) {
  $('#loading').hidden = view !== 'loading';
  $('#token-card').hidden = view !== 'token';
  $('#main').hidden = view !== 'main';
  $('#editor').hidden = view !== 'editor';
  window.scrollTo(0, 0);
}
function showToken(canCancel) {
  const full = S.owner && S.repo ? `${S.owner}/${S.repo}` : '';
  $('#t-repo').value = full;
  $('#t-repo-name').textContent = full || 'anda';
  $('#t-repo-name2').textContent = S.repo || 'ini';
  $('#t-token').value = '';
  $('#t-cancel').hidden = !canCancel;
  $('#t-clear').hidden = !S.token;
  setStatus('#t-status', '');
  show('token');
}

/* ---------------- Muat data dari GitHub ---------------- */
async function loadAll() {
  const repo = await gh(repoPath(''));
  S.branch = repo.default_branch || 'main';
  const [cfg, dir] = await Promise.all([
    gh(repoPath(`/contents/config.json?ref=${S.branch}`)).catch((e) => { if (e.status === 404) return null; throw e; }),
    gh(repoPath(`/contents/faqs?ref=${S.branch}`)).catch((e) => { if (e.status === 404) return []; throw e; }),
  ]);
  try { S.config = cfg ? JSON.parse(b64ToText(cfg.content)) : {}; }
  catch { throw new Error('config.json dalam repo bukan JSON yang sah. Betulkan fail itu di GitHub dahulu.'); }
  S.config.site ||= {}; S.config.apps ||= {};
  S.files = (Array.isArray(dir) ? dir : [])
    .filter((f) => f.type === 'file' && !/^[._]/.test(f.name) && !/^readme/i.test(f.name))
    .map((f) => ({ name: f.name, path: f.path, sha: f.sha, id: fileId(f.name) }));
  loadLive();
}
async function loadLive() {
  try {
    const d = await (await fetch(`data/apps.json?t=${Date.now()}`, { cache: 'no-store' })).json();
    S.live = Object.fromEntries((d.apps || []).map((a) => [a.id, a.faqs.length]));
  } catch { S.live = {}; }
  if (!$('#main').hidden) renderList();
}
function allApps() {
  const ids = [...new Set([...Object.keys(S.config.apps).map((k) => slugify(k)), ...S.files.map((f) => f.id)])];
  return ids.map((id) => {
    const meta = S.config.apps[id] || {};
    return { id, name: meta.name || titleCase(id), emoji: meta.emoji || '📱', description: meta.description || '',
      category: meta.category || '', video: meta.video || '', source: meta.source || '', updated: meta.updated || '',
      official: meta.official || '', officialLabel: meta.officialLabel || '', announce: meta.announce || '', announceUntil: meta.announceUntil || '',
      deadline: meta.deadline || '', deadlineLabel: meta.deadlineLabel || '',
      order: Number.isFinite(meta.order) ? meta.order : 1000, files: S.files.filter((f) => f.id === id) };
  }).sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
}
function renderList() {
  const apps = allApps();
  $('#repo-line').textContent = `Repo: ${S.owner}/${S.repo}`;
  $('#list').innerHTML = apps.length ? apps.map((a) => {
    const live = S.live[a.id];
    const info = !a.files.length ? '<span style="color:var(--warn)">⚠️ Belum ada fail FAQ</span>'
      : live != null ? `${live} soalan di laman` : 'Belum diterbitkan';
    return `<div class="arow">
      <div class="emo">${esc(a.emoji)}</div>
      <div class="inf"><b>${esc(a.name)}</b><div class="muted" style="font-size:13px">${info}${a.category ? ` · 🏷️ ${esc(a.category)}` : ''}${a.video ? ' · ▶️ video' : ''}${a.deadline ? ` · ⏳ ${esc(a.deadline)}` : ''}</div>
        <div class="files">${a.files.map((f) => '📄 ' + esc(f.name)).join(' · ')}</div></div>
      <div class="row">
        <button class="btn sm" type="button" data-upload="${esc(a.id)}">⬆️ Upload FAQ</button>
        <button class="btn sm" type="button" data-edit="${esc(a.id)}">✏️ Edit</button>
        <button class="btn sm" type="button" data-copy="${esc(a.id)}">🔗 Link</button>
        <button class="btn sm" type="button" data-qr="${esc(a.id)}">🔳 QR</button>
        <button class="btn sm danger" type="button" data-del="${esc(a.id)}">Padam</button>
      </div></div>`;
  }).join('') : '<div class="empty">Belum ada aplikasi. Tekan <b>+ Tambah app</b> untuk mula.</div>';
}

/* ---------------- Tulis ke GitHub ---------------- */
async function saveConfig(mutate, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let cur = null;
    try { cur = await gh(repoPath(`/contents/config.json?ref=${S.branch}`)); } catch (e) { if (e.status !== 404) throw e; }
    let cfg;
    try { cfg = cur ? JSON.parse(b64ToText(cur.content)) : {}; } catch { throw new Error('config.json dalam repo bukan JSON yang sah.'); }
    cfg.site ||= {}; cfg.apps ||= {};
    mutate(cfg);
    try {
      const r = await gh(repoPath('/contents/config.json'), { method: 'PUT',
        body: { message, content: textToB64(JSON.stringify(cfg, null, 2) + '\n'), sha: cur ? cur.sha : undefined, branch: S.branch } });
      S.config = cfg;
      return r.commit.sha;
    } catch (e) { if ((e.status === 409 || e.status === 422) && attempt === 0) continue; throw e; }
  }
}
async function putFile(path, content, message) {
  let sha = S.files.find((f) => f.path === path)?.sha;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await gh(repoPath('/contents/' + encPath(path)), { method: 'PUT', body: { message, content, sha, branch: S.branch } });
      return r.commit.sha;
    } catch (e) {
      if ((e.status === 409 || e.status === 422) && attempt === 0) {
        try { sha = (await gh(repoPath(`/contents/${encPath(path)}?ref=${S.branch}`))).sha; } catch { sha = undefined; }
        continue;
      }
      throw e;
    }
  }
}
async function delFile(f, message) {
  const r = await gh(repoPath('/contents/' + encPath(f.path)), { method: 'DELETE', body: { message, sha: f.sha, branch: S.branch } });
  return r.commit.sha;
}
function stamp() { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
async function uploadFaq(id, file, mode) {
  const ext = extOf(file.name);
  const content = bytesToB64(new Uint8Array(await file.arrayBuffer()));
  const old = S.files.filter((f) => f.id === id);
  const path = mode === 'add' ? `faqs/${id}__${stamp()}.${ext}` : `faqs/${id}.${ext}`;
  let sha = await putFile(path, content, `Upload FAQ ${id}: ${file.name}`);
  if (mode !== 'add') for (const f of old) if (f.path !== path) sha = await delFile(f, `Buang FAQ lama: ${f.name}`);
  return sha;
}

/* ---------------- Pantau GitHub Actions ---------------- */
async function watchBuild(sha) {
  if (!sha) return;
  const me = (S.watch = { sha });
  banner('⏳ Menerbitkan laman… biasanya 1–2 minit. Anda boleh tutup halaman ini.', '');
  const t0 = Date.now();
  while (S.watch === me && Date.now() - t0 < 6 * 60 * 1000) {
    await sleep(7000);
    let run = null;
    for (const auth of [true, false]) {
      try { run = (await gh(repoPath(`/actions/runs?head_sha=${sha}&per_page=1`), { auth })).workflow_runs?.[0] || null; break; }
      catch { /* cuba tanpa token */ }
    }
    if (S.watch !== me) return;
    if (!run || run.status !== 'completed') continue;
    if (run.conclusion === 'success') {
      banner('✅ Dah live! <a href="./">Buka laman utama</a>', 'ok');
      setTimeout(loadLive, 15000);
    } else if (run.conclusion !== 'cancelled') {
      banner(`❌ Penerbitan gagal. <a href="${esc(run.html_url)}" target="_blank" rel="noopener">Lihat log di GitHub</a>`, 'err');
    }
    return;
  }
  if (S.watch === me) banner(`Penerbitan mengambil masa lebih lama. <a href="https://github.com/${esc(S.owner)}/${esc(S.repo)}/actions" target="_blank" rel="noopener">Semak di tab Actions</a>`, 'warn');
}

/* ---------------- Pratonton fail FAQ ---------------- */
const scripts = {};
function loadScript(src) {
  return (scripts[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res;
    s.onerror = () => { delete scripts[src]; rej(new Error('Gagal memuatkan pembaca fail.')); };
    document.head.appendChild(s);
  }));
}
async function extractDocx(file) { await loadScript(MAMMOTH); return (await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value || ''; }
async function extractPdf(file) {
  await loadScript(PDFJS);
  const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) pages.push((await (await pdf.getPage(p)).getTextContent()).items);
  return pdfItemsToText(pages);
}
async function parseLocal(file) {
  const ext = extOf(file.name);
  if (ext === 'csv' || ext === 'tsv') return rowsToFaq(parseCSV(await file.text()));
  if (ext === 'json') return parseJSONFaq(await file.text());
  if (ext === 'docx') return parseText(await extractDocx(file));
  if (ext === 'pdf') return parseText(await extractPdf(file));
  return parseText(await file.text());
}
async function pickFile(file) {
  const ed = S.editor; if (!ed) return;
  const pv = $('#pv');
  ed.file = null; ed.pairs = null;
  if (!SUPPORTED.includes(extOf(file.name))) { pv.innerHTML = '<div class="status err">Format tidak disokong. Guna CSV, TXT, MD, JSON, DOCX atau PDF.</div>'; return; }
  if (file.size > MAX_BYTES) { pv.innerHTML = '<div class="status err">Fail terlalu besar (maksimum 10 MB).</div>'; return; }
  ed.file = file;
  $('#drop-name').textContent = `📄 ${file.name}`;
  pv.innerHTML = '<div class="status">Membaca fail…</div>';
  try {
    const pairs = await parseLocal(file);
    if (S.editor !== ed) return;
    ed.pairs = pairs;
    pv.innerHTML = pairs.length
      ? `<div class="status">✓ Jumpa ${pairs.length} soalan</div><ol>${pairs.slice(0, 6).map((p) => `<li>${esc(p.q)}</li>`).join('')}${pairs.length > 6 ? `<li style="list-style:none">… dan ${pairs.length - 6} lagi</li>` : ''}</ol>`
      : '<div class="status err">Tiada soalan dijumpai. Guna label S:/J:, atau pastikan setiap soalan berakhir dengan "?". Lihat README untuk contoh format.</div>';
  } catch (e) {
    if (S.editor !== ed) return;
    ed.pairs = undefined; // tak dapat pratonton, tapi masih boleh upload
    pv.innerHTML = `<div class="status warn">Pratonton tidak dapat dibuat (${esc(e.message)}). Fail masih boleh diupload. Semak hasilnya selepas diterbitkan.</div>`;
  }
}

/* ---------------- Borang: tambah / edit / upload ---------------- */
function openEditor(mode, id) {
  const app = id ? allApps().find((a) => a.id === id) : null;
  S.editor = { mode, id: app?.id || '', file: null, pairs: null, idTouched: false };
  const title = mode === 'new' ? 'Tambah app baru' : mode === 'edit' ? `Edit ${esc(app.name)}` : `Upload FAQ · ${esc(app.name)}`;
  const fields = mode === 'upload' ? '' : `
    <label class="f">Nama aplikasi<input id="e-name" value="${esc(app?.name || '')}" placeholder="cth: Canva" maxlength="60"></label>
    <div class="grid2">
      <label class="f">Ikon (emoji)<input id="e-emoji" value="${esc(app?.emoji || '📱')}" maxlength="8"></label>
      <label class="f">ID untuk link<input id="e-id" value="${esc(app?.id || '')}" placeholder="canva" ${mode === 'new' ? '' : 'disabled'}><div class="hint">Link: …/#${esc(app?.id || 'id')}</div></label>
    </div>
    <label class="f">Penerangan ringkas (pilihan)<input id="e-desc" value="${esc(app?.description || '')}" placeholder="cth: Tutorial design poster & thumbnail" maxlength="140"></label>
    <label class="f">Kategori (pilihan)<input id="e-cat" list="cat-list" value="${esc(app?.category || '')}" placeholder="cth: Kerajaan, Design, Video" maxlength="30">
      <datalist id="cat-list">${uniqCats().map((c) => `<option value="${esc(c)}">`).join('')}</datalist><div class="hint">App dengan kategori sama dikumpulkan dalam tab yang sama di laman utama.</div></label>
    <label class="f">Link video tutorial (pilihan)<input id="e-video" type="url" inputmode="url" value="${esc(app?.video || '')}" placeholder="https://youtu.be/…"><div class="hint">Butang ▶️ Tonton akan muncul. Tulis "minit 03:42" dalam jawapan FAQ untuk link terus ke minit itu.</div></label>
    <div class="grid2" style="grid-template-columns:1fr 160px">
      <label class="f">Sumber maklumat (pilihan)<input id="e-source" value="${esc(app?.source || '')}" placeholder="cth: LHDN" maxlength="80"></label>
      <label class="f">Tarikh kemas kini<input id="e-updated" type="date" value="${esc(app?.updated || '')}"><div class="hint">Kosong = tarikh upload</div></label>
    </div>
    <div class="grid2" style="grid-template-columns:1fr 160px">
      <label class="f">Pautan rasmi (pilihan)<input id="e-official" type="url" inputmode="url" value="${esc(app?.official || '')}" placeholder="https://bantuantunai.hasil.gov.my"></label>
      <label class="f">Teks butang<input id="e-official-label" value="${esc(app?.officialLabel || '')}" placeholder="Laman rasmi" maxlength="40"></label>
    </div>
    <label class="f">📢 Pengumuman app (pilihan)<input id="e-announce" value="${esc(app?.announce || '')}" placeholder="cth: Permohonan Fasa 2 dibuka 1 Disember!" maxlength="160"></label>
    <label class="f">Papar sehingga<input id="e-announce-until" type="date" value="${esc(app?.announceUntil || '')}"><div class="hint">Pengumuman hilang sendiri selepas tarikh ini. Kosong = sentiasa papar.</div></label>
    <div class="grid2" style="grid-template-columns:160px 1fr">
      <label class="f">⏳ Tarikh tutup (pilihan)<input id="e-deadline" type="date" value="${esc(app?.deadline || '')}"></label>
      <label class="f">Teks kiraan<input id="e-deadline-label" value="${esc(app?.deadlineLabel || '')}" placeholder="Permohonan tutup" maxlength="40"></label>
    </div>
    <div class="hint">Contoh paparan: "⏳ Permohonan tutup: 5 hari lagi". Hilang sendiri 7 hari selepas tarikh tutup.</div>`;
  const hasFiles = app && app.files.length;
  const upload = mode === 'edit' ? '' : `
    <h3>Fail FAQ</h3>
    <div class="drop" id="drop" tabindex="0" role="button"><b id="drop-name">📄 Pilih fail</b> atau seret ke sini
      <small>CSV · TXT · MD · JSON · DOCX · PDF (maks 10 MB)</small>
      <input type="file" id="e-file" accept=".csv,.tsv,.txt,.md,.markdown,.json,.docx,.pdf" hidden></div>
    ${hasFiles ? `<label class="f">Fail lama (${app.files.map((f) => esc(f.name)).join(', ')})
      <select class="f" id="e-mode"><option value="replace">Ganti FAQ lama dengan fail ini</option><option value="add">Tambah — kekalkan fail lama juga</option></select></label>` : ''}
    <div class="pv" id="pv"></div>`;
  $('#editor').innerHTML = `
    <div class="row" style="margin-bottom:10px"><button class="btn sm ghost" type="button" id="e-back">← Kembali</button></div>
    <h2>${title}</h2>
    ${fields}${upload}
    <div class="savebar"><span id="e-status"></span><button class="btn primary" type="button" id="e-save">💾 Simpan & terbit</button></div>`;
  show('editor');

  const nameIn = $('#e-name'), idIn = $('#e-id');
  if (mode === 'new') {
    nameIn.addEventListener('input', () => { if (!S.editor.idTouched) idIn.value = nameIn.value.trim() ? slugify(nameIn.value) : ''; idHint(); });
    idIn.addEventListener('input', () => { S.editor.idTouched = true; idHint(); });
  }
  const drop = $('#drop'), fileIn = $('#e-file');
  if (drop) {
    drop.addEventListener('click', () => fileIn.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); });
    fileIn.addEventListener('change', () => { const f = fileIn.files[0]; if (f) pickFile(f); fileIn.value = ''; });
  }
  $('#e-back').addEventListener('click', closeEditor);
  $('#e-save').addEventListener('click', saveEditor);
  (nameIn || drop)?.focus?.();
}
function idHint() { const h = $('#e-id')?.parentElement.querySelector('.hint'); if (h) h.textContent = `Link: …/#${slugify($('#e-id').value || $('#e-name').value || 'id')}`; }
function closeEditor() { S.editor = null; renderList(); show('main'); }

async function saveEditor() {
  const ed = S.editor; if (!ed || S.busy) return;
  const btn = $('#e-save');
  const status = (m, k) => { const s = $('#e-status'); if (s) { s.textContent = m; s.style.color = k === 'err' ? 'var(--danger)' : ''; } };
  try {
    let lastSha = null;
    if (ed.mode !== 'edit' && !ed.file) throw new Error('Pilih fail FAQ dahulu.');
    if (ed.file && ed.pairs && !ed.pairs.length) throw new Error('Tiada soalan dijumpai dalam fail ini. Semak format.');
    S.busy = true; btn.disabled = true;
    if (ed.mode !== 'upload') {
      const name = $('#e-name').value.trim();
      if (!name) throw new Error('Isi nama aplikasi.');
      const id = ed.mode === 'new' ? slugify($('#e-id').value.trim() || name) : ed.id;
      if (ed.mode === 'new' && allApps().some((a) => a.id === id)) throw new Error(`ID "${id}" sudah digunakan. Tukar ID.`);
      const emoji = $('#e-emoji').value.trim() || '📱';
      const description = $('#e-desc').value.trim();
      const extra = { category: $('#e-cat').value.trim(), video: $('#e-video').value.trim(), source: $('#e-source').value.trim(), updated: $('#e-updated').value,
        official: $('#e-official').value.trim(), officialLabel: $('#e-official-label').value.trim(),
        announce: $('#e-announce').value.trim(), announceUntil: $('#e-announce-until').value,
        deadline: $('#e-deadline').value, deadlineLabel: $('#e-deadline-label').value.trim() };
      if (extra.video && !/^https?:\/\/\S+$/i.test(extra.video)) throw new Error('Link video mesti bermula dengan https://');
      if (extra.official && !/^https?:\/\/\S+$/i.test(extra.official)) throw new Error('Pautan rasmi mesti bermula dengan https://');
      status('Menyimpan maklumat app…');
      lastSha = await saveConfig((cfg) => {
        const prev = cfg.apps[id] || {};
        const order = Number.isFinite(prev.order) ? prev.order
          : Math.max(0, ...Object.values(cfg.apps).map((a) => Number(a?.order) || 0)) + 1;
        const next = { ...prev, name, emoji, description, order };
        for (const [k, v] of Object.entries(extra)) { if (v) next[k] = v; else delete next[k]; }
        cfg.apps[id] = next;
      }, `${ed.mode === 'new' ? 'Tambah' : 'Kemas kini'} app: ${name}`);
      ed.id = id;
    }
    if (ed.file) {
      status('Memuat naik fail FAQ…');
      lastSha = await uploadFaq(ed.id, ed.file, $('#e-mode')?.value || 'replace');
    }
    status('Memuat semula senarai…');
    await loadAll();
    closeEditor();
    watchBuild(lastSha);
  } catch (e) {
    status('⚠️ ' + errMsg(e), 'err');
  } finally {
    S.busy = false; if (btn.isConnected) btn.disabled = false;
  }
}


/* ---------------- Tetapan laman ---------------- */
// Kunci rahsia untuk statistik: disimpan dalam browser admin sahaja, dan disalin ke dalam kod Apps Script.
function statsKey() {
  let k = store.get('tanya.statsKey');
  if (!k) {
    const b = new Uint8Array(15); crypto.getRandomValues(b);
    k = 'tj-' + Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 24);
    store.set('tanya.statsKey', k);
  }
  return k;
}
async function scriptCode(key) {
  const r = await fetch(`tools/google-apps-script.gs?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('Kod Apps Script tidak dijumpai.');
  return (await r.text()).replace("'__KUNCI__'", `'${key}'`);
}
function openSite() {
  const st = S.config.site || {};
  S.editor = { mode: 'site' };
  $('#editor').innerHTML = `
    <div class="row" style="margin-bottom:10px"><button class="btn sm ghost" type="button" id="e-back">← Kembali</button></div>
    <h2>⚙️ Tetapan laman</h2>
    <label class="f">Nama laman<input id="s-title" value="${esc(st.title || 'TanyaJer')}" maxlength="40"></label>
    <label class="f">Tajuk utama<input id="s-heading" value="${esc(st.heading || '')}" placeholder="Ada soalan tentang app dalam tutorial?" maxlength="100"></label>
    <label class="f">Ayat pengenalan<input id="s-tagline" value="${esc(st.tagline || '')}" placeholder="Pilih aplikasi, kemudian taip soalan anda." maxlength="160"></label>

    <h3>📢 Pengumuman (semua halaman)</h3>
    <label class="f">Teks pengumuman (pilihan)<input id="s-announce" value="${esc(st.announce || '')}" placeholder="cth: Video baru: cara mohon STR 2026!" maxlength="160"></label>
    <div class="grid2" style="grid-template-columns:1fr 160px">
      <label class="f">Link (pilihan)<input id="s-announce-url" type="url" value="${esc(st.announceUrl || '')}" placeholder="https://youtu.be/…"></label>
      <label class="f">Papar sehingga<input id="s-announce-until" type="date" value="${esc(st.announceUntil || '')}"></label>
    </div>
    <div class="hint">Pengumuman hilang sendiri selepas tarikh tamat. Kosongkan teks untuk buang.</div>

    <h3>Bila jawapan tidak dijumpai</h3>
    <label class="f">Link untuk tanya terus (pilihan)<input id="s-contact" type="url" value="${esc(st.contactUrl || '')}" placeholder="https://www.youtube.com/@channelanda"><div class="hint">Contoh: channel YouTube, TikTok, atau link WhatsApp.</div></label>
    <label class="f">Teks butang<input id="s-contact-label" value="${esc(st.contactLabel || '')}" placeholder="Tanya di ruangan komen YouTube" maxlength="50"></label>

    <h3>📊 Google Sheet: statistik & 👍/👎</h3>
    <label class="f">Link Google Apps Script (pilihan)<input id="s-feedback" type="url" value="${esc(st.feedbackUrl || '')}" placeholder="https://script.google.com/macros/s/…/exec"><div class="hint">Bila diisi: butang 👍/👎 dipaparkan, dan soalan penonton serta bilangan lawatan direkod (tanpa nama) untuk statistik.</div></label>
    <label class="f">Kunci statistik (rahsia)<input id="s-key" value="${esc(statsKey())}" spellcheck="false" autocomplete="off"><div class="hint">Disimpan dalam browser ini sahaja. Jika guna telefon atau komputer lain, salin kunci yang sama dari kod Apps Script (baris ADMIN_KEY).</div></label>
    <details class="help"><summary>Cara sambung ke Google Sheet (5 minit)</summary>
      <ol class="steps">
        <li>Buka <a href="https://sheets.new" target="_blank" rel="noopener">sheets.new</a> untuk buat Google Sheet baru (cth "TanyaJer statistik")</li>
        <li>Menu <b>Extensions → Apps Script</b>, padam kod sedia ada, kemudian tampal kod di bawah (kunci anda sudah dimasukkan)</li>
        <li>Tekan <b>Deploy → New deployment</b> → jenis <b>Web app</b></li>
        <li><b>Execute as:</b> Me · <b>Who has access:</b> <i>Anyone</i> → <b>Deploy</b> (benarkan akses jika diminta)</li>
        <li>Salin <b>Web app URL</b> (berakhir dengan <code>/exec</code>) dan tampal di atas, kemudian tekan <b>Simpan & terbit</b></li>
      </ol>
      <p class="hint"><b>Sudah ada skrip lama?</b> Tampal kod baru, kemudian <b>Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy</b>. Link tidak berubah.</p>
      <pre id="s-code">Memuatkan kod…</pre>
      <button class="btn sm" type="button" id="s-copy">📋 Salin kod</button>
    </details>
    <div class="savebar"><span id="e-status"></span><button class="btn primary" type="button" id="e-save">💾 Simpan & terbit</button></div>`;
  show('editor');
  let code = '';
  const loadCode = async () => {
    try { code = await scriptCode($('#s-key').value.trim() || statsKey()); $('#s-code').textContent = code; }
    catch (e) { $('#s-code').textContent = e.message; }
  };
  loadCode();
  $('#s-key').addEventListener('change', () => { const k = $('#s-key').value.trim(); if (k.length >= 8) { store.set('tanya.statsKey', k); loadCode(); } });
  $('#e-back').addEventListener('click', closeEditor);
  $('#s-copy').addEventListener('click', async (ev) => {
    try { await navigator.clipboard.writeText(code); ev.target.textContent = '✓ Disalin'; } catch { ev.target.textContent = 'Pilih & salin kod di atas'; }
  });
  $('#e-save').addEventListener('click', saveSite);
}
async function saveSite() {
  if (S.busy) return;
  const btn = $('#e-save'), stat = $('#e-status');
  const v = (id) => $(id).value.trim();
  const fail = (m) => { stat.textContent = '⚠️ ' + m; stat.style.color = 'var(--danger)'; };
  const site = { title: v('#s-title') || 'TanyaJer', heading: v('#s-heading'), tagline: v('#s-tagline'),
    contactUrl: v('#s-contact'), contactLabel: v('#s-contact-label'), feedbackUrl: v('#s-feedback'),
    announce: v('#s-announce'), announceUrl: v('#s-announce-url'), announceUntil: v('#s-announce-until') };
  for (const k of ['contactUrl', 'feedbackUrl', 'announceUrl']) {
    if (site[k] && !/^https?:\/\/\S+$/i.test(site[k])) return fail('Link mesti bermula dengan https://');
  }
  if (site.feedbackUrl && !/\/exec(\?|$)/.test(site.feedbackUrl)) return fail('Link Apps Script sepatutnya berakhir dengan /exec');
  const key = v('#s-key'); if (key && key.length < 8) return fail('Kunci statistik terlalu pendek (sekurang-kurangnya 8 aksara).');
  if (key) store.set('tanya.statsKey', key);
  S.busy = true; btn.disabled = true; stat.style.color = ''; stat.textContent = 'Menyimpan…';
  try {
    const sha = await saveConfig((cfg) => {
      const next = { ...cfg.site };
      for (const [k, val] of Object.entries(site)) { if (val) next[k] = val; else delete next[k]; }
      cfg.site = next;
    }, 'Kemas kini tetapan laman');
    closeEditor(); watchBuild(sha);
  } catch (e) { fail(errMsg(e)); }
  finally { S.busy = false; if (btn.isConnected) btn.disabled = false; }
}

/* ---------------- 📊 Statistik ---------------- */
async function openStats() {
  S.editor = { mode: 'stats' };
  const url = S.config.site?.feedbackUrl;
  $('#editor').innerHTML = `
    <div class="row" style="margin-bottom:10px"><button class="btn sm ghost" type="button" id="e-back">← Kembali</button>
      <span class="spacer" style="flex:1"></span><button class="btn sm" type="button" id="st-reload" ${url ? '' : 'hidden'}>↻ Muat semula</button></div>
    <h2>📊 Statistik</h2>
    <div id="st-body"><div class="status">Memuatkan statistik…</div></div>`;
  show('editor');
  $('#e-back').addEventListener('click', closeEditor);
  $('#st-reload').addEventListener('click', openStats);
  const body = $('#st-body');
  if (!url) {
    body.innerHTML = `<div class="empty">Statistik perlukan Google Sheet.<div style="margin-top:12px"><button class="btn primary" type="button" id="st-setup">⚙️ Sambung Google Sheet</button></div></div>`;
    $('#st-setup').addEventListener('click', openSite);
    return;
  }
  let d;
  try {
    const r = await fetch(`${url}?action=stats&key=${encodeURIComponent(statsKey())}&t=${Date.now()}`, { cache: 'no-store' });
    d = await r.json();
  } catch {
    body.innerHTML = '<div class="status err">Tidak dapat mencapai Google Sheet. Pastikan Apps Script sudah di-deploy dengan akses <b>Anyone</b>, dan guna kod versi terkini (⚙️ Tetapan laman).</div>';
    return;
  }
  if (S.editor?.mode !== 'stats') return;
  if (!d || !d.ok) {
    body.innerHTML = `<div class="status err">Kunci statistik tidak sepadan dengan kod Apps Script. Buka ⚙️ Tetapan laman dan pastikan kunci sama dengan baris <code>ADMIN_KEY</code> dalam Apps Script.</div>`;
    return;
  }
  const v = d.visits || {}, q = d.questions || {};
  const pct = q.d30 ? Math.round((q.answered / q.d30) * 100) : 0;
  const list = (rows, fmt, empty) => rows && rows.length ? `<ol class="st-list">${rows.map(fmt).join('')}</ol>` : `<p class="muted" style="font-size:13px">${empty}</p>`;
  const perApp = Object.entries(v.perApp || {}).sort((a, b) => b[1] - a[1]);
  body.innerHTML = `
    <div class="st-cards">
      <div class="st-card"><b>${v.d7 || 0}</b><span>Lawatan 7 hari</span></div>
      <div class="st-card"><b>${v.d30 || 0}</b><span>Lawatan 30 hari</span></div>
      <div class="st-card"><b>${q.d30 || 0}</b><span>Soalan 30 hari</span></div>
      <div class="st-card"><b>${q.d30 ? pct + '%' : '–'}</b><span>Soalan dijawab</span></div>
    </div>
    <h3>❓ Soalan tak terjawab (30 hari)</h3>
    <p class="hint" style="margin:-4px 0 6px">Idea untuk FAQ atau video seterusnya.</p>
    ${list(q.unanswered, (x) => `<li><span>${esc(x.q)}</span><small>${esc(x.app)} · ${x.n}×</small></li>`, 'Tiada — semua soalan berjaya dijawab 🎉')}
    <h3>🔥 Soalan paling kerap (30 hari)</h3>
    ${list(q.top, (x) => `<li><span>${esc(x.q)}</span><small>${esc(x.app)} · ${x.n}×</small></li>`, 'Belum ada soalan direkod.')}
    <h3>👎 Jawapan yang perlu dibaiki</h3>
    ${list((d.feedback || []).filter((x) => x.down > 0), (x) => `<li><span>${esc(x.q)}</span><small>${esc(x.app)} · 👍 ${x.up} · 👎 ${x.down}</small></li>`, 'Belum ada undian 👎.')}
    <h3>📱 Lawatan ikut app (30 hari)</h3>
    ${list(perApp, ([name, n]) => `<li><span>${esc(name)}</span><small>${n}</small></li>`, 'Belum ada lawatan direkod.')}
    ${d.sheetUrl ? `<p style="margin-top:16px"><a class="btn" href="${esc(d.sheetUrl)}" target="_blank" rel="noopener" style="text-decoration:none">📄 Buka Google Sheet</a></p>` : ''}
    <p class="hint">Jumlah lawatan sejak mula: ${v.all || 0}. Lawatan dikira sekali bagi setiap sesi untuk setiap halaman.</p>`;
}

function uniqCats() { return [...new Set(Object.values(S.config.apps).map((a) => a?.category).filter(Boolean))].sort(); }

/* ---------------- Kod QR ---------------- */
async function openQr(id) {
  const app = allApps().find((a) => a.id === id); if (!app) return;
  const url = new URL(`./#${id}`, location.href).href;
  S.editor = { mode: 'qr' };
  $('#editor').innerHTML = `
    <div class="row" style="margin-bottom:10px"><button class="btn sm ghost" type="button" id="e-back">← Kembali</button></div>
    <h2>🔳 Kod QR · ${esc(app.name)}</h2>
    <p class="muted" style="font-size:14px;margin:6px 0 14px">Letak dalam video, thumbnail atau poster. Penonton imbas dan terus masuk ke soal jawab ${esc(app.name)}.</p>
    <div class="qr-box"><canvas id="qr" width="900" height="1040"></canvas>
      <div class="files" style="margin-top:8px">${esc(url)}</div>
      <div class="row" style="justify-content:center;margin-top:12px">
        <a class="btn primary" id="qr-dl" download="qr-${esc(id)}.png" href="#" style="text-decoration:none">⬇️ Muat turun PNG</a>
        <button class="btn" type="button" id="qr-copy">🔗 Salin link</button>
      </div></div>`;
  show('editor');
  $('#e-back').addEventListener('click', closeEditor);
  $('#qr-copy').addEventListener('click', async (ev) => { try { await navigator.clipboard.writeText(url); ev.target.textContent = '✓ Disalin'; } catch { ev.target.textContent = 'Salin dari teks di atas'; } });
  try {
    await loadScript('vendor/qrcode.js');
    const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
    const cv = $('#qr'), ctx = cv.getContext('2d');
    const n = qr.getModuleCount(), quiet = 4, size = 820, cell = Math.floor(size / (n + quiet * 2)), qrPx = cell * (n + quiet * 2), x0 = (cv.width - qrPx) / 2, y0 = 30;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#111827';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(x0 + (c + quiet) * cell, y0 + (r + quiet) * cell, cell, cell);
    ctx.textAlign = 'center'; ctx.fillStyle = '#111827';
    ctx.font = '700 46px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(`${app.emoji} ${app.name}`.slice(0, 34), cv.width / 2, y0 + qrPx + 62);
    ctx.fillStyle = '#4f46e5'; ctx.font = '600 32px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(`Imbas untuk tanya · ${S.config.site?.title || 'TanyaJer'}`, cv.width / 2, y0 + qrPx + 112);
    $('#qr-dl').href = cv.toDataURL('image/png');
  } catch (e) {
    $('.qr-box').insertAdjacentHTML('afterbegin', `<div class="status err">Kod QR tidak dapat dijana: ${esc(e.message)}</div>`);
  }
}

/* ---------------- Padam & salin link ---------------- */
const delTimers = {};
async function deleteApp(id, btn) {
  if (S.busy) return;
  if (!btn.classList.contains('confirm')) {
    btn.classList.add('confirm'); btn.textContent = 'Sahkan padam?';
    delTimers[id] = setTimeout(() => { btn.classList.remove('confirm'); btn.textContent = 'Padam'; }, 4000);
    return;
  }
  clearTimeout(delTimers[id]);
  S.busy = true; btn.disabled = true; btn.textContent = 'Memadam…';
  try {
    let lastSha = null;
    for (const f of S.files.filter((x) => x.id === id)) lastSha = await delFile(f, `Padam FAQ: ${f.name}`);
    if (Object.keys(S.config.apps).some((k) => slugify(k) === id)) {
      lastSha = await saveConfig((cfg) => { for (const k of Object.keys(cfg.apps)) if (slugify(k) === id) delete cfg.apps[k]; }, `Padam app: ${id}`);
    }
    await loadAll(); renderList(); watchBuild(lastSha);
  } catch (e) {
    banner('⚠️ ' + esc(errMsg(e)), 'err');
    btn.disabled = false; btn.classList.remove('confirm'); btn.textContent = 'Padam';
  } finally { S.busy = false; }
}
async function copyLink(id, btn) {
  const url = new URL(`./#${id}`, location.href).href;
  try { await navigator.clipboard.writeText(url); btn.textContent = '✓ Disalin'; }
  catch { banner(`Link: <b>${esc(url)}</b>`, ''); }
  setTimeout(() => { btn.textContent = '🔗 Link'; }, 2000);
}

/* ---------------- Token ---------------- */
async function connect() {
  const token = $('#t-token').value.trim() || S.token;
  const repo = $('#t-repo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$|\/$/g, '');
  if (!token) return setStatus('#t-status', 'Tampal token GitHub dahulu.', 'warn');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return setStatus('#t-status', 'Isi repo dalam bentuk pemilik/nama-repo.', 'warn');
  const btn = $('#t-save'); btn.disabled = true;
  setStatus('#t-status', 'Menyemak token…');
  const prev = { token: S.token, owner: S.owner, repo: S.repo };
  [S.owner, S.repo] = repo.split('/'); S.token = token;
  try {
    await loadAll();
    store.set('tanya.token', token); store.set('tanya.repo', repo);
    renderList(); show('main');
  } catch (e) {
    Object.assign(S, prev);
    setStatus('#t-status', '⚠️ ' + errMsg(e), 'err');
  } finally { btn.disabled = false; }
}

/* ---------------- Peristiwa ---------------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (t.id === 'btn-new') return openEditor('new');
  if (t.id === 'btn-token') return showToken(true);
  if (t.id === 'btn-site') return openSite();
  if (t.id === 'btn-stats') return openStats();
  if (d.qr) return openQr(d.qr);
  if (t.id === 'btn-reload') { t.disabled = true; return loadAll().then(renderList).catch((er) => banner('⚠️ ' + esc(errMsg(er)), 'err')).finally(() => { t.disabled = false; }); }
  if (t.id === 't-save') return connect();
  if (t.id === 't-cancel') return show('main');
  if (t.id === 't-clear') { store.set('tanya.token', ''); S.token = ''; return showToken(false); }
  if (d.upload) return openEditor('upload', d.upload);
  if (d.edit) return openEditor('edit', d.edit);
  if (d.copy) return copyLink(d.copy, t);
  if (d.del) return deleteApp(d.del, t);
});
$('#t-token').addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });

/* ---------------- Mula ---------------- */
(async () => {
  Object.assign(S, detectRepo());
  S.token = store.get('tanya.token');
  if (!S.token || !S.owner) { showToken(false); return; }
  show('loading');
  try { await loadAll(); renderList(); show('main'); }
  catch (e) { showToken(false); setStatus('#t-status', '⚠️ ' + errMsg(e), 'err'); }
})();
