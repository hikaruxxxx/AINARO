import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { episodeDir } from "../../../../../../scripts/manga/layers/_paths";

type JourneyApiResponse = {
  exists: boolean;
  data?: unknown;
  error?: string;
};

async function readJsonOpt<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function handleReaderJourney(
  slug: string,
  episode: number,
  res: http.ServerResponse,
): Promise<void> {
  const journeyPath = path.join(episodeDir(slug, episode), "reader_journey.json");
  const data = await readJsonOpt<unknown>(journeyPath);

  const body: JourneyApiResponse = data
    ? { exists: true, data }
    : { exists: false };

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
