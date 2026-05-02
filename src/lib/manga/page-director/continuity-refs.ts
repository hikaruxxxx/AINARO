/**
 * Continuity Refs Registry — group_id → 参照画像ローカルパス[] の解決
 *
 * 流れ:
 *   1. BibleSnapshot.continuity_seeds[] を走査
 *   2. seed.target_name と kind から build-bible-images-from-snapshot.ts が
 *      出力したローカルディレクトリ構造を辿り、参照画像パスを集める
 *   3. group_id → paths[] の Map (= GroupRefRegistry) を返す
 *
 *   panel-generator は PagePanel.continuity_group_ids を引数に
 *   resolveRefsForGroupIds を呼び、ファイル実在を確認したパスを得る。
 *
 * 配置: build-bible-images-from-snapshot.ts と対称的な参照解決ロジック。
 *   生成側が出すパス規則と、ここでの解決規則が一致している必要がある。
 */

import { existsSync } from "fs";
import path from "path";
import type {
  BibleSnapshot,
  BibleContinuitySeed,
} from "../bible/bible-snapshot";

export type GroupRefRegistry = Map<string, string[]>;

/**
 * キャラ名/ロケ名 → ファイルシステム safe な dirname に変換。
 * build-bible-images-from-snapshot.ts:safeName と完全一致させる。
 */
function safeName(name: string, romaji?: string): string {
  if (romaji && romaji !== "TODO" && !romaji.startsWith("TODO")) {
    return romaji.toLowerCase().replace(/\s+/g, "_").replace(/[^\w-]/g, "");
  }
  return name.replace(/[^\w぀-ゟ゠-ヿ一-龯-]/g, "_");
}

/**
 * seed の kind から、refs ディレクトリ内のどの variant ファイルを引くか決める
 */
function variantsForKind(kind: BibleContinuitySeed["kind"]): {
  subdir: "characters" | "locations";
  variants: string[];
} {
  switch (kind) {
    case "character_face":
      return {
        subdir: "characters",
        variants: ["front", "side", "expr_joy", "expr_anger", "expr_sad"],
      };
    case "character_outfit":
      // 衣装一貫性は全身が見える front/side が要
      return { subdir: "characters", variants: ["front", "side"] };
    case "location_layout":
      // 空間整合性は wide + 入口アングル
      return {
        subdir: "locations",
        variants: ["wide", "front", "from_door"],
      };
    case "prop":
      // prop 専用 ref は未実装 (Phase 2 以降)。所有キャラの ref を流用するため
      // characters 側を引く
      return {
        subdir: "characters",
        variants: ["front", "side"],
      };
  }
}

/**
 * snapshot.characters[i].character_name_romaji を name で逆引きできる map
 */
function buildRomajiLookup(
  snapshot: BibleSnapshot
): Map<string, string | undefined> {
  const map = new Map<string, string | undefined>();
  for (const c of snapshot.characters) {
    map.set(c.character_name, c.character_name_romaji);
  }
  return map;
}

export type BuildGroupRefRegistryArgs = {
  snapshot: BibleSnapshot;
  /** data/manga/bible 等の参照画像ルート */
  refsRoot: string;
  /** 拡張子 (生成側に合わせる。デフォルト png) */
  ext?: "png" | "webp";
  /** 存在しないファイルを warn で報告するか */
  warnMissing?: boolean;
};

/**
 * snapshot から GroupRefRegistry を構築する。
 * 実在しないファイルは登録しない (生成途中でも安全に動く)。
 */
export function buildGroupRefRegistry(
  args: BuildGroupRefRegistryArgs
): GroupRefRegistry {
  const ext = args.ext ?? "png";
  const romajiLookup = buildRomajiLookup(args.snapshot);
  const registry: GroupRefRegistry = new Map();
  const missing: Array<{ group_id: string; tried: string[] }> = [];

  for (const seed of args.snapshot.continuity_seeds) {
    if (!seed.target_name || seed.target_name.startsWith("TODO")) continue;
    const { subdir, variants } = variantsForKind(seed.kind);
    const dirName =
      subdir === "characters"
        ? safeName(seed.target_name, romajiLookup.get(seed.target_name))
        : safeName(seed.target_name);

    const baseDir = path.join(
      args.refsRoot,
      args.snapshot.meta.slug,
      "refs",
      subdir,
      dirName
    );

    const paths: string[] = [];
    const tried: string[] = [];
    for (const v of variants) {
      const p = path.join(baseDir, `${v}.${ext}`);
      tried.push(p);
      if (existsSync(p)) paths.push(p);
    }

    if (paths.length === 0) {
      missing.push({ group_id: seed.group_id, tried });
      continue;
    }
    registry.set(seed.group_id, paths);
  }

  if (args.warnMissing && missing.length > 0) {
    for (const m of missing) {
      console.warn(
        `[continuity-refs] group_id=${m.group_id}: 参照画像なし。tried=${m.tried.length}件`
      );
    }
  }

  return registry;
}

/**
 * panel.continuity_group_ids を実ファイルパス配列に解決。
 * 重複排除して順序保持。
 */
export function resolveRefsForGroupIds(
  groupIds: string[] | undefined,
  registry: GroupRefRegistry
): string[] {
  if (!groupIds || groupIds.length === 0) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const gid of groupIds) {
    const paths = registry.get(gid) ?? [];
    for (const p of paths) {
      if (seen.has(p)) continue;
      seen.add(p);
      result.push(p);
    }
  }
  return result;
}

/**
 * snapshot のキャラ単位で参照画像 paths を集約した Map を作る。
 * prompt-composer の characterRefPaths (Map<character_id, string[]>) に直接渡せる。
 *
 * 入力:
 *   - registry: group_id → paths[] (buildGroupRefRegistry の出力)
 *   - snapshot: continuity_seeds から「character_name → 関連 group_id[]」を逆引き
 *   - characterIdToName: snapshot 経由の character_id → name 解決 map
 *
 * 出力: Map<character_id, string[]>
 *   各 character について、その target_name に紐づく全 group の paths を重複排除して連結
 */
export function buildCharacterRefPathsFromRegistry(args: {
  snapshot: BibleSnapshot;
  registry: GroupRefRegistry;
  characterIdToName: Map<string, string>;
}): Map<string, string[]> {
  const map = new Map<string, string[]>();
  // name → 関連 group_id[]
  const nameToGroupIds = new Map<string, string[]>();
  for (const seed of args.snapshot.continuity_seeds) {
    if (!seed.target_name || seed.target_name.startsWith("TODO")) continue;
    const arr = nameToGroupIds.get(seed.target_name) ?? [];
    arr.push(seed.group_id);
    nameToGroupIds.set(seed.target_name, arr);
  }

  for (const [charId, name] of args.characterIdToName.entries()) {
    const gids = nameToGroupIds.get(name) ?? [];
    const paths = resolveRefsForGroupIds(gids, args.registry);
    if (paths.length > 0) map.set(charId, paths);
  }
  return map;
}
