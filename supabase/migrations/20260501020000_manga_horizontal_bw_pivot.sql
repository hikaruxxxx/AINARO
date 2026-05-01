-- 2026-04-30 横読み白黒漫画ピボットに伴う art_style デフォルト変更
-- 背景: docs/strategy/ + memory project_horizontal_manga_pivot.md
-- art_style 列は CHECK 制約のない TEXT なので enum マイグレーション不要。
-- デフォルトのみ webtoon → manga_bw_shounen に変更し、コメントで現行値を明示する。

ALTER TABLE manga_works
  ALTER COLUMN art_style SET DEFAULT 'manga_bw_shounen';

COMMENT ON COLUMN manga_works.art_style IS
  '漫画スタイル。現行: manga_bw_shounen / manga_bw_seinen (横読み白黒、2026-04-30〜)。'
  '旧: webtoon / shounen / shoujo / realistic / chibi (縦読みカラー、互換のため残置)。';
