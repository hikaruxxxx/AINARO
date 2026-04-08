// template-detector の補助関数(他モジュールから流用するため切り出し)

const HEAD_CHARS = 500;
const NGRAM_N = 2;

export function bigramSetFromText(text: string, n = NGRAM_N): Set<string> {
  const head = text.replace(/\s/g, "").slice(0, HEAD_CHARS);
  const set = new Set<string>();
  for (let i = 0; i <= head.length - n; i++) {
    set.add(head.slice(i, i + n));
  }
  return set;
}
