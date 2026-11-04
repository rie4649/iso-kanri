/* =====================================================================
   PDF・写真を「画面の上に重ねて」開く共通の部品(2026/11/3)
   ・Androidのタブレット・スマホは、ブラウザのPDF表示(iframe・新しいタブ)が苦手で、別の画面に飛んだり
     ダウンロードになったりする。PDF.js でPDFを絵にして並べるので、どの端末でも同じように見られる
   ・下にスクロールで全ページ、＋／－で拡大・縮小(指でつまんで拡大もできる)
   使い方: PdfView.open(Blob か URL, "題名")   閉じる: PdfView.close()
   重ねた画面の id は "fileViewer"(ほかの画面で「開いている間はページを送らない」に使う)
   ===================================================================== */
(function(){
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  let libP = null, url = null, doc = null, zoom = 1, token = 0;
  const e = t => String(t ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  function lib(){
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (libP) return libP;
    libP = new Promise((res, rej) => { const s = document.createElement("script"); s.src = PDFJS;
      s.onload = () => { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; res(window.pdfjsLib); } catch(x){ rej(x); } };
      s.onerror = () => { libP = null; rej(new Error("PDFを表示する部品を読み込めませんでした")); }; document.head.appendChild(s); });
    return libP;
  }
  const btn = "border:1px solid rgba(255,255,255,.6);border-radius:8px;padding:8px 14px;font-size:15px;font-weight:bold;cursor:pointer;background:transparent;color:#fff;white-space:nowrap;";
  function shell(title){
    if (document.getElementById("fileViewer")) close(true);
    const bg = document.createElement("div"); bg.id = "fileViewer";
    bg.style.cssText = "position:fixed;inset:0;z-index:95;background:#334155;display:flex;flex-direction:column;";
    bg.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#1e3a5f;color:#fff;flex:0 0 auto;">'+
      '<button style="'+btn+'background:#fff;color:#1e3a5f;" onclick="PdfView.close()">← 戻る</button>'+
      '<div style="flex:1;min-width:0;font-weight:bold;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+e(title || "資料")+'</div>'+
      '<span id="pvZoom" style="display:none;gap:6px;"><button style="'+btn+'" onclick="PdfView.zoom(-1)" aria-label="小さく">－</button><button style="'+btn+'" onclick="PdfView.zoom(1)" aria-label="大きく">＋</button></span>'+
      '<a id="pvSave" style="'+btn+'text-decoration:none;" download>⬇ 保存</a>'+
      '<button style="'+btn+'" onclick="PdfView.close()" aria-label="閉じる">✕</button></div>'+
      '<div id="pvBody" style="flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:10px;text-align:center;touch-action:pan-x pan-y pinch-zoom;"><div style="color:#fff;padding:40px;font-size:16px;">開いています…</div></div>';
    document.body.appendChild(bg);
    try { history.pushState(Object.assign({}, history.state || {}, { pv: 1 }), ""); } catch(x){}   // スマホの「戻る」で閉じられるように
    return bg;
  }
  async function toBlob(src){
    if (src instanceof Blob) return src;
    const r = await fetch(src); if (!r.ok) throw new Error("ファイルが見つかりません（" + r.status + "）");
    return await r.blob();
  }
  async function isPdf(b){ if (/pdf/i.test(b.type)) return true; if (/^image\//.test(b.type)) return false;
    try { const h = new Uint8Array(await b.slice(0, 5).arrayBuffer()); return String.fromCharCode(...h) === "%PDF-"; } catch(x){ return false; } }
  async function render(){
    const body = document.getElementById("pvBody"); if (!body || !doc) return;
    const my = ++token, w = Math.max(200, body.clientWidth - 20), dpr = Math.min(2, window.devicePixelRatio || 1);
    body.innerHTML = "";
    for (let i = 1; i <= doc.numPages; i++){
      const page = await doc.getPage(i); if (my !== token) return;
      const v0 = page.getViewport({ scale: 1 }), sc = w / v0.width * zoom, v = page.getViewport({ scale: sc * dpr });
      const c = document.createElement("canvas"); c.width = Math.floor(v.width); c.height = Math.floor(v.height);
      c.style.cssText = "width:" + Math.floor(v.width / dpr) + "px;height:" + Math.floor(v.height / dpr) + "px;background:#fff;display:block;margin:0 auto 10px;box-shadow:0 2px 8px rgba(0,0,0,.3);max-width:none;";
      body.appendChild(c);
      await page.render({ canvasContext: c.getContext("2d"), viewport: v }).promise; if (my !== token) return;
    }
    const n = document.createElement("div"); n.style.cssText = "color:#cbd5e1;font-size:13px;padding:4px 0 20px;"; n.textContent = "全 " + doc.numPages + " ページ"; body.appendChild(n);
  }
  async function open(src, title){
    const bg = shell(title);
    try {
      const b = await toBlob(src); if (!document.body.contains(bg)) return;
      url = URL.createObjectURL(b); const sv = document.getElementById("pvSave"); sv.href = url; sv.setAttribute("download", (title || "資料").replace(/[\\/:*?"<>|]/g, "") + (/pdf/i.test(b.type) ? ".pdf" : ""));
      const body = document.getElementById("pvBody");
      if (!(await isPdf(b))){ body.innerHTML = '<img src="' + url + '" alt="" style="max-width:100%;background:#fff;">'; return; }
      const L = await lib(); if (!document.body.contains(bg)) return;
      doc = await L.getDocument({ data: new Uint8Array(await b.arrayBuffer()) }).promise; zoom = 1;
      document.getElementById("pvZoom").style.display = "inline-flex";
      await render();
    } catch(x){
      console.error(x); const body = document.getElementById("pvBody");
      if (body) body.innerHTML = '<div style="color:#fff;padding:30px;font-size:16px;line-height:1.8;">開けませんでした：' + e(x.message) + (url ? '<br><a href="' + url + '" target="_blank" rel="noopener" style="color:#86efac;">別の画面で開いてみる ↗</a>' : '') + '</div>';
    }
  }
  function close(fromPop){
    token++; const v = document.getElementById("fileViewer"); if (v) v.remove();
    if (v && fromPop !== true){ try { if (history.state && history.state.pv) history.back(); } catch(x){} }
    if (doc){ try { doc.destroy(); } catch(x){} doc = null; }
    if (url){ const u = url; url = null; setTimeout(() => URL.revokeObjectURL(u), 60000); }
  }
  function zoomBy(d){ zoom = Math.max(0.5, Math.min(4, zoom * (d > 0 ? 1.4 : 1 / 1.4))); render(); }
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && document.getElementById("fileViewer")){ ev.stopPropagation(); close(); } }, true);
  // スマホの「戻る」で閉じる
  window.addEventListener("popstate", () => { if (document.getElementById("fileViewer")) close(true); });
  let rt; window.addEventListener("resize", () => { if (!doc) return; clearTimeout(rt); rt = setTimeout(render, 300); });
  window.PdfView = { open, close, zoom: zoomBy };
})();
