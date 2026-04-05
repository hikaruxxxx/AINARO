import { fetchRankedNovels } from "@/lib/data";
import NovelFeedCard from "@/components/novel/NovelFeedCard";

export const revalidate = 3600;

export default async function HomePage() {
  // 面白さスコア順で取得（データ不足時はPV順にフォールバック）
  const novels = await fetchRankedNovels({ limit: 20 });

  if (novels.length === 0) {
    return (
      <div className="flex h-[80dvh] flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 text-5xl">📖</span>
        <h1 className="mb-2 text-2xl font-bold text-primary">Novelis</h1>
        <p className="text-muted">もっと面白い小説を、すべての人に</p>
        <p className="mt-4 text-sm text-muted">作品はまだ公開されていません。</p>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] snap-y snap-mandatory overflow-y-auto">
      {novels.map((novel) => (
        <NovelFeedCard key={novel.id} novel={novel} />
      ))}
    </div>
  );
}
