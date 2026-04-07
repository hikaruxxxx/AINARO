import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getTermsContent } from "./content";

export async function generateMetadata() {
  const locale = await getLocale();
  const t = getTermsContent(locale);
  return { title: t.metaTitle, description: t.metaDescription };
}

export default async function TermsPage() {
  const locale = await getLocale();
  const t = getTermsContent(locale);

  // 権利侵害申立窓口の文中リンクを差し込む
  const [contactBefore = "", contactAfter = ""] = t.contactNotice.split("{link}");
  const contactLinkLabel = locale === "en" ? "our contact form" : "お問い合わせフォーム";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-4 text-2xl font-bold text-text">{t.heading}</h1>
      <p className="mb-8 text-sm text-muted">{t.lastUpdated}</p>

      <p className="mb-8 text-sm leading-relaxed text-text">{t.preamble}</p>

      <div className="space-y-8 text-sm leading-relaxed text-text">
        {t.articles.map((article) => (
          <section key={article.title}>
            <h2 className="mb-3 text-lg font-bold">{article.title}</h2>
            {article.body && <p>{article.body}</p>}
            {article.intro && <p className="mb-2">{article.intro}</p>}
            {article.items && (
              <ol className="list-decimal space-y-2 pl-6">
                {article.items.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ol>
            )}
            {article.trailing && <p className="mt-3">{article.trailing}</p>}
          </section>
        ))}

        <section>
          <p>
            {contactBefore}
            <Link href="/contact" className="underline hover:text-text transition">
              {contactLinkLabel}
            </Link>
            {contactAfter}
          </p>
        </section>

        <p className="pt-4 text-right text-xs text-muted">{t.closing}</p>
      </div>
    </div>
  );
}
