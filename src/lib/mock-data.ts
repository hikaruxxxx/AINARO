import type { Novel, Episode, Genre } from "@/types/novel";

// --- ジャンル ---
export const MOCK_GENRES: Genre[] = [
  { id: "villainess", name: "悪役令嬢", sort_order: 1 },
  { id: "fantasy", name: "異世界ファンタジー", sort_order: 2 },
  { id: "romance", name: "恋愛", sort_order: 3 },
  { id: "horror", name: "ホラー", sort_order: 4 },
];

// --- 小説3作品 ---
export const MOCK_NOVELS: Novel[] = [
  {
    id: "novel-001",
    slug: "akuyaku-reijou-tensei",
    title: "悪役令嬢に転生したので、破滅フラグを全力で回避します",
    title_en: "Reborn as the Villainess: Dodging Every Death Flag",
    tagline: "気づいたら乙女ゲームの悪役令嬢だった。でも、破滅エンドは絶対に回避してみせる！",
    tagline_en: "I woke up as the villainess of an otome game. But I refuse to accept my doom ending!",
    synopsis:
      "目覚めたら前世で遊んでいた乙女ゲーム「聖女の花園」の悪役令嬢・カタリナに転生していた。\n\nこのままでは攻略対象の王子に婚約破棄され、国外追放か処刑という破滅エンドが待っている。\n\n前世の記憶を武器に、カタリナは全力で破滅フラグの回避に乗り出す。しかし、フラグを折るたびに新たなフラグが立ち、なぜか攻略対象たち全員から好感度が上がっていく——。\n\n「いや、私はただ破滅を回避したいだけなのに！」",
    synopsis_en:
      "I woke up as Katarina, the villainess of the otome game \"Garden of the Saintess\" — a game I played obsessively in my previous life.\n\nIf things follow the script, the prince will break off our engagement, and I'll face exile or execution.\n\nArmed with my memories of the game, I'm going all out to dodge every death flag. But every flag I break spawns a new one, and somehow all the love interests are falling for me instead—\n\n\"Wait, I just want to survive! Why is everyone's affection meter going up?!\"",
    cover_image_url: null,
    author_type: "self",
    author_id: null,
    author_name: "編集部",
    genre: "villainess",
    tags: ["悪役令嬢", "転生", "乙女ゲーム", "溺愛"],
    status: "serial",
    is_r18: false,
    content_warnings: [],
    total_chapters: 5,
    total_characters: 25000,
    total_pv: 0,
    total_bookmarks: 0,
    latest_chapter_at: "2026-04-05T18:00:00Z",
    published_at: "2026-03-15T09:00:00Z",
    created_at: "2026-03-15T09:00:00Z",
    updated_at: "2026-04-05T18:00:00Z",
  },
  {
    id: "novel-002",
    slug: "saikyou-maou-slow-life",
    title: "最強魔王、辺境でスローライフを始めます",
    title_en: "The Demon Lord's Quiet Country Life",
    tagline: "世界を滅ぼせる力を持つ魔王が、辺境の村でのんびり暮らす。でも平穏はなかなか訪れない。",
    tagline_en: "A demon lord with the power to end the world just wants to farm in peace. But peace has other plans.",
    synopsis:
      "千年の眠りから覚めた最強魔王ヴェルザード。\n\nかつての戦いに疲れた彼は、辺境の小さな村で農業をしながら静かに暮らすことを決意する。\n\nしかし、規格外の魔力で畑を耕せば異常な速度で作物が育ち、野良モンスターを追い払えば村人たちから英雄扱い。\n\nさらに勇者の末裔を名乗る少女や、旧知の魔族幹部が次々とやってきて——。\n\n「もう世界征服はいいから、今日の夕飯のことだけ考えさせてくれ」",
    synopsis_en:
      "Velzard, the most powerful demon lord in history, awakens from a thousand-year slumber.\n\nWeary of ancient wars, he decides to settle down in a tiny frontier village and take up farming.\n\nBut when his immense magic makes crops grow overnight and he effortlessly annihilates stray monsters, the villagers start calling him a hero.\n\nThen a girl claiming to be the hero's descendant shows up, followed by his old demon generals—\n\n\"Forget world domination. Just let me worry about what's for dinner.\"",
    cover_image_url: null,
    author_type: "self",
    author_id: null,
    author_name: "編集部",
    genre: "fantasy",
    tags: ["魔王", "スローライフ", "チート", "ほのぼの"],
    status: "serial",
    is_r18: false,
    content_warnings: [],
    total_chapters: 3,
    total_characters: 15000,
    total_pv: 0,
    total_bookmarks: 0,
    latest_chapter_at: "2026-04-04T12:00:00Z",
    published_at: "2026-03-20T09:00:00Z",
    created_at: "2026-03-20T09:00:00Z",
    updated_at: "2026-04-04T12:00:00Z",
  },
  {
    id: "novel-003",
    slug: "shinigami-cafe",
    title: "死神が営むカフェには、訳ありの客しか来ない",
    title_en: "The Reaper's Cafe: For Troubled Souls Only",
    tagline: "あの世とこの世の境にあるカフェ。死神のマスターが淹れるコーヒーは、忘れた記憶を蘇らせる。",
    tagline_en: "A cafe on the border between life and death. The reaper's coffee brings forgotten memories back to life.",
    synopsis:
      "駅裏の路地の奥に、地図には載っていないカフェがある。\n\nマスターは自称・死神の青年。メニューに載っているのは一杯のコーヒーだけ。\n\nそのコーヒーを飲むと、忘れていた——あるいは忘れたかった——記憶が鮮やかに蘇る。\n\n今夜もまた、訳ありの客がドアを開ける。\n\n連作短編形式で綴る、切なくて温かい物語。",
    synopsis_en:
      "Hidden in an alley behind the station, there's a cafe that appears on no map.\n\nThe barista is a young man who claims to be a reaper. The only item on the menu is a single cup of coffee.\n\nOne sip, and memories you've forgotten — or tried to forget — come flooding back in vivid color.\n\nTonight, another troubled soul pushes open the door.\n\nA bittersweet, heartwarming story told in interconnected episodes.",
    cover_image_url: null,
    author_type: "self",
    author_id: null,
    author_name: "編集部",
    genre: "drama",
    tags: ["連作短編", "カフェ", "死神", "感動"],
    status: "serial",
    is_r18: false,
    content_warnings: ["death"],
    total_chapters: 4,
    total_characters: 20000,
    total_pv: 0,
    total_bookmarks: 0,
    latest_chapter_at: "2026-04-03T20:00:00Z",
    published_at: "2026-03-22T09:00:00Z",
    created_at: "2026-03-22T09:00:00Z",
    updated_at: "2026-04-03T20:00:00Z",
  },
];

// --- エピソード ---
export const MOCK_EPISODES: Episode[] = [
  // 悪役令嬢 5話
  {
    id: "ep-001-01",
    novel_id: "novel-001",
    episode_number: 1,
    title: "目覚めたら破滅フラグだらけだった",
    title_en: "I Woke Up Surrounded by Death Flags",
    body_md: `朝の光が瞼を刺す。

頭がぼんやりする。昨夜は遅くまでゲームをしていたせいだろうか。

目を開けると、見慣れない天蓋付きのベッドの中にいた。

「……え？」

豪華な刺繍が施されたシルクのシーツ。窓の外には手入れの行き届いた薔薇園。部屋の隅には等身大の鏡があり、そこに映っているのは——金髪碧眼の、見覚えのある少女。

「嘘でしょ」

鏡に駆け寄って自分の顔を確認する。間違いない。この顔は、前世で何百時間もプレイした乙女ゲーム「聖女の花園」に登場する悪役令嬢——カタリナ・フォン・クラウゼヴィッツ。

ゲームの中でカタリナは、主人公である聖女に嫉妬し、数々の嫌がらせを行い、最終的には婚約者である第一王子から婚約破棄を突きつけられる。

そして待っているのは、ルートによって「国外追放」か「処刑」。

どちらに転んでもバッドエンド。

「いやいやいやいや、待って待って」

前世の記憶が怒涛のように蘇ってくる。私は日本の普通の大学生で、乙女ゲームが趣味で、昨夜も夜更かしして「聖女の花園」の三周目をクリアしたところで——。

「つまり私、転生したってこと？」

転生。テンセイ。小説やゲームではよくある設定だ。でもまさか自分がその当事者になるとは。

しかも転生先が、よりによって悪役令嬢。

「落ち着け、私。まず状況を整理しよう」

ベッドに腰掛けて、深呼吸を三回。

ゲームの時系列を思い出す。カタリナの破滅フラグが本格的に立ち始めるのは、王立学園に入学してからだ。聖女——主人公のリリアーナが学園に転入してきて、攻略対象たちの心を次々と掴んでいく。

それに嫉妬したカタリナが暴走し始めるのが、ゲーム本編のスタート。

「今の私は……何歳だろう」

部屋を見回す。机の上にカレンダーがあった。

「学園入学まであと二年。ということは、まだフラグは立っていない！」

つまり、今から行動すれば間に合う。

破滅フラグを回避するための作戦を練ろう。

まず第一に、聖女リリアーナに嫌がらせをしない。これは最重要。ゲーム中のカタリナの行動を全て逆にすればいい。

第二に、攻略対象たちとの関係を悪化させない。特に婚約者の第一王子レオンハルトとは、良好な関係を維持する——いや、むしろ向こうから婚約解消してもらうのがベストかもしれない。穏便に。

第三に、いざという時に逃げられるよう、スキルを身につける。ゲーム中のカタリナはお嬢様すぎて何もできないのが弱点だった。

「よし。破滅フラグ回避計画、始動！」

拳を握りしめて宣言した瞬間、部屋のドアがノックされた。

「カタリナお嬢様、朝食のお時間です」

メイドの声。

「は、はい！今行きます！」

まずは朝食から。前世ではコンビニおにぎりだったけど、今日からは令嬢の朝食だ。

鏡の中の自分に向かって、小さくガッツポーズを送る。

大丈夫。前世の知識があるんだから。全てのフラグを知っているんだから。

絶対に、破滅エンドは回避してみせる。`,
    body_md_en: `Morning light stung my eyelids.

My head was foggy. Probably because I'd stayed up so late gaming last night.

I opened my eyes — and found myself in an unfamiliar canopy bed.

"...Huh?"

Silk sheets embroidered with elaborate patterns. A perfectly manicured rose garden visible through the window. In the corner of the room stood a full-length mirror, and the girl reflected in it had golden hair and blue eyes — a face I recognized all too well.

"No way."

I rushed to the mirror to get a closer look. There was no mistake. This face belonged to the villainess from the otome game I'd spent hundreds of hours playing in my previous life — Katarina von Clausewitz, from "Garden of the Saintess."

In the game, Katarina grew jealous of the heroine — the Saintess — and tormented her relentlessly, until her fiancé, the First Prince, broke off their engagement.

What awaited her after that depended on the route: exile or execution.

A bad ending either way.

"No no no no, wait wait wait—"

Memories of my previous life came rushing back like a flood. I was a perfectly ordinary college student in Japan, an otome game addict who'd stayed up late last night completing my third playthrough of "Garden of the Saintess" when—

"So... I've been reincarnated?"

Reincarnated. It's a common trope in novels and games. But I never imagined I'd be the one it happened to.

And of all the characters to be reborn as — the villainess.

"Calm down, me. Let's take stock of the situation."

I sat on the edge of the bed and took three deep breaths.

I thought back to the game's timeline. Katarina's death flags really start piling up after she enrolls at the Royal Academy. That's when Liliana, the heroine and Saintess, transfers in and starts winning over all the love interests one by one.

Katarina's jealous rampage in response is what kicks off the main story.

"How old am I right now...?"

I looked around the room. There was a calendar on the desk.

"Two years until Academy enrollment. That means no flags have been triggered yet!"

In other words, if I act now, there's still time.

Time to formulate my plan for dodging every death flag.

First and foremost: do not bully the Saintess Liliana. This is non-negotiable. I just need to do the exact opposite of everything game-Katarina did.

Second: don't ruin my relationships with the love interests. With my fiancé, First Prince Leonhardt in particular, I need to maintain a good relationship — or better yet, get him to dissolve the engagement amicably on his own.

Third: acquire real skills so I can survive on my own if things go south. Game-Katarina's fatal weakness was being a sheltered noble girl who couldn't do anything for herself.

"All right. Operation: Dodge the Death Flags — commence!"

The moment I declared this with my fist raised in the air, there was a knock at the door.

"Lady Katarina, breakfast is served."

A maid's voice.

"Y-Yes! I'll be right there!"

First things first — breakfast. In my previous life it was a convenience store rice ball, but from today on, it's a noblewoman's morning meal.

I flashed a small fist-pump at my reflection in the mirror.

I've got this. I have all my knowledge from my previous life. I know every single flag.

I will absolutely, positively dodge the doom ending.`,
    body_html: null,
    body_html_en: null,
    character_count: 5200,
    is_free: true,
    unlock_at: null,
    unlock_price: 0,
    pv: 0,
    published_at: "2026-03-15T09:00:00Z",
    created_at: "2026-03-15T09:00:00Z",
    updated_at: "2026-03-15T09:00:00Z",
  },
  {
    id: "ep-001-02",
    novel_id: "novel-001",
    episode_number: 2,
    title: "令嬢教育と剣術修行",
    title_en: "A Lady's Education and Sword Training",
    body_md: `転生から三日が経った。

この三日間で分かったことがある。カタリナ・フォン・クラウゼヴィッツの生活は、想像以上に忙しい。

朝は六時に起床。メイドのアンナに身支度を整えてもらい、家族と朝食。その後は午前中いっぱい家庭教師による授業——歴史、礼法、魔法理論、音楽。

午後は刺繍や絵画などの嗜みの時間。夕方にはティータイムがあり、夜は読書か楽器の練習。

「ゲームでは『何もできないお嬢様』って設定だったけど、これだけ教育を受けていて何もできないわけがない」

問題は、ゲームのカタリナがこれらの授業を全てサボっていたことだ。

前世の記憶では、カタリナの回想シーンで「幼少期からワガママで、教師を何人も辞めさせた」という描写があった。

「つまり、ここで真面目に勉強すれば、原作のカタリナとは違う道を歩ける」

今朝の授業は魔法理論。この世界には魔法が存在し、貴族は基本的な魔法を使えるらしい。ゲームでは戦闘シーンがあったが、カタリナは魔法も剣術も使えない設定だった。

「先生、質問があります」

「はい、カタリナ様。何でしょう」

「基礎的な攻撃魔法と防御魔法について、もう少し詳しく教えていただけますか」

家庭教師のベルトラン先生が目を丸くする。

「……カタリナ様が魔法にご興味を？」

どうやら原作のカタリナは魔法の授業を毛嫌いしていたらしい。

「ええ。自分の身は自分で守れるようになりたいんです」

我ながら良いことを言った。破滅エンドで国外追放された場合、魔法が使えれば生きていける確率が格段に上がる。

ベルトラン先生は嬉しそうに微笑んだ。

「素晴らしい心がけです。では、まず基礎属性の判定から始めましょう」

こうして、原作では決して起きなかった「カタリナの真面目な魔法修行」が始まった。

さらに私は、父クラウゼヴィッツ公爵に頼んで、剣術の稽古もつけてもらうことにした。

「カタリナが剣を？」

父も驚いていたが、「護身のためです」と言うと、渋々ながら承諾してくれた。

騎士団の副団長であるガルシアさんが教官として来てくれることになった。

「公爵令嬢に剣を教えるとは……まあ、護身術程度なら」

ガルシアさんは懐疑的だったが、私は前世で中学まで剣道をやっていた。竹刀と剣は違うが、体の使い方の基礎はある。

「構えはこうです。足を肩幅に開いて——お嬢様、筋が良いですな」

「ありがとうございます！」

よし。魔法と剣術を覚えれば、どんなルートに進んでも生き残れる。

破滅フラグ回避計画、順調に進行中。`,
    body_md_en: `Three days had passed since my reincarnation.

In those three days, I'd learned one thing: Katarina von Clausewitz's life was far busier than I'd imagined.

Wake up at six in the morning. Get dressed with the help of my maid Anna, then breakfast with the family. After that, an entire morning of private tutoring — history, etiquette, magical theory, music.

Afternoons were devoted to refined pursuits like embroidery and painting. Tea time in the early evening, then reading or instrument practice before bed.

"The game described her as 'a helpless noblewoman,' but with this much education, there's no way she'd be useless."

The problem was that game-Katarina had skipped every single one of these lessons.

In my previous-life memories, there was a flashback scene describing how "she'd been spoiled since childhood and had driven away tutor after tutor."

"So if I actually buckle down and study here, I can walk a completely different path from the original Katarina."

This morning's lesson was magical theory. In this world, magic exists, and nobles can use basic spells. The game had combat scenes, but Katarina was written as being unable to use either magic or swordsmanship.

"Professor, I have a question."

"Yes, Lady Katarina? What is it?"

"Could you teach me a bit more about basic offensive and defensive magic?"

My tutor, Professor Bertrand, stared at me with wide eyes.

"...Lady Katarina is interested in magic?"

Apparently, the original Katarina had despised magic lessons.

"Yes. I want to be able to protect myself."

Pretty good line, if I do say so myself. If the doom ending leads to exile, being able to use magic would dramatically improve my survival odds.

Professor Bertrand smiled warmly.

"What a wonderful attitude. Let us begin with an elemental affinity assessment, then."

And so began "Katarina's Serious Magic Training" — something that never happened in the original story.

On top of that, I asked my father, Duke Clausewitz, to arrange sword lessons for me.

"Katarina wants to learn swordsmanship?"

Father was surprised too, but when I said "It's for self-defense," he reluctantly agreed.

Sir Garcia, the vice-captain of the knights' order, was assigned as my instructor.

"Teaching swordplay to a duke's daughter... Well, basic self-defense should be fine."

Garcia was skeptical, but in my previous life, I'd practiced kendo through middle school. A bamboo sword and a real blade are different, but the fundamentals of body movement carry over.

"Hold your stance like this. Feet shoulder-width apart — my lady, you have real talent."

"Thank you!"

Good. If I master both magic and swordsmanship, I can survive no matter which route unfolds.

Operation: Dodge the Death Flags — progressing smoothly.`,
    body_html: null,
    body_html_en: null,
    character_count: 4800,
    is_free: true,
    unlock_at: null,
    unlock_price: 0,
    pv: 0,
    published_at: "2026-03-18T09:00:00Z",
    created_at: "2026-03-18T09:00:00Z",
    updated_at: "2026-03-18T09:00:00Z",
  },
  {
    id: "ep-001-03",
    novel_id: "novel-001",
    episode_number: 3,
    title: "王子との初対面で、早速フラグが立つ",
    title_en: "My First Meeting with the Prince — and a New Flag Appears",
    body_md: `転生から一ヶ月。

魔法修行と剣術稽古のおかげで、体力も少しついてきた。ベルトラン先生によると、私の基礎属性は「風」。攻撃力は低いが、身体強化と移動速度の強化に向いているらしい。

逃げ足に最適じゃないか。破滅回避にぴったりだ。

そんな順調な日々に、突然の来客があった。

「カタリナ、身支度を整えなさい。王宮からお客様がお見えになります」

母の言葉に、胃がキリキリと痛む。

王宮からのお客様。つまり——。

「第一王子レオンハルト殿下と、そのお母上である王妃様が午後にいらっしゃいます」

来た。

ゲームの設定では、カタリナとレオンハルトの婚約は幼少期に交わされたもの。二人が初めて会うのは八歳の時。

今の私は八歳。

「これが最初のフラグか……」

ゲームでは、この初対面でカタリナがレオンハルトに対して横柄な態度を取り、レオンハルトが「なんて嫌な女だ」と心の中で思うのが、後の婚約破棄への伏線になっている。

つまり、ここで好印象を与えればフラグを折れる。

「よし。完璧な令嬢ムーブをかます」

午後。応接間。

王妃様に続いて入ってきたのは、金髪に紫の瞳を持つ少年だった。

レオンハルト・ヴァン・アストリア第一王子。ゲームでは「冷酷な美形王子」として人気の攻略対象だが、八歳の今はまだ幼さが残る顔立ちだ。

「カタリナ・フォン・クラウゼヴィッツです。殿下にお目にかかれて光栄です」

完璧なカーテシー。この一ヶ月、礼法の授業を真面目に受けた成果だ。

レオンハルトが少し驚いた顔をする。

「……レオンハルトだ。よろしく」

ぶっきらぼうだが、これはゲームの設定通り。レオンハルトは人見知りで、特に政略的な婚約に反感を持っている。

ここでゲームのカタリナは「王子なのに態度が悪いわ」と噛みつくのだが、私は違う。

「殿下はお庭にご興味はありますか？ 薔薇がちょうど見頃なんです」

穏やかに微笑んで、庭への散歩を提案する。室内で大人たちに囲まれているより、外の方がリラックスできるだろう。

レオンハルトの目が少し輝いた。

「……行ってもいいのか？」

「もちろんです」

庭に出ると、レオンハルトの表情が明らかに柔らかくなった。

「この薔薇、珍しい品種だな」

「父が各地から集めたものです。殿下は植物がお好きなんですか？」

「……母上の庭にも薔薇がある。でも、こんなに種類が多いのは初めて見た」

会話が弾む。ゲームでは描かれなかったが、レオンハルトは植物に詳しいようだ。

三十分ほど庭を歩いた後、レオンハルトが小さな声で言った。

「カタリナ、と呼んでもいいか」

「はい。私もレオン様とお呼びしてよろしいですか？」

「……ああ」

レオンハルトの頬が少し赤くなっている。

あれ。

ちょっと待って。

これ、もしかして——好感度が上がってない？

フラグを折るつもりが、新しいフラグが立った気がする。

「いや待って、これは予定外……」

「何か言ったか？」

「いえ、何でもありません！」

破滅フラグ回避計画、予定外の方向に進行中。`,
    body_md_en: `One month since my reincarnation.

Thanks to magic training and sword practice, I was finally building some stamina. According to Professor Bertrand, my elemental affinity was Wind. Low on offensive power, but excellent for physical enhancement and speed boosts.

Perfect for running away. Ideal for dodging doom.

Into this streak of smooth progress came an unexpected visitor.

"Katarina, get yourself presentable. We have guests coming from the royal palace."

My mother's words sent a sharp pain through my stomach.

Guests from the royal palace. Meaning—

"His Highness First Prince Leonhardt and Her Majesty the Queen will be arriving this afternoon."

Here we go.

In the game's lore, Katarina and Leonhardt's engagement was arranged in childhood. Their first meeting takes place when they're eight years old.

I'm eight years old right now.

"So this is the first flag..."

In the game, Katarina acts arrogantly toward Leonhardt at this first meeting, and Leonhardt thinks, "What a dreadful girl" — foreshadowing the eventual broken engagement.

Which means if I make a good impression here, I can snap this flag in half.

"Right. Time for the perfect lady act."

That afternoon. The reception room.

Following the Queen through the door was a boy with golden hair and violet eyes.

Leonhardt van Astoria, the First Prince. In the game, he's a popular love interest known as the "coldly handsome prince," but at eight, his features still carried the softness of youth.

"I am Katarina von Clausewitz. It is an honor to meet Your Highness."

A flawless curtsy. The fruit of a month's worth of diligent etiquette lessons.

Leonhardt looked slightly surprised.

"...I'm Leonhardt. Nice to meet you."

Blunt, but that was exactly how he was written. Leonhardt was shy and particularly resentful of politically arranged engagements.

This is where game-Katarina would snap, "What rude manners for a prince!" But not me.

"Does Your Highness have any interest in gardens? Our roses are in full bloom right now."

I offered a gentle smile and suggested a walk in the garden. He'd be far more relaxed outside than cooped up indoors surrounded by adults.

Leonhardt's eyes brightened slightly.

"...Is that all right?"

"Of course."

Once we were in the garden, his expression visibly softened.

"These roses — they're rare varieties."

"My father collected them from all over. Do you like plants, Your Highness?"

"...My mother's garden has roses too. But I've never seen so many different kinds."

The conversation flowed easily. The game never showed this, but it seemed Leonhardt knew quite a lot about plants.

After about thirty minutes of walking through the garden, Leonhardt said in a small voice:

"May I... call you Katarina?"

"Of course. May I call you Leon?"

"...Yeah."

Leonhardt's cheeks had turned faintly pink.

Wait.

Hold on a second.

Was his affection meter... going up?

I was trying to break a flag, but I think I just triggered a new one instead.

"Wait, this wasn't part of the plan..."

"Did you say something?"

"No, nothing at all!"

Operation: Dodge the Death Flags — veering in an unexpected direction.`,
    body_html: null,
    body_html_en: null,
    character_count: 5100,
    is_free: true,
    unlock_at: null,
    unlock_price: 0,
    pv: 0,
    published_at: "2026-03-22T09:00:00Z",
    created_at: "2026-03-22T09:00:00Z",
    updated_at: "2026-03-22T09:00:00Z",
  },
  {
    id: "ep-001-04",
    novel_id: "novel-001",
    episode_number: 4,
    title: "第二王子と図書館での遭遇",
    title_en: "An Encounter with the Second Prince at the Library",
    body_md: `初対面から半年が経ち、レオンとは月に一度のペースで会うようになった。

会うたびに彼の表情は柔らかくなり、最近では手紙のやり取りまで始まった。手紙の内容は庭の薔薇の話ばかりだが。

「フラグを折るどころか、ゴリゴリに好感度を上げてしまっている気がする」

まあいい。婚約者との関係が良好なのは悪いことではない。問題は、ゲーム本編で聖女が現れた時にレオンが心変わりするかどうかだ。

それより今日は、王都の大図書館に来ている。

魔法の参考書を探すため、父に頼んで馬車を出してもらった。クラウゼヴィッツ公爵家は王都に邸宅を持っているので、月に数日は王都で過ごす。

「風属性の上級魔法……ここにはないかな」

書架の間を歩いていると、奥のテーブルで本を読んでいる少年と目が合った。

銀髪に青い目。整った顔立ちだが、どこか儚い印象を受ける。

……この容姿、見覚えがある。

第二王子、アルベルト・ヴァン・アストリア。

ゲームの攻略対象の一人。正妃の子であるレオンに対して、側妃の子であるアルベルトは王位継承権が低く、宮廷では冷遇されている。

ゲーム中では「影のある知性派王子」として人気があった。

「お隣、よろしいですか？」

アルベルトが驚いた顔をする。

「……私に話しかけるのか？」

「はい。同じ本を探しているようでしたので」

彼が読んでいるのは風属性の魔法書。私と同じ属性だ。

「カタリナ・フォン・クラウゼヴィッツです。レオン様の婚約者をしております」

「知っている。兄上の婚約者殿」

声のトーンが少し冷たい。レオンの婚約者＝敵対勢力、という警戒心だろうか。

「アルベルト殿下も風属性なんですね。私も風で、今ちょうど上級の参考書を探していたんです」

「……君が風属性？ 公爵令嬢が魔法を学んでいるのか」

「護身のためです。何が起きるか分かりませんから」

本音だった。破滅エンドに備えて、あらゆるスキルを身につけておきたい。

アルベルトが少しだけ口元を緩めた。

「変わった令嬢だな。この本なら参考になるかもしれない」

彼が差し出したのは、かなり古い本だった。『風の理——応用と実践』。

「ありがとうございます！」

それから一時間ほど、二人で魔法書を読みながら意見を交わした。アルベルトは口数は少ないが、魔法理論に関する知識は深い。

帰り際、アルベルトが珍しく自分から声をかけてきた。

「また……来るのか、この図書館に」

「ええ、月に二回くらいは」

「そうか」

それだけ言って、彼は足早に去っていった。

……ちょっと待って。

これもフラグでは？

ゲームでは、カタリナとアルベルトの間にイベントはなかった。カタリナはアルベルトを「陰気な王子」と呼んで無視していた設定だ。

それを覆したことで、原作にない新規イベントが発生している。

「破滅フラグを折っているはずなのに、なんでどんどんフラグが増えるの……」

困惑しつつも、いい本を紹介してもらえたので良しとする。

帰りの馬車の中で、アルベルトからもらった本を開く。

ページの間に、銀色の栞が挟まれていた。

「……これ、わざと？」

栞には小さく、「また来い」と書かれていた。

破滅フラグ回避計画。フラグは折れないが、味方は増えている。多分。`,
    body_md_en: `Half a year had passed since our first meeting, and Leon and I were now seeing each other about once a month.

His expression grew warmer with every visit, and recently we'd even started exchanging letters. They were mostly about the roses in his garden, but still.

"I was supposed to be breaking flags, not cranking his affection through the roof..."

Oh well. A good relationship with my fiancé isn't a bad thing. The real question is whether Leon will have a change of heart when the Saintess appears in the main storyline.

But that wasn't today's concern. Today, I was at the Royal Capital's Grand Library.

I'd asked Father to send the carriage so I could look for advanced magic textbooks. Since the Clausewitz family kept a residence in the capital, we spent a few days there each month.

"Advanced Wind magic... I wonder if they have anything here."

As I walked between the bookshelves, I locked eyes with a boy reading at a table in the back.

Silver hair, blue eyes. Handsome features, but something fragile about his presence.

...I recognized that appearance.

The Second Prince, Albert van Astoria.

One of the game's love interests. Unlike Leon, who was born to the Queen, Albert was the son of a consort, which meant lower standing in the line of succession and a cold reception at court.

In the game, he was popular as the "brooding intellectual prince."

"May I sit next to you?"

Albert looked surprised.

"...You're speaking to me?"

"Yes. It seems we're looking for the same kind of book."

He was reading a Wind-attribute magic tome. The same element as mine.

"I'm Katarina von Clausewitz. I'm Lord Leon's fiancée."

"I know. My brother's betrothed."

His tone was slightly cold. Perhaps he saw Leon's fiancée as part of a rival faction.

"So you're also Wind-attuned, Your Highness. I'm Wind as well — I was just looking for an advanced reference text."

"...You're Wind-attuned? A duke's daughter is studying magic?"

"For self-defense. You never know what might happen."

I meant every word. With a doom ending looming, I wanted every skill I could get.

Albert's lips curved into the faintest smile.

"What a peculiar noblewoman. This book might be useful to you."

He held out a rather old volume. "Principles of Wind — Application and Practice."

"Thank you so much!"

We spent about an hour reading magic texts together, exchanging observations. Albert was a man of few words, but his knowledge of magical theory ran deep.

As I was leaving, Albert — unusually — spoke up on his own.

"Will you... be coming back to this library?"

"Yes, about twice a month."

"I see."

That was all he said before walking briskly away.

...Wait a moment.

Was that a flag too?

In the game, there were no events between Katarina and Albert at all. Katarina's character had called him "that gloomy prince" and ignored him entirely.

By changing that, I'd apparently triggered a brand-new event that didn't exist in the original story.

"I'm supposed to be breaking death flags, so why do they keep multiplying...?"

Bewildered though I was, I'd gotten a good book recommendation out of it, so I'd count it as a win.

In the carriage ride home, I opened the book Albert had given me.

Tucked between the pages was a silver bookmark.

"...Did he leave this on purpose?"

Written on it in small, precise letters: "Come again."

Operation: Dodge the Death Flags. The flags refuse to break, but my allies are growing. Probably.`,
    body_html: null,
    body_html_en: null,
    character_count: 5000,
    is_free: true,
    unlock_at: null,
    unlock_price: 0,
    pv: 0,
    published_at: "2026-03-28T09:00:00Z",
    created_at: "2026-03-28T09:00:00Z",
    updated_at: "2026-03-28T09:00:00Z",
  },
  {
    id: "ep-001-05",
    novel_id: "novel-001",
    episode_number: 5,
    title: "従者キースと、領地改革の第一歩",
    title_en: "My Retainer Keith, and the First Step Toward Reform",
    body_md: `九歳の誕生日を迎えた。

転生してから一年。この一年で、私は原作のカタリナとは全く違う人間になりつつある。

魔法は風属性の中級に到達。剣術は初心者を脱し、基本の型を一通り覚えた。礼法も完璧。領地経営の授業も追加で受けている。

「お嬢様、お誕生日おめでとうございます」

従者のキース・クラウゼヴィッツが祝いの言葉を述べる。

キース。原作では「カタリナの義弟にして従者」という設定だが、ゲーム中では影が薄いキャラクターだった。カタリナに冷遇され、存在感のない日々を送っていた——はずだ。

「キース、ありがとう。今日は一緒にお茶にしましょう」

「え……私もですか？」

「もちろん。家族なんだから」

キースの目が大きく見開かれる。原作のカタリナは義弟を「血のつながらない余所者」として扱っていたらしい。

お茶の席で、私は思い切って提案をした。

「キース、領地の農業について調べてくれない？」

「農業、ですか？」

「ええ。クラウゼヴィッツ領の農作物の収穫量が、ここ数年横ばいだって聞いたの。何か改善できることがあるかもしれない」

これは破滅フラグ対策の一環だ。もし国外追放されても、農業の知識があれば食いっぱぐれない。さらに、領地の農業を改善すれば領民の支持を得られる。

キースは真面目な性格なので、一週間後にはしっかりとした調査報告を持ってきた。

「お嬢様、調べました。領地の農地の三割が非効率な輪作をしています。また、灌漑設備が老朽化して水の供給が不安定です」

「さすがキース、完璧な報告ね。改善案は考えた？」

「はい。まず輪作のパターンを見直し、次に灌漑水路の補修を——」

キースが生き生きと語り始める。この子、こういう実務的な仕事が得意なんだ。

「素晴らしいわ。父上に提案書を出しましょう。キースが書いて、私が父上に渡す」

「本当に……私が？」

「あなたの調査と分析があってこその提案よ。自信を持って」

キースの表情が、今まで見たことのないほど明るくなった。

一ヶ月後。

提案は父に受け入れられ、領地の農業改革が小規模ながら始まった。キースは改革の実務責任者に任命され、毎日のように領地を走り回っている。

「お嬢様のおかげで、毎日が充実しています」

「キースが頑張っているからよ」

「いえ、お嬢様が私を信じてくださったから……」

キースの目が潤んでいる。ちょっと泣かないで。

ところで、最近キースの私に対する態度が、明らかに「従者」のそれを超えてきている気がする。

手紙は毎日来るし、花を摘んできてくれるし、他の使用人が近づくと不機嫌になるし。

「これも……フラグ？」

レオン（婚約者）、アルベルト（図書館友達）に加えて、キース（義弟）まで。

私はただ普通に接しているだけなのに。原作のカタリナが周囲をどれだけ冷遇していたかが逆に分かる。

「破滅フラグは減っている。でもそれ以上に、恋愛フラグが増えているのはなぜ……」

九歳の誕生日。破滅回避の道は明るいが、想定外の方角に明るい。`,
    body_md_en: `I turned nine years old today.

One year since my reincarnation. In that year, I had become an entirely different person from the original Katarina.

My magic had reached intermediate level in the Wind element. I'd moved past beginner swordsmanship and learned all the basic forms. My etiquette was flawless. I'd even added estate management classes to my curriculum.

"Happy birthday, my lady."

My retainer Keith Clausewitz offered his congratulations.

Keith. In the original story, his role was "Katarina's adoptive brother and retainer," but he was practically invisible in the game. Mistreated by Katarina, living out his days with no presence whatsoever — or so it should have been.

"Keith, thank you. Let's have tea together today."

"Huh... me too?"

"Of course. You're family."

Keith's eyes went wide. The original Katarina had apparently treated her adoptive brother as "an outsider with no blood ties."

Over tea, I made a bold proposal.

"Keith, could you look into the agriculture on our territory?"

"Agriculture, my lady?"

"Yes. I've heard that crop yields on the Clausewitz lands have been flat for the past several years. There might be something we can improve."

This was part of my death flag countermeasures. Even if I was exiled, agricultural knowledge would keep me fed. Better yet, improving the territory's agriculture would earn the support of our people.

Keith was a diligent soul, so one week later he came back with a thorough investigation report.

"My lady, I've completed my research. Thirty percent of the territory's farmland uses inefficient crop rotation patterns. Additionally, the irrigation infrastructure has deteriorated, making the water supply unreliable."

"Impressive, Keith. A flawless report. Have you thought about improvement plans?"

"Yes. First, we should revise the crop rotation patterns. Then repair the irrigation channels—"

Keith came alive as he spoke. This boy had a real talent for practical work.

"Wonderful. Let's submit a proposal to Father. You write it up, and I'll present it to him."

"You really mean... me?"

"Your research and analysis made this proposal possible. Have confidence in yourself."

Keith's face brightened like I'd never seen before.

One month later.

The proposal was accepted by Father, and agricultural reform on the territory began, modest in scale but real. Keith was appointed as the hands-on manager of the reforms and spent every day running across the territory.

"My lady, thanks to you, every day feels so fulfilling."

"It's because you've been working so hard, Keith."

"No, it's because you believed in me..."

Keith's eyes were glistening. Please don't cry.

By the way, Keith's attitude toward me lately seemed to be clearly exceeding the boundaries of a "retainer."

A letter every day. Fresh-picked flowers brought to my room. Getting visibly irritated whenever other servants came near me.

"Is this... another flag?"

Leon (my fiancé), Albert (my library friend), and now Keith (my adoptive brother).

All I've been doing is treating them normally. It really puts into perspective just how terribly the original Katarina treated everyone around her.

"The death flags are going down. But the romance flags are going up even faster... why?"

My ninth birthday. The path away from doom was bright — just bright in a very unexpected direction.`,
    body_html: null,
    body_html_en: null,
    character_count: 4900,
    is_free: true,
    unlock_at: null,
    unlock_price: 0,
    pv: 0,
    published_at: "2026-04-05T18:00:00Z",
    created_at: "2026-04-05T18:00:00Z",
    updated_at: "2026-04-05T18:00:00Z",
  },

  // 最強魔王 3話
  {
    id: "ep-002-01",
    novel_id: "novel-002",
    episode_number: 1,
    title: "千年の眠りから覚めたら、世界が平和になっていた",
    title_en: "I Woke from a Thousand-Year Sleep to Find the World at Peace",
    body_md: `目が覚めた。

暗い。冷たい。石の棺の中だ。

千年ぶりの目覚め。記憶が徐々に戻ってくる。

私はヴェルザード。かつて「終焉の魔王」と呼ばれ、世界を恐怖に陥れた——とされている——存在だ。

実際のところ、恐怖に陥れたつもりはなかった。ただ魔族の王として領土を守っていただけだ。それを人間たちが勝手に恐怖し、勝手に勇者を送り込んできて、勝手に戦争を始めた。

最終的に勇者との戦いで相打ちになり、深い眠りについた。それが千年前のこと。

「さて」

石の棺を内側から叩くと、あっさりと砕けた。千年経っても魔力は健在らしい。

外に出る。洞窟の出口から差し込む光が眩しい。

洞窟を出ると、そこは山の中腹だった。眼下に広がるのは——。

「なんだ、あの平和そうな風景は」

緑の平野に、ぽつぽつと煙の上がる集落。畑には作物が実り、遠くの川では子供たちが水遊びをしている。

千年前は荒野だったこの一帯が、のどかな農村地帯になっていた。

「ふむ」

魔力で周囲を探る。魔族の気配はほとんどない。強大な魔物もいない。人間の集落がいくつかあるだけだ。

「戦争は終わったのか」

当然だろう。千年も経てば。

山を降りながら考える。さて、これからどうするか。

世界征服？ 興味がない。もうやった。面倒だった。

復讐？ 誰に対して。千年前の関係者は全員死んでいる。

「……農業でもするか」

ふと浮かんだ考えだが、悪くない。千年前にも畑いじりは好きだった。魔王城の屋上で薬草を育てていたのは秘密だ。

辺境の村の近くに、放棄された空き地を見つけた。

「ここにしよう」

魔力で土を耕す。千年分の力が込められた一振りで、畑は完璧に整地された。

……やりすぎた。ちょっとした地震が起きてしまった。

「これからは力を抑えないとな」

こうして、最強魔王の辺境スローライフが始まった。

翌朝。

畑に蒔いた種が、もう芽を出していた。

普通なら一週間はかかるはずだが、魔力を帯びた土壌のせいで成長速度が尋常ではない。

「これは……食べきれないかもしれんな」

近くの村に分けてやるか、と考えていると、村の方から悲鳴が聞こえた。

「魔物だ！ 逃げろ！」

見ると、体長三メートルほどのオークが五匹、村に向かって突進してくる。

千年前の基準では雑魚中の雑魚だが、この平和な村の住人には脅威だろう。

「仕方ない」

指を鳴らす。

五匹のオークが同時に消し飛んだ。

跡形もなく。

「……やりすぎた」

村人たちが呆然とこちらを見ている。

「あ、あの……あなたは？」

「通りすがりの農家だ。気にするな」

「農家があんな魔法を——」

「気にするな」

その日から、村人たちが畑を見に来るようになった。

静かに暮らしたかったんだが。`,
    body_md_en: `I woke up.

Dark. Cold. Inside a stone coffin.

My first awakening in a thousand years. Memories trickled back slowly.

I am Velzard. Once called "The Demon Lord of Ruin," the being said to have plunged the world into terror.

In truth, I never intended to terrify anyone. I was simply protecting my territory as king of the demons. It was the humans who panicked on their own, sent a hero after me on their own, and started a war on their own.

In the end, the hero and I struck each other down in mutual defeat, and I fell into a deep sleep. That was a thousand years ago.

"Well then."

I struck the coffin lid from the inside, and it shattered with no resistance at all. A millennium later and my magic was still going strong, apparently.

I stepped outside. The light streaming through the cave mouth was blinding.

Beyond the cave, I found myself on a mountainside. Spread out below me was—

"What's with that absurdly peaceful scenery?"

Green plains dotted with villages trailing wisps of smoke. Crops ripening in the fields. Children splashing in a distant river.

This entire region had been a wasteland a thousand years ago. Now it was idyllic farmland.

"Hmm."

I probed the surroundings with my magic. Almost no demonic presence. No powerful monsters. Just a handful of human settlements.

"So the war ended."

Naturally. A thousand years was more than enough time.

I thought things over as I descended the mountain. So — what now?

World domination? No interest. Been there, done that. Too much hassle.

Revenge? Against whom? Everyone involved was dead a millennium ago.

"...Maybe I'll try farming."

The thought came out of nowhere, but it wasn't half bad. Even a thousand years ago, I'd enjoyed tending gardens. Growing medicinal herbs on the roof of the Demon Lord's castle had been my secret hobby.

I found an abandoned plot of land near a frontier village.

"This will do."

I tilled the soil with magic. A single sweep charged with a thousand years of accumulated power, and the field was perfectly leveled.

...I overdid it. There was a minor earthquake.

"I'll need to hold back from now on."

And so began the most powerful demon lord's quiet country life.

The next morning.

The seeds I'd sown had already sprouted.

Normally it would take at least a week, but the magic-infused soil had pushed the growth rate far beyond anything natural.

"This might be... more than I can eat."

I was considering sharing with the nearby village when a scream rang out from that direction.

"Monsters! Run!"

I looked and saw five orcs, each about three meters tall, charging toward the village.

By the standards of a thousand years ago, these were the lowest of the low — but to the people of this peaceful little village, they were a real threat.

"Can't be helped."

I snapped my fingers.

All five orcs vanished simultaneously.

Without a trace.

"...I overdid it."

The villagers stared at me, dumbstruck.

"Uh, um... who are you?"

"Just a farmer passing through. Don't worry about it."

"A farmer who can do magic like that—"

"Don't worry about it."

From that day on, villagers started showing up to watch me tend my field.

So much for a quiet life.`,
    body_html: null,
    body_html_en: null,
    character_count: 5000,
    is_free: true,
    unlock_at: null,
    unlock_price: 0,
    pv: 0,
    published_at: "2026-03-20T09:00:00Z",
    created_at: "2026-03-20T09:00:00Z",
    updated_at: "2026-03-20T09:00:00Z",
  },
  {
    id: "ep-002-02",
    novel_id: "novel-002",
    episode_number: 2,
    title: "勇者の末裔がやってきた",
    title_en: "The Hero's Descendant Arrives",
    body_md: `辺境の村に居を構えて一ヶ月。

畑は順調すぎるほど順調だ。キャベツが人の頭ほどの大きさに育ち、トマトは信じられないほど甘い。村人たちに分けても余るので、隣の町に出荷を始めた。「辺境のやたらうまい野菜」として、じわじわと評判になっているらしい。

「平穏だな」

今日も畑を眺めながらお茶を飲む。この生活が永遠に続けばいいのだが。

「あの！」

声がした方を見ると、赤髪の少女が立っていた。年は十五、六歳だろうか。腰に剣を帯び、背中に大きなリュックを背負っている。

冒険者か。こんな辺境に珍しい。

「何か用か」

「あなたがヴェルザードさんですか？ 村人に聞いたんですけど、この辺りの魔物を素手で倒す凄い人がいるって」

「素手ではない。指は鳴らした」

「……それ、もっと凄いんですけど」

少女は改まって自己紹介した。

「私はリーゼ。勇者ハインリヒの末裔です」

勇者ハインリヒ。千年前に私と相打ちになった張本人だ。

「ほう」

「代々伝わる言い伝えがあるんです。『いつか魔王が目覚める。その時は末裔が再び立ち向かえ』って」

「それで、立ち向かいに来たのか」

「はい！ ……いえ、正確には、本当に魔王が復活したのか確かめに来ました。最近、各地で異常な魔力反応が検知されているんです」

異常な魔力反応。

心当たりがある。

畑を耕した時の地震。オークを消し飛ばした衝撃波。料理の火加減を間違えた時の爆発。

全部、私だ。

「魔王は復活していない。安心しろ」

「でもこの魔力反応は——」

「言ったな。安心しろ」

リーゼは疑わしげにこちらを見ていたが、やがて表情を変えた。

「すみません、失礼なことを聞いてもいいですか」

「何だ」

「この野菜、売ってもらえませんか？ めちゃくちゃいい匂いがして……」

結局、リーゼは夕飯を食べていくことになった。

「おいしい！ なんでこんなにおいしいんですか！」

「土がいいんだ」

魔力をたっぷり含んだ土。一般的な農地とは比較にならない栄養素。千年分の魔力が凝縮された土壌から育つ野菜がまずいわけがない。

「ヴェルザードさんは、ずっとここで農業を？」

「そのつもりだ」

「もったいない……この戦闘力で農業って……」

「農業は良いぞ。種を蒔いて、水をやって、日の光を浴びせれば、確実に結果が出る。戦争とは違う」

リーゼがしばらく黙った後、小さく言った。

「私、しばらくこの村にいてもいいですか」

「好きにしろ」

翌日から、リーゼは村に滞在し始めた。

勇者の末裔が魔王の隣で暮らしている。

千年前の私たちが見たら、何と言うだろうか。`,
    body_md_en: `One month since I settled in the frontier village.

The farm was going almost too well. Cabbages had grown to the size of human heads, and the tomatoes were impossibly sweet. Even after sharing with the villagers, I had surplus, so I'd started shipping to the neighboring town. "Those ridiculously good vegetables from the frontier" were apparently building a quiet reputation.

"Peaceful."

Another day sipping tea while gazing at the field. If only this could last forever.

"Excuse me!"

I looked toward the voice and saw a red-haired girl. Fifteen, sixteen years old, perhaps. A sword at her hip and an oversized backpack on her shoulders.

An adventurer. Unusual for a place this remote.

"Can I help you?"

"Are you Velzard? The villagers told me there's someone incredible out here who fights monsters barehanded."

"Not barehanded. I snapped my fingers."

"...That's even more incredible."

The girl introduced herself formally.

"My name is Liese. I'm a descendant of the Hero Heinrich."

The Hero Heinrich. The very man who had struck me down a thousand years ago — at the cost of his own life.

"Is that so."

"There's a legend passed down through our family: 'When the Demon Lord awakens, the descendants must stand against him once more.'"

"So you've come to stand against me, then."

"Yes! ...Well, actually, I came to confirm whether the Demon Lord has really returned. Lately there have been abnormal magic readings detected across the region."

Abnormal magic readings.

I had an idea about that.

The earthquake when I tilled the field. The shockwave when I obliterated the orcs. The explosion when I misjudged the heat while cooking.

All me.

"The Demon Lord has not returned. Rest easy."

"But these magic readings—"

"I said rest easy."

Liese eyed me suspiciously for a while, then her expression shifted.

"I'm sorry, but may I ask something rude?"

"What?"

"Could you sell me some of those vegetables? They smell incredible..."

In the end, Liese stayed for dinner.

"This is amazing! How is everything so good?!"

"The soil is exceptional."

Soil saturated with magic. Nutrients that ordinary farmland couldn't dream of matching. Vegetables grown in earth infused with a thousand years of concentrated magical power had no business tasting anything less than extraordinary.

"Velzard, are you planning to farm here forever?"

"That's the plan."

"What a waste... with combat power like yours, and you're farming..."

"Farming is good. Plant the seeds, water them, give them sunlight, and you're guaranteed results. War is nothing like that."

Liese was quiet for a long moment before saying, softly:

"Would it be all right if I stayed in this village for a while?"

"Suit yourself."

The next day, Liese took up residence in the village.

A hero's descendant, living next door to the demon lord.

I wonder what the versions of us from a thousand years ago would say.`,
    body_html: null,
    body_html_en: null,
    character_count: 5000,
    is_free: true,
    unlock_at: null,
    unlock_price: 0,
    pv: 0,
    published_at: "2026-03-28T09:00:00Z",
    created_at: "2026-03-28T09:00:00Z",
    updated_at: "2026-03-28T09:00:00Z",
  },
  {
    id: "ep-002-03",
    novel_id: "novel-002",
    episode_number: 3,
    title: "村祭りと、意外な来客",
    title_en: "The Village Festival and an Unexpected Visitor",
    body_md: `リーゼが村に来て二週間。

彼女はすっかり村に馴染み、冒険者としてのスキルを活かして村の雑務を手伝っている。魔物退治、狩り、薪割り。「勇者の末裔」の身体能力は伊達ではなく、村人たちにも頼りにされている。

私はと言えば、相変わらず畑仕事の毎日だ。

今日は村の収穫祭。年に一度の祭りで、村人総出で広場に集まる。

「ヴェルザードさんの野菜、今年の目玉ですよ！」

村長のグスタフが嬉しそうに言う。私の畑で採れたカボチャが、人の胴体ほどの大きさに育ったのだ。

「食べきれるのか、あの量」

「三日かけて食べます！」

祭りは賑やかだった。子供たちが走り回り、村の女性たちが料理を並べ、男たちが自家製の酒を酌み交わす。

「ヴェルザードさん、踊りませんか？」

「踊らない」

「えー」

リーゼに誘われたが断った。千年前から踊りは苦手だ。

穏やかな時間が流れる。こういう日々のために、千年の眠りから覚めた甲斐があった。

しかし、平穏は長くは続かなかった。

祭りの最中、空が突然暗くなった。

雲ではない。巨大な翼を持つ何かが、上空を旋回している。

「竜……？」

村人たちが悲鳴を上げる中、その存在は広場の端に降り立った。

竜ではなかった。竜に似た翼を持つ、人型の存在。紫色の肌に金色の目。

魔族だ。

しかも、見覚えがある。

「お久しぶりです、魔王様」

その魔族は膝をついて、深々と頭を下げた。

「ベリアルか」

「覚えていてくださいましたか。光栄です」

ベリアル。千年前の魔王軍四天王の一人。知略を司る参謀だった。

「千年経ってもまだ生きていたのか」

「上位魔族ですので。それより魔王様、お探ししておりました」

「何故だ」

「魔族の国が……存続の危機にございます」

ベリアルの話によると、千年の間に魔族は衰退し、北方の山脈の奥に小さな集落を作って細々と暮らしているという。最近、人間の帝国が領土拡大のために魔族の地に侵攻を始めた。

「お力をお貸しいただけませんか」

「断る」

即答した。

「もう戦争はしない。千年前に十分やった」

「しかし——」

「それより、腹が減っていないか。収穫祭の料理が余っている」

ベリアルは困惑した顔をしていたが、村人たちが恐る恐る差し出したカボチャのスープを一口飲んで、目を見開いた。

「……何ですか、この味は」

「私の畑で採れたカボチャだ」

「魔王様の畑……」

ベリアルが複雑な表情をしている。

その夜、ベリアルはスープを三杯おかわりした。

とりあえず、今日のところは祭りを楽しんでもらおう。

魔族の問題は、明日考えればいい。`,
    body_md_en: `Two weeks since Liese came to the village.

She had settled in completely, putting her adventurer skills to work helping with village chores. Monster extermination, hunting, chopping firewood. The physical abilities of a "hero's descendant" were no joke, and the villagers had come to rely on her.

As for me, it was the same routine of farmwork, day after day.

Today was the village harvest festival. A once-a-year celebration where every villager gathered in the square.

"Your vegetables are the star of the show this year, Velzard!"

Village chief Gustav said it with a beaming grin. The pumpkins from my field had grown to the size of a human torso.

"Can you actually eat all that?"

"We'll take three days to get through it!"

The festival was lively. Children running everywhere, the village women laying out dishes, the men sharing homemade spirits.

"Velzard, won't you dance?"

"I don't dance."

"Aww."

Liese had asked, but I declined. I'd been bad at dancing for a thousand years.

A gentle stretch of time. Days like these made it worth waking from a thousand-year sleep.

But peace never lasts long.

In the middle of the festivities, the sky went suddenly dark.

Not clouds. Something with enormous wings was circling overhead.

"A dragon...?"

As the villagers screamed, the figure descended to the edge of the square.

Not a dragon. A humanoid being with dragon-like wings. Purple skin and golden eyes.

A demon.

One I recognized.

"It has been a long time, my lord."

The demon dropped to one knee and bowed deeply.

"Belial."

"You remember me. I am honored."

Belial. One of the four generals of the Demon Lord's army, a thousand years ago. The strategist among them.

"You're still alive after a thousand years?"

"I am a high-ranking demon, after all. But more importantly, my lord — I have been searching for you."

"Why?"

"The demon nation... faces an existential crisis."

According to Belial, over the past millennium the demons had declined, retreating to a small settlement deep in the northern mountains where they scraped by in obscurity. Recently, a human empire had begun invading demon territory to expand its borders.

"Will you lend us your power?"

"No."

I answered immediately.

"I'm done with war. A thousand years ago was more than enough."

"But—"

"More importantly, are you hungry? There's leftover food from the harvest festival."

Belial wore a bewildered expression, but when the villagers nervously offered a bowl of pumpkin soup and he took a sip, his eyes went wide.

"...What is this flavor?"

"Pumpkin from my field."

"The Demon Lord's field..."

Belial's face was a complicated mix of emotions.

That night, he went back for three more helpings of soup.

For now, let him enjoy the festival.

The demon situation could wait until tomorrow.`,
    body_html: null,
    body_html_en: null,
    character_count: 5000,
    is_free: true,
    unlock_at: null,
    unlock_price: 0,
    pv: 0,
    published_at: "2026-04-04T12:00:00Z",
    created_at: "2026-04-04T12:00:00Z",
    updated_at: "2026-04-04T12:00:00Z",
  },

  // 死神カフェ 2話分
  {
    id: "ep-003-01",
    novel_id: "novel-003",
    episode_number: 1,
    title: "最初の客——忘れた約束",
    title_en: "The First Customer — A Forgotten Promise",
    body_md: `駅裏の路地を三回曲がると、そこにある。

「カフェ・リメンバー」。

看板は木製で、文字はかすれている。扉は重い木のドアで、開けると古びたベルが鳴る。

カウンター五席だけの小さな店。壁には古い時計が一つ。窓はない。

マスターは二十代半ばに見える青年。黒い髪に黒い目。白いシャツの上に黒いエプロン。

「いらっしゃい」

穏やかな声だが、どこか温度がない。

今夜の客は、五十代の男性だった。スーツ姿。ネクタイは緩めてあり、疲れた表情をしている。

「コーヒーを」

「メニューはコーヒーしかありません」

「じゃあそれを」

男はカウンターに座り、店内を見回した。

「変わった店だな。Googleマップに載ってないんだが」

「ええ。載せていないので」

マスターがコーヒーを淹れる。ハンドドリップ。豆を挽く音、湯を注ぐ音。静かな店内にそれだけが響く。

一杯のコーヒーが差し出された。

「どうぞ」

男は一口飲んだ。

「……うまいな」

そして、目の焦点が遠くなった。

「あ……」

男の瞳に、涙が滲む。

「思い出した」

「何をですか」

「娘と……約束したんだ。二十年前に。『お父さんが退職したら、二人で北海道に行こう』って」

男は震える声で続けた。

「仕事が忙しくて。昇進して、もっと忙しくなって。気づいたら娘は結婚して家を出て。孫もできたのに、約束のことをすっかり忘れていた」

マスターは黙って聞いている。

「今日、娘から電話があったんだ。『お父さん、来月で定年でしょう。何か予定ある？』って」

男はコーヒーカップを両手で包んだ。

「このコーヒーを飲んだら、なぜか突然思い出した。娘が小学生の時に、北海道の写真を見せて、目をキラキラさせながら言ったんだ。『ねえお父さん、ここに行きたい』って」

「いい記憶ですね」

「ああ……明日、娘に電話する。北海道、行こうって」

男は涙を拭いて、コーヒーを飲み干した。

「いくらだ」

「お代は結構です」

「え？」

「当店は、お代をいただいていません」

男は不思議そうな顔をしたが、それ以上は聞かなかった。

「ありがとう。美味いコーヒーだった」

ドアのベルが鳴り、男が去る。

マスターはカップを洗いながら、独り言のように呟いた。

「まだ間に合う人は、いいな」

時計の針が、ゆっくりと動いている。

このカフェには、訳ありの客しか来ない。

そして、マスターは——自称、死神だ。`,
    body_md_en: `Take three turns down the alley behind the station, and there it is.

"Cafe Remember."

The sign is wooden, the letters faded. The door is heavy oak, and when you open it, an old bell chimes.

A tiny place with just five seats at the counter. A single antique clock on the wall. No windows.

The barista looks to be in his mid-twenties. Black hair, black eyes. A white shirt under a black apron.

"Welcome."

A gentle voice, but somehow lacking warmth.

Tonight's customer was a man in his fifties. Suit and tie — the tie loosened, a weary look on his face.

"Coffee, please."

"Coffee is the only thing on the menu."

"Then I'll have that."

The man sat at the counter and looked around.

"Unusual place. Can't find it on Google Maps."

"No. We're not listed."

The barista began to brew. Hand drip. The sound of grinding beans, the sound of water being poured. In the quiet shop, nothing else could be heard.

A single cup of coffee was placed before him.

"Here you are."

The man took a sip.

"...This is good."

Then his gaze drifted far away.

"Ah..."

Tears welled in his eyes.

"I remember now."

"What do you remember?"

"I made a promise... to my daughter. Twenty years ago. 'When you retire, Dad, let's go to Hokkaido together.'"

He continued in a trembling voice.

"Work got busy. I got promoted, and it got busier. Before I knew it, my daughter had gotten married and moved out. I even have grandchildren now, but I'd completely forgotten that promise."

The barista listened in silence.

"She called me today. 'Dad, you're retiring next month, right? Do you have any plans?'"

The man wrapped both hands around his coffee cup.

"When I drank this coffee, I suddenly remembered. When she was in elementary school, she showed me photos of Hokkaido, her eyes sparkling, and said, 'Hey Dad, I want to go here.'"

"That's a beautiful memory."

"Yeah... I'm going to call her tomorrow. Tell her let's go to Hokkaido."

The man wiped his tears and drained his cup.

"How much do I owe you?"

"No charge."

"What?"

"We don't take payment here."

The man looked puzzled but didn't press the matter.

"Thank you. That was excellent coffee."

The bell on the door chimed as he left.

The barista murmured while washing the cup, as if speaking to no one.

"It's nice when they're the kind who still have time."

The clock hands moved slowly onward.

Only troubled souls find their way to this cafe.

And the barista — he claims to be a reaper.`,
    body_html: null,
    body_html_en: null,
    character_count: 5000,
    is_free: true,
    unlock_at: null,
    unlock_price: 0,
    pv: 0,
    published_at: "2026-03-22T09:00:00Z",
    created_at: "2026-03-22T09:00:00Z",
    updated_at: "2026-03-22T09:00:00Z",
  },
  {
    id: "ep-003-02",
    novel_id: "novel-003",
    episode_number: 2,
    title: "二人目の客——消えた夏の日",
    title_en: "The Second Customer — A Lost Summer Day",
    body_md: `雨の夜だった。

カフェ・リメンバーに、若い女性が飛び込んできた。二十代後半。ずぶ濡れで、傘を持っていない。

「すみません、雨宿りさせてください……って、ここカフェですか？」

「ええ。コーヒーをお出ししています」

「じゃあ、お願いします。温かいのを」

女性はカウンターに座り、髪から雫を垂らしながら店内を見た。

「不思議な雰囲気のお店ですね」

「よく言われます」

マスターがコーヒーを淹れる。いつもと同じハンドドリップ。ただし、湯の温度を少しだけ高くした。冷えた体を温めるために。

「どうぞ」

女性が一口飲んだ瞬間、手が止まった。

「……海の匂いがする」

「コーヒーからですか？」

「いえ……記憶から」

女性の目が潤む。

「高校の時の、夏休みのことを思い出しました」

それは十年前の話だという。

高校二年の夏。彼女は親友のマナと、海辺の町に旅行した。二人きりの、初めての旅行だった。

「バスに乗って、海に行って、スイカ割りして、花火を見て。たった二泊三日だったのに、人生で一番楽しかった」

「いい思い出ですね」

「でも、その後すぐにマナと喧嘩したんです。くだらないことで。彼氏がどうとか、進路がどうとか。それきり、連絡を取らなくなって」

女性はカップを見つめた。

「十年間、一度もマナに連絡していない。SNSも見ないようにしていた。見たら、楽しそうにしているのが辛いから」

「なぜ辛いんですか」

「……私が悪かったから。喧嘩の原因は、私の嫉妬だった。マナは可愛くて、明るくて、彼氏もいて。私は地味で、何もなくて。マナの幸せが眩しくて、八つ当たりした」

長い沈黙。

「でも今、あの夏の海を思い出して……マナの笑顔を思い出して。あの笑顔は本物だった。私に向けてくれた笑顔は、本物だったんだ」

マスターが小さく頷く。

「十年前の記憶は、嘘をつきません」

女性が顔を上げた。

「連絡してみようかな」

「いいと思います」

「でも、今さら何て言えば……」

「十年前に言えなかった言葉を、そのまま」

女性はスマートフォンを取り出し、しばらく画面を見つめていた。

そしてゆっくりと、メッセージを打ち始めた。

五分後。

「……返事が来た」

女性の声が震えている。

「マナ、返事くれた。『ずっと待ってたよ』って……」

涙がこぼれた。

「ありがとうございます。このコーヒー……不思議ですね」

「当店のコーヒーは、忘れた記憶を思い出させる効果があります」

「魔法みたい」

「魔法のようなものです」

雨が上がった。

女性は笑顔で店を出て行った。傘は、もう要らないようだ。

マスターがカップを片付ける。

「また一人、間に合った」

壁の時計の横に、小さなノートがある。マスターはそこに、短く記す。

「四月六日。雨。二人目の客。友人との再会」

このカフェに来る人間は、全員が「思い出すべき記憶」を持っている。

マスターの仕事は、それを取り戻す手伝いをすること。

死神の仕事は、魂を連れて行くことだけではない。`,
    body_md_en: `It was a rainy night.

A young woman burst into Cafe Remember. Late twenties. Soaking wet, no umbrella.

"I'm sorry, could I take shelter from the rain... wait, is this a cafe?"

"It is. We serve coffee."

"Then yes please. Something hot."

She sat at the counter, water dripping from her hair, and took in the space.

"This place has a curious atmosphere."

"So I'm told."

The barista brewed coffee. The same hand drip as always. Except he raised the water temperature just slightly — to warm a chilled body.

"Here you are."

The moment she took her first sip, her hand froze.

"...I can smell the ocean."

"From the coffee?"

"No... from the memory."

Her eyes glistened.

"I just remembered summer vacation in high school."

It was a story from ten years ago, she said.

Summer of her sophomore year. She and her best friend Mana had traveled to a seaside town. Their first trip, just the two of them.

"We rode the bus, went to the beach, played watermelon splitting, watched fireworks. It was only two nights and three days, but it was the happiest time of my life."

"That sounds like a wonderful memory."

"But right after that, Mana and I had a fight. Over something stupid. Boyfriends, college plans, that kind of thing. And after that... we just stopped talking."

She stared into her cup.

"I haven't contacted Mana once in ten years. I stopped checking her social media too. It hurt to see her looking happy."

"Why did it hurt?"

"...Because I was the one in the wrong. The fight was caused by my jealousy. Mana was cute, outgoing, had a boyfriend. I was plain, had nothing. Her happiness was too bright, and I lashed out."

A long silence.

"But just now, remembering that summer ocean... remembering Mana's smile. That smile was real. The smile she gave me was real."

The barista nodded slightly.

"Memories from ten years ago don't lie."

She looked up.

"Maybe I should reach out to her."

"I think you should."

"But what would I even say after all this time..."

"The words you couldn't say ten years ago. Just as they are."

She took out her smartphone and stared at the screen for a while.

Then slowly, she began typing a message.

Five minutes later.

"...She wrote back."

Her voice was shaking.

"Mana wrote back. She said, 'I've been waiting for you all this time'..."

The tears spilled over.

"Thank you. This coffee... it's mysterious, isn't it?"

"Our coffee has the effect of bringing back forgotten memories."

"Like magic."

"Something like magic."

The rain had stopped.

She left the shop with a smile. She didn't seem to need an umbrella anymore.

The barista cleared away the cup.

"Another one who made it in time."

Beside the clock on the wall, there was a small notebook. The barista wrote in it briefly.

"April 6th. Rain. Second customer. Reunion with a friend."

Every person who finds their way to this cafe carries a memory that needs to be remembered.

The barista's job is to help them reclaim it.

A reaper's work isn't only about collecting souls.`,
    body_html: null,
    body_html_en: null,
    character_count: 5000,
    is_free: true,
    unlock_at: null,
    unlock_price: 0,
    pv: 0,
    published_at: "2026-03-29T09:00:00Z",
    created_at: "2026-03-29T09:00:00Z",
    updated_at: "2026-03-29T09:00:00Z",
  },
];

// --- データ取得ヘルパー ---
export function getMockNovels() {
  return MOCK_NOVELS;
}

export function getMockNovelBySlug(slug: string) {
  return MOCK_NOVELS.find((n) => n.slug === slug) || null;
}

export function getMockNovelById(id: string) {
  return MOCK_NOVELS.find((n) => n.id === id) || null;
}

export function getMockEpisodes(novelId: string) {
  return MOCK_EPISODES.filter((e) => e.novel_id === novelId).sort(
    (a, b) => a.episode_number - b.episode_number
  );
}

export function getMockEpisode(novelId: string, episodeNumber: number) {
  return (
    MOCK_EPISODES.find(
      (e) => e.novel_id === novelId && e.episode_number === episodeNumber
    ) || null
  );
}

export function getMockEpisodeById(episodeId: string) {
  return MOCK_EPISODES.find((e) => e.id === episodeId) || null;
}

// 面白さスコア付きの小説一覧（モック版: PV順にフォールバック）
// モック品質データ（作品IDごとのダミー読者行動指標）
const MOCK_QUALITY: Record<string, { completion: number; next: number; bookmark: number }> = {
  "novel-001": { completion: 88, next: 82, bookmark: 15 },
  "novel-002": { completion: 75, next: 71, bookmark: 10 },
  "novel-003": { completion: 92, next: 85, bookmark: 22 },
};

export function getMockRankedNovels(genre?: string, limit: number = 50) {
  let novels = MOCK_NOVELS;
  if (genre) novels = novels.filter((n) => n.genre === genre);

  return novels
    .map((n) => {
      const q = MOCK_QUALITY[n.id] ?? { completion: 70, next: 65, bookmark: 8 };
      return {
        ...n,
        recent_pv: n.total_pv,
        avg_completion_rate: q.completion,
        avg_next_episode_rate: q.next,
        avg_bookmark_rate: q.bookmark,
        score: n.total_pv + q.completion * 100 + q.next * 50,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// 新着エピソード（モック版: 公開日降順）
export function getMockRecentEpisodes(limit: number = 20) {
  return MOCK_EPISODES
    .map((ep) => {
      const novel = MOCK_NOVELS.find((n) => n.id === ep.novel_id);
      return { ...ep, novel_title: novel?.title ?? "", novel_slug: novel?.slug ?? "" };
    })
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .slice(0, limit);
}

// ジャンル別小説一覧（モック版）
export function getMockNovelsByGenre(genreId: string) {
  return MOCK_NOVELS.filter((n) => n.genre === genreId);
}

export function getMockNovelsByTag(tag: string) {
  return MOCK_NOVELS.filter((n) => n.tags.includes(tag));
}

export function getMockRelatedNovels(
  novel: Pick<Novel, "id" | "genre" | "tags">,
  limit: number = 3
) {
  return MOCK_NOVELS.filter((n) => n.id !== novel.id)
    .filter((n) => n.genre === novel.genre || n.tags.some((t) => novel.tags.includes(t)))
    .slice(0, limit);
}
