/* =====================================================================
   データベースの鍵(2026/11/19 版 11/19-1)
   ・アプリを開くと、裏で「匿名ログイン」をする(使う人の操作は何も変わらない)
   ・ログインが終わるまで、データベースを読む・書くのを少しだけ待たせる
     (Firebaseのルールを「ログインした人だけ」にしても、最初の読み込みが失敗しないように)
   ・匿名ログインがまだオンになっていないときは、そのまま今までどおり動く
   使い方: firebase-database-compat.js のすぐ後に
     <script src="https://www.gstatic.com/firebasejs/12.15.0/firebase-auth-compat.js"></script>
     <script src="auth-gate.js"></script>
   ===================================================================== */
(function(){
  if (!window.firebase || !firebase.database || !firebase.database.Reference) return;
  var ready = null, isReady = false;
  function authReady(){
    if (ready) return ready;
    ready = new Promise(function(res){
      var done = false, finish = function(){ if (!done){ done = true; isReady = true; res(); } };
      try {
        var auth = firebase.auth();   // いちばん最初のアプリ(点検ラクラク)のログイン
        var un = auth.onAuthStateChanged(function(u){
          try { un(); } catch(e){}
          if (u) return finish();
          auth.signInAnonymously().then(finish).catch(function(e){ console.warn("匿名ログインできませんでした(Firebaseで匿名ログインをオンにしてください)", e && e.code); finish(); });
        });
        setTimeout(finish, 8000);   // 通信が悪いときも、8秒で先へ進む
      } catch(e){ console.warn("ログインの部品がありません", e); finish(); }
    });
    return ready;
  }
  window.tenkenAuthReady = authReady;
  var Q = firebase.database.Query.prototype, R = firebase.database.Reference.prototype;
  // 読む: on は「あとで登録」、once・get は待ってから
  var oOn = Q.on, oOnce = Q.once, oGet = Q.get;
  // ログインが済んでいたら、すぐ登録(off とのじゅんばんがくずれないように)
  Q.on = function(type, cb, a, b){ if (isReady) return oOn.apply(this, arguments); var self = this, args = arguments; authReady().then(function(){ oOn.apply(self, args); }); return cb; };
  var oOff = Q.off;   // ログイン前に off されたときも、on と同じじゅんばんで後から外す
  Q.off = function(){ if (isReady) return oOff.apply(this, arguments); var self = this, args = arguments; authReady().then(function(){ oOff.apply(self, args); }); };
  Q.once = function(){ if (isReady) return oOnce.apply(this, arguments); var self = this, args = arguments; return authReady().then(function(){ return oOnce.apply(self, args); }); };
  if (oGet) Q.get = function(){ var self = this, args = arguments; return authReady().then(function(){ return oGet.apply(self, args); }); };
  // 書く: 待ってから
  ["set", "update", "remove", "setWithPriority", "setPriority", "transaction"].forEach(function(m){
    var o = R[m]; if (!o) return;
    R[m] = function(){ var self = this, args = arguments; return authReady().then(function(){ return o.apply(self, args); }); };
  });
  // push(値): 番号(key)はすぐ決めて、書くのは待ってから
  var oPush = R.push;
  R.push = function(value, onComplete){
    if (value === undefined) return oPush.call(this);
    var r = oPush.call(this), p = r.set(value).then(function(){ if (onComplete) onComplete(null); }, function(e){ if (onComplete) onComplete(e); throw e; });
    r.then = p.then.bind(p); r.catch = p.catch.bind(p);
    return r;
  };
})();
