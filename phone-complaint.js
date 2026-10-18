/* =====================================================================
   電話依頼 → 苦情(2026/10)：電話依頼アプリの依頼のうち「苦情かもしれないもの」を見つけて、
   ISOの「コミュニケーション・苦情」に1回押すだけで記録できるようにする(書き写しをなくす)。
   ・見つけ方：依頼内容に「苦情・クレーム・ご意見」がある、または内容・メモに 騒音／におい／ほこり／油漏れ／迷惑 などの言葉がある
   ・電話依頼アプリ側は何も変えない(読むだけ)。記録したもの・「苦情ではない」にしたものは二度と出ない
   読む: phoneRequests(今ある依頼)・phoneRequestLog(対応済みの控え)　覚える: isoSettings/phoneComplaint { skip:[id] }
   ===================================================================== */
(function(){
  const STRONG = /苦情|クレーム|ご意見|お叱り|叱られ|怒/;
  const WORDS = /騒音|うるさ|音が|振動|におい|臭|ほこり|埃|粉じん|粉塵|飛散|煙|油|漏れ|汚れ|汚し|迷惑|近所|近隣|通行|路上|道路|ごみ|散乱|危な|事故|ぶつ|壊/;
  const ms = v => !v ? 0 : typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : (Date.parse(v) || 0);
  const ymd = t => { const d = new Date(t); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  /* live・log は Firestore の docs({id, data()}) か {_id, ...} の配列 */
  function norm(arr, isLog){
    return (arr || []).map(d => { const x = typeof d.data === "function" ? d.data() : d, id = d.id || d._id;
      const created = isLog ? (x.createdMs || 0) : (ms(x.createdAt) || ms(x.createdAtText) || x.createdMs || 0);
      const done = isLog || x.status === "対応済み";
      return { id, created, done, responded: isLog ? (x.respondedMs || 0) : ms(x.respondedAt), client: String(x.client || "").trim(),
        contents: Array.isArray(x.contents) ? x.contents : [], free: x.contentsFree || "", resp: [x.responseText, x.doneMemo].filter(Boolean).join("／"), memo: x.memo || x.note || "" }; });
  }
  function find(live, log, regs, skip, days){
    const by = {}; norm(log, true).forEach(r => by[r.id] = r); norm(live, false).forEach(r => by[r.id] = { ...(by[r.id] || {}), ...r, responded: r.responded || (by[r.id] || {}).responded || 0 });
    const used = new Set((regs || []).filter(x => x.reg === "comms" && x.phoneId).map(x => x.phoneId)), sk = new Set(skip || []);
    const from = Date.now() - (days || 120) * 86400000;
    return Object.values(by).filter(r => r.created >= from && !used.has(r.id) && !sk.has(r.id)).map(r => {
      const text = r.contents.join(" ") + " " + r.free + " " + r.resp + " " + r.memo;
      const strong = STRONG.test(text), hit = strong || WORDS.test(r.free + " " + r.memo + " " + r.contents.filter(c => !/引き?取|見積|現場確認|電話/.test(c)).join(" "));
      return hit ? { ...r, strong, date: ymd(r.created), text: (r.contents.join("・") + (r.free ? "　" + r.free : "")).trim() } : null;
    }).filter(Boolean).sort((a, b) => b.created - a.created);
  }
  /* ISOの「コミュニケーション・苦情」の1行にする */
  function toRow(c, kind, by){
    return { reg: "comms", draft: false, date: c.date, dir: "外部から", party: c.client, kind: kind || "苦情", content: "（電話依頼）" + c.text,
      response: c.resp || "", answerDate: c.done && c.responded ? ymd(c.responded) : "", fixNeed: "", status: c.done ? "完了" : "対応中",
      phoneId: c.id, source: "電話依頼", recBy: by || "", recDate: ymd(Date.now()), createdMs: Date.now() };
  }
  window.PhoneComplaint = { find, toRow };
})();
