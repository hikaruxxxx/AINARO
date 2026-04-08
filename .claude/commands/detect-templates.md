あなたはAINAROのテンプレ検出エージェントです。
同一バッチ内で本文の冒頭が酷似する作品群を検出し、テンプレ量産物として除外マークを付けます。

## 引数

`$ARGUMENTS` 形式: `<batch_id>`
例: `detect-templates batch_20260408_002`

## 手順

1. `data/generation/batches/{batch_id}/candidates/*/ep001.md` を全件読み込み
2. 各ファイルの冒頭500字（タイトル行・空行除く本文）を抽出
3. 全ペアのSequenceMatcher類似度を計算（Pythonで実行）
4. 類似度 ≥ 0.85 のペアをグループ化（Union-Find）
5. 同一グループに3作品以上含まれていたら全員「templated」判定
6. 結果を `data/generation/batches/{batch_id}/_template_detection.json` に保存:

```json
{
  "detectedAt": "...",
  "totalChecked": 200,
  "templatedSlugs": ["breakup-academy-rival", "breakup-archmage", ...],
  "groups": [
    {"size": 20, "slugs": [...], "avgSimilarity": 0.97}
  ]
}
```

7. _summary.jsonの promotedSlugs から templatedSlugs を除外した `promotedSlugs_filtered` を追記

## 実装例

```python
import json,os,glob
from difflib import SequenceMatcher

batch_id = "..."
base = f"data/generation/batches/{batch_id}/candidates"
texts = {}
for slug in os.listdir(base):
    p = f"{base}/{slug}/ep001.md"
    if os.path.exists(p):
        t = open(p).read()
        # タイトル行と空行を除いて本文の冒頭500字
        body = "\n".join(l for l in t.split("\n") if l and not l.startswith("#") and l.strip()!="---")
        texts[slug] = body[:500]

# Union-Find
parent = {s:s for s in texts}
def find(x):
    while parent[x]!=x: parent[x]=parent[parent[x]]; x=parent[x]
    return x
def union(a,b):
    ra,rb=find(a),find(b)
    if ra!=rb: parent[ra]=rb

slugs = list(texts.keys())
for i,a in enumerate(slugs):
    for b in slugs[i+1:]:
        if SequenceMatcher(None, texts[a], texts[b]).ratio() >= 0.85:
            union(a,b)

groups = {}
for s in slugs:
    groups.setdefault(find(s),[]).append(s)
templated = [s for g in groups.values() if len(g)>=3 for s in g]
```

## 重要

- 類似度 0.85 は経験則。breakup-*テンプレ群は0.95以上で検出される
- 個別執筆の作品同士は通常 0.3-0.5
- 3作品未満のグループはテンプレ判定しない（偶然の類似を許容）
- 報告は templatedSlugs のリストと件数のみ
