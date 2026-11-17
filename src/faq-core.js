/* TanyaApp — logik teras (dikongsi oleh browser dan skrip build).
   Mengandungi: penghurai fail FAQ, carian soalan, dan penukar markdown ringkas. */
/* ======================= TEXT HELPERS ======================= */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function norm(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\u0600-\u06ff\u4e00-\u9fff]+/g,' ').trim();}
function uniq(a){return [...new Set(a)];}

const STOP = new Set(('saya aku kami kita awak anda dia nak hendak mahu ingin macam mana bagaimana camne camana cmne cmna cara apa apakah ke di dan yang untuk boleh bole bleh blh ini itu ni tu tak tidak ada adakah la lah kah pun dengan dalam pada atau jika kalau kalo kenapa mengapa bila bilakah perlu je ja sahaja saja sy dah sudah telah akan kat sini situ tolong please pls nya ' +
 'the a an to of in on for is are do does did how can could i my me what why when which where you your it this that with and or be from at as by if there any want need get use using').split(/\s+/));
const SYN = {nk:'nak',mcm:'macam',utk:'untuk',dgn:'dengan',dlm:'dalam',x:'tidak',tk:'tidak',xde:'tiada',takde:'tiada',
  bg:'background',bgr:'background',latar:'background',remove:'buang',removing:'buang',delete:'padam',hapus:'padam',
  image:'gambar',images:'gambar',photo:'gambar',photos:'gambar',picture:'gambar',pic:'gambar',pics:'gambar',foto:'gambar',gmbr:'gambar',gbr:'gambar',
  vid:'video',videos:'video',song:'lagu',songs:'lagu',music:'lagu',muzik:'lagu',
  subtitle:'caption',subtitles:'caption',sarikata:'caption',captions:'caption',kapsyen:'caption',
  free:'percuma',price:'harga',cost:'harga',phone:'telefon',handphone:'telefon',hp:'telefon',fon:'telefon',
  share:'kongsi',resize:'saiz',size:'saiz',change:'tukar',edit:'edit',export:'export',eksport:'export',
  laptop:'pc',computer:'pc',komputer:'pc',desktop:'pc',login:'log',signin:'log',password:'kata',
  slowmo:'slow',lambat:'slow',blur:'kabur',blurry:'kabur'};

function tokenize(s){
  return norm(s).split(' ').map(w=>SYN[w]||w).filter(w=>w && !STOP.has(w) && (w.length>1||/\d/.test(w)));
}
const _triCache = new Map();
function tri(s){
  const p=' '+s+' '; const set=new Set();
  for(let i=0;i<p.length-2;i++) set.add(p.slice(i,i+3));
  return set;
}
function wtri(w){let t=_triCache.get(w); if(!t){t=tri(w); if(_triCache.size>20000)_triCache.clear(); _triCache.set(w,t);} return t;}
function jacc(A,B){if(!A.size||!B.size)return 0; let n=0; const [s,l]=A.size<B.size?[A,B]:[B,A]; for(const x of s) if(l.has(x)) n++; return n/(A.size+B.size-n);}
function wordSim(a,b){
  if(a===b) return 1;
  const la=a.length, lb=b.length;
  if(la>=4&&lb>=4&&(a.startsWith(b)||b.startsWith(a))) return 0.85;
  if(Math.min(la,lb)>=4&&(a.includes(b)||b.includes(a))) return 0.7;
  if(la>=4&&lb>=4&&a[0]===b[0]&&Math.abs(la-lb)<=2){const j=jacc(wtri(a),wtri(b)); if(j>=0.45) return j*0.8;}
  return 0;
}
function bestSim(t,arr){let b=0; for(const d of arr){const s=wordSim(t,d); if(s>b){b=s; if(b===1)break;}} return b;}

/* ======================= SEARCH ======================= */
function buildIndex(app){
  const faqs = app.faqs||[];
  const items = faqs.map((f,i)=>({i, qn:norm(f.q), qT:uniq(tokenize(f.q)), aT:uniq(tokenize(f.a)).slice(0,250), qTri:tri(norm(f.q))}));
  const df = new Map();
  for(const it of items) for(const t of new Set([...it.qT,...it.aT])) df.set(t,(df.get(t)||0)+1);
  return {items, df, N:items.length, nameT:new Set(tokenize(app.name||''))};
}
function searchFaq(idx, text){
  const qn = norm(text);
  let qt = uniq(tokenize(text));
  const noName = qt.filter(t=>!idx.nameT.has(t));
  if(noName.length) qt = noName;           // abaikan nama app dalam soalan
  const qtri = tri(qn);
  const w = qt.map(t=>Math.log(1+(idx.N+1)/((idx.df.get(t)||0)+0.5)));
  const W = w.reduce((a,b)=>a+b,0);
  return idx.items.map(it=>{
    if(qn && qn===it.qn) return {i:it.i, score:1};
    let cq=0, ca=0;
    if(W>0){ qt.forEach((t,k)=>{ cq+=w[k]*bestSim(t,it.qT); ca+=w[k]*bestSim(t,it.aT); }); cq/=W; ca/=W; }
    const tj = jacc(qtri,it.qTri);
    return {i:it.i, score: W>0 ? 0.6*cq+0.15*ca+0.25*tj : tj};
  }).sort((a,b)=>b.score-a.score);
}

/* ======================= PARSERS ======================= */
function parseCSV(text){
  text = text.replace(/^\uFEFF/,'');
  const first = text.split(/\r?\n/,1)[0]||'';
  let d=',', best=-1;
  for(const c of [',',';','\t']){const n=first.split(c).length; if(n>best){best=n; d=c;}}
  const rows=[]; let row=[], f='', q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){ if(ch==='"'){ if(text[i+1]==='"'){f+='"'; i++;} else q=false; } else f+=ch; }
    else if(ch==='"' && f.trim()===''){ q=true; f=''; }
    else if(ch===d){ row.push(f); f=''; }
    else if(ch==='\n'||ch==='\r'){ if(ch==='\r'&&text[i+1]==='\n') i++; row.push(f); rows.push(row); row=[]; f=''; }
    else f+=ch;
  }
  if(f!==''||row.length){ row.push(f); rows.push(row); }
  return rows.filter(r=>r.some(c=>c.trim()));
}
function rowsToFaq(rows){
  if(!rows.length) return [];
  let qi=0, ai=1, start=0;
  const h = rows[0].map(c=>norm(c));
  const fq = h.findIndex(c=>/^(q|s|soalan|soalan lazim|question|questions|pertanyaan)$/.test(c)||/soalan|question|pertanyaan/.test(c));
  const fa = h.findIndex(c=>/^(a|j|jawapan|answer|answers)$/.test(c)||/jawapan|answer/.test(c));
  if(fq>=0 && fa>=0 && fq!==fa){ qi=fq; ai=fa; start=1; }
  return rows.slice(start).map(r=>({q:(r[qi]||'').trim(), a:(r[ai]||'').trim()})).filter(p=>p.q&&p.a);
}
function pickField(o, keys){ for(const k of Object.keys(o)){ if(keys.includes(k.toLowerCase())) { const v=o[k]; if(v!=null) return String(v); } } return ''; }
function normalizePairs(arr){
  if(!Array.isArray(arr)) return [];
  return arr.map(it=>{
    if(Array.isArray(it)) return {q:String(it[0]??'').trim(), a:String(it[1]??'').trim()};
    if(it && typeof it==='object') return {
      q:pickField(it,['q','question','soalan','pertanyaan','s','title','tajuk']).trim(),
      a:pickField(it,['a','answer','jawapan','j','jawab','body','content','text']).trim()};
    return {q:'',a:''};
  }).filter(p=>p.q&&p.a);
}
function parseJSONFaq(text){
  let d = JSON.parse(text.replace(/^\uFEFF/,''));
  if(!Array.isArray(d) && d && typeof d==='object'){
    d = d.faqs||d.faq||d.FAQ||d.items||d.data||d.questions||
        Object.entries(d).filter(([,v])=>typeof v==='string').map(([k,v])=>({q:k,a:v}));
  }
  return normalizePairs(d);
}
function cleanQ(s){return String(s).replace(/^\s*#+\s*/,'').replace(/^\s*(?:[-*•]|\d+[.)])\s*/,'').replace(/\*\*/g,'').replace(/^["“]|["”]$/g,'').trim();}
function tidy(list){
  return list.map(p=>({q:cleanQ(p.q), a:String(p.a).replace(/^\s+|\s+$/g,'').replace(/\n{3,}/g,'\n\n')})).filter(p=>p.q&&p.a);
}
function parseText(raw){
  const lines = String(raw).replace(/\r\n?/g,'\n').split('\n');
  const qRe=/^\s*(?:[-*•]\s*)?(?:\d+[.)]\s*)?(?:\*\*)?\s*(?:S|Q|Soalan|Question|Pertanyaan)\s*\d*\s*(?:\*\*)?\s*[:：.)\-–]\s*(?:\*\*)?\s*(.*)$/i;
  const aRe=/^\s*(?:[-*•]\s*)?(?:\*\*)?\s*(?:J|A|Jawapan|Answer|Jawab)\s*(?:\*\*)?\s*[:：.)\-–]\s*(?:\*\*)?\s*(.*)$/i;
  // 1) Format berlabel  S: / J:  atau  Q: / A:
  let out=[], cur=null, mode=null, labeled=0;
  for(const line of lines){
    let m;
    if((m=line.match(qRe))){ if(cur) out.push(cur); cur={q:m[1].trim(),a:''}; mode='q'; labeled++; continue; }
    if(cur && !cur.a && (m=line.match(aRe))){ cur.a=m[1].trim(); mode='a'; continue; }
    if(!cur) continue;
    if(mode==='q'){
      if(!line.trim()) continue;
      if(/[?？]\s*$/.test(cur.q)){ mode='a'; cur.a=line.trim(); }
      else cur.q += ' '+line.trim();
    } else cur.a += '\n'+line;
  }
  if(cur) out.push(cur);
  let res = tidy(out);
  if(labeled && res.length) return res;
  // 2) Tajuk markdown  ## Soalan
  if(lines.some(l=>/^\s*#{1,6}\s+\S/.test(l))){
    out=[]; cur=null;
    for(const line of lines){
      const m=line.match(/^\s*#{1,6}\s+(.*)$/);
      if(m){ if(cur) out.push(cur); cur={q:m[1],a:''}; }
      else if(cur) cur.a+='\n'+line;
    }
    if(cur) out.push(cur);
    res = tidy(out);
    if(res.length) return res;
  }
  // 3) Baris berakhir dengan tanda soal
  const isQ = l => { const t=cleanQ(l); return t.length>3 && t.length<300 && /[?？]$/.test(t); };
  out=[]; cur=null;
  for(const line of lines){
    if(isQ(line)){ if(cur) out.push(cur); cur={q:line,a:''}; }
    else if(cur) cur.a+='\n'+line;
  }
  if(cur) out.push(cur);
  res = tidy(out);
  if(res.length) return res;
  // 4) Blok dipisahkan baris kosong: baris pertama = soalan
  const blocks = String(raw).replace(/\r\n?/g,'\n').split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  const two = blocks.filter(b=>b.includes('\n'));
  if(two.length>=2){
    res = tidy(two.map(b=>{const i=b.indexOf('\n'); return {q:b.slice(0,i), a:b.slice(i+1)};}));
    if(res.length) return res;
  }
  return [];
}
const RESERVED = new Set(['admin','settings','sidebar','customize','upgrade','downloads','home']);
function slugify(s){
  let x = String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'');
  if(!x) x='app';
  if(RESERVED.has(x)||x.startsWith('comment-')) x+='-app';
  return x;
}
/* ======================= MINI MARKDOWN ======================= */
function md(src){
  const inline = s => s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,!?:;]|$)/g,'$1<em>$2</em>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  const lines = esc(src).split('\n'); let html='', list=null, lastSp=true;
  const close=()=>{ if(list){ html+=`</${list}>`; list=null; } };
  for(const raw of lines){
    const l=raw.trimEnd(); let m;
    if((m=l.match(/^\s*[-*•]\s+(.*)$/))){ if(list!=='ul'){close(); html+='<ul>'; list='ul';} html+=`<li>${inline(m[1])}</li>`; lastSp=false; }
    else if((m=l.match(/^\s*(\d+)[.)]\s+(.*)$/))){ if(list!=='ol'){close(); html+=`<ol start="${m[1]}">`; list='ol';} html+=`<li>${inline(m[2])}</li>`; lastSp=false; }
    else if(!l.trim()){ close(); if(!lastSp){ html+='<div class="sp"></div>'; lastSp=true; } }
    else if((m=l.match(/^\s*#{1,6}\s+(.*)$/))){ close(); html+=`<p><strong>${inline(m[1])}</strong></p>`; lastSp=false; }
    else { close(); html+=`<p>${inline(l)}</p>`; lastSp=false; }
  }
  close(); return html.replace(/(<div class="sp"><\/div>)+$/,'');
}

export { esc, norm, uniq, tokenize, buildIndex, searchFaq, parseCSV, rowsToFaq, normalizePairs, parseJSONFaq, parseText, md, slugify };
