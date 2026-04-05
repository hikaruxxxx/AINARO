import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description: "Novelisへのお問い合わせはこちら。ご意見・ご要望・不具合のご報告をお受けしています。",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-text">お問い合わせ</h1>

      <div className="space-y-8 text-sm leading-relaxed text-text">
        <section>
          <p>
            Novelisに関するご意見・ご要望・不具合のご報告は、以下の方法でお受けしています。
          </p>
        </section>

        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="mb-4 text-lg font-bold">X（旧Twitter）</h2>
          <p className="mb-3">
            DMまたはメンションにてお気軽にご連絡ください。
          </p>
          <a
            href="https://x.com/ainaro_jp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-full bg-primary px-6 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            @ainaro_jp
          </a>
        </section>

        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="mb-4 text-lg font-bold">メール</h2>
          <p className="mb-3">
            お急ぎの場合や詳細なご連絡はメールをご利用ください。
          </p>
          <a
            href="mailto:contact@ainaro.jp"
            className="inline-block rounded-full bg-primary px-6 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            contact@ainaro.jp
          </a>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">お問い合わせの前に</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted">
            <li>
              コンテンツに関する問題（不適切な表現等）は、該当作品のタイトルとエピソード番号をお知らせください。
            </li>
            <li>
              個人情報の開示・訂正・削除については、
              <Link href="/privacy" className="underline hover:text-text transition">
                プライバシーポリシー
              </Link>
              をご確認のうえご連絡ください。
            </li>
          </ul>
        </section>

        <section className="text-xs text-muted">
          <p>通常、3営業日以内にご返信いたします。</p>
        </section>
      </div>
    </div>
  );
}
