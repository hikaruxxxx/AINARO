const GENRE_LABELS: Record<string, string> = {
  fantasy: "異世界ファンタジー",
  romance: "恋愛",
  villainess: "悪役令嬢",
  horror: "ホラー",
  mystery: "ミステリー",
  scifi: "SF",
  drama: "現代ドラマ",
  comedy: "コメディ",
  action: "アクション",
  other: "その他",
};

export default function GenreBadge({ genre }: { genre: string }) {
  return (
    <span className="inline-block rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {GENRE_LABELS[genre] || genre}
    </span>
  );
}

export { GENRE_LABELS };
