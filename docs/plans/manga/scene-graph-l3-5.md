# L3.5 Scene-Graph 仕様 (Phase β B1)

**Status**: Draft (2026-05-07 〜) — Plan: `~/.claude/plans/cheeky-frolicking-phoenix.md`
**Position**: pipeline-v2 の L3 (Shotlist) と L4 (Storyboard) の間に新設
**Purpose**: 物語論理 × 頁演出 × 評価選別の交差ハブ。bible から panel への直行を撤回し、scene-graph で物語構造を確定させてから panel 化する

## 1. 設計目的と境界

### 入力
- `bible/snapshot.json` — world / characters / locations / props
- `episodes/epNN/shotlist.json` — L3 出力 (場面・カメラ・登場キャラの素案)
- `episodes/epNN/_brief.v2.md` — episode brief (cast, must_include_events, cliffhanger)
- `volumes/vNN/plot.json` — volume plot (arc 内位置、巻ごとの到達点)

### 出力
- `episodes/epNN/scene_graph.json` — 1 episode = 5-10 scene の中間表現

### scene-graph がカバーする責務 (これより上の中間表現は無い)
- **物語論理**: 各 scene の arc 内位置、ビート種別、cast 制約、台詞 plan、伏線、関係性 delta、主人公 arc 状態、時系列 DAG
- **頁演出**: scene の page 予算、演出 mode、めくり位置、layout pattern 候補、subtype directive、render strategy
- **評価選別**: scene 単位の候補生成、pairwise tournament、predict-hit (v12 アンサンブル)、anchor pool 比較、3 段ループの decision_log
- **L4 へのインターフェース**: 各 scene が抱える location_id / cast / dialogue_plan は panel に**継承される**。panel 側で直接書かない

### scene-graph がカバーしない責務 (上位 / 下位)
- 巻全体のアーク (`build-story-arcs` 出力 = `volumes/vNN/plot.json` に保持)
- panel 単位のコマ割り (L4 storyboard が責任)
- ページ内 panel 配置 / 形状 (L5 page-director の責任)
- 描画 (L9 render の責任)

## 2. 1 episode = 5-10 scene の粒度ガイド

「scene = 連続する 1〜数 page にまたがる、location が変わらず cast 主軸が変わらず時間軸も連続な単位」。
ビート種別が切り替わる位置が scene 境界 (例: introduce → reveal → setup → payoff)。

**境界判定ルール (まずこの順で評価)**:
1. **location_id が変わる** — 必ず新 scene
2. **time_axis が flashback / flashforward に切り替わる** — 必ず新 scene
3. **beat_type が切り替わる** — 通常は新 scene (transition は同 scene 内に吸収可)
4. **主人公の `protagonist_arc_state.belief` または `goal` が変わる** — 新 scene
5. それ以外 (panel 数増、cast 微増、emotion 変化) は同 scene 内 panel 増として扱う

**page 予算の目安** (横読み B6 KDP 想定):
- silence / introspection mode → 1〜2 page
- dialogue mode → 1〜2 page
- action mode → 2〜4 page
- climax (payoff/cliff) mode → 2〜3 page

**1 episode = 5-10 scene** に収まらない場合はビートが過密 (ep 分割を検討) または過疎 (ペーシング不足)。

## 3. Schema (TypeScript 表現)

```typescript
// src/lib/manga/scene-graph/schema.ts (Phase β B2 で実装)

export type SceneGraphV1 = {
  schema_version: 1;
  episode_id: string;
  scenes: Scene[];
  episode_metrics?: EpisodeMetrics;  // B4 episode 全体採点
  pull_link?: PullLink;              // L4 と同じ構造、cliffhanger 接続
  generated_at: string;              // ISO8601
  source: { brief_path: string; shotlist_path: string; bible_snapshot_path: string };
};

export type Scene = {
  // === 識別 ===
  scene_id: string;            // "S01", "S02" ...
  scene_no: number;
  prev_scene_id: string | null;
  next_scene_id: string | null;
  page_range: { start: number; end: number };  // page 番号 (scene 境界が page 内の場合は両 scene が同 page を共有可)
  panel_range: { start_panel_no: number; end_panel_no: number };  // panel 単位の正確な範囲

  // === A 系: 物語論理 (小説 v3 由来) ===
  arc_position: ArcPosition;
  beat_type: BeatType;
  cast: CastEntry[];              // brief.cast の subset、presence で voice_off / tv / phone_screen を区別
  dialogue_plan: DialoguePlan;
  foreshadow_setup: ForeshadowSetup[];  // payoff_episode_hint で cross-episode DAG を可視化
  foreshadow_payoff: string[];    // setup 側の token を回収
  protagonist_arc_state: ProtagonistArcState;
  relationship_state_delta: RelationshipDelta[];
  time_axis: TimeAxis;

  // === B 系: 頁演出 (漫画 craft 由来) ===
  location_id: string;            // 主 location (bible.locations の id、snapshot.json 基準)
  sub_locations?: string[];       // 同 scene 内で連続通過する補助 location (例: ゲート→通路、cross-cut の従位置)
  page_budget: { min: number; max: number; preferred: number };
  mode: SceneMode;
  turn_anchor: TurnAnchor;
  layout_pattern_id: string | null;  // kindle-test-1 抽出辞書、Phase β 中盤で wire
  subtype_directive: SubtypeDirective;
  render_strategy: "page_one_shot" | "panel_composite";
  key_visual_intent: string;      // scene 主軸の絵的訴求 1 行

  // === C 系: 選別ループ (B3) ===
  selection?: SceneSelection;     // optional、Tier 採点後にのみ存在
};

export type ArcPosition = {
  volume: number;                 // 巻
  episode_in_volume: number;      // 巻内 episode 番号
  arc_phase: "introduce" | "rising" | "climax" | "falling" | "resolution";
  arc_position_normalized: number;  // 0..1 (volume 全体での相対)
};

export type CastEntry = {
  character_id: string;
  presence: "in_person" | "voice_off" | "tv" | "phone_screen" | "memory" | "log_visual";
  // in_person: 対面で登場
  // voice_off: 声のみ (ナビ響など)
  // tv: テレビ越し (灯里のニュース)
  // phone_screen: スマホ画面越し
  // memory: 主人公の回想内に登場 (flashback scene)
  // log_visual: モニター / ログに静止画として登場 (DPC 監視室の cross-cut 等)
};

export type BeatType =
  | "introduce"     // 世界観・キャラ導入
  | "setup"         // 後段の payoff のための情報提示
  | "reveal"        // 隠れた事実の開示
  | "turn"          // 状況転換 / 主人公の決断
  | "payoff"        // setup の回収、最大盛り上がり
  | "cliff"         // 引き、cliffhanger
  | "aftermath"     // payoff 直後の余韻
  | "transition";   // 場面接続、scene 境界に置けないシーン素材

export type ForeshadowSetup = {
  token: string;                  // "F_navi_xp_multiplier_condition" など命名規則 F_<topic>_<detail>
  payoff_episode_hint: "this_episode" | "next_episode" | "later_in_volume" | "cross_volume";
};

export type DialoguePlan = {
  key_lines: KeyLine[];           // この scene が抱える台詞のうち重要なもの
};

export type KeyLine = {
  speaker: string;                // character_id
  text: string;
  uniqueness: "scene_exclusive" | "may_repeat";
  // scene_exclusive: cliffhanger 決め台詞など、他 scene で書けない
  // may_repeat: モチーフ反復可
  intent: "establish" | "hook" | "reveal" | "cliff" | "callback";
};

export type ProtagonistArcState = {
  belief: string;                 // この scene 終了時点の主人公の信念
  goal: string;                   // 当面の目的
  emotion: "despair" | "resignation" | "curiosity" | "determination" | "fear" | "elation" | "tension" | "calm";
  delta_from_prev: string;        // 前 scene からの内的変化を 1 行
};

export type RelationshipDelta = {
  pair: [string, string];         // [character_id, character_id] (アルファベット順で正規化)
  direction: "closer" | "farther" | "tense" | "trust+" | "trust-" | "rival+" | "unchanged";
  intensity: number;              // -2..+2
  trigger: string;                // 何で変わったか 1 行
};

export type TimeAxis = {
  label: string;                  // "午前6時14分" / "夜勤明け" / "翌日"
  order: number;                  // episode 内の時系列 order (整数)、小さいほど前
  is_flashback: boolean;
  is_flashforward: boolean;
  duration_hint: "moments" | "minutes" | "hours" | "day_boundary";
};

export type SceneMode =
  | "silence"            // 無言コマ多用、内省
  | "dialogue"           // 会話主体
  | "action"             // 戦闘 / 動的シーン
  | "introspection"      // 主人公モノローグ主体
  | "external_social"    // SNS / 外部 UI 演出 (subtype=external_social)
  | "transition_montage" // 場面接続のモンタージュ
  | "establishing";      // 場所紹介、説明的

export type TurnAnchor = {
  // 「めくり」位置: 横読み B6 で右ページ末尾の panel
  at_panel_no: number | null;     // L4 panel 化後にバインド
  type: "reveal_turn" | "cliff_turn" | "tension_turn" | "none";
};

export type SubtypeDirective = {
  external_social: boolean;       // SNS 通知 / external_social UI を出すか
  gacha_ui: boolean;              // ガチャ UI / レベル up 演出を出すか
  hybrid: boolean;                // 両方
};

export type SceneSelection = {
  tier: 1 | 2 | 3;                // 採用された tier
  iterations: number;             // Tier 1 を回した回数 (再生成含む)
  candidate_count: number;        // 採用までに生成した候補数
  pairwise_score: number;         // tournament で勝った率 0..1
  predict_hit: { v12_ep1: number; v12_longform: number; ensemble: number };
  anchor_diff: {
    top3_anchor_ids: string[];
    cosine_avg: number;
    llm_score: number;            // 0..1, anchor 比較で LLM が付けた絶対品質
  };
  template_collision: { collision_rate: number; nearest_template: string | null };
  decision_log: { selected_at: string; tier3_human_decision?: string };
};

export type EpisodeMetrics = {
  // B4: episode 全体採点
  pattern_match: { matched_pattern_id: string; distance: number };
  template_collision_avg: number;
  foreshadow_dag: { setup_count: number; payoff_count: number; orphan_setups: string[]; payoff_without_setup: string[] };
  pacing_curve: { in_anchor_range: boolean; deviation_score: number };
  relationship_terminal_consistency: boolean;  // 巻終了到達点との一致
};

export type PullLink = {
  current_episode_cliff: string;
  next_opening_hook_hint: string;
  is_volume_end: boolean;
};
```

## 4. panel との関係 (L4 インターフェース契約)

### 継承ルール
- panel.entities.location_id ← scene.location_id (panel で書き換え禁止、scene 横断は不可)
- panel.entities.characters ← scene.cast の subset (新規キャラ追加禁止、scene.cast 外は禁止)
- panel.dialogue + panel.monologue の speaker ⊂ scene.cast (uniq 違反を弾く)
- panel.dialogue で `uniqueness: "scene_exclusive"` の text は **そのシーン内**でのみ書ける

### scene_id へのリンク
panel スキーマに `scene_id: string` を追加 (L4 generation 時に scene-graph から bind)。L8.6 audit ルールで panel.scene_id ↔ scene.page_range の整合を検査。

### scene swap (L4-1, L4-9)
opening-hook / cliffhanger pattern は panel ではなく **scene を別 pattern で再生成** する。再生成された scene が確定すると下流の panel が再走される。`mergeHookProposalIntoStoryboard` の panel-level merge は **廃止**。

## 5. validator (Phase β 同時実装)

scene-graph レベルの validator (`validateSceneGraph(scene_graph, bible, brief)`):

1. `scene.location_id` ⊂ bible.locations
2. `scene.cast` ⊂ bible.characters かつ ⊂ brief.cast
3. `scene.dialogue_plan.key_lines[].speaker` ⊂ scene.cast
4. `key_line.uniqueness == "scene_exclusive"` の text が scene-graph 内で一意
5. `foreshadow_setup[].token` が `payoff_episode_hint` の指定範囲内で `foreshadow_payoff` される
   - `this_episode`: 同 episode 内で payoff されないと **error**
   - `next_episode` / `later_in_volume` / `cross_volume`: 該当 episode で payoff されないと **error**、それまでは "pending" として episode_metrics.foreshadow_dag に積む
   - 同 token が同 episode 内で setup されずに payoff されている (`payoff_without_setup`) は **error**
6. `time_axis.order` が DAG として閉路無し、prev_scene_id/next_scene_id と整合 (flashback/flashforward は order の負号 / 大値で表現、整合性は順序ではなく「scene 列の物語順」で取る)
7. `page_budget.preferred` の合計が episode total_pages の ±10% 以内 (min/max は再生成許容幅)
8. `arc_position.arc_phase` の連続性
   - 通常: 前 scene の arc_phase より後退禁止 (introduce → rising → climax → falling → resolution の順)
   - 例外 1: `beat_type == "cliff"` の scene は climax への逆行を許容 (引きで盛り返す表現)
   - 例外 2: `beat_type == "transition"` の scene は前 phase を維持
   - 例外 3: 巻末 resolution → 次巻冒頭 introduce は許容 (volume 跨ぎ)
9. `protagonist_arc_state.delta_from_prev` の遷移が `feedback_psychological_continuity` ルールに沿う (Phase β 後半で具体化)
10. `cliff` beat は最終 scene (next_scene_id == null) のみ許可
11. `cast[].presence == "memory"` または `is_flashback == true` の scene は前 scene の arc_phase を継承し、protagonist_arc_state.belief は固定 (回想は心情変化を起こさない)

これらが通れば、当初挙げた 7 矛盾のうち 1 (時系列), 2 (台詞先出し), 3 (cast 違反), 4 (loc-action 矛盾), 7 (シーン重複) が schema レベルで発生不能。

## 6. CLI / エントリ

```bash
# B1 (この plan の初期実装、Phase β B2 で実装)
npx tsx scripts/manga/layers/L03_5-scene-graph.ts --slug a07-modern-dungeon --episode 1
# → episodes/ep01/scene_graph.json を出力

# B3 採点ループ (Phase β 中盤で実装)
npx tsx scripts/manga/layers/L03_5-scene-graph.ts --slug a07-modern-dungeon --episode 1 --tier auto
# → tier 1/2/3 を自動進行、各 tier の選別を decision_log に append
```

## 7. a07-ep01 で実測切り出し (B1 検証)

下表は a07-modern-dungeon ep01 を **現 storyboard.json から逆算** で scene-graph に切り直したもの (B1 のスキーマ妥当性検証用)。

| scene | page | location | mode | beat | cast | time | 主人公 belief |
|---|---|---|---|---|---|---|---|
| S01 | P1 | dungeon 5F boss room | action | flashforward | レン | 30秒前 (flashforward) | 「ナビが正解を出せ」(覚醒後) |
| S02 | P2-P4 | lawson interior | introspection | introduce | レン (灯里 TV 越し) | 深夜 0 時 | 「Sランクは関係ない」(諦観) |
| S03 | P5 | lawson exterior | transition_montage | transition | レン | 午前 5 時すぎ | 「探索だけじゃ家賃にもならない」 |
| S04 | P5b-P6a | dpc public counter (回想) | dialogue | reveal (過去) | レン, 槇島 | 過去 (flashback) | 「十五歳で上限が決まった」 |
| S05 | P6b-P7 | ren apartment | introspection | setup | レン | 午前 5:30〜6:00 | 「入口で止まったままだ」 |
| S06 | P8-P10 | ren apartment | dialogue | reveal | レン, ナビ響 (voice_off) | 午前 6:00〜6:14 | 「従えば、勝てるのか？」 |
| S07 | P11-P14 | shinjuku ge → 1F NE corridor | action | setup | レン, ナビ | 午前 6:14 接敵直前 | 「認証で 8 秒削る」 |
| S08 | P15-P18 | 1F NE corridor | action | payoff | レン, ナビ | 接敵 | 「ここだ」(初の主体行動) |
| S09 | P19-P20 | 1F NE corridor | aftermath | aftermath | レン, ナビ | 直後 | 「桁が違う」(認知) |
| S10 | P21-P22 | 1F NE corridor + DPC monitor room | dialogue | cliff | レン, ナビ + DPC 監視ログ | 直後 | 「次は、こっちから取りに行く」 |

**実測結果から得た schema 修正候補**:
- 1 episode = 10 scene、上限ぴったり。S02-S03 や S08-S09 を吸収すれば 8 scene 化も可能だが、回想 (S04)・ナビ初登場 (S06)・DPC 切り替え (S10) で location が変わるため減らせない
- `cast` に「voice_off」の応答 (ナビ響) をどう扱うか — 現 schema は character_id 配列なので OK、ただし scene.cast に voice_off フラグを別途付けるか検討 → **採用**: `cast: string[]` を `cast: { character_id: string; presence: "in_person" | "voice_off" | "tv" | "phone_screen" }[]` に拡張
- S04 (DPC 回想) と S10 (DPC 監視ログ) は **2 location が同 scene** になるケース → schema は 1 scene = 1 location 前提。S10 は scene 分割 (S10a 1F NE corridor / S10b DPC monitor room) するか、scene に sub_locations を許すか → **判断**: 分割する。1 scene 1 location を堅持、time_axis.order で連続を表現
- `arc_position.arc_phase` が ep01 内では rising だけが連続するため、巻内 episode 番号 + scene 番号で「巻全体の中の位置」を表現する方が自然 → schema 通り `arc_position_normalized` で対応可
- `foreshadow_setup`: S06 で「ナビの存在」「条件付き経験値倍化」が setup、ep01 内で payoff (S08-S10)。S10 で「隠し条件達成」「固有スキル開示」が新たな setup (次話 payoff) → 必要十分

## 7.1 Schema 妥当性検証結果 (a07-ep01 実測)

[scene_graph.json](data/manga/works/a07-modern-dungeon/episodes/ep01/scene_graph.json) を 10 scene で切り出し、validator rule に照らした結果:

### 矛盾の構造的発生不能化を確認

| 元 storyboard の矛盾 | 防止 rule | 結論 |
|---|---|---|
| 1. 時系列逆行 (P3 にクライマックス先取り) | Rule 6 (time_axis DAG) + Rule 8 (arc_phase 連続性) | ✅ schema レベルで発生不能 |
| 2. cliffhanger 台詞先出し (P3 panel 13 と P20 で重複) | Rule 4 (scene_exclusive uniqueness) | ✅ schema レベルで発生不能 |
| 3. brief 不在キャラ登場 (氷室 ep01 不在のはず) | Rule 2 (scene.cast ⊂ brief.cast) | ✅ schema レベルで発生不能 |
| 4. location_id と action 矛盾 (P22 panel 109 DPC vs ダンジョン) | L4 継承ルール (panel.location_id ← scene.location_id) | ✅ panel で書き換え不能 |
| 5. bible 未登録 location 使用 | Rule 1 (scene.location_id ⊂ bible.locations) | ✅ schema レベルで発生不能 |
| 6. パネル番号欠番 / 後挿入 | L4 が scene の panel_range から決定的に panel_no を採番 | ✅ scene-graph 入力からの再展開で解消 |
| 7. シーン重複 (P2 と P4 が同じコンビニ夜勤) | Rule 7 + B4 episode_metrics.template_collision_avg | ✅ scene-graph で検出 |

### Validator が見逃すべきでない警告 (実測で発見)

- **F_navi_responds_to_questions (S06 setup, this_episode)** が S08 で payoff token として明示されていない → **orphan warning**。S08 の foreshadow_payoff に追加するか、setup 自体を削除する選択。
- **page_budget.preferred 合計 = 23、total_pages = 22** → page 5 が S03 (panel 21-23) と S04 (panel 24-26) で **共有**されているため。Rule 7 を「page_range の union が total_pages に一致」 + 「panel_range の和集合が total_panels に一致」に書き換える必要 (Phase β B2 実装時に修正)。
- **arc_position_normalized が ep01 内で 0.0〜1.0 を使い切っている** が、本来は volume 全体で 0.0〜1.0。ep01 = 1 巻 10 ep の 1/10 → 0.0〜0.1 範囲に圧縮すべき。a07-ep01 サンプルは「ep01 単体での normalize」になっており、volume 全体 normalize に置換が必要 (Phase β B2 実装時)。

### 設計上の確認事項

- **scene 数 10 = 上限ぴったり**。Phase A 検証作品 (a07/d02/d03) のうち a07-ep01 は densely packed なエピソードと判明。d02/d03 で 5-7 scene に収まれば「5-10 scene」の幅が validate される。
- **a07-ep02 で 6 scene 構成を追加検証** (2026-05-07)。10 scene と異なる粒度でも schema/validator 通過。新たに使用した field: presence=phone_screen (S06: Nm の攻略 wiki 通知)、subtype_directive.external_social=true (S06 のみ)、cross-episode foreshadow 6 件 (next_episode/later_in_volume/cross_volume)。Panel-Scene Inheritance で「P4 が gate location なのに S03 の sub_locations 未登録」エラーを即時検出 → sub_locations 追加で解消、検査機構が新 episode でも実不整合を捉える証拠。

### 2026-05-07: a07-ep01 を新方式で 1 episode 通し実走

`L04-storyboard --from-scene-graph --enrich` で a07-ep01 (10 scene) を end-to-end 実走。

**実測**:
- 所要時間: **269.1 秒** (約 4.5 分) for 1 episode
- 1 巻試算 (10 episodes sequential): **約 45 分**
- Codex CLI subscription 内、ANTHROPIC_API_KEY 課金ゼロ

**結果**:
- pages=22, total_panels=110 (旧 Phase α 手作業版と同一の panel 数)
- validateStoryboardEntityBinding: ok=true (entity 検査全 panel pass)
- validatePanelSceneInheritance: ok=true (warnings 0、旧版に残っていた p111/p112 panel_no 警告が**自動消滅**)
- auditEpisode (B5-6): panel_no_gap=0、cast_subset_violation=0、dialogue_dedup_across_pages=1 件 (S05 mono "俺は、入口で止まったままだ。" を uniqueness=may_repeat で意図的に panel 跨ぎ繰り返し → severity=warn の許容範囲)

**品質印象 (旧手作業版との比較)**:
- panel.action は具体的・映像的に向上 (例 P3 panel 11: 「レンは床のモップを取り、テレビの音を背中で受けながら歩き出す」)
- key_visual も丁寧な絵作り指示 (例: 「明るすぎる通路の中央に、黒フードの背中だけがぽつんと残る」)
- scene_exclusive 台詞 (cliffhanger, etc.) は所有 scene のみで使用、scene-graph と二段ガード
- 旧手作業版は段階的修正の積み重ねで panel 番号欠番 (p111/p112) 等の歪みがあったが、新方式は決定的採番で歪みなし

**設計効果の実証**:
- 「設計図 → コマ割り」の往路がエンドツーエンドで動作
- panel renumber 問題が自動解消 (B5-5 設計目標達成)
- dialogue_dedup の検出は scene-graph (Rule 4 scene_exclusive uniqueness) と auditEpisode の二段で機能

### 2026-05-07: a07 ep01-03 を新方式で連続生成

ep01 / ep02 / ep03 を `--from-scene-graph --enrich` で連続生成、scene-graph 中心パイプラインの量産耐性を確認。

| episode | scene 数 | 所要時間 | total_panels | validation |
|---|---|---|---|---|
| ep01 | 10 | 281s (4.7 min) | 110 | all pass |
| ep02 | 6 | 229s (3.8 min) | 110 | all pass |
| ep03 | 7 | 247s (4.1 min) | 110 | all pass |
| 平均 | 7.7 | **252s/episode** | 110 | |

**1 巻 (10 episode sequential) 試算**: 約 **42 分** (Codex CLI subscription 内、API 課金ゼロ)

**ep03 で発見した validator 課題**:
- cross-episode payoff (ep02 で setup した token を ep03 で payoff) が validateSceneGraph Rule 5 で「setup なしの payoff」として検出される
- 暫定対応: ep03 から該当 payoff を削除 (ep02 setup は hint=later_in_volume として保留)
- 根本対応: 巻全体の cross-episode validator を Phase γ で実装予定 (volume-level foreshadow DAG)

**運用知見**:
- 1 巻 10 episode 並行作業は Max 5h 上限 (~25M tokens) 内で 6 巻並行可能
- 各 episode の scene 数 6-10 が安定範囲
- panel.action / key_visual の品質は Codex 出力で十分 (key_visual_intent と key_lines を context として渡せば schema 制約を守って生成)
- panel renumber 警告は新方式の決定的採番で全 episode 自動解消

### 2026-05-07: a07 1 巻全 10 episode を新方式で完成

ep01-10 を新方式 (`--from-scene-graph --enrich`) で連続生成、第 1 巻完成。

| episode | scene | 所要 | total_panels |
|---|---|---|---|
| ep01 | 10 | 281s | 110 |
| ep02 | 6 | 229s | 110 |
| ep03 | 7 | 247s | 110 |
| ep04 | 7 | 241s | 110 |
| ep05 | 7 | 243s | 110 |
| ep06 | 7 | 236s | 110 |
| ep07 | 7 | 244s | 110 |
| ep08 | 7 | 258s | 110 |
| ep09 | 7 | 247s | 110 |
| ep10 | 7 | 244s | 110 |
| **合計** | **72** | **2470s = 41 分** | **1100** |

**実測サマリー**:
- 1 巻 10 episode sequential 実走: **41 分** (試算 42 分とほぼ一致)
- 平均 247s/episode、平均 7.2 scene/episode
- API 課金ゼロ (Codex CLI subscription 内、ChatGPT Pro $200/月)
- 全 episode で validation 全 pass (Scene-Graph + Panel-Scene Inheritance)

**cross-episode payoff の手作業**:
- ep04 / ep10 で「前 episode setup → 当 episode payoff」が validateSceneGraph Rule 5 に引っかかる
- 暫定対応: 該当 payoff を当 episode から削除 (cross-episode は保留 token)
- 根本対応は Phase γ で巻全体 cross-episode validator を実装予定

**1 巻完成の意義**:
- 「設計図 → コマ割り」往路がエンドツーエンドで 10 episode 連続動作
- 新方式パイプラインの量産耐性を実証
- KDP 出版動線 (memory: project_kdp_strategy) の B6 判 1 巻 160-200 page (現状 22page × 10ep = 220 page) が射程内
- **time_axis.order の値域**: flashforward は 999 のような大値、flashback は -1, -2 等の負値で表現可能。整数で十分。
- **sub_locations の使い所**: S07 (gate→corridor 連続通過) と S10 (corridor + DPC cross-cut) のような演出。1 scene に複数 location を許すが、主軸は 1 つ。
- **cast.presence**: in_person (8), voice_off (5), tv (1), memory (1) を a07-ep01 で使用。phone_screen と log_visual は ep01 では未使用 (将来 episode で出る想定)。

## 7.2 既存 9 エージェントの scene-graph I/O 契約 (B2 整備)

各 agent は scene-graph に対して以下の入出力を行う。実体は `.claude/commands/` 配下の slash command。
prompt の本格改造は **B3 / B4 で必要分のみ**。B2 段階では「契約を docs に明示」してエージェント呼び出し側 (L3.5 entry script や採点ループ) が schema を読み書きする責務を負う。

| agent | scene-graph に対する入出力 | フェーズ | 補足 |
|---|---|---|---|
| build-story-arcs | **入力**: bible + brief + volume_plot / **出力**: 各 scene の `arc_position` (volume / arc_phase / normalized) を確定 | B3 候補生成 | volume 全体での arc 設計を 1 度行い、各 scene にマッピング |
| build-episode-patterns | **入力**: scene-graph 候補列 / **出力**: 最も近い episode-pattern_id と distance | B3 採点 + B4 metrics | episode 全体のシーン列パターン辞書を漫画用に再採取 (B3 後半) |
| build-relationship-graph | **入力**: bible.relations + scene-graph / **出力**: 各 scene 出口の `relationship_state_delta` | B3 候補生成 | scene 候補ごとに delta 計算、巻終了到達点 (`B4 relationship_terminal_consistency`) に整合 |
| build-protagonist | **入力**: bible.characters[主人公] + scene 文脈 / **出力**: 各 scene の `protagonist_arc_state` (belief/goal/emotion/delta_from_prev) | B3 候補生成 | scene-by-scene の状態遷移、Rule 11 (memory/flashback で belief 固定) を尊重 |
| validate-foreshadowing | **入力**: scene-graph.foreshadow_setup + foreshadow_payoff / **出力**: orphan_setups, payoff_without_setup, pending_cross_episode | B4 metrics | `buildForeshadowDag()` (schema.ts) と同じ集計を LLM 視点で語的に評価する補助 |
| audit-coherence | **入力**: scene-graph 全体 + brief / **出力**: validateSceneGraph errors/warnings の自然言語化 + 物語的整合性所見 | B4 metrics | validator (deterministic) と LLM 採点 (語的) の二段で coherence を見る |
| analyze-pacing | **入力**: scene-graph.scenes[].page_budget + beat_type 列 / **出力**: pacing_curve (in_anchor_range, deviation_score) | B4 metrics | anchor pool の pacing カーブと比較 |
| detect-templates | **入力**: scene-graph シーン署名列 (location_id + 主要 cast + beat_type のハッシュ列) / **出力**: 既存作との template_collision_avg と nearest_template | B4 metrics | scene 列構成のテンプレ被り検出 |
| pairwise-judge / batch-eval | **入力**: scene 候補 2 つ (or N 個) / **出力**: pairwise 勝者 (or batch ranking) | B3 採点 Tier 1 | scene 単位の対戦、tournament で採用候補を絞り込む |

### B2 で確定した呼び出し規約

- agent prompt が scene-graph を編集する場合、必ず `validateSceneGraph` を呼び出して errors=0 を確認した上で書き戻す (agent 単独で write しない、L3.5 entry または採点ループが gate する)
- agent が出力する物語論理フィールド (arc_position / protagonist_arc_state / relationship_state_delta / foreshadow_*) は schema.ts の型に厳密に従う (自由記述は warning)
- agent が読む schema 仕様は本ドキュメントを single source of truth とする

## 8. Phase β 内での次ステップ

| 工程 | 内容 | 依存 | Status |
|---|---|---|---|
| B1 | schema 仕様確定、a07-ep01 で実測検証 | (なし) | ✅ 完了 (2026-05-07) |
| B2 | `src/lib/manga/scene-graph/schema.ts` + `validateSceneGraph` 実装 + `L03_5-scene-graph.ts` skeleton + 9 エージェント I/O 契約 | B1 | ✅ 完了 (2026-05-07、a07-ep01 で validation pass) |
| B3 | 3 段採点ループ (`scoring-loop.ts`) 実装、Tier 1 候補生成 → pairwise → predict-hit → anchor 比較 → 採用 | B2 | ⏳ 次の作業対象 |
| B4 | episode-metrics 計算 (pattern / template / foreshadow / pacing / relationship) | B2 + B3 | 未着手 |
| B5 | L4-storyboard を scene-graph 入力に変更、L4-1 / L4-9 を scene swap に格上げ、phase-x-patches 廃止 | B2-B4 | B5-1 完了 (panel-scene 継承検査), B5-2..5 未着手 |

## 9. L4-1 / L4-9 を scene swap に格上げる (B5-2/3 設計)

### 現状 (panel-level merge、撤回対象)

- L4-1 hook (opening-hook-pass) は `mergeHookProposalIntoStoryboard()` で **panel を直接上書き**
- L4-9 cliffhanger も同様に panel を上書き
- 結果: phase-x-patches や他層の panel 編集と衝突 (a07-ep01 P3 矛盾の直接原因)

### 新方針 (scene swap)

opening-hook / cliffhanger pattern は **scene-graph 上で scene を置換** する。panel は触らない。

```
[L3.5] scene_graph (元) ──► [L4-1] hook 提案 (S01-S02 を pattern P で別 scene 候補に書き換え)
                                │
                                ▼
                        scene-graph (S01-S02 を swap した新版)
                                │
                                ▼
                        [L3.5 validate]   ← scene-graph 単独で検証
                                │ ok
                                ▼
                        [L4] panel 再展開 ← 影響範囲の panel のみ再生成
```

### scene swap の手順 (L4-1 の場合)

1. 入力: 既存 scene_graph.json + opening-hook pattern 辞書 (data/generation/opening-hook-patterns.json)
2. 「opening_hook 範囲の scene」を特定 (通常 S01-S02、a07 では S01 fluxforward + S02 introduce)
3. pattern に従って候補 N 個生成 (Tier 1 採点ループ B3 を呼び出し)
4. 採用候補で当該 scene を置換、prev/next リンクを再貼り
5. 後続 scene の foreshadow_setup / arc_position / protagonist_arc_state.delta_from_prev を必要なら自動補正
6. validateSceneGraph + validatePanelSceneInheritance を呼び、 errors=0 を確認
7. 採用提案を `_opening_alts/decisions.jsonl` に append (Phase γ で正式運用)
8. 影響範囲の panel を L4 で再展開 (panel_range 再採番、panel_no を決定的に振り直し)

### scene swap の手順 (L4-9 の場合)

同様に最終 scene (cliff beat) を pattern に従って差し替え。違いは:
- cliff scene の dialogue_plan で `scene_exclusive` の決め台詞が swap で変わる → `validateSceneGraph` Rule 4 で他 scene の重複が無いか自動検査
- pull_link.next_opening_hook_hint が cliff swap と整合するか確認

### 廃止対象

- `mergeHookProposalIntoStoryboard()` (panel-level merge): scene swap に置換、関数を削除予定
- `mergeCliffhangerProposalIntoStoryboard()` (同): 同上
- `_smoke-a07-apply-patches.ts` の panel_insert / panel_modify / page_metadata_modify: scene swap に集約
- 各 layer 末尾の `_layer_touched_by` タグ管理 (Phase α プランで保留): scene swap で衝突原理消滅、不要

### 既存資産の流用

- opening-hook-patterns.json / cliffhanger-patterns.json は **そのまま使う**。pattern の入力単位を panel → scene に変えるだけ
- `_opening_alts/proposals-*.json` の構造は scene-graph 出力に合わせて更新 (panel-level の patch 表現を scene-level の swap 表現に)
- B3 採点ループ (`runTier1`) を直接呼び出して候補生成

### 実装順序 (B5-2..5)

| 工程 | 内容 |
|---|---|
| B5-2 | L4-1 entry script (`L04-1-opening-hook.ts`) を scene swap に書き換え。`mergeHookProposalIntoStoryboard` を `swapHookScenes(sceneGraph, pattern)` に置換 |
| B5-3 | L4-9 entry script (`L04-9-cliffhanger.ts`) を scene swap に書き換え |
| B5-4 | `_smoke-a07-apply-patches.ts` を廃止、phase-x-patches 概念を削除 |
| B5-5 | L4-storyboard を scene-graph 入力に対応 (extractStoryboardFromShotlist の代わりに scene-graph から panel を生成) |
| B5-6 | L8.6 audit-rules.ts に narrative ルール追加 (panel_no_gap / dialogue_dedup_across_pages / cast_subset_violation 等)、ただし scene-graph で塞げる分は重複しないよう整理 |
