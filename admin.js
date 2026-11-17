// TanyaApp — halaman admin.
// Menyimpan app & fail FAQ terus ke repo GitHub melalui GitHub API (guna token pemilik),
// kemudian GitHub Actions membina dan menerbitkan semula laman secara automatik.
import { esc, parseCSV, rowsToFaq, parseJSONFaq, parseText, slugify } from './src/faq-core.js';

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
      <div class="inf"><b>${esc(a.name)}</b><div class="muted" style="font-size:13px">${info}</div>
        <div class="files">${a.files.map((f) => '📄 ' + esc(f.name)).join(' · ')}</div></div>
      <div class="row">
        <button class="btn sm" type="button" data-upload="${esc(a.id)}">⬆️ Upload FAQ</button>
        <button class="btn sm" type="button" data-edit="${esc(a.id)}">✏️ Edit</button>
        <button class="btn sm" type="button" data-copy="${esc(a.id)}">🔗 Link</button>
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
  let out = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const c = await (await pdf.getPage(p)).getTextContent(); let lastY = null;
    for (const it of c.items) {
      const y = it.transform ? it.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) out += '\n';
      out += it.str; if (it.hasEOL) { out += '\n'; lastY = null; } else lastY = y;
    }
    out += '\n\n';
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
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
    <label class="f">Penerangan ringkas (pilihan)<input id="e-desc" value="${esc(app?.description || '')}" placeholder="cth: Tutorial design poster & thumbnail" maxlength="140"></label>`;
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
      status('Menyimpan maklumat app…');
      lastSha = await saveConfig((cfg) => {
        const prev = cfg.apps[id] || {};
        const order = Number.isFinite(prev.order) ? prev.order
          : Math.max(0, ...Object.values(cfg.apps).map((a) => Number(a?.order) || 0)) + 1;
        cfg.apps[id] = { ...prev, name, emoji, description, order };
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
