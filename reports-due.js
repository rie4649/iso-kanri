/* 届出・報告の期限の計算(届出・報告の期限一覧 reports.html と、ホームの「終わっていないこと・期限」で使う)
   1件の形：{ name, every:何か月ごと(12=毎年・24=2年ごと・6=半年ごと), due:"YYYY-MM-DD"(期限の日。どれか1回分), lead:何日前から知らせるか, applies:"yes"|"check"|"no", done:[{date,...}] }
   ・期限の日は、毎回 every か月ずつずらして考える
   ・その回の期限の「every か月前〜(every の半分)か月後」に「済」があれば、その回は済み */
(function(){
  function addMonths(ymd, m){
    const [y, mo, d] = ymd.split("-").map(Number), t = new Date(y, mo - 1 + m, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(d, last));
    return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
  }
  function doneFor(item, d){
    const M = Number(item.every) || 12, from = addMonths(d, -M), to = addMonths(d, Math.max(1, Math.round(M / 2)));
    return (item.done || []).find(h => h.date > from && h.date <= to) || null;
  }
  /* 次に出す期限 { date, overdue, days, last } 。期限の日が入っていなければ null */
  function nextDue(item, today){
    if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(item.due || "")) return null;
    const M = Number(item.every) || 12; let d = item.due;
    if (d <= today) { while (addMonths(d, M) <= today) d = addMonths(d, M); }   // 今日までで一番近い期限
    for (let i = 0; i < 6; i++) { if (!doneFor(item, d)) break; d = addMonths(d, M); }
    const days = Math.round((new Date(d + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
    const last = (item.done || []).map(h => h.date).sort().pop() || "";
    return { date: d, overdue: d < today, days, last };
  }
  /* 状態 { key, label } ： over=期限切れ / soon=もうすぐ / ok=まだ先 / nodate=期日未設定 / check=当てはまるか確認中 / no=当てはまらない */
  function status(item, today){
    if (item.applies === "no") return { key: "no", label: "当てはまらない" };
    const n = nextDue(item, today);
    if (!n) return { key: item.applies === "check" ? "check" : "nodate", label: item.applies === "check" ? "確認中" : "期日未設定", next: null };
    if (n.overdue) return { key: "over", label: "期限切れ", next: n };
    if (n.days <= (Number(item.lead) || 45)) return { key: "soon", label: "あと" + n.days + "日", next: n };
    return { key: item.applies === "check" ? "check" : "ok", label: item.applies === "check" ? "確認中" : "まだ先", next: n };
  }
  window.ReportDue = { addMonths, nextDue, status, doneFor };
})();
