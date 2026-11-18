// TanyaJer — terima 👍/👎 dari laman dan simpan dalam Google Sheet ini
function doPost(e) {
  var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Maklum balas') || ss.insertSheet('Maklum balas');
  if (sh.getLastRow() === 0) sh.appendRow(['Masa', 'App', 'Soalan penonton', 'Soalan FAQ', 'Undian']);
  var cut = function (v, n) { return String(v || '').slice(0, n); };
  sh.appendRow([new Date(), cut(d.app, 100), cut(d.question, 500), cut(d.faq, 300), d.vote === 'up' ? '👍' : '👎']);
  return ContentService.createTextOutput('ok');
}
