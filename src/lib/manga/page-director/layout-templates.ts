/**
 * コマ割りテンプレート群（MVP最小 16個）
 *
 * プラン (codex-swift-kettle.md) p.224-229 の構成に従う。
 * - 5コマ: standard_3tier_5 / big_top_5 / big_bottom_5 / t_split_5
 * - 6コマ: standard_3tier_6 / dialogue_grid_6 / action_diagonal_6 / reveal_bottom_6
 * - 7コマ: dense_dialogue_7 / small_reaction_chain_7 / action_stair_7
 * - 8コマ: dense_info_8 / fast_comedy_8
 * - 特殊: splash_single / right_page_cliffhanger / left_page_aftermath
 *
 * ページ寸法: 1748 × 2480 px (B6判 128×182mm 350dpi、KDP 漫画入稿基準)
 * gutter (コマ間余白): 24 px (≒1.5mm)
 * 読み順: 右→左、上→下 (rtl)
 *
 * 各 slot の rect は絶対 px。balloon_zones は slot 内の region 名 (placer 側で位置に変換)。
 * 元 1500×2100 版から比例リサイズ (x: ×1.165 / y: ×1.181)、座標は 24px gutter に合わせて整数化。
 */

import type { LayoutTemplate } from "./types";
import { PAGE_DIMENSIONS } from "./types";

const W = PAGE_DIMENSIONS.width; // 1748
const H = PAGE_DIMENSIONS.height; // 2480
const G = 24; // gutter (B6 350dpi で約 1.5mm 相当)

// ============================================================
// 5コマ系
// ============================================================

const standard_3tier_5: LayoutTemplate = {
  id: "standard_3tier_5",
  name: "標準3段5コマ",
  panel_count: 5,
  fits_page_roles: ["setup", "dialogue", "aftermath"],
  fits_visual_density: ["normal"],
  fits_dialogue_density: ["normal", "high"],
  slots: [
    // 上段: 1コマ (wide)
    { id: "s1", rect: { x: G, y: G, w: W - G * 2, h: 708 }, size_class: "large", default_reading_order: 1, balloon_zones: ["upper_right", "upper_left"], role_hint: "establishing" },
    // 中段: 2コマ (右、左)
    { id: "s2", rect: { x: W / 2 + G / 2, y: 756, w: (W - G * 3) / 2, h: 826 }, size_class: "medium", default_reading_order: 2, balloon_zones: ["upper_right", "lower_left"] },
    { id: "s3", rect: { x: G, y: 756, w: (W - G * 3) / 2, h: 826 }, size_class: "medium", default_reading_order: 3, balloon_zones: ["upper_right", "lower_left"] },
    // 下段: 2コマ
    { id: "s4", rect: { x: W / 2 + G / 2, y: 1606, w: (W - G * 3) / 2, h: 850 }, size_class: "medium", default_reading_order: 4, balloon_zones: ["upper_right", "lower_left"] },
    { id: "s5", rect: { x: G, y: 1606, w: (W - G * 3) / 2, h: 850 }, size_class: "medium", default_reading_order: 5, balloon_zones: ["upper_right", "lower_center"] },
  ],
};

const big_top_5: LayoutTemplate = {
  id: "big_top_5",
  name: "上段大ゴマ5コマ",
  panel_count: 5,
  fits_page_roles: ["reveal", "action"],
  fits_visual_density: ["normal", "heavy"],
  fits_dialogue_density: ["low", "normal"],
  slots: [
    // 上段: 大ゴマ (ページ上半分)
    { id: "s1", rect: { x: G, y: G, w: W - G * 2, h: 1180 }, size_class: "extra_large", default_reading_order: 1, balloon_zones: ["upper_right", "lower_left"], role_hint: "reveal_or_action" },
    // 中段: 2コマ
    { id: "s2", rect: { x: W / 2 + G / 2, y: 1228, w: (W - G * 3) / 2, h: 590 }, size_class: "medium", default_reading_order: 2, balloon_zones: ["upper_right"] },
    { id: "s3", rect: { x: G, y: 1228, w: (W - G * 3) / 2, h: 590 }, size_class: "medium", default_reading_order: 3, balloon_zones: ["upper_right"] },
    // 下段: 2コマ
    { id: "s4", rect: { x: W / 2 + G / 2, y: 1842, w: (W - G * 3) / 2, h: 614 }, size_class: "medium", default_reading_order: 4, balloon_zones: ["lower_left"] },
    { id: "s5", rect: { x: G, y: 1842, w: (W - G * 3) / 2, h: 614 }, size_class: "medium", default_reading_order: 5, balloon_zones: ["lower_center"] },
  ],
};

const big_bottom_5: LayoutTemplate = {
  id: "big_bottom_5",
  name: "下段大ゴマ5コマ",
  panel_count: 5,
  fits_page_roles: ["cliffhanger", "aftermath"],
  fits_visual_density: ["normal"],
  fits_dialogue_density: ["low", "normal"],
  slots: [
    { id: "s1", rect: { x: W / 2 + G / 2, y: G, w: (W - G * 3) / 2, h: 590 }, size_class: "medium", default_reading_order: 1, balloon_zones: ["upper_right"] },
    { id: "s2", rect: { x: G, y: G, w: (W - G * 3) / 2, h: 590 }, size_class: "medium", default_reading_order: 2, balloon_zones: ["upper_left"] },
    { id: "s3", rect: { x: W / 2 + G / 2, y: 638, w: (W - G * 3) / 2, h: 590 }, size_class: "medium", default_reading_order: 3, balloon_zones: ["upper_right"] },
    { id: "s4", rect: { x: G, y: 638, w: (W - G * 3) / 2, h: 590 }, size_class: "medium", default_reading_order: 4, balloon_zones: ["upper_left"] },
    // 下段: 大ゴマ
    { id: "s5", rect: { x: G, y: 1276, w: W - G * 2, h: 1180 }, size_class: "extra_large", default_reading_order: 5, balloon_zones: ["lower_center", "upper_left"], role_hint: "cliffhanger_hook" },
  ],
};

const t_split_5: LayoutTemplate = {
  id: "t_split_5",
  name: "T字割り5コマ",
  panel_count: 5,
  fits_page_roles: ["action", "reveal"],
  fits_visual_density: ["heavy"],
  fits_dialogue_density: ["low"],
  slots: [
    // 上段右半: 縦長大ゴマ
    { id: "s1", rect: { x: W / 2 + G / 2, y: G, w: (W - G * 3) / 2, h: 1180 }, size_class: "large", default_reading_order: 1, balloon_zones: ["upper_right", "lower_left"], role_hint: "vertical_dominant" },
    // 上段左半: 縦に2分割
    { id: "s2", rect: { x: G, y: G, w: (W - G * 3) / 2, h: 578 }, size_class: "small", default_reading_order: 2, balloon_zones: ["upper_left"] },
    { id: "s3", rect: { x: G, y: 626, w: (W - G * 3) / 2, h: 578 }, size_class: "small", default_reading_order: 3, balloon_zones: ["lower_left"] },
    // 下段: 横長2コマ
    { id: "s4", rect: { x: W / 2 + G / 2, y: 1228, w: (W - G * 3) / 2, h: 1228 }, size_class: "large", default_reading_order: 4, balloon_zones: ["upper_right"] },
    { id: "s5", rect: { x: G, y: 1228, w: (W - G * 3) / 2, h: 1228 }, size_class: "large", default_reading_order: 5, balloon_zones: ["lower_left"] },
  ],
};

// ============================================================
// 6コマ系
// ============================================================

const standard_3tier_6: LayoutTemplate = {
  id: "standard_3tier_6",
  name: "標準3段6コマ",
  panel_count: 6,
  fits_page_roles: ["setup", "dialogue", "aftermath"],
  fits_visual_density: ["normal"],
  fits_dialogue_density: ["normal", "high"],
  slots: [
    // 上段: 2コマ
    { id: "s1", rect: { x: W / 2 + G / 2, y: G, w: (W - G * 3) / 2, h: 790 }, size_class: "medium", default_reading_order: 1, balloon_zones: ["upper_right"] },
    { id: "s2", rect: { x: G, y: G, w: (W - G * 3) / 2, h: 790 }, size_class: "medium", default_reading_order: 2, balloon_zones: ["upper_left"] },
    // 中段: 2コマ
    { id: "s3", rect: { x: W / 2 + G / 2, y: 838, w: (W - G * 3) / 2, h: 790 }, size_class: "medium", default_reading_order: 3, balloon_zones: ["upper_right"] },
    { id: "s4", rect: { x: G, y: 838, w: (W - G * 3) / 2, h: 790 }, size_class: "medium", default_reading_order: 4, balloon_zones: ["upper_left"] },
    // 下段: 2コマ
    { id: "s5", rect: { x: W / 2 + G / 2, y: 1676, w: (W - G * 3) / 2, h: 780 }, size_class: "medium", default_reading_order: 5, balloon_zones: ["lower_right"] },
    { id: "s6", rect: { x: G, y: 1676, w: (W - G * 3) / 2, h: 780 }, size_class: "medium", default_reading_order: 6, balloon_zones: ["lower_left"] },
  ],
};

const dialogue_grid_6: LayoutTemplate = {
  id: "dialogue_grid_6",
  name: "会話3×2グリッド6コマ",
  panel_count: 6,
  fits_page_roles: ["dialogue"],
  fits_visual_density: ["light", "normal"],
  fits_dialogue_density: ["high"],
  slots: [
    // 3段それぞれ2コマ均等
    { id: "s1", rect: { x: W / 2 + G / 2, y: G, w: (W - G * 3) / 2, h: 790 }, size_class: "medium", default_reading_order: 1, balloon_zones: ["upper_right", "lower_left"] },
    { id: "s2", rect: { x: G, y: G, w: (W - G * 3) / 2, h: 790 }, size_class: "medium", default_reading_order: 2, balloon_zones: ["upper_left", "lower_right"] },
    { id: "s3", rect: { x: W / 2 + G / 2, y: 838, w: (W - G * 3) / 2, h: 790 }, size_class: "medium", default_reading_order: 3, balloon_zones: ["upper_right", "lower_left"] },
    { id: "s4", rect: { x: G, y: 838, w: (W - G * 3) / 2, h: 790 }, size_class: "medium", default_reading_order: 4, balloon_zones: ["upper_left", "lower_right"] },
    { id: "s5", rect: { x: W / 2 + G / 2, y: 1676, w: (W - G * 3) / 2, h: 780 }, size_class: "medium", default_reading_order: 5, balloon_zones: ["upper_right", "lower_left"] },
    { id: "s6", rect: { x: G, y: 1676, w: (W - G * 3) / 2, h: 780 }, size_class: "medium", default_reading_order: 6, balloon_zones: ["upper_left", "lower_right"] },
  ],
  notes: "リアクション交互 / 切り返し演出向き",
};

const action_diagonal_6: LayoutTemplate = {
  id: "action_diagonal_6",
  name: "斜め分断アクション6コマ",
  panel_count: 6,
  fits_page_roles: ["action"],
  fits_visual_density: ["heavy"],
  fits_dialogue_density: ["low"],
  slots: [
    // 上段大ゴマ (action 起点)
    { id: "s1", rect: { x: G, y: G, w: W - G * 2, h: 826 }, size_class: "large", default_reading_order: 1, balloon_zones: ["upper_right"], role_hint: "action_setup" },
    // 中段: 不等分割 (右大、左小2)
    { id: "s2", rect: { x: 874, y: 874, w: 850, h: 708 }, size_class: "large", default_reading_order: 2, balloon_zones: ["upper_right"], role_hint: "impact" },
    { id: "s3", rect: { x: G, y: 874, w: 826, h: 348 }, size_class: "small", default_reading_order: 3, balloon_zones: ["upper_left"] },
    { id: "s4", rect: { x: G, y: 1234, w: 826, h: 348 }, size_class: "small", default_reading_order: 4, balloon_zones: ["lower_left"] },
    // 下段: 2コマ
    { id: "s5", rect: { x: W / 2 + G / 2, y: 1630, w: (W - G * 3) / 2, h: 826 }, size_class: "medium", default_reading_order: 5, balloon_zones: ["upper_right"] },
    { id: "s6", rect: { x: G, y: 1630, w: (W - G * 3) / 2, h: 826 }, size_class: "medium", default_reading_order: 6, balloon_zones: ["upper_left"] },
  ],
};

const reveal_bottom_6: LayoutTemplate = {
  id: "reveal_bottom_6",
  name: "下段大ゴマreveal6コマ",
  panel_count: 6,
  fits_page_roles: ["reveal", "cliffhanger"],
  fits_visual_density: ["normal"],
  fits_dialogue_density: ["low", "normal"],
  slots: [
    // 上段: 3コマ均等
    { id: "s1", rect: { x: 1178, y: G, w: 546, h: 708 }, size_class: "medium", default_reading_order: 1, balloon_zones: ["upper_right"] },
    { id: "s2", rect: { x: 596, y: G, w: 558, h: 708 }, size_class: "medium", default_reading_order: 2, balloon_zones: ["upper_center"] },
    { id: "s3", rect: { x: G, y: G, w: 548, h: 708 }, size_class: "medium", default_reading_order: 3, balloon_zones: ["upper_left"] },
    // 中段: 2コマ
    { id: "s4", rect: { x: W / 2 + G / 2, y: 756, w: (W - G * 3) / 2, h: 448 }, size_class: "small", default_reading_order: 4, balloon_zones: ["upper_right"] },
    { id: "s5", rect: { x: G, y: 756, w: (W - G * 3) / 2, h: 448 }, size_class: "small", default_reading_order: 5, balloon_zones: ["upper_left"] },
    // 下段: 大ゴマ (reveal)
    { id: "s6", rect: { x: G, y: 1252, w: W - G * 2, h: 1204 }, size_class: "extra_large", default_reading_order: 6, balloon_zones: ["upper_right", "lower_left"], role_hint: "reveal_climax" },
  ],
};

// ============================================================
// 7コマ系
// ============================================================

const dense_dialogue_7: LayoutTemplate = {
  id: "dense_dialogue_7",
  name: "密な会話7コマ",
  panel_count: 7,
  fits_page_roles: ["dialogue"],
  fits_visual_density: ["heavy"],
  fits_dialogue_density: ["high"],
  slots: [
    { id: "s1", rect: { x: G, y: G, w: W - G * 2, h: 472 }, size_class: "large", default_reading_order: 1, balloon_zones: ["upper_right", "upper_left"] },
    { id: "s2", rect: { x: W / 2 + G / 2, y: 520, w: (W - G * 3) / 2, h: 472 }, size_class: "medium", default_reading_order: 2, balloon_zones: ["upper_right"] },
    { id: "s3", rect: { x: G, y: 520, w: (W - G * 3) / 2, h: 472 }, size_class: "medium", default_reading_order: 3, balloon_zones: ["upper_left"] },
    { id: "s4", rect: { x: W / 2 + G / 2, y: 1040, w: (W - G * 3) / 2, h: 472 }, size_class: "medium", default_reading_order: 4, balloon_zones: ["upper_right"] },
    { id: "s5", rect: { x: G, y: 1040, w: (W - G * 3) / 2, h: 472 }, size_class: "medium", default_reading_order: 5, balloon_zones: ["upper_left"] },
    { id: "s6", rect: { x: W / 2 + G / 2, y: 1560, w: (W - G * 3) / 2, h: 896 }, size_class: "medium", default_reading_order: 6, balloon_zones: ["upper_right", "lower_left"] },
    { id: "s7", rect: { x: G, y: 1560, w: (W - G * 3) / 2, h: 896 }, size_class: "medium", default_reading_order: 7, balloon_zones: ["upper_left", "lower_right"] },
  ],
};

const small_reaction_chain_7: LayoutTemplate = {
  id: "small_reaction_chain_7",
  name: "小コマリアクション連鎖7コマ",
  panel_count: 7,
  fits_page_roles: ["dialogue", "aftermath"],
  fits_visual_density: ["heavy"],
  fits_dialogue_density: ["normal", "high"],
  slots: [
    // 上段: 大1
    { id: "s1", rect: { x: G, y: G, w: W - G * 2, h: 708 }, size_class: "large", default_reading_order: 1, balloon_zones: ["upper_right", "lower_left"] },
    // 中段右半: 小2
    { id: "s2", rect: { x: W / 2 + G / 2, y: 756, w: (W - G * 3) / 2, h: 448 }, size_class: "small", default_reading_order: 2, balloon_zones: ["upper_right"] },
    { id: "s3", rect: { x: W / 2 + G / 2, y: 1228, w: (W - G * 3) / 2, h: 448 }, size_class: "small", default_reading_order: 3, balloon_zones: ["lower_right"] },
    // 中段左半: 小2
    { id: "s4", rect: { x: G, y: 756, w: (W - G * 3) / 2, h: 448 }, size_class: "small", default_reading_order: 4, balloon_zones: ["upper_left"] },
    { id: "s5", rect: { x: G, y: 1228, w: (W - G * 3) / 2, h: 448 }, size_class: "small", default_reading_order: 5, balloon_zones: ["lower_left"] },
    // 下段: 2コマ
    { id: "s6", rect: { x: W / 2 + G / 2, y: 1724, w: (W - G * 3) / 2, h: 732 }, size_class: "medium", default_reading_order: 6, balloon_zones: ["upper_right"] },
    { id: "s7", rect: { x: G, y: 1724, w: (W - G * 3) / 2, h: 732 }, size_class: "medium", default_reading_order: 7, balloon_zones: ["upper_left"] },
  ],
};

const action_stair_7: LayoutTemplate = {
  id: "action_stair_7",
  name: "階段アクション7コマ",
  panel_count: 7,
  fits_page_roles: ["action"],
  fits_visual_density: ["heavy"],
  fits_dialogue_density: ["low"],
  slots: [
    { id: "s1", rect: { x: 1178, y: G, w: 546, h: 566 }, size_class: "medium", default_reading_order: 1, balloon_zones: ["upper_right"] },
    { id: "s2", rect: { x: G, y: G, w: 1130, h: 566 }, size_class: "large", default_reading_order: 2, balloon_zones: ["upper_left"] },
    { id: "s3", rect: { x: G, y: 614, w: 546, h: 566 }, size_class: "medium", default_reading_order: 3, balloon_zones: ["lower_left"] },
    { id: "s4", rect: { x: 594, y: 614, w: 1130, h: 566 }, size_class: "large", default_reading_order: 4, balloon_zones: ["lower_right"] },
    { id: "s5", rect: { x: 1178, y: 1228, w: 546, h: 566 }, size_class: "medium", default_reading_order: 5, balloon_zones: ["upper_right"] },
    { id: "s6", rect: { x: G, y: 1228, w: 1130, h: 566 }, size_class: "large", default_reading_order: 6, balloon_zones: ["upper_left"], role_hint: "impact" },
    { id: "s7", rect: { x: G, y: 1842, w: W - G * 2, h: 614 }, size_class: "large", default_reading_order: 7, balloon_zones: ["lower_center"], role_hint: "aftermath" },
  ],
};

// ============================================================
// 8コマ系
// ============================================================

const dense_info_8: LayoutTemplate = {
  id: "dense_info_8",
  name: "情報密度8コマ",
  panel_count: 8,
  fits_page_roles: ["setup", "dialogue"],
  fits_visual_density: ["heavy"],
  fits_dialogue_density: ["high"],
  slots: [
    // 4段 × 2列均等
    { id: "s1", rect: { x: W / 2 + G / 2, y: G, w: (W - G * 3) / 2, h: 590 }, size_class: "medium", default_reading_order: 1, balloon_zones: ["upper_right"] },
    { id: "s2", rect: { x: G, y: G, w: (W - G * 3) / 2, h: 590 }, size_class: "medium", default_reading_order: 2, balloon_zones: ["upper_left"] },
    { id: "s3", rect: { x: W / 2 + G / 2, y: 638, w: (W - G * 3) / 2, h: 590 }, size_class: "medium", default_reading_order: 3, balloon_zones: ["upper_right"] },
    { id: "s4", rect: { x: G, y: 638, w: (W - G * 3) / 2, h: 590 }, size_class: "medium", default_reading_order: 4, balloon_zones: ["upper_left"] },
    { id: "s5", rect: { x: W / 2 + G / 2, y: 1276, w: (W - G * 3) / 2, h: 590 }, size_class: "medium", default_reading_order: 5, balloon_zones: ["lower_right"] },
    { id: "s6", rect: { x: G, y: 1276, w: (W - G * 3) / 2, h: 590 }, size_class: "medium", default_reading_order: 6, balloon_zones: ["lower_left"] },
    { id: "s7", rect: { x: W / 2 + G / 2, y: 1914, w: (W - G * 3) / 2, h: 542 }, size_class: "medium", default_reading_order: 7, balloon_zones: ["lower_right"] },
    { id: "s8", rect: { x: G, y: 1914, w: (W - G * 3) / 2, h: 542 }, size_class: "medium", default_reading_order: 8, balloon_zones: ["lower_left"] },
  ],
};

const fast_comedy_8: LayoutTemplate = {
  id: "fast_comedy_8",
  name: "テンポ8コマ",
  panel_count: 8,
  fits_page_roles: ["dialogue", "aftermath"],
  fits_visual_density: ["heavy"],
  fits_dialogue_density: ["high"],
  slots: [
    { id: "s1", rect: { x: 1178, y: G, w: 546, h: 566 }, size_class: "small", default_reading_order: 1, balloon_zones: ["upper_right"] },
    { id: "s2", rect: { x: 596, y: G, w: 558, h: 566 }, size_class: "small", default_reading_order: 2, balloon_zones: ["upper_center"] },
    { id: "s3", rect: { x: G, y: G, w: 548, h: 566 }, size_class: "small", default_reading_order: 3, balloon_zones: ["upper_left"] },
    { id: "s4", rect: { x: G, y: 614, w: W - G * 2, h: 566 }, size_class: "large", default_reading_order: 4, balloon_zones: ["upper_right"], role_hint: "punchline" },
    { id: "s5", rect: { x: 1178, y: 1228, w: 546, h: 566 }, size_class: "small", default_reading_order: 5, balloon_zones: ["lower_right"] },
    { id: "s6", rect: { x: 596, y: 1228, w: 558, h: 566 }, size_class: "small", default_reading_order: 6, balloon_zones: ["lower_center"] },
    { id: "s7", rect: { x: G, y: 1228, w: 548, h: 566 }, size_class: "small", default_reading_order: 7, balloon_zones: ["lower_left"] },
    { id: "s8", rect: { x: G, y: 1842, w: W - G * 2, h: 614 }, size_class: "large", default_reading_order: 8, balloon_zones: ["upper_center"], role_hint: "aftermath" },
  ],
};

// ============================================================
// 特殊
// ============================================================

const splash_single: LayoutTemplate = {
  id: "splash_single",
  name: "1ページ大ゴマ",
  panel_count: 1,
  fits_page_roles: ["reveal", "action", "cliffhanger"],
  fits_visual_density: ["heavy"],
  fits_dialogue_density: ["low"],
  slots: [
    { id: "s1", rect: { x: G, y: G, w: W - G * 2, h: H - G * 2 }, size_class: "splash", default_reading_order: 1, balloon_zones: ["upper_right", "lower_left", "center_top"], role_hint: "splash" },
  ],
};

const right_page_cliffhanger: LayoutTemplate = {
  id: "right_page_cliffhanger",
  name: "右ページ用cliffhanger",
  panel_count: 4,
  fits_page_roles: ["cliffhanger"],
  fits_visual_density: ["normal"],
  fits_dialogue_density: ["low"],
  slots: [
    // 上: 大ゴマ (reveal toward turning page)
    { id: "s1", rect: { x: G, y: G, w: W - G * 2, h: 1298 }, size_class: "extra_large", default_reading_order: 1, balloon_zones: ["upper_right", "lower_left"], role_hint: "page_open_hook" },
    // 中段: 2コマ
    { id: "s2", rect: { x: W / 2 + G / 2, y: 1346, w: (W - G * 3) / 2, h: 542 }, size_class: "medium", default_reading_order: 2, balloon_zones: ["upper_right"] },
    { id: "s3", rect: { x: G, y: 1346, w: (W - G * 3) / 2, h: 542 }, size_class: "medium", default_reading_order: 3, balloon_zones: ["upper_left"] },
    // 下段: 引きの極大ゴマ
    { id: "s4", rect: { x: G, y: 1914, w: W - G * 2, h: 542 }, size_class: "large", default_reading_order: 4, balloon_zones: ["lower_center"], role_hint: "cliffhanger_punch" },
  ],
};

const left_page_aftermath: LayoutTemplate = {
  id: "left_page_aftermath",
  name: "左ページ用aftermath",
  panel_count: 5,
  fits_page_roles: ["aftermath"],
  fits_visual_density: ["light", "normal"],
  fits_dialogue_density: ["low", "normal"],
  slots: [
    { id: "s1", rect: { x: W / 2 + G / 2, y: G, w: (W - G * 3) / 2, h: 826 }, size_class: "medium", default_reading_order: 1, balloon_zones: ["upper_right"] },
    { id: "s2", rect: { x: G, y: G, w: (W - G * 3) / 2, h: 826 }, size_class: "medium", default_reading_order: 2, balloon_zones: ["upper_left"] },
    { id: "s3", rect: { x: G, y: 874, w: W - G * 2, h: 638 }, size_class: "large", default_reading_order: 3, balloon_zones: ["upper_right", "lower_left"], role_hint: "atmospheric" },
    { id: "s4", rect: { x: W / 2 + G / 2, y: 1560, w: (W - G * 3) / 2, h: 896 }, size_class: "medium", default_reading_order: 4, balloon_zones: ["lower_right"] },
    { id: "s5", rect: { x: G, y: 1560, w: (W - G * 3) / 2, h: 896 }, size_class: "medium", default_reading_order: 5, balloon_zones: ["lower_center"], role_hint: "page_end_hook" },
  ],
};

// ============================================================
// エクスポート
// ============================================================

export const TEMPLATES: LayoutTemplate[] = [
  // 5
  standard_3tier_5,
  big_top_5,
  big_bottom_5,
  t_split_5,
  // 6
  standard_3tier_6,
  dialogue_grid_6,
  action_diagonal_6,
  reveal_bottom_6,
  // 7
  dense_dialogue_7,
  small_reaction_chain_7,
  action_stair_7,
  // 8
  dense_info_8,
  fast_comedy_8,
  // 特殊
  splash_single,
  right_page_cliffhanger,
  left_page_aftermath,
];

export const TEMPLATES_BY_ID: Map<string, LayoutTemplate> = new Map(
  TEMPLATES.map((t) => [t.id, t])
);

export function getTemplate(id: string): LayoutTemplate | undefined {
  return TEMPLATES_BY_ID.get(id);
}
