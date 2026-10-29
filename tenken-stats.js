/* =====================================================================
   点検ラクラク → ISO管理(2026/10)：車両の点検記録を、ISOの証拠として自動で数える
   ・点検ラクラクは別のFirebase(tenken-rakuraku の Realtime Database)。ISO管理は「読むだけ」で、点検ラクラクには何も書かない
   ・読む場所: tenkenData/tenken_年_月_日/{車両の名前} = { morning, morningStaff, afternoon, afternoonStaff,
               dailyDone, dailyCheck:{ badItems:[{no,name}], memo } }
               reports/{id} = { date, vehicle, content, staff, status:"未対応"|"検討中"|"対応済"|"取消", fixDate, fixHow }(不具合報告)
                 2026/10末から：状況は点検ラクラクで押す(未対応・検討中・対応済)。対応済にしても消えずに残る。間違いは「取消」
   ・数えるもの: 日常点検(32項目)をした回数／午前・午後の点検確認の回数／「否」があった件数／点検した日数・車両の数
   ・読み取りを少なくするため、終わった月は端末に覚えておき(過去の点検は点検ラクラクでも直せない)、今月だけ毎回読む
   使い方: const r = await TenkenStats.months(12);   // 直近12か月(今月を含む)
           r = [{ y, m, days, vehicles, daily, am, pm, bad, badList:[{date, vehicle, items, memo}], byVehicle:{名前:回数} }, …]
   ===================================================================== */
(function(){
  const CFG = { apiKey: "AIzaSyA1GSV7KX6qMbIFIFz2ZhPNBVksiGxanKA", authDomain: "tenken-rakuraku.firebaseapp.com",
    databaseURL: "https://tenken-rakuraku-default-rtdb.firebaseio.com", projectId: "tenken-rakuraku",
    storageBucket: "tenken-rakuraku.firebasestorage.app", messagingSenderId: "546571524606", appId: "1:546571524606:web:dbe38f12c4b6ab4ad148af" };
  const URL = "https://rie4649.github.io/tenken-rakuraku/";
  let dbp = null;
  function rtdb(){
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const ready = () => { try { let a; try { a = firebase.app("tenken"); } catch(e){ a = firebase.initializeApp(CFG, "tenken"); } res(a.database()); } catch(e){ rej(e); } };
      if (firebase.database) return ready();
      const s = document.createElement("script");   // Realtime Database の部品を、このページのFirebaseと同じ版で読み込む
      s.src = "https://www.gstatic.com/firebasejs/" + (firebase.SDK_VERSION || "10.12.2") + "/firebase-database-compat.js";
      s.onload = ready; s.onerror = () => rej(new Error("点検ラクラクにつながりません")); document.head.appendChild(s);
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  const pad = n => String(n).padStart(2, "0");
  function summarize(y, m, all){
    const r = { y, m, days: 0, vehicles: 0, daily: 0, am: 0, pm: 0, bad: 0, badList: [], byVehicle: {} }, vs = new Set();
    Object.keys(all || {}).forEach(k => {
      const mm = k.match(/^tenken_(\d+)_(\d+)_(\d+)$/); if (!mm) return;
      const day = all[k] || {}, date = mm[1] + "-" + pad(mm[2]) + "-" + pad(mm[3]); let any = false;
      Object.keys(day).forEach(v => { const x = day[v] || {}; if (typeof x !== "object") return;
        const dly = !!(x.dailyDone || x.dailyCheck);
        if (x.morning) r.am++; if (x.afternoon) r.pm++;
        if (dly) { r.daily++; r.byVehicle[v] = (r.byVehicle[v] || 0) + 1; }
        if (x.morning || x.afternoon || dly) { any = true; vs.add(v); }
        const b = (x.dailyCheck && x.dailyCheck.badItems) || [], bl = Array.isArray(b) ? b : Object.values(b);
        if (bl.length) { r.bad++; r.badList.push({ date, vehicle: v, items: bl.map(i => (i.no ? i.no + " " : "") + (i.name || "")), memo: (x.dailyCheck && x.dailyCheck.memo) || "" }); }
      });
      if (any) r.days++;
    });
    r.vehicles = vs.size; r.vehList = [...vs]; r.badList.sort((a, b) => b.date.localeCompare(a.date));
    return r;
  }
  async function month(y, m){
    const now = new Date(), cur = y === now.getFullYear() && m === now.getMonth() + 1, ck = "isoTenken2_" + y + "_" + m;
    if (!cur) { try { const c = localStorage.getItem(ck); if (c) return JSON.parse(c); } catch(e){} }
    const db = await rtdb(), prefix = "tenken_" + y + "_" + m + "_";
    const snap = await db.ref("tenkenData").orderByKey().startAt(prefix).endAt(prefix + "").once("value");
    const r = summarize(y, m, snap.val() || {});
    if (!cur) { try { localStorage.setItem(ck, JSON.stringify(r)); } catch(e){} }
    return r;
  }
  // 直近nか月(古い順)。endY/endM を渡すとその月まで
  async function months(n, endY, endM){
    const now = new Date(); let y = endY || now.getFullYear(), m = endM || now.getMonth() + 1; const list = [];
    for (let i = 0; i < n; i++) { list.unshift([y, m]); m--; if (m < 1) { m = 12; y--; } }
    return Promise.all(list.map(([a, b]) => month(a, b).catch(e => ({ y: a, m: b, error: e.message, days: 0, vehicles: 0, daily: 0, am: 0, pm: 0, bad: 0, badList: [], byVehicle: {} }))));
  }
  // ISOの年度(8月〜翌7月)
  async function fiscal(fy){ const now = new Date(), endY = fy + 1, last = (now.getFullYear() * 12 + now.getMonth() + 1) < (endY * 12 + 7) ? [now.getFullYear(), now.getMonth() + 1] : [endY, 7];
    const n = (last[0] * 12 + last[1]) - (fy * 12 + 8) + 1; return n > 0 ? months(n, last[0], last[1]) : []; }
  async function openReports(){ const db = await rtdb(); const s = await db.ref("reports").once("value"); const v = s.val() || {};
    return Object.keys(v).map(k => ({ id: k, ...v[k] })).filter(r => r.status !== "対応済" && r.status !== "取消").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); }
  async function allReports(){ const db = await rtdb(); const s = await db.ref("reports").once("value"); const v = s.val() || {};
    return Object.keys(v).map(k => ({ id: k, ...v[k] })); }
  function total(list){ const t = { days: 0, daily: 0, am: 0, pm: 0, bad: 0, byVehicle: {} }, vs = new Set();
    list.forEach(r => { ["days", "daily", "am", "pm", "bad"].forEach(k => t[k] += r[k] || 0); (r.vehList || []).forEach(v => vs.add(v)); Object.keys(r.byVehicle || {}).forEach(v => { vs.add(v); t.byVehicle[v] = (t.byVehicle[v] || 0) + r.byVehicle[v]; }); });
    t.vehicles = vs.size; return t; }
  /* 不具合報告 → ISOの「車両の不具合と修理」(isoRegisters, reg:"vehRepair")に写す。ISO管理では直さない(見るだけ・月ごとにPDF)
     状況(未対応・検討中・対応済)・直した日・どう直したかは、点検ラクラクで押したとおりに写す(対応済 → ISOでは「直した」)
     点検ラクラクで「取消」(間違えて報告)にしたものは、ISOからも消す
     前の点検ラクラクは「対応済」で報告を消していたので、ISOにあって点検ラクラクにないものは「直した」にする(直した日はISOが気づいた日)
     rows: いま読み込んでいる isoRegisters の配列(なければ読む)。reps: allReports() の結果 */
  async function syncRepairs(db, rows, reps){
    if (!Array.isArray(reps)) return 0;
    if (!rows) { const s = await db.collection("isoRegisters").get(); rows = s.docs.map(d => ({ _id: d.id, ...d.data() })); }
    const today = (() => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); })();
    const toY = (s, ms) => { const m = String(s || "").match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/); if (m) return m[1] + "-" + pad(m[2]) + "-" + pad(m[3]); if (ms) { const d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); } return today; };
    const stOf = r => r.status === "対応済" ? "直した" : r.status === "検討中" ? "検討中" : "未対応";
    const mine = rows.filter(x => x.reg === "vehRepair" && x.tkReportId), byId = new Map(mine.map(x => [x.tkReportId, x])), seen = new Set(reps.map(r => r.id));
    const col = db.collection("isoRegisters");
    let n = 0;
    for (const r of reps) {
      const x = byId.get(r.id);
      if (r.status === "取消") { if (x) { await col.doc(x._id || x.id).delete(); n++; } continue; }
      const st = stOf(r), fd = st === "直した" ? toY(r.fixDate, r.statusAt) : "", fh = st === "直した" ? (r.fixHow || "") : "";
      if (!x) { await col.doc("tk_" + r.id).set({ reg: "vehRepair", draft: false, date: toY(r.date, r.createdAt), vehicle: r.vehicle || "", content: r.content || "", reporter: r.staff || "",
          status: st, fixDate: fd, fixHow: fh, fixBy: "", tkReportId: r.id, source: "点検ラクラク", recBy: "点検ラクラクから自動", recDate: today, createdMs: Date.now() }); n++; continue; }
      if ((x.status || "未対応") !== st || (x.fixDate || "") !== fd || (st === "直した" && (x.fixHow || "") !== fh)) {
        await col.doc(x._id || x.id).update({ status: st, fixDate: fd, fixHow: st === "直した" ? fh : "", autoFixed: false, recDate: today }); n++; }
    }
    for (const x of mine) { if (!seen.has(x.tkReportId) && x.status !== "直した") {
      await col.doc(x._id || x.id).update({ status: "直した", fixDate: x.fixDate || today, autoFixed: true, recDate: today }); n++; } }
    return n;
  }
  window.TenkenStats = { syncRepairs, allReports, URL, month, months, fiscal, openReports, total, summarize };
})();
