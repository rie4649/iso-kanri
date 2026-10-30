/* =====================================================================
   EMS文書の原本(PDF)を扱う共通部品。docs.html(EMS文書管理)と plan.html(ISOの計画・リスク)で使う
   Firestore:
     emsDocs      … 文書の一覧(EMS-C-22)。ID＝文書コード(例 "A-10")。name・place・keep・approver・link(入力する場所)・order
     emsDocFiles  … 原本の版。code・docNo(例 EMS-A-10-02)・ver・title・date・author・memo・ファイル情報・chunkCol・chunkId
     emsDocChunks … 中身(分割base64)。fileId・idx・data
     emsDocReviews… 見直し・確認の記録(EMS-C-01/C-17)。code・title・ref・date・kind・by・detail
   ・前に「計画書の原本」(isoPlanDocs / isoPlanChunks)で入れたものは、自動でこちらに引っ越します(中身はそのまま)
   使う側で db(firestore)・esc()・toast() を用意しておくこと
   ===================================================================== */
const EMS = (function(){
  const DOCS = "emsDocs", FILES = "emsDocFiles", CHUNKS = "emsDocChunks", REVIEWS = "emsDocReviews", CHUNK_SIZE = 700 * 1024, MAX_MB = 15;
  const fdj = s => { const m = String(s||"").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Number(m[1])+"/"+Number(m[2])+"/"+Number(m[3]) : (s||""); };
  const today = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  let docs = [], files = [], listeners = [];
  const fire = () => listeners.forEach(f => { try { f(); } catch(e){ console.error(e); } });

  /* 文書番号・ファイル名から文書コードと版を読み取る(全角・区切り違いも可)
     "EMS-A-09-02" → {code:"A-09", ver:"02"} / "EMS-C-26-01"(文書そのものがある場合) → {code:"C-26-01"} */
  function parseNo(str){
    const t = String(str||"").normalize("NFKC").toUpperCase().replace(/[‐－―ー–—_ 　]/g, "-");
    const m = t.match(/EMS-*([ABC])-*(\d{1,2})(?:-+(\d{1,2}))?/) || t.match(/(?:^|[^A-Z])([ABC])-(\d{2})(?:-(\d{1,2}))?/);
    if (!m) return null;
    const code = m[1]+"-"+m[2].padStart(2,"0"), v = m[3] ? m[3].padStart(2,"0") : "";
    if (v && docs.some(d => d.id === code+"-"+v)) return { code: code+"-"+v, ver:"" };
    return { code, ver:v };
  }
  /* ファイル名の中の日付(2025.10.01 / 2025-10-01 / 20251001 / R7.10.1) */
  function dateIn(str){
    const t = String(str||"").normalize("NFKC");
    let m = t.match(/(20\d{2})[.\-\/年](\d{1,2})[.\-\/月](\d{1,2})/); if (m) return m[1]+"-"+String(m[2]).padStart(2,"0")+"-"+String(m[3]).padStart(2,"0");
    m = t.match(/(20\d{2})(\d{2})(\d{2})/); if (m) return m[1]+"-"+m[2]+"-"+m[3];
    m = t.match(/[RＲ令和]+\s*(\d{1,2})[.\-\/年](\d{1,2})[.\-\/月](\d{1,2})/); if (m) return (2018+Number(m[1]))+"-"+String(m[2]).padStart(2,"0")+"-"+String(m[3]).padStart(2,"0");
    return "";
  }
  const docName = code => (docs.find(d => d.id === code) || {}).name || "";
  const label = code => /^Z-/.test(code) ? docName(code) : "EMS-"+code+" "+docName(code);
  function filesOf(code){ return files.filter(f => f.code === code).sort((a,b) => String(b.date||"").localeCompare(String(a.date||"")) || String(b.ver||"").localeCompare(String(a.ver||"")) || (b.createdMs||0) - (a.createdMs||0)); }

  function subscribe(cb){
    if (cb) listeners.push(cb);
    if (subscribe.on) return; subscribe.on = true;
    db.collection(DOCS).onSnapshot(s => { docs = s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => (a.order||999) - (b.order||999) || a.id.localeCompare(b.id)); fire(); }, e => console.error(e));
    db.collection(FILES).onSnapshot(s => { files = s.docs.map(d => ({ id:d.id, ...d.data() })); fire(); }, e => console.error(e));
  }

  /* 初回だけ: 文書一覧(EMS-C-22)・見直し記録(C-01/C-17)・台帳の中身(A-06/07/10/13/22・C-17)を入れる。ems-seed.js がある画面でだけ動く */
  async function ensureSeed(){
    if (typeof EMS_SEED === "undefined") return false;
    const flagRef = db.collection("isoSettings").doc("seeds");
    let flag = {}; try { const f = await flagRef.get(); flag = f.exists ? f.data() : {}; } catch(e){ return false; }
    let did = false;
    if (!flag.emsDocs1){
      await flagRef.set({ emsDocs1:true }, { merge:true });
      const now = Date.now();
      for (const d of EMS_SEED.docs) await db.collection(DOCS).doc(d.code).set({ name:d.name, place:d.place, keep:d.keep, approver:d.approver, link:d.link||"", order:d.order, createdMs:now }, { merge:true });
      let i = 0; for (const r of EMS_SEED.revs) await db.collection(REVIEWS).add({ ...r, createdMs: now + (i++) });
      did = true;
    }
    if (!flag.emsImport1){
      await flagRef.set({ emsImport1:true }, { merge:true });
      const regs = (await db.collection("isoRegisters").get()).docs.map(d => d.data());
      const plan = [["aspects","aspects"],["risks","risks"],["objectives","objectives"],["comms","comms"]];
      let base = Date.now();
      for (const [key, reg] of plan){
        const rows = EMS_SEED.imports[key] || [];
        if (regs.some(r => r.reg === reg && r.srcDoc && rows.some(x => x.srcDoc === r.srcDoc))) continue;   // もう取り込み済み
        for (const r of rows){ const o = { ...r, reg, draft:false, fromDoc:true, createdMs: base++, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }; delete o.condAll; await db.collection("isoRegisters").add(o); }
      }
      did = true;
    }
    if (!flag.emsA27){   // 2026/10 追加: 進捗記録兼評価表 顧客対応(custlog.html)。番号のルールは特になし → A-26の次
      await flagRef.set({ emsA27:true }, { merge:true });
      const ex = await db.collection(DOCS).doc("A-27").get();
      if (!ex.exists){
        await db.collection(DOCS).doc("A-27").set({ name:"進捗記録兼評価表 顧客対応", place:"アプリ(ISO管理)", keep:"3年間", approver:"環境管理責任者", link:"custlog", order:26.6, inUse:true, createdMs:Date.now() }, { merge:true });
        const d = new Date(), ds = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
        await db.collection(REVIEWS).add({ code:"A-27", title:"", date:ds, kind:"作成", by:"", detail:"進捗記録兼評価表(顧客対応)を新しく作成。電話依頼アプリの記録から月ごとに自動で集計(環境マニュアル 6.2・7.4.3)", createdMs:Date.now() });
        did = true;
      }
    }
    if (!flag.c29v1){   // 2026/10/28 追加: 車両不具合・修理記録(EMS-C-29)。点検ラクラクの不具合報告から月ごとに作る
      await flagRef.set({ c29v1:true }, { merge:true });
      const ex = await db.collection(DOCS).doc("C-29").get();
      if (!ex.exists){
        const d = new Date(), ds = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
        await db.collection(DOCS).doc("C-29").set({ name:"車両不具合・修理記録", place:"アプリ(ISO管理)", keep:"3年間", approver:"環境管理責任者", link:"plan:vehRepair", order:129, inUse:true, createdMs:Date.now() }, { merge:true });
        await db.collection(REVIEWS).add({ code:"C-29", title:"", date:ds, kind:"作成", by:"環境管理責任者", detail:"車両不具合・修理記録を新しく作成。点検ラクラクの不具合報告から月ごとに作る（対応済み・検討中・未対応）。環境マニュアル 8.1(運用の管理)・8.2(油漏れなどの緊急事態の予防)・10.2(不適合と是正処置)", createdMs:Date.now() });
      }
    }
    if (!flag.links202610b){   // 2026/10/28 アプリに画面ができた書類をつなぐ：A-01→環境マニュアルを読む、B-01→写真の記録(社内図)、C-03→内部監査アンケート
      await flagRef.set({ links202610b:true }, { merge:true });
      for (const [code, link] of [["A-01", "manualbook"], ["B-01", "photos"], ["C-03", "kansa"]]){
        const ex = await db.collection(DOCS).doc(code).get(); if (ex.exists && !ex.data().abolished) { await db.collection(DOCS).doc(code).update({ link }); }
      }
    }
    if (!flag.aboB07){   // 2026/10/30 相談で決定: 外部業者委託確認書 郵送書類(B-07)は郵送をやめたので廃止
      await flagRef.set({ aboB07:true }, { merge:true });
      const reason = "外部業者への手順書・確認書の郵送はしていない。構内に来る人(協力会社・来訪者)には入口に環境方針・構内ルールを掲示(写真をISO管理に保存)、委託先には毎年8月の取引先チェック(A-18)で環境への配慮を確認しているため廃止。";
      const rep = "入口の掲示(写真・書類)＋取引先チェック表 EMS-A-18", date = "2026-10-30";
      const ex = await db.collection(DOCS).doc("B-07").get();
      if (ex.exists && !ex.data().abolished){
        const ref = await db.collection(REVIEWS).add({ code:"B-07", title:"", date, kind:"廃止", by:"環境管理責任者", detail:reason+"(代わり："+rep+")", createdMs:Date.now() });
        await db.collection(DOCS).doc("B-07").update({ abolished:true, abolishedDate:date, abolishedReason:reason, abolishedBy:"環境管理責任者", replacedBy:rep, abolishReviewId:ref.id });
      }
    }
    if (!flag.aboInfo1){   // 2026/10/14 相談で決定: 情報公開検討書(A-23・C-09 同じ名前が2つ)を廃止
      await flagRef.set({ aboInfo1:true }, { merge:true });
      const reason = "外部への情報公開の判断は、環境マニュアル7.4.3の表で決めている。記録は「コミュニケーション・苦情」と行政照会記録、公開内容は「環境への取り組み」で管理するため廃止。";
      const rep = "環境マニュアル7.4.3／コミュニケーション・苦情／行政照会記録／環境への取り組み", date = "2026-10-14";
      for (const code of ["A-23", "C-09"]){
        const ex = await db.collection(DOCS).doc(code).get(); if (!ex.exists || ex.data().abolished) continue;
        const ref = await db.collection(REVIEWS).add({ code, title:"", date, kind:"廃止", by:"環境管理責任者", detail:reason+"(代わり："+rep+")", createdMs:Date.now() });
        await db.collection(DOCS).doc(code).update({ abolished:true, abolishedDate:date, abolishedReason:reason, abolishedBy:"環境管理責任者", replacedBy:rep, abolishReviewId:ref.id });
      }
    }
    if (!flag.links2){   // 2026/10: 原本だけだった記録を、アプリの入力画面につなぐ(入力する場所が空のものだけ)
      await flagRef.set({ links2:true }, { merge:true });
      const L = {"C-01": "plan:auditPlan", "C-12": "plan:nearMiss", "C-13": "plan:comms", "C-14": "clean", "C-18": "plan:distrib", "C-19": "plan:minutes", "B-02": "process", "B-03": "ext:master", "B-04": "ext:master", "Z-03": "abolist"};
      for (const [code, link] of Object.entries(L)){
        const ex = await db.collection(DOCS).doc(code).get(); if (!ex.exists || ex.data().link) continue;
        await db.collection(DOCS).doc(code).update({ link });
      }
    }
    if (!flag.links3){   // 2026/10: 内部監査チェックシート(C-02)・アンケート(C-03)・行先経路(B-06)を、それぞれの入力画面につなぐ
      await flagRef.set({ links3:true }, { merge:true });
      const L = {"C-02": ["plan:auditCheck", "kiroku"], "C-03": ["plan:auditSurvey", "kiroku"], "B-06": ["plan:routes", "permit"]};
      for (const [code, [link, old]] of Object.entries(L)){
        const ex = await db.collection(DOCS).doc(code).get(); if (!ex.exists) continue;
        const cur = ex.data().link || ""; if (cur === "" || cur === old) await db.collection(DOCS).doc(code).update({ link });
      }
    }
    if (!flag.aboMaster1){   // 2026/10/15 相談で決定: ほかのアプリで管理していて、ISO管理に別の書類としていらないものを廃止(一覧から消える。記録は残る)
      await flagRef.set({ aboMaster1:true }, { merge:true });
      const date = "2026-10-15", L = [
        ["B-05", "許可の期限は共通マスタ管理の「許可証」で登録・更新し、ISO管理の「許可一覧」に自動で出るため廃止。", "共通マスタ管理(許可証)／ISO管理 許可一覧"],
        ["B-03", "車両の担当は共通マスタ管理の「車両」で管理するため廃止。", "共通マスタ管理(車両)"],
        ["B-04", "車両の管理(車検・保険など)は共通マスタ管理・業務管理アプリで管理するため廃止。", "共通マスタ管理(車両)・業務管理"],
        ["Z-03", "廃止した文書は、EMS文書管理の「廃止文書も表示」で一覧になるため、別の書類としては廃止。", "EMS文書管理(廃止文書の一覧)"]];
      for (const [code, reason, rep] of L){
        const ex = await db.collection(DOCS).doc(code).get(); if (!ex.exists || ex.data().abolished) continue;
        const ref = await db.collection(REVIEWS).add({ code, title:"", date, kind:"廃止", by:"環境管理責任者", detail:reason+"(代わり："+rep+")", createdMs:Date.now() });
        await db.collection(DOCS).doc(code).update({ abolished:true, abolishedDate:date, abolishedReason:reason, abolishedBy:"環境管理責任者", replacedBy:rep, abolishReviewId:ref.id });
      }
    }
    if (!flag.revImport2 && typeof EMS_SEED_REV2 !== "undefined"){   // 2026/10: 日程決定記録兼文書見直記録(C-01-01)の見直しを記録に入れる(同じ文書・同じ日のものは入れない)
      await flagRef.set({ revImport2:true }, { merge:true });
      const have = new Set((await db.collection(REVIEWS).get()).docs.map(d => { const x = d.data(); return x.code+"|"+x.date; }));
      let i = 0; for (const r of EMS_SEED_REV2){ if (have.has(r.code+"|"+r.date)) continue; await db.collection(REVIEWS).add({ ...r, createdMs: Date.now() + (i++) }); }
    }
    if (!flag.links4){   // 2026/10: ゾーン報告書(C-14)→ヒヤリハット、顧客対応確認書(C-15)→顧客対応の進捗(電話依頼)、監査結果記録(C-06)→外部審査の指摘
      await flagRef.set({ links4:true }, { merge:true });
      for (const [code, link, old] of [["C-14","plan:nearMiss","clean"],["C-15","custlog","plan:comms"],["C-06","plan:extAudit","kiroku"]]){
        const ex = await db.collection(DOCS).doc(code).get(); if (!ex.exists) continue;
        const cur = ex.data().link || ""; if (cur === "" || cur === old) await db.collection(DOCS).doc(code).update({ link });
      }
    }
    if (!flag.aboUnneeded1){   // 2026/10/15 相談で決定: アプリで自動でまとまる「まとめ」と、ほかの書類と中身が同じものを廃止(一覧から消える。記録は残る)
      await flagRef.set({ aboUnneeded1:true }, { merge:true });
      const date = "2026-10-15", L = [
        ["A-20", "騒音チェック・圧縮機の点検記録(C-21)から、アプリの画面で年ごとに自動でまとまるため、別の「まとめ」は廃止。", "C-21 騒音チェック・圧縮機定期点検記録(アプリ)"],
        ["A-21", "安全衛生パトロールの記録(C-25)から、アプリの画面で月ごと・年ごとに自動でまとまるため、別の「まとめ」は廃止。", "C-25 安全衛生パトロールチェック表(アプリ)"],
        ["C-24", "5Sの月々の進捗は、クリーン度チェックの記録からアプリが自動で集計し、A-14(進捗記録兼評価表 クリーン度チェック)と中身が同じため廃止。", "A-14 進捗記録兼評価表 クリーン度チェック(アプリ)"],
        ["C-26-01", "法令の条文の写しで記録ではないため廃止。守ることと順守方法は A-05(法的要求事項特定書)に、改正の情報は法規制一覧(e-Gov から自動取得)にあるため。", "A-05 法的要求事項特定書／法規制一覧"]];
      for (const [code, reason, rep] of L){
        const ex = await db.collection(DOCS).doc(code).get(); if (!ex.exists || ex.data().abolished) continue;
        const ref = await db.collection(REVIEWS).add({ code, title:"", date, kind:"廃止", by:"環境管理責任者", detail:reason+"(代わり："+rep+")", createdMs:Date.now() });
        await db.collection(DOCS).doc(code).update({ abolished:true, abolishedDate:date, abolishedReason:reason, abolishedBy:"環境管理責任者", replacedBy:rep, abolishReviewId:ref.id });
      }
    }
    if (!flag.vol1){   // 2026/10/15: 環境側面調査記録(A-17)をアプリの「取扱量の推移」にし、月の集計表(C-20)はA-17にまとめて廃止
      await flagRef.set({ vol1:true }, { merge:true });
      const a17 = await db.collection(DOCS).doc("A-17").get();
      if (a17.exists && (!a17.data().link || a17.data().link === "plan:aspects")) await db.collection(DOCS).doc("A-17").update({ link:"volumes" });
      const c20 = await db.collection(DOCS).doc("C-20").get();
      if (c20.exists && !c20.data().abolished){
        const reason = "環境側面の取扱量は、年度ごとの数字をA-17(環境側面調査記録・アプリの「取扱量の推移」)に入れることにしたため、月ごとの集計表は廃止。インプット・アウトプットの形もやめ、受け入れ量(インプット)の推移と考察にまとめた。", rep = "A-17 環境側面調査記録(取扱量の推移)";
        const ref = await db.collection(REVIEWS).add({ code:"C-20", title:"", date:"2026-10-15", kind:"廃止", by:"環境管理責任者", detail:reason+"(代わり："+rep+")", createdMs:Date.now() });
        await db.collection(DOCS).doc("C-20").update({ abolished:true, abolishedDate:"2026-10-15", abolishedReason:reason, abolishedBy:"環境管理責任者", replacedBy:rep, abolishReviewId:ref.id });
      }
    }
    if (!flag.links5){   // 2026/10: ゾーン報告書(C-14)を専用の「ゾーン報告」の入力画面につなぐ
      await flagRef.set({ links5:true }, { merge:true });
      const ex = await db.collection(DOCS).doc("C-14").get();
      if (ex.exists && ["", "plan:nearMiss", "clean"].includes(ex.data().link || "")) await db.collection(DOCS).doc("C-14").update({ link:"plan:zoneReport" });
    }
    if (!flag.emsMigrate1){ await migrateLegacy(); await flagRef.set({ emsMigrate1:true }, { merge:true }); }
    return did;
  }
  /* 前の「計画書の原本」(isoPlanDocs)を emsDocFiles へ(中身は isoPlanChunks のまま参照) */
  async function migrateLegacy(){
    try {
      const s = await db.collection("isoPlanDocs").get();
      for (const d of s.docs){ const x = d.data(); if (x.migrated) continue;
        const p = parseNo(x.docNo) || { code:"", ver:"" };
        await db.collection(FILES).add({ code:p.code || ("?"+x.docNo), docNo:x.docNo||"", ver:p.ver, title:x.title||"", date:x.date||"", author:x.author||"", memo:x.memo||"",
          fileName:x.fileName||"", fileType:x.fileType||"application/pdf", size:x.size||0, chunkCount:x.chunkCount||0, chunkCol:"isoPlanChunks", chunkId:d.id, createdMs:x.createdMs||Date.now() });
        await d.ref.update({ migrated:true });
      }
    } catch(e){ console.error(e); }
  }

  function b64of(file){ return new Promise((ok, ng) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = () => ng(new Error("ファイルを読み込めませんでした")); r.readAsDataURL(file); }); }
  async function writeChunks(chunkId, file){
    const b64 = await b64of(file), parts = []; for (let i = 0; i < b64.length; i += CHUNK_SIZE) parts.push(b64.slice(i, i + CHUNK_SIZE));
    for (let i = 0; i < parts.length; i++) await db.collection(CHUNKS).doc(chunkId+"_"+i).set({ fileId:chunkId, idx:i, data:parts[i] });
    const old = await db.collection(CHUNKS).where("fileId","==",chunkId).get();
    const b = db.batch(); old.docs.filter(x => x.data().idx >= parts.length).forEach(x => b.delete(x.ref)); await b.commit();
    return { fileName:file.name, fileType:file.type || "application/pdf", size:file.size, chunkCount:parts.length, chunkCol:CHUNKS, chunkId };
  }
  async function upload(code, file, meta){
    if (file.size > MAX_MB * 1024 * 1024) throw new Error(MAX_MB+"MBまでのファイルにしてください");
    const ref = db.collection(FILES).doc();
    const info = await writeChunks(ref.id, file);
    await ref.set({ code, docNo: meta.docNo || ("EMS-"+code+(meta.ver ? "-"+meta.ver : "")), ver: meta.ver || "", title: meta.title || docName(code), date: meta.date || "", author: meta.author || "", memo: meta.memo || "", ...info, createdMs: Date.now(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    return ref.id;
  }
  async function edit(id, meta, file){
    const f = files.find(x => x.id === id); if (!f) throw new Error("見つかりません");
    const upd = { ...meta, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (file){ if (file.size > MAX_MB * 1024 * 1024) throw new Error(MAX_MB+"MBまでのファイルにしてください"); Object.assign(upd, await writeChunks(id, file)); }   // 差し替えは自分のIDの中身に書き直す
    await db.collection(FILES).doc(id).update(upd);
  }
  async function remove(id){
    const f = files.find(x => x.id === id); if (!f) return;
    const s = await db.collection(f.chunkCol || CHUNKS).where("fileId","==",f.chunkId || id).get();
    const b = db.batch(); s.docs.forEach(x => b.delete(x.ref)); b.delete(db.collection(FILES).doc(id)); await b.commit();
  }
  /* 別タブに飛ばず、画面の上に重ねて開く(← 戻るで閉じる) */
  async function view(id){
    const f = files.find(x => x.id === id); if (!f) return;
    if (typeof toast === "function") toast("開いています…");
    try {
      const s = await db.collection(f.chunkCol || CHUNKS).where("fileId","==",f.chunkId || id).get();
      const parts = s.docs.map(x => x.data()).sort((a,b) => a.idx - b.idx); if (!parts.length) throw new Error("中身が見つかりません");
      const bin = atob(parts.map(x => x.data).join("")), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type:f.fileType || "application/pdf" }));
      const v = document.createElement("div"); v.id = "emsViewer"; v.style.cssText = "position:fixed;inset:0;z-index:90;background:#1f2937;display:flex;flex-direction:column;";
      v.innerHTML = '<div style="display:flex;gap:8px;align-items:center;padding:8px 12px;background:#1e3a5f;color:#fff;"><button class="btn" onclick="document.getElementById(\'emsViewer\').remove()">← 戻る</button>'+
        '<b style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc((f.docNo||"")+" "+(f.title||"")+"("+fdj(f.date)+")")+'</b><a class="btn" href="'+url+'" target="_blank" rel="noopener" style="text-decoration:none;">別のタブで開く</a></div>'+
        (String(f.fileType).startsWith("image/") ? '<div style="flex:1;overflow:auto;text-align:center;background:#fff;"><img src="'+url+'" style="max-width:100%;"></div>' : '<iframe src="'+url+'" title="原本" style="flex:1;border:none;background:#fff;width:100%;"></iframe>');
      document.body.appendChild(v);
    } catch(e){ alert("開けませんでした: "+e.message); }
  }

  /* 登録・修正の画面(共通) mode: {code} 新しい版 / {editId} 修正 / {codes:[...]} 文書を選んで登録 */
  function openForm(opt){
    let bg = document.getElementById("emsFormBg");
    if (!bg){ bg = document.createElement("div"); bg.id = "emsFormBg"; bg.className = "bg"; bg.addEventListener("click", e => { if (e.target === bg) bg.classList.remove("show"); }); document.body.appendChild(bg); }
    const f = opt.editId ? files.find(x => x.id === opt.editId) : null;
    const code0 = f ? f.code : (opt.code || (opt.codes && opt.codes[0]) || "");
    const last = code0 ? filesOf(code0)[0] : null;
    const codes = opt.codes || docs.filter(d => !d.abolished || d.id === code0).map(d => d.id);   // 廃止した文書は選べない(その文書から開いたときを除く)
    const nextVer = last && last.ver ? String(Number(last.ver) + 1).padStart(2,"0") : "";
    bg.innerHTML = '<div class="modal" style="max-width:520px;"><h2>'+(f ? "原本の修正" : "原本(PDF)の登録")+'</h2>'+
      '<label for="emsCode">文書</label><select id="emsCode">'+codes.map(c => '<option value="'+esc(c)+'"'+(c === code0 ? " selected" : "")+'>'+esc(label(c))+'</option>').join("")+'</select>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div><label for="emsVer">版数(任意)</label><input id="emsVer" placeholder="例: 02" value="'+esc(f ? f.ver||"" : nextVer)+'"></div>'+
      '<div><label for="emsDate">日付(作成日・改定日)</label><input id="emsDate" type="date" value="'+esc(f ? f.date||"" : today())+'"></div></div>'+
      '<label for="emsAuthor">作成者</label><input id="emsAuthor" value="'+esc(f ? f.author||"" : (last && last.author) || "環境管理責任者")+'">'+
      '<label for="emsMemo">改訂内容・メモ(任意)</label><input id="emsMemo" value="'+esc(f ? f.memo||"" : "")+'" placeholder="例: 気候変動のリスクを追加">'+
      '<label for="emsFile">'+(f ? "PDF・写真を差し替える(任意)" : "PDF・写真(15MBまで)")+'</label><input id="emsFile" type="file" accept="application/pdf,image/*">'+
      (f ? '<div class="note">ファイルを選ばなければ、文字だけ直します。</div>' : '<div class="note">前の版は消えずに「改訂履歴」に残ります。</div>')+
      '<div class="mBtns"><button class="btn" onclick="document.getElementById(\'emsFormBg\').classList.remove(\'show\')">キャンセル</button><button class="btn pri" id="emsSave">'+(f ? "保存" : "登録")+'</button></div></div>';
    document.getElementById("emsSave").onclick = async () => {
      const code = document.getElementById("emsCode").value, ver = document.getElementById("emsVer").value.trim().replace(/^(\d)$/, "0$1");
      const date = document.getElementById("emsDate").value, file = document.getElementById("emsFile").files[0];
      if (!date){ toast("日付を入れてください"); return; }
      if (!f && !file){ toast("PDFを選んでください"); return; }
      const meta = { code, ver, date, docNo:"EMS-"+code+(ver ? "-"+ver : ""), title:docName(code), author:document.getElementById("emsAuthor").value.trim(), memo:document.getElementById("emsMemo").value.trim() };
      const btn = document.getElementById("emsSave"); btn.disabled = true; btn.textContent = "保存中…";
      try { if (f) await edit(f.id, meta, file); else await upload(code, file, meta); bg.classList.remove("show"); toast(f ? "保存しました" : "登録しました"); }
      catch(e){ toast("保存できませんでした: "+e.message); }
      btn.disabled = false; btn.textContent = f ? "保存" : "登録";
    };
    bg.classList.add("show");
  }
  async function askRemove(id){
    const f = files.find(x => x.id === id); if (!f) return;
    if (!confirm((f.docNo||"")+" "+(f.title||"")+"("+fdj(f.date)+")を削除しますか？")) return;
    try { await remove(id); toast("削除しました"); } catch(e){ toast("削除できませんでした: "+e.message); }
  }
  /* 1つの文書の「最新の版＋改訂履歴」の行 */
  function versionsHtml(code){
    const l = filesOf(code);
    const row = (f, cur) => '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:4px 0;'+(cur ? '' : 'font-size:13px;color:#6b7280;')+'">'+
      '<span style="flex:1;min-width:180px;">'+(cur ? '<b>最新</b> ' : '')+esc(f.docNo||"")+'　<span class="tag gray">'+esc(fdj(f.date))+'</span>'+(f.author ? '<span class="tag gray">作成 '+esc(f.author)+'</span>' : '')+(f.memo ? '<span style="font-size:12px;color:#6b7280;">'+esc(f.memo)+'</span>' : '')+'</span>'+
      '<button class="btn sm" onclick="EMS.view(\''+f.id+'\')">開く</button><button class="btn sm" onclick="EMS.openForm({editId:\''+f.id+'\'})">修正</button><button class="btn sm del" onclick="EMS.askRemove(\''+f.id+'\')">削除</button></div>';
    if (!l.length) return '<div class="note" style="margin:2px 0;">原本(PDF)はまだありません</div>';
    return row(l[0], true) + (l.length > 1 ? '<details style="margin:0 0 4px 10px;"><summary style="font-size:12px;color:#6b7280;cursor:pointer;">改訂履歴('+(l.length-1)+'件)</summary>'+l.slice(1).map(f => row(f, false)).join("")+'</details>' : '');
  }
  return { parseNo, dateIn, subscribe, ensureSeed, migrateLegacy, upload, edit, remove, view, openForm, askRemove, versionsHtml, filesOf, label, fdj,
    get docs(){ return docs; }, get files(){ return files; }, DOCS, FILES, CHUNKS, REVIEWS };
})();
