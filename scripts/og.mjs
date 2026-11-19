// Gambar pratonton (Open Graph, 1200×630) untuk WhatsApp, Facebook, Telegram, X dan lain-lain.
//   og/home.png            laman utama
//   og/<app>.png           halaman FAQ setiap app
//   og/<app>/<soalan>.png  halaman setiap soalan
// Emoji dilukis dengan Twemoji (CC-BY 4.0), tulisan dengan Plus Jakarta Sans (OFL).
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 1200, H = 630, PAD = 72;
const FONT_DIR = path.dirname(require.resolve('@expo-google-fonts/plus-jakarta-sans/package.json'));
const EMOJI_DIR = path.dirname(require.resolve('@twemoji/svg/package.json'));

let ready = false;
function setup() {
  if (ready) return;
  GlobalFonts.registerFromPath(path.join(FONT_DIR, '800ExtraBold', 'PlusJakartaSans_800ExtraBold.ttf'), 'Jakarta XB');
  GlobalFonts.registerFromPath(path.join(FONT_DIR, '600SemiBold', 'PlusJakartaSans_600SemiBold.ttf'), 'Jakarta SB');
  ready = true;
}

// Nama fail Twemoji: titik kod dalam hex; buang FE0F jika tiada ZWJ
function emojiFile(emoji) {
  const cps = [...String(emoji || '').trim()].map((c) => c.codePointAt(0).toString(16));
  const list = cps.includes('200d') ? cps : cps.filter((c) => c !== 'fe0f');
  return path.join(EMOJI_DIR, `${list.join('-')}.svg`);
}
const imgCache = new Map();
async function img(file) {
  if (!imgCache.has(file)) imgCache.set(file, fs.readFile(file).then((b) => loadImage(b)).catch(() => null));
  return imgCache.get(file);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// Bungkus teks kepada beberapa baris; potong dengan "…" jika melebihi had
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxW) last = last.replace(/\s*\S+$/, '');
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}
// Saiz tulisan terbesar yang muat
function fit(ctx, text, family, maxW, maxLines, sizes) {
  for (const s of sizes) {
    ctx.font = `${s}px "${family}"`;
    const lines = wrap(ctx, text, maxW, 99);
    if (lines.length <= maxLines) return { size: s, lines };
  }
  const s = sizes[sizes.length - 1];
  ctx.font = `${s}px "${family}"`;
  return { size: s, lines: wrap(ctx, text, maxW, maxLines) };
}

async function card({ site, emoji, kicker, title, foot }) {
  setup();
  const c = createCanvas(W, H), ctx = c.getContext('2d');
  // latar gradien jenama
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#4f46e5'); g.addColorStop(1, '#0d9488');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.08; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(W - 60, 40, 260, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W - 220, H + 40, 200, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // logo + nama laman
  const logo = await img(path.join(ROOT, 'icon.svg'));
  if (logo) ctx.drawImage(logo, PAD, PAD - 8, 56, 56);
  ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle';
  ctx.font = '34px "Jakarta XB"'; ctx.fillText(site, PAD + 72, PAD + 20);

  // ikon app
  let x = PAD;
  const top = 196;
  if (emoji) {
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; roundRect(ctx, PAD, top, 112, 112, 28); ctx.fill();
    const e = await img(emojiFile(emoji));
    if (e) ctx.drawImage(e, PAD + 20, top + 20, 72, 72);
    x = PAD + 140;
  }
  // kicker (nama app / keterangan)
  const maxW = W - x - PAD;
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '30px "Jakarta SB"';
  ctx.fillText(wrap(ctx, kicker, maxW, 1)[0] || '', x, top + 24);
  // tajuk utama
  const { size, lines } = fit(ctx, title, 'Jakarta XB', maxW, 3, [60, 54, 48, 44]);
  ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x, top + 56 + i * size * 1.18));

  // butang bawah
  ctx.font = '28px "Jakarta SB"';
  const label = foot;
  const bw = ctx.measureText(label).width + 56;
  ctx.fillStyle = '#ffffff'; roundRect(ctx, PAD, H - PAD - 64, bw, 64, 32); ctx.fill();
  ctx.fillStyle = '#4f46e5'; ctx.textBaseline = 'middle'; ctx.fillText(label, PAD + 28, H - PAD - 32);
  return c.toBuffer('image/png');
}

export async function writeOgImages(OUT, data) {
  const { site, apps } = data;
  const title = site.title || 'TanyaJer';
  const dir = path.join(OUT, 'og');
  await fs.mkdir(dir, { recursive: true });
  try {
    const appNames = apps.slice(0, 4).map((a) => a.name).join(' · ');
    await fs.writeFile(path.join(dir, 'home.png'), await card({
      site: title, emoji: '', kicker: appNames || 'Soal jawab tutorial',
      title: site.heading || 'Ada soalan tentang app dalam tutorial?', foot: 'Tanya soalan anda  →',
    }));
    let n = 1;
    for (const app of apps) {
      await fs.writeFile(path.join(dir, `${app.id}.png`), await card({
        site: title, emoji: app.emoji, kicker: `${app.faqs.length} soalan lazim`,
        title: `${app.name}: Soalan Lazim`, foot: 'Lihat jawapan  →',
      }));
      await fs.mkdir(path.join(dir, app.id), { recursive: true });
      for (const f of app.faqs) {
        await fs.writeFile(path.join(dir, app.id, `${f.k}.png`), await card({
          site: title, emoji: app.emoji, kicker: app.name, title: f.q, foot: 'Baca jawapan  →',
        }));
        n++;
      }
      n++;
    }
    console.log(`🖼️  ${n} gambar pratonton dijana.`);
  } catch (e) {
    console.log(`⚠️  Gambar pratonton tidak dapat dijana: ${e.message}`);
  }
}
