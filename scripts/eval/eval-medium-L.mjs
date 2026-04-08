import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

const env = fs.readFileSync("/Users/hikarumori/Developer/AINARO/.env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const client = new Anthropic();
const data = JSON.parse(
  fs.readFileSync(
    "/Users/hikarumori/Developer/AINARO/data/experiments/bradley-terry/test-medium-clean.json",
    "utf8"
  )
);
const pairs = data.pairs;
const outPath =
  "/Users/hikarumori/Developer/AINARO/data/experiments/bradley-terry/medium-L-results.json";

const SYSTEM = `あなたはWeb小説レーベルの編集長です。年間500作品以上を読み、書籍化候補を選定してきました。

2つの作品を読み比べてください。

あなたの経験則:
- 冒頭3行で読者の半数が離脱する。最初の掴みが全て
- テンプレ作品でも「上手いテンプレ」は売れる。下手なオリジナルより上手いテンプレ
- 主人公のキャラが立っているかが最重要。設定は二の次
- 読みやすさはスマホ基準。長い地の文、改行なし、ステータス羅列は致命的
- 感情が動く瞬間が第1話に1回でもあれば読者は次を読む

警告: AIとして「文学的に優れた方」を選びたくなるバイアスがあります。それを抑えてください。なろう読者は文学賞の審査員ではありません。「読んでいて気持ちいい方」を選んでください。

どちらがより多くの読者を獲得するか予測してください。
AまたはBで回答。`;

const results = [];
// resume if exists
if (fs.existsSync(outPath)) {
  try {
    const prev = JSON.parse(fs.readFileSync(outPath, "utf8"));
    if (Array.isArray(prev)) results.push(...prev);
  } catch {}
}
const doneIds = new Set(results.map((r) => r.id));

async function evalPair(pair, id) {
  const userMsg = `【作品A】\nタイトル: ${pair.story_a}\n\n${pair.ep1_a}\n\n---\n\n【作品B】\nタイトル: ${pair.story_b}\n\n${pair.ep1_b}`;
  const resp = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 10,
    system: SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });
  const text = resp.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");
  const m = text.match(/[AB]/);
  return m ? m[0] : "A";
}

const tasks = [];
for (let i = 0; i < pairs.length; i++) {
  if (doneIds.has(i)) continue;
  const p = pairs[i];
  if (!p.ep1_a || !p.ep1_b) continue;
  if (p.ep1_a.length < 500 || p.ep1_b.length < 500) continue;
  tasks.push(i);
}

console.log(`Tasks to run: ${tasks.length}`);

const CONCURRENCY = 8;
let idx = 0;
async function worker() {
  while (idx < tasks.length) {
    const myIdx = idx++;
    const id = tasks[myIdx];
    try {
      const r = await evalPair(pairs[id], id);
      results.push({ id, result: r });
      if (results.length % 5 === 0) {
        results.sort((a, b) => a.id - b.id);
        fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
        console.log(`saved ${results.length}`);
      }
    } catch (e) {
      console.error(`id=${id} err`, e.message);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
results.sort((a, b) => a.id - b.id);
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`done ${results.length}`);
