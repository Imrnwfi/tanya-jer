// Halaman tambahan yang dijana semasa build:
//  - faq/<id>.html   halaman FAQ statik untuk Google (SEO) + link kongsi jawapan
//  - sitemap.xml & robots.txt
//  - sw.js           service worker supaya laman boleh dibuka tanpa internet
import fs from 'node:fs/promises';
import path from 'node:path';
import { esc, md, linkTimes } from '../src/faq-core.js';

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">';
const plain = (t) => String(t).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\s+/g, ' ').trim();
const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t);
export const fmtDate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'][m - 1]} ${y}`;
};

function faqPage(app, site, siteUrl) {
  const url = siteUrl ? `${siteUrl}faq/${app.id}.html` : '';
  const title = `${app.name}: Soalan Lazim (FAQ) | ${site.title}`;
  const desc = clip(`${app.faqs.length} soalan lazim tentang ${app.name}${app.description ? ` — ${app.description}` : ''}. ${app.faqs.slice(0, 3).map((f) => plain(f.q)).join(' ')}`, 160);
  const ld = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: app.faqs.map((f) => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })),
  };
  const meta = [app.source ? `Sumber: ${esc(app.source)}` : '', app.updated ? `Dikemas kini ${esc(fmtDate(app.updated))}` : ''].filter(Boolean).join(' · ');
  const items = app.faqs.map((f) => `
    <details class="faq" id="${esc(f.k)}">
      <summary><h2>${esc(f.q)}</h2></summary>
      <div class="ans">${linkTimes(md(f.a), app.video)}</div>
    </details>`).join('');
  return `<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${url ? `<link rel="canonical" href="${esc(url)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${url ? `<meta property="og:url" content="${esc(url)}">` : ''}
${siteUrl ? `<meta property="og:image" content="${esc(siteUrl)}icon-512.png">` : ''}
<meta name="theme-color" content="#4f46e5">
<link rel="icon" href="../icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../apple-touch-icon.png">
<link rel="manifest" href="../manifest.webmanifest">
${FONTS}
<link rel="stylesheet" href="../style.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="../" style="text-decoration:none;color:inherit"><img class="logo-img" src="../icon.svg" alt="" width="30" height="30">${esc(site.title)}</a>
</div></header>
<main class="wrap faq-page">
  <div class="hero">
    <div class="emo-lg">${esc(app.emoji)}</div>
    <h1>${esc(app.name)}: Soalan Lazim</h1>
    ${app.description ? `<p>${esc(app.description)}</p>` : ''}
    ${meta ? `<p class="meta">${meta}</p>` : ''}
    <div class="row" style="margin-top:14px">
      <a class="btn primary" href="../#${esc(app.id)}" style="text-decoration:none">💬 Tanya soalan</a>
      ${app.video ? `<a class="btn" href="${esc(app.video)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">▶️ Tonton tutorial</a>` : ''}
      ${app.official ? `<a class="btn" href="${esc(app.official)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">🔗 ${esc(app.officialLabel || 'Laman rasmi')}</a>` : ''}
    </div>
  </div>
  ${items}
  <footer class="foot"><a href="../">← Semua aplikasi di ${esc(site.title)}</a></footer>
</main>
<script>
  // Buka soalan yang dikongsi (…/faq/app.html#q-soalan)
  function openHash(){ var id=decodeURIComponent(location.hash.slice(1)); var d=id&&document.getElementById(id); if(d&&d.tagName==='DETAILS'){ d.open=true; d.scrollIntoView({block:'start'}); } }
  openHash(); addEventListener('hashchange', openHash);
  if('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(function(){});
</script>
</body>
</html>
`;
}

function serviceWorker(version, extra) {
  return `// Dijana oleh scripts/pages.mjs — jangan edit secara manual.
const CACHE = 'tanyajer-${version}';
const CORE = ${JSON.stringify(['./', 'index.html', 'app.js', 'src/faq-core.js', 'style.css', 'icon.svg', 'icon-192.png', 'manifest.webmanifest', 'data/apps.json', ...extra])};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('tanyajer-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const fresh = req.mode === 'navigate' || url.pathname.endsWith('.json') || url.pathname.endsWith('.html');
  if (fresh) {
    // Rangkaian dahulu (supaya FAQ sentiasa terkini), cache bila offline
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
  } else {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
`;
}

export async function writePages(OUT, data, siteUrl) {
  const { site, apps } = data;
  await fs.mkdir(path.join(OUT, 'faq'), { recursive: true });
  for (const app of apps) await fs.writeFile(path.join(OUT, 'faq', `${app.id}.html`), faqPage(app, site, siteUrl));

  // Pautan ke halaman FAQ di laman utama (untuk Google & penonton)
  const idxFile = path.join(OUT, 'index.html');
  const links = apps.length
    ? `<nav class="seo-links" aria-label="Halaman FAQ">📚 Halaman FAQ: ${apps.map((a) => `<a href="faq/${esc(a.id)}.html">${esc(a.name)}</a>`).join(' · ')}</nav>`
    : '';
  await fs.writeFile(idxFile, (await fs.readFile(idxFile, 'utf8')).replace('<!--SEO_LINKS-->', links));

  if (siteUrl) {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [{ loc: siteUrl, lastmod: today }, ...apps.map((a) => ({ loc: `${siteUrl}faq/${a.id}.html`, lastmod: (a.updated || today).slice(0, 10) }))];
    await fs.writeFile(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`);
    await fs.writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: ${new URL('admin.html', siteUrl).pathname}\nSitemap: ${siteUrl}sitemap.xml\n`);
  }
  await fs.writeFile(path.join(OUT, 'sw.js'), serviceWorker(Date.now().toString(36), apps.map((a) => `faq/${a.id}.html`)));
}
