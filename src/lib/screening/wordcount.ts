// 文字数の事後チェック＋追記指示生成
// LLMに「3500字書いて」と懇願するのではなく、生成後にカウントして
// 不足分を「特定シーンを◯字追記」と決定論的に指示する。

export const TARGET_MIN = 3500;
export const TARGET_MAX = 4500;
export const MAX_APPEND_LOOPS = 2;

/** 日本語実文字数（空白・改行を除く） */
export function countChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

export interface AppendInstruction {
  needed: boolean;
  shortBy: number;
  prompt: string;
}

/** 不足量から追記プロンプトを組み立て（最も短い既知シーンに追加） */
export function buildAppendInstruction(currentText: string): AppendInstruction {
  const count = countChars(currentText);
  if (count >= TARGET_MIN) {
    return { needed: false, shortBy: 0, prompt: "" };
  }
  const shortBy = TARGET_MIN - count;
  const target = pickShortestSection(currentText);
  const prompt = `現在 ${count}字 で ${TARGET_MIN}字 に ${shortBy}字 不足しています。
本文を再生成せず、【${target}】を ${shortBy + 200}字 追記してください。
追記内容は既存の流れと矛盾せず、心情・五感・所作の描写を膨らませる方向で。`;
  return { needed: true, shortBy, prompt };
}

const SECTIONS = ["冒頭シーン", "展開シーン", "転機シーン", "引きシーン"] as const;

/** 本文中の最も短いシーンを名指しする（見つからなければ展開シーン） */
function pickShortestSection(text: string): string {
  const lengths: Array<[string, number]> = SECTIONS.map((name) => {
    const re = new RegExp(`【${name}】([\\s\\S]*?)(?=【|$)`);
    const m = text.match(re);
    return [name, m ? countChars(m[1]) : Number.MAX_SAFE_INTEGER];
  });
  lengths.sort((a, b) => a[1] - b[1]);
  const [name, len] = lengths[0];
  return len === Number.MAX_SAFE_INTEGER ? "展開シーン" : name;
}
