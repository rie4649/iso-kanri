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
  const mark = r.sigMark === "◎";   // 評価表(EMS-A-06/07)で「著しい環境側面」に◎を付けたもの
  if (s.some(v => !v)) return { total:0, sig: mark ? true : (r.srcDoc || r.sigMark === "—" ? false : null), byMark:true };   // 点数なし: ◎の有無で判断(点数も印もなければ未評価)
  const total = s[0] + s[1] + s[2];
  return { total, sig: mark || total >= ASPECT_SIGNIFICANT_TOTAL || s[2] === 3 };
}

const SCORE3 = [["", "未評価"], ["1", "1 小"], ["2", "2 中"], ["3", "3 大"]];

// 取引先チェック表(環境マニュアル 6.1.5): 5項目を0〜2点 → 合計でランク A:8〜10 B:5〜7 C:0〜4
const VENDOR_PTS = [["", "未評価"], ["0", "0点"], ["1", "1点"], ["2", "2点"]];
const VENDOR_CHECK_KEYS = ["vcCert", "vcPolicy", "vcCo2", "vcLaw", "vcAccident"];
function vendorCheck(r){
  const v = VENDOR_CHECK_KEYS.map(k => r[k]);
  if (v.some(x => x === "" || x == null)) return { done:false, total:0, rank:"" };
  const total = v.reduce((a, x) => a + Number(x), 0);
  return { done:true, total, rank: total >= 8 ? "A" : total >= 5 ? "B" : "C" };
}
const VENDOR_RANK_ACTION = { A:"継続", B:"改善を要請する", C:"取引の見直しを検討する" };
// 環境影響評価表(EMS-A-06 有害・A-07 有益)の○印の区分。checks 型は「、」区切りの文字で保存
const ASPECT_CATS = ["大気汚染","水質汚濁","土壌汚染","資源・森林等の減少","水資源の減少","地球温暖化","悪臭・騒音・振動","廃棄物処分場の減少","自然災害(地震・台風等）","人への健康障害"];
const ASPECT_CONTRIB = ["直接的環境改善効果","環境意識の高揚","収益(コストダウン)","企業イメージアップ","業務の効率化","地域貢献","行政・地域・顧客の要望"];
// 年度(8月〜翌7月)。年度の点検の記録は 行.checks["2026"] = { r:結果, d:日付, memo }
const ycFy = (d) => { d = d ? new Date(d) : new Date(); return d.getMonth() + 1 >= 8 ? d.getFullYear() : d.getFullYear() - 1; };
const hasCheck = (v, name) => String(v || "").split("、").includes(name);
// リスクの優先度(環境マニュアル 6.1.4)
const RISK_LEVELS = [["", "未評価"], ["低", "低(監視のみ)"], ["中", "中(改善計画に反映)"], ["高", "高(重点管理・マネジメントレビューで必ず確認)"]];

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
    help:"お客様・行政・地域・従業員など、会社に関わる人たちが何を求めているかと、そのうち必ず守るもの(順守義務)を整理します。環境マニュアル4.2の表(〇＝法令や契約に基づく順守義務、△＝社会的期待や自主的取り組み)と同じ内容です。気候変動への対応はリスク対応計画書に記録します。",
    title:"party",
    fields:[
      { k:"party", label:"利害関係者", type:"text", req:true, list:true },
      { k:"needs", label:"求めていること(ニーズ・期待)", type:"textarea", list:true },
      { k:"obligation", label:"順守義務", type:"select", options:[["する","〇 順守義務(法令・契約)"],["しない","△ 社会的期待・自主的取り組み"]], list:true },
      { k:"obLaw", label:"順守義務の根拠(法令・契約)", type:"text", list:true, ph:"例: 労働安全衛生法／委託契約" },
      { k:"risk", label:"リスク", type:"textarea", list:true },
      { k:"chance", label:"チャンス", type:"textarea", list:true },
      { k:"action", label:"会社の対応", type:"textarea", list:true },
      { k:"checkDate", label:"確認日", type:"date", list:true }
    ],
    examples:[
      { party:"行政機関", needs:"法令順守、報告義務、気候変動対応", obligation:"する", action:"許可一覧で期限を管理し、法規制の順守評価を行う。立入検査・指導は行政照会記録に残す" },
      { party:"顧客", needs:"品質確保、回収日程遵守、CO₂削減目標", obligation:"しない", action:"委託先調査票への回答・現地確認の対応、軽油使用量の削減" },
      { party:"従業員", needs:"安全衛生、教育訓練、働き方改善", obligation:"する", action:"安全衛生パトロール・教育訓練" },
      { party:"経営者", needs:"収益確保、環境目標達成、地域協調性", obligation:"しない", action:"環境活動計画とマネジメントレビュー" },
      { party:"搬入先・処分先", needs:"品質維持、適正処分、認証確認", obligation:"する", action:"契約・許可の確認と取引先チェック表での評価" },
      { party:"外注先", needs:"コスト適正化、納期遵守、環境方針共有", obligation:"しない", action:"環境方針の共有と取引先チェック表での評価" },
      { party:"地域住民", needs:"騒音防止、水質保全、災害対応", obligation:"する", action:"騒音チェック・水質検査・緊急事態の訓練" }
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
      { role:"トップマネジメント(社長)", person:"関根 健巳", duty:"環境管理責任者・内部監査委員長の任命／環境方針の確立・維持／EMSに必要な経営資源の提供／順守義務の達成の確保／マネジメントレビューの実施" },
      { role:"環境管理責任者", person:"川村 理絵", duty:"EMSがISO14001に適合することの確保／プロセスが意図した結果を生むことの確保／パフォーマンスと改善機会の社長への報告／最新状態の維持と日常点検・改善／会議の主宰と議事録の作成・管理／問題点の収集・整理・対策立案・評価" },
      { role:"ISO事務局", person:"", duty:"環境管理責任者の指示に従い、EMS推進のための実務を行う" },
      { role:"内部環境監査委員長", person:"", duty:"内部監査プログラムの立案／チームリーダー・メンバーの選定／監査の実施と社長への報告／内部監査の適時の実施の確保" },
      { role:"内部監査委員", person:"", duty:"内部監査の準備／内部監査結果の報告／フォローアップの実施" },
      { role:"ISO推進委員会", person:"", duty:"環境管理責任者・内部環境監査委員長・ISO推進委員で構成。環境目的・目標の設定の検討など、EMSの重要事項を審議" },
      { role:"ISO推進委員", person:"", duty:"委員会のメンバーとして環境管理責任者との橋渡し／環境管理責任者の補佐／委員会での議論・検討への参加" }
    ]
  },
  {
    key:"aspects", icon:"🌱", name:"環境側面", clause:"6.1.2",
    help:"受入・運搬・保管・再資源化・出荷の流れで、環境にどんな影響を与えるか(環境側面)を有害(リスク)・有益(機会)の両面から書き出します。環境マニュアル6.1.2: 法令に関わる／漏えい・飛散・火災など重大な汚染リスク／気候変動の影響が大きい／利害関係者の要求が強い／緊急事態に該当（有益は CO₂削減・省資源・再資源化、利害関係者の期待、コスト削減、社員・地域への貢献）のどれかに当たるものを「◎ 著しい環境側面」にします。毎年8月に見直します。規模・頻度・法規制の点数(1〜3)で目安を出すこともできます。",
    title:"aspect",
    yearCheck:{ opts:[["OK","✓ 変更なし"],["見直し","見直しが必要"]], all:"OK" },
    fields:[
      { k:"activity", label:"活動・作業", type:"text", req:true, list:true },
      { k:"aspect", label:"環境側面(何が出る・何を使う)", type:"text", req:true, list:true },
      { k:"impact", label:"環境への影響", type:"text", list:true },
      { k:"cond", label:"状況", type:"select", options:[["通常","通常"],["非通常","非通常(点検・故障時など)"],["緊急","緊急(事故・災害時)"]], list:true },
      { k:"good", label:"良い影響か", type:"select", options:[["","悪い影響(減らす)"],["良い","良い影響(増やす)"]] },
      { k:"scale", label:"規模", type:"select", options:SCORE3, score:true },
      { k:"freq", label:"頻度", type:"select", options:SCORE3, score:true },
      { k:"law", label:"法規制", type:"select", options:SCORE3, score:true },
      { k:"lawName", label:"法規制名", type:"text", list:true },
      { k:"emergency", label:"緊急事態の特定", type:"text" },
      { k:"control", label:"管理の方法(手順書・記録など)", type:"textarea", list:true },
      { k:"sigMark", label:"著しい環境側面", type:"select", options:[["","(点数で判断)"],["◎","◎ 著しい環境側面"],["—","— 該当しない"]], list:true },
      { k:"dirKind", label:"影響区分", type:"checks", options:["直接影響","間接影響"] },
      { k:"cats", label:"環境影響(有害 EMS-A-06 の○)", type:"checks", options:ASPECT_CATS, only:"bad" },
      { k:"biz", label:"ビジネス", type:"checks", options:["ビジネスチャンス","ビジネスリスク"] },
      { k:"mgmt", label:"管理状況(有害 EMS-A-06)", type:"checks", options:["手順書化","訓練","力量"], only:"bad" },
      { k:"contrib", label:"有益環境影響度(有益 EMS-A-07 の○)", type:"checks", options:ASPECT_CONTRIB, only:"good" }
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
    help:"課題・利害関係者・環境側面から、起こると困ること(リスク)と、良くなるチャンス(機会)を選び、どう取り組むかを決めます(リスク対応計画書)。環境マニュアル6.1.4: 優先度を 低(監視のみ)・中(改善計画に反映)・高(重点管理) で決め、「高」は必ずマネジメントレビューで確認します。気候変動(異常気象・CO₂排出規制・地域災害)もここに記録します。",
    title:"issue", sortNo:true,
    yearCheck:{ opts:[["OK","✓ 変更なし"],["見直し","見直しが必要"]], all:"OK" },
    fields:[
      { k:"no", label:"No.", type:"text", list:true },
      { k:"issue", label:"課題", type:"text", req:true, list:true },
      { k:"content", label:"状況", type:"textarea", list:true },
      { k:"action", label:"活動計画", type:"textarea", list:true },
      { k:"risk", label:"リスク", type:"textarea", list:true },
      { k:"chance", label:"チャンス(機会)", type:"textarea", list:true },
      { k:"freq", label:"チェック頻度", type:"select", options:[["",""],["毎月","毎月(月次レビュー・推進委員会)"],["半期","半期(半期末レビュー・環境管理責任者)"],["年次","年次(年一回・マネジメントレビュー)"],["随時","随時(法改正・災害発生時)"]], list:true },
      { k:"parties", label:"主な利害関係者", type:"text", list:true },
      { k:"level", label:"優先度(6.1.4)", type:"select", options:RISK_LEVELS, list:true }
    ],
    examples:[
      { kind:"リスク", content:"車両・重機からの油漏れによる土壌・水質の汚染", source:"環境側面:油漏れ", action:"日常点検と緊急時対応の訓練", status:"実施中" },
      { kind:"リスク", content:"許可の更新漏れ", source:"利害関係者:行政", action:"許可一覧で期限を管理する", status:"実施中" },
      { kind:"機会", content:"リサイクル率の向上による資源の有効利用と信頼の向上", source:"環境側面:資源の再生", action:"ブリケット化率80%を目標に取り組む", status:"実施中" }
    ]
  },
  {
    key:"objectives", icon:"🎯", name:"環境目標と実施計画", clause:"6.2",
    help:"環境目標ごとに、何を・誰が・いつまでに・どうやって評価するかを決めます(SDGsのページの目標と合わせて見せます)。環境マニュアル6.2: 環境目的の達成期間は原則3年、環境目標は初年度・2年度・最終年度の1年単位。毎年7月に見直します。進捗は「進捗記録兼評価表」に記録し、半期末(1月末)・年度末(7月末)に未達成なら不適合として是正処置を行います。",
    title:"goal", group:"kubun", groupFields:[],
    yearCheck:{ opts:[["OK","✓ 変更なし"],["見直し","見直しが必要"]], all:"OK" },
    fields:[
      { k:"kubun", label:"区分", type:"text", list:true, ph:"例: 社内活動" },
      { k:"act", label:"活動名", type:"text", list:true, ph:"例: 5S活動" },
      { k:"goal", label:"環境目的", type:"textarea", req:true, list:true },
      { k:"plan", label:"実施計画", type:"textarea", list:true },
      { k:"target", label:"環境目標(令和7年〜令和9年)", type:"text", list:true },
      { k:"target2", label:"環境目標(令和8年〜令和11年)", type:"text", list:true },
      { k:"sdgs", label:"関連SDGs", type:"text", list:true },
      { k:"sdgsPurpose", label:"SDGs目的", type:"textarea", list:true },
      { k:"method", label:"実施方法", type:"textarea", list:true },
      { k:"monitor", label:"監視方法", type:"textarea", list:true },
      { k:"owner", label:"担当者", type:"text", list:true },
      { k:"status", label:"状況", type:"select", options:[["実施中","実施中"],["達成","達成"],["未達","未達"],["未着手","未着手"]], list:true }
    ],
    examples:[
      { goal:"軽油使用量の削減", target:"前年度比3%減(150,500L以下)", plan:"アイドリングストップ・配車の効率化", measure:"軽油使用量の年度集計", status:"実施中" },
      { goal:"金属のブリケット化率の向上", target:"80%(3年平均)", plan:"分別の徹底とブリケットマシンの活用", measure:"ブリケット化率の3年平均", status:"実施中" }
    ]
  },
  {
    key:"legal", icon:"⚖️", name:"法的要求事項特定書", clause:"6.1.3 / 9.1.2",
    help:"環境法規制順守評価記録兼環境法的要求事項特定書(EMS-A-05)です。法令ごとに、該当する条項・内容・対象設備・順守方法を1行ずつ入れ、年1回「順守状況の評価」(順守・非該当・要改善)を付けます。No.が同じ行は1つの法令としてまとまり、法令名・気候変動ESG・利害関係者・評価は、どの行で直しても同じNo.の行全部に入ります。評価が終わったら「この表で新しい版(PDF)を作る」で、今の様式のPDFが原本の新しい版になります。「要改善」は是正処置へ。",
    title:"name", sortNo:true, group:"no", groupFields:["name","esg","esgNote","parties","eval"],
    yearCheck:{ perGroup:true, field:"eval", opts:[["順守","順守"],["非該当","非該当"],["要改善","要改善"]], all:"順守" },
    fields:[
      { k:"no", label:"No.", type:"text", req:true, list:true, ph:"例: 1" },
      { k:"name", label:"法規制等の名称", type:"text", list:true, ph:"同じNo.の行があれば空のままでOK(自動で入ります)" },
      { k:"clause", label:"該当する条項", type:"textarea", list:true },
      { k:"content", label:"内容", type:"textarea", list:true },
      { k:"target", label:"対象設備・業務", type:"textarea", list:true },
      { k:"esg", label:"気候変動・ESG関連", type:"select", options:[["",""],["〇","〇 関連あり"]], list:true },
      { k:"esgNote", label:"気候変動・ESGの内容", type:"textarea", list:true },
      { k:"parties", label:"地域・利害関係者との関連", type:"text", list:true },
      { k:"method", label:"順守方法", type:"textarea", list:true },
      { k:"eval", label:"順守状況の評価", type:"select", options:[["",""],["順守","順守"],["非該当","非該当"],["要改善","要改善"]], list:true }
    ]
  },
  {
    key:"sigAspects", icon:"◎", name:"著しい環境側面特定表", clause:"6.1.2",
    help:"著しい環境側面特定表(EMS-A-08)です。環境手順書ごとに、環境影響・ライフサイクル区分(受入〜運搬〜保管〜再資源化〜出荷)・有害/有益・対応方法と、著しい環境側面(◎)とした理由を記録します。判定基準(有害): 法令に関わる／漏えい・飛散・火災などの重大リスク／気候変動の影響が大きい／利害関係者の要求が強い／緊急事態。(有益): 環境改善効果が大きい／利害関係者の期待／経営上のメリット／社員・地域への貢献。年1回(11月)見直します。",
    title:"manName", group:"group", groupFields:[],
    yearCheck:{ field:"check", opts:[["OK","✓ 変更なし"],["見直し","見直しが必要"]], all:"OK" },
    fields:[
      { k:"group", label:"環境影響の分類", type:"text", list:true, ph:"例: 社内ルール・車両管理・廃棄物管理・安全管理・環境対策・緊急・災害" },
      { k:"impact", label:"環境影響", type:"text", list:true, ph:"例: 事故・資源・法令" },
      { k:"life", label:"ライフサイクル区分", type:"select", options:[["",""],["受入・分別","受入・分別"],["受入・運搬","受入・運搬"],["運搬","運搬"],["管理","管理"],["再資源化","再資源化"],["出荷","出荷"],["緊急対応","緊急対応"]], list:true },
      { k:"manNo", label:"手順書No.", type:"text", list:true },
      { k:"manName", label:"手順書内容", type:"text", req:true, list:true },
      { k:"kind", label:"区分", type:"select", options:[["",""],["有害","有害(リスク)"],["有益","有益(機会)"]], list:true },
      { k:"action", label:"対応方法", type:"text", list:true },
      { k:"sig", label:"著しい環境側面", type:"select", options:[["",""],["◎","◎"]], list:true },
      { k:"reason", label:"著しい理由", type:"textarea", list:true },
      { k:"check", label:"確認", type:"text", list:true }
    ]
  },
  {
    key:"changes", icon:"🔁", name:"変更管理記録", clause:"6.3",
    help:"環境マネジメントに影響する変更を、前もって評価して記録します(環境マニュアル6.3)。対象: 新規事業の開始／新しい設備の導入・更新／法規制の改正／組織改編・人員の変更／委託先・取引先の変更。環境側面・順守義務・リスクへの影響を評価し、必要なら著しい環境側面特定表・環境活動計画を直し、教育で周知して、マネジメントレビューで有効性を確認します。",
    title:"content", dated:"date",
    fields:[
      { k:"date", label:"日付", type:"date", req:true, list:true },
      { k:"kind", label:"変更の種類", type:"select", options:[["新規事業","新規事業の開始"],["設備","新設備の導入・更新"],["法改正","法規制の改正"],["組織","組織改編・人員変更"],["委託先","委託先・取引先の変更"],["その他","その他"]], list:true },
      { k:"content", label:"変更の内容", type:"textarea", req:true, list:true, ph:"例: 積替え保管場所の移転" },
      { k:"effect", label:"影響の評価(環境側面・順守義務・リスク及び機会)", type:"textarea", list:true },
      { k:"update", label:"直した書類", type:"textarea", list:true, ph:"例: 著しい環境側面特定表・環境活動計画・許可の内容" },
      { k:"training", label:"周知・教育", type:"text", list:true, ph:"例: 10/1 朝礼で周知(教育訓練記録)" },
      { k:"review", label:"マネジメントレビューでの確認", type:"text", list:true },
      { k:"status", label:"状況", type:"select", options:[["対応中","対応中"],["完了","完了"]], list:true }
    ]
  },
  {
    key:"vendors", icon:"🏭", name:"外部委託先の管理", clause:"8.1",
    help:"処分を委託している処分先や、運搬を委託している会社などについて、許可・契約の期限と評価を記録します。環境マニュアル6.1.5の「取引先チェック表」: 認証有無・環境方針・CO₂削減目標・法令遵守状況・事故/不適合履歴の5項目を0〜2点で採点し、合計 8〜10点=A、5〜7点=B、0〜4点=C。Bは改善を要請、Cは取引の見直しを検討します。新規契約のときに初期評価、その後は年1回(8月)見直し、結果はリスク対応計画書とマネジメントレビューに反映します。",
    title:"name",
    yearCheck:{ opts:[["OK","✓ 変更なし"],["見直し","見直しが必要"]], all:"OK" },
    fields:[
      { k:"name", label:"取引先・委託先", type:"text", req:true, list:true },
      { k:"kind", label:"委託の内容", type:"select", options:[["",""],["処分","処分(中間処理・最終処分)"],["運搬","収集運搬"],["その他","その他(点検・測定など)"]], list:true },
      { k:"items", label:"主な品目・業務", type:"text", list:true },
      { k:"permitExp", label:"許可の有効期限", type:"date", list:true },
      { k:"contractExp", label:"契約の期限", type:"date", list:true },
      { k:"evalDate", label:"評価(取引先チェック・実地確認など)をした日", type:"date", list:true },
      { k:"evalKind", label:"評価の種類", type:"select", options:[["",""],["初期","初期評価(新規契約時)"],["定期","定期の見直し(毎年8月)"],["臨時","臨時(事故・変更など)"]], list:true },
      { k:"certName", label:"認証の種類", type:"text", list:true, ph:"例: ISO14001・エコアクション21・なし" },
      { k:"vcCert", label:"認証有無(ISO等)", type:"select", options:VENDOR_PTS, pts:true },
      { k:"vcPolicy", label:"環境方針", type:"select", options:VENDOR_PTS, pts:true },
      { k:"vcCo2", label:"CO₂削減目標", type:"select", options:VENDOR_PTS, pts:true },
      { k:"vcLaw", label:"法令遵守状況", type:"select", options:VENDOR_PTS, pts:true },
      { k:"vcAccident", label:"事故・不適合履歴", type:"select", options:VENDOR_PTS, pts:true },
      { k:"evalResult", label:"評価の結果", type:"select", options:[["",""],["適正","適正"],["条件付き","条件付きで適正"],["不適","不適"]], list:true },
      { k:"checkHow", label:"確認の方法", type:"text", list:true, ph:"例: ホームページ・認証書の写し・聞き取り" },
      { k:"followup", label:"対応(Bは改善要請、Cは見直しの検討)", type:"textarea", list:true, ph:"例: 2025/12/10 CO₂削減目標の設定をお願いした／許可・法令順守は確認済みのため取引継続" },
      { k:"memo", label:"メモ", type:"textarea", list:true }
    ]
  },
  {
    key:"monitoring", icon:"📈", name:"監視・測定の計画", clause:"9.1.1",
    help:"環境マニュアル9.1.1の「管理項目の設定」の表を、くわしくしたものです。何を・どの方法で・どの基準で・いつ測り、いつ結果を分析・評価するか。結果はそれぞれの記録画面に残り、マネジメントレビュー前に評価します。ここは計画なので、EMS文書の番号はいりません(結果の記録が証拠になります)。",
    title:"item",
    fields:[
      { k:"item", label:"監視・測定対象", type:"text", req:true, list:true },
      { k:"method", label:"監視・測定方法", type:"text", list:true },
      { k:"criteria", label:"評価基準及び適切な指標", type:"text", list:true },
      { k:"freq", label:"監視及び測定時期", type:"text", list:true },
      { k:"review", label:"結果の分析及び評価時期", type:"text", list:true, ph:"例: マネジメントレビュー前" },
      { k:"owner", label:"担当", type:"text", list:true },
      { k:"record", label:"記録の場所", type:"text", list:true }
    ],
    examples:[
      { item:"排水の水質", method:"外部の検査機関による水質検査", freq:"", criteria:"排水基準(pHなど)", record:"ISO管理 水質検査" },
      { item:"敷地境界の騒音", method:"騒音計による測定", freq:"", criteria:"騒音規制法・条例の基準", record:"ISO管理 騒音チェック" },
      { item:"軽油の使用量", method:"給油記録の集計", freq:"毎月", criteria:"年度目標(前年度比3%減)", record:"ISO管理 軽油使用量" },
      { item:"電気・ガス・水道の使用量", method:"検針票の集計", freq:"毎月", criteria:"前年同月との比較", record:"ISO管理 ライフライン" },
      { item:"フロン使用機器の点検", method:"簡易点検", freq:"3か月ごと", criteria:"フロン排出抑制法の簡易点検", record:"ISO管理 フロン排出抑制法簡易点検" },
      { item:"車両の日常点検", method:"点検ラクラク(32項目)", freq:"毎日", criteria:"全項目「良」", record:"点検ラクラク" },
      { item:"法令の順守状況", method:"順守評価", freq:"年1回", criteria:"全法令「○」", record:"環境への取り組み 法規制一覧" }
    ]
  },
  {
    key:"comms", icon:"📞", name:"コミュニケーション・苦情", clause:"7.4",
    help:"お客様・近隣・行政などとの環境に関するやりとりや苦情を記録します。環境マニュアル7.4.3の区分で記録します。立入検査・指導・問い合わせ・視察(行政対応)はカレンダーの「行政照会記録」、苦情は「クレーム対応報告書」にも残します。社員や社外からの改善提案・要望は「提案情報」で記録します(7.4.2)。",
    title:"content", dated:"date",
    fields:[
      { k:"date", label:"日付", type:"date", req:true, list:true },
      { k:"dir", label:"区分", type:"select", options:[["外部から","外部から"],["外部へ","外部へ"],["社内","社内"]], list:true },
      { k:"party", label:"相手", type:"text", list:true },
      { k:"kind", label:"種類(7.4.3の区分)", type:"select", options:[["法令","法令・条例対応(情報収集・報告・火災・事故時)"],["行政","行政対応(立入検査・指導・問い合わせ・視察)"],["顧客","顧客対応(顧客からの要求事項・監査)"],["苦情","苦情対応"],["業界","業界情報"],["技術","技術情報提供"],["是正","是正処置"],["気候","気候変動対応情報"],["提案","提案情報(改善提案・要望)"],["問い合わせ","問い合わせ"],["要望","要望"],["報告","報告"],["その他","その他"]], list:true },
      { k:"content", label:"内容", type:"textarea", req:true, list:true },
      { k:"response", label:"対応", type:"textarea", list:true },
      { k:"answerDate", label:"相手への回答日", type:"date", list:true },
      { k:"fixNeed", label:"是正処置", type:"select", options:[["",""],["要","要(是正処置に記録する)"],["否","否"]], list:true },
      { k:"status", label:"状況", type:"select", options:[["対応中","対応中"],["完了","完了"]], list:true }
    ]
  },
  {
    key:"emergency", icon:"", name:"緊急事態の訓練・テスト", clause:"8.2",
    help:"油漏れ・火災・地震などの緊急事態を想定して、手順書どおりに動けるか訓練・テストした記録です。審査では「対応手順を定期的にテストし、結果を見て手順を見直しているか」を見られます。環境マニュアル8.2: 定期テストのあと内容をレビューして「定期テスト記録」に残し、緊急事態の手順書は年1回11月に見直します。緊急事態が実際に起きたときは不適合として是正処置を行います。",
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
    help:"社長が主宰し、環境管理責任者とISO推進委員会が参加して、環境マネジメントの適切性・妥当性・有効性を確認した記録です(環境マニュアル9.3)。インプット: 内部監査結果・順守義務・目標の達成度・パフォーマンス・是正処置・利害関係者の意見・気候変動リスク・取引先リスク評価・資源。アウトプット(社長の指示)は環境活動計画・リスク対応計画書に反映します。",
    title:"date", dated:"date",
    fields:[
      { k:"date", label:"実施日", type:"date", req:true, list:true },
      { k:"members", label:"出席者", type:"text", list:true, ph:"例: 代表取締役、環境管理責任者" },
      { k:"prev", label:"前回の指示の実施状況", type:"textarea", list:true },
      { k:"report", label:"報告した内容(インプット)", type:"textarea", list:true, ph:"内部監査結果／順守義務の状況／環境目標の達成度／環境パフォーマンスの測定結果／是正処置の状況／利害関係者からの意見／資源の適切性 など" },
      { k:"highRisk", label:"「高」のリスクの確認(6.1.4)", type:"textarea", list:true, ph:"リスク対応計画書で優先度「高」のもの" },
      { k:"climate", label:"気候変動リスクの評価", type:"textarea", list:true, ph:"異常気象・CO₂排出規制・災害リスク" },
      { k:"supplier", label:"取引先リスク評価(サプライチェーン)", type:"textarea", list:true, ph:"取引先チェック表のB・Cランクと対応" },
      { k:"evaluation", label:"環境マネジメントシステムの評価", type:"select", options:[["",""],["有効","適切・妥当・有効に機能している"],["一部改善","おおむね有効(一部改善が必要)"],["改善が必要","改善が必要"]], list:true },
      { k:"decision", label:"社長の指示・決定事項(アウトプット)", type:"textarea", list:true, ph:"EMSの改善／環境方針・目標の改訂／気候変動対応の新たな取組み／サプライチェーンの改善要請／資源の提供／教育訓練の強化 など" }
    ]
  },
  {
    key:"auditPlan", icon:"🗓️", name:"内部監査の計画", clause:"9.2",
    help:"内部監査の日程と分担を決めた記録です(監査日程決定記録 EMS-C-01・環境マニュアル9.2)。毎年10月〜2月の間に、どの部署・仕事を、誰が、いつ監査するかを決めます。監査員は自分の仕事は監査しません(客観性)。終わったら「実施日」を入れ、指摘や結果は「内部監査・是正処置」に記録します。",
    title:"area", dated:"date",
    fields:[
      { k:"date", label:"監査の予定日", type:"date", req:true, list:true },
      { k:"area", label:"監査する部署・仕事", type:"text", req:true, list:true, ph:"例: ヤード(積替え保管・選別)／事務所(記録類)／車両(収集運搬)" },
      { k:"clause", label:"主に確認すること(環境マニュアルの項目)", type:"text", list:true, ph:"例: 6.1.2 環境側面・8.1 運用・9.1 監視測定" },
      { k:"auditor", label:"監査員", type:"text", list:true },
      { k:"auditee", label:"監査を受ける人", type:"text", list:true },
      { k:"decidedOn", label:"日程を決めた日", type:"date", list:true },
      { k:"decidedBy", label:"決めた人(承認)", type:"text", list:true, ph:"例: 環境管理責任者" },
      { k:"done", label:"実施日", type:"date", list:true },
      { k:"status", label:"状況", type:"select", options:[["予定","予定"],["実施済み","実施済み"],["延期","延期"]], list:true }
    ],
    examples:[
      { area:"ヤード(積替え保管・選別)", clause:"6.1.2・8.1・8.2", status:"予定" },
      { area:"事務所(記録類・委託契約)", clause:"6.1.3・7.5・8.1", status:"予定" },
      { area:"車両(収集運搬・軽油)", clause:"8.1・9.1.1", status:"予定" }
    ]
  },
  {
    key:"nearMiss", icon:"⚠️", name:"ヒヤリハット報告", clause:"8.2 / 10.2",
    help:"けがや事故・油漏れなどにはならなかったけれど「ヒヤッとした・ハッとした」ことの報告です(ヒヤリハット報告書 EMS-C-12)。紙の様式の ①社内での作業中 ②引き取り作業中 ③気付いた危険個所 のどれかを選んで、危険だと思ったことと、その対応・改善対策を書きます。大きな問題になったときは「内部監査・是正処置」の是正処置にも記録します。",
    title:"what", dated:"date",
    fields:[
      { k:"date", label:"日付", type:"date", req:true, list:true },
      { k:"who", label:"氏名(報告した人)", type:"text", req:true, list:true },
      { k:"kind", label:"どんなとき", type:"select", options:[["社内","1) 社内での作業中"],["引取","2) 引き取り作業中"],["危険個所","3) 気付いた危険個所(社内外)"],["環境","環境(油漏れ・飛散・騒音など)"],["安全","安全(その他)"],["車両","車両・運転"],["その他","その他"]], list:true },
      { k:"place", label:"場所", type:"text", list:true, ph:"例: ヤード東側・積替え保管場所／○○様の現場" },
      { k:"what", label:"危険だと思ったこと(ヒヤッとしたこと)", type:"textarea", req:true, list:true, ph:"例: 重機の給油中にホースが外れ、油がこぼれそうになった" },
      { k:"measure", label:"それに対しての対応または改善対策", type:"textarea", list:true, ph:"例: 給油時は受け皿を置く。朝礼で周知" },
      { k:"cause", label:"原因(わかれば)", type:"textarea", list:true },
      { k:"share", label:"みんなへの周知", type:"text", list:true, ph:"例: 10/15 朝礼で周知" },
      { k:"checker", label:"確認者(環境管理責任者)", type:"text", list:true },
      { k:"status", label:"状況", type:"select", options:[["対応中","対応中"],["完了","完了"]], list:true }
    ]
  },
  {
    key:"zoneReport", icon:"🧹", name:"ゾーン報告", clause:"8.1 / 10.2",
    help:"ゾーン(A〜F・駐車場)で起きた問題(置場の乱れ・油漏れ・飛散・指定外の品物など)の報告と、その対応の記録です(ゾーン報告書 EMS-C-14)。発生したことと対応結果を書き、環境管理責任者・ISO推進委員が確認します。",
    title:"content", dated:"date",
    fields:[
      { k:"date", label:"発生した日", type:"date", req:true, list:true },
      { k:"who", label:"報告者", type:"text", req:true, list:true },
      { k:"zone", label:"状況ゾーン", type:"select", options:[["",""],["A","Aゾーン"],["B","Bゾーン"],["C","Cゾーン"],["D","Dゾーン"],["E","Eゾーン"],["F","Fゾーン"],["駐車場","駐車場"],["その他","その他"]], list:true },
      { k:"content", label:"発生内容", type:"textarea", req:true, list:true, ph:"例: Bゾーンの非鉄置場で油漏れ" },
      { k:"doneDate", label:"対応した日", type:"date", list:true },
      { k:"doneBy", label:"対応者", type:"text", list:true },
      { k:"action", label:"今後の対策・改善対応", type:"textarea", list:true },
      { k:"chkMgr", label:"確認者(環境管理責任者)", type:"text", list:true },
      { k:"chkIso", label:"確認者(ISO推進委員)", type:"text", list:true },
      { k:"status", label:"状況", type:"select", options:[["対応中","対応中"],["完了","完了"]], list:true }
    ]
  },
  {
    key:"minutes", icon:"📝", name:"会議の議事録", clause:"7.4.2",
    help:"環境管理会議・ISO推進委員会などの議事録です(議事録 EMS-C-19・環境マニュアル7.4.2)。環境管理会議は年7〜8回。話し合ったこと・決まったこと・宿題(誰が・いつまでに)を残すと、次の会議やマネジメントレビューで確認できます。",
    title:"agenda", dated:"date",
    fields:[
      { k:"date", label:"開いた日", type:"date", req:true, list:true },
      { k:"kind", label:"会議", type:"select", options:[["環境管理会議","環境管理会議"],["ISO推進委員会","ISO推進委員会"],["全体会議","全体会議"],["その他","その他"]], list:true },
      { k:"members", label:"出席者", type:"text", list:true },
      { k:"agenda", label:"議題", type:"textarea", req:true, list:true, ph:"例: 9月の環境目標の進み具合／内部監査の日程" },
      { k:"content", label:"話し合った内容", type:"textarea", list:true },
      { k:"decision", label:"決まったこと", type:"textarea", list:true },
      { k:"todo", label:"宿題(誰が・いつまでに)", type:"textarea", list:true, ph:"例: 理絵 10/31までに 内部監査の日程表を作る" },
      { k:"next", label:"次回の予定", type:"date", list:true }
    ]
  },
  {
    key:"distrib", icon:"📤", name:"文書の配布記録", clause:"7.5.3",
    help:"新しい版の書類を、どこに・誰に配ったか(掲示したか)の記録です(文書配布記録 EMS-C-18・環境マニュアル7.5.3)。古い版は回収・廃棄して、間違って使われないようにします。アプリで共有しているものは「アプリで共有」を選びます。",
    title:"name", dated:"date",
    fields:[
      { k:"date", label:"配布した日", type:"date", req:true, list:true },
      { k:"code", label:"文書番号・版", type:"text", req:true, list:true, ph:"例: EMS-A-22-03" },
      { k:"name", label:"文書名", type:"text", list:true, ph:"例: 環境目標兼活動計画書" },
      { k:"to", label:"配布先・掲示場所", type:"text", list:true, ph:"例: 事務所掲示板・休憩所・各ドライバー" },
      { k:"method", label:"配り方", type:"select", options:[["掲示","掲示"],["回覧","回覧"],["紙で配布","紙で配布"],["指定場所","指定場所に置く"],["ホワイトボード","ホワイトボード"],["アプリで共有","アプリで共有"],["メール","メール"]], list:true },
      { k:"old", label:"古い版", type:"select", options:[["",""],["回収・廃棄した","回収・廃棄した"],["なし","なし(初版)"]], list:true },
      { k:"by", label:"配った人", type:"text", list:true }
    ]
  },
  {
    key:"auditCheck", icon:"✅", name:"内部監査チェックシート", clause:"9.2",
    help:"内部監査で、決まった項目を1つずつ確認するチェックシートと結果の報告書です(内部監査チェックシート EMS-C-02・監査結果記録)。環境マニュアル9.2: 結果を社長と環境管理責任者に報告し、社長の指示を「経営者意見・指示内容」に書き、2か月後に是正されたか確認します。確認できた項目にチェックを付け、総評・不適合・改善の機会を書きます。不適合があれば「内部監査・是正処置」の是正処置にも記録します。",
    title:"dept", dated:"date",
    fields:[
      { k:"date", label:"監査日", type:"date", req:true, list:true },
      { k:"auditor", label:"監査員", type:"text", list:true },
      { k:"dept", label:"被監査部門", type:"text", req:true, list:true, ph:"例: ヤード・事務所" },
      { k:"scope", label:"監査範囲", type:"text", list:true, ph:"環境側面、順守義務、目的・目標、運用管理、緊急対応、記録管理" },
      { k:"ok", label:"確認できた項目(チェックを付ける。付いていないものは要確認)", type:"checks", list:true, options:[
        "A-1 環境側面：EMS-A-06/07/08 が最新で整合している","A-2 環境側面：著しい環境側面の管理が適切に実施されている","A-3 環境側面：判定基準が明文化され、運用されている",
        "B-1 順守義務：適用法令一覧が最新","B-2 順守義務：法令遵守評価が実施されている","B-3 順守義務：法令に関わる手順書が整備されている",
        "C-1 目的・目標：目的・目標が設定されている","C-2 目的・目標：進捗が記録されている","C-3 目的・目標：必要に応じて見直しが行われている",
        "D-1 運用管理：著しい環境側面に対応する手順書が整備されている","D-2 運用管理：廃棄物の受入・運搬・保管・排出の管理が適切","D-3 運用管理：フロン・PCB・油水分離槽など法令系の点検記録がある",
        "E-1 緊急事態：緊急対応手順書(油漏れ・火災・地震など)が整備","E-2 緊急事態：年1回以上の訓練記録がある","E-3 緊急事態：緊急時連絡網が最新",
        "F-1 教育・力量：教育訓練記録がある","F-2 教育・力量：必要資格(フォークリフト等)が有効","F-3 教育・力量：新人教育・環境教育が実施されている",
        "G-1 監視・測定：台貫校正記録","G-2 監視・測定：油水分離槽点検記録","G-3 監視・測定：フロン点検記録",
        "H-1 内部監査・MR：内部監査が計画通り実施されている","H-2 内部監査・MR：是正処置が適切に管理されている","H-3 内部監査・MR：マネジメントレビュー報告書がある"] },
      { k:"overall", label:"総評", type:"select", options:[["",""],["適合","適合"],["軽微な不適合","軽微な不適合"],["不適合","不適合"],["改善の機会あり","改善の機会あり"]], list:true },
      { k:"nc", label:"不適合事項(要求事項／事実／是正処置)", type:"textarea", list:true, ph:"例: 1. 8.2 緊急事態／訓練記録が1年以上ない／11月に油漏れ訓練を行う" },
      { k:"ofi", label:"改善の機会(OFI)", type:"textarea", list:true },
      { k:"due", label:"是正処置の期限", type:"date", list:true },
      { k:"reportDate", label:"社長・環境管理責任者へ報告した日", type:"date", list:true },
      { k:"presInstr", label:"経営者意見・指示内容(社長から)", type:"textarea", list:true },
      { k:"check2m", label:"2か月後の是正の確認日", type:"date", list:true },
      { k:"check2mRes", label:"2か月後の確認結果", type:"select", options:[["",""],["是正済み","是正済み"],["未是正","未是正(環境管理責任者へ指示)"]], list:true }
    ]
  },
  {
    key:"auditSurvey", icon:"🗳️", name:"内部監査アンケート", clause:"9.2",
    help:"内部監査のときに全員に書いてもらうアンケートの回答です(EMS-C-03)。1人の回答が1件です。困りごと・ヒヤリハット・お客様に頼まれたことなどを集めて、改善やヒヤリハット報告・顧客対応の記録につなげます。",
    title:"name", dated:"date",
    fields:[
      { k:"date", label:"日付", type:"date", req:true, list:true },
      { k:"name", label:"氏名", type:"text", req:true, list:true },
      { k:"q1", label:"1. 担当ゾーンで整理整頓がしにくい場所／これがあれば便利なもの", type:"textarea", list:true },
      { k:"q2", label:"2. 気候変動(大雨・猛暑など)に備えて、私たちが出来ること", type:"textarea", list:true, ph:"例: 電気の無駄を減らす" },
      { k:"q3", label:"3. マニフェストで困ったこと", type:"textarea", list:true, ph:"例: 電子マニフェストが分からない" },
      { k:"q4", label:"4. 修理・点検が必要なトラック・設備・道具", type:"textarea", list:true, ph:"例: 事務所のすきま風" },
      { k:"q5", label:"5. お客様のニーズの声掛け", type:"select", options:[["",""],["してる","してる"],["してない","してない"]], list:true },
      { k:"q5b", label:"5. お客様に頼まれたこと", type:"textarea", list:true, ph:"例: ドラム缶のふたを作ってほしい" },
      { k:"h1", label:"6. 最近ヒヤッとしたことがあった", type:"select", options:[["",""],["ある","ある"],["ない","ない"]], list:true },
      { k:"h2", label:"6. 危険だと思う作業がある", type:"select", options:[["",""],["ある","ある"],["ない","ない"]], list:true },
      { k:"h3", label:"6. 改善したい安全面がある", type:"select", options:[["",""],["ある","ある"],["ない","ない"]], list:true },
      { k:"h4", label:"6. 事故につながりそうな場所がある", type:"select", options:[["",""],["ある","ある"],["ない","ない"]], list:true },
      { k:"h5", label:"6. 使いにくい・危険を感じる道具がある", type:"select", options:[["",""],["ある","ある"],["ない","ない"]], list:true },
      { k:"h6", label:"6. 足元が滑りやすい・つまずきやすい場所がある", type:"select", options:[["",""],["ある","ある"],["ない","ない"]], list:true },
      { k:"hWhy", label:"6.「ある」の理由・場所", type:"textarea", list:true },
      { k:"q7", label:"7. 前回の改善(来客用の白線・バックミラー)は役に立っている？", type:"select", options:[["",""],["なってる","なってる"],["なってない","なってない"]], list:true },
      { k:"q7b", label:"7.「なってない」の理由", type:"textarea", list:true },
      { k:"q8", label:"8. 社内でトラックをバックするときの危険な場所", type:"select", options:[["",""],["ある","ある"],["ない","ない"]], list:true },
      { k:"q8b", label:"8. 危険な場所と改善策", type:"textarea", list:true },
      { k:"q9", label:"9. その他、思っていること", type:"textarea", list:true }
    ]
  },
  {
    key:"routes", icon:"🚛", name:"産業廃棄物の行先経路", clause:"8.1",
    help:"品目ごとに、どこで中間処理して、最後にどこで処分(売却)するかの一覧です(産業廃棄物行先経路 EMS-B-06)。委託先が変わったら直して、変更管理記録にも残します。",
    title:"item",
    fields:[
      { k:"item", label:"品名", type:"text", req:true, list:true },
      { k:"carrier", label:"収集運搬", type:"text", list:true, ph:"(株)関根商店" },
      { k:"mid", label:"中間処理", type:"text", list:true },
      { k:"final", label:"処分・売却先", type:"text", list:true },
      { k:"kind", label:"種類", type:"select", options:[["",""],["処分委託","処分委託"],["売却","売却(有価物)"],["一般廃棄物","一般廃棄物"]], list:true },
      { k:"note", label:"備考", type:"text", list:true }
    ]
  },
  {
    key:"extAudit", icon:"🏅", name:"外部審査の指摘と対応", clause:"9.2 / 10.2",
    help:"審査機関の審査(更新審査・維持審査)で受けた指摘と、その対応の記録です(監査結果記録 EMS-C-06)。区分 A・B は是正処置が必要、O は改善の機会(次の審査で検討結果を確認される)。対応が終わったら状況を「対応済み」にします。",
    title:"finding", dated:"date",
    fields:[
      { k:"date", label:"審査日", type:"date", list:true },
      { k:"kind", label:"審査", type:"text", list:true, ph:"例: ISO14001:2015 更新審査" },
      { k:"auditor", label:"審査員", type:"text", list:true },
      { k:"no", label:"No.", type:"text", list:true, ph:"例: MDF-02" },
      { k:"grade", label:"区分", type:"select", options:[["",""],["A","A(是正処置が必要・影響あり)"],["B","B(是正処置が必要・影響なし)"],["O","O(改善の機会)"]], list:true },
      { k:"finding", label:"所見(指摘の内容)", type:"textarea", req:true, list:true },
      { k:"action", label:"改善内容(会社の対応)", type:"textarea", list:true },
      { k:"status", label:"状況", type:"select", options:[["検討中","検討中"],["対応中","対応中"],["対応済み","対応済み"]], list:true }
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
