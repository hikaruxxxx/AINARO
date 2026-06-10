#!/usr/bin/env python3
"""
量的整合性監査スクリプト (Layer 7 拡張)

quantitative_facts.yaml に対して本文を以下の観点で監査:
  1. forbidden_claims の出現 (即 fail)
  2. linguistic_red_flags の出現 (warn, 文脈評価が必要)
  3. 量的整合性 (経験値カウンタ / レベル / 4年累積) の検算
  4. narrative_invariants の侵食疑い

使い方:
  python3 scripts/generation/quantitative-audit.py {slug} {ep_number}
  例: python3 scripts/generation/quantitative-audit.py a07-novel 1

出力:
  data/generation/works/{slug}/longform/episodes/ep{N:04d}_quant_audit.json
  data/generation/works/{slug}/longform/episodes/ep{N:04d}_quant_audit.md

Exit code:
  0: PASS (違反なし or warn のみ)
  1: FAIL (forbidden_claims 違反 or 量的矛盾)
  2: ERROR (ファイル不在等)
"""

import sys
import re
import json
from pathlib import Path
from datetime import datetime

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml が必要 (pip install pyyaml)", file=sys.stderr)
    sys.exit(2)


def normalize(text: str) -> str:
    """空白・改行・全角句読点を除いた比較用文字列"""
    return re.sub(r'[、。\s「」『』（）()]+', '', text)


def collect_forbidden_claims(node, path=""):
    """再帰的に forbidden_claims を収集"""
    items = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k == 'forbidden_claims' and isinstance(v, list):
                items.extend([(path or 'root', claim) for claim in v])
            elif isinstance(v, (dict, list)):
                new_path = f"{path}.{k}" if path else k
                items.extend(collect_forbidden_claims(v, new_path))
    elif isinstance(node, list):
        for i, item in enumerate(node):
            items.extend(collect_forbidden_claims(item, f"{path}[{i}]"))
    return items


def collect_red_flags(facts):
    """linguistic_red_flags のフレーズを収集"""
    flags = []
    for category, content in facts.get('linguistic_red_flags', {}).items():
        if isinstance(content, dict) and 'items' in content:
            for item in content['items']:
                phrase = item.get('phrase', '')
                if phrase:
                    flags.append((category, phrase))
    return flags


def find_phrase_contexts(body: str, phrase: str, window: int = 40):
    """フレーズ周辺の文脈を抽出"""
    contexts = []
    for match in re.finditer(re.escape(phrase), body):
        start = max(0, match.start() - window)
        end = min(len(body), match.end() + window)
        context = body[start:end].replace('\n', ' / ').replace('　', '')
        contexts.append({
            'pos': match.start(),
            'context': context,
        })
    return contexts


def check_forbidden_claims(body: str, facts: dict):
    """forbidden_claims の出現を検出"""
    forbidden_items = collect_forbidden_claims(facts)
    violations = []
    normalized_body = normalize(body)
    for path, claim in forbidden_items:
        normalized_claim = normalize(claim)
        if normalized_claim in normalized_body:
            violations.append({
                'path': path,
                'claim': claim,
                'severity': 'FAIL',
            })
    return {
        'total_rules': len(forbidden_items),
        'violations': violations,
        'pass': len(violations) == 0,
    }


def check_linguistic_red_flags(body: str, facts: dict):
    """linguistic_red_flags の出現を検出 (warn のみ)"""
    flags = collect_red_flags(facts)
    hits = []
    for category, phrase in flags:
        contexts = find_phrase_contexts(body, phrase)
        for ctx in contexts:
            hits.append({
                'category': category,
                'phrase': phrase,
                'context': ctx['context'],
                'severity': 'WARN',
                'note': '文脈で希少優位性を侵食していないか人間確認推奨',
            })
    return {
        'total_phrases_in_dictionary': len(flags),
        'hits': hits,
        'pass': True,  # red_flag は警告のみで fail にしない
    }


def check_quantitative_growth(facts: dict, state_files: dict):
    """Fランクの4年成長の量的整合性"""
    try:
        monthly_range = facts['rates']['f_rank_monthly_addition']['range']
        months_range = facts['rates']['f_rank_level_up_interval']['range_months']
        total_4yr = facts['protagonist']['total_levels_gained_in_4_years']['value']
    except KeyError as e:
        return {
            'pass': False,
            'error': f"台帳に必要なキーがない: {e}",
        }

    years = 4
    months = years * 12
    expected_lo = months / months_range[1]
    expected_hi = months / months_range[0]

    consistent = expected_lo <= total_4yr <= expected_hi

    return {
        'pass': consistent,
        'monthly_addition_range': monthly_range,
        'months_per_level_range': months_range,
        'expected_4yr_levels': [round(expected_lo, 1), round(expected_hi, 1)],
        'actual_4yr_levels': total_4yr,
        'severity': 'PASS' if consistent else 'FAIL',
    }


def check_exp_counter_continuity(facts: dict, state_files: dict, ep_num: int):
    """経験値カウンタの連続性 (前話 → 本話)"""
    if ep_num == 1:
        return {'pass': True, 'note': 'ep1 は基準点のため省略'}

    # 本話と前話の state.json を比較
    prev_state = state_files.get(f'ep{ep_num-1:04d}_state')
    curr_state = state_files.get(f'ep{ep_num:04d}_state')
    if not prev_state or not curr_state:
        return {'pass': True, 'note': 'state.json 不在のため省略'}

    prev_lv = prev_state.get('level')
    curr_lv = curr_state.get('level')
    if prev_lv is None or curr_lv is None:
        return {'pass': True, 'note': 'level 未記録'}

    if curr_lv < prev_lv:
        return {
            'pass': False,
            'severity': 'FAIL',
            'error': f"レベル後退検出: ep{ep_num-1}={prev_lv} → ep{ep_num}={curr_lv}",
        }
    return {
        'pass': True,
        'prev_level': prev_lv,
        'curr_level': curr_lv,
        'level_delta': curr_lv - prev_lv,
    }


def check_text_numerical_claims(body: str, facts: dict):
    """本文中の数値主張を抽出して台帳と照合 (基本的なもののみ)"""
    findings = []

    # 主人公の現在レベル主張
    lv_pattern = re.compile(r'レベル[:：]\s*(\d+)|レベル[一二三四五六七八九十]+')
    for match in lv_pattern.finditer(body):
        findings.append({
            'type': 'level_mention',
            'context': body[max(0, match.start()-20):min(len(body), match.end()+20)].replace('\n', ' '),
        })

    # 4年で動いた数字
    if '四年で動いた数字はレベル' in body:
        # 「四年で動いた数字はレベル二つぶんだけ」のようなパターン
        m = re.search(r'四年で動いた数字はレベル[一二三四五六七]+(つ|本|レベル)', body)
        if m:
            text_to_num = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6}
            num_chars = re.findall(r'[一二三四五六]', m.group())
            if num_chars:
                claimed = text_to_num.get(num_chars[0], 0)
                expected = facts['protagonist']['total_levels_gained_in_4_years']['value']
                if claimed != expected:
                    findings.append({
                        'type': 'level_4yr_mismatch',
                        'severity': 'FAIL',
                        'claimed': claimed,
                        'expected': expected,
                        'context': m.group(),
                    })

    return {
        'pass': not any(f.get('severity') == 'FAIL' for f in findings),
        'findings': findings,
    }


def main():
    if len(sys.argv) != 3:
        print("使い方: python3 quantitative-audit.py {slug} {ep_number}", file=sys.stderr)
        sys.exit(2)

    slug = sys.argv[1]
    ep_num = int(sys.argv[2])

    base = Path(f'data/generation/works/{slug}/longform')
    if not base.exists():
        print(f"ERROR: longform directory not found: {base}", file=sys.stderr)
        sys.exit(2)

    facts_path = base / 'world_bible' / 'quantitative_facts.yaml'
    if not facts_path.exists():
        print(f"ERROR: quantitative_facts.yaml not found: {facts_path}", file=sys.stderr)
        print("  Phase A の台帳を先に作成してください", file=sys.stderr)
        sys.exit(2)

    with open(facts_path, 'r') as f:
        facts = yaml.safe_load(f)

    ep_path = base / 'episodes' / f'ep{ep_num:04d}.md'
    if not ep_path.exists():
        print(f"ERROR: ep file not found: {ep_path}", file=sys.stderr)
        sys.exit(2)

    with open(ep_path, 'r') as f:
        content = f.read()
    body = content.split('---\n', 1)[-1] if '---' in content else content

    # state files
    state_files = {}
    for n in range(1, ep_num + 1):
        sp = base / 'episodes' / f'ep{n:04d}_state.json'
        if sp.exists():
            with open(sp, 'r') as f:
                state_files[f'ep{n:04d}_state'] = json.load(f)

    # 検査実行
    report = {
        'slug': slug,
        'episode': ep_num,
        'audited_at': datetime.now().isoformat(),
        'checks': {
            'forbidden_claims': check_forbidden_claims(body, facts),
            'linguistic_red_flags': check_linguistic_red_flags(body, facts),
            'quantitative_growth': check_quantitative_growth(facts, state_files),
            'exp_counter_continuity': check_exp_counter_continuity(facts, state_files, ep_num),
            'text_numerical_claims': check_text_numerical_claims(body, facts),
        },
    }

    # 総合判定
    fails = [k for k, v in report['checks'].items() if not v.get('pass', True)]
    if fails:
        report['judgment'] = 'FAIL'
        report['failed_checks'] = fails
        exit_code = 1
    else:
        warns = report['checks']['linguistic_red_flags']['hits']
        if warns:
            report['judgment'] = 'PASS_WITH_WARN'
            report['warn_count'] = len(warns)
        else:
            report['judgment'] = 'PASS'
        exit_code = 0

    # 保存 (JSON)
    json_path = base / 'episodes' / f'ep{ep_num:04d}_quant_audit.json'
    with open(json_path, 'w') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    # 保存 (Markdown サマリ)
    md_lines = [
        f"# ep{ep_num} 量的整合性監査レポート",
        "",
        f"判定: **{report['judgment']}**",
        f"監査日時: {report['audited_at']}",
        "",
        "## チェック結果",
        "",
    ]
    for check_name, check_result in report['checks'].items():
        status = '✅ PASS' if check_result.get('pass', True) else '❌ FAIL'
        md_lines.append(f"### {check_name}: {status}")
        md_lines.append("")
        if check_name == 'forbidden_claims':
            md_lines.append(f"- ルール数: {check_result['total_rules']}")
            md_lines.append(f"- 違反: {len(check_result['violations'])}件")
            for v in check_result['violations']:
                md_lines.append(f"  - [{v['path']}] 「{v['claim']}」")
        elif check_name == 'linguistic_red_flags':
            md_lines.append(f"- 辞書フレーズ数: {check_result['total_phrases_in_dictionary']}")
            md_lines.append(f"- ヒット: {len(check_result['hits'])}件 (文脈確認推奨)")
            for h in check_result['hits'][:5]:
                md_lines.append(f"  - [{h['category']}] 「{h['phrase']}」: ...{h['context']}...")
        elif check_name == 'quantitative_growth':
            md_lines.append(f"- 月間加算範囲: {check_result.get('monthly_addition_range')}")
            md_lines.append(f"- レベル間隔範囲: {check_result.get('months_per_level_range')}ヶ月")
            md_lines.append(f"- 4年で予想されるレベル数: {check_result.get('expected_4yr_levels')}")
            md_lines.append(f"- 実績: {check_result.get('actual_4yr_levels')} レベル")
            if not check_result.get('pass'):
                md_lines.append(f"  ⚠️ 範囲外: {check_result.get('error', '')}")
        elif check_name == 'exp_counter_continuity':
            if 'note' in check_result:
                md_lines.append(f"- {check_result['note']}")
            else:
                md_lines.append(f"- ep{ep_num-1}: Lv{check_result.get('prev_level')} → ep{ep_num}: Lv{check_result.get('curr_level')} (Δ={check_result.get('level_delta')})")
        elif check_name == 'text_numerical_claims':
            md_lines.append(f"- 検出された数値主張: {len(check_result.get('findings', []))}件")
            for f in check_result.get('findings', []):
                sev = f.get('severity', 'INFO')
                md_lines.append(f"  - [{sev}] {f.get('type')}: {f.get('context', '')[:60]}")
        md_lines.append("")

    md_path = base / 'episodes' / f'ep{ep_num:04d}_quant_audit.md'
    with open(md_path, 'w') as f:
        f.write('\n'.join(md_lines))

    print(f"=== 量的整合性監査: ep{ep_num} ===")
    print(f"判定: {report['judgment']}")
    if fails:
        print(f"FAIL: {', '.join(fails)}")
    if report['checks']['linguistic_red_flags']['hits']:
        print(f"WARN: red_flag {len(report['checks']['linguistic_red_flags']['hits'])}件")
    print(f"レポート: {md_path}")
    print(f"JSON: {json_path}")

    sys.exit(exit_code)


if __name__ == '__main__':
    main()
