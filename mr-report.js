/* =====================================================================
   マネジメントレビューの資料(報告書 EMS-C-04)を、1年分の記録から自動で集めて作る(2026/10)
   ISOの計画・リスク → マネジメントレビュー の「📊 資料を作る」から使う。plan.html の db・rows・EMS などを使う
   年度は 8月〜翌7月。集める物(環境マニュアル9.3のインプット):
     前回の指示 / 環境目標の達成度 / 順守評価 / 内部監査 / 是正処置・ヒヤリハット / 苦情・コミュニケーション /
     監視・測定(水質・騒音・フロン・軽油・クリーン度・パトロール) / リスク「高」 / 取引先B・C / 変更・訓練・教育 / 改善が必要なこと
   ===================================================================== */
let mrData = null;
const MR_CO2_DIESEL = 2.58;   // 軽油1Lあたりの CO₂(kg)。環境省の排出係数
function mrFyRange(fy){ return { from: fy+"-08-01", to: (fy+1)+"-07-31", fromM: fy+"-08", toM: (fy+1)+"-07" }; }
async function mrCollect(fy){
  const R = mrFyRange(fy), P = mrFyRange(fy - 1);
  const get = c => db.collection(c).get().then(s => s.docs.map(d => ({ id:d.id, ...d.data() }))).catch(() => []);
  const names = ["isoAudits","isoCorrectives","waterTests","noiseChecks","freonRecords","dieselRecords","cleanlinessChecks","metalRecords","trainingRecords","safetyPatrols","phoneRequestLog","isoSurveySubmits","isoHoreiEval","emsDocReviews","lifelineRecords"];
  const L = {}; (await Promise.all(names.map(get))).forEach((v, i) => L[names[i]] = v);
  const inR = (v, r) => { const s = String(v || ""); return s.length >= 10 ? s.slice(0,10) >= r.from && s.slice(0,10) <= r.to : s.length === 7 ? s >= r.fromM && s <= r.toM : false; };
  const fyOf = (l, k, r) => l.filter(x => inR(x[k], r || R));
  const reg = k => rows.filter(x => x.reg === k && !x.draft);
  const regFy = (k, f) => fyOf(reg(k), f || "date");
  const msYm = ms => { const d = new Date(ms); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); };
  // 前回のマネジメントレビュー(この年度の終わりより前で、いちばん新しいもの)
  const reviews = reg("review").filter(x => x.date && x.date < R.from).sort((a,b) => String(b.date).localeCompare(String(a.date)));
  // 軽油
  const dsl = fyOf(L.dieselRecords, "yearMonth"), dslP = fyOf(L.dieselRecords, "yearMonth", P);
  const liters = dsl.reduce((a, x) => a + (Number(x.totalLiters) || 0), 0), litersP = dslP.reduce((a, x) => a + (Number(x.totalLiters) || 0), 0);
  // 顧客対応(電話依頼)
  const plog = L.phoneRequestLog.filter(x => { const m = msYm(x.createdMs || 0); return m >= R.fromM && m <= R.toM; });
  const late = plog.filter(x => x.respondedMs && x.createdMs && x.respondedMs - x.createdMs > 24*3600*1000).length;
  // クリーン度
  const cl = fyOf(L.cleanlinessChecks, "date"), clAvg = cl.length ? (cl.reduce((a, x) => a + (Number(x.avgScore) || 0), 0) / cl.length) : 0;
  // 順守評価(法的要求事項特定書のチェックシート)
  let legal = { n:0, ok:0, na:0, ng:[] };
  try { const lr = regOf("legal"); if (lr) ycUnits(lr).forEach(u => { const c = ycOf(u, fy); legal.n++; if (!c) return; if (c.r === "順守") legal.ok++; else if (c.r === "非該当") legal.na++; else if (c.r === "要改善") legal.ng.push((u.rows[0].no ? "No."+u.rows[0].no+" " : "")+(u.rows[0].name || "")+(c.memo ? "("+c.memo+")" : "")); }); } catch(e){}
  const water = fyOf(L.waterTests, "date"), noise = fyOf(L.noiseChecks, "date"), freon = fyOf(L.freonRecords, "date");
  const phs = water.map(x => Number(x.ph)).filter(v => !isNaN(v) && v > 0), dbs = noise.map(x => Number(x.db)).filter(v => !isNaN(v) && v > 0);
  const objectives = reg("objectives");
  const auto = k => {   // 環境目標の区分ごとに、記録から実績を出す
    const t = String(k || "");
    if (/軽油|CO|省エネ|燃料|温暖化/.test(t)) return dsl.length ? "軽油 "+Math.round(liters).toLocaleString()+" L(前年度 "+(litersP ? Math.round(litersP).toLocaleString()+" L、"+(liters <= litersP ? "" : "+")+(litersP ? ((liters - litersP) / litersP * 100).toFixed(1) : "-")+"%" : "記録なし")+")" : "";
    if (/顧客/.test(t)) return plog.length ? "電話依頼 "+plog.length+"件・対応完了 "+plog.filter(x => x.respondedMs).length+"件・24時間以上 "+late+"件" : "";
    if (/クリーン|5S|清掃/.test(t)) return cl.length ? "クリーン度チェック "+cl.length+"回・平均 "+clAvg.toFixed(1)+"点" : "";
    if (/金属|拾/.test(t)) { const m = fyOf(L.metalRecords, "date"); return m.length ? "金属拾い上げ "+m.length+"回・"+Math.round(m.reduce((a, x) => a + (Number(x.total) || 0), 0)).toLocaleString()+"円" : ""; }
    return "";
  };
  const comms = regFy("comms"), complaints = comms.filter(x => x.kind === "苦情" || /苦情|クレーム/.test(x.kind + " " + x.content));
  const audits = fyOf(L.isoAudits, "date"), fixes = fyOf(L.isoCorrectives, "date"), near = regFy("nearMiss");
  const d = {
    fy, R, prev: reviews[0] || null,
    objectives: (() => {   // 同じ区分の行は1つにまとめる。実績は区分の名前で決める(なければ目的・目標の文から、軽油・CO₂だけ)
      const m = new Map(); objectives.forEach(o => { const k = o.kubun || "(区分なし)"; if (!m.has(k)) m.set(k, []); m.get(k).push(o); });
      const uniq = a => [...new Set(a.filter(Boolean))];
      return [...m].map(([k, l]) => ({ kubun:k, target:uniq(l.map(o => o.target || o.goal)).join("\n"), status:uniq(l.map(o => o.status)).join("・"),
        auto: auto(k) || (/軽油|CO|燃料/.test(l.map(o => (o.goal || "")+(o.target || "")).join(" ")) ? auto("軽油") : "") }));
    })(),
    legal, horei: fyOf(L.isoHoreiEval, "date"),
    audits, auditPlan: regFy("auditPlan"), fixes, near,
    comms, complaints, survey: fyOf(L.isoSurveySubmits, "date"),
    water, phs, noise, dbs, freon, freonNg: freon.filter(x => /異常/.test(x.result || "")).length,
    liters, litersP, dsl: dsl.length, cl: cl.length, clAvg, patrol: fyOf(L.safetyPatrols, "date").length, life: fyOf(L.lifelineRecords, "yearMonth").length,
    plog: plog.length, plogDone: plog.filter(x => x.respondedMs).length, late,
    risksHigh: reg("risks").filter(x => x.level === "高"),
    vendorsBC: reg("vendors").filter(x => { const c = vendorCheck(x); return c.done && c.rank !== "A"; }).map(x => ({ name:x.name, rank:vendorCheck(x).rank, followup:x.followup || "" })),
    changes: regFy("changes"), emergency: regFy("emergency"), training: fyOf(L.trainingRecords, "date"), docRev: fyOf(L.emsDocReviews, "date")
  };
  // 改善が必要なこと(自動の気づき)
  const todo = [];
  if (!d.audits.length) todo.push("内部監査の記録がありません(9.2)");
  d.fixes.filter(x => x.status !== "done" && x.status !== "完了").forEach(x => todo.push("是正処置が対応中：" + (x.event || "").slice(0, 40)));
  d.near.filter(x => x.status !== "完了").forEach(x => todo.push("ヒヤリハットが対応中：" + (x.what || "").slice(0, 40)));
  d.complaints.filter(x => x.status !== "完了").forEach(x => todo.push("苦情が対応中：" + (x.content || "").slice(0, 40)));
  d.legal.ng.forEach(x => todo.push("順守評価で要改善：" + x));
  if (d.legal.n && d.legal.ok + d.legal.na + d.legal.ng.length < d.legal.n) todo.push("順守評価(法的要求事項特定書のチェックシート)が終わっていない法令が "+(d.legal.n - d.legal.ok - d.legal.na - d.legal.ng.length)+" 件あります");
  if (!d.emergency.length && !d.training.some(x => x.kind === "test")) todo.push("緊急事態の訓練・テストの記録がありません(8.2)");
  if (!d.water.length) todo.push("水質検査の記録がありません(9.1.1)");
  if (!d.noise.length) todo.push("騒音チェックの記録がありません(9.1.1)");
  if (d.freonNg) todo.push("フロン簡易点検で異常あり "+d.freonNg+"件");
  if (d.late) todo.push("電話依頼で24時間以上かかったものが "+d.late+"件");
  d.vendorsBC.forEach(v => todo.push("取引先チェック "+v.rank+"ランク："+v.name+(v.followup ? "(対応："+v.followup+")" : "")));
  d.todo = todo;
  return d;
}
/* 報告書のページ(A4縦) */
function mrPages(d, meta){
  const e = esc, fdx = s => s ? String(s).slice(0,10).replace(/-/g, "/") : "";
  const th = (v, w) => '<th style="border:1px solid #111;background:#dbe4f3;padding:4px 5px;font-size:11px;'+(w ? 'width:'+w+';' : '')+'">'+e(v)+'</th>';
  const td = (v, c) => '<td style="border:1px solid #111;padding:3px 5px;font-size:11px;vertical-align:top;white-space:pre-wrap;'+(c ? 'text-align:'+c+';' : '')+'">'+e(v)+'</td>';
  const tbl = (heads, rws, empty) => rws.length ? '<table style="border-collapse:collapse;width:100%;margin-bottom:6px;"><tr>'+heads.map(h => th(h[0], h[1])).join("")+'</tr>'+rws.map(r => '<tr>'+r.map((v, i) => td(v, heads[i][2])).join("")+'</tr>').join("")+'</table>' : '<div style="font-size:11.5px;color:#444;margin:2px 0 6px;">'+e(empty || "記録なし")+'</div>';
  const H = (n, t) => '<div style="font-weight:bold;font-size:13px;margin:10px 0 4px;border-bottom:1.5px solid #1e3a5f;color:#1e3a5f;">'+n+'. '+e(t)+'</div>';
  const P = t => '<div style="font-size:11.5px;line-height:1.6;white-space:pre-wrap;margin-bottom:4px;">'+e(t)+'</div>';
  const blocks = [];
  blocks.push(H(1, "前回の指示の実施状況") + (d.prev ? P("前回("+fdx(d.prev.date)+")の指示：\n"+(d.prev.decision || "(記録なし)")) + P("実施状況：") + '<div style="border:1px solid #999;min-height:40px;margin-bottom:6px;"></div>' : P("前回のマネジメントレビューの記録はありません。")));
  blocks.push(H(2, "環境目標の達成状況(6.2)") + tbl([["区分","16%"],["環境目標","40%"],["実績(記録から自動)","30%"],["状況","14%","center"]], d.objectives.map(o => [o.kubun, o.target, o.auto || "—", o.status]), "環境目標の登録がありません"));
  blocks.push(H(3, "順守義務の評価(6.1.3・9.1.2)") + P("法的要求事項特定書(A-05)の年度の点検："+(d.legal.n ? "全 "+d.legal.n+" 法令のうち 順守 "+d.legal.ok+"・非該当 "+d.legal.na+"・要改善 "+d.legal.ng.length+"・未点検 "+(d.legal.n - d.legal.ok - d.legal.na - d.legal.ng.length) : "記録なし")) + (d.legal.ng.length ? P("要改善："+d.legal.ng.join("／")) : ""));
  blocks.push(H(4, "内部監査の結果(9.2)") + tbl([["実施日","13%","center"],["範囲・対象","27%"],["指摘事項","35%"],["対応","25%"]], d.audits.map(a => [fdx(a.date), a.scope || "", a.findings || "", (a.action || "") + (a.status === "open" ? "\n(対応中)" : "")]), "この年度の内部監査の記録はありません"));
  blocks.push(H(5, "不適合・是正処置・ヒヤリハット(10.2)") + tbl([["日付","12%","center"],["何が起きたか","38%"],["原因・対策","38%"],["状況","12%","center"]],
    d.fixes.map(x => [fdx(x.date), x.event || "", [x.cause, x.action].filter(Boolean).join("\n→ "), x.status === "done" || x.status === "完了" ? "完了" : "対応中"])
      .concat(d.near.map(x => [fdx(x.date), "(ヒヤリハット) "+(x.what || ""), [x.cause, x.measure].filter(Boolean).join("\n→ "), x.status || ""])), "記録なし"));
  blocks.push(H(6, "外部コミュニケーション・苦情(7.4)") + P("記録 "+d.comms.length+"件(うち苦情 "+d.complaints.length+"件)・委託先調査票の提出 "+d.survey.length+"件・電話依頼 "+d.plog+"件(対応完了 "+d.plogDone+"件・24時間以上 "+d.late+"件)") +
    tbl([["日付","12%","center"],["相手","18%"],["内容","45%"],["対応","25%"]], d.complaints.map(x => [fdx(x.date), x.party || "", x.content || "", (x.response || "")+(x.status ? "\n("+x.status+")" : "")]), "苦情はありませんでした"));
  blocks.push(H(7, "環境パフォーマンス(監視・測定 9.1.1)") + tbl([["項目","26%"],["結果","74%"]], [
    ["水質検査", d.water.length ? d.water.length+"回"+(d.phs.length ? "・pH "+Math.min(...d.phs)+"〜"+Math.max(...d.phs) : "") : "記録なし"],
    ["騒音チェック", d.noise.length ? d.noise.length+"回"+(d.dbs.length ? "・最大 "+Math.max(...d.dbs)+" dB" : "") : "記録なし"],
    ["フロン簡易点検", d.freon.length ? d.freon.length+"回・異常あり "+d.freonNg+"件" : "記録なし"],
    ["軽油使用量・CO₂", d.dsl ? Math.round(d.liters).toLocaleString()+" L(約 "+(d.liters * MR_CO2_DIESEL / 1000).toFixed(1)+" t-CO₂)"+(d.litersP ? "　前年度 "+Math.round(d.litersP).toLocaleString()+" L" : "") : "記録なし"],
    ["ライフライン(電気・ガス・水道)", d.life ? d.life+"か月分の記録" : "記録なし"],
    ["クリーン度チェック", d.cl ? d.cl+"回・平均 "+d.clAvg.toFixed(1)+"点" : "記録なし"],
    ["安全衛生パトロール", d.patrol ? d.patrol+"回" : "記録なし"]
  ]));
  blocks.push(H(8, "リスクと機会(6.1.4)・取引先(6.1.5)") + P("優先度「高」のリスク："+(d.risksHigh.length ? "" : "なし")) + (d.risksHigh.length ? tbl([["リスク","50%"],["活動計画","50%"]], d.risksHigh.map(r => [(r.issue ? r.issue+"：" : "")+(r.risk || r.content || ""), r.action || ""])) : "") +
    P("取引先チェックでB・Cランク："+(d.vendorsBC.length ? d.vendorsBC.map(v => v.name+" "+v.rank).join("、") : "なし")));
  blocks.push(H(9, "変更・緊急事態の訓練・教育訓練(6.3・8.2・7.2)") + P("変更管理 "+d.changes.length+"件"+(d.changes.length ? "："+d.changes.map(x => (x.content || "").slice(0, 30)).join("／") : "")+"\n緊急事態の訓練・テスト "+d.emergency.length+"件・教育訓練 "+d.training.length+"件・文書の見直し "+d.docRev.length+"件"));
  blocks.push(H(10, "改善が必要なこと(記録から自動で拾ったもの)") + (d.todo.length ? P(d.todo.map(t => "・"+t).join("\n")) : P("特にありません。")));
  blocks.push(H(11, "社長の指示・決定事項(アウトプット)") + P("□ 環境マネジメントシステムは 適切・妥当・有効か　　□ 環境方針・目標の変更　　□ 資源(人・設備・費用)の必要性　　□ 改善の機会") + '<div style="border:1px solid #111;min-height:120px;"></div>' +
    '<div style="display:flex;gap:20px;margin-top:10px;font-size:12px;"><div>実施日：　　　年　　月　　日</div><div>代表取締役：</div><div>環境管理責任者：</div></div>');
  // ページに分ける(高さで詰める)
  const page = (body, i, n) => '<div class="fp" style="width:794px;height:1123px;box-sizing:border-box;padding:28px 34px;background:#fff;font-family:\'Yu Gothic\',\'Hiragino Sans\',\'Meiryo\',sans-serif;color:#111;position:relative;">'+
    (i === 1 ? '<div style="display:flex;gap:12px;align-items:stretch;margin-bottom:8px;"><div style="flex:1;border:1.5px solid #111;background:#d9d9d9;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:19px;font-weight:bold;letter-spacing:.06em;text-align:center;padding:6px;"><div>'+e(meta.title)+'</div><span style="font-size:12.5px;letter-spacing:0;margin-top:2px;">'+d.fy+'年度('+d.fy+'年8月〜'+(d.fy+1)+'年7月)</span></div>'+
      '<table style="border-collapse:collapse;font-size:11px;width:260px;">'+[["文書番号",meta.docNo],["作成者",meta.author],["日付",meta.dateTxt],["確認者",meta.checker]].map(([k,v]) => '<tr><td style="border:1px solid #111;padding:3px 6px;width:66px;background:#f3f4f6;">'+k+'</td><td style="border:1px solid #111;padding:3px 6px;">'+e(v||"")+'</td></tr>').join("")+'</table></div>' : '')+
    body+'<div style="position:absolute;bottom:12px;right:34px;font-size:10px;color:#444;">株式会社関根商店　'+i+' / '+n+'</div></div>';
  return { blocks, page };
}
async function mrBuildPages(d, meta){
  const { blocks, page } = mrPages(d, meta), st = document.getElementById("formStage"), pages = [];
  let cur = [];
  const fits = (arr, first) => { st.innerHTML = page(arr.join('') + '<div style="height:30px"></div>', first ? 1 : 2, 9); const el = st.firstChild; return el.scrollHeight <= 1123; }; const _unused = (arr, first) => { st.innerHTML = page(arr.join(""), first ? 1 : 2, 9); const el = st.firstChild; const inner = el.scrollHeight; return inner <= 1123 - 30; };
  for (const b of blocks){
    cur.push(b);
    if (!fits(cur, pages.length === 0) && cur.length > 1){ cur.pop(); pages.push(cur); cur = [b]; }
  }
  if (cur.length) pages.push(cur);
  st.innerHTML = "";
  return pages.map((p, i) => page(p.join(""), i + 1, pages.length));
}
function mrMeta(){
  const date = document.getElementById("mrDate").value, ver = document.getElementById("mrVer").value.trim().replace(/^(\d)$/, "0$1");
  return { title:"マネジメントレビュー報告書", docNo:"EMS-C-04"+(ver ? "-"+ver : ""), ver, date, author:document.getElementById("mrAuthor").value.trim(), checker:document.getElementById("mrChecker").value.trim(), dateTxt:date.replace(/-/g, ".") };
}
async function openMr(){
  const fy = Number(document.getElementById("mrFy") ? document.getElementById("mrFy").value : 0) || (ycFy() - (new Date().getMonth() + 1 >= 8 && new Date().getMonth() + 1 <= 9 ? 1 : 0));
  toast("1年分の記録を集めています…");
  try { mrData = await mrCollect(fy); } catch(e){ console.error(e); toast("集められませんでした: "+e.message); return; }
  const last = EMS.filesOf("C-04")[0];
  document.getElementById("mrDate").value = today(); document.getElementById("mrVer").value = last && last.ver ? String(Number(last.ver) + 1).padStart(2, "0") : "01";
  if (last && last.author && !document.getElementById("mrAuthor").value) document.getElementById("mrAuthor").value = last.author;
  if (!document.getElementById("mrChecker").value) document.getElementById("mrChecker").value = (window.RecBy && RecBy.getName()) || "";
  const d = mrData;
  document.getElementById("mrSum").innerHTML = '<b>'+d.fy+'年度('+d.fy+'/8〜'+(d.fy+1)+'/7)の記録から集めました</b><br>'+
    ['環境目標 '+d.objectives.length+'件','内部監査 '+d.audits.length+'件','是正処置 '+d.fixes.length+'件','ヒヤリハット '+d.near.length+'件','苦情 '+d.complaints.length+'件','水質 '+d.water.length+'回','騒音 '+d.noise.length+'回','軽油 '+d.dsl+'か月分'].join('・')+
    (d.todo.length ? '<div style="margin-top:6px;color:#b45309;"><b>改善が必要なこと '+d.todo.length+'件</b>(報告書の10番に出ます)<br>'+d.todo.slice(0, 6).map(t => '・'+esc(t)).join('<br>')+(d.todo.length > 6 ? '<br>…ほか'+(d.todo.length - 6)+'件' : '')+'</div>' : '<div style="margin-top:6px;color:#15803d;">改善が必要なことは見つかりませんでした</div>');
  document.getElementById("mrBg").classList.add("show");
}
function closeMr(){ document.getElementById("mrBg").classList.remove("show"); }
async function previewMr(){
  if (!mrData) return; const meta = mrMeta(), pages = await mrBuildPages(mrData, meta);
  const w = window.open("", "_blank"); if (!w){ toast("ポップアップを許可してください"); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(meta.docNo)+'</title><style>@page{size:A4 portrait;margin:0;} body{margin:0;background:#888;} .fp{margin:10px auto;page-break-after:always;} @media print{body{background:#fff;} .fp{margin:0;}}</style></head><body>'+pages.join("")+'</body></html>');
  w.document.close();
}
async function makeMr(){
  if (!mrData) return; const meta = mrMeta();
  if (!meta.date){ toast("日付を入れてください"); return; }
  if (!meta.author){ toast("作成者を入れてください"); return; }
  if (typeof html2canvas === "undefined" || !window.jspdf){ toast("PDFを作る部品を読み込めませんでした"); return; }
  const btn = document.getElementById("mrSave"); btn.disabled = true; btn.textContent = "PDFを作成中…";
  try {
    if (!EMS.docs.some(x => x.id === "C-04")) await db.collection(EMS.DOCS).doc("C-04").set({ name:"マネジメントレビュー報告書", place:"2階事務所", keep:"3年", approver:"環境管理責任者", link:"plan:review", order:34, createdMs:Date.now() }, { merge:true });
    const pages = await mrBuildPages(mrData, meta), st = document.getElementById("formStage"), pdf = new window.jspdf.jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
    for (let i = 0; i < pages.length; i++){ st.innerHTML = pages[i]; const cv = await html2canvas(st.firstChild, { scale:2, backgroundColor:"#ffffff" }); if (i) pdf.addPage("a4", "portrait"); pdf.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297); }
    st.innerHTML = "";
    const file = new File([pdf.output("blob")], meta.docNo+"_マネジメントレビュー報告書_"+mrData.fy+"年度.pdf", { type:"application/pdf" });
    btn.textContent = "登録中…";
    await EMS.upload("C-04", file, { ver:meta.ver, date:meta.date, author:meta.author, memo:mrData.fy+"年度のマネジメントレビュー報告書(記録から自動で作成)" });
    await db.collection(EMS.REVIEWS).add({ code:"C-04", title:"", date:meta.date, kind:"作成", by:meta.checker || meta.author, detail:mrData.fy+"年度のマネジメントレビュー報告書を作成("+meta.docNo+")", createdMs:Date.now() });
    closeMr(); toast(meta.docNo+" を作ってEMS文書管理に登録しました");
  } catch(e){ console.error(e); toast("作れませんでした: "+e.message); }
  btn.disabled = false; btn.textContent = "PDFを作って登録";
}
/* 集めた内容を、マネジメントレビューの記録(表の1行)の入力画面に書き写す。社長の指示は会議のあとに書く */
function mrToRecord(){
  if (!mrData) return; const d = mrData; closeMr();
  if (cur !== "review") setTab("review");
  setTimeout(() => {
    openEdit();
    const set = (k, v) => { const el = document.getElementById("f_"+k); if (el && !el.value) el.value = v; };
    set("date", today());
    set("prev", d.prev ? "前回("+String(d.prev.date).replace(/-/g, "/")+")の指示：" + (d.prev.decision || "") + "\n→ 実施状況：" : "前回の記録なし");
    set("report", [
      "・環境目標：" + d.objectives.map(o => o.kubun + (o.status ? "(" + o.status + ")" : "") + (o.auto ? " " + o.auto : "")).join("／"),
      "・順守評価：" + (d.legal.n ? "順守 " + d.legal.ok + "・非該当 " + d.legal.na + "・要改善 " + d.legal.ng.length : "記録なし"),
      "・内部監査：" + d.audits.length + "件" + (d.audits.length ? "(指摘 " + d.audits.filter(a => a.findings && !/指摘なし/.test(a.findings)).length + "件)" : ""),
      "・是正処置 " + d.fixes.length + "件・ヒヤリハット " + d.near.length + "件・苦情 " + d.complaints.length + "件",
      "・監視測定：水質 " + d.water.length + "回・騒音 " + d.noise.length + "回・フロン異常 " + d.freonNg + "件・クリーン度 " + d.cl + "回",
      d.todo.length ? "・改善が必要なこと：" + d.todo.join("／") : "・改善が必要なこと：特になし"
    ].join("\n"));
    set("highRisk", d.risksHigh.length ? d.risksHigh.map(r => (r.issue ? r.issue + "：" : "") + (r.risk || r.content || "") + (r.action ? " → " + r.action : "")).join("\n") : "優先度「高」のリスクなし");
    set("climate", d.dsl ? "軽油 " + Math.round(d.liters).toLocaleString() + " L(約 " + (d.liters * MR_CO2_DIESEL / 1000).toFixed(1) + " t-CO₂)" + (d.litersP ? "・前年度 " + Math.round(d.litersP).toLocaleString() + " L" : "") : "");
    set("supplier", d.vendorsBC.length ? d.vendorsBC.map(v => v.name + " " + v.rank + "ランク" + (v.followup ? "(" + v.followup + ")" : "")).join("\n") : "B・Cランクの取引先なし");
    toast("集めた内容を書き写しました。社長の指示を書いて保存してください");
  }, 400);
}
