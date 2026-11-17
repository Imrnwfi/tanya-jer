// Bina laman TanyaApp: baca semua fail dalam folder faqs/, tukar jadi data/apps.json,
// dan salin fail laman ke folder _site/ untuk diterbitkan ke GitHub Pages.
//
//   npm run build        -> bina _site/
//   npm run dev          -> bina, kemudian buka http://localhost:8080
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV, rowsToFaq, parseJSONFaq, parseText, slugify } from '../src/faq-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAQ_DIR = path.join(ROOT, 'faqs');
const OUT = path.join(ROOT, '_site');
const SUPPORTED = ['.csv', '.tsv', '.json', '.txt', '.md', '.markdown', '.docx', '.pdf'];

const warn = (msg) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `⚠️  ${msg}`);

async function readJSON(file, fallback) {
  try { return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^﻿/, '')); }
  catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error(`${path.basename(file)} bukan JSON yang sah: ${e.message}`);
  }
}

async function extractDocx(file) {
  const mammoth = (await import('mammoth')).default;
  const r = await mammoth.extractRawText({ path: file });
  return r.value || '';
}

async function extractPdf(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await fs.readFile(file));
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
  let out = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const c = await (await pdf.getPage(p)).getTextContent();
    let lastY = null;
    for (const it of c.items) {
      const y = it.transform ? it.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) out += '\n';
      out += it.str;
      if (it.hasEOL) { out += '\n'; lastY = null; } else lastY = y;
    }
    out += '\n\n';
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

async function parseFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.csv' || ext === '.tsv') return rowsToFaq(parseCSV(await fs.readFile(file, 'utf8')));
  if (ext === '.json') return parseJSONFaq(await fs.readFile(file, 'utf8'));
  if (ext === '.docx') return parseText(await extractDocx(file));
  if (ext === '.pdf') return parseText(await extractPdf(file));
  return parseText(await fs.readFile(file, 'utf8'));
}

function titleCase(s) {
  return s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

async function main() {
  const config = await readJSON(path.join(ROOT, 'config.json'), {});
  const site = config.site || {};
  const meta = config.apps || {};

  let entries = [];
  try { entries = await fs.readdir(FAQ_DIR); } catch { warn('Folder faqs/ tidak dijumpai.'); }

  const apps = new Map();
  for (const name of entries.sort()) {
    if (name.startsWith('.') || name.startsWith('_') || /^readme/i.test(name)) continue;
    const ext = path.extname(name).toLowerCase();
    if (!SUPPORTED.includes(ext)) { warn(`faqs/${name} dilangkau — format ${ext || '(tiada)'} tidak disokong.`); continue; }
    const base = path.basename(name, path.extname(name));
    const id = slugify(base);
    let pairs = [];
    try { pairs = await parseFile(path.join(FAQ_DIR, name)); }
    catch (e) { warn(`faqs/${name} gagal dibaca: ${e.message}`); continue; }
    if (!pairs.length) { warn(`faqs/${name}: tiada soalan dijumpai. Semak format (lihat README).`); continue; }

    const m = meta[id] || meta[base] || {};
    const app = apps.get(id) || {
      id,
      name: String(m.name || titleCase(base)),
      emoji: String(m.emoji || '📱'),
      description: String(m.description || ''),
      order: Number.isFinite(m.order) ? m.order : 1000,
      faqs: [],
    };
    const seen = new Set(app.faqs.map((f) => f.q.toLowerCase()));
    for (const p of pairs) if (!seen.has(p.q.toLowerCase())) { seen.add(p.q.toLowerCase()); app.faqs.push(p); }
    apps.set(id, app);
    console.log(`✓ faqs/${name} → #${id} (${pairs.length} soalan)`);
  }

  for (const id of Object.keys(meta)) {
    if (!apps.has(slugify(id))) warn(`config.json menyebut "${id}" tetapi tiada fail FAQ untuknya dalam faqs/.`);
  }

  const list = [...apps.values()].sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
  const data = {
    site: {
      title: String(site.title || 'TanyaApp'),
      tagline: String(site.tagline || 'Pilih aplikasi, kemudian taip soalan anda. Jawapan diambil terus dari FAQ.'),
      heading: String(site.heading || 'Ada soalan tentang app dalam tutorial?'),
      contactUrl: String(site.contactUrl || ''),
      contactLabel: String(site.contactLabel || 'Tanya terus kepada saya'),
    },
    builtAt: new Date().toISOString(),
    apps: list,
  };

  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(path.join(OUT, 'data'), { recursive: true });
  await fs.mkdir(path.join(OUT, 'src'), { recursive: true });
  await fs.copyFile(path.join(ROOT, 'index.html'), path.join(OUT, 'index.html'));
  await fs.copyFile(path.join(ROOT, 'app.js'), path.join(OUT, 'app.js'));
  await fs.copyFile(path.join(ROOT, 'src', 'faq-core.js'), path.join(OUT, 'src', 'faq-core.js'));
  await fs.writeFile(path.join(OUT, 'data', 'apps.json'), JSON.stringify(data));
  await fs.writeFile(path.join(OUT, '.nojekyll'), '');

  const total = list.reduce((n, a) => n + a.faqs.length, 0);
  console.log(`\nSiap: ${list.length} aplikasi, ${total} soalan → _site/`);
  if (!list.length) warn('Tiada aplikasi dibina. Tambah fail FAQ ke dalam folder faqs/.');
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
