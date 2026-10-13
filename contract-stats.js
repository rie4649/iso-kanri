/* =====================================================================
   契約件数(共通マスタ管理の「契約」master_contracts から自動で集計。会社名は出さない)
   ・全体：会社◯社・契約◯件、品目(シート)ごとの件数、処分先ごとの契約件数と会社数
   ・最終更新：マスター管理で保存・削除したとき master_meta/contracts に記録される日時
   ・件数が変わったら isoContractStats に「その日の件数」を自動で残す(件数の推移)
   使う側で db(firestore)・esc() を用意しておくこと
   ===================================================================== */
const ContractStats = (function(){
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
  const fdt = d => d ? d.getFullYear()+"/"+(d.getMonth()+1)+"/"+d.getDate()+" "+pad(d.getHours())+":"+pad(d.getMinutes()) : "";
  const fdj = s => { const m = String(s||"").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Number(m[1])+"/"+Number(m[2])+"/"+Number(m[3]) : s; };
  const toDate = v => !v ? null : typeof v.toDate === "function" ? v.toDate() : typeof v === "number" ? new Date(v) : null;
  const dispOf = c => String(c.disposer || "").trim() || String(c.route || "").split("／")[0].trim() || "(処分先なし)";
  let cache = null;

  async function load(){
    if (cache) return cache;
    const [cs, meta, hist] = await Promise.all([db.collection("master_contracts").get(), db.collection("master_meta").doc("contracts").get().catch(() => null), db.collection("isoContractStats").get().catch(() => ({ docs:[] }))]);
    const list = cs.docs.map(d => d.data()).filter(c => !c.isMemo);
    const companies = new Set(list.map(c => c.company)).size;
    const bySheet = {}; list.forEach(c => { const k = c.sheet || "(シートなし)"; bySheet[k] = (bySheet[k] || 0) + 1; });
    const byDisp = {}; list.forEach(c => { const k = dispOf(c); (byDisp[k] = byDisp[k] || { n:0, co:new Set() }).n++; byDisp[k].co.add(c.company); });
    // 最終更新: マスター管理の記録、なければ契約の更新日時のいちばん新しいもの
    let last = meta && meta.exists ? toDate(meta.data().updatedAt) || toDate(meta.data().updatedMs) : null;
    cs.docs.forEach(d => { const t = toDate(d.data().updatedAt); if (t && (!last || t > last)) last = t; });
    const history = hist.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => String(b.date||"").localeCompare(String(a.date||"")) || (b.createdMs||0) - (a.createdMs||0));
    cache = { companies, contracts:list.length, bySheet, byDisp: Object.keys(byDisp).map(k => ({ name:k, n:byDisp[k].n, co:byDisp[k].co.size })).sort((a,b) => b.n - a.n || a.name.localeCompare(b.name, "ja")),
      last, history };
    await snapshot(cache);
    return cache;
  }
  /* 件数が前回の記録と違えば、今日の件数を残す(同じ日に何度変わっても、その日は最後の件数1件にまとめる) */
  async function snapshot(st){
    if (!st.contracts) return;
    const prev = st.history[0];
    const sig = st.companies+"/"+st.contracts+"/"+JSON.stringify(st.bySheet);
    if (prev && prev.sig === sig) return;
    const today = ymd(st.last && st.last <= new Date() ? st.last : new Date());
    const data = { date: today, companies: st.companies, contracts: st.contracts, bySheet: st.bySheet, sig, createdMs: Date.now() };
    try {
      if (prev && prev.date === today){ await db.collection("isoContractStats").doc(prev.id).set(data); Object.assign(prev, data); }
      else { const ref = await db.collection("isoContractStats").add(data); st.history.unshift({ id:ref.id, ...data }); }
    } catch(e){ console.error(e); }
  }
  /* 画面に出すHTML(cls: 表のクラス名) */
  function html(st, opt){
    opt = opt || {};
    const tcls = opt.tableClass || "t";
    if (!st.contracts) return '<div class="note">マスター管理に契約がまだありません。</div>';
    const sheets = Object.keys(st.bySheet).sort((a,b) => a.localeCompare(b, "ja"));
    const prev = st.history[1];
    const diff = (a, b) => b == null ? "" : a === b ? "" : '<small style="color:'+(a > b ? "#15803d" : "#b91c1c")+';margin-left:4px;">('+(a > b ? "+" : "")+(a - b)+')</small>';
    return '<div class="kpis">'+
        '<div class="kpi"><div class="k">契約している会社</div><div class="v">'+st.companies+'<small>社</small>'+diff(st.companies, prev && prev.companies)+'</div></div>'+
        '<div class="kpi"><div class="k">契約の件数</div><div class="v">'+st.contracts+'<small>件</small>'+diff(st.contracts, prev && prev.contracts)+'</div></div>'+
        '<div class="kpi"><div class="k">マスター管理の最終更新</div><div class="v" style="font-size:20px;">'+esc(fdt(st.last) || "記録なし")+'</div></div></div>'+
      '<div style="font-weight:bold;margin:10px 0 4px;">品目ごとの契約件数</div><div style="line-height:1.9;">'+sheets.map(k => '<span style="display:inline-block;border:1px solid #cbd5e1;border-radius:6px;padding:1px 8px;margin:0 6px 4px 0;background:#fff;">'+esc(k)+' <b>'+st.bySheet[k]+'</b>件</span>').join("")+'</div>'+
      '<div style="font-weight:bold;margin:12px 0 4px;">処分先ごとの契約件数</div><div style="overflow-x:auto;"><table class="'+tcls+'"><tr><th>処分先</th><th>契約の件数</th><th>契約している会社の数</th></tr>'+
        st.byDisp.map(d => '<tr><td>'+esc(d.name)+'</td><td style="text-align:right;">'+d.n+' 件</td><td style="text-align:right;">'+d.co+' 社</td></tr>').join("")+'</table></div>'+
      (st.history.length ? '<details style="margin-top:10px;"><summary style="cursor:pointer;font-weight:bold;">件数の推移('+st.history.length+'回)</summary><div style="overflow-x:auto;"><table class="'+tcls+'" style="margin-top:6px;"><tr><th>日付</th><th>会社</th><th>契約</th></tr>'+
        st.history.map(h => '<tr><td>'+esc(fdj(h.date))+'</td><td style="text-align:right;">'+h.companies+' 社</td><td style="text-align:right;">'+h.contracts+' 件</td></tr>').join("")+'</table></div></details>' : '')+
      '<div class="note" style="margin-top:6px;">共通マスタ管理の「契約」から自動で集計しています(会社名は出していません)。件数が変わると、その日の件数が「件数の推移」に自動で残ります。</div>';
  }
  return { load, html, reset(){ cache = null; } };
})();
