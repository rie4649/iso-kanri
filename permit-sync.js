/* =====================================================================
   許可の期限を1か所で管理する(2026/10)
   ・許可の有効期限の「正」は 業務管理の許可証管理(kyokaShoumei)。ISO管理は読むだけ(書き込まない)
   ・許可証PDF(マスタ管理の「📜許可証」で登録 → isoKyokaDocs)と、許可ごとに組み合わせる
     組み合わせ方：マスタ管理が付ける名前「自治体 種類 (許可番号)」と同じ名前、または許可番号が名前に入っているもの
   ・PDFの日付と業務管理の期限が違うときは「どちらを直すか」を知らせる
   使い方: const r = await PermitSync.load(db);  r.rows = [{label, area, kind, num, exp, left, pdf, pdfDate, issue}, …]
   ===================================================================== */
(function(){
  const WARN_DAYS = 120;   // 期限の何日前から「更新の準備」を知らせるか(更新の申請は期限の2〜3か月前から)
  const norm = s => String(s || "").normalize("NFKC").replace(/株式会社|\(株\)|㈱/g, "株").replace(/[\s　()（）・]/g, "").replace(/測り|計り|量り|秤/g, "はかり").toLowerCase();
  const pad = n => String(n).padStart(2, "0");
  // いろいろな形の日付を "YYYY-MM-DD" に(Timestamp・数字・2026/3/31・2026年3月31日・R8.3.31 など)
  function toYmd(v){
    if (!v) return "";
    if (typeof v.toDate === "function") v = v.toDate();
    if (v instanceof Date) return isNaN(v) ? "" : v.getFullYear() + "-" + pad(v.getMonth() + 1) + "-" + pad(v.getDate());
    if (typeof v === "number") return v > 1e11 ? toYmd(new Date(v)) : "";
    const s = String(v).normalize("NFKC").trim();
    let m = s.match(/^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/); if (m) return m[1] + "-" + pad(m[2]) + "-" + pad(m[3]);
    m = s.match(/^(令和|R)\s*(\d{1,2}|元)[\/.年](\d{1,2})[\/.月](\d{1,2})/i); if (m) return (2018 + (m[2] === "元" ? 1 : Number(m[2]))) + "-" + pad(m[3]) + "-" + pad(m[4]);
    m = s.match(/^(平成|H)\s*(\d{1,2})[\/.年](\d{1,2})[\/.月](\d{1,2})/i); if (m) return (1988 + Number(m[2])) + "-" + pad(m[3]) + "-" + pad(m[4]);
    return "";
  }
  // 業務管理の許可証1件から「有効期限」を探す(項目名が変わっても読めるように)
  const GOOD = /exp|limit|until|valid|deadline|end|kigen|期限|満了|有効/i, BAD = /issue|交付|start|begin|created|updated|登録|取得/i;
  function findExp(p){
    const cands = Object.keys(p).map(k => [k, toYmd(p[k])]).filter(x => x[1]);
    const good = cands.filter(([k]) => GOOD.test(k) && !BAD.test(k));
    const pick = (good.length ? good : cands.filter(([k]) => !BAD.test(k))).sort((a, b) => b[1].localeCompare(a[1]))[0];
    return pick ? { key: pick[0], date: pick[1] } : { key: "", date: "" };
  }
  const daysLeft = ymd => { if (!ymd) return null; const [y, m, d] = ymd.split("-").map(Number), t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(y, m - 1, d) - t) / 86400000); };
  const labelOf = p => [p.area, p.wasteType, p.permitNumber ? "(" + p.permitNumber + ")" : ""].filter(Boolean).join(" ");
  function build(permits, docs){
    const groups = {};
    docs.forEach(d => { const k = d.type || "(名前なし)"; (groups[k] = groups[k] || []).push(d); });
    Object.values(groups).forEach(l => l.sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))));
    const used = new Set(), rows = [];
    permits.slice().sort((a, b) => ((a.order ?? 999) - (b.order ?? 999)) || String(a.area || "").localeCompare(String(b.area || ""), "ja")).forEach(p => {
      const label = labelOf(p) || p.name || "(名前なし)", nl = norm(label), nn = norm(p.permitNumber);
      const gk = Object.keys(groups).find(k => !used.has(k) && norm(k) === nl) || (nn.length >= 4 ? Object.keys(groups).find(k => !used.has(k) && norm(k).includes(nn)) : null)
        || Object.keys(groups).find(k => !used.has(k) && norm(k).length >= 4 && nl.includes(norm(k)));   // 例：PDF「大型測り検査」→ 業務管理「長野県 大型はかり検査」
      if (gk) used.add(gk);
      const l = gk ? groups[gk] : [], pdf = l[0] || null, pdfExp = l.find(d => (d.dateKind || "許可期限") === "許可期限");
      const e = findExp(p), exp = e.date, pdfDate = pdfExp ? toYmd(pdfExp.date) : "";
      let issue = "";
      if (!exp) issue = "noexp";
      else if (!pdf) issue = "nopdf";
      else if (pdfDate && pdfDate < exp) issue = "oldpdf";       // 業務管理のほうが新しい → 新しい許可証PDFをまだ入れていない
      else if (pdfDate && pdfDate > exp) issue = "oldexp";       // PDFのほうが新しい → 業務管理の期限を直し忘れ
      rows.push({ label, area: p.area || "", kind: p.wasteType || "", num: p.permitNumber || "", exp, expKey: e.key, left: daysLeft(exp), pdf, pdfDate, pdfAll: l, group: gk || "", issue, src: "gyomu" });
    });
    // 業務管理にない許可証PDF(ISOだけにあるもの)
    Object.keys(groups).filter(k => !used.has(k)).forEach(k => { const l = groups[k], pe = l.find(d => (d.dateKind || "許可期限") === "許可期限"), pd = pe ? toYmd(pe.date) : "";
      rows.push({ label: k, area: "", kind: "", num: "", exp: pd, expKey: "", left: daysLeft(pd), pdf: l[0], pdfDate: pd, pdfAll: l, group: k, issue: "nogyomu", src: "pdf" }); });
    return rows;
  }
  async function load(db){
    const [ps, ds] = await Promise.all([db.collection("kyokaShoumei").get().catch(() => null), db.collection("isoKyokaDocs").get().catch(() => null)]);
    const permits = ps ? ps.docs.map(d => ({ id: d.id, ...d.data() })) : [], docs = ds ? ds.docs.map(d => ({ id: d.id, ...d.data() })) : [];
    return { ok: !!ps, permits, docs, rows: build(permits, docs) };
  }
  // 状態の文字と色(ok/wa/ng/gr)
  function state(r){
    if (r.left == null) return ["期限なし", "gr"];
    if (r.left < 0) return ["期限切れ", "ng"];
    if (r.left <= WARN_DAYS) return ["あと" + r.left + "日（更新の準備）", "wa"];
    return ["有効", "ok"];
  }
  const ISSUE = {
    noexp: "",   // 古物商・計量証明事業など有効期限のない許可もあるので、知らせない
    nopdf: "許可証のPDFがまだありません → マスタ管理の「📜許可証」で入れてください",
    oldpdf: "許可は更新済み（業務管理の期限が新しい）なのに、許可証PDFが古いままです → 新しい許可証PDFをマスタ管理の「📜許可証」で入れてください",
    oldexp: "新しい許可証PDFは入っているのに、業務管理の有効期限が古いままです → 業務管理の許可証管理で有効期限を直してください",
    nogyomu: "業務管理の許可証管理にない許可です（期限はPDFの日付で見ています）"
  };
  window.PermitSync = { WARN_DAYS, load, build, state, ISSUE, toYmd, daysLeft, findExp, labelOf };
})();
