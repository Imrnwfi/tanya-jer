// Ringkasan jawapan FAQ untuk TanyaJer.
//
// Setiap jawapan diberi:
//   s  — jawapan ringkas (1–2 ayat)
//   p  — poin utama yang boleh difahami sendiri (dipilih ikut soalan penonton)
//   ai — true jika dijana oleh Claude
//
// Jika ANTHROPIC_API_KEY ada (GitHub Secret), Claude meringkaskan setiap jawapan sekali sahaja.
// Hasilnya disimpan dalam .cache/summaries.json, jadi jawapan yang tidak berubah tidak dijana semula.
// Tanpa API key, ringkasan dibuat secara automatik (tanpa AI) dari ayat dan senarai dalam jawapan.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const PROMPT_VERSION = 'v1';
const MODEL = process.env.TANYA_MODEL || 'claude-haiku-5-5';
const SHORT = 240; // jawapan sependek ini tidak perlu diringkaskan

/* ---------------- Tanpa AI ---------------- */
const LIST_START = /^\s*(?:[-*•▪●–]|\(?\d{1,2}[.)]|\(?[a-z][.)]|\(?(?:i{1,3}|iv|vi{0,3}|ix|x)[.)])\s+/i;
function clip(t, max) {
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.7)).replace(/[,;:\s]+$/, '') + '…';
}
export function extractive(a) {
  const text = String(a).replace(/\s+/g, ' ').trim();
  if (text.length <= SHORT) return { s: String(a).trim(), p: [], ai: false };
  const first = String(a).split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
  const sentences = first.split(/(?<=[.!?])\s+(?=[A-Z0-9("“])/);
  let s = '';
  for (const x of sentences) { if (s && (s + ' ' + x).length > SHORT) break; s = s ? `${s} ${x}` : x; }
  s = clip(s || first, SHORT + 40);
  const p = String(a).split('\n').map((l) => l.trim()).filter((l) => l && l.length >= 12)
    .map((l) => l.replace(LIST_START, '').trim()).filter((l, k, arr) => l !== s && arr.indexOf(l) === k).slice(0, 12).map((l) => clip(l, 220));
  return { s, p, ai: false };
}

/* ---------------- Dengan Claude ---------------- */
function prompt(q, a) {
  return `Anda meringkaskan SATU jawapan FAQ untuk penonton video tutorial.

SOALAN FAQ: ${q}

JAWAPAN PENUH:
${a}

Tugas:
1. "ringkas": jawab soalan FAQ di atas secara ringkas dan terus — maksimum 2 ayat (lebih kurang 40 patah perkataan). Jika jawapan penuh ialah senarai panjang, rumuskan intipatinya.
2. "poin": 0 hingga 8 poin utama dari jawapan penuh. Setiap poin mesti lengkap dan boleh difahami sendiri tanpa konteks (sebut subjeknya di awal, contoh "Bujang: …", "Warga emas: …"), maksimum 25 patah perkataan. Biarkan kosong jika jawapan sudah pendek.

Peraturan:
- Guna HANYA maklumat dalam jawapan penuh. Jangan tambah nasihat atau maklumat lain.
- Kekalkan nombor, tarikh, jumlah RM, umur dan nama tepat seperti asal.
- Guna bahasa yang sama dengan jawapan penuh.

Balas HANYA dengan JSON: {"ringkas":"...","poin":["...","..."]}`;
}
async function callClaude(key, q, a) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 900, messages: [{ role: 'user', content: prompt(q, a.slice(0, 12000)) }] }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error?.message || `HTTP ${r.status}`);
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const s = String(json.ringkas || '').trim();
  const p = (Array.isArray(json.poin) ? json.poin : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 10);
  if (!s) throw new Error('ringkasan kosong');
  return { s, p, ai: true };
}

/* ---------------- Utama ---------------- */
export async function summarizeAll(apps, { root, warn }) {
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  const cacheFile = path.join(root, '.cache', 'summaries.json');
  let cache = {};
  try { cache = JSON.parse(await fs.readFile(cacheFile, 'utf8')); } catch { /* tiada cache */ }
  const used = {};
  const jobs = [];
  for (const app of apps) for (const f of app.faqs) {
    if (String(f.a).replace(/\s+/g, ' ').trim().length <= SHORT) { Object.assign(f, { s: f.a, p: [], ai: false }); continue; }
    const h = crypto.createHash('sha256').update(`${PROMPT_VERSION}|${MODEL}|${f.q}|${f.a}`).digest('hex').slice(0, 24);
    if (cache[h]) { Object.assign(f, cache[h]); used[h] = cache[h]; continue; }
    jobs.push({ f, h });
  }
  let made = 0, failed = 0;
  if (jobs.length && !key) {
    console.log(`ℹ️  ${jobs.length} jawapan diringkaskan tanpa AI (tambah ANTHROPIC_API_KEY untuk ringkasan AI).`);
  }
  // 3 permintaan serentak
  const queue = [...jobs];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const { f, h } = queue.shift();
      let r = null;
      if (key) {
        for (let attempt = 0; attempt < 2 && !r; attempt++) {
          try { r = await callClaude(key, f.q, f.a); }
          catch (e) { if (attempt) { failed++; warn(`Ringkasan AI gagal untuk "${f.q.slice(0, 60)}": ${e.message}`); } else await new Promise((s) => setTimeout(s, 2000)); }
        }
      }
      if (r) { made++; used[h] = r; Object.assign(f, r); }
      else Object.assign(f, extractive(f.a));
    }
  }));
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(used));
  const cached = Object.keys(used).length - made;
  if (key) console.log(`✨ Ringkasan AI: ${made} baru, ${cached} dari cache${failed ? `, ${failed} gagal` : ''}.`);
}
