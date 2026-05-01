/**
 * 縦読み漫画リーダーページ（Phase 1 MVP・自社サイト限定）
 *
 * URL: /[locale]/manga/[slug]/[episodeNum]
 *
 * Phase 1 はとにかく「縦に積んで読める」までを最短実現。
 * Phase 2 で reading_events 計測埋込、吹き出し SVG 合成、目次・前後話遷移を整備する。
 */

import { notFound } from "next/navigation";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  MangaWorkRow,
  MangaEpisodeRow,
  MangaPanelRow,
  AssetRow,
  BubbleRow,
} from "@/lib/manga/types";
import type { BubblePosition } from "@/lib/manga/schemas";
import { buildBubbleOverlaySvg } from "@/lib/manga/bubble/svg-overlay";
import type { Metadata } from "next";

export const revalidate = 60;

type Props = {
  params: Promise<{ slug: string; episodeNum: string; locale: string }>;
};

type PanelView = MangaPanelRow & {
  asset: Pick<AssetRow, "id" | "cdn_url" | "width_px" | "height_px"> | null;
  bubbles: Array<
    Pick<BubbleRow, "id" | "text" | "bubble_type" | "reading_order"> & {
      position: BubblePosition;
    }
  >;
};

async function fetchMangaEpisodeView(args: {
  slug: string;
  epNum: number;
}): Promise<{
  work: MangaWorkRow;
  episode: MangaEpisodeRow;
  panels: PanelView[];
} | null> {
  const sb = createAdminClient();

  // 1. novel_id by slug
  const { data: novel, error: novelErr } = await sb
    .from("novels")
    .select("id, title")
    .eq("slug", args.slug)
    .maybeSingle();
  if (novelErr) throw new Error(`novels query failed: ${novelErr.message}`);
  if (!novel) return null;

  // 2. manga_work
  const { data: work, error: workErr } = await sb
    .from("manga_works")
    .select("*")
    .eq("novel_id", novel.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (workErr) throw new Error(`manga_works query failed: ${workErr.message}`);
  if (!work) return null;

  // 3. episode
  const { data: episode, error: epErr } = await sb
    .from("manga_episodes")
    .select("*")
    .eq("work_id", work.id)
    .eq("ep_num", args.epNum)
    .maybeSingle();
  if (epErr) throw new Error(`manga_episodes query failed: ${epErr.message}`);
  if (!episode) return null;

  // 4. panels
  const { data: panels, error: panelsErr } = await sb
    .from("manga_panels")
    .select("*")
    .eq("episode_id", episode.id)
    .order("panel_idx", { ascending: true });
  if (panelsErr) throw new Error(`manga_panels query failed: ${panelsErr.message}`);
  if (!panels || panels.length === 0) {
    return { work: work as MangaWorkRow, episode: episode as MangaEpisodeRow, panels: [] };
  }

  // 5. assets（current_asset_id 配列）
  const assetIds = (panels as MangaPanelRow[])
    .map((p) => p.current_asset_id)
    .filter((id): id is string => !!id);
  let assetsById = new Map<string, AssetRow>();
  if (assetIds.length > 0) {
    const { data: assets, error: assetErr } = await sb
      .from("assets")
      .select("id, cdn_url, width_px, height_px")
      .in("id", assetIds);
    if (assetErr) throw new Error(`assets query failed: ${assetErr.message}`);
    assetsById = new Map(
      (assets ?? []).map((a) => [a.id as string, a as unknown as AssetRow])
    );
  }

  // 6. bubbles
  const panelIds = (panels as MangaPanelRow[]).map((p) => p.id);
  const { data: bubbles, error: bubErr } = await sb
    .from("bubbles")
    .select("id, panel_id, text, bubble_type, reading_order, position")
    .in("panel_id", panelIds)
    .order("reading_order", { ascending: true });
  if (bubErr) throw new Error(`bubbles query failed: ${bubErr.message}`);

  const bubblesByPanel = new Map<string, BubbleRow[]>();
  for (const b of (bubbles ?? []) as unknown as Array<
    BubbleRow & { panel_id: string }
  >) {
    if (!bubblesByPanel.has(b.panel_id))
      bubblesByPanel.set(b.panel_id, []);
    bubblesByPanel.get(b.panel_id)!.push(b);
  }

  const view: PanelView[] = (panels as MangaPanelRow[]).map((p) => ({
    ...p,
    asset: p.current_asset_id ? assetsById.get(p.current_asset_id) ?? null : null,
    bubbles: (bubblesByPanel.get(p.id) ?? []).map((b) => ({
      id: b.id,
      text: b.text,
      bubble_type: b.bubble_type,
      reading_order: b.reading_order,
      position: b.position,
    })),
  }));

  return {
    work: work as MangaWorkRow,
    episode: episode as MangaEpisodeRow,
    panels: view,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, episodeNum } = await params;
  const num = Number(episodeNum);
  if (Number.isNaN(num)) return {};
  const view = await fetchMangaEpisodeView({ slug, epNum: num });
  if (!view) return {};
  return {
    title: `${view.work.title} 第${num}話`,
    robots: { index: false, follow: false },
  };
}

export default async function MangaReaderPage({ params }: Props) {
  const { slug, episodeNum } = await params;
  const num = Number(episodeNum);
  if (Number.isNaN(num) || num < 1) notFound();

  const view = await fetchMangaEpisodeView({ slug, epNum: num });
  if (!view) notFound();

  const { work, episode, panels } = view;

  return (
    <main className="mx-auto max-w-[720px] bg-black text-white">
      <header className="px-4 py-6 border-b border-zinc-800">
        <p className="text-xs text-zinc-400">{work.title}</p>
        <h1 className="text-lg font-semibold">
          第{episode.ep_num}話{episode.title ? ` ${episode.title}` : ""}
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          パネル: {panels.length} / 状態: {episode.status}
        </p>
      </header>

      {panels.length === 0 ? (
        <section className="p-8 text-center text-zinc-400">
          まだパネルが生成されていません。
          <br />
          <code className="text-xs">
            npx tsx scripts/manga/generate-panels.ts --slug={slug} --ep={num}
          </code>
        </section>
      ) : (
        <section className="flex flex-col">
          {panels.map((p) => (
            <PanelBlock key={p.id} panel={p} />
          ))}
        </section>
      )}

      <footer className="px-4 py-8 text-center text-xs text-zinc-500 border-t border-zinc-800">
        Novelis Manga - Phase 1 MVP プレビュー
      </footer>
    </main>
  );
}

function PanelBlock({ panel }: { panel: PanelView }) {
  const w = panel.asset?.width_px ?? panel.width_px;
  const h = panel.asset?.height_px ?? panel.height_px;
  const aspectRatio = `${w} / ${h}`;

  // SVG オーバーレイ生成（吹き出し）
  const svg =
    panel.bubbles.length > 0 && panel.asset?.cdn_url
      ? buildBubbleOverlaySvg({
          panelWidth: w,
          panelHeight: h,
          bubbles: panel.bubbles.map((b) => ({
            position: b.position,
            text: b.text,
            bubble_type: b.bubble_type,
            reading_order: b.reading_order,
          })),
        })
      : null;

  return (
    <article
      className="relative w-full"
      data-panel-idx={panel.panel_idx}
      data-panel-role={panel.role}
      style={{ aspectRatio }}
    >
      {panel.asset?.cdn_url ? (
        <>
          <Image
            src={panel.asset.cdn_url}
            alt={`Panel ${panel.panel_idx} (${panel.role})`}
            width={w}
            height={h}
            className="block w-full h-auto"
            priority={panel.panel_idx <= 2}
            unoptimized
          />
          {svg && (
            <div
              className="absolute inset-0 w-full h-full pointer-events-none"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
        </>
      ) : (
        <div className="flex items-center justify-center bg-zinc-900 text-zinc-500 text-xs h-full">
          panel {panel.panel_idx} ({panel.role}) — image not generated yet
        </div>
      )}
    </article>
  );
}
