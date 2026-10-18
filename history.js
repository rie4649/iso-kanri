/* =====================================================================
   直した履歴(2026/10)：アプリで記録を「追加・変更・削除」したら、だれが・いつ・どの画面で・何を(前と後)を
   isoHistory に1件ずつ残す。履歴の画面(history.html)で見られて、間違えたときは「元に戻す」ができる。
   ・Firestore の読み込みのすぐ後に <script src="history.js"></script> を入れるだけで、その画面の保存が全部残る
   ・写真やPDFの中身(長い data:～)と、とても長い文は省略して残す(その記録は履歴からは戻せない→バックアップで戻す)
   ・記録者は、その端末で最後に入れた名前(isoRecBy)
   ===================================================================== */
(function(){
  if (!window.firebase || !firebase.firestore || window.__isoHistory) return;
  const FS = firebase.firestore, CR = FS.CollectionReference, DR = FS.DocumentReference, WB = FS.WriteBatch;
  if (!CR || !DR || !CR.prototype.add) return;
  window.__isoHistory = true;
  const H = "isoHistory";
  const skip = c => !c || c === H || /Files$|Chunks$/.test(c) || c === "phoneRequestLog";
  const who = () => { try { return localStorage.getItem("isoRecBy") || ""; } catch(e){ return ""; } };
  const page = (location.pathname.split("/").pop() || "index.html") + (location.hash || "").slice(0, 30);
  const ymd = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  let trimmed = false;
  function clean(v, depth){
    if (v == null || typeof v === "number" || typeof v === "boolean") return v;
    if (typeof v === "string"){
      if (v.startsWith("data:")) { trimmed = true; return "(写真・ファイルの中身)"; }
      if (v.length > 3000) { trimmed = true; return v.slice(0, 3000) + "…(長いので省略)"; }
      return v;
    }
    if (FS.FieldValue && v instanceof FS.FieldValue) return "(自動)";
    if (FS.Timestamp && v instanceof FS.Timestamp) return v;
    if (v instanceof Date) return v;
    if (depth > 6) { trimmed = true; return "(省略)"; }
    if (Array.isArray(v)) return v.map(x => { if (Array.isArray(x)) { trimmed = true; return JSON.stringify(x); } return clean(x, depth + 1); });   // 配列の中の配列はFirestoreに入らないので文字にする(戻せない)
    if (typeof v === "object"){ const o = {}; Object.keys(v).forEach(k => { const x = clean(v[k], depth + 1); if (x !== undefined) o[k] = x; }); return o; }
    return String(v);
  }
  const origAdd = CR.prototype.add;
  function log(col, id, op, before, after, merge){
    try {
      trimmed = false;
      const b = before ? clean(before, 0) : null, a = after ? clean(after, 0) : null;
      let rec = { col, id, op, by: who(), page, ms: Date.now(), date: ymd(new Date()), merge: !!merge, before: b, after: a, trimmed };
      const keys = new Set(Object.keys(a || {}).concat(op === "削除" ? Object.keys(b || {}) : []));
      rec.keys = [...keys].filter(k => !["updatedAt","recAt","createdAt"].includes(k)).slice(0, 40);
      if (JSON.stringify(rec).length > 300000) rec = { ...rec, before: null, after: null, trimmed: true, big: true };
      origAdd.call(firebase.firestore().collection(H), rec).catch(() => {});
    } catch(e){}
  }
  CR.prototype.add = function(data){
    const col = this.id;
    return origAdd.call(this, data).then(ref => { if (!skip(col)) log(col, ref.id, "追加", null, data); return ref; });
  };
  const oSet = DR.prototype.set, oUpd = DR.prototype.update, oDel = DR.prototype.delete;
  const before = ref => ref.get().then(s => s.exists ? s.data() : null).catch(() => null);
  DR.prototype.set = function(data, opt){
    const col = this.parent && this.parent.id, me = this;
    if (skip(col)) return opt ? oSet.call(this, data, opt) : oSet.call(this, data);
    return before(me).then(b => (opt ? oSet.call(me, data, opt) : oSet.call(me, data)).then(r => { log(col, me.id, b ? "変更" : "追加", b, data, opt && opt.merge); return r; }));
  };
  DR.prototype.update = function(...args){
    const col = this.parent && this.parent.id, me = this;
    if (skip(col) || typeof args[0] !== "object") return oUpd.apply(this, args);
    return before(me).then(b => oUpd.apply(me, args).then(r => { log(col, me.id, "変更", b, args[0], true); return r; }));
  };
  DR.prototype.delete = function(){
    const col = this.parent && this.parent.id, me = this;
    if (skip(col)) return oDel.call(this);
    return before(me).then(b => oDel.call(me).then(r => { if (b) log(col, me.id, "削除", b, null); return r; }));
  };
  // まとめて保存(batch)は、前の中身は残さず「何をしたか」だけ残す
  if (WB && WB.prototype.commit){
    const bS = WB.prototype.set, bU = WB.prototype.update, bD = WB.prototype.delete, bC = WB.prototype.commit;
    const q = (b, x) => { (b.__h = b.__h || []).push(x); };
    WB.prototype.set = function(ref, data, opt){ if (!skip(ref.parent && ref.parent.id)) q(this, [ref.parent.id, ref.id, "変更(まとめて)", data, opt && opt.merge]); return opt ? bS.call(this, ref, data, opt) : bS.call(this, ref, data); };
    WB.prototype.update = function(ref, ...a){ if (!skip(ref.parent && ref.parent.id) && typeof a[0] === "object") q(this, [ref.parent.id, ref.id, "変更(まとめて)", a[0], true]); return bU.call(this, ref, ...a); };
    WB.prototype.delete = function(ref){ if (!skip(ref.parent && ref.parent.id)) q(this, [ref.parent.id, ref.id, "削除(まとめて)", null]); return bD.call(this, ref); };
    WB.prototype.commit = function(){ const h = this.__h || []; return bC.call(this).then(r => { h.slice(0, 50).forEach(([c, id, op, d, m]) => log(c, id, op, null, d, m)); if (h.length > 50) log(h[0][0], "", "まとめて " + h.length + "件", null, null); return r; }); };
  }
})();
