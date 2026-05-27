/**
 * Migrate Bible: AntagonistProfile 追加
 *
 * 2026-05-20 S1 Domain D で新設。
 *
 * 既存 bible snapshot.json に `antagonists?: AntagonistProfile[]` を追加する。
 *
 * 当面は a07-modern-dungeon の手動 preset を hardcoded で提供。
 * 将来は V2 企画書 (main_arc / volume_outline) から LLM 抽出に拡張する。
 *
 * 使い方:
 *   node --import tsx scripts/manga/migrate-bible-antagonist.ts --slug a07-modern-dungeon
 *   node --import tsx scripts/manga/migrate-bible-antagonist.ts --slug a07-modern-dungeon --dry-run
 *
 * Open Decision (本セッション): 案 a (槇島 institutional_gatekeeper + 玲二 public_humiliator の 2 件追加)
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bibleSnapshotPath } from "./layers/_paths";
import type {
  BibleSnapshotV2,
  AntagonistProfile,
} from "../../src/lib/manga/schemas-v2";

type Args = {
  slug: string;
  dryRun: boolean;
};

function parseArgs(): Args {
  const a: Partial<Args> = { dryRun: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (key === "slug") {
      a.slug = next;
      i++;
    } else if (key === "dry-run" || key === "dryRun") {
      a.dryRun = true;
    }
  }
  if (!a.slug) throw new Error("--slug required");
  return a as Args;
}

/**
 * 作品別の AntagonistProfile preset。
 * 新作を追加するときはここに entries を増やす。
 */
const PRESETS: Record<string, AntagonistProfile[]> = {
  "a07-modern-dungeon": [
    {
      character_id: "char_氷室_玲二_v1",
      antagonist_type: "public_humiliator",
      humiliation_style:
        "国家エース部隊『朱』所属のSランクとしてSNS配信や記者会見でFランクを公開的に煽動・嘲笑し、観衆ごと主人公を社会的に下げる",
      public_power:
        "Sランクの戦果と国家公認の地位、配信フォロワー数百万規模で世論を左右する力",
      why_reader_hates_them:
        "強者が制度の弱者を公衆の面前で踏みつぶす不快感。読者は『この男を黙らせろ』と願う動機を vol 全話で抱える",
      first_humiliation_volume: 1,
      first_humiliation_episode: 1,
      first_payback_volume: 1,
      first_payback_episode: 8,
      escalation_plan: [
        { volume: 1, role: "ep1 で公開煽動、ep8 で 20F 番人戦の匿名 ID 勝利で間接 payback" },
        { volume: 2, role: "公開検証バトル予告、ep5 で陥落の兆し" },
        { volume: 4, role: "ep9 で『お前の声、俺にも聞かせてくれ』とレン側合流、antagonist 機能を卒業" },
      ],
    },
    {
      character_id: "char_槇島_主任_v1",
      antagonist_type: "institutional_gatekeeper",
      humiliation_style:
        "ダンジョン公社 (DPC) の内部監査室長として『再鑑定同意書』を制度上の手続きとして突きつけ、主人公の声を消す装置を制度の正当性で迫る",
      public_power:
        "DPC 内部監査室の捜査権限と公社アプリの個人ログ全閲覧権、Fランクの就労許可を取り消せる行政的圧力",
      why_reader_hates_them:
        "制度を盾にした拒絶の冷たさ。法的に正しい手続きで主人公の人生を狭めるため、暴力よりも生理的に嫌悪される",
      first_humiliation_volume: 1,
      first_humiliation_episode: 1,
      first_payback_volume: 1,
      first_payback_episode: 10,
      escalation_plan: [
        { volume: 1, role: "ep1 で前職上司として再会・侮辱、ep6 で再鑑定強制、ep10 で匿名 ID 拡散で逆転" },
        { volume: 3, role: "内部監査の追跡継続、灯里との対立で揺らぐ" },
        { volume: 5, role: "真意を吐露し離反 → 和解、antagonist 機能を卒業" },
      ],
    },
  ],
};

async function main() {
  const args = parseArgs();
  const preset = PRESETS[args.slug];
  if (!preset) {
    throw new Error(
      `slug=${args.slug} の AntagonistProfile preset が見つかりません。scripts/manga/migrate-bible-antagonist.ts の PRESETS に追加してください`,
    );
  }

  const sbPath = bibleSnapshotPath(args.slug);
  const bible = JSON.parse(await fs.readFile(sbPath, "utf-8")) as BibleSnapshotV2;

  // bible.characters[] の中に preset.character_id が実在することを確認
  const knownIds = new Set(bible.characters.map((c) => c.id));
  for (const a of preset) {
    if (!knownIds.has(a.character_id)) {
      throw new Error(
        `preset の character_id=${a.character_id} が bible.characters[] に存在しません`,
      );
    }
  }

  const existing = bible.antagonists ?? [];
  const existingIds = new Set(existing.map((a) => a.character_id));
  const toAdd = preset.filter((a) => !existingIds.has(a.character_id));

  if (toAdd.length === 0) {
    console.log(
      `[migrate-antagonist] slug=${args.slug}: 全 ${preset.length} 件は既に登録済み、何もしません`,
    );
    return;
  }

  console.log(
    `[migrate-antagonist] slug=${args.slug}: 追加 ${toAdd.length} 件 (既存 ${existing.length} 件):`,
  );
  for (const a of toAdd) {
    console.log(`  - ${a.character_id} (${a.antagonist_type})`);
    console.log(`    style: ${a.humiliation_style.slice(0, 80)}...`);
  }

  if (args.dryRun) {
    console.log(`[migrate-antagonist] --dry-run、ファイル変更なし`);
    return;
  }

  // バックアップ
  const backupPath = `${sbPath}.pre-antagonist.${new Date().toISOString().replace(/[:.]/g, "")}.backup`;
  await fs.copyFile(sbPath, backupPath);
  console.log(`[migrate-antagonist] backup: ${path.basename(backupPath)}`);

  bible.antagonists = [...existing, ...toAdd];
  await fs.writeFile(sbPath, JSON.stringify(bible, null, 2));
  console.log(
    `[migrate-antagonist] saved: ${sbPath} (antagonists=${bible.antagonists.length})`,
  );
}

main().catch((e) => {
  console.error("[migrate-antagonist] FAILED:", e);
  process.exit(1);
});
