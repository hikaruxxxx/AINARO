import fs from "node:fs";
import path from "node:path";

import type { DensityProfile } from "../schemas-v2";

/**
 * ジャンル ID から density profile JSON を読み込む。
 * 存在しない場合は null。
 */
export function loadDensityProfile(genre: string): DensityProfile | null {
  const profilePath = path.join(
    process.cwd(),
    "data/generation/density-profiles",
    `${genre}.json`,
  );

  if (!fs.existsSync(profilePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(profilePath, "utf8")) as DensityProfile;
  } catch (error) {
    console.warn(
      `[density-profile-loader] failed to load ${profilePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}
