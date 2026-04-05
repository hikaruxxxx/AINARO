import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: "Novelisのプライバシーポリシーです。個人情報の取り扱いについてご確認ください。",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-text">プライバシーポリシー</h1>
      <p className="mb-8 text-sm text-muted">最終更新日：2026年4月6日</p>

      <div className="space-y-8 text-sm leading-relaxed text-text">
        <section>
          <h2 className="mb-3 text-lg font-bold">1. はじめに</h2>
          <p>
            Novelis（以下「当サイト」）は、利用者のプライバシーを尊重し、個人情報の保護に努めます。本プライバシーポリシーは、当サイトにおける個人情報の取り扱いについて定めるものです。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">2. 収集する情報</h2>
          <p className="mb-3">当サイトでは、以下の情報を収集する場合があります。</p>
          <h3 className="mb-2 font-bold">2.1 自動的に収集される情報</h3>
          <ul className="mb-4 list-disc space-y-1 pl-6">
            <li>アクセスログ（IPアドレス、ブラウザ情報、アクセス日時）</li>
            <li>Cookie およびこれに類する技術による閲覧情報</li>
            <li>閲覧ページ、滞在時間等の利用状況</li>
          </ul>
          <h3 className="mb-2 font-bold">2.2 利用者が提供する情報</h3>
          <ul className="list-disc space-y-1 pl-6">
            <li>お問い合わせ時に入力されるメールアドレス、お名前等</li>
            <li>アカウント登録時の情報（将来的に機能を提供する場合）</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">3. 情報の利用目的</h2>
          <p className="mb-2">収集した情報は、以下の目的で利用します。</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>本サービスの提供・運営・改善</li>
            <li>利用状況の分析およびコンテンツの改善</li>
            <li>お問い合わせへの対応</li>
            <li>不正利用の防止</li>
            <li>新機能やサービスに関するお知らせ（利用者の同意がある場合）</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">4. Cookie（クッキー）について</h2>
          <p className="mb-3">
            当サイトでは、利用者の利便性向上およびアクセス解析のためにCookieを使用しています。
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Cookieはブラウザの設定により無効にできますが、一部の機能が利用できなくなる場合があります。</li>
            <li>当サイトではアクセス解析ツール（Google Analytics等）を利用する場合があります。これらのツールはCookieを使用してデータを収集しますが、個人を特定する情報は含まれません。</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">5. 第三者への情報提供</h2>
          <p className="mb-2">
            当サイトは、以下の場合を除き、個人情報を第三者に提供しません。
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>利用者の同意がある場合</li>
            <li>法令に基づく開示請求があった場合</li>
            <li>人の生命・身体・財産の保護のために必要であり、本人の同意を得ることが困難な場合</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">6. 情報の管理</h2>
          <p>
            当サイトは、収集した情報の漏洩・紛失・改ざんを防止するため、適切なセキュリティ対策を講じます。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">7. 外部サービス</h2>
          <p>
            当サイトでは、以下の外部サービスを利用する場合があります。各サービスのプライバシーポリシーについては、各社のサイトをご確認ください。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Google Analytics（アクセス解析）</li>
            <li>Vercel（ホスティング）</li>
            <li>Supabase（データベース・認証基盤）</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">8. 利用者の権利</h2>
          <p className="mb-2">利用者は、当サイトが保有する自身の個人情報について、以下の権利を有します。</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>開示・訂正・削除の請求</li>
            <li>利用停止の請求</li>
          </ul>
          <p className="mt-2">
            これらのご請求は、<Link href="/contact" className="underline hover:text-text transition">お問い合わせページ</Link>よりご連絡ください。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">9. ポリシーの変更</h2>
          <p>
            当サイトは、必要に応じて本ポリシーを変更することがあります。変更後のポリシーは、本サービス上に掲載した時点で効力を生じます。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">10. お問い合わせ</h2>
          <p>
            本ポリシーに関するお問い合わせは、<Link href="/contact" className="underline hover:text-text transition">お問い合わせページ</Link>よりご連絡ください。
          </p>
        </section>
      </div>
    </div>
  );
}
