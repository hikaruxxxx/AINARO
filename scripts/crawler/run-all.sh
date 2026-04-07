#!/bin/bash
# 全クローラーを順番に実行（メモリ節約）
# caffeinate付きで実行: caffeinate -d ./scripts/crawler/run-all.sh

set -e
cd "$(dirname "$0")/../.."

echo "🕷️ クローラー一括実行（順次）"
echo "  開始: $(date)"
echo ""

# 1. なろう v2（10話）
echo "=== なろう v2 ==="
npx tsx scripts/crawler/batch-crawl.ts data/targets/stratified_v2.json --max-ep 10 || true

# 2. なろう ペア比較（10話）
echo "=== なろう ペア比較 ==="
npx tsx scripts/crawler/batch-crawl.ts data/targets/paired_comparison.json --max-ep 10 || true

# 3. なろう 全話取得
echo "=== なろう 全話取得 ==="
npx tsx scripts/crawler/batch-crawl.ts data/targets/full_episode_targets.json || true

# 4. アルファポリス
echo "=== アルファポリス ==="
npx tsx scripts/crawler/batch-crawl-alphapolis.ts data/targets/alphapolis_stratified.json --max-ep 10 || true

echo ""
echo "✅ 全完了: $(date)"
