// Phase 1 の没作品を層別・ジャンル別の訓練データとして保存する。

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { LayerId } from "./work-queue";

// Layer 6 は ep002 / ep003 の両方を保存するため、各 Layer は配列で持つ。
const LAYER_FILES: Record<LayerId, string[]> = {
  1: ["layer1_logline.md"],
  2: ["layer2_plot.md"],
  3: ["layer3_synopsis.md"],
  4: ["layer4_arc1_plot.md"],
  5: ["layer5_ep001.md"],
  6: ["layer6_ep002.md", "layer6_ep003.md"],
};

export interface TrainingSampleMeta {
  slug: string;
  layer: LayerId;
  genre: string;
  label: "bottom";
  reason?: string;
  savedAt: string;
  sourceWorkDir: string;
}

export function saveRejectedTrainingSample(
  slug: string,
  layer: LayerId,
  genre: string,
  reason: string | undefined,
  worksDir = "data/generation/works",
  trainingDir = "data/training",
): boolean {
  if (layer < 2) return false;

  const sourceDir = join(worksDir, slug);
  const fileNames = LAYER_FILES[layer];
  // 1つでも存在するファイルがあれば保存対象とする (Layer 6 は ep002 のみで失敗するケースもある)
  const presentFiles = fileNames.filter((name) => existsSync(join(sourceDir, name)));
  if (presentFiles.length === 0) return false;

  const destDir = join(trainingDir, `layer${layer}`, genre, slug);
  mkdirSync(destDir, { recursive: true });
  for (const name of presentFiles) {
    copyFileSync(join(sourceDir, name), join(destDir, name));
  }

  const metaPath = join(sourceDir, "_meta.json");
  if (existsSync(metaPath)) {
    copyFileSync(metaPath, join(destDir, "_meta.json"));
  }

  const sampleMeta: TrainingSampleMeta = {
    slug,
    layer,
    genre,
    label: "bottom",
    reason,
    savedAt: new Date().toISOString(),
    sourceWorkDir: sourceDir,
  };
  writeFileSync(join(destDir, "training_label.json"), JSON.stringify(sampleMeta, null, 2));
  return true;
}
