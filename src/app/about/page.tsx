import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "サイト概要",
  description:
    "Novelisは「ここに来れば面白い作品に出会える」と信頼できる小説プラットフォームです。面白さで選ばれた作品だけをお届けします。",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-text">Novelisについて</h1>

      <div className="space-y-8 text-sm leading-relaxed text-text">
        <section>
          <h2 className="mb-3 text-lg font-bold">もっと面白い小説を、すべての人に</h2>
          <p>
            Novelisは、「ここに来れば面白い作品に出会える」と信頼できる場所を目指す小説プラットフォームです。大量の作品から面白いものを自力で探す必要はありません。面白さで選ばれた作品だけが並びます。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">面白さを、データで追求する</h2>
          <p>
            作品の評価基準はPV数やフォロワー数ではありません。「読者が最後まで読んだか」「続きを読みたいと思ったか」「また戻ってきたか」。読者の行動データに基づいて、面白さを測定し、改善し続けます。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">特徴</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <span className="font-bold">面白さで選ばれた作品だけ</span>
              — 品質基準を満たした作品のみを公開。量より質を徹底しています。
            </li>
            <li>
              <span className="font-bold">読書に集中できる体験</span>
              — 余計なUI要素を排除。物語への没入を最優先に設計しています。
            </li>
            <li>
              <span className="font-bold">多ジャンル配信</span>
              — 異世界ファンタジー、恋愛、ホラー、ミステリーなど幅広いジャンルをカバー。
            </li>
            <li>
              <span className="font-bold">すべて無料</span>
              — 全作品を無料でお読みいただけます。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">作り手は問わない、面白さだけを問う</h2>
          <p>
            AIで書いたか、人間が書いたか、その混合かは問いません。問うのは「読者が面白いと感じたかどうか」だけです。手段は自由、結果で評価します。
          </p>
          <p className="mt-3">
            現在の作品はAIを活用して制作し、人間が企画・監修しています。品質については読者の行動データに基づき継続的に改善を行っています。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">お問い合わせ</h2>
          <p>
            ご意見・ご要望・不具合のご報告などは、
            <Link href="/contact" className="underline hover:text-text transition">
              お問い合わせページ
            </Link>
            よりお気軽にご連絡ください。
          </p>
        </section>

        <section className="border-t border-border pt-6">
          <p className="text-muted">
            <Link href="/terms" className="underline hover:text-text transition">
              利用規約
            </Link>
            {" / "}
            <Link href="/privacy" className="underline hover:text-text transition">
              プライバシーポリシー
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
