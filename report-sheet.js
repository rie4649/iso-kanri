/* =====================================================================
   1件ずつの報告書(2026/10/30)：ヒヤリハット報告書 C-12・ゾーン報告書 C-14・議事録 C-19・
   クレーム報告書 C-08・提案・情報記録 C-13・コミュニケーション記録 C-28
   ・アプリで書いた1件 → 紙と同じ形(A4縦)で「印刷」「PDFで残す」
   ・白紙を印刷して手書き → 書いた紙をスマホで撮る・スキャンして「手書きの紙を入れる」(PDFにして残す)
   ・PDFは EMS文書管理のその文書(C-12など)に入り、行には pdfs:[{ id, kind:"app"|"paper", date, ms }] を付ける
   使う側(plan.html)：db・esc・toast・rows・regOf・cur・EMS・html2canvas・jspdf が必要
   ===================================================================== */
const RepSheet = (function(){
  const KIND_C = { 社内:"1) 社内での作業中", 引取:"2) 引き取り作業中", 危険個所:"3) 気付いた危険個所(社内外)", 環境:"環境(油漏れ・飛散・騒音など)", 安全:"安全(その他)", 車両:"車両・運転", その他:"その他" };
  const COMM_KIND = { 法令:"法令・条例対応", 行政:"行政対応(立入検査・指導・問い合わせ・視察)", 顧客:"顧客対応", 苦情:"苦情", 業界:"業界情報", 技術:"技術情報", 是正:"是正処置", 気候:"気候変動対応情報", 提案:"提案・要望", 問い合わせ:"問い合わせ", 要望:"要望", 報告:"報告", その他:"その他" };
  const PROP = ["提案","業界","技術","気候","問い合わせ","要望"];
  /* 書類の形。rows: [見出し, 中身(キー or 関数), 高さ(px・手書きの余白), 選択肢(白紙で□を出す)]。
     2列にするときは [[見出し, 中身], [見出し, 中身]] */
  const SHEETS = {
    "C-12": { reg:"nearMiss", name:"ヒヤリハット報告書", dateKey:"date", titleKey:"what", stamps:["確認者（環境管理責任者）"], stampKeys:["checker"],
      rows:[ [["日付","date"],["氏名","who"]], ["どんなとき","kind",0,["1) 社内での作業中","2) 引き取り作業中","3) 気付いた危険個所(社内外)"], r => KIND_C[r.kind] || r.kind], ["場所","place",40],
        ["危険だと思ったこと（ヒヤッとしたこと）","what",210], ["原因（わかれば）","cause",90], ["それに対しての対応または改善対策","measure",190], ["みんなへの周知","share",40], ["状況","status",0,["対応中","完了"]] ] },
    "C-14": { reg:"zoneReport", name:"ゾーン報告書", dateKey:"date", titleKey:"content", stamps:["確認者（環境管理責任者）","確認者（ISO推進委員）"], stampKeys:["chkMgr","chkIso"],
      rows:[ [["発生した日","date"],["報告者","who"]], ["状況ゾーン","zone",0,["A","B","C","D","E","F","駐車場","その他"], r => r.zone ? (/^[A-F]$/.test(r.zone) ? r.zone+"ゾーン" : r.zone) : ""],
        ["発生内容","content",230], [["対応した日","doneDate"],["対応者","doneBy"]], ["今後の対策・改善対応","action",230], ["状況","status",0,["対応中","完了"]] ] },
    "C-19": { reg:"minutes", name:"議事録", dateKey:"date", titleKey:"agenda", stamps:["記録者","確認（環境管理責任者）"], stampKeys:["recBy",""],
      rows:[ [["開いた日","date"],["会議","kind"]], ["出席者","members",50], ["議題","agenda",70], ["話し合った内容","content",330], ["決まったこと","decision",130], ["宿題（誰が・いつまでに）","todo",100], ["次回の予定","next",30] ] },
    "C-08": { reg:"comms", name:"クレーム報告書", kindSet:"苦情", dateKey:"date", titleKey:"content", stamps:["受付者","確認（環境管理責任者）"], stampKeys:["recBy",""],
      rows:[ [["受付日","date"],["区分","dir"]], ["申し出た人・会社","party",40], ["苦情の内容","content",230], ["対応・処置","response",210],
        [["相手への回答日","answerDate"],["是正処置","fixNeed",["要","否"]]], ["状況","status",0,["対応中","完了"]] ] },
    "C-13": { reg:"comms", name:"提案・情報記録", kindSet:"提案", dateKey:"date", titleKey:"content", stamps:["受付者","確認（環境管理責任者）"], stampKeys:["recBy",""],
      rows:[ [["日付","date"],["区分","dir"]], ["提案者・情報元","party",40], ["種類","kind",0,["提案・要望","業界情報","技術情報","気候変動","問い合わせ"], r => COMM_KIND[r.kind] || r.kind],
        ["内容","content",250], ["対応・検討結果","response",210], ["状況","status",0,["対応中","完了"]] ] },
    "C-28": { reg:"comms", name:"コミュニケーション記録", kindSet:"その他", dateKey:"date", titleKey:"content", stamps:["記録者","確認（環境管理責任者）"], stampKeys:["recBy",""],
      rows:[ [["日付","date"],["区分","dir",["外部から","外部へ","社内"]]], ["相手","party",40], ["種類","kind",0,["法令・条例","行政対応","顧客対応","業界情報","技術情報","気候変動","その他"], r => COMM_KIND[r.kind] || r.kind],
        ["内容","content",230], ["対応","response",190], [["相手への回答日","answerDate"],["是正処置","fixNeed",["要","否"]]], ["状況","status",0,["対応中","完了"]] ] }
  };
  const CODES_OF = { nearMiss:["C-12"], zoneReport:["C-14"], minutes:["C-19"], comms:["C-08","C-13","C-28"] };
  const codeOf = (reg, r) => reg === "comms" ? (r.kind === "苦情" ? "C-08" : PROP.includes(r.kind) ? "C-13" : "C-28") : CODES_OF[reg][0];
  const fdj = s => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[1]+"年"+Number(m[2])+"月"+Number(m[3])+"日" : (s || ""); };
  const e = t => String(t ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const val = (r, k, fn) => !r ? "" : fn ? fn(r) : /date|Date|^next$/.test(k) ? fdj(r[k]) : (r[k] ?? "");
  const boxes = (opts, v) => opts.map(o => '<span style="margin-right:14px;white-space:nowrap;">'+(v && String(v).startsWith(o.replace(/^\d\) /, "").slice(0, 2)) || v === o ? "☑" : "□")+' '+e(o)+'</span>').join("");

  /* A4縦 1枚(794×1123px)。r が空なら白紙 */
  function html(code, r){
    const S = SHEETS[code], td = 'border:1px solid #111;padding:6px 8px;vertical-align:top;', th = td+'background:#eef2f7;font-weight:bold;width:150px;font-size:13px;';
    const cell = (lb, k, h, opts, fn) => '<tr><td style="'+th+'">'+e(lb)+'</td><td colspan="3" style="'+td+'white-space:pre-wrap;line-height:1.6;'+(h ? 'height:'+h+'px;' : 'height:22px;')+'">'+
      (r ? e(val(r, k, fn)) : opts ? boxes(opts, "") : '')+'</td></tr>';
    const body = S.rows.map(x => Array.isArray(x[0])
      ? '<tr>'+x.map(([lb, k, opts]) => '<td style="'+th+'">'+e(lb)+'</td><td style="'+td+'height:22px;">'+(r ? e(val(r, k)) : opts ? boxes(opts, "") : (/日$/.test(lb) ? '　　　年　　月　　日' : ''))+'</td>').join("")+'</tr>'
      : cell(x[0], x[1], x[2], x[3], x[4])).join("");
    const stamp = S.stamps.map((s, i) => '<td style="border:1px solid #111;width:110px;text-align:center;font-size:11px;padding:2px;background:#eef2f7;">'+e(s)+'</td>').join("");
    const stampV = S.stamps.map((s, i) => '<td style="border:1px solid #111;height:56px;text-align:center;vertical-align:middle;font-size:13px;">'+(r && S.stampKeys[i] ? e(r[S.stampKeys[i]] || "") : "")+'</td>').join("");
    return '<div class="rs" style="width:794px;height:1123px;box-sizing:border-box;padding:40px 44px;background:#fff;font-family:\'Yu Gothic\',\'Hiragino Sans\',\'Meiryo\',sans-serif;color:#111;position:relative;font-size:14px;">'+
      '<div style="display:flex;gap:16px;align-items:stretch;margin-bottom:14px;"><div style="flex:1;border:1.5px solid #111;background:#d9d9d9;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:bold;letter-spacing:.15em;">'+e(S.name)+'</div>'+
      '<table style="border-collapse:collapse;"><tr>'+stamp+'</tr><tr>'+stampV+'</tr></table></div>'+
      '<table style="border-collapse:collapse;width:100%;table-layout:fixed;"><colgroup><col style="width:150px"><col><col style="width:150px"><col></colgroup>'+body+'</table>'+
      (r && r.recDate ? '<div style="margin-top:8px;font-size:11px;color:#444;text-align:right;">記録日 '+e(fdj(r.recDate))+(r.recBy ? '　記録者 '+e(r.recBy) : '')+'</div>' : '')+
      '<div style="position:absolute;bottom:22px;left:44px;right:44px;display:flex;justify-content:space-between;font-size:11px;color:#444;"><span>文書番号 EMS-'+code+'</span><span>株式会社関根商店</span></div></div>';
  }
  function printPages(list, title){   // list: [html, …]
    const w = window.open("", "_blank"); if (!w) { toast("ポップアップを許可してください"); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+e(title)+'</title><style>@page{size:A4 portrait;margin:0;} body{margin:0;background:#888;} .rs{margin:10px auto;page-break-after:always;} @media print{body{background:#fff;} .rs{margin:0;}}</style></head><body>'+list.join("")+'<script>setTimeout(()=>print(),400)<\/script></body></html>');
    w.document.close();
  }
  async function toPdf(pages){
    if (typeof html2canvas === "undefined" || !window.jspdf) throw new Error("PDFを作る部品を読み込めませんでした(ネットを確認してください)");
    const st = document.getElementById("formStage"), pdf = new window.jspdf.jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
    for (let i = 0; i < pages.length; i++){ st.innerHTML = pages[i]; const cv = await html2canvas(st.firstChild, { scale:2, backgroundColor:"#ffffff" }); if (i) pdf.addPage("a4", "portrait"); pdf.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297); }
    st.innerHTML = ""; return pdf.output("blob");
  }
  /* 写真(何枚でも)を1つのPDFにする。PDFはそのまま */
  async function filesToPdf(files){
    if (files.length === 1 && /pdf/i.test(files[0].type)) return files[0];
    if ([...files].some(f => /pdf/i.test(f.type))) throw new Error("PDFと写真はいっしょに選べません(PDFは1つずつ)");
    const pdf = new window.jspdf.jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
    for (let i = 0; i < files.length; i++){
      const url = URL.createObjectURL(files[i]); const im = await new Promise((res, rej) => { const x = new Image(); x.onload = () => res(x); x.onerror = () => rej(new Error("写真を読めませんでした")); x.src = url; });
      const k = Math.min(1, 1800 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const land = c.width > c.height; if (i) pdf.addPage("a4", land ? "landscape" : "portrait"); else if (land) { pdf.deletePage(1); pdf.addPage("a4", "landscape"); }
      const W = land ? 297 : 210, H = land ? 210 : 297, s = Math.min(W / c.width, H / c.height), w = c.width * s, h = c.height * s;
      pdf.addImage(c.toDataURL("image/jpeg", 0.85), "JPEG", (W - w) / 2, (H - h) / 2, w, h);
    }
    return new File([pdf.output("blob")], "scan.pdf", { type:"application/pdf" });
  }
  async function ensureDoc(code){ if (!EMS.docs.some(x => x.id === code)) await db.collection(EMS.DOCS).doc(code).set({ name:SHEETS[code].name, place:"2階事務所", keep:"3年", approver:"環境管理責任者", link:"plan:"+SHEETS[code].reg, createdMs:Date.now() }, { merge:true }); }
  const short = (r, S) => String(r[S.titleKey] || "").replace(/\s+/g, " ").slice(0, 30);
  async function savePdf(id){
    const r = rows.find(x => x.id === id); if (!r) return;
    const code = codeOf(r.reg, r), S = SHEETS[code];
    toast("PDFを作っています…");
    try {
      const blob = await toPdf([html(code, r)]); await ensureDoc(code);
      const date = r[S.dateKey] || "", fid = await EMS.upload(code, new File([blob], "EMS-"+code+"_"+S.name+"_"+date.replace(/-/g, "")+".pdf", { type:"application/pdf" }),
        { date, title:S.name, author:r.recBy || "", memo:S.name+"（アプリで作成）"+(date ? fdj(date)+" " : "")+short(r, S) });
      const pdfs = (r.pdfs || []).filter(p => p.kind !== "app"); pdfs.push({ id:fid, kind:"app", date, ms:Date.now() });
      await db.collection(ISO_REG_COL).doc(id).update({ pdfs, pdfAt:Date.now() });
      toast("PDFで残しました（EMS-"+code+"）");
    } catch(err){ console.error(err); toast("作れませんでした: "+err.message); }
  }
  function print(id){ const r = rows.find(x => x.id === id); if (!r) return; const code = codeOf(r.reg, r); printPages([html(code, r)], "EMS-"+code+" "+SHEETS[code].name); }
  function blank(code, n){ printPages(Array.from({ length:n || 1 }, () => html(code, null)), "EMS-"+code+" "+SHEETS[code].name+"（白紙）"); }

  /* 手書きの紙を入れる：id があればその行に付ける。なければ新しい行を作る */
  function openPaper(regKey, id){
    const r = id ? rows.find(x => x.id === id) : null, codes = r ? [codeOf(regKey, r)] : CODES_OF[regKey];
    let bg = document.getElementById("rsPaperBg");
    if (!bg){ bg = document.createElement("div"); bg.id = "rsPaperBg"; bg.className = "bg"; bg.style.zIndex = 90; bg.addEventListener("click", ev => { if (ev.target === bg) bg.classList.remove("show"); }); document.body.appendChild(bg); }
    const td = (() => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); })();
    bg.innerHTML = '<div class="modal" style="max-width:520px;"><h2>✍️ 手書きの紙を入れる</h2>'+
      '<div class="note" style="margin-top:0;">白紙に手で書いた報告書を、スマホで撮るかスキャンして入れます。写真は何枚でも1つのPDFにまとめます。EMS文書管理に残り、'+(r ? 'この行に付きます。' : 'ここにも1件として並びます。')+'</div>'+
      (codes.length > 1 ? '<label for="rsCode">どの書類？</label><select id="rsCode">'+codes.map(c => '<option value="'+c+'">EMS-'+c+' '+SHEETS[c].name+'</option>').join("")+'</select>' : '<div style="font-weight:700;margin:8px 0 2px;">EMS-'+codes[0]+' '+SHEETS[codes[0]].name+'</div><input type="hidden" id="rsCode" value="'+codes[0]+'">')+
      (r ? '' : '<div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;"><div><label for="rsDate">日付（紙に書いた日）</label><input type="date" id="rsDate" value="'+td+'"></div><div><label for="rsTtl">ひとこと（何の報告？）</label><input id="rsTtl" placeholder="例：給油中に油がこぼれそうになった"></div></div>'+
        '<label for="rsWho">書いた人・報告した人</label><input id="rsWho" placeholder="例：桑野">')+
      '<label for="rsFile">写真・PDF</label><input type="file" id="rsFile" accept="image/*,application/pdf" multiple>'+
      '<div class="mBtns"><button class="btn" onclick="document.getElementById(\'rsPaperBg\').classList.remove(\'show\')">やめる</button><button class="btn pri" id="rsGo">入れる</button></div></div>';
    bg.classList.add("show");
    document.getElementById("rsGo").onclick = async () => {
      const fs = document.getElementById("rsFile").files, code = document.getElementById("rsCode").value, S = SHEETS[code];
      if (!fs.length) { toast("写真かPDFを選んでください"); return; }
      const date = r ? (r[S.dateKey] || td) : document.getElementById("rsDate").value, ttl = r ? short(r, S) : document.getElementById("rsTtl").value.trim(), who = r ? "" : document.getElementById("rsWho").value.trim();
      if (!date) { toast("日付を入れてください"); return; }
      if (!r && !ttl) { toast("ひとことを入れてください（一覧で見分けるため）"); return; }
      const btn = document.getElementById("rsGo"); btn.disabled = true; btn.textContent = "PDFにしています…";
      try {
        const f = await filesToPdf(fs); await ensureDoc(code);
        const fid = await EMS.upload(code, new File([f], "EMS-"+code+"_"+S.name+"_手書き_"+date.replace(/-/g, "")+".pdf", { type:"application/pdf" }), { date, title:S.name, author:who, memo:S.name+"（手書き）"+fdj(date)+" "+ttl });
        const p = { id:fid, kind:"paper", date, ms:Date.now() };
        if (r) await db.collection(ISO_REG_COL).doc(r.id).update({ pdfs:(r.pdfs || []).concat([p]) });
        else {
          const d = { reg:S.reg, draft:false, [S.dateKey]:date, [S.titleKey]:ttl, handwritten:true, pdfs:[p], createdMs:Date.now(), recDate:td, recBy:who, updatedAt:firebase.firestore.FieldValue.serverTimestamp() };
          if (S.reg === "nearMiss" || S.reg === "zoneReport") d.who = who;
          if (S.reg === "minutes") d.kind = "環境管理会議";
          if (S.kindSet) d.kind = S.kindSet;
          if (S.reg === "comms") d.party = who;
          await db.collection(ISO_REG_COL).add(d);
        }
        bg.classList.remove("show"); toast("入れました（EMS-"+code+" にPDFで残りました）");
      } catch(err){ console.error(err); toast("入れられませんでした: "+err.message); btn.disabled = false; btn.textContent = "入れる"; }
    };
  }
  /* 行を開いたときのボタン */
  function rowBar(reg, r){
    if (!CODES_OF[reg.key] || r.draft) return "";
    const code = codeOf(reg.key, r), ps = r.pdfs || [], app = ps.filter(p => p.kind === "app").pop(), paper = ps.filter(p => p.kind === "paper");
    const stale = app && r.updatedAt && r.updatedAt.toMillis && r.updatedAt.toMillis() > (app.ms || 0) + 5000;
    return '<div class="rsBar">'+
      (r.handwritten ? '' : '<button class="btn sm" onclick="RepSheet.print(\''+r.id+'\')">🖨️ 報告書で印刷</button><button class="btn sm" style="border-color:#0f766e;color:#0f766e;" onclick="RepSheet.savePdf(\''+r.id+'\')">📄 '+(app ? 'PDFを作り直す' : 'PDFで残す')+'</button>')+
      (app ? '<button class="btn sm" onclick="EMS.view(\''+app.id+'\')">📄 PDFを見る</button>' : '')+
      paper.map((p, i) => '<button class="btn sm" onclick="EMS.view(\''+p.id+'\')">✍️ 手書きの紙'+(paper.length > 1 ? (i+1) : '')+'</button>').join("")+
      '<button class="btn sm" onclick="RepSheet.openPaper(\''+reg.key+'\',\''+r.id+'\')">📎 手書きの紙を付ける</button>'+
      '<span class="note" style="margin:0;">EMS-'+code+' '+SHEETS[code].name+(stale ? '　<b style="color:#b45309;">直したあとのPDFはまだ（作り直してください）</b>' : '')+'</span></div>';
  }
  /* 一覧の上の大きいカード */
  function topCard(reg, list){
    const codes = CODES_OF[reg.key]; if (!codes) return "";
    const n = list.filter(r => (r.pdfs || []).length).length, nNo = list.filter(r => !r.draft && !(r.pdfs || []).length).length;
    return '<div class="card" style="border-left:4px solid #0f766e;"><b style="color:var(--navy);font-size:16px;">📄 '+codes.map(c => SHEETS[c].name).join("・")+'（'+codes.map(c => "EMS-"+c).join("・")+'）</b>'+
      '<div class="note" style="margin:4px 0 10px;font-size:13.5px;">1件ずつ、紙と同じ形の報告書になります。どちらのやり方でもOKです。</div>'+
      '<div class="rsWays"><div class="rsWay"><b>✏️ アプリで書く</b><span>入力すると、そのまま報告書の形で印刷・PDFにできます</span><button class="btn pri" onclick="openEdit()">＋ アプリで書く</button>'+
      '<small>書いたあと、下の行を開いて「📄 PDFで残す」</small></div>'+
      '<div class="rsWay"><b>✍️ 紙に手で書く</b><span>白紙を印刷して書く → 書いた紙を撮って（スキャンして）入れる</span>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">'+codes.map(c => '<button class="btn" onclick="RepSheet.blank(\''+c+'\')">🖨️ 白紙'+(codes.length > 1 ? '：'+SHEETS[c].name : 'を印刷')+'</button>').join("")+'</div>'+
      '<button class="btn pri" style="background:#0f766e;border-color:#0f766e;" onclick="RepSheet.openPaper(\''+reg.key+'\')">📥 手書きの紙を入れる</button></div></div>'+
      '<div class="note" style="margin:8px 0 0;">PDFは EMS文書管理の '+codes.map(c => "EMS-"+c).join("・")+' に1件ずつ残ります。PDFで残した '+n+'件'+(nNo ? '・<b style="color:#b45309;">まだPDFにしていない '+nNo+'件</b>' : '')+'</div></div>'+
      '<style>.rsWays{display:grid;grid-template-columns:1fr 1fr;gap:10px;} @media (max-width:640px){.rsWays{grid-template-columns:1fr;}} .rsWay{border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;background:#f8fafc;} .rsWay b{font-size:15px;color:var(--navy);} .rsWay span{font-size:13px;color:#475569;} .rsWay small{font-size:12px;color:#64748b;}'+
      ' .rsBar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0 2px;padding-top:8px;border-top:1px dashed var(--line);}</style>';
  }
  return { SHEETS, CODES_OF, codeOf, html, print, blank, savePdf, openPaper, rowBar, topCard, has: k => !!CODES_OF[k] };
})();
