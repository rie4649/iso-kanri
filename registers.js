/* =====================================================================
   ISOの計画・記録の台帳(ISO管理の「📋 ISOの計画・リスク」と見せるモードで共用)
   Firestore: isoRegisters(1行=1件。reg に台帳の種類、draft=true は下書き=見せるモードに出さない)
   項目を増やすときは、このファイルの fields に足すだけで入力画面と見せるモードの両方に出ます
   ===================================================================== */
const ISO_REG_COL = "isoRegisters";

// 環境側面の評価: 規模・頻度・法規制を 1〜3 で評価し、合計 7 以上 か 法規制が 3 なら「著しい環境側面」
const ASPECT_SIGNIFICANT_TOTAL = 7;
function aspectScore(r){
  const s = ["scale", "freq", "law"].map(k => Number(r[k]) || 0);
  if (s.some(v => !v)) return { total:0, sig:null };          // 未評価
  const total = s[0] + s[1] + s[2];
  return { total, sig: total >= ASPECT_SIGNIFICANT_TOTAL || s[2] === 3 };
}

const SCORE3 = [["", "未評価"], ["1", "1 小"], ["2", "2 中"], ["3", "3 大"]];

const ISO_REGS = [
  {
    key:"issues", icon:"🌏", name:"組織の課題", clause:"4.1",
    help:"会社を取り巻く外部の課題(法改正・気候変動・地域など)と、社内の課題(人材・設備など)を書き出します。審査では「自社の課題を把握しているか」を見られます。",
    title:"content",
    fields:[
      { k:"kind", label:"区分", type:"select", options:[["外部の課題","外部の課題"],["内部の課題","内部の課題"]], list:true },
      { k:"content", label:"課題", type:"textarea", req:true, list:true },
      { k:"effect", label:"環境や事業への影響", type:"textarea", list:true },
      { k:"action", label:"どう対応するか", type:"textarea", list:true }
    ],
    examples:[
      { kind:"外部の課題", content:"気候変動・燃料価格の高騰", effect:"軽油の使用量とCO₂排出量、運送コストに影響", action:"軽油使用量の削減目標を立て、毎月の使用量を確認する" },
      { kind:"外部の課題", content:"廃棄物処理法など関係法令の改正", effect:"許可条件や処理基準が変わる可能性", action:"法規制一覧で改正日を確認し、年1回順守評価を行う" },
      { kind:"外部の課題", content:"地域の生活環境への配慮", effect:"騒音・粉じん・車両の通行が近隣に影響する", action:"騒音チェック・清掃・車両点検を継続する" },
      { kind:"内部の課題", content:"従業員の高齢化と人材の確保", effect:"技術の継承や安全面に影響", action:"若年層の採用(SDGs目標)と教育訓練を続ける" },
      { kind:"内部の課題", content:"設備・車両の老朽化", effect:"故障や油漏れなどの環境事故のおそれ", action:"日常点検(点検ラクラク)と定期点検で早めに対応する" }
    ]
  },
  {
    key:"parties", icon:"🤝", name:"利害関係者の要求", clause:"4.2",
    help:"お客様・行政・地域・従業員など、会社に関わる人たちが何を求めているかと、そのうち必ず守るもの(順守義務)を整理します。",
    title:"party",
    fields:[
      { k:"party", label:"利害関係者", type:"text", req:true, list:true },
      { k:"needs", label:"求めていること(ニーズ・期待)", type:"textarea", list:true },
      { k:"obligation", label:"順守義務にするか", type:"select", options:[["する","する(必ず守る)"],["しない","しない(配慮する)"]], list:true },
      { k:"action", label:"会社の対応", type:"textarea", list:true }
    ],
    examples:[
      { party:"お客様(排出事業者)", needs:"廃棄物の適正な処理、マニフェストの確実な運用、契約どおりの対応", obligation:"する", action:"契約書・マニフェストの管理、委託先調査への回答" },
      { party:"行政(長野県・市町村)", needs:"許可条件と法令の順守、報告の提出", obligation:"する", action:"許可一覧で期限を管理し、法規制の順守評価を行う" },
      { party:"地域住民", needs:"騒音・粉じん・臭いがないこと、車両の安全な通行", obligation:"しない", action:"騒音チェック・清掃・安全運転の徹底" },
      { party:"従業員", needs:"安全で働きやすい職場", obligation:"しない", action:"安全衛生パトロール・教育訓練" },
      { party:"処分先・委託先", needs:"契約どおりの搬入、搬入条件の順守", obligation:"する", action:"契約の確認と搬入時の分別" }
    ]
  },
  {
    key:"roles", icon:"👥", name:"役割・責任と権限", clause:"5.3",
    help:"環境マネジメントの役割ごとに、誰が担当し、どんな責任と権限があるかを決めておきます。組織図と合わせて見せます。",
    title:"role",
    fields:[
      { k:"role", label:"役割", type:"text", req:true, list:true },
      { k:"person", label:"担当者", type:"text", list:true },
      { k:"duty", label:"責任と権限", type:"textarea", list:true }
    ],
    examples:[
      { role:"トップマネジメント(代表取締役)", person:"", duty:"環境方針の決定、必要な資源の提供、マネジメントレビューの実施" },
      { role:"環境管理責任者", person:"", duty:"環境マネジメントシステムの運用と改善、トップへの報告" },
      { role:"内部監査員", person:"", duty:"年1回の内部監査の実施と報告" },
      { role:"各部門の責任者", person:"", duty:"部門での手順書の周知と記録の管理" }
    ]
  },
  {
    key:"aspects", icon:"🌱", name:"環境側面", clause:"6.1.2",
    help:"仕事のどの活動が、環境にどんな影響を与えるか(環境側面)を書き出し、規模・頻度・法規制を1〜3で評価します。合計"+ASPECT_SIGNIFICANT_TOTAL+"以上、または法規制が3のものは「著しい環境側面」として重点的に管理します。",
    title:"aspect",
    fields:[
      { k:"activity", label:"活動・作業", type:"text", req:true, list:true },
      { k:"aspect", label:"環境側面(何が出る・何を使う)", type:"text", req:true, list:true },
      { k:"impact", label:"環境への影響", type:"text", list:true },
      { k:"cond", label:"状況", type:"select", options:[["通常","通常"],["非通常","非通常(点検・故障時など)"],["緊急","緊急(事故・災害時)"]], list:true },
      { k:"good", label:"良い影響か", type:"select", options:[["","悪い影響(減らす)"],["良い","良い影響(増やす)"]] },
      { k:"scale", label:"規模", type:"select", options:SCORE3, score:true },
      { k:"freq", label:"頻度", type:"select", options:SCORE3, score:true },
      { k:"law", label:"法規制", type:"select", options:SCORE3, score:true },
      { k:"control", label:"管理の方法(手順書・記録など)", type:"textarea", list:true }
    ],
    examples:[
      { activity:"車両の運行(収集運搬)", aspect:"軽油の使用", impact:"CO₂の排出(気候変動)", cond:"通常", control:"軽油使用量の毎月の記録と削減目標" },
      { activity:"車両の運行(収集運搬)", aspect:"廃棄物の飛散・落下", impact:"周辺環境の汚染", cond:"通常", control:"点検ラクラクの日常点検(飛散防止・落下防止)" },
      { activity:"金属の圧縮・切断・積み込み", aspect:"騒音・振動", impact:"近隣の生活環境への影響", cond:"通常", control:"騒音チェックの記録" },
      { activity:"構内での保管・作業", aspect:"雨水・排水への油分の混入", impact:"水質汚濁", cond:"通常", control:"水質検査の記録" },
      { activity:"重機・車両の使用", aspect:"油漏れ", impact:"土壌・水質の汚染", cond:"緊急", control:"緊急時対応の手順書(緊-01 油漏れ対策)" },
      { activity:"事務所・工場", aspect:"電気の使用", impact:"CO₂の排出", cond:"通常", control:"ライフラインの使用量の記録" },
      { activity:"エアコン・冷凍機器", aspect:"フロンの漏えい", impact:"オゾン層の破壊・温暖化", cond:"非通常", control:"フロン簡易点検の記録" },
      { activity:"金属スクラップのリサイクル", aspect:"資源の再生(ブリケット化)", impact:"資源の有効利用", cond:"通常", good:"良い", control:"ブリケット化率の目標(SDGs)" }
    ]
  },
  {
    key:"risks", icon:"⚠️", name:"リスクと機会", clause:"6.1.1 / 6.1.4",
    help:"課題・利害関係者・環境側面から、起こると困ること(リスク)と、良くなるチャンス(機会)を選び、どう取り組むかを決めます。",
    title:"content",
    fields:[
      { k:"kind", label:"種類", type:"select", options:[["リスク","リスク"],["機会","機会"]], list:true },
      { k:"content", label:"内容", type:"textarea", req:true, list:true },
      { k:"source", label:"きっかけ(関係する課題・側面など)", type:"text", list:true },
      { k:"action", label:"取り組み", type:"textarea", list:true },
      { k:"owner", label:"担当", type:"text", list:true },
      { k:"due", label:"期限", type:"date", list:true },
      { k:"status", label:"状況", type:"select", options:[["計画","計画"],["実施中","実施中"],["完了","完了"]], list:true }
    ],
    examples:[
      { kind:"リスク", content:"車両・重機からの油漏れによる土壌・水質の汚染", source:"環境側面:油漏れ", action:"日常点検と緊急時対応の訓練", status:"実施中" },
      { kind:"リスク", content:"許可の更新漏れ", source:"利害関係者:行政", action:"許可一覧で期限を管理する", status:"実施中" },
      { kind:"機会", content:"リサイクル率の向上による資源の有効利用と信頼の向上", source:"環境側面:資源の再生", action:"ブリケット化率80%を目標に取り組む", status:"実施中" }
    ]
  },
  {
    key:"objectives", icon:"🎯", name:"環境目標と実施計画", clause:"6.2",
    help:"環境目標ごとに、何を・誰が・いつまでに・どうやって評価するかを決めます(SDGsのページの目標と合わせて見せます)。",
    title:"goal",
    fields:[
      { k:"goal", label:"環境目標", type:"text", req:true, list:true },
      { k:"target", label:"目標値", type:"text", list:true },
      { k:"plan", label:"何をするか(実施事項)", type:"textarea", list:true },
      { k:"owner", label:"担当", type:"text", list:true },
      { k:"due", label:"期限", type:"date", list:true },
      { k:"measure", label:"どう評価するか", type:"text", list:true },
      { k:"progress", label:"進み具合", type:"textarea", list:true },
      { k:"status", label:"状況", type:"select", options:[["未着手","未着手"],["実施中","実施中"],["達成","達成"],["未達","未達"]], list:true }
    ],
    examples:[
      { goal:"軽油使用量の削減", target:"前年度比3%減(150,500L以下)", plan:"アイドリングストップ・配車の効率化", measure:"軽油使用量の年度集計", status:"実施中" },
      { goal:"金属のブリケット化率の向上", target:"80%(3年平均)", plan:"分別の徹底とブリケットマシンの活用", measure:"ブリケット化率の3年平均", status:"実施中" }
    ]
  },
  {
    key:"vendors", icon:"🏭", name:"外部委託先の管理", clause:"8.1",
    help:"処分を委託している処分先や、運搬を委託している会社などについて、許可・契約の期限と、評価(実地確認など)の結果を記録します。審査では「委託先をどう管理・評価しているか」を見られます。",
    title:"name",
    fields:[
      { k:"name", label:"委託先", type:"text", req:true, list:true },
      { k:"kind", label:"委託の内容", type:"select", options:[["処分","処分(中間処理・最終処分)"],["運搬","収集運搬"],["その他","その他(点検・測定など)"]], list:true },
      { k:"items", label:"主な品目・業務", type:"text", list:true },
      { k:"permitExp", label:"許可の有効期限", type:"date", list:true },
      { k:"contractExp", label:"契約の期限", type:"date", list:true },
      { k:"evalDate", label:"評価(実地確認など)をした日", type:"date", list:true },
      { k:"evalResult", label:"評価の結果", type:"select", options:[["",""],["適正","適正"],["条件付き","条件付きで適正"],["不適","不適"]], list:true },
      { k:"memo", label:"メモ", type:"textarea", list:true }
    ]
  },
  {
    key:"monitoring", icon:"📈", name:"監視・測定の計画", clause:"9.1.1",
    help:"何を・どの方法で・どのくらいの頻度で測り、どんな基準で判断するかの一覧です。審査では「監視・測定の対象と頻度、判断基準」を聞かれます。結果の記録は各ページ(水質検査・騒音チェックなど)にあります。",
    title:"item",
    fields:[
      { k:"item", label:"監視・測定する項目", type:"text", req:true, list:true },
      { k:"method", label:"方法", type:"text", list:true },
      { k:"freq", label:"頻度", type:"text", list:true },
      { k:"criteria", label:"判断基準", type:"text", list:true },
      { k:"owner", label:"担当", type:"text", list:true },
      { k:"record", label:"記録の場所", type:"text", list:true }
    ],
    examples:[
      { item:"排水の水質", method:"外部の検査機関による水質検査", freq:"", criteria:"排水基準(pHなど)", record:"ISO管理 水質検査" },
      { item:"敷地境界の騒音", method:"騒音計による測定", freq:"", criteria:"騒音規制法・条例の基準", record:"ISO管理 騒音チェック" },
      { item:"軽油の使用量", method:"給油記録の集計", freq:"毎月", criteria:"年度目標(前年度比3%減)", record:"ISO管理 軽油使用量" },
      { item:"電気・ガス・水道の使用量", method:"検針票の集計", freq:"毎月", criteria:"前年同月との比較", record:"ISO管理 ライフライン" },
      { item:"フロン使用機器の点検", method:"簡易点検", freq:"3か月ごと", criteria:"フロン排出抑制法の簡易点検", record:"ISO管理 フロン簡易点検" },
      { item:"車両の日常点検", method:"点検ラクラク(32項目)", freq:"毎日", criteria:"全項目「良」", record:"点検ラクラク" },
      { item:"法令の順守状況", method:"順守評価", freq:"年1回", criteria:"全法令「○」", record:"見せるモード 法規制一覧" }
    ]
  },
  {
    key:"comms", icon:"📞", name:"コミュニケーション・苦情", clause:"7.4",
    help:"お客様・近隣・行政などとの環境に関するやりとりや苦情を記録します。苦情がない年も「なし」と分かるように、問い合わせや報告も残しておくと安心です。",
    title:"content", dated:"date",
    fields:[
      { k:"date", label:"日付", type:"date", req:true, list:true },
      { k:"dir", label:"区分", type:"select", options:[["外部から","外部から"],["外部へ","外部へ"],["社内","社内"]], list:true },
      { k:"party", label:"相手", type:"text", list:true },
      { k:"kind", label:"種類", type:"select", options:[["問い合わせ","問い合わせ"],["苦情","苦情"],["要望","要望"],["行政","行政への報告・連絡"],["報告","報告"],["その他","その他"]], list:true },
      { k:"content", label:"内容", type:"textarea", req:true, list:true },
      { k:"response", label:"対応", type:"textarea", list:true },
      { k:"status", label:"状況", type:"select", options:[["対応中","対応中"],["完了","完了"]], list:true }
    ]
  },
  {
    key:"emergency", icon:"", name:"緊急事態の訓練・テスト", clause:"8.2",
    help:"油漏れ・火災・地震などの緊急事態を想定して、手順書どおりに動けるか訓練・テストした記録です。審査では「対応手順を定期的にテストし、結果を見て手順を見直しているか」を見られます。年1回以上が目安です。",
    title:"scenario", dated:"date",
    fields:[
      { k:"date", label:"実施日", type:"date", req:true, list:true },
      { k:"scenario", label:"想定した緊急事態", type:"text", req:true, list:true, ph:"例: 重機からの油漏れ(緊-01)" },
      { k:"manual", label:"使った手順書", type:"text", list:true, ph:"例: 緊-01 油漏れ対策" },
      { k:"members", label:"参加者", type:"text", list:true },
      { k:"content", label:"訓練・テストの内容", type:"textarea", list:true, ph:"例: 吸着マット・土のうの準備と、連絡の流れを確認" },
      { k:"result", label:"結果", type:"select", options:[["",""],["問題なし","問題なし"],["改善点あり","改善点あり"]], list:true },
      { k:"improve", label:"見つかった改善点と手順書の見直し", type:"textarea", list:true, ph:"例: 吸着マットの置き場所を表示した/手順書の連絡先を更新した" }
    ]
  },
  {
    key:"review", icon:"", name:"マネジメントレビュー", clause:"9.3",
    help:"年1回、環境管理責任者が社長に環境マネジメントの状況を報告し、社長が評価と指示を出した記録です。審査では、報告した内容(インプット)と、社長の評価・指示(アウトプット)がそろっているかを見られます。",
    title:"date", dated:"date",
    fields:[
      { k:"date", label:"実施日", type:"date", req:true, list:true },
      { k:"members", label:"出席者", type:"text", list:true, ph:"例: 代表取締役、環境管理責任者" },
      { k:"prev", label:"前回の指示の実施状況", type:"textarea", list:true },
      { k:"report", label:"報告した内容", type:"textarea", list:true, ph:"課題・利害関係者・順守義務の変化/環境目標の達成状況/監視測定・順守評価・内部監査の結果/苦情/是正処置/改善の機会 など" },
      { k:"evaluation", label:"環境マネジメントシステムの評価", type:"select", options:[["",""],["有効","適切・妥当・有効に機能している"],["一部改善","おおむね有効(一部改善が必要)"],["改善が必要","改善が必要"]], list:true },
      { k:"decision", label:"社長の指示・決定事項", type:"textarea", list:true, ph:"改善の指示、方針・目標の変更、必要な資源(人・設備・費用) など" }
    ]
  },
  {
    key:"calib", icon:"📏", name:"測定機器の点検・校正", clause:"9.1",
    help:"測定に使う機器(トラックスケール・騒音計・pH計など)の点検や校正・検定の記録です。次回の日付を入れると期限切れが分かります。",
    title:"name", dated:"last",
    fields:[
      { k:"name", label:"機器", type:"text", req:true, list:true },
      { k:"no", label:"管理番号", type:"text", list:true },
      { k:"use", label:"何の測定に使うか", type:"text", list:true },
      { k:"method", label:"方法", type:"select", options:[["検定","検定"],["社外校正","社外校正"],["社内点検","社内点検"]], list:true },
      { k:"last", label:"前回の実施日", type:"date", list:true },
      { k:"next", label:"次回の予定日", type:"date", list:true },
      { k:"result", label:"結果", type:"select", options:[["",""],["合格","合格・異常なし"],["調整済み","調整済み"],["不合格","不合格"]], list:true },
      { k:"memo", label:"メモ", type:"textarea", list:true }
    ],
    examples:[
      { name:"トラックスケール", use:"搬入・搬出の計量", method:"検定" },
      { name:"騒音計", use:"騒音チェック", method:"社内点検" }
    ]
  }
];

// 表示用: 選択肢の値 → 表示名
function regLabel(f, v){
  if (f.type === "select"){ const o = (f.options || []).find(x => x[0] === String(v ?? "")); return o ? o[1] : (v || ""); }
  if (f.type === "date" && v){ const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Number(m[1])+"/"+Number(m[2])+"/"+Number(m[3]) : v; }
  return v == null ? "" : String(v);
}
