import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "利用規約",
  description: "Novelisの利用規約です。本サービスをご利用いただく前に必ずお読みください。",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-text">利用規約</h1>
      <p className="mb-8 text-sm text-muted">最終更新日：2026年4月6日</p>

      <div className="space-y-8 text-sm leading-relaxed text-text">
        <section>
          <h2 className="mb-3 text-lg font-bold">第1条（適用）</h2>
          <p>
            本利用規約（以下「本規約」）は、Novelis（以下「当サイト」）が提供するすべてのサービス（以下「本サービス」）の利用条件を定めるものです。利用者の皆さまには、本規約に同意いただいたうえで本サービスをご利用いただきます。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">第2条（定義）</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>「本サービス」とは、当サイトが運営するWebサイトおよび関連するすべてのサービスを指します。</li>
            <li>「利用者」とは、本サービスを利用するすべての方を指します。</li>
            <li>「コンテンツ」とは、本サービス上で公開される小説、イラスト、その他のテキスト・画像等を指します。</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">第3条（コンテンツについて）</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>当サイトで公開されるコンテンツは、AI（人工知能）を活用して制作されています。</li>
            <li>コンテンツの著作権は、当サイト運営者に帰属します。</li>
            <li>コンテンツはフィクションであり、実在の人物・団体・事件とは一切関係ありません。</li>
            <li>利用者は、個人的な閲覧の目的に限り、コンテンツを利用できます。コンテンツの無断転載・複製・改変・再配布は禁止します。</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">第4条（禁止事項）</h2>
          <p className="mb-2">利用者は、以下の行為を行ってはなりません。</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>法令または公序良俗に違反する行為</li>
            <li>本サービスの運営を妨害する行為</li>
            <li>他の利用者または第三者の権利を侵害する行為</li>
            <li>コンテンツの無断転載・複製・改変・再配布</li>
            <li>スクレイピング、クローリング等による大量のデータ取得</li>
            <li>本サービスのセキュリティを脅かす行為</li>
            <li>その他、運営者が不適切と判断する行為</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">第5条（免責事項）</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>当サイトは、コンテンツの正確性・完全性・有用性について保証しません。</li>
            <li>当サイトは、本サービスの利用により生じたいかなる損害についても責任を負いません。</li>
            <li>当サイトは、予告なくサービスの内容を変更、または提供を中断・終了することがあります。</li>
            <li>AI生成コンテンツの特性上、意図しない表現が含まれる可能性があります。問題のある表現を発見した場合は、<Link href="/contact" className="underline hover:text-text transition">お問い合わせ</Link>よりご連絡ください。</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">第6条（知的財産権）</h2>
          <p>
            本サービスに関する知的財産権は、すべて当サイト運営者または正当な権利者に帰属します。本規約に基づく本サービスの利用許諾は、知的財産権の使用許諾を意味するものではありません。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">第7条（リンク）</h2>
          <p>
            本サービスには、外部サイトへのリンクが含まれる場合があります。外部サイトの内容について当サイトは一切の責任を負いません。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">第8条（規約の変更）</h2>
          <p>
            当サイトは、必要に応じて本規約を変更できるものとします。変更後の規約は、本サービス上に掲載した時点で効力を生じます。変更後に本サービスを利用した場合、変更後の規約に同意したものとみなします。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">第9条（準拠法・管轄）</h2>
          <p>
            本規約の解釈にあたっては日本法を準拠法とします。本サービスに関する紛争については、運営者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
          </p>
        </section>
      </div>
    </div>
  );
}
