/* =====================================================================
   記録者(管理者)と記録日を、すべての記録に残すための共通部品(2026/10)
   使い方: RecBy.install(db, [ { modal:"#xxxModalOverlay", before:".modal-actions", cols:["コレクション名"], idInput:"#xxxEditId" }, … ])
     modal    … 入力画面(モーダル)のいちばん外側
     before   … この部品の前に「記録者」欄を入れる(ボタンの並びなど)
     cols     … この画面で保存するコレクション
     idInput  … 直すときの記録ID(hidden)。id() 関数でも可
     useInput … 画面にもともと「確認者」などの欄があるときは、その欄を使う(新しい欄は作らない)
   しくみ: 入力画面が開いている間に、そのコレクションへ保存(add/set/update)すると
           recBy(記録者)・recDate(記録日 YYYY-MM-DD)・recAt(時刻) を自動で足す。記録者が空なら保存しない
   記録者の名前は、この端末に覚えておき、次から自動で入る(localStorage: isoRecBy)
   ===================================================================== */
(function(){
  const LS = "isoRecBy";
  const today = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const fd = s => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? Number(m[1])+"/"+Number(m[2])+"/"+Number(m[3]) : ""; };
  const getName = () => { try { return localStorage.getItem(LS) || ""; } catch(e){ return ""; } };
  const setName = v => { try { localStorage.setItem(LS, v); } catch(e){} };
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  let cfgs = [];
  const cache = {};   // 記録ID → { recBy, recDate }(画面がもともと読んでいるデータから集める。余分な読み込みはしない)
  let tagTimer = null;
  function scheduleTags(){ clearTimeout(tagTimer); tagTimer = setTimeout(applyTags, 150); }
  // 一覧の「✏️ 直す」(openEditXxx('ID') など)の横に「記録 10/15 理絵」を出す
  function applyTags(){
    if (window.RECBY_NOTAG) return;
    document.querySelectorAll('[onclick^="openEdit"],[onclick^="openTrainingModal"],[onclick^="openManualModal"]').forEach(el => {
      const m = (el.getAttribute("onclick") || "").match(/\('([^']+)'/); if (!m) return;
      const d = cache[m[1]]; if (!d || (!d.recBy && !d.recDate)) return;
      const host = el.tagName === "BUTTON" || el.tagName === "A" ? el.parentNode : el;
      if (!host || host.querySelector(":scope > .recby-tag")) return;
      host.insertAdjacentHTML("beforeend", " " + tag(d));
    });
  }
  function grab(snap){ try { (snap.docs || []).forEach(d => { const x = d.data() || {}; if (x.recBy || x.recDate) cache[d.id] = { recBy:x.recBy, recDate:x.recDate }; }); scheduleTags(); } catch(e){} }
  function patchQuery(q){
    if (!q || q.__rq) return q; q.__rq = true;
    if (q.onSnapshot){ const oS = q.onSnapshot.bind(q);
      q.onSnapshot = (...a) => { const i = a.findIndex(x => typeof x === "function");
        if (i >= 0){ const cb = a[i]; a[i] = snap => { grab(snap); return cb(snap); }; }
        else if (a[0] && typeof a[0].next === "function"){ const o = a[0], nx = o.next.bind(o); a[0] = Object.assign({}, o, { next: snap => { grab(snap); return nx(snap); } }); }
        return oS(...a); }; }
    ["orderBy","where","limit"].forEach(m => { if (typeof q[m] === "function"){ const o = q[m].bind(q); q[m] = (...a) => patchQuery(o(...a)); } });
    return q;
  }

  function inputOf(c){ return c.useInput ? document.querySelector(c.useInput) : (c._root && c._root.querySelector(".recby-in")); }
  function activeFor(col){ return cfgs.find(c => c.cols.includes(col) && visible(c._root)); }
  function stamp(col, data){
    const c = activeFor(col); if (!c || !data || typeof data !== "object") return { data };
    const el = inputOf(c), v = el ? el.value.trim() : "";
    if (!v && c.useInput) return { data };   // もともとの「確認者」欄を使う画面は、空でも止めない(自動保存のため)
    if (!v){ if (el) { el.focus(); el.style.borderColor = "#dc2626"; } return { err: new Error("記録者（管理者）の名前を入れてください") }; }
    setName(v);
    return { data: Object.assign({}, data, { recBy:v, recDate:today(), recAt:Date.now() }) };
  }
  function patchDoc(col, d){
    if (!d || d.__recby) return d; d.__recby = true;
    const oSet = d.set.bind(d), oUpd = d.update.bind(d);
    d.set = (data, opt) => { const r = stamp(col, data); return r.err ? Promise.reject(r.err) : (opt ? oSet(r.data, opt) : oSet(r.data)); };
    d.update = (data, ...rest) => { if (typeof data !== "object" || rest.length) return oUpd(data, ...rest); const r = stamp(col, data); return r.err ? Promise.reject(r.err) : oUpd(r.data); };
    return d;
  }
  function wrapDb(db){
    if (db.__recby) return; db.__recby = true;
    const oCol = db.collection.bind(db);
    db.collection = (name, ...rest) => {
      const ref = oCol(name, ...rest);
      if (!cfgs.some(c => c.cols.includes(name)) || ref.__recby) return ref;
      ref.__recby = true;
      const oAdd = ref.add.bind(ref), oDoc = ref.doc.bind(ref);
      ref.add = data => { const r = stamp(name, data); return r.err ? Promise.reject(r.err) : oAdd(r.data); };
      ref.doc = (...a) => patchDoc(name, oDoc(...a));
      return patchQuery(ref);
    };
  }
  // 入力画面が開いたとき: 直すときはその記録の記録者・記録日を出す。新しいときは前回の名前を入れる
  async function onOpen(c, db){
    const el = inputOf(c), last = c._root.querySelector(".recby-last");
    const id = typeof c.id === "function" ? c.id() : (c.idInput ? ((document.querySelector(c.idInput) || {}).value || "") : "");
    if (el && !c.useInput) { el.style.borderColor = ""; el.value = getName(); }
    if (el && c.useInput && !el.value) el.value = getName();
    if (last) last.textContent = "記録日：" + fd(today()) + "（保存した日が自動で入ります）";
    if (!id) return;
    try {
      const s = await db.collection(c.cols[0]).doc(id).get(); if (!s.exists) return;
      const d = s.data() || {};
      if (el && d.recBy && !c.useInput) el.value = getName() || d.recBy;
      if (last) last.textContent = d.recBy || d.recDate ? "前回の記録：" + (fd(d.recDate) || "-") + "　" + (d.recBy || "") + "（直して保存すると今日の日付と名前に変わります）" : "この記録には、まだ記録者が入っていません";
    } catch(e){}
  }
  function install(db, list){
    wrapDb(db);
    if (!window.__recbyObs && document.body){ window.__recbyObs = true; new MutationObserver(scheduleTags).observe(document.body, { childList:true, subtree:true }); }
    list.forEach(c => {
      const root = document.querySelector(c.modal); if (!root) return;
      c._root = root; cfgs.push(c);
      if (!c.useInput){
        const box = document.createElement("div"); box.className = "recby";
        box.innerHTML = '<label style="display:block;font-size:13px;font-weight:700;color:#1e3a5f;margin:10px 0 4px;">記録者（管理者） <span style="background:#fee2e2;color:#b91c1c;border-radius:4px;padding:0 6px;font-size:11px;">必須</span></label>'+
          '<input class="recby-in" type="text" placeholder="例: 関根 理絵" autocomplete="name" style="width:100%;box-sizing:border-box;padding:9px 10px;font-size:15px;border:1px solid #cbd5e1;border-radius:8px;">'+
          '<div class="recby-last" style="font-size:12px;color:#475569;margin-top:4px;"></div>';
        const before = c.before ? root.querySelector(c.before) : null;
        if (before && before.parentNode) before.parentNode.insertBefore(box, before); else (root.querySelector(".modal") || root).appendChild(box);
      } else {
        const el = document.querySelector(c.useInput);
        if (el && !root.querySelector(".recby-last")){ const d = document.createElement("div"); d.className = "recby-last"; d.style.cssText = "font-size:12px;color:#475569;margin-top:2px;"; el.insertAdjacentElement("afterend", d); }
      }
      let was = false;
      const chk = () => { const v = visible(root); if (v && !was) onOpen(c, db); was = v; };
      new MutationObserver(chk).observe(root, { attributes:true, attributeFilter:["class","style"] });
      if (root.parentElement) new MutationObserver(chk).observe(root.parentElement, { attributes:true, attributeFilter:["class","style"] });
    });
  }
  // 一覧に出す小さな文字(例:「記録 10/15 理絵」)
  function tag(d){ if (!d || (!d.recBy && !d.recDate)) return ""; const m = String(d.recDate || "").match(/^\d{4}-(\d{2})-(\d{2})/);
    return '<span class="recby-tag" style="font-size:11px;color:#475569;background:#f1f5f9;border-radius:4px;padding:1px 6px;white-space:nowrap;">記録 '+(m ? Number(m[1])+"/"+Number(m[2]) : "")+(d.recBy ? " "+String(d.recBy).replace(/[<>&"]/g, "") : "")+'</span>'; }
  window.RecBy = { install, tag, today, getName };
})();
