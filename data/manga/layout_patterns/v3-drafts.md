# layout-patterns v3 Drafts (Phase 2)

採寸単位: 1 unit ≈ 0.14mm (page_dimensions: 1748 × 2480)
page_margin: 60 / page_gutter: 20

---

## pat_071_ellipse_power_activation (page_0040)

```json
{
  "id": "pat_071_ellipse_power_activation",
  "name": "楕円バブル発動",
  "panel_count": 2,
  "page_role_hints": ["power_activation", "skill_invocation", "transformation"],
  "subtype_hints": [],
  "purpose_summary": "上段 establishing で静→下段楕円で力の発動を視覚化。楕円 panel そのものがエネルギー表現として機能",
  "trigger_conditions": "page_role∈{power_activation, skill_invocation, transformation} かつ panel_count==2 かつ size_hierarchy_extreme",
  "frequency": "rare",
  "example_pages": [40],
  "features": ["楕円_panel", "size_hierarchy_extreme", "panel_自体がエネルギー表現"],
  "slots": [
    {
      "slot_id": "s1",
      "reading_order": 1,
      "role_hint": "establishing_static",
      "size_class": "large",
      "polygon": [[60,60],[1688,60],[1688,1240],[60,1240]],
      "is_borderless": false,
      "bleed": false,
      "background_treatment": "detailed_bg"
    },
    {
      "slot_id": "s2",
      "reading_order": 2,
      "role_hint": "power_burst_close",
      "size_class": "extra_large",
      "polygon": [[870,1260],[1442,1430],[1680,1840],[1442,2250],[870,2420],[298,2250],[60,1840],[298,1430]],
      "is_borderless": false,
      "bleed": false,
      "background_treatment": "atmospheric_fade"
    }
  ]
}
```

採寸根拠 (page_0040):
- 上段 rect: 全幅 (60-1688), 上端 60, 下端 ≈1240 (建物 establishing + キャラ全身)
- 下段 楕円: 中心 ≈(870, 1840), 横半径 810, 縦半径 580 を 8頂点 octagon で近似
  - 上 (870,1260) / 右上 (1442,1430) / 右 (1680,1840) / 右下 (1442,2250) / 下 (870,2420) / 左下 (298,2250) / 左 (60,1840) / 左上 (298,1430)
- gutter: 上段下端 1240、楕円上端 1260 = 20 ✓

---

## pat_072_trapezoid_supernatural_reveal (page_0041)

```json
{
  "id": "pat_072_trapezoid_supernatural_reveal",
  "name": "斜め台形パース_異変出現",
  "panel_count": 2,
  "page_role_hints": ["reveal_supernatural", "hook", "anomaly_appearance"],
  "subtype_hints": [],
  "purpose_summary": "上段の地面/構造が斜めパースで出現、下段で reaction face。台形そのものが「世界に裂け目が入った」異変を表現",
  "trigger_conditions": "page_role∈{reveal_supernatural, anomaly_appearance, hook} かつ panel_count==2 かつ perspective_shift",
  "frequency": "rare",
  "example_pages": [41],
  "features": ["台形_panel", "perspective_distortion", "size_hierarchy_extreme"],
  "slots": [
    {
      "slot_id": "s1",
      "reading_order": 1,
      "role_hint": "anomaly_perspective",
      "size_class": "large",
      "polygon": [[350,60],[1280,60],[1640,1530],[80,1530]],
      "is_borderless": false,
      "bleed": false,
      "background_treatment": "detailed_bg"
    },
    {
      "slot_id": "s2",
      "reading_order": 2,
      "role_hint": "reaction_face",
      "size_class": "medium",
      "polygon": [[60,1550],[1688,1550],[1688,2420],[60,2420]],
      "is_borderless": false,
      "bleed": false,
      "background_treatment": "atmospheric_fade"
    }
  ]
}
```

採寸根拠 (page_0041):
- 上段 台形: 上辺 x=350-1280 (短)、下辺 x=80-1640 (長)、上端 y=60、下端 y=1530
  - 4頂点: (350,60) (1280,60) (1640,1530) (80,1530)
- 下段 rect: y=1550-2420、x=60-1688 (キャラ顔 close-up + 反応)
- gutter: 1530→1550 = 20 ✓
- 上段 trapezoid は **non-rect**: x座標が 4 角で全て異なる (350 / 1280 / 1640 / 80)

---

## pat_073_diagonal_split_face_establishing (page_0048)

```json
{
  "id": "pat_073_diagonal_split_face_establishing",
  "name": "斜め分断_顔と establishing",
  "panel_count": 2,
  "page_role_hints": ["reveal_location", "cliffhanger", "ominous_arrival"],
  "subtype_hints": [],
  "purpose_summary": "page を斜め境界で 2 polygon に分割。一方に主人公の顔 close (内面) + 他方に obscure な establishing (外的危険) を同時提示。境界の傾きが「踏み込めない異界」感を作る",
  "trigger_conditions": "page_role∈{reveal_location, cliffhanger, ominous_arrival} かつ panel_count==2 かつ symbolic_split かつ confrontational_distance",
  "frequency": "rare",
  "example_pages": [48],
  "features": ["斜め分断_polygon", "panel_count_2", "internal_external_contrast"],
  "slots": [
    {
      "slot_id": "s1",
      "reading_order": 1,
      "role_hint": "external_establishing",
      "size_class": "large",
      "polygon": [[1115,60],[1688,60],[1688,2420],[615,2420]],
      "is_borderless": false,
      "bleed": false,
      "background_treatment": "detailed_bg"
    },
    {
      "slot_id": "s2",
      "reading_order": 2,
      "role_hint": "internal_face_close",
      "size_class": "large",
      "polygon": [[60,60],[1095,60],[595,2420],[60,2420]],
      "is_borderless": false,
      "bleed": false,
      "background_treatment": "atmospheric_fade"
    }
  ]
}
```

採寸根拠 (page_0048):
- 境界線: 上端 (y=60) で x≈1105、下端 (y=2420) で x≈605 を中心に走る対角線 (左下→右上方向)
- gutter 20 unit を斜め線の両側に確保
- s1 (右 establishing, RTL 読み順 1): trapezoid (1115,60) (1688,60) (1688,2420) (615,2420)
- s2 (左 face close, RTL 読み順 2): trapezoid (60,60) (1095,60) (595,2420) (60,2420)
- 両 polygon とも **non-rect** (4 頂点 trapezoid、x座標が全て異なる)

---

## pat_074_silhouette_polygon_threat_reveal (page_0054) — 却下

Phase 2 採寸時の再視認で、page_0054 の右半分は **panel 境界が polygon で閉じていない**:
- 左半分: rect 4-5 個の縦並び (各 panel 右辺は x≈840-870 で揃う)
- 右半分: ゴブリン群 + ×3 ラベルが page 右半分に **borderless atmospheric** で描かれる、polygon 境界線なし

これは pat_011 (L字 inset) のような明確 polygon ではなく、**rect 並列 + 右半分 borderless background**。memory「panel 境界とオブジェクト描画を混同しない」「archetype 設計は実物抽出必須」に照らし、Phase 2 で **却下**。

代わりに「left rect strip 4 + right borderless atmospheric large」として既存 archetype と統合できる可能性があるが、本 v3 では新規追加せず。

---

## pat_075_slash_polygon_combat (page_0137)

```json
{
  "id": "pat_075_slash_polygon_combat",
  "name": "斜め切り欠き_slash combat",
  "panel_count": 4,
  "page_role_hints": ["action_climax", "slash_combat", "impact_moment"],
  "subtype_hints": [],
  "purpose_summary": "上段 2 polygon を斜め境界で分割し、刀の slash の方向性を panel 境界そのもので表現。中段に impact atmospheric、下段で結果 close",
  "trigger_conditions": "page_role∈{action_climax, slash_combat, impact_moment} かつ panel_count==4 かつ slash_directional",
  "frequency": "rare-medium",
  "example_pages": [137],
  "features": ["斜め切り欠き_polygon", "slash_directionality", "atmospheric_impact_middle", "result_close_bottom"],
  "slots": [
    {
      "slot_id": "s1",
      "reading_order": 1,
      "role_hint": "slash_aftermath",
      "size_class": "large",
      "polygon": [[800,60],[1688,60],[1688,1000],[1100,1000]],
      "is_borderless": false,
      "bleed": false,
      "background_treatment": "atmospheric_fade"
    },
    {
      "slot_id": "s2",
      "reading_order": 2,
      "role_hint": "slash_origin",
      "size_class": "small",
      "polygon": [[60,60],[800,60],[1100,1000],[60,1000]],
      "is_borderless": false,
      "bleed": false,
      "background_treatment": "atmospheric_fade"
    },
    {
      "slot_id": "s3",
      "reading_order": 3,
      "role_hint": "impact_atmospheric",
      "size_class": "large",
      "polygon": [[60,1020],[1688,1020],[1688,1700],[60,1700]],
      "is_borderless": false,
      "bleed": true,
      "background_treatment": "atmospheric_fade"
    },
    {
      "slot_id": "s4",
      "reading_order": 4,
      "role_hint": "result_close",
      "size_class": "medium",
      "polygon": [[60,1720],[1688,1720],[1688,2420],[60,2420]],
      "is_borderless": false,
      "bleed": false,
      "background_treatment": "atmospheric_fade"
    }
  ]
}
```

採寸根拠 (page_0137):
- 上段 (y=60-1000): 斜め境界で 2 polygon に分割。境界線 上端 x≈800、下端 (y=1000) x≈1100 (左下→右上方向の斜め)
- s1 (上段右大、RTL 1): 4頂点 trapezoid (800,60)(1688,60)(1688,1000)(1100,1000)
- s2 (上段左小、RTL 2): 4頂点 trapezoid (60,60)(800,60)(1100,1000)(60,1000)
- 上段 2 polygon は **境界共有** (gutter なし、商業漫画の slash 演出典型)
- s3 (中段 1020-1700): rect、bleed=true (魔物 silhouette が上下に越境する atmospheric)
- s4 (下段 1720-2420): rect、close-up
- s1/s2 共に **non-rect** trapezoid

---

## pat_076_l_shape_repeat_item_explanation (page_0145)

```json
{
  "id": "pat_076_l_shape_repeat_item_explanation",
  "name": "L字反復_item_explanation",
  "panel_count": 6,
  "page_role_hints": ["item_explanation", "transaction_demonstration", "loot_inspection"],
  "subtype_hints": ["gacha_ui", "external_social"],
  "purpose_summary": "中段+下段で同じ L字 inset 構造を反復し、複数アイテムの説明を等価リズムで畳みかける。pat_011 (中段のみ L字) の派生で、説明密度が高く demonstration_beat が 2 連続するシーン専用",
  "trigger_conditions": "page_role∈{item_explanation, transaction_demonstration, loot_inspection} かつ panel_count==6 かつ repeated_demonstration_beat>=2",
  "frequency": "rare",
  "example_pages": [145],
  "features": ["L字反復_panel", "中下段_対称", "item_caption_inset", "demonstration_rhythm"],
  "slots": [
    {
      "slot_id": "s1",
      "reading_order": 1,
      "role_hint": "establishing_dialogue",
      "size_class": "medium",
      "polygon": [[864,60],[1688,60],[1688,700],[864,700]],
      "is_borderless": false,
      "bleed": false,
      "background_treatment": "atmospheric_fade"
    },
    {
      "slot_id": "s2",
      "reading_order": 2,
      "role_hint": "hero_pose",
      "size_class": "medium",
      "polygon": [[60,60],[844,60],[844,700],[60,700]],
      "is_borderless": false,
      "bleed": false,
      "background_treatment": "atmospheric_fade"
    },
    {
      "slot_id": "s3",
      "reading_order": 3,
      "role_hint": "main_demonstration_1",
      "size_class": "large",
      "polygon": [[60,720],[1688,720],[1688,1500],[480,1500],[480,1180],[60,1180]],
      "is_borderless": false,
      "bleed": false,
      "shape_type": "L_shape",
      "background_treatment": "detailed_bg"
    },
    {
      "slot_id": "s4",
      "reading_order": 4,
      "role_hint": "item_caption_inset_1",
      "size_class": "small",
      "polygon": [[60,1200],[460,1200],[460,1500],[60,1500]],
      "is_borderless": false,
      "bleed": false,
      "background_treatment": "tone_back"
    },
    {
      "slot_id": "s5",
      "reading_order": 5,
      "role_hint": "main_demonstration_2",
      "size_class": "large",
      "polygon": [[60,1520],[1688,1520],[1688,2420],[480,2420],[480,2080],[60,2080]],
      "is_borderless": false,
      "bleed": false,
      "shape_type": "L_shape",
      "background_treatment": "detailed_bg"
    },
    {
      "slot_id": "s6",
      "reading_order": 6,
      "role_hint": "item_caption_inset_2",
      "size_class": "small",
      "polygon": [[60,2100],[460,2100],[460,2420],[60,2420]],
      "is_borderless": false,
      "bleed": false,
      "background_treatment": "tone_back"
    }
  ]
}
```

採寸根拠 (page_0145):
- 上段 (y=60-700): rect 並列 2 個 (s1 右上, s2 左上)
- 中段 (y=720-1500): L字 inset 構造
  - s3 大 L字 cutout: 6頂点 (60,720) (1688,720) (1688,1500) (480,1500) (480,1180) (60,1180) — 左下 cutout
  - s4 小 inset rect: (60,1200) (460,1200) (460,1500) (60,1500) — L字の cutout に嵌込、gutter 20
- 下段 (y=1520-2420): 中段と同型の L字 inset 構造を反復
  - s5 大 L字 cutout: 6頂点 (60,1520) (1688,1520) (1688,2420) (480,2420) (480,2080) (60,2080)
  - s6 小 inset rect: (60,2100) (460,2100) (460,2420) (60,2420)
- pat_011 との差別化: pat_011 は **中段のみ** L字 inset (下段は通常 rect 並列)、pat_076 は **中段+下段の両方** L字 inset 反復


