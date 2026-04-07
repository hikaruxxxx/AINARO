// 利用規約コンテンツ（Phase 1 対応版 / レビュー反映後）
// 法的文書のため翻訳の整合性を保つ目的で i18n message ファイルではなくこのファイルで一元管理する。
// 文言修正時は ja / en 両方を必ず同時に更新すること。

export type TermsArticle = {
  title: string;
  // 段落（プレーンテキスト、items を伴わない場合）
  body?: string;
  // 番号付きリスト前のリード文
  intro?: string;
  // 番号付きリスト
  items?: string[];
  // items の後に続く補足段落（違約金条項などに使用）
  trailing?: string;
};

export type TermsContent = {
  metaTitle: string;
  metaDescription: string;
  heading: string;
  lastUpdated: string;
  preamble: string;
  articles: TermsArticle[];
  contactNotice: string; // 末尾の権利侵害申立窓口リンク文（{link} を含む）
  closing: string;
};

export const termsJa: TermsContent = {
  metaTitle: "利用規約",
  metaDescription: "Novelisの利用規約です。本サービスをご利用いただく前に必ずお読みください。",
  heading: "利用規約",
  lastUpdated: "最終更新日：2026年4月12日",
  preamble:
    "本利用規約（以下「本規約」といいます）は、Novelis運営者（以下「当社」といいます）が提供するウェブサービス「Novelis」（以下「本サービス」といいます）の利用条件を定めるものです。利用者は本規約に同意のうえ本サービスを利用するものとします。",
  articles: [
    {
      title: "第1条（適用）",
      items: [
        "本規約は、利用者と当社との間の本サービスの利用に関わる一切の関係に適用されます。",
        "当社が本サービス上で掲示する個別規定・ガイドライン（プライバシーポリシー、コミュニティガイドライン等を含みます）は、本規約の一部を構成します。",
        "本規約と個別規定の内容が矛盾する場合、個別規定が優先して適用されます。",
      ],
    },
    {
      title: "第2条（定義）",
      intro: "本規約において、次の各号に掲げる用語の意義は、当該各号に定めるとおりとします。",
      items: [
        "「本サービス」とは、当社が運営するウェブサイト「Novelis」およびこれに関連して提供する一切のサービスをいいます。",
        "「利用者」とは、本規約に同意のうえ本サービスを利用するすべての方をいいます。",
        "「登録利用者」とは、本サービスにアカウントを登録した利用者をいいます。",
        "「コンテンツ」とは、本サービス上で配信される小説、イラスト、画像、音声、テキスト、その他一切の情報をいいます。",
        "「当社コンテンツ」とは、本サービス上に当社が掲載するコンテンツをいいます。",
        "「投稿コンテンツ」とは、登録利用者が本サービス上に投稿するコンテンツをいいます。",
        "「生成AI機能」とは、本サービスが提供する、利用者の入力に応じて文章その他のコンテンツを自動生成する機能をいいます。",
      ],
    },
    {
      title: "第3条（アカウント登録）",
      items: [
        "本サービスの一部機能は、利用者が当社所定の方法でアカウント登録を行うことで利用可能となります。",
        "利用者は、登録にあたり真実かつ正確な情報を提供するものとします。",
        "登録利用者は、自己の責任においてID・パスワード等の認証情報を厳重に管理するものとし、第三者に利用させ、または貸与・譲渡・売買等してはなりません。",
        "認証情報の管理不十分、第三者の使用、その他の事由により生じた損害の責任は登録利用者が負うものとし、当社は一切の責任を負いません。",
        "当社は、登録申請者が過去に本規約違反により利用停止処分を受けたことがある場合、申請内容に虚偽が含まれる場合、その他当社が登録を不適当と判断した場合、登録を拒否することがあります。",
        "登録利用者は、当社が特に認めた場合を除き、一人につき一つのアカウントのみを保有するものとし、複数アカウントの作成、他者へのアカウント譲渡・貸与・売買・共有、および第三者によるアカウント承継（相続を含みます）を行ってはなりません。当社は、合理的な理由に基づき、同一人物によるものと認められる複数アカウントを統合または削除することができます。",
      ],
    },
    {
      title: "第4条（未成年者の利用）",
      items: [
        "未成年者が本サービスを利用する場合、事前に親権者その他の法定代理人の同意を得るものとします。",
        "未成年者が本規約に同意して本サービスを利用した場合、当該利用について法定代理人の同意があったものとみなします。",
      ],
    },
    {
      title: "第5条（退会・アカウント削除）",
      items: [
        "登録利用者は、当社所定の方法によりいつでも退会することができます。",
        "退会時、当社は当該登録利用者のアカウント情報を当社のプライバシーポリシーに従って取り扱います。退会後、当社は登録情報、投稿履歴、閲覧履歴その他のデータの復旧義務を負いません。",
        "当社は、退会後も、法令遵守、紛争対応、不正利用防止、統計分析、機械学習モデルの訓練・検証等のために必要な範囲で、登録情報、利用ログ、投稿履歴等を合理的な期間保持することができます。",
      ],
    },
    {
      title: "第6条（コンテンツについて）",
      items: [
        "本サービス上の当社コンテンツは、当社が生成AI技術を活用して制作したものを含みます。当社は、企画・プロンプト設計・編集・選別・校正等の創作的関与を行っています。",
        "当社コンテンツに関する一切の権利（著作権法上の著作権が成立する場合の著作権、編集著作物としての権利、データベースの著作物としての権利を含みます）は、当社または正当な権利者に帰属します。",
        "利用者は、私的利用の範囲内で当社コンテンツを閲覧することができます。著作権法上認められる引用、感想・レビューのSNS等での共有はこの限りではありません。",
        "利用者は、当社コンテンツを当社の事前の書面による許諾なく、複製、転載、改変、翻案、再配布、商用利用、機械学習データセットへの利用、その他の利用をしてはなりません。",
        "当社コンテンツはフィクションであり、実在の人物、団体、事件等とは関係ありません。",
        "当社は、合理的な理由に基づき、本サービス上のコンテンツについて、事前の通知なく、非表示化、表示順位の変更、検索結果からの除外、注意喚起ラベルの付与、年齢区分の設定、サムネイル・タイトル等の表示調整、その他運営上必要な措置を講じることができます。",
        "登録利用者が本サービスに投稿コンテンツを投稿した場合、当該登録利用者は、当社に対し、本サービスの運営・改善・宣伝、レコメンド、品質評価モデルおよび生成モデルの学習・検証、統計分析、ヒット予測モデルの訓練、その他当社の事業目的のために、無償・非独占的・地域無制限・無期限・サブライセンス可能な形で、当該投稿コンテンツを複製、公衆送信、翻訳、翻案、要約、サムネイル作成その他の方法で利用することを許諾します。登録利用者は、当社および当社からサブライセンスを受けた第三者に対し、当該投稿コンテンツに係る著作者人格権を行使しないものとします。",
      ],
    },
    {
      title: "第7条（年齢制限・センシティブコンテンツ）",
      items: [
        "本サービスには、暴力表現、性的表現、その他のセンシティブな表現を含むコンテンツが掲載されることがあります。",
        "当社は、コンテンツに対し当社の基準に基づく年齢区分・注意喚起表示を行うことがあります。",
        "利用者は、自己の判断と責任において閲覧するコンテンツを選択するものとします。",
      ],
    },
    {
      title: "第8条（禁止事項）",
      intro: "利用者は、本サービスの利用にあたり、以下の行為を行ってはなりません。",
      items: [
        "法令または公序良俗に違反する行為、犯罪行為に関連する行為",
        "当社、本サービスの他の利用者、または第三者の知的財産権、肖像権、プライバシー、名誉、その他の権利・利益を侵害する行為",
        "本サービスの内容、コンテンツの全部または一部を、当社の事前の書面による許諾なく複製、転載、再配布、翻案する行為",
        "本サービスのコンテンツを、生成AIの学習データその他の機械学習目的で利用する行為",
        "クローラー、スクレイパー、ボット等の自動化手段を用いて本サービスにアクセスし、または情報を取得する行為",
        "本サービスのサーバー、ネットワーク、セキュリティ機構に対する攻撃、解析、リバースエンジニアリング、または過度な負荷をかける行為",
        "本サービスの運営を妨害する行為",
        "不正アクセス、なりすまし、ID・パスワードの不正取得・使用、複数アカウントの不正な作成・利用",
        "他の利用者に対する誹謗中傷、ハラスメント、ストーキング",
        "当社が定めるコミュニティガイドラインに違反する行為",
        "その他、当社が不適切と判断する行為",
      ],
      trailing:
        "前項のうち、コンテンツの大量複製、生成AIの学習データその他機械学習目的での利用、クローラー等自動化手段によるアクセス、サーバー・セキュリティ機構への攻撃、不正アクセス、なりすましその他の悪質な違反行為を行った利用者に対し、当社は、当社に生じた実損害（弁護士費用、調査費用、システム復旧費用、対応に要した人件費を含みます）の賠償を請求することができます。本項は当社のその他の請求権を妨げるものではありません。",
    },
    {
      title: "第9条（利用停止・登録抹消）",
      items: [
        "当社は、利用者が本規約のいずれかに違反した場合、登録情報に虚偽の事実が判明した場合、当社からの連絡に対し相当期間応答がない場合、反社会的勢力に該当する場合、その他合理的な理由があると当社が判断する場合、事前の通知なく、当該利用者の本サービスの利用を停止し、またはアカウントを削除することができます。",
        "当社は、本条に基づき当社が行った行為により利用者に生じた損害について、当社に故意または重過失がある場合を除き、責任を負いません。",
        "本条に基づく利用停止または登録抹消の期間中も、当該利用者に係る有料サービスの課金は継続するものとし、当社は当該停止期間に対応する返金義務を負いません。ただし、当社の責めに帰すべき事由による停止についてはこの限りではありません。",
      ],
    },
    {
      title: "第10条（権利侵害・トラブルへの対応）",
      items: [
        "自己の著作権その他の権利が本サービス上のコンテンツによって侵害されていると考える方は、当社所定の窓口を通じて申立てを行うことができます。",
        "申立てを受けた当社は、当社の判断により、当該コンテンツの調査、削除、その他の必要な措置を講じることがあります。",
        "当社は、権利侵害、法令違反、コミュニティガイドライン違反その他の問題の申立てまたは疑いがある場合、当該申立ての真偽を確認する前であっても、暫定的に当該コンテンツを非表示化または削除することができます。その後の調査により申立てに理由がないと判明した場合、当社は合理的な範囲で当該コンテンツの復元に努めますが、復元を保証するものではありません。",
        "生成AI機能の出力が第三者の著作物その他の権利と類似または抵触する旨の申立てがあった場合、当社は当該出力の生成経緯を調査する義務を負わず、当社の判断により当該コンテンツの非表示化・削除等の措置を講じることができます。利用者が当該出力を自己の作品として公開・利用したことに起因する第三者からの請求・損害については、当該利用者が自己の責任において対応するものとします。",
        "利用者間のトラブル、コメント・レビュー上の紛争、誹謗中傷、ハラスメント、ストーキングその他の対人トラブルについては、原則として当事者間で解決するものとし、当社は当該トラブルに介入する義務を負いません。ただし、当社は、合理的な理由に基づき、必要と判断する措置（コメント削除、当事者への警告、利用停止等）を講じることができます。ハラスメント等の通報窓口は、当社所定の方法により提供します。",
        "前各項に基づき当社が対応を要した場合（弁護士その他の専門家への相談、調査、第三者対応を含みます）、当社は、当該対応に要した合理的な費用を、当該事案の原因となった利用者に請求することができます。",
      ],
    },
    {
      title: "第11条（個人情報・データの取扱い）",
      items: [
        "当社は、本サービスの利用にあたって取得する個人情報を、別途定めるプライバシーポリシーに従って適切に取り扱います。",
        "本サービスは、サービスの改善、利用状況の分析、不正利用防止、機械学習モデルの訓練等を目的としてCookieおよび類似技術を使用します。詳細はプライバシーポリシーをご参照ください。",
        "利用者が本サービスの生成AI機能に入力したプロンプト、パラメータ、修正指示、および当該機能の出力・編集履歴（以下「利用者入力データ」といいます）について、当社は、本サービスの提供・改善、生成モデルの学習・調整、品質評価モデルおよびヒット予測モデルの訓練、統計分析、品質管理、新サービス開発のために、無償かつ無期限に利用することができます。利用者は、機密情報、個人情報、第三者の権利を侵害する情報を生成AI機能に入力しないものとします。",
        "当社は、本サービスを通じて取得した情報を、個人を特定できない形に加工したうえで、統計データ、分析結果、学習済みモデルとして第三者に提供し、または当社の新サービス開発に利用することができます。",
        "当社は、不正利用防止、セキュリティ確保、法令対応、紛争対応のために、利用者のアクセスログ、通信記録、操作履歴、IPアドレス、デバイス情報等を合理的な期間保存することができます。",
      ],
    },
    {
      title: "第12条（知的財産権）",
      items: [
        "本サービス、本サービス上の当社コンテンツ、ロゴ、デザイン、ソフトウェア、プログラム、その他一切に関する知的財産権は、当社または正当な権利者に帰属します。",
        "本規約に基づく本サービスの利用許諾は、本サービスに関する当社または正当な権利者の知的財産権の使用許諾を意味するものではありません。",
      ],
    },
    {
      title: "第13条（広告・第三者サービス）",
      items: [
        "本サービスには広告、アフィリエイトリンク、または第三者が提供するサービスが含まれることがあります。",
        "当社は、本サービス上に表示される広告主または第三者サービスの内容、商品、サービスについて、一切の責任を負いません。",
      ],
    },
    {
      title: "第14条（免責事項・補償）",
      items: [
        "当社は、本サービスおよびコンテンツの正確性、完全性、有用性、特定目的への適合性、第三者の権利を侵害しないこと、エラーやバグがないこと等について、一切の保証を行いません。",
        "当社は、本サービスのコンテンツが生成AIを活用して制作されたものを含むことに起因して、不適切な表現、事実と異なる記述、その他の不備が含まれる可能性があることを利用者に通知します。利用者はこれを理解のうえ本サービスを利用するものとします。",
        "当社は、利用者が本サービスを利用したことにより生じた損害について、当社に故意または重過失がある場合を除き、一切の責任を負いません。",
        "当社が利用者に対して責任を負う場合であっても、その責任の範囲は、利用者に現実に発生した直接かつ通常の損害に限られるものとし、当社の責任の上限額は、過去6ヶ月間に利用者が当社に支払った対価の総額（無償サービスの場合は1,000円）を上限とします。ただし、当社に故意または重過失がある場合はこの限りではありません。",
        "当社が「ベータ版」「試験提供」「プレビュー」「実験的機能」等と明示して提供する機能については、予告なく仕様変更・提供停止されることがあり、当社は当該機能の安定性・完全性について一切保証せず、これに起因する損害について責任を負いません。",
        "生成AI機能により出力されたコンテンツには、事実と異なる記述（ハルシネーション）、不適切・差別的・違法な表現、第三者の著作物と類似または抵触する表現等が含まれる可能性があります。利用者は、生成物を公開・利用する前に自らの責任で内容を確認するものとし、当社は生成物の正確性、適法性、第三者権利の非侵害について一切保証せず、これらに起因する損害について責任を負いません。",
        "利用者の故意または過失に基づく本規約違反、違法行為、または第三者の権利侵害に起因して、当社が第三者から請求、訴訟、クレーム、行政処分その他の不利益を受けた場合、当該利用者は、当社に生じた損害（弁護士費用、和解金、賠償金、調査費用を含みます）を補償するものとします。",
        "当社が利用者に対して支払義務を負う金員（収益還元金、返金等を含みます）がある場合、当社は、当該利用者が当社に対して負担する債務（損害賠償金、補償金、利用料金、違約金その他の金銭債務を含みます）と、期限の如何にかかわらず対当額で相殺することができます。",
      ],
    },
    {
      title: "第15条（サービスの変更・中断・終了）",
      items: [
        "当社は、合理的な理由に基づき、利用者への事前の通知なく、本サービスの内容を変更し、または提供を中断・終了することができます。",
        "当社は、本条に基づき当社が行った行為により利用者に生じた損害について、当社に故意または重過失がある場合を除き、責任を負いません。",
      ],
    },
    {
      title: "第16条（通知方法）",
      body: "当社から利用者への通知は、本サービス上への掲示、電子メールの送信、その他当社が適当と判断する方法により行うものとします。",
    },
    {
      title: "第17条（反社会的勢力の排除）",
      body: "利用者は、自己が暴力団、暴力団員、暴力団準構成員、暴力団関係企業、総会屋、社会運動標榜ゴロ、特殊知能暴力集団、その他これに準ずる者（以下「反社会的勢力」といいます）に該当しないこと、および反社会的勢力と一切の関係を有しないことを表明し、保証するものとします。",
    },
    {
      title: "第18条（権利義務の譲渡禁止・フィードバック）",
      items: [
        "利用者は、当社の事前の書面による承諾なく、本規約上の地位または本規約に基づく権利義務の全部または一部を、第三者に譲渡し、承継させ、または担保に供することはできません。",
        "利用者が本サービスに関し当社に提供した改善提案、アイデア、バグ報告、機能要望その他のフィードバック（以下「フィードバック」といいます）について、当社は無償かつ無制限に、複製、改変、翻案、再配布、商用利用を含むあらゆる方法で利用することができ、フィードバックに関する一切の権利は当社に帰属するものとします。利用者は、フィードバックについて対価、クレジット表示、その他の請求を行わないものとします。",
      ],
    },
    {
      title: "第19条（分離可能性）",
      body: "本規約のいずれかの条項またはその一部が、法令等により無効または執行不能と判断された場合であっても、本規約の残りの規定および当該条項の残りの部分は、引き続き完全に効力を有するものとします。",
    },
    {
      title: "第20条（規約の変更）",
      items: [
        "当社は、民法第548条の4の規定に基づき、本規約の変更が利用者の一般の利益に適合する場合、または、本規約の変更の必要性、変更後の内容の相当性、本規約の変更に係る事情に照らして合理的なものである場合、利用者の個別の同意を要することなく、本規約を変更することができます。",
        "本規約を変更する場合、当社は変更後の本規約の内容および効力発生時期を、本サービス上または当社所定の方法により周知します。",
        "変更内容が利用者にとって重大な影響を及ぼすと当社が判断する場合、効力発生日の少なくとも14日前までに周知するものとします。",
        "変更後の本規約の効力発生日以降に利用者が本サービスを利用した場合、当該利用者は変更後の本規約に同意したものとみなします。",
      ],
    },
    {
      title: "第21条（準拠法・裁判管轄・準拠言語）",
      items: [
        "本規約の解釈および本サービスの利用に関する一切の紛争については、日本法を準拠法とします。",
        "本サービスに関連して利用者と当社との間に紛争が生じた場合、当社の本店所在地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とします。",
        "本規約は日本語版を正本とします。本規約が英語その他の言語に翻訳されている場合において、各言語版の間に齟齬または不一致があるときは、日本語版が優先して適用されます。",
      ],
    },
  ],
  contactNotice:
    "コンテンツに関する権利侵害のご申立て、その他本規約に関するお問い合わせは{link}よりご連絡ください。",
  closing: "以上",
};

export const termsEn: TermsContent = {
  metaTitle: "Terms of Service",
  metaDescription:
    "Terms of Service for Novelis. Please read carefully before using our service.",
  heading: "Terms of Service",
  lastUpdated: "Last updated: April 12, 2026",
  preamble:
    'These Terms of Service ("Terms") set forth the conditions for using the web service "Novelis" ("Service") provided by the Novelis operator ("we" or "us"). Users shall use the Service upon agreeing to these Terms. The Japanese version of these Terms is the official version; if there is any discrepancy between the Japanese version and any translation, the Japanese version shall prevail.',
  articles: [
    {
      title: "Article 1 (Application)",
      items: [
        "These Terms apply to all relationships between users and us regarding the use of the Service.",
        "Individual provisions and guidelines posted by us on the Service (including the Privacy Policy and Community Guidelines) form part of these Terms.",
        "If these Terms conflict with any individual provision, the individual provision shall prevail.",
      ],
    },
    {
      title: "Article 2 (Definitions)",
      intro: "In these Terms, the following terms shall have the meanings set forth below.",
      items: [
        '"Service" means the website "Novelis" operated by us and any related services.',
        '"User" means any person who uses the Service in agreement with these Terms.',
        '"Registered User" means a User who has registered an account on the Service.',
        '"Content" means novels, illustrations, images, audio, text, and any other information distributed on the Service.',
        '"Our Content" means Content that we publish on the Service.',
        '"User Submissions" means Content submitted by Registered Users on the Service.',
        '"Generative AI Features" means features of the Service that automatically generate text or other Content in response to user input.',
      ],
    },
    {
      title: "Article 3 (Account Registration)",
      items: [
        "Some features of the Service become available only after the User registers an account in the manner we prescribe.",
        "Users shall provide true and accurate information when registering.",
        "Registered Users shall strictly manage their credentials (such as ID and password) at their own responsibility, and shall not allow third parties to use, lend, transfer, or sell them.",
        "Registered Users are responsible for any damage arising from inadequate management of credentials, third-party use, or other causes, and we bear no liability.",
        "We may refuse registration if the applicant has previously been suspended for violation of these Terms, has provided false information, or for any other reason we deem inappropriate.",
        "Unless we expressly permit otherwise, each Registered User shall hold only one account and shall not create multiple accounts, transfer, lend, sell, or share an account with others, or allow account succession by third parties (including by inheritance). We may, on reasonable grounds, consolidate or delete multiple accounts that we deem to belong to the same individual.",
      ],
    },
    {
      title: "Article 4 (Use by Minors)",
      items: [
        "Minors using the Service must obtain prior consent from a parent or other legal representative.",
        "If a minor uses the Service after agreeing to these Terms, such use shall be deemed to have been consented to by their legal representative.",
      ],
    },
    {
      title: "Article 5 (Withdrawal and Account Deletion)",
      items: [
        "Registered Users may withdraw from the Service at any time in the manner we prescribe.",
        "Upon withdrawal, we will handle the account information in accordance with our Privacy Policy. We bear no obligation to restore registration data, submission history, browsing history, or any other data after withdrawal.",
        "Even after withdrawal, we may retain registration information, usage logs, submission history, and similar data for a reasonable period as necessary for legal compliance, dispute response, prevention of fraudulent use, statistical analysis, machine learning model training and validation, and similar purposes.",
      ],
    },
    {
      title: "Article 6 (Content)",
      items: [
        "Our Content on the Service includes works produced using generative AI technology. We engage creatively in planning, prompt design, editing, curation, and proofreading.",
        "All rights in Our Content (including copyrights where applicable, rights as compilation works, and rights as database works) belong to us or the rightful owner.",
        "Users may view Our Content within the scope of personal use. Quotation as permitted by copyright law and sharing of impressions or reviews on social media are not restricted.",
        "Users shall not, without our prior written permission, reproduce, repost, modify, adapt, redistribute, commercially exploit, use as a machine learning dataset, or otherwise use Our Content.",
        "Our Content is fiction and bears no relation to actual persons, organizations, or events.",
        "We may, on reasonable grounds and without prior notice, take operational measures regarding Content on the Service, including hiding, changing display order, excluding from search results, applying warning labels, setting age ratings, adjusting display of thumbnails or titles, and any other measures we deem necessary.",
        "When a Registered User submits a User Submission to the Service, the Registered User grants us a worldwide, royalty-free, non-exclusive, perpetual, sublicensable license to use the User Submission for purposes including operation, improvement, and promotion of the Service, recommendation, training and validation of quality evaluation models and generative models, statistical analysis, training of hit prediction models, and any other business purposes of ours, by means including reproduction, public transmission, translation, adaptation, summarization, and thumbnail creation. The Registered User shall not exercise moral rights of authors with respect to the User Submission against us or any third party sublicensed by us.",
      ],
    },
    {
      title: "Article 7 (Age Restrictions and Sensitive Content)",
      items: [
        "The Service may include Content with violent, sexual, or otherwise sensitive expression.",
        "We may apply age ratings or warning labels to Content based on our standards.",
        "Users shall select Content to view at their own judgment and responsibility.",
      ],
    },
    {
      title: "Article 8 (Prohibited Acts)",
      intro: "When using the Service, Users shall not engage in any of the following acts.",
      items: [
        "Acts that violate laws, regulations, or public order and morals, or are related to criminal activity.",
        "Acts that infringe the intellectual property rights, portrait rights, privacy, honor, or other rights or interests of us, other Users, or third parties.",
        "Reproducing, reposting, redistributing, or adapting any part of the Service or Content without our prior written permission.",
        "Using Content from the Service as training data for generative AI or any other machine learning purpose.",
        "Accessing the Service or obtaining information through automated means such as crawlers, scrapers, or bots.",
        "Attacking, analyzing, reverse-engineering, or imposing excessive load on the Service's servers, networks, or security mechanisms.",
        "Acts that interfere with the operation of the Service.",
        "Unauthorized access, impersonation, unauthorized acquisition or use of IDs and passwords, or improper creation or use of multiple accounts.",
        "Defamation, harassment, or stalking of other Users.",
        "Acts that violate our Community Guidelines.",
        "Any other acts we deem inappropriate.",
      ],
      trailing:
        "If a User commits any of the malicious violations listed above (including mass reproduction of Content, use of Content for generative AI training or other machine learning purposes, access via automated means, attacks on servers or security mechanisms, unauthorized access, or impersonation), we may claim from such User the actual damages incurred by us (including attorney's fees, investigation costs, system recovery costs, and personnel costs for response). This provision does not prejudice our other rights of claim.",
    },
    {
      title: "Article 9 (Suspension and Termination)",
      items: [
        "We may suspend a User's use of the Service or delete their account without prior notice if the User violates any provision of these Terms, has provided false registration information, fails to respond to our communications for a reasonable period, qualifies as an antisocial force, or in any other case where we determine on reasonable grounds that suspension or deletion is warranted.",
        "We bear no liability for any damage caused to a User by actions taken under this Article, except in cases of our willful misconduct or gross negligence.",
        "Charges for paid services applicable to the User shall continue during any period of suspension or termination under this Article, and we bear no obligation to refund amounts corresponding to the suspension period. This does not apply to suspensions caused by reasons attributable to us.",
      ],
    },
    {
      title: "Article 10 (Response to Rights Infringement and Disputes)",
      items: [
        "Anyone who believes their copyright or other rights are being infringed by Content on the Service may submit a notice through the contact channel we designate.",
        "Upon receiving such a notice, we may, at our discretion, investigate, remove, or take other necessary measures regarding the relevant Content.",
        "Where there is a notice or suspicion of rights infringement, legal violation, violation of Community Guidelines, or other issue, we may provisionally hide or delete the relevant Content even before confirming the validity of the notice. If subsequent investigation reveals that the notice was unfounded, we will use reasonable efforts to restore the Content but do not guarantee restoration.",
        "If a notice is received alleging that the output of a Generative AI Feature resembles or conflicts with the copyright or other rights of a third party, we bear no obligation to investigate the generation process of such output and may, at our discretion, hide, delete, or take other measures regarding such Content. Any claims or damages from third parties arising from a User's publication or use of such output as their own work shall be handled by such User at their own responsibility.",
        "Disputes between Users, disputes in comments or reviews, defamation, harassment, stalking, and other interpersonal troubles shall in principle be resolved between the parties, and we bear no obligation to intervene in such troubles. However, we may, on reasonable grounds, take measures we deem necessary (including comment removal, warnings to the parties, and suspension of use). A reporting channel for harassment and similar matters will be provided in the manner we prescribe.",
        "Where we are required to respond under any of the preceding paragraphs (including consultation with attorneys or other experts, investigation, and dealing with third parties), we may claim reasonable costs of such response from the User who caused the matter.",
      ],
    },
    {
      title: "Article 11 (Personal Information and Data Handling)",
      items: [
        "We handle personal information obtained in connection with the Service in accordance with our separate Privacy Policy.",
        "The Service uses cookies and similar technologies for purposes including service improvement, usage analysis, prevention of fraudulent use, and training of machine learning models. See the Privacy Policy for details.",
        'Regarding the prompts, parameters, revision instructions, and outputs and editing histories of Generative AI Features that Users input or generate ("User Input Data"), we may use such data, royalty-free and without time limit, for purposes including the provision and improvement of the Service, training and tuning of generative models, training of quality evaluation models and hit prediction models, statistical analysis, quality control, and development of new services. Users shall not input confidential information, personal information, or information that infringes third-party rights into Generative AI Features.',
        "We may process information obtained through the Service into a form that does not identify individuals and provide such processed data, analytical results, or trained models to third parties, or use them for the development of our new services.",
        "We may retain access logs, communication records, operation history, IP addresses, device information, and similar data of Users for a reasonable period for purposes including prevention of fraudulent use, security, legal compliance, and dispute response.",
      ],
    },
    {
      title: "Article 12 (Intellectual Property Rights)",
      items: [
        "All intellectual property rights related to the Service, Our Content, logos, design, software, programs, and any other elements belong to us or the rightful owner.",
        "The license to use the Service under these Terms does not constitute a license to use any intellectual property rights of us or any rightful owner.",
      ],
    },
    {
      title: "Article 13 (Advertising and Third-Party Services)",
      items: [
        "The Service may contain advertising, affiliate links, or services provided by third parties.",
        "We bear no liability for the content, products, or services of any advertiser or third-party service displayed on the Service.",
      ],
    },
    {
      title: "Article 14 (Disclaimer and Indemnification)",
      items: [
        "We make no warranties as to the accuracy, completeness, usefulness, fitness for a particular purpose, non-infringement of third-party rights, or freedom from errors or bugs of the Service or Content.",
        "We notify Users that, because Our Content includes works produced using generative AI, it may contain inappropriate expression, factually inaccurate statements, or other defects. Users use the Service with this understanding.",
        "We bear no liability for any damage incurred by Users in connection with their use of the Service, except in cases of our willful misconduct or gross negligence.",
        "Even where we are liable to a User, our liability shall be limited to direct and ordinary damages actually incurred by the User, and the maximum amount of our liability shall be the total amount paid by the User to us during the past six months (or 1,000 yen for free services). The foregoing does not apply in cases of our willful misconduct or gross negligence.",
        'For features expressly designated as "beta," "trial," "preview," "experimental," or similar, specifications may change or provision may cease without prior notice, and we make no warranties as to the stability or completeness of such features and bear no liability for damages arising therefrom.',
        "Content output by Generative AI Features may include factually inaccurate statements (hallucinations), inappropriate, discriminatory, or illegal expressions, expressions resembling or conflicting with third-party copyrighted works, and other defects. Users shall verify the content at their own responsibility before publishing or using such output, and we make no warranties as to the accuracy, legality, or non-infringement of third-party rights of such output and bear no liability for damages arising therefrom.",
        "If we suffer any claim, lawsuit, complaint, administrative action, or other detriment from a third party arising from a User's willful or negligent violation of these Terms, illegal act, or infringement of third-party rights, such User shall indemnify us for any damages incurred by us (including attorney's fees, settlement amounts, damages, and investigation costs).",
        "Where we owe any payment to a User (including revenue share, refunds, and similar amounts), we may set off such payment against any debt the User owes to us (including damages, indemnification, usage fees, penalties, and other monetary obligations), regardless of the maturity of such debt and to the extent of equal amounts.",
      ],
    },
    {
      title: "Article 15 (Modification, Suspension, and Termination of the Service)",
      items: [
        "We may, on reasonable grounds and without prior notice to Users, modify, suspend, or terminate the Service.",
        "We bear no liability for any damage caused to Users by actions taken under this Article, except in cases of our willful misconduct or gross negligence.",
      ],
    },
    {
      title: "Article 16 (Notification Method)",
      body: "Notices from us to Users shall be made by posting on the Service, sending email, or any other method we deem appropriate.",
    },
    {
      title: "Article 17 (Exclusion of Antisocial Forces)",
      body: 'Users represent and warrant that they are not, and have no relationship with, organized crime groups, members of organized crime groups, quasi-members of organized crime groups, enterprises related to organized crime groups, sokaiya, groups engaged in criminal activities under the pretext of conducting social campaigns, special intelligence violence groups, or any persons equivalent thereto ("Antisocial Forces").',
    },
    {
      title: "Article 18 (Prohibition of Assignment and Feedback)",
      items: [
        "Users may not assign, transfer, or pledge their position under these Terms or any rights or obligations under these Terms to any third party without our prior written consent.",
        'Regarding any improvement suggestions, ideas, bug reports, feature requests, and other feedback that Users provide to us regarding the Service ("Feedback"), we may use such Feedback royalty-free and without restriction by any means including reproduction, modification, adaptation, redistribution, and commercial use, and all rights in Feedback shall belong to us. Users shall not claim compensation, credit attribution, or any other right with respect to Feedback.',
      ],
    },
    {
      title: "Article 19 (Severability)",
      body: "Even if any provision of these Terms or part thereof is determined to be invalid or unenforceable under applicable laws, the remaining provisions of these Terms and the remaining parts of such provision shall continue to be in full force and effect.",
    },
    {
      title: "Article 20 (Modification of Terms)",
      items: [
        "Pursuant to Article 548-4 of the Civil Code of Japan, we may modify these Terms without obtaining individual consent from Users where the modification conforms to the general interest of Users, or where the modification is reasonable in light of the necessity for the modification, the appropriateness of the contents after the modification, and other circumstances pertaining to the modification.",
        "When modifying these Terms, we will announce the contents of the modified Terms and the effective date through the Service or by other methods we prescribe.",
        "If we determine that the modification has a material impact on Users, we will provide the announcement at least 14 days before the effective date.",
        "If a User uses the Service on or after the effective date of the modified Terms, the User shall be deemed to have agreed to the modified Terms.",
      ],
    },
    {
      title: "Article 21 (Governing Law, Jurisdiction, and Governing Language)",
      items: [
        "Any disputes regarding the interpretation of these Terms or the use of the Service shall be governed by Japanese law.",
        "If a dispute arises between a User and us in connection with the Service, the district court having jurisdiction over the location of our head office shall be the exclusive court of first instance by agreement.",
        "The Japanese version of these Terms is the official version. If these Terms have been translated into English or any other language and there is any discrepancy or inconsistency between the language versions, the Japanese version shall prevail.",
      ],
    },
  ],
  contactNotice:
    "For notices of rights infringement and other inquiries regarding these Terms, please contact us via {link}.",
  closing: "End of Terms",
};

export function getTermsContent(locale: string): TermsContent {
  return locale === "en" ? termsEn : termsJa;
}
