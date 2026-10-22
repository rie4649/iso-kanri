/* 順守評価は「法的要求事項特定書(EMS-A-05)」の年度の点検で記録する(isoRegisters の reg:"legal" の checks[年度] = { r, d, by, memo })。
   以前「法規制一覧」で記録した分(isoHoreiEval)も、同じ形 { date, evaluator, results:{法令名:"○"/"×"}, src } にそろえて一緒に使う */
function legalEvalsFrom(oldList, regList){
  const list = (oldList || []).map(x => ({ ...x, src: x.src || "old" }));
  const byYear = {};
  (regList || []).filter(r => r.reg === "legal" && !r.draft).forEach(r => {
    Object.entries(r.checks || {}).forEach(([y, c]) => {
      if (!c || !c.r) return;
      const e = byYear[y] = byYear[y] || { date: "", evaluator: "", results: {}, src: "A-05", fy: y };
      if ((c.d || "") > e.date) { e.date = c.d || ""; if (c.by) e.evaluator = c.by; }
      const nm = r.name || ("No." + r.no);
      if (e.results[nm] !== "×") e.results[nm] = /要改善/.test(c.r) ? "×" : c.r === "非該当" ? "－" : "○";
    });
  });
  return list.concat(Object.values(byYear).filter(e => e.date)).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}
/* 法令カード(略称 name・正式名称 official)に当たる評価を探す。A-05 は正式名称で入っていることが多い */
function legalEvalFor(results, law){
  if (!results) return null;
  if (results[law.name]) return results[law.name];
  const keys = [law.official, String(law.name).replace(/[（(].*$/, "")].filter(Boolean);
  const k = Object.keys(results).find(n => { const s = n.replace(/[（(].*$/, ""); return s.length >= 3 && keys.some(w => n.includes(w) || w.includes(s)); });
  return k ? results[k] : null;
}
