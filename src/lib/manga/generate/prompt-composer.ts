/**
 * パネル用 gpt-image-1.5 プロンプト組み立て (Phase 1 redesign 2026-04-30)
 *
 * 旧版の問題（実機 ep1 確認で判明）:
 *   - キャラ参照画像未注入で同一人物に見えない
 *   - 「Korean-style webtoon illustration」のような抽象スタイル指示で AI 量産物の見た目に
 *   - 連続コマで前後の文脈・visual storytelling 指示が無く、コマが独立絵に
 *
 * 新版の柱:
 *   1. ネーム層フィールド (purpose / change_from_prev / link_to_next / visual_focus / cut_type) を必ず込める
 *   2. キャラ参照画像 + スタイルシート + 直前パネル を reference として参照させる（呼び出し側が path 列挙）
 *   3. AI 量産物っぽい絵柄を否定する specific 指示（airbrushed, glossy, perfect symmetry など）
 *   4. 1 コマ最大 2 キャラ制約は維持（shot-planner 側でも保証）
 *
 * このモジュールは LLM を呼ばない（決定的）。
 */

import type { MangaImageSize } from "./codex-image";
import { MANGA_SIZE_PRESETS } from "./codex-image";
import type {
  PanelAspect,
  PanelCamera,
  PanelRole,
  CharacterBibleRow,
  LocationBibleRow,
  CostumeStateRow,
  ArtStyle,
  NarrativeFunction,
} from "../types";
import type { ShotlistPanelEntry } from "../schemas";

export type ComposedPanelPrompt = {
  prompt: string;
  size: MangaImageSize;
  /** 参照画像として渡すローカルパス（順序: スタイルシート → キャラ refs → 直前パネル） */
  referenceImagePaths: string[];
  debug: {
    aspect: PanelAspect;
    role: PanelRole;
    camera: PanelCamera | null;
    narrative_function: NarrativeFunction | null;
    character_count: number;
    multi_character_treatment: string | null;
    cut_type: string | null;
    refs: number;
  };
};

function selectSizeForAspect(aspect: PanelAspect): MangaImageSize {
  switch (aspect) {
    // 横読み (現行)
    case "page":
      return MANGA_SIZE_PRESETS.page_b5;
    case "spread":
      return MANGA_SIZE_PRESETS.spread;
    case "panel_landscape":
      return MANGA_SIZE_PRESETS.panel_landscape;
    case "panel_portrait":
      return MANGA_SIZE_PRESETS.panel_portrait;
    case "panel_square":
      return MANGA_SIZE_PRESETS.panel_square;
    case "panel_tall":
      return MANGA_SIZE_PRESETS.panel_tall;
    // 縦読み (旧、互換)
    case "vertical":
      return MANGA_SIZE_PRESETS.vertical_standard;
    case "big":
      return MANGA_SIZE_PRESETS.vertical_big;
    case "splash":
      return MANGA_SIZE_PRESETS.splash;
    case "square":
      return MANGA_SIZE_PRESETS.square;
    default:
      return MANGA_SIZE_PRESETS.page_b5;
  }
}

function styleDirective(artStyle: ArtStyle): string {
  switch (artStyle) {
    case "manga_bw_shounen":
      return [
        "Japanese shounen manga page in PURE BLACK-AND-WHITE only — NO color, NO grayscale gradient, NO airbrush, NO smooth shading.",
        "Bold confident black ink outlines with variable line weight; decisive solid blacks (beta) for hair shadow, clothing, and silhouette.",
        "Screentone (halftone dot pattern) for mid-tones and gradations — VISIBLE dot grid pattern, not smooth gradient. Use 60-line tone for skin, 27.5-line for sky/atmosphere.",
        "Speed lines, focus lines, impact lines, and motion blur for action and emphasis.",
        "Dynamic kinetic poses; exaggerated facial expressions (sweat-drops, vein-pops, eye-shine, gritted teeth, motion-blur eyes).",
        "Aesthetic of Weekly Shounen Jump / Shounen Magazine / Shounen Sunday — hand-drawn imperfection, brush-pen ink texture, no digital smoothing.",
      ].join(" ");
    case "manga_bw_seinen":
      return [
        "Japanese seinen manga page in PURE BLACK-AND-WHITE only — NO color, NO grayscale gradient, NO airbrush.",
        "Fine detailed line work with subtle line-weight variation; densely packed screentone for atmosphere, texture, and material rendering.",
        "Realistic anatomy and proportions; restrained naturalistic facial expressions and body language (no shounen-style sweatdrops or exaggeration).",
        "Heavy use of solid black (beta) for shadow and mood; dramatic chiaroscuro lighting via beta + screentone overlap.",
        "Aesthetic of Big Comic / Morning / Afternoon / Young Magazine — adult drama, mature sensibility, no shounen-style speed lines unless explicit action sequence.",
      ].join(" ");
    case "manga_bw_seinen_dark":
      return [
        "Japanese isekai-dungeon-exploration narou-kei light novel comicalization in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
        "Confident expressive ink work with character-first composition. Line weight varies — fine details for emotive faces, decisive strokes for action and creatures.",
        "Beta usage for environmental shadow, monster forms, and dramatic atmosphere — but characters stay readable and approachable, not gothic-grim.",
        "Light-novel-cover lineage: large emotive eyes, expressive heroines, readable protagonists. NOT Berserk/Vagabond gothic-realism.",
        "Screentone for stone texture, fog, magical effects, and skin highlights. Magic circles, status windows, and skill callouts are genre-iconic visual elements.",
        "Aesthetic of Young Ace / Comic Walker / カドコミ系 narou-kei comicalization (蜘蛛ですが / 転スラ (川上泰樹) / ヘルモード / 第七王子 lineage) — adventurous isekai with party dynamics, kinetic combat with character-driven hero poses.",
      ].join(" ");
    case "manga_bw_shoujo_classic":
      return [
        "Japanese classic-style shoujo manga page in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
        "Fine delicate line work with consistent thin lines; intricate decorative detail for hair flow, fabric folds, ornamental motifs (roses, ribbons, lace).",
        "Large expressive eyes with starburst highlights and detailed iris reflection. Slim elegant body proportions.",
        "Extensive screentone usage — gradient tones for clothing fabric, sky, and emotional atmosphere. Multiple tone densities layered for richness.",
        "Light beta usage — only for hair shadow and accent contrast. Page should feel light, airy, lyrical.",
        "Aesthetic of Rose of Versailles / Yona of the Dawn / classic Hakusensha shoujo — aristocratic settings, period costume, romantic drama with restrained psychological depth.",
      ].join(" ");
    case "manga_bw_seinen_urban":
      return [
        "Japanese contemporary modern-dungeon narou-kei light novel comicalization in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
        "Confident expressive line work with character-driven composition. Modern cityscapes drawn with clear silhouettes and genre iconography (buildings, dungeon-gate signage, contemporary fixtures).",
        "Light-novel-cover lineage: large emotive eyes, readable expressions at panel-size, fashionable contemporary outfits. NOT seinen-realism photorealism.",
        "Use of beta for night scenes, shadow on faces, and dramatic mood. Screentone gradients for sky, concrete texture, and dungeon interior — sparingly for skin highlights and blush.",
        "Action sequences fast and sharp — speed lines, motion blur, impact lines, dynamic composition with hero-pose keyframes.",
        "Aesthetic of Young Ace / Comic Walker / カドコミ系 narou-kei comicalization tradition (Dジェネシス / 壊れスキル / 凡人探索者 lineage) — modern Japan with dungeon intrusion, character-driven urban fantasy.",
      ].join(" ");
    case "webtoon":
      return [
        "Korean manhwa / vertical-scroll webtoon panel.",
        "Clean confident line art with variable line weight, decisive blacks for shadow, limited cel-shaded coloring with screentone-style hatching for ambient occlusion, restrained palette of 3-4 dominant hues plus 1 accent.",
        "Look like a published manhwa volume page — slightly aged ink feel, deliberate negative space, mobile-readable composition (key elements centered, no critical detail at extreme edges).",
      ].join(" ");
    case "shounen":
      return "Japanese shounen manga panel — bold black ink lines, screentone shading dots, hand-drawn imperfections, dynamic kinetic poses.";
    case "shoujo":
      return "Japanese shoujo manga panel — fine delicate line art, decorative motifs, screentone gradations, gentle pastel highlights.";
    case "realistic":
      return "Cinematic semi-realistic illustrated manga panel with restrained palette and grounded anatomy.";
    case "chibi":
      return "Chibi / super-deformed manga panel with exaggerated heads.";
    default:
      return "Japanese black-and-white manga page.";
  }
}

/** 白黒漫画用の追加禁則。styleDirective の補強。 */
function bwMangaNegatives(artStyle: ArtStyle): string {
  const isBwManga =
    artStyle === "manga_bw_shounen" ||
    artStyle === "manga_bw_seinen" ||
    artStyle === "manga_bw_seinen_dark" ||
    artStyle === "manga_bw_shoujo_classic" ||
    artStyle === "manga_bw_seinen_urban";
  if (!isBwManga) return "";
  return [
    "Do NOT use any color whatsoever — output must be pure black, pure white, and halftone dots only.",
    "Do NOT use smooth grayscale gradients, airbrush soft-shading, or photographic blur — only solid black, solid white, and visible screentone dot patterns.",
    "Do NOT render in webtoon / manhwa color style; this is monochrome Japanese manga.",
  ].join(" ");
}

function cameraDirective(camera: PanelCamera | null, aspect: PanelAspect): string {
  switch (camera) {
    case "face_close":
      return "Tight close-up on the character's face, focusing on the eyes and the emotion in them.";
    case "full_body":
      return "Full-body shot showing the character from head to toe.";
    case "over_shoulder":
      return "Over-the-shoulder framing — the listener's back/shoulder occupies one corner of the frame.";
    case "birds_eye":
      return "High-angle bird's-eye view looking down on the scene.";
    case "hands":
      return "Tight shot focused on the hands and what they are holding/touching.";
    case "wide":
      return aspect === "splash"
        ? "Splash-page wide shot showing the entire scene with strong silhouette and depth."
        : "Wide establishing shot showing characters and environment with depth.";
    case "side":
      return "Profile / side-view framing of the character.";
    default:
      return "Standard medium shot.";
  }
}

function roleDirective(role: PanelRole, aspect: PanelAspect): string {
  switch (role) {
    case "opening":
      return "Establishing opening panel for this scroll segment — set the mood firmly in one beat.";
    case "emotion":
      return "Emotional beat panel — silence and stillness, the inner state should read at a glance.";
    case "information":
      return "Informational panel — clarity and readability prioritized over drama, no excess decoration.";
    case "action":
      return "Action panel — kinetic motion, speed lines or impact suggestion appropriate to vertical-scroll pacing.";
    case "transition":
      return "Transition panel — soft visual bridge between two scenes (location, time skip, or POV shift).";
    case "cliffhanger":
      return [
        "Cliffhanger panel ending this episode.",
        aspect === "splash" || aspect === "big"
          ? "Large dramatic composition with strong silhouette; leave breathing room below for the closing line."
          : "Strong dramatic framing, suggest unresolved tension to push next-episode click.",
      ].join(" ");
    default:
      return "";
  }
}

function narrativeDirective(fn: NarrativeFunction | null | undefined): string {
  switch (fn) {
    case "inform":
      return "Function: information delivery — composition should highlight the new fact/object/state being introduced.";
    case "emote":
      return "Function: emotional shot — the focal element is the character's internal state, expressed through face, body language, or symbolic visual.";
    case "pause":
      return "Function: deliberate pause / breath — minimal action, atmospheric, gives the reader's eye time to settle before scrolling on.";
    case "contrast":
      return "Function: contrast with the immediately preceding panel — opposite scale, framing, lighting, or color temperature.";
    case "reveal":
      return "Function: reveal — something previously hidden becomes visible. The composition leads the eye to the revealed element last.";
    case "silence":
      return "Function: pure silence panel — no dialogue, no action, just held image. Composition emphasizes empty space and ambient detail.";
    case "establishing":
      return "Function: establishing shot — wide framing that fixes time/place/mood for the upcoming beat.";
    case "beat_button":
      return "Function: beat button — the punctuating last image of a beat. Strong silhouette or single decisive element.";
    case "reaction":
      return "Function: reaction shot — focus is the unspoken reaction of a character witnessing the previous panel's event.";
    case "cutaway":
      return "Function: cutaway — abrupt shift to an elsewhere/elsewhen, used as juxtaposition with the previous panel.";
    default:
      return "";
  }
}

function cutTypeDirective(cut: ShotlistPanelEntry["cut_type"]): string {
  switch (cut) {
    case "match_action":
      return "Continuity from previous panel: match-action — the same physical motion/gesture continues from the previous frame.";
    case "shot_reverse":
      return "Continuity from previous panel: shot-reverse — opposite-side framing of the conversation partner from the previous panel.";
    case "scale_jump":
      return "Continuity from previous panel: scale-jump — significantly tighter or wider framing of the same subject.";
    case "graphic_match":
      return "Continuity from previous panel: graphic-match — the dominant shape or composition mirrors the previous panel's silhouette.";
    case "smash_cut":
      return "Continuity from previous panel: smash-cut — abrupt unrelated shift in subject, location, or tone.";
    case "reveal_pull":
      return "Continuity from previous panel: reveal-pull — same setup as before but the framing pulls back to reveal new context.";
    case "time_skip":
      return "Continuity from previous panel: time-skip — clearly later in time. Show subtle visual cues of elapsed time.";
    default:
      return "";
  }
}

function characterCard(c: CharacterBibleRow, hasRefImage: boolean): string {
  const spec = c.spec ?? {};
  const hair = spec.hair
    ? `${spec.hair.color ?? ""} ${spec.hair.style ?? ""}${spec.hair.specific ? ` (${spec.hair.specific})` : ""}`.trim()
    : "unspecified hair";
  const eyes = spec.eyes
    ? `${spec.eyes.color ?? ""} ${spec.eyes.shape ?? ""} eyes`.trim()
    : "";
  const build = spec.build ? `${spec.build} build` : "";
  const outfit = spec.outfit_default
    ? [
        spec.outfit_default.outerwear,
        spec.outfit_default.top,
        spec.outfit_default.bottom,
        spec.outfit_default.shoes,
      ]
        .filter(Boolean)
        .join(", ")
    : "default outfit";
  const personality = spec.personality_visual ?? "";
  const age = spec.age_visual ? `appears ${spec.age_visual}` : "";
  const refNote = hasRefImage
    ? " A reference image of this exact character is provided — preserve hair, eyes, face shape, and outfit with strict fidelity to that reference."
    : "";
  return [
    `${c.character_name}: ${age}, ${spec.gender ?? ""}, ${build}, hair ${hair}, ${eyes}, wearing ${outfit}.${personality ? ` ${personality}.` : ""}${refNote}`,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s,/g, ",");
}

function locationCard(l: LocationBibleRow | null): string {
  if (!l) return "Background: minimal abstract environment, focus on the figure.";
  const spec = l.spec ?? {};
  const era = spec.era ?? "";
  const atmo = spec.atmosphere ?? "";
  const lighting = spec.lighting_default ?? "";
  const palette = spec.color_palette?.length
    ? `Color palette: ${spec.color_palette.join(", ")}.`
    : "";
  return [
    `Background: ${l.location_name} (${l.location_type ?? "scene"}, ${era}).`,
    atmo ? `Atmosphere: ${atmo}.` : "",
    lighting ? `Lighting: ${lighting}.` : "",
    palette,
  ]
    .filter(Boolean)
    .join(" ");
}

function multiCharacterDirective(
  treatment: string | null | undefined,
  characterCount: number
): string {
  if (characterCount <= 2 && (!treatment || treatment === "normal")) return "";
  switch (treatment) {
    case "distant":
      return "Render any additional characters as small distant background figures (face accuracy not required).";
    case "silhouette":
      return "Render any additional characters as solid silhouettes against the background, individual features not visible.";
    case "split_panel":
      return "Compose this panel as a split layout, with each character isolated in their own sub-frame.";
    default:
      return characterCount > 2
        ? "Keep at most two clearly rendered foreground characters; treat any others as silhouettes or distant figures."
        : "";
  }
}

const ANTI_AI_NEGATIVES = [
  "Do NOT use airbrushed soft skin gradients, glossy plastic-doll surfaces, or 3D-render shading.",
  "Do NOT use perfectly symmetrical glamour-shot composition, generic anime-template proportions, or pin-up posing.",
  "Do NOT use photorealistic environment rendering, depth-of-field bokeh, or cinematic lens flares.",
  "Avoid over-rendered detail; favor confident negative space and decisive line work as in published manhwa volumes.",
];

/**
 * 「描き込み過剰」抑制ディレクティブ (2026-05-01 minimalism-pilot で効果実証)
 *
 * Week 0 Pilot で AIっぽさが「全コマ均一に細密描き込み」「群衆顔の過剰描写」
 * 「背景の意味なき詳細化」に起因することが判明。本ディレクティブで抑制する。
 *
 * 効果: 標準プロンプト B- → minimalism-pilot で A- 相当に改善。
 *       特に silence_panel (4枚目) は商業漫画家レベルの余白支配を実現。
 *
 * デフォルトで composePanelPrompt に含める (Phase A 制作時の品質担保)。
 */
const MINIMALISM_DIRECTIVE = [
  "DRAWING DISCIPLINE — 'Drawing what NOT to draw is also drawing.' This is published commercial manga, NOT AI illustration.",
  "Backgrounds must be MINIMAL — only sketch essential elements with the fewest possible lines. Empty white space is required and intentional.",
  "Crowd figures should be reduced to silhouettes or simple line gestures, NOT individually rendered faces.",
  "Use the FEWEST lines needed — confident decisive strokes, NOT over-rendered hatching.",
  "Suggest backgrounds with single strokes or partial lines (a window may be just two parallel lines, no glass detail).",
  "Do NOT pack every corner with detail. Do NOT render every brick, every leaf, every face. Do NOT use uniform screentone density.",
  "Reference: think Inio Asano (Goodnight Punpun) for crowd silhouette work, Naoki Urasawa (Monster) for background restraint, NOT generic AI illustration.",
].join(" ");

/**
 * RTL 読み順厳守ディレクティブ (2026-05-01 style-mimic-pilot で問題発覚)
 *
 * 日本漫画は **right-to-left, top-to-bottom** の読み順。プロンプトに「left」「right」を
 * 単純記述すると、AI は LTR (英語読み順) でストーリーを組み立ててしまい、コマ順序が
 * 逆転する事故が発生 (Pilot 全体のレベルで混入していた可能性)。
 *
 * 効果対象: F-2 (page_one_shot) 用ページ全体プロンプト。
 * F-1 (panel_composite) は1コマ単独生成のため本ディレクティブは不要。
 */
export const RTL_READING_ORDER_DIRECTIVE = [
  "READING ORDER — Japanese manga reads RIGHT-TO-LEFT, top-to-bottom.",
  "When panels share a tier (row), the panel on the RIGHT side is read FIRST, the LEFT side is read SECOND.",
  "Story flow within a tier MUST progress right→left. Do not arrange panels as if reading left-to-right (English convention).",
  "When the prompt specifies 'panel #1, panel #2, panel #3, ...', that numbering reflects the reading order. The first numbered panel goes to the position read first in RTL.",
  "If a tier has two panels, panel #N (earlier in story) goes RIGHT, panel #N+1 (later in story) goes LEFT.",
].join(" ");

const PANEL_SAFETY = [
  "Do NOT render any speech bubbles, dialogue text, sound effects, captions, or written symbols inside the image (text will be composited later).",
  "Do NOT include watermarks, signatures, page numbers, panel borders, or studio logos.",
  "Hands and fingers must look natural; render no more than five fingers per hand.",
];

export function composePanelPrompt(args: {
  panel: ShotlistPanelEntry;
  characters: CharacterBibleRow[];
  costumesByCharacterId: Map<string, CostumeStateRow[]>;
  location: LocationBibleRow | null;
  artStyle: ArtStyle;
  /** スタイルシートのローカル PNG パス（あれば最初の reference に） */
  styleSheetPath?: string;
  /** キャラごとの参照画像ローカルパス（character_id → path） */
  characterRefPaths?: Map<string, string[]>;
  /** 直前パネルの確定アセット ローカル PNG パス */
  prevPanelPath?: string;
}): ComposedPanelPrompt {
  const size = selectSizeForAspect(args.panel.aspect);
  const charCount = args.panel.characters.length;

  const styleLine = styleDirective(args.artStyle);
  const cameraLine = cameraDirective(args.panel.camera, args.panel.aspect);
  const roleLine = roleDirective(args.panel.role, args.panel.aspect);
  const fnLine = narrativeDirective(args.panel.narrative_function);
  const cutLine = cutTypeDirective(args.panel.cut_type);

  // 参照画像列の組み立て（順序: スタイル → キャラ refs → 直前パネル）
  const refs: string[] = [];
  if (args.styleSheetPath) refs.push(args.styleSheetPath);
  for (const c of args.characters) {
    const paths = args.characterRefPaths?.get(c.id) ?? [];
    for (const p of paths) refs.push(p);
  }
  if (args.prevPanelPath) refs.push(args.prevPanelPath);

  const charLines: string[] = [];
  args.characters.forEach((c) => {
    const hasRef =
      (args.characterRefPaths?.get(c.id)?.length ?? 0) > 0;
    const card = characterCard(c, hasRef);
    const positionLine = args.panel.character_positions?.[c.id]
      ? ` Positioned ${args.panel.character_positions[c.id]} of frame.`
      : "";
    charLines.push(card + positionLine);
  });

  const multiLine = multiCharacterDirective(
    args.panel.multi_character_treatment ?? null,
    charCount
  );

  const locationLine = locationCard(args.location);

  // ネーム層の物語的指示
  const storyDirectives: string[] = [];
  if (args.panel.purpose)
    storyDirectives.push(`Reader takeaway: ${args.panel.purpose}`);
  if (args.panel.change_from_prev)
    storyDirectives.push(
      `Change from previous panel: ${args.panel.change_from_prev}`
    );
  if (args.panel.visual_focus)
    storyDirectives.push(`Visual focus / where the eye lands first: ${args.panel.visual_focus}`);
  if (args.panel.emotion)
    storyDirectives.push(`Mood / emotion: ${args.panel.emotion}.`);
  if (args.panel.link_to_next)
    storyDirectives.push(
      `Foreshadow toward next panel: ${args.panel.link_to_next}`
    );

  const consistency = refs.length > 0
    ? "STRICT consistency rule: use the supplied reference image(s) as the canonical character appearance and series art style. Match line weight, palette, and shading style of the references."
    : "Maintain consistent character design — hair color, hairstyle, eye color, outfit, and proportions must match the description exactly.";

  const bwNegativesLine = bwMangaNegatives(args.artStyle);

  const promptSections = [
    styleLine,
    MINIMALISM_DIRECTIVE,
    cameraLine,
    roleLine,
    fnLine,
    cutLine,
    charLines.length > 0
      ? `Characters in frame:\n- ${charLines.join("\n- ")}`
      : "No human characters in this frame; environmental panel only.",
    multiLine,
    locationLine,
    storyDirectives.length > 0
      ? `Narrative directives:\n- ${storyDirectives.join("\n- ")}`
      : "",
    consistency,
    bwNegativesLine,
    ANTI_AI_NEGATIVES.join(" "),
    PANEL_SAFETY.join(" "),
  ].filter(Boolean);

  return {
    prompt: promptSections.join("\n\n"),
    size,
    referenceImagePaths: refs,
    debug: {
      aspect: args.panel.aspect,
      role: args.panel.role,
      camera: args.panel.camera,
      narrative_function: args.panel.narrative_function ?? null,
      character_count: charCount,
      multi_character_treatment: args.panel.multi_character_treatment ?? null,
      cut_type: args.panel.cut_type ?? null,
      refs: refs.length,
    },
  };
}
