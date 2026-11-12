/* =====================================================================
   毎月の記録の年間まとめ(2026/11/12)：trends.html と show.html(環境への取り組み)の両方で使う計算
   使い方: await TrendsCore.loadAll();  TrendsCore.analyze(TrendsCore.KINDS[0], "2026-2027")
   ===================================================================== */
window.TrendsCore = (function(){
const fdb = () => firebase.firestore();
const esc = t => String(t ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const pad2 = n => String(n).padStart(2, "0");
const fyOfYm = ym => { const [y, m] = ym.split("-").map(Number); return m >= 8 ? y+"-"+(y+1) : (y-1)+"-"+y; };
const monthsOf = fy => { const y = Number(fy.split("-")[0]); return [8,9,10,11,12,1,2,3,4,5,6,7].map(m => (m >= 8 ? y : y+1)+"-"+pad2(m)); };
const prevFy = fy => { const [a, b] = fy.split("-").map(Number); return (a-1)+"-"+(b-1); };
const now = new Date(), curYm = now.getFullYear()+"-"+pad2(now.getMonth()+1), curFy = fyOfYm(curYm);
const fmt = (v, d) => v == null || isNaN(v) ? "" : Number(v).toLocaleString(undefined, { maximumFractionDigits: d ?? 1 });
const D = {};

/* ===== 記録の種類ごとの決まり =====
   rows: 12か月の表の行 [見出し, 月→数, 小数, 年度の出し方("sum"|"avg"|"max"|"last")]
   main: 年度別の推移でくらべる数 { label, get(月の配列)→数, good:"down"|"up", unit }
   cols: 年度別の推移の表の列 */
const KINDS = [
  { key:"clean", icon:"🧹", name:"クリーン度チェック", color:"#0f766e", sec:"clean", freq:"月2回",
    load: async () => (await fdb().collection("cleanlinessChecks").get()).docs.map(d => d.data()),
    month: (L, m) => { const x = L.filter(r => String(r.date || "").startsWith(m)); if (!x.length) return null;
      const pcts = x.map(r => r.avgPct != null ? r.avgPct : r.avgScore != null ? r.avgScore * 20 : null).filter(v => v != null);
      const zones = {}; x.forEach(r => (r.zones || []).forEach(z => { const p = z.pct != null ? z.pct : z.score != null ? z.score * 20 : null; if (p != null) (zones[z.name] = zones[z.name] || []).push(p); }));
      return { n:x.length, avg: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null, zones }; },
    rows: [["チェックの回数", v => v.n, 0, "sum"], ["平均（%）", v => v.avg, 1, "avg"]],
    main: { how:"avg", label:"平均（%）", get: M => avgOf(M.map(v => v && v.avg)), good:"up", unit:"%", d:1 },
    extra: M => { const z = {}; M.forEach(v => v && Object.entries(v.zones).forEach(([k, a]) => (z[k] = z[k] || []).push(...a)));
      const L = Object.entries(z).map(([k, a]) => [k, a.reduce((p, q) => p + q, 0) / a.length]).sort((a, b) => a[1] - b[1]);
      return L.length ? "ゾーン別の平均：低い順に " + L.slice(0, 3).map(([k, v]) => k+" "+v.toFixed(1)+"%").join("・") : ""; } },
  { key:"safety", icon:"🦺", name:"安全衛生パトロール", color:"#b45309", sec:"safety", freq:"月1回",
    load: async () => (await fdb().collection("safetyPatrols").get()).docs.map(d => d.data()),
    month: (L, m) => { const x = L.filter(r => String(r.date || "").startsWith(m)); if (!x.length) return null;
      const bad = {}; x.forEach(r => (r.items || []).forEach(it => { if (!it.ok) bad[it.name] = (bad[it.name] || 0) + 1; }));
      return { n:x.length, ng:Object.values(bad).reduce((a, b) => a + b, 0), bad }; },
    rows: [["実施の回数", v => v.n, 0, "sum"], ["不備の件数", v => v.ng, 0, "sum"]],
    main: { label:"不備の件数", get: M => sumOf(M.map(v => v && v.ng)), good:"down", unit:"件", d:0 },
    extra: M => { const b = {}; M.forEach(v => v && Object.entries(v.bad).forEach(([k, n]) => b[k] = (b[k] || 0) + n));
      const L = Object.entries(b).sort((a, c) => c[1] - a[1]); return L.length ? "不備が多かった項目：" + L.slice(0, 3).map(([k, n]) => k+" "+n+"件").join("・") : "不備はありませんでした"; } },
  { key:"diesel", icon:"⛽", name:"軽油使用量・CO₂", color:"#475569", sec:"diesel", freq:"毎月",
    load: async () => (await fdb().collection("dieselRecords").get()).docs.map(d => d.data()),
    month: (L, m) => { const x = L.filter(r => r.yearMonth === m); if (!x.length) return null; const l = x.reduce((a, r) => a + (Number(r.totalLiters) || 0), 0); return { l, co2: l * 2.58 / 1000, dup: x.length }; },
    rows: [["使用量（L）", v => v.l, 0, "sum"], ["CO₂（トン）", v => v.co2, 2, "sum"]],
    main: { label:"使用量（L）", get: M => sumOf(M.map(v => v && v.l)), good:"down", unit:"L", d:0 },
    extra: M => { const c = sumOf(M.map(v => v && v.co2)); return c != null ? "CO₂ "+c.toFixed(2)+" トン（係数 2.58kg-CO₂/L）" : ""; } },
  { key:"noise", icon:"🔊", name:"騒音チェック", color:"#7c3aed", sec:"noiseCheck", freq:"月1回",
    load: async () => (await fdb().collection("noiseChecks").get()).docs.map(d => d.data()),
    month: (L, m) => { const x = L.filter(r => String(r.date || "").startsWith(m) && r.db != null); if (!x.length) return null;
      const v = x.map(r => Number(r.db)); return { n:x.length, avg: v.reduce((a, b) => a + b, 0) / v.length, max: Math.max(...v), ng: v.filter(d => d > 70).length }; },
    rows: [["測った回数", v => v.n, 0, "sum"], ["平均（dB）", v => v.avg, 1, "avg"], ["いちばん大きい（dB）", v => v.max, 1, "max"], ["△✕（70dB超）", v => v.ng, 0, "sum"]],
    main: { how:"avg", label:"平均（dB）", get: M => avgOf(M.map(v => v && v.avg)), good:"down", unit:"dB", d:1 },
    extra: M => { const n = sumOf(M.map(v => v && v.ng)); return n ? "70dBをこえた（△✕）のは "+n+" 回" : "70dBをこえた月はありません（すべて○）"; } },
  { key:"comp", icon:"🛠", name:"圧縮機定期点検", color:"#1d4ed8", sec:"comp", freq:"月1回",
    load: async () => (await fdb().collection("compressorInspections").get()).docs.map(d => d.data()),
    month: (L, m) => { const x = L.filter(r => String(r.date || "").startsWith(m)); if (!x.length) return null;
      const bad = {}; x.forEach(r => (r.items || []).forEach(it => { if (!it.ok) bad[it.name] = (bad[it.name] || 0) + 1; }));
      return { n:x.length, ng:Object.values(bad).reduce((a, b) => a + b, 0), bad }; },
    rows: [["点検の回数", v => v.n, 0, "sum"], ["要修理の件数", v => v.ng, 0, "sum"]],
    main: { label:"要修理の件数", get: M => sumOf(M.map(v => v && v.ng)), good:"down", unit:"件", d:0 },
    extra: M => { const b = {}; M.forEach(v => v && Object.entries(v.bad).forEach(([k, n]) => b[k] = (b[k] || 0) + n));
      const L = Object.entries(b).sort((a, c) => c[1] - a[1]); return L.length ? "要修理が多かった項目：" + L.slice(0, 3).map(([k, n]) => k+" "+n+"件").join("・") : "要修理はありませんでした"; } },
  { key:"veh", icon:"🔧", name:"車両の不具合と修理", color:"#be123c", sec:"plan:vehRepair", freq:"月1回まとめ",
    load: async () => (await fdb().collection("isoRegisters").where("reg", "==", "vehRepair").get()).docs.map(d => d.data()).filter(r => r.status !== "取消" && !r.draft),
    month: (L, m) => { const x = L.filter(r => String(r.date || "").startsWith(m)); return { n:x.length, fixed:x.filter(r => r.status === "直した" || r.status === "対応済").length, veh: x.map(r => r.vehicle || "") }; },
    always: true,
    rows: [["報告された件数", v => v.n, 0, "sum"], ["そのうち直した", v => v.fixed, 0, "sum"]],
    main: { label:"報告された件数", get: M => sumOf(M.map(v => v && v.n)), good:"down", unit:"件", d:0 },
    extra: M => { const c = {}; M.forEach(v => v && v.veh.forEach(k => { if (k) c[k] = (c[k] || 0) + 1; }));
      const L = Object.entries(c).sort((a, b) => b[1] - a[1]); return L.length ? "報告が多かった車両：" + L.slice(0, 3).map(([k, n]) => k+" "+n+"件").join("・") : "不具合の報告はありませんでした"; } },
  { key:"freon", icon:"❄️", name:"フロン簡易点検", color:"#0891b2", sec:"freon", freq:"3か月ごと",
    load: async () => { const [r, e] = await Promise.all([fdb().collection("freonRecords").get(), fdb().collection("freonEquipments").get()]);
      const eq = {}; e.docs.forEach(d => { const x = d.data(); eq[x.name] = x; }); return r.docs.map(d => { const x = d.data(); return { ...x, co2: ((x.leakedG || 0) / 1000) * ((eq[x.equipment] || {}).gwp || 0) / 1000 }; }); },
    month: (L, m) => { const x = L.filter(r => String(r.date || "").startsWith(m)); if (!x.length) return null;
      return { n:x.length, ng:x.filter(r => r.result === "abnormal").length, leak:x.reduce((a, r) => a + (r.leakedG || 0), 0), co2:x.reduce((a, r) => a + r.co2, 0) }; },
    quarterly: true,
    rows: [["点検した台数", v => v.n, 0, "sum"], ["異常あり", v => v.ng, 0, "sum"], ["漏えい量（g）", v => v.leak, 0, "sum"]],
    main: { label:"異常あり", get: M => sumOf(M.map(v => v && v.ng)), good:"down", unit:"件", d:0 },
    extra: M => { const c = sumOf(M.map(v => v && v.co2)); return "漏えいによるCO₂換算 "+(c || 0).toFixed(4)+" トン"; } },
  { key:"life", icon:"💡", name:"ライフライン（ガス・電気・水道）", color:"#854d0e", sec:"lifeline", freq:"毎月",
    load: async () => { const [r, t] = await Promise.all([fdb().collection("lifelineRecords").get(), fdb().collection("lifelineTypes").get()]);
      LIFE_T = t.docs.map(d => d.data()); return r.docs.map(d => d.data()); },
    month: (L, m) => { const x = L.filter(r => r.yearMonth === m); if (!x.some(r => (r.types || []).length)) return null; const o = { gas:null, elec:null, water:null, co2:0 };
      x.forEach(r => (r.types || []).forEach(t => { const k = /ガス/.test(t.name) ? "gas" : /電/.test(t.name) ? "elec" : /水/.test(t.name) ? "water" : null; if (!k) return;
        o[k] = (o[k] || 0) + (Number(t.usage) || 0); const f = (LIFE_T.find(z => z.name === t.name) || {}).co2Factor ?? ({ gas:2.29, elec:0.441, water:0 })[k]; o.co2 += (Number(t.usage) || 0) * f / 1000; })); return o; },
    rows: [["ガス（m³）", v => v.gas, 1, "sum"], ["電気（kWh）", v => v.elec, 0, "sum"], ["水道（m³）", v => v.water, 1, "sum"], ["CO₂（トン）", v => v.co2, 2, "sum"]],
    main: { label:"電気（kWh）", get: M => sumOf(M.map(v => v && v.elec)), good:"down", unit:"kWh", d:0 },
    extra: () => "ガス・水道もふくめた推移・削減目標は、ライフラインの「📅 年間の一覧」にあります" }
];
let LIFE_T = [];
function sumOf(a){ const v = a.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((p, q) => p + q, 0) : null; }
function avgOf(a){ const v = a.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; }

function allFys(){
  const s = new Set([curFy]);
  KINDS.forEach(k => (D[k.key] || []).forEach(r => { const ym = r.yearMonth || String(r.date || "").slice(0, 7); if (/^\d{4}-\d{2}$/.test(ym)) s.add(fyOfYm(ym)); }));
  return [...s].sort();
}
function monthVals(k, f){ return monthsOf(f).map(m => m > curYm ? undefined : k.month(D[k.key] || [], m)); }   // undefined=これから null=未入力
function arrow(a, b, good){
  if (a == null || b == null || !b) return '';
  const p = (a - b) / Math.abs(b) * 100; if (Math.abs(p) < 1) return ' <span class="eq">⇔</span>';
  const better = good === "down" ? p < 0 : p > 0;
  return ' <span class="'+(better ? "dn" : "up")+'">'+(p > 0 ? "↑" : "↓")+Math.abs(p).toFixed(0)+'%</span>';
}
/* 1つの記録の種類について、年度別の推移と傾向(自動の文)を出す */
function analyze(k, fy){
  const fys = allFys(), M = monthVals(k, fy);
  // 合計でくらべる記録は、12か月そろっていない年度(記録を始めた年など)はくらべない(少なく見えてしまうため)
  const rowsY = fys.map(f => { const MV = monthVals(k, f), n = MV.filter(v => v != null).length, v = k.main.get(MV); return { f, n, v, MV, ok: k.main.how === "avg" || k.quarterly || k.always || n >= 12 }; });
  rowsY.forEach((r, i) => { const p = rowsY[i-1]; r.prev = null; r.cmpText = ""; r.arrowHtml = "";
    if (r.f === curFy && p){ const pm = k.main.get(p.MV.map((v, j) => r.MV[j] != null ? v : null)); if (pm != null && r.v != null){ r.prev = pm; r.same = true; r.arrowHtml = arrow(r.v, pm, k.main.good); } }
    else if (r.ok && p && p.ok && p.v != null && r.v != null){ r.prev = p.v; r.arrowHtml = arrow(r.v, p.v, k.main.good); } });
  const full = rowsY.filter(r => r.f !== curFy && r.v != null && r.ok), autos = [];
  if (full.length >= 2){ const a = full[full.length-1], b = full[full.length-2], p = (a.v - b.v) / Math.abs(b.v || 1) * 100, better = k.main.good === "down" ? p < 0 : p > 0;
    autos.push(k.main.label+"：直近の "+a.f+" は "+fmt(a.v, k.main.d)+k.main.unit+"。前の年度より "+(p >= 0 ? "+" : "")+p.toFixed(1)+"%"+(Math.abs(p) < 1 ? "（ほぼ同じ）" : better ? "（良くなった）" : "（悪くなった）"));
    const best = full.reduce((x, r) => (k.main.good === "down" ? r.v < x.v : r.v > x.v) ? r : x, full[0]); autos.push("いちばん良かった年度："+best.f+"（"+fmt(best.v, k.main.d)+k.main.unit+"）"); }
  else if (full.length === 1) autos.push(k.main.label+"："+full[0].f+" は "+fmt(full[0].v, k.main.d)+k.main.unit+"（くらべる前の年度の記録がまだありません）");
  const cur = rowsY.find(r => r.f === fy); if (cur){ const ex = k.extra(cur.MV.filter(Boolean)); if (ex) autos.push(fy+"年度："+ex); }
  const miss = fy <= curFy && !k.quarterly ? M.filter(v => v === null).length : 0;
  if (miss && !k.always) autos.push("⚠ "+fy+"年度で記録が入っていない月が "+miss+" か月あります（"+k.freq+"）");
  return { fys, M, rowsY, autos };
}
let loadP = null;
function loadAll(){ return loadP || (loadP = Promise.all(KINDS.map(k => k.load().catch(e => { console.error(k.key, e); return []; }))).then(res => { KINDS.forEach((k, i) => D[k.key] = res[i]); return D; })); }

return { esc, pad2, fyOfYm, monthsOf, prevFy, curYm, curFy, fmt, KINDS, sumOf, avgOf, allFys, monthVals, arrow, analyze, loadAll, D };
})();
