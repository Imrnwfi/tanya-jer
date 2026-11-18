/* TanyaJer — logik teras (dikongsi oleh browser dan skrip build).
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
  slowmo:'slow',lambat:'slow',blur:'kabur',blurry:'kabur',
  apply:'mohon',application:'mohon',register:'daftar',registration:'daftar',signup:'daftar',
  syarat:'layak',eligible:'layak',eligibility:'layak',qualify:'layak',qualified:'layak',
  duit:'bayaran',wang:'bayaran',money:'bayaran',amount:'jumlah',total:'jumlah',pay:'bayar',payment:'bayaran',paid:'bayar',receive:'terima',
  open:'buka',dibuka:'buka',close:'tutup',ditutup:'tutup',date:'tarikh',
  status:'status',semak:'semak',check:'semak',cek:'semak',update:'kemaskini',kemas:'kemaskini',
  ic:'mykad',kp:'mykad',kad:'mykad',akaun:'akaun',account:'akaun'};

// Kata tanya dikekalkan sebagai "niat" soalan (apa / siapa / bila / berapa / mana / kenapa / cara),
// supaya soalan pendek seperti "Apakah STR?" atau "bila buka?" dipadankan dengan soalan FAQ yang betul.
const INTENT = {apa:'q_apa',apakah:'q_apa',what:'q_apa',maksud:'q_apa',maksudnya:'q_apa',
  siapa:'q_siapa',siapakah:'q_siapa',who:'q_siapa',
  bila:'q_bila',bilakah:'q_bila',bilamana:'q_bila',when:'q_bila',tarikh:'q_bila',
  berapa:'q_berapa',berapakah:'q_berapa',much:'q_berapa',many:'q_berapa',
  mana:'q_mana',manakah:'q_mana',dimana:'q_mana',where:'q_mana',
  kenapa:'q_kenapa',mengapa:'q_kenapa',why:'q_kenapa',
  bagaimana:'q_cara',bagaimanakah:'q_cara',camne:'q_cara',camana:'q_cara',cmne:'q_cara',cmna:'q_cara',macamana:'q_cara',how:'q_cara',cara:'q_cara',kaedah:'q_cara'};

function tokenize(s){
  let n = ' '+norm(s)+' ';
  n = n.replace(/ (?:macam|mcm|cam) (?:mana|mne|mn|ne) /g,' bagaimana ').replace(/ apa (?:itu|tu|ni) /g,' apa ');
  return n.trim().split(/\s+/).map(w=>INTENT[w]||SYN[w]||w).filter(w=>w && !STOP.has(w) && (w.length>1||/\d/.test(w)));
}
const _triCache = new Map();
function tri(s){
  const p=' '+s+' '; const set=new Set();
  for(let i=0;i<p.length-2;i++) set.add(p.slice(i,i+3));
  return set;
}
function wtri(w){let t=_triCache.get(w); if(!t){t=tri(w); if(_triCache.size>20000)_triCache.clear(); _triCache.set(w,t);} return t;}
function jacc(A,B){if(!A.size||!B.size)return 0; let n=0; const [s,l]=A.size<B.size?[A,B]:[B,A]; for(const x of s) if(l.has(x)) n++; return n/(A.size+B.size-n);}

// Imbuhan Bahasa Melayu: "permohonan", "memohon" dan "mohon" dianggap perkataan yang sama.
const PRE=['meng','meny','mem','men','me','peng','peny','pem','pen','per','pe','ber','be','ter','te','di','ke','se'];
const SUF=['kannya','annya','nya','kan','lah','kah','an','i'];
const _varCache = new Map();
function variants(w){
  let out=_varCache.get(w); if(out) return out;
  out=new Set([w]);
  if(w.length>=5 && !/\d/.test(w)){
    const bases=[w];
    for(const s of SUF) if(w.endsWith(s) && w.length-s.length>=4){ bases.push(w.slice(0,-s.length)); break; }
    for(const x of bases){
      out.add(x);
      for(const p of PRE) if(x.startsWith(p) && x.length-p.length>=4){
        const y=x.slice(p.length); out.add(y);
        for(const p2 of PRE) if(y.startsWith(p2) && y.length-p2.length>=4) out.add(y.slice(p2.length));
      }
    }
  }
  if(_varCache.size>20000) _varCache.clear();
  _varCache.set(w,out); return out;
}
function wordSim(a,b){
  if(a===b) return 1;
  if(a.startsWith('q_')||b.startsWith('q_')) return 0;
  const la=a.length, lb=b.length;
  if(la>=4&&lb>=4&&(a.startsWith(b)||b.startsWith(a))) return 0.85;
  if(la>=5||lb>=5){ const va=variants(a), vb=variants(b); for(const x of va) if(x.length>=4 && vb.has(x)) return 0.85; }
  if(Math.min(la,lb)>=4&&(a.includes(b)||b.includes(a))) return 0.7;
  if(la>=4&&lb>=4&&a[0]===b[0]&&Math.abs(la-lb)<=2){const j=jacc(wtri(a),wtri(b)); if(j>=0.45) return j*0.8;}  // salah eja
  return 0;
}
function bestSim(t,arr){let b=0; for(const d of arr){const s=wordSim(t,d); if(s>b){b=s; if(b===1)break;}} return b;}

// Singkatan: "Sumbangan Tunai Rahmah (STR)" -> str = sumbangan + tunai + rahmah
const MINOR = new Set(['dan','and','of','the','untuk','bagi','di','ke','dari','daripada','&']);
function findAcronyms(text){
  const map=new Map();
  const re=/([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z&][A-Za-z'-]*){0,9})\s*\(\s*([A-Z][A-Za-z]{1,9})\s*\)|([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z&][A-Za-z'-]*){1,9})\s+([A-Z]{2,10})\b/g;
  let m;
  while((m=re.exec(String(text)))){
    const pre=(m[1]||m[3]), ab=(m[2]||m[4]);
    if(!/^[A-Z]{2,10}$/.test(ab.replace(/[a-z]/g,'')) ) continue;
    const letters=ab.replace(/[^A-Z]/g,'').toLowerCase(); if(letters.length<2) continue;
    const words=pre.trim().split(/\s+/).filter(w=>!MINOR.has(w.toLowerCase()));
    if(words.length<letters.length) continue;
    const last=words.slice(-letters.length);
    if(last.map(w=>w[0].toLowerCase()).join('')!==letters) continue;
    const long=uniq(tokenize(last.join(' '))); if(long.length<2) continue;
    map.set(ab.toLowerCase(), long);
  }
  return map;
}

/* ======================= SEARCH ======================= */
function buildIndex(app){
  const faqs = app.faqs||[];
  const acr = findAcronyms([app.name||'', ...faqs.map(f=>f.q+'\n'+f.a)].join('\n'));
  const expand = toks => {
    const s=new Set(toks);
    for(const t of toks){ const e=acr.get(t); if(e) for(const x of e) s.add(x); }
    for(const [ab,long] of acr) if(long.every(x=>s.has(x))) s.add(ab);
    return [...s];
  };
  const items = faqs.map((f,i)=>{ const qT=uniq(tokenize(f.q)); return {i, qn:norm(f.q), qT, qX:expand(qT), aT:expand(uniq(tokenize(f.a))).slice(0,300), qTri:tri(norm(f.q))}; });
  const df = new Map();
  for(const it of items) for(const t of new Set([...it.qX,...it.aT])) df.set(t,(df.get(t)||0)+1);
  return {items, df, N:items.length, nameT:new Set(expand(tokenize(app.name||''))), expand};
}
function searchFaq(idx, text){
  const qn = norm(text);
  const qt = uniq(tokenize(text));
  const qx = idx.expand(qt);
  const qtri = tri(qn);
  const idf = t => Math.log(1+(idx.N+1)/((idx.df.get(t)||0)+0.5));
  // kata tanya & nama app tetap dikira, tetapi dengan berat yang lebih rendah
  const wt = t => idf(t)*(t.startsWith('q_')?0.6:1)*(idx.nameT.has(t)?0.4:1);
  const w = qt.map(wt); const W = w.reduce((a,b)=>a+b,0);
  return idx.items.map(it=>{
    if(qn && qn===it.qn) return {i:it.i, score:1};
    if(W<=0) return {i:it.i, score:jacc(qtri,it.qTri)};
    let cq=0, ca=0;
    qt.forEach((t,k)=>{ cq+=w[k]*bestSim(t,it.qX); ca+=w[k]*bestSim(t,it.aT); });
    cq/=W; ca/=W;
    cq=Math.max(cq, ca*0.7);   // perkataan yang hanya ada dalam jawapan juga dikira
    // berapa banyak soalan FAQ itu sendiri diliputi oleh soalan pengguna (utamakan padanan yang paling tepat)
    let pn=0, pd=0;
    for(const d of it.qT){ const wd=wt(d); pd+=wd; pn+=wd*bestSim(d,qx); }
    const prec = pd>0 ? pn/pd : 0;
    const tj = jacc(qtri,it.qTri);
    return {i:it.i, score: 0.5*cq + 0.1*ca + 0.2*prec + 0.2*tj};
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
// Sambung semula ayat yang terputus di hujung baris (biasa berlaku dalam fail PDF/Word),
// tetapi kekalkan senarai seperti "a.", "i.", "1." dan "-".
const LIST_START=/^\s*(?:[-*•▪●–]|\(?\d{1,2}[.)]|\(?[a-z][.)]|\(?(?:i{1,3}|iv|vi{0,3}|ix|x)[.)])\s+/i;
const isHeading = l => l.length<=60 && /[A-Z]{3,}/.test(l) && !/[a-z]/.test(l);
function reflow(text){
  const paras=String(text).replace(/\r/g,'').split(/\n[ \t]*\n/).map(p=>p.split('\n').map(l=>l.replace(/[ \t]+/g,' ').trim()).filter(Boolean)).filter(p=>p.length);
  const out=[];
  for(const lines of paras){
    const para=[];
    for(const l of lines){
      const prev=para[para.length-1];
      if(prev && !/[.:;!?]$/.test(prev) && !LIST_START.test(l) && !isHeading(l) && !isHeading(prev)) para[para.length-1]=prev+' '+l;
      else para.push(l);
    }
    const last=out[out.length-1];
    const prevLine=last&&last[last.length-1];
    if(prevLine && !/[.:;!?]$/.test(prevLine) && /^[a-z(]/.test(para[0]) && !LIST_START.test(para[0]) && !isHeading(prevLine)){
      last[last.length-1]=prevLine+' '+para[0]; last.push(...para.slice(1));
    } else out.push(para);
  }
  while(out.length){ const p=out[out.length-1]; if(isHeading(p[p.length-1])){ p.pop(); if(!p.length) out.pop(); } else break; }
  return out.map(p=>p.join('\n')).join('\n\n');
}
function tidy(list){
  return list.map(p=>({q:cleanQ(p.q).replace(/\s+/g,' '), a:reflow(p.a)})).filter(p=>p.q&&p.a);
}
// Tukar kandungan teks PDF (dari pdf.js) kepada baris & perenggan yang kemas.
function pdfItemsToText(pages){
  const out=[];
  for(const items of pages){
    const lines=[]; let cur=null;
    for(const it of items){
      if(!it || typeof it.str!=='string') continue;
      const tr=it.transform||[1,0,0,1,0,0]; const x=tr[4], y=tr[5], h=Math.abs(it.height||tr[3]||10)||10;
      if(!it.str.trim()){ if(cur){ if(cur.text && !/\s$/.test(cur.text)) cur.text+=' '; cur.endX=Math.max(cur.endX, x+(it.width||0)); } continue; }
      if(!cur || Math.abs(y-cur.y)>Math.max(2,h*0.5)){ cur={y,h,text:'',endX:x}; lines.push(cur); }
      if(cur.text && x-cur.endX>h*0.12 && !/\s$/.test(cur.text)) cur.text+=' ';
      cur.text+=it.str; cur.endX=x+(it.width||0);
    }
    for(const l of lines) l.text=l.text.replace(/\s+/g,' ').trim();
    out.push(lines.filter(l=>l.text));
  }
  // buang pengepala/pengaki yang berulang di setiap muka surat (cth "Dikeluarkan oleh…", nombor muka surat)
  const key = t => t.replace(/[\d\s]+/g,'').toLowerCase();
  const seen = new Map();
  if(out.length>1) for(const lines of out) for(const k of new Set(lines.map(l=>key(l.text)))) seen.set(k,(seen.get(k)||0)+1);
  return out.map(lines=>{
    const keep=lines.filter(l=>!/^\d{1,3}$/.test(l.text) && !(key(l.text) && (seen.get(key(l.text))||0)>=2));
    const gaps=[]; for(let i=1;i<keep.length;i++) gaps.push(Math.abs(keep[i-1].y-keep[i].y));
    const med=gaps.length?[...gaps].sort((a,b)=>a-b)[Math.floor(gaps.length/2)]:0;
    return keep.map((l,i)=>(i ? ((med && gaps[i-1]>med*1.45) ? '\n\n' : '\n') : '')+l.text).join('');
  }).join('\n\n');
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

export { esc, norm, uniq, tokenize, wordSim, bestSim, buildIndex, searchFaq, parseCSV, rowsToFaq, normalizePairs, parseJSONFaq, parseText, reflow, pdfItemsToText, md, slugify };
