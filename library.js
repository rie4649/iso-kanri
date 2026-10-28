/* =====================================================================
   書類の置き場(2026/10)：書類(PDF・写真)は1回ここに入れるだけ。入れるときに「フォルダ」と「使う場所」を選ぶと、
   ホームの「📁 書類・資料の置き場」のフォルダ、新入社員研修の教材、環境への取り組みの「資料」など、必要な画面から見られる。
   Firestore: isoLibrary(1件=1つの書類の情報) ／ isoLibraryChunks(中身。大きいPDFも入るよう約900KBずつに分けて保存。ID = 書類ID_番号)
   ===================================================================== */
(function(){
  const COL = "isoLibrary", CH = "isoLibraryChunks", SIZE = 900000;
  const FOLDERS = [
    ["inbox", "📥", "とりあえず置き場（あとで分ける）", "迷ったらここ。あとで「編集」かまとめて移すで分けられる"],
    ["plan", "📋", "ISOの計画・ルール", "環境マニュアル・手順書・計画書など"],
    ["permit", "📜", "許可・法令・届出", "許可証の写し・法令の案内・届出の控え"],
    ["vendor", "🏭", "委託先・行先", "契約書・委託先の許可証・調査票"],
    ["people", "👥", "人・車両・教育", "研修の教材・資格証・車両の書類"],
    ["company", "🏢", "会社", "会社案内・社内図・表彰状など"],
    ["other", "🗂️", "その他", ""]
  ];
  // 使う場所：選ぶと、その画面にも出る(書類は1つのまま)。[キー, 名前, どこに出るか]
  const USES = [
    ["award", "🏆 表彰・認定（賞状・感謝状・認定証）", "環境への取り組み「沿革」のページ"],
    ["sdgs", "🎯 SDGs（登録証・取組の写真など）", "環境への取り組み「環境目標・SDGs」のページ"],
    ["donation", "🤝 地域貢献（活動の写真・感謝状など）", "環境への取り組み「地域貢献」のページ"],
    ["show", "📚 審査・視察で見せる資料", "環境への取り組み「資料」のページ"],
    ["newhire", "🔰 新入社員研修の教材", "新入社員研修で選べる"],
    ["audit", "🔍 審査の準備で使う", "審査の前に見る資料"]
  ];
  async function list(db){ const s = await db.collection(COL).get(); return s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja")); }
  async function save(db, file, meta, onStep){
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("読み込み失敗")); r.readAsDataURL(file); });
    const n = Math.ceil(data.length / SIZE), ref = db.collection(COL).doc();
    for (let i = 0; i < n; i++) { if (onStep) onStep(i + 1, n); await db.collection(CH).doc(ref.id + "_" + i).set({ docId: ref.id, i, data: data.slice(i * SIZE, (i + 1) * SIZE) }); }
    await ref.set({ ...meta, fileName: file.name, type: file.type || "application/octet-stream", size: file.size, chunks: n, createdMs: Date.now(), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    return ref.id;
  }
  async function remove(db, d){ for (let i = 0; i < (d.chunks || 0); i++) { try { await db.collection(CH).doc(d.id + "_" + i).delete(); } catch(e){} } await db.collection(COL).doc(d.id).delete(); }
  async function open(db, id){
    const w = window.open("", "_blank");
    try {
      const d = await db.collection(COL).doc(id).get(); if (!d.exists) throw new Error("書類が見つかりません");
      const m = d.data(); if (m.link) { if (w) w.location.href = m.link; else location.href = m.link; return; }
      const url0 = await dataUrl(db, { id, ...m }), raw = url0.split(",")[1] || "", bin = atob(raw), arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: m.type || "application/pdf" }));
      if (w) w.location.href = url; else window.open(url, "_blank");
    } catch(e){ if (w) w.close(); alert("開けませんでした: " + e.message); }
  }
  /* 中身を data:～ の形で読む。前からあった写真・添付(ほかの画面で入れたもの)は、元の場所(photoRef / fileRef)から読む */
  async function dataUrl(db, d){
    if (d.photoRef) { const s = await db.collection("isoPhotoFiles").doc(d.photoRef).get(); if (!s.exists) throw new Error("写真が見つかりません"); const v = String(s.data().data || ""); return v.startsWith("data:") ? v : "data:" + (s.data().type || "image/jpeg") + ";base64," + v; }
    if (d.fileRef) { const s = await db.collection(d.fileRef.col).doc(d.fileRef.id).get(); if (!s.exists) throw new Error("ファイルが見つかりません"); const v = String(s.data().data || ""); return v.startsWith("data:") ? v : "data:" + (s.data().type || d.type || "application/pdf") + ";base64," + v; }
    const parts = await Promise.all(Array.from({ length: d.chunks || 0 }, (_, i) => db.collection(CH).doc(d.id + "_" + i).get().then(s => s.exists ? s.data().data : "")));
    return parts.join("");
  }
  const icon = d => d.link ? "🔗" : String(d.type || "").startsWith("image/") ? "🖼️" : "📄";
  window.Library = { COL, CH, FOLDERS, USES, list, save, remove, open, icon, dataUrl };
})();
