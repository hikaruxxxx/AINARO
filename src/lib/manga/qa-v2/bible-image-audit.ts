/**
 * L02b Bible Images Audit
 *
 * L02 で生成された bible/refs/ 配下の参照画像を vision で監査する。
 * Codex CLI ではなく claude CLI を `--print --output-format json --json-schema`
 * で起動し、画像 + spec を渡して issue JSON を取得 → 集約。
 *
 * 対応 kind: locations / characters / props
 *   - locations: 既存実装 (1 location あたり 1 回の claude 呼び出し)
 *   - characters: variant が最大 13+ 種あるので 4 グループに分割し、グループ毎に
 *     1 回の claude 呼び出しを行う (5 分タイムアウト回避)
 *   - props: variant 1〜2 枚なので 1 回で十分
 *
 * 既存の location 用 export (LocationAuditResult / BibleImagesAuditReport /
 * auditLocation / aggregateReport / bibleAuditReportPath / readAuditReport /
 * writeAuditReport) はシグネチャを互換維持。kind 引数はオプションで、
 * 省略時は "locations" として動作する。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";

// ============================================================
// Schema (TypeScript types)
// ============================================================

export const ISSUE_CATEGORIES = [
  "photoreal_residue",          // 3D/airbrush/specular/AO
  "style_drift",                // 劇画/中世ファンタジー/SF逸脱
  "cultural_mismatch",          // era違反 (modern_japan_2026矛盾)
  "iconography_mismatch",       // 場所種別の標準シンボル不一致
  "continuity_anchor_missed",   // spec.continuity_anchors が画像で守られず
  "variant_drift",              // variant命名と内容不一致 (重複/別location化)
  "cross_variant_inconsistency",// 同location内で別部屋に見える
  "text_artifact",              // 文字/ロゴ/英字/ルーン/UI数値/空白看板過多
  "density",                    // 紙面白率不足
  "physics_break",              // パース/家具配置矛盾/人物混入
] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export type Severity = "ok" | "minor" | "major" | "critical";

export type AuditIssue = {
  category: IssueCategory;
  anchor_id?: string;
  description: string;
};

export type VariantAuditResult = {
  variant: string;
  image_relpath: string; // bible/refs/locations/<id>/<variant>.png 相対 (refs ルートから)
  severity: Severity;
  issues: AuditIssue[];
  strengths: string;
  suggested_fix: string;
};

export type AuditKind = "locations" | "characters" | "props";

export type LocationAuditResult = {
  location_id: string;
  location_name: string;
  variants: VariantAuditResult[];
  cross_variant_notes: string;
  audited_at: string; // ISO
  /** claude CLI が JSON を返さなかった/parse 失敗等のエラー */
  error?: string;
};

export type CharacterAuditResult = {
  character_id: string;
  character_name: string;
  variants: VariantAuditResult[];
  cross_variant_notes: string;
  audited_at: string; // ISO
  error?: string;
};

export type PropAuditResult = {
  prop_id: string;
  prop_name: string;
  variants: VariantAuditResult[];
  cross_variant_notes: string;
  audited_at: string; // ISO
  error?: string;
};

export type EntityAuditResult = LocationAuditResult | CharacterAuditResult | PropAuditResult;

/**
 * 共通 summary。entity 種別を問わず同じ形にする。
 * regen_priority の entity_id は kind により location_id / character_id / prop_id を意味する。
 */
export type AuditSummary = {
  total_entities: number;
  total_images: number;
  by_severity: Record<Severity, number>;
  regen_priority: Array<{
    entity_id: string;
    variant: string;
    severity: Severity;
    reason: string;
  }>;
};

/**
 * Locations 用 report (既存形を維持)。
 * Console UI などの既存利用者は引き続きこの形を読む。
 */
export type BibleImagesAuditReport = {
  schema_version: 1;
  slug: string;
  audited_at: string; // ISO
  audited_by: "L02b-bible-images-audit";
  model: string; // 例: "claude-haiku-4-5"
  locations: LocationAuditResult[];
  summary: {
    total_locations: number;
    total_images: number;
    by_severity: Record<Severity, number>;
    regen_priority: Array<{
      location_id: string;
      variant: string;
      severity: Severity;
      reason: string;
    }>;
  };
};

export type BibleCharactersAuditReport = {
  schema_version: 1;
  slug: string;
  audited_at: string;
  audited_by: "L02b-bible-images-audit";
  model: string;
  characters: CharacterAuditResult[];
  summary: {
    total_characters: number;
    total_images: number;
    by_severity: Record<Severity, number>;
    regen_priority: Array<{
      character_id: string;
      variant: string;
      severity: Severity;
      reason: string;
    }>;
  };
};

export type BiblePropsAuditReport = {
  schema_version: 1;
  slug: string;
  audited_at: string;
  audited_by: "L02b-bible-images-audit";
  model: string;
  props: PropAuditResult[];
  summary: {
    total_props: number;
    total_images: number;
    by_severity: Record<Severity, number>;
    regen_priority: Array<{
      prop_id: string;
      variant: string;
      severity: Severity;
      reason: string;
    }>;
  };
};

export type AnyBibleImagesAuditReport =
  | BibleImagesAuditReport
  | BibleCharactersAuditReport
  | BiblePropsAuditReport;

// ============================================================
// JSON schema (claude --json-schema 用)
// ============================================================

function makeJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      location_id: { type: "string" },
      variants: {
        type: "array",
        items: {
          type: "object",
          properties: {
            variant: { type: "string" },
            severity: { enum: ["ok", "minor", "major", "critical"] },
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { enum: [...ISSUE_CATEGORIES] },
                  anchor_id: { type: "string" },
                  description: { type: "string" },
                },
                required: ["category", "description"],
                additionalProperties: false,
              },
            },
            strengths: { type: "string" },
            suggested_fix: { type: "string" },
          },
          required: ["variant", "severity", "issues", "strengths", "suggested_fix"],
          additionalProperties: false,
        },
      },
      cross_variant_notes: { type: "string" },
    },
    required: ["location_id", "variants", "cross_variant_notes"],
    additionalProperties: false,
  };
}

// ============================================================
// Prompt builder
// ============================================================

type LocationSpec = {
  era?: string;
  atmosphere?: string;
  lighting_default?: string;
  layout?: {
    type?: string;
    size_m?: string;
    doors?: Array<{ position: string; type?: string }>;
    windows?: Array<{ position: string; size?: string }>;
    furniture?: Array<{ type: string; position: string; color?: string }>;
  };
};

type LocationInput = {
  id: string;
  name: string;
  location_type?: string;
  spec?: LocationSpec;
  continuity_anchors?: string[];
};

// ===== character 用入力 =====

type CharacterHairSpec = { style?: string; color?: string; specific?: string };
type CharacterEyesSpec = { shape?: string; color?: string; expression_default?: string };
type CharacterFaceSpec = { jaw?: string; skin_tone?: string; marks?: string[] };
type CharacterOutfitSpec = {
  outerwear?: string;
  top?: string;
  bottom?: string;
  shoes?: string;
  accessories?: string[];
};

type CharacterSpecLite = {
  age_visual?: string;
  gender?: string;
  build?: string;
  height_cm?: number;
  hair?: CharacterHairSpec;
  eyes?: CharacterEyesSpec;
  face?: CharacterFaceSpec;
  outfit_default?: CharacterOutfitSpec;
  personality_visual?: string;
  voice_tag?: string;
};

export type CharacterInput = {
  id: string;
  name: string;
  role?: string;
  age_visual?: string;
  spec?: CharacterSpecLite;
  continuity_anchors?: string[];
  appearance_notes?: string;
};

// ===== prop 用入力 =====

type PropSpecLite = {
  kind?: string;
  color?: string;
  material?: string;
  distinguishing_features?: string[];
};

export type PropInput = {
  id: string;
  name: string;
  owner_character_id?: string;
  spec?: PropSpecLite;
  continuity_anchors?: string[];
};

type VariantInput = {
  variant: string;
  abs_path: string;
};

function specSummary(spec?: LocationSpec): string {
  if (!spec) return "(spec なし)";
  const lines: string[] = [];
  if (spec.era) lines.push(`era: ${spec.era}`);
  if (spec.atmosphere) lines.push(`atmosphere: ${spec.atmosphere}`);
  if (spec.lighting_default) lines.push(`lighting_default: ${spec.lighting_default}`);
  const l = spec.layout;
  if (l) {
    if (l.type) lines.push(`layout.type: ${l.type}`);
    if (l.size_m) lines.push(`layout.size: ${l.size_m}`);
    for (const d of l.doors ?? []) {
      lines.push(`  door: ${d.position}${d.type ? ` (${d.type})` : ""}`);
    }
    for (const w of l.windows ?? []) {
      lines.push(`  window: ${w.position}${w.size ? ` (${w.size})` : ""}`);
    }
    for (const f of (l.furniture ?? []).slice(0, 8)) {
      lines.push(`  furniture: ${f.type} @ ${f.position}${f.color ? ` (${f.color})` : ""}`);
    }
  }
  return lines.join("\n");
}

/**
 * 屋内/屋外で variant の期待値が異なるため、location 情報を渡して dispatch する。
 * 生成側 (v2-images.ts buildLocationRefPrompt) と同じ判定ロジックを使う。
 */
function isOutdoorLocation(l: LocationInput): boolean {
  const layoutType = String(l.spec?.layout?.type ?? "").toLowerCase();
  const locationType = String(l.location_type ?? "").toLowerCase();
  return layoutType === "open" || layoutType === "outdoor" || locationType === "outdoor";
}

function variantCameraDoc(variant: string, l: LocationInput): string {
  const outdoor = isOutdoorLocation(l);
  if (outdoor) {
    switch (variant) {
      case "wide_establishing":
        return "wide_establishing (この location は屋外): EXTERIOR の引き。空間全体・周辺街路/ランドスケープが見えるべき。屋内描写は不適切。";
      case "interior_eye_level":
        return "interior_eye_level (この location は屋外、variant 名は schema 互換のため流用): EXTERIOR の街路レベル人物視点。歩行者目線から外観/路面を捉えるべき。屋内描写は不適切。";
      case "interior_high_angle":
        return "interior_high_angle (この location は屋外、variant 名は schema 互換のため流用): EXTERIOR の俯瞰/上空からの bird's-eye。屋外スカイライン or 上層階からの見下ろし。屋内描写は不適切。";
      case "exterior_night":
        return "exterior_night: 夜の外観 establishing。建物外観 + 近隣街路の夜景。";
      default:
        return `${variant}: (variant 説明が定義されていません)`;
    }
  }
  switch (variant) {
    case "wide_establishing":
      return "wide_establishing (この location は屋内): INTERIOR WIDE。視点は room 内のコーナーまたはドア付近、天井と奥壁が画角内に入り、家具/ドア/窓が一覧できる構図。屋外/外観 shot は variant_drift。";
    case "interior_eye_level":
      return "interior_eye_level (屋内): 立ち姿の人物視点 (~1.6m)、室内に踏み入った前景込み。屋外/窓越し は variant_drift。";
    case "interior_high_angle":
      return "interior_high_angle (屋内): 天井寄り 3/4 view、床平面と家具配置が読める俯瞰。建物外観を上空から見た aerial は variant_drift。";
    case "exterior_night":
      return "exterior_night: 夜の外観 establishing。建物外観 + 近隣街路の夜景。";
    default:
      return `${variant}: (variant 説明が定義されていません)`;
  }
}

function buildPrompt(args: {
  location: LocationInput;
  variants: VariantInput[];
}): string {
  const l = args.location;
  const variantBlocks = args.variants
    .map(
      (v) =>
        `- variant: ${v.variant}\n  image: ${v.abs_path}\n  カメラ仕様: ${variantCameraDoc(v.variant, l)}`
    )
    .join("\n");

  return `あなたは漫画の bible 用 location reference plate を監査する品質審査員です。なろう系コミカライズ (Young Ace / Comic Walker / カドコミ系、B6判 KDP+KU、白黒) の画風基準で評価してください。

# location

- id: ${l.id}
- name: ${l.name}
- location_type: ${l.location_type ?? "(unspecified)"}
- continuity_anchors: ${(l.continuity_anchors ?? []).join(", ") || "(なし)"}

## spec
${specSummary(l.spec)}

# 監査対象 variant (${args.variants.length} 枚)

${variantBlocks}

# 評価カテゴリ (issue.category は次のいずれか)

- photoreal_residue: 3D レンダ調 / airbrush / photo specular / ambient occlusion などの写実残留
- style_drift: 劇画 / Berserk / seinen-realism / 中世西洋ファンタジー / SF サイバーパンク等への画風逸脱 (なろう系コミカライズから外れている)
- cultural_mismatch: era / 文化整合違反 (例: modern_japan_2026 のはずが欧州風アパート、教会風ロビー、中世城等)
- iconography_mismatch: 場所種別の標準シンボル不一致 (例: 公社=役所/銀行ロビー、ダンジョン=なろう系の機能的ダンジョン、コンビニ=日本の什器配置)
- continuity_anchor_missed: spec.continuity_anchors の項目が画像で守られていない/別物に置換されている (anchor_id を併記)
- variant_drift: variant 命名と中身の不一致 (例: high_angle が eye_level と同一画像、屋外 location で interior_* 命名が機能不全、establishing が「外観」と誤解釈されダンジョン内部にならない)
- cross_variant_inconsistency: 同 location 内で 2 枚以上が「別の部屋」に見える (家具方位の回転、空間スケール不一致、別 location に化ける)
- text_artifact: 文字 / ロゴ / 英字ラベル / ルーン記号 / 数値 UI の混入。または「文字を描かない代わりに空白看板/空白枠を量産」も該当
- density: 紙面の白率不足 (中間トーン/ハッチで全面が埋まる)
- physics_break: パース崩れ / 家具配置矛盾 / 人物混入 (全 location 「無人」指定が前提)

# severity 基準

- ok: 一般的な目で見て問題なし (issues 配列は空でよい)
- minor: 細部だが気になる (採用可だが次回 prompt で改善したい)
- major: アイコン / era / anchor 違反など漫画として使う前に直したい
- critical: 写実残留が強い / genre 完全違反 / 別 location に化ける / variant 重複 / 英字テキスト混入等、再生成必須

# 出力 (この schema 厳守、JSON のみ)

\`\`\`
{
  "location_id": "${l.id}",
  "variants": [
    {
      "variant": "<variant 名>",
      "severity": "ok|minor|major|critical",
      "issues": [{ "category": "<上記10カテゴリのいずれか>", "anchor_id": "<該当時のみ>", "description": "<1-2文の具体的な問題点>" }],
      "strengths": "<良かった点 1-2 行>",
      "suggested_fix": "<修正提案 (prompt 修正方針 or 再生成 or 採用見送り)>"
    }
  ],
  "cross_variant_notes": "<同 location 内で variant 間に整合問題があれば 1-3 行。なければ空文字>"
}
\`\`\`

JSON のみ返答。前置き・コードブロック・コメントは不要です。

各画像を Read ツールで実際に開いて評価してください。読み飛ばしや推測は禁止。`;
}

// ===== character 用 prompt =====

function characterSpecSummary(c: CharacterInput): string {
  const lines: string[] = [];
  if (c.age_visual) lines.push(`age_visual: ${c.age_visual}`);
  const s = c.spec;
  if (s) {
    if (s.gender) lines.push(`gender: ${s.gender}`);
    if (s.build) lines.push(`build: ${s.build}`);
    if (s.height_cm) lines.push(`height_cm: ${s.height_cm}`);
    if (s.hair) {
      const h = s.hair;
      lines.push(`hair: style=${h.style ?? "?"} color=${h.color ?? "?"}`);
      if (h.specific) lines.push(`  hair.specific: ${h.specific}`);
    }
    if (s.eyes) {
      const e = s.eyes;
      lines.push(`eyes: shape=${e.shape ?? "?"} color=${e.color ?? "?"} expr_default=${e.expression_default ?? "?"}`);
    }
    if (s.face) {
      const f = s.face;
      const parts: string[] = [];
      if (f.jaw) parts.push(`jaw=${f.jaw}`);
      if (f.skin_tone) parts.push(`skin=${f.skin_tone}`);
      if (f.marks && f.marks.length) parts.push(`marks=${f.marks.join("|")}`);
      if (parts.length) lines.push(`face: ${parts.join(" ")}`);
    }
    if (s.outfit_default) {
      const o = s.outfit_default;
      const parts: string[] = [];
      if (o.outerwear) parts.push(`outer=${o.outerwear}`);
      if (o.top) parts.push(`top=${o.top}`);
      if (o.bottom) parts.push(`bottom=${o.bottom}`);
      if (o.shoes) parts.push(`shoes=${o.shoes}`);
      if (o.accessories && o.accessories.length) parts.push(`acc=${o.accessories.join("|")}`);
      if (parts.length) lines.push(`outfit_default: ${parts.join(" ")}`);
    }
    if (s.personality_visual) lines.push(`personality_visual: ${s.personality_visual}`);
  }
  return lines.length ? lines.join("\n") : "(spec なし)";
}

function characterVariantDoc(variant: string): string {
  if (variant.startsWith("face_front")) return "face_front: 顔正面アップ。前髪/瞳/輪郭/marks の整合確認。";
  if (variant.startsWith("face_three_quarter")) return "face_three_quarter: 顔 3/4 (斜め)。輪郭の立体感、髪の流れ。";
  if (variant.startsWith("face_side")) return "face_side: 顔真横。横顔シルエット、後頭部、襟足。";
  if (variant.startsWith("full_front")) return "full_front: 全身正面。outfit_default 全体、ポーズはニュートラル。";
  if (variant.startsWith("full_three_quarter")) return "full_three_quarter: 全身 3/4。立ち姿の輪郭シルエット。";
  if (variant.startsWith("full_back")) return "full_back: 全身後ろ姿。襟足/髪型後ろ/outfit 背面。";
  if (variant.startsWith("expr_default")) return "expr_default: デフォルト表情 (eyes.expression_default)。";
  if (variant.startsWith("expr_smile")) return "expr_smile: 微笑/控えめな笑顔。";
  if (variant.startsWith("expr_grin")) return "expr_grin: 歯を見せた笑顔。";
  if (variant.startsWith("expr_laugh")) return "expr_laugh: 大笑い/破顔。";
  if (variant.startsWith("expr_focus")) return "expr_focus: 集中/読み取りの真剣表情。";
  if (variant.startsWith("expr_surprise")) return "expr_surprise: 驚き/目を見開く。";
  if (variant.startsWith("expr_anger")) return "expr_anger: 怒り/苛立ち。";
  if (variant.startsWith("expr_gentle")) return "expr_gentle: 柔らかい/優しい表情。";
  if (variant.startsWith("expr_relaxed")) return "expr_relaxed: リラックス/普段着の素の表情。";
  if (variant.startsWith("eye_closeup")) return "eye_closeup: 瞳のクローズアップ。形・色・ハイライト・continuity anchor (例: 右目隠し前髪) 確認。";
  if (variant.startsWith("hair_detail")) return "hair_detail: 髪のディテール (毛束・艶線・襟足の跳ね等)。";
  return `${variant}: (variant 説明定義なし、spec から類推して評価)`;
}

function buildCharacterPrompt(args: {
  character: CharacterInput;
  variants: VariantInput[];
}): string {
  const c = args.character;
  const variantBlocks = args.variants
    .map(
      (v) =>
        `- variant: ${v.variant}\n  image: ${v.abs_path}\n  カメラ仕様: ${characterVariantDoc(v.variant)}`
    )
    .join("\n");

  return `あなたは漫画 bible 用 character reference plate を監査する品質審査員です。なろう系コミカライズ (Young Ace / Comic Walker / カドコミ系、B6判 KDP+KU、白黒) の画風基準で評価してください。

# character

- id: ${c.id}
- name: ${c.name}
- role: ${c.role ?? "(unspecified)"}
- continuity_anchors: ${(c.continuity_anchors ?? []).join(", ") || "(なし)"}

## spec
${characterSpecSummary(c)}
${c.appearance_notes ? `\n## appearance_notes\n${c.appearance_notes}\n` : ""}
# 監査対象 variant (${args.variants.length} 枚)

${variantBlocks}

# 評価カテゴリ (issue.category は次のいずれか)

- photoreal_residue: 3D レンダ調 / airbrush / photo specular / ambient occlusion 等の写実残留
- style_drift: 劇画 / Berserk / seinen-realism / アメコミ / SF 調へ画風逸脱 (なろう系コミカライズから外れている)
- cultural_mismatch: era / 文化整合違反 (例: modern_japan のはずが中世西洋風衣装、和装混入等)
- iconography_mismatch: 役柄に対する標準アイコノグラフィ不一致 (例: protagonist が悪役顔、role と outfit の不整合)
- continuity_anchor_missed: spec.continuity_anchors の項目が画像で守られていない/別物に置換されている (anchor_id を併記、例: 「右目を隠す前髪」が見えていない)
- variant_drift: variant 命名と中身の不一致 (例: face_side が face_three_quarter と同一構図、full_back が前向きに見える、expr_smile が真顔)
- cross_variant_inconsistency: 同 character 内で variant 間にキャラ違いが発生 (髪型/髪色/輪郭/瞳/服装の不一致、別人化)
- text_artifact: 文字 / ロゴ / 英字ラベル / 数値 UI / ルーン記号などの混入
- density: 紙面の白率不足 (中間トーン/ハッチで全面が埋まる) や逆に線が薄すぎる場合
- physics_break: 解剖学的破綻 / 関節崩れ / 余分な指 / 顔パーツ位置矛盾

# severity 基準

- ok: 一般的な目で見て問題なし (issues 配列は空でよい)
- minor: 細部だが気になる (採用可だが次回 prompt で改善したい)
- major: anchor 違反 / 衣装パーツ取り違え / 表情と variant 名の食い違い等、漫画として使う前に直したい
- critical: 写実残留が強い / genre 完全違反 / 別人化 / 解剖学的破綻、再生成必須

# 出力 (この schema 厳守、JSON のみ)

\`\`\`
{
  "entity_id": "${c.id}",
  "variants": [
    {
      "variant": "<variant 名>",
      "severity": "ok|minor|major|critical",
      "issues": [{ "category": "<上記10カテゴリのいずれか>", "anchor_id": "<該当時のみ>", "description": "<1-2文の具体的な問題点>" }],
      "strengths": "<良かった点 1-2 行>",
      "suggested_fix": "<修正提案 (prompt 修正方針 or 再生成 or 採用見送り)>"
    }
  ],
  "cross_variant_notes": "<同 character 内で variant 間に整合問題があれば 1-3 行。なければ空文字>"
}
\`\`\`

JSON のみ返答。前置き・コードブロック・コメントは不要です。

各画像を Read ツールで実際に開いて評価してください。読み飛ばしや推測は禁止。`;
}

// ===== prop 用 prompt =====

function propSpecSummary(p: PropInput): string {
  const lines: string[] = [];
  const s = p.spec;
  if (s) {
    if (s.kind) lines.push(`kind: ${s.kind}`);
    if (s.color) lines.push(`color: ${s.color}`);
    if (s.material) lines.push(`material: ${s.material}`);
    if (s.distinguishing_features && s.distinguishing_features.length) {
      lines.push(`distinguishing_features: ${s.distinguishing_features.join(", ")}`);
    }
  }
  if (p.owner_character_id) lines.push(`owner_character_id: ${p.owner_character_id}`);
  return lines.length ? lines.join("\n") : "(spec なし)";
}

function propVariantDoc(variant: string): string {
  if (variant === "default") return "default: 単独描写の基本ショット。形状/色/材質/特徴が読み取れるべき。";
  if (variant === "held") return "held: キャラクターが手に持つ/装着する状態。スケール/握り方/角度の整合。";
  return `${variant}: (variant 説明定義なし、spec から類推して評価)`;
}

function buildPropPrompt(args: {
  prop: PropInput;
  variants: VariantInput[];
}): string {
  const p = args.prop;
  const variantBlocks = args.variants
    .map(
      (v) =>
        `- variant: ${v.variant}\n  image: ${v.abs_path}\n  カメラ仕様: ${propVariantDoc(v.variant)}`
    )
    .join("\n");

  return `あなたは漫画 bible 用 prop reference plate を監査する品質審査員です。なろう系コミカライズ (Young Ace / Comic Walker / カドコミ系、B6判 KDP+KU、白黒) の画風基準で評価してください。

# prop

- id: ${p.id}
- name: ${p.name}
- continuity_anchors: ${(p.continuity_anchors ?? []).join(", ") || "(なし)"}

## spec
${propSpecSummary(p)}

# 監査対象 variant (${args.variants.length} 枚)

${variantBlocks}

# 評価カテゴリ (issue.category は次のいずれか)

- photoreal_residue: 3D レンダ調 / 写真合成風の残留
- style_drift: 漫画らしさから逸脱 (リアル写実、アメコミ、SF UI 等)
- cultural_mismatch: era / 文化整合違反 (例: 現代スマホのはずが中世魔導具)
- iconography_mismatch: prop の kind と外観不一致 (例: phone と書いてあるのに無線機に見える)
- continuity_anchor_missed: continuity_anchors / distinguishing_features が画像で守られていない (例: 上右ヒビが描かれない)
- variant_drift: variant 名と内容不一致 (例: held のはずが単体置きに見える)
- cross_variant_inconsistency: 複数 variant 間で別の物体に見える (色/形/サイズの不一致)
- text_artifact: 文字 / ロゴ / 英字ラベル / 数値 UI のうち、spec 規定外のものが混入
- density: 紙面の白率不足
- physics_break: パース破綻 / スケール矛盾 / 持ち手と物体の関係矛盾

# severity 基準

- ok: 問題なし
- minor: 細部だが改善余地
- major: anchor 違反 / kind と外観の不一致など
- critical: 写実残留 / 別物体に化ける / 商標ロゴ混入 / 文字混入で再生成必須

# 出力 (この schema 厳守、JSON のみ)

\`\`\`
{
  "entity_id": "${p.id}",
  "variants": [
    {
      "variant": "<variant 名>",
      "severity": "ok|minor|major|critical",
      "issues": [{ "category": "<上記10カテゴリのいずれか>", "anchor_id": "<該当時のみ>", "description": "<1-2文の具体的な問題点>" }],
      "strengths": "<良かった点 1-2 行>",
      "suggested_fix": "<修正提案>"
    }
  ],
  "cross_variant_notes": "<variant 間整合問題 1-3 行。なければ空文字>"
}
\`\`\`

JSON のみ返答。前置き・コードブロック・コメントは不要です。

各画像を Read ツールで実際に開いて評価してください。`;
}

// ============================================================
// claude CLI spawn
// ============================================================

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const DEFAULT_MODEL = process.env.AINARO_AUDIT_MODEL || "haiku";

async function spawnClaudeAudit(args: {
  prompt: string;
  abs_paths: string[]; // claude が Read できるよう --add-dir に渡す
  model: string;
  timeoutMs: number;
}): Promise<{ raw: string; exitCode: number; stderr: string }> {
  const dirs = Array.from(new Set(args.abs_paths.map((p) => path.dirname(p))));
  // 注: --bare は ANTHROPIC_API_KEY 必須となり OAuth/Pro plan が使えないため使わない。
  // また `--allowedTools` `--add-dir` は variadic (<tools...>) なので space 区切りで
  // 引数を渡すと prompt まで吸い込まれる。`=` 形式で渡し、prompt は -- の後に置く。
  const argv = [
    "--print",
    "--output-format=json",
    `--model=${args.model}`,
    "--allowedTools=Read",
    "--permission-mode=bypassPermissions",
    "--disable-slash-commands",
  ];
  for (const d of dirs) {
    argv.push(`--add-dir=${d}`);
  }
  argv.push("--", args.prompt);

  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, argv, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, args.timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ raw: stdout, exitCode: code ?? 1, stderr });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ raw: "", exitCode: 1, stderr: stderr + `\n[spawn-error] ${e.message}` });
    });
  });
}

function extractInnerJson(claudeJson: string): unknown {
  // claude --output-format json は { type, result, ... } を返し、result が model 出力
  const top = JSON.parse(claudeJson) as { result?: string; is_error?: boolean };
  if (top.is_error || typeof top.result !== "string") {
    throw new Error(`claude returned error or no result: ${claudeJson.slice(0, 500)}`);
  }
  // result から JSON を抽出 (コードブロック or 素 JSON)
  let body = top.result.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) body = fence[1].trim();
  return JSON.parse(body);
}

type VariantParseShape = {
  variants: Array<{
    variant: string;
    severity: Severity;
    issues: AuditIssue[];
    strengths: string;
    suggested_fix: string;
  }>;
  cross_variant_notes: string;
};

// ============================================================
// 1 location 監査
// ============================================================

export async function auditLocation(args: {
  refsRoot: string; // bible/refs (絶対パス)
  location: LocationInput;
  variantFiles: VariantInput[]; // abs_path 列挙済み
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<LocationAuditResult> {
  const model = args.model ?? DEFAULT_MODEL;
  const timeoutMs = args.timeoutMs ?? 5 * 60 * 1000;
  const maxRetries = args.maxRetries ?? 2;
  const prompt = buildPrompt({ location: args.location, variants: args.variantFiles });

  let lastErr: string | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await spawnClaudeAudit({
      prompt,
      abs_paths: args.variantFiles.map((v) => v.abs_path),
      model,
      timeoutMs,
    });
    if (r.exitCode !== 0) {
      lastErr = `claude exit ${r.exitCode}: ${r.stderr.slice(0, 400)}`;
      continue;
    }
    try {
      const parsed = extractInnerJson(r.raw) as {
        location_id: string;
        variants: Array<{
          variant: string;
          severity: Severity;
          issues: AuditIssue[];
          strengths: string;
          suggested_fix: string;
        }>;
        cross_variant_notes: string;
      };
      const byName = new Map(args.variantFiles.map((v) => [v.variant, v]));
      return {
        location_id: args.location.id,
        location_name: args.location.name,
        audited_at: new Date().toISOString(),
        variants: parsed.variants.map((v) => {
          const inp = byName.get(v.variant);
          const relpath = inp ? path.relative(args.refsRoot, inp.abs_path) : v.variant;
          return {
            variant: v.variant,
            image_relpath: relpath,
            severity: v.severity,
            issues: v.issues ?? [],
            strengths: v.strengths ?? "",
            suggested_fix: v.suggested_fix ?? "",
          };
        }),
        cross_variant_notes: parsed.cross_variant_notes ?? "",
      };
    } catch (e) {
      lastErr = `parse failed: ${(e as Error).message}; raw_prefix=${r.raw.slice(0, 300)}`;
    }
  }

  return {
    location_id: args.location.id,
    location_name: args.location.name,
    audited_at: new Date().toISOString(),
    variants: args.variantFiles.map((v) => ({
      variant: v.variant,
      image_relpath: path.relative(args.refsRoot, v.abs_path),
      severity: "ok" as Severity,
      issues: [],
      strengths: "",
      suggested_fix: "(audit failed)",
    })),
    cross_variant_notes: "",
    error: lastErr ?? "unknown error",
  };
}

// ============================================================
// 1 character 監査
// ============================================================

/** character variant をグループ分け (5 画像/グループ程度) して claude 呼び出し負荷を抑える */
const CHARACTER_VARIANT_GROUPS: Array<{ name: string; matcher: (v: string) => boolean }> = [
  { name: "face_angles", matcher: (v) => v.startsWith("face_") },
  { name: "full_body", matcher: (v) => v.startsWith("full_") },
  { name: "expressions", matcher: (v) => v.startsWith("expr_") },
  { name: "details", matcher: (v) => v.startsWith("eye_") || v.startsWith("hair_") },
];

function groupCharacterVariants(variantFiles: VariantInput[]): Array<{
  name: string;
  variants: VariantInput[];
}> {
  const groups: Array<{ name: string; variants: VariantInput[] }> = CHARACTER_VARIANT_GROUPS.map((g) => ({
    name: g.name,
    variants: [],
  }));
  const other: VariantInput[] = [];
  for (const v of variantFiles) {
    let placed = false;
    for (let i = 0; i < CHARACTER_VARIANT_GROUPS.length; i++) {
      if (CHARACTER_VARIANT_GROUPS[i].matcher(v.variant)) {
        groups[i].variants.push(v);
        placed = true;
        break;
      }
    }
    if (!placed) other.push(v);
  }
  if (other.length > 0) groups.push({ name: "other", variants: other });
  return groups.filter((g) => g.variants.length > 0);
}

async function runCharacterGroupAudit(args: {
  refsRoot: string;
  character: CharacterInput;
  variantFiles: VariantInput[];
  model: string;
  timeoutMs: number;
  maxRetries: number;
}): Promise<{ variants: VariantAuditResult[]; cross_variant_notes: string; error?: string }> {
  const prompt = buildCharacterPrompt({ character: args.character, variants: args.variantFiles });
  let lastErr: string | undefined;
  for (let attempt = 0; attempt <= args.maxRetries; attempt++) {
    const r = await spawnClaudeAudit({
      prompt,
      abs_paths: args.variantFiles.map((v) => v.abs_path),
      model: args.model,
      timeoutMs: args.timeoutMs,
    });
    if (r.exitCode !== 0) {
      lastErr = `claude exit ${r.exitCode}: ${r.stderr.slice(0, 400)}`;
      continue;
    }
    try {
      const parsed = extractInnerJson(r.raw) as VariantParseShape;
      const byName = new Map(args.variantFiles.map((v) => [v.variant, v]));
      return {
        variants: (parsed.variants ?? []).map((v) => {
          const inp = byName.get(v.variant);
          const relpath = inp ? path.relative(args.refsRoot, inp.abs_path) : v.variant;
          return {
            variant: v.variant,
            image_relpath: relpath,
            severity: v.severity,
            issues: v.issues ?? [],
            strengths: v.strengths ?? "",
            suggested_fix: v.suggested_fix ?? "",
          };
        }),
        cross_variant_notes: parsed.cross_variant_notes ?? "",
      };
    } catch (e) {
      lastErr = `parse failed: ${(e as Error).message}; raw_prefix=${r.raw.slice(0, 300)}`;
    }
  }
  return {
    variants: args.variantFiles.map((v) => ({
      variant: v.variant,
      image_relpath: path.relative(args.refsRoot, v.abs_path),
      severity: "ok" as Severity,
      issues: [],
      strengths: "",
      suggested_fix: "(audit failed)",
    })),
    cross_variant_notes: "",
    error: lastErr ?? "unknown error",
  };
}

export async function auditCharacter(args: {
  refsRoot: string;
  character: CharacterInput;
  variantFiles: VariantInput[];
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** グループ並列実行数。default 2 (claude 呼び出し負荷を抑える) */
  groupConcurrency?: number;
}): Promise<CharacterAuditResult> {
  const model = args.model ?? DEFAULT_MODEL;
  const timeoutMs = args.timeoutMs ?? 5 * 60 * 1000;
  const maxRetries = args.maxRetries ?? 2;
  const groupConcurrency = Math.max(1, args.groupConcurrency ?? 2);

  const groups = groupCharacterVariants(args.variantFiles);
  if (groups.length === 0) {
    return {
      character_id: args.character.id,
      character_name: args.character.name,
      audited_at: new Date().toISOString(),
      variants: [],
      cross_variant_notes: "",
      error: "no variants",
    };
  }

  // group 並列
  const results: Array<{ variants: VariantAuditResult[]; cross_variant_notes: string; error?: string }> = new Array(groups.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(groupConcurrency, groups.length) }, async () => {
    while (true) {
      const my = cursor++;
      if (my >= groups.length) return;
      results[my] = await runCharacterGroupAudit({
        refsRoot: args.refsRoot,
        character: args.character,
        variantFiles: groups[my].variants,
        model,
        timeoutMs,
        maxRetries,
      });
    }
  });
  await Promise.all(runners);

  const allVariants: VariantAuditResult[] = [];
  const notes: string[] = [];
  const errs: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const g = groups[i];
    const r = results[i];
    allVariants.push(...r.variants);
    if (r.cross_variant_notes) notes.push(`[${g.name}] ${r.cross_variant_notes}`);
    if (r.error) errs.push(`[${g.name}] ${r.error}`);
  }

  return {
    character_id: args.character.id,
    character_name: args.character.name,
    audited_at: new Date().toISOString(),
    variants: allVariants,
    cross_variant_notes: notes.join(" / "),
    error: errs.length > 0 ? errs.join(" / ") : undefined,
  };
}

// ============================================================
// 1 prop 監査
// ============================================================

export async function auditProp(args: {
  refsRoot: string;
  prop: PropInput;
  variantFiles: VariantInput[];
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<PropAuditResult> {
  const model = args.model ?? DEFAULT_MODEL;
  const timeoutMs = args.timeoutMs ?? 5 * 60 * 1000;
  const maxRetries = args.maxRetries ?? 2;
  const prompt = buildPropPrompt({ prop: args.prop, variants: args.variantFiles });

  let lastErr: string | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await spawnClaudeAudit({
      prompt,
      abs_paths: args.variantFiles.map((v) => v.abs_path),
      model,
      timeoutMs,
    });
    if (r.exitCode !== 0) {
      lastErr = `claude exit ${r.exitCode}: ${r.stderr.slice(0, 400)}`;
      continue;
    }
    try {
      const parsed = extractInnerJson(r.raw) as VariantParseShape;
      const byName = new Map(args.variantFiles.map((v) => [v.variant, v]));
      return {
        prop_id: args.prop.id,
        prop_name: args.prop.name,
        audited_at: new Date().toISOString(),
        variants: (parsed.variants ?? []).map((v) => {
          const inp = byName.get(v.variant);
          const relpath = inp ? path.relative(args.refsRoot, inp.abs_path) : v.variant;
          return {
            variant: v.variant,
            image_relpath: relpath,
            severity: v.severity,
            issues: v.issues ?? [],
            strengths: v.strengths ?? "",
            suggested_fix: v.suggested_fix ?? "",
          };
        }),
        cross_variant_notes: parsed.cross_variant_notes ?? "",
      };
    } catch (e) {
      lastErr = `parse failed: ${(e as Error).message}; raw_prefix=${r.raw.slice(0, 300)}`;
    }
  }

  return {
    prop_id: args.prop.id,
    prop_name: args.prop.name,
    audited_at: new Date().toISOString(),
    variants: args.variantFiles.map((v) => ({
      variant: v.variant,
      image_relpath: path.relative(args.refsRoot, v.abs_path),
      severity: "ok" as Severity,
      issues: [],
      strengths: "",
      suggested_fix: "(audit failed)",
    })),
    cross_variant_notes: "",
    error: lastErr ?? "unknown error",
  };
}

// ============================================================
// レポート集約
// ============================================================

/**
 * 既存シグネチャ (kind 省略 or "locations") = location 用 BibleImagesAuditReport を返す。
 * kind = "characters" / "props" の場合は対応する report 型を返す。
 *
 * results の要素型は kind に応じて呼び分けること。
 */
export function aggregateReport(args: {
  slug: string;
  results: LocationAuditResult[];
  model: string;
  kind?: "locations";
}): BibleImagesAuditReport;
export function aggregateReport(args: {
  slug: string;
  results: CharacterAuditResult[];
  model: string;
  kind: "characters";
}): BibleCharactersAuditReport;
export function aggregateReport(args: {
  slug: string;
  results: PropAuditResult[];
  model: string;
  kind: "props";
}): BiblePropsAuditReport;
export function aggregateReport(args: {
  slug: string;
  results: EntityAuditResult[];
  model: string;
  kind?: AuditKind;
}): AnyBibleImagesAuditReport {
  const kind = args.kind ?? "locations";
  const by_severity: Record<Severity, number> = { ok: 0, minor: 0, major: 0, critical: 0 };
  let totalImages = 0;
  type GenericRegen = {
    entity_id: string;
    variant: string;
    severity: Severity;
    reason: string;
  };
  const regens: GenericRegen[] = [];

  for (const ent of args.results) {
    const entityId =
      "location_id" in ent
        ? ent.location_id
        : "character_id" in ent
        ? ent.character_id
        : ent.prop_id;
    for (const v of ent.variants) {
      totalImages++;
      by_severity[v.severity] = (by_severity[v.severity] ?? 0) + 1;
      if (v.severity === "critical" || v.severity === "major") {
        regens.push({
          entity_id: entityId,
          variant: v.variant,
          severity: v.severity,
          reason: v.issues[0]?.description ?? v.suggested_fix,
        });
      }
    }
  }
  // critical 優先 → major
  regens.sort((a, b) => {
    const order: Record<Severity, number> = { critical: 0, major: 1, minor: 2, ok: 3 };
    return order[a.severity] - order[b.severity];
  });

  const audited_at = new Date().toISOString();
  const common = {
    schema_version: 1 as const,
    slug: args.slug,
    audited_at,
    audited_by: "L02b-bible-images-audit" as const,
    model: args.model,
  };

  if (kind === "locations") {
    return {
      ...common,
      locations: args.results as LocationAuditResult[],
      summary: {
        total_locations: args.results.length,
        total_images: totalImages,
        by_severity,
        regen_priority: regens.map((r) => ({
          location_id: r.entity_id,
          variant: r.variant,
          severity: r.severity,
          reason: r.reason,
        })),
      },
    };
  }

  if (kind === "characters") {
    return {
      ...common,
      characters: args.results as CharacterAuditResult[],
      summary: {
        total_characters: args.results.length,
        total_images: totalImages,
        by_severity,
        regen_priority: regens.map((r) => ({
          character_id: r.entity_id,
          variant: r.variant,
          severity: r.severity,
          reason: r.reason,
        })),
      },
    };
  }

  // props
  return {
    ...common,
    props: args.results as PropAuditResult[],
    summary: {
      total_props: args.results.length,
      total_images: totalImages,
      by_severity,
      regen_priority: regens.map((r) => ({
        prop_id: r.entity_id,
        variant: r.variant,
        severity: r.severity,
        reason: r.reason,
      })),
    },
  };
}

/**
 * kind 別の audit report 出力 path。kind 省略時は locations (互換維持)。
 */
export function bibleAuditReportPath(slug: string, refsDir: string, kind: AuditKind = "locations"): string {
  return path.join(refsDir, "_qa", `${kind}.audit.json`);
}

/**
 * kind 別 report の write。kind は report 形に応じて自動判定するが、明示も可能。
 */
export async function writeAuditReport(args: {
  slug: string;
  refsDir: string;
  report: AnyBibleImagesAuditReport;
  kind?: AuditKind;
}): Promise<string> {
  const kind = args.kind ?? detectReportKind(args.report);
  const out = bibleAuditReportPath(args.slug, args.refsDir, kind);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(args.report, null, 2), "utf-8");
  return out;
}

function detectReportKind(report: AnyBibleImagesAuditReport): AuditKind {
  if ("locations" in report) return "locations";
  if ("characters" in report) return "characters";
  return "props";
}

/**
 * kind 別 report の read。kind 省略時は locations (互換維持)。
 *
 * 既存呼び出し `readAuditReport({ slug, refsDir })` は引き続き
 * BibleImagesAuditReport (locations 用) を返す。
 */
export function readAuditReport(args: {
  slug: string;
  refsDir: string;
  kind?: "locations";
}): Promise<BibleImagesAuditReport | null>;
export function readAuditReport(args: {
  slug: string;
  refsDir: string;
  kind: "characters";
}): Promise<BibleCharactersAuditReport | null>;
export function readAuditReport(args: {
  slug: string;
  refsDir: string;
  kind: "props";
}): Promise<BiblePropsAuditReport | null>;
export async function readAuditReport(args: {
  slug: string;
  refsDir: string;
  kind?: AuditKind;
}): Promise<AnyBibleImagesAuditReport | null> {
  const kind = args.kind ?? "locations";
  const p = bibleAuditReportPath(args.slug, args.refsDir, kind);
  try {
    const txt = await fs.readFile(p, "utf-8");
    return JSON.parse(txt) as AnyBibleImagesAuditReport;
  } catch {
    return null;
  }
}
