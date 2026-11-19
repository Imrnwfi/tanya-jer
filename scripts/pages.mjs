// Halaman tambahan yang dijana semasa build:
//  - faq/<id>.html          halaman FAQ statik setiap app (SEO)
//  - faq/<id>/<soalan>.html halaman setiap soalan (link kongsi + gambar pratonton sendiri)
//  - sitemap.xml & robots.txt
//  - sw.js           service worker supaya laman boleh dibuka tanpa internet
import fs from 'node:fs/promises';
import path from 'node:path';
import { esc, md, linkTimes, buildIndex, searchFaq } from '../src/faq-core.js';

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">';
const plain = (t) => String(t).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\s+/g, ' ').trim();
const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t);
export const fmtDate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'][m - 1]} ${y}`;
};

// Skrip kecil untuk halaman statik: badge 🆕 (14 hari) dan kiraan tarikh tutup, dikira ikut tarikh hari ini
const LIVE_JS = `function tjDays(iso){var p=iso.split('-'),d=new Date(+p[0],p[1]-1,+p[2]),t=new Date();t.setHours(0,0,0,0);return Math.round((d-t)/864e5);}
document.querySelectorAll('[data-n]').forEach(function(e){var n=-tjDays(e.getAttribute('data-n'));if(n>=0&&n<=14){var b=document.createElement('span');b.className='new-badge';b.textContent='🆕 Baru';e.appendChild(b);}});
document.querySelectorAll('[data-deadline]').forEach(function(e){var n=tjDays(e.getAttribute('data-deadline')),l=e.getAttribute('data-label');
e.textContent=n>0?'⏳ '+l+': '+n+' hari lagi':n===0?'⏳ '+l+': hari ini!':n>=-7?'✓ '+l+': sudah tamat':'';e.hidden=n<-7;if(n>=0&&n<=7)e.classList.add('soon');});`;
const allNew = (app, today) => app.faqs.length && app.faqs.every((f) => daysBetween(f.n, today) <= 14);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const head = ({ title, desc, url, image, depth }) => {
  const up = '../'.repeat(depth);
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${url ? `<link rel="canonical" href="${esc(url)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(title.split(' | ').pop())}">
<meta property="og:title" content="${esc(title.split(' | ')[0])}">
<meta property="og:description" content="${esc(desc)}">
${url ? `<meta property="og:url" content="${esc(url)}">` : ''}
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#4f46e5">
<link rel="icon" href="${up}icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${up}apple-touch-icon.png">
<link rel="manifest" href="${up}manifest.webmanifest">
${FONTS}
<link rel="stylesheet" href="${up}style.css">`;
};
const topbar = (site, up) => `<header class="top"><div class="wrap">
  <a class="brand" href="${up}" style="text-decoration:none;color:inherit"><img class="logo-img" src="${up}icon.svg" alt="" width="30" height="30">${esc(site.title)}</a>
</div></header>`;
const deadlineTag = (app) => app.deadline
  ? `<p class="deadline" data-deadline="${esc(app.deadline)}" data-label="${esc(app.deadlineLabel || 'Tarikh tutup')}">⏳ ${esc(app.deadlineLabel || 'Tarikh tutup')}: ${esc(fmtDate(app.deadline))}</p>` : '';
const appButtons = (app, up) => `
      <a class="btn primary" href="${up}#${esc(app.id)}" style="text-decoration:none">💬 Tanya soalan</a>
      ${app.video ? `<a class="btn" href="${esc(app.video)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">▶️ Tonton tutorial</a>` : ''}
      ${app.official ? `<a class="btn" href="${esc(app.official)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">🔗 ${esc(app.officialLabel || 'Laman rasmi')}</a>` : ''}`;

function faqPage(app, site, siteUrl, today) {
  const url = siteUrl ? `${siteUrl}faq/${app.id}.html` : '';
  const title = `${app.name}: Soalan Lazim (FAQ) | ${site.title}`;
  const desc = clip(`${app.faqs.length} soalan lazim tentang ${app.name}${app.description ? ` — ${app.description}` : ''}. ${app.faqs.slice(0, 3).map((f) => plain(f.q)).join(' ')}`, 160);
  const ld = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: app.faqs.map((f) => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })),
  };
  const meta = [app.source ? `Sumber: ${esc(app.source)}` : '', app.updated ? `Dikemas kini ${esc(fmtDate(app.updated))}` : ''].filter(Boolean).join(' · ');
  const markNew = !allNew(app, today);
  const items = app.faqs.map((f) => `
    <details class="faq" id="${esc(f.k)}">
      <summary><h2${markNew && f.n ? ` data-n="${esc(f.n)}"` : ''}>${esc(f.q)}</h2></summary>
      <div class="ans">${linkTimes(md(f.a), app.video)}<p class="q-link"><a href="${esc(app.id)}/${esc(f.k)}.html">🔗 Halaman soalan ini</a></p></div>
    </details>`).join('');
  return `<!DOCTYPE html>
<html lang="ms">
<head>
${head({ title, desc, url, image: `${siteUrl || '../'}og/${app.id}.png`, depth: 1 })}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
${topbar(site, '../')}
<main class="wrap faq-page">
  <div class="hero">
    <div class="emo-lg">${esc(app.emoji)}</div>
    <h1>${esc(app.name)}: Soalan Lazim</h1>
    ${app.description ? `<p>${esc(app.description)}</p>` : ''}
    ${meta ? `<p class="meta">${meta}</p>` : ''}
    ${deadlineTag(app)}
    <div class="row" style="margin-top:14px">${appButtons(app, '../')}</div>
  </div>
  ${items}
  <footer class="foot"><a href="../">← Semua aplikasi di ${esc(site.title)}</a></footer>
</main>
<script>
  // Buka soalan yang dikongsi (…/faq/app.html#q-soalan)
  function openHash(){ var id=decodeURIComponent(location.hash.slice(1)); var d=id&&document.getElementById(id); if(d&&d.tagName==='DETAILS'){ d.open=true; d.scrollIntoView({block:'start'}); } }
  openHash(); addEventListener('hashchange', openHash);
  ${LIVE_JS}
  if('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(function(){});
</script>
</body>
</html>
`;
}

// Halaman untuk satu soalan — link kongsi & gambar pratonton sendiri
function questionPage(app, f, related, site, siteUrl) {
  const url = siteUrl ? `${siteUrl}faq/${app.id}/${f.k}.html` : '';
  const title = `${plain(f.q)} | ${site.title}`;
  const desc = clip(plain(f.s || f.a), 160);
  const ld = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [{ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } }],
  };
  const summary = f.s && plain(f.s) !== plain(f.a)
    ? `<div class="q-summary"><b>${f.ai ? '✨ Ringkasan' : '📄 Ringkasan'}</b>${linkTimes(md(f.s), app.video)}</div>` : '';
  const meta = [app.source ? `Sumber: ${esc(app.source)}` : '', f.n ? `Dikemas kini ${esc(fmtDate(f.n))}` : ''].filter(Boolean).join(' · ');
  return `<!DOCTYPE html>
<html lang="ms">
<head>
${head({ title, desc, url, image: `${siteUrl || '../../'}og/${app.id}/${f.k}.png`, depth: 2 })}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
${topbar(site, '../../')}
<main class="wrap faq-page q-page">
  <nav class="crumbs"><a href="../../">${esc(site.title)}</a> › <a href="../${esc(app.id)}.html">${esc(app.emoji)} ${esc(app.name)}</a></nav>
  <h1>${esc(f.q)}</h1>
  ${meta ? `<p class="meta">${meta}</p>` : ''}
  ${deadlineTag(app)}
  ${summary}
  <div class="ans q-ans">${linkTimes(md(f.a), app.video)}</div>
  <div class="row" style="margin-top:18px">${appButtons(app, '../../')}</div>
  ${related.length ? `<h2 class="q-rel-h">Soalan berkaitan</h2><ul class="q-rel">${related.map((r) => `<li><a href="${esc(r.k)}.html">${esc(r.q)}</a></li>`).join('')}</ul>` : ''}
  <footer class="foot"><a href="../${esc(app.id)}.html">← Semua soalan ${esc(app.name)}</a></footer>
</main>
<script>
  ${LIVE_JS}
  if('serviceWorker' in navigator) navigator.serviceWorker.register('../../sw.js').catch(function(){});
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
  const today = new Date().toISOString().slice(0, 10);
  await fs.mkdir(path.join(OUT, 'faq'), { recursive: true });
  for (const app of apps) {
    await fs.writeFile(path.join(OUT, 'faq', `${app.id}.html`), faqPage(app, site, siteUrl, today));
    await fs.mkdir(path.join(OUT, 'faq', app.id), { recursive: true });
    const idx = buildIndex(app);
    for (const [i, f] of app.faqs.entries()) {
      const related = searchFaq(idx, f.q).filter((r) => r.i !== i && r.score >= 0.25).slice(0, 4).map((r) => app.faqs[r.i]);
      await fs.writeFile(path.join(OUT, 'faq', app.id, `${f.k}.html`), questionPage(app, f, related, site, siteUrl));
    }
  }

  // Laman utama: pautan ke halaman FAQ + gambar pratonton
  const idxFile = path.join(OUT, 'index.html');
  const links = apps.length
    ? `<nav class="seo-links" aria-label="Halaman FAQ">📚 Halaman FAQ: ${apps.map((a) => `<a href="faq/${esc(a.id)}.html">${esc(a.name)}</a>`).join(' · ')}</nav>`
    : '';
  let html = (await fs.readFile(idxFile, 'utf8')).replace('<!--SEO_LINKS-->', links);
  html = html.replace('<meta property="og:image" content="icon-512.png">',
    `<meta property="og:image" content="${esc(siteUrl || '')}og/home.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image">${siteUrl ? `\n<meta property="og:url" content="${esc(siteUrl)}">\n<link rel="canonical" href="${esc(siteUrl)}">` : ''}`);
  await fs.writeFile(idxFile, html);

  if (siteUrl) {
    const urls = [{ loc: siteUrl, lastmod: today }];
    for (const a of apps) {
      urls.push({ loc: `${siteUrl}faq/${a.id}.html`, lastmod: (a.updated || today).slice(0, 10) });
      for (const f of a.faqs) urls.push({ loc: `${siteUrl}faq/${a.id}/${f.k}.html`, lastmod: (f.n || today).slice(0, 10) });
    }
    await fs.writeFile(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`);
    await fs.writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: ${new URL('admin.html', siteUrl).pathname}\nSitemap: ${siteUrl}sitemap.xml\n`);
  }
  await fs.writeFile(path.join(OUT, 'sw.js'), serviceWorker(Date.now().toString(36), apps.map((a) => `faq/${a.id}.html`)));
}
