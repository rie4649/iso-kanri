/* =====================================================================
   説明文を「❓ 説明」ボタンで出す・隠す(全画面共通・2026/10)
   ・ふだんは説明(入力欄の下の小さい説明・使い方・もっと詳しい説明)を隠して、画面をすっきりさせる
   ・右上の「❓ 説明」を押すと全部出る。選んだ状態はこの端末に覚える
   ・隠すもの：.field-hint ／ details.howto ／ details.help ／ details.hmore ／ .help-text ／ [data-help]
   ===================================================================== */
(function(){
  const KEY = "isoShowHelp";
  let on = false; try { on = localStorage.getItem(KEY) === "1"; } catch(e){}
  const st = document.createElement("style");
  st.textContent = "body:not(.showHelp) .field-hint, body:not(.showHelp) details.howto, body:not(.showHelp) details.help, body:not(.showHelp) details.hmore, body:not(.showHelp) .help-text, body:not(.showHelp) [data-help]{display:none !important;}" +
    "#helpTgl{position:fixed;top:10px;right:10px;z-index:9000;border:1.5px solid #1e3a5f;background:#fff;color:#1e3a5f;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.15);}" +
    "body.showHelp #helpTgl{background:#1e3a5f;color:#fff;}@media (max-width:700px){#helpTgl{top:auto;bottom:12px;left:12px;right:auto;}}@media print{#helpTgl{display:none;}}";
  document.head.appendChild(st);
  function apply(){ document.body.classList.toggle("showHelp", on); const b = document.getElementById("helpTgl"); if (b) b.textContent = on ? "❓ 説明を隠す" : "❓ 説明"; }
  function init(){
    const b = document.createElement("button"); b.id = "helpTgl"; b.type = "button"; b.title = "画面の説明を出す・隠す";
    b.onclick = () => { on = !on; try { localStorage.setItem(KEY, on ? "1" : "0"); } catch(e){} apply(); };
    document.body.appendChild(b); apply();
  }
  if (document.body) init(); else document.addEventListener("DOMContentLoaded", init);
})();
