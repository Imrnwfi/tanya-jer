// TanyaJer — Google Apps Script
// Simpan 👍/👎, soalan penonton dan bilangan lawatan dalam Google Sheet ini,
// dan beri statistik kepada halaman admin TanyaJer.
//
// Kunci rahsia: mesti sama dengan "Kunci statistik" di halaman admin → ⚙️ Tetapan laman.
var ADMIN_KEY = '__KUNCI__';
var TZ = 'Asia/Kuala_Lumpur';

function doPost(e) {
  var d = {};
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return text_('bad'); }
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return text_('busy'); }
  try {
    if (d.type === 'feedback') {
      sheet_('Maklum balas', ['Masa', 'App', 'Soalan penonton', 'Soalan FAQ', 'Undian'])
        .appendRow([new Date(), cut_(d.app, 100), cut_(d.question, 300), cut_(d.faq, 300), d.vote === 'up' ? '👍' : '👎']);
    } else if (d.type === 'question') {
      sheet_('Soalan', ['Masa', 'App', 'Soalan penonton', 'Soalan FAQ dipadankan', 'Status'])
        .appendRow([new Date(), cut_(d.app, 100), cut_(d.question, 300), cut_(d.faq, 300), cut_(d.status, 20)]);
    } else if (d.type === 'visit') {
      var sh = sheet_('Lawatan', ['Tarikh', 'App', 'Bilangan']);
      var day = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
      var app = cut_(d.app || 'Laman utama', 100);
      var last = sh.getLastRow();
      if (last >= 2) {
        var start = Math.max(2, last - 300);
        var rows = sh.getRange(start, 1, last - start + 1, 3).getValues();
        for (var i = rows.length - 1; i >= 0; i--) {
          var rd = day_(rows[i][0]);
          if (rd < day) break;
          if (rd === day && String(rows[i][1]) === app) {
            sh.getRange(start + i, 3).setValue((Number(rows[i][2]) || 0) + 1);
            return text_('ok');
          }
        }
      }
      sh.appendRow([day, app, 1]);
    }
  } finally {
    lock.releaseLock();
  }
  return text_('ok');
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!ADMIN_KEY || ADMIN_KEY.indexOf('__') === 0 || p.key !== ADMIN_KEY) return json_({ ok: false, error: 'kunci' });
  var now = new Date(), d7 = ago_(now, 7), d30 = ago_(now, 30);

  var visits = { d7: 0, d30: 0, all: 0, perApp: {} };
  rows_('Lawatan', 3, 20000).forEach(function (r) {
    var day = day_(r[0]), n = Number(r[2]) || 0;
    visits.all += n;
    if (day >= d30) { visits.d30 += n; visits.perApp[String(r[1])] = (visits.perApp[String(r[1])] || 0) + n; }
    if (day >= d7) visits.d7 += n;
  });

  var q = { d7: 0, d30: 0, answered: 0, top: {}, unanswered: {} };
  rows_('Soalan', 5, 10000).forEach(function (r) {
    var day = day_(r[0]);
    if (day < d30) return;
    q.d30++;
    if (day >= d7) q.d7++;
    var key = String(r[1]) + '|' + String(r[2]).toLowerCase().replace(/\s+/g, ' ').trim();
    bump_(q.top, key);
    if (r[4] === 'jawab' || r[4] === 'cadangan') q.answered++; else bump_(q.unanswered, key);
  });

  var fb = {};
  rows_('Maklum balas', 5, 10000).forEach(function (r) {
    var key = String(r[1]) + '|' + String(r[3]);
    fb[key] = fb[key] || { up: 0, down: 0 };
    if (r[4] === '👍') fb[key].up++; else fb[key].down++;
  });
  var feedback = Object.keys(fb).map(function (k) {
    var i = k.indexOf('|');
    return { app: k.slice(0, i), q: k.slice(i + 1), up: fb[k].up, down: fb[k].down };
  }).sort(function (a, b) { return (b.down - a.down) || (a.up - b.up); }).slice(0, 10);

  return json_({
    ok: true,
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    visits: visits,
    questions: { d7: q.d7, d30: q.d30, answered: q.answered, top: top_(q.top, 10), unanswered: top_(q.unanswered, 10) },
    feedback: feedback
  });
}

/* ---- pembantu ---- */
function sheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) { sh.appendRow(header); sh.setFrozenRows(1); }
  return sh;
}
function rows_(name, cols, max) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var last = sh.getLastRow(), start = Math.max(2, last - max + 1);
  return sh.getRange(start, 1, last - start + 1, cols).getValues();
}
function cut_(v, n) {
  var s = String(v == null ? '' : v).slice(0, n);
  return /^[=+\-@]/.test(s) ? "'" + s : s;   // elak teks dibaca sebagai formula
}
function day_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v).slice(0, 10); }
function ago_(now, n) { return Utilities.formatDate(new Date(now.getTime() - (n - 1) * 864e5), TZ, 'yyyy-MM-dd'); }
function bump_(o, k) { o[k] = (o[k] || 0) + 1; }
function top_(o, n) {
  return Object.keys(o).map(function (k) { var i = k.indexOf('|'); return { app: k.slice(0, i), q: k.slice(i + 1), n: o[k] }; })
    .sort(function (a, b) { return b.n - a.n; }).slice(0, n);
}
function text_(s) { return ContentService.createTextOutput(s); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
