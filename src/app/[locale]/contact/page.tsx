import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("contact");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function ContactPage() {
  const t = await getTranslations("contact");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-text">{t("heading")}</h1>

      <div className="space-y-8 text-sm leading-relaxed text-text">
        <section>
          <p>{t("intro")}</p>
        </section>

        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="mb-4 text-lg font-bold">{t("xTitle")}</h2>
          <p className="mb-3">{t("xBody")}</p>
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
          <h2 className="mb-4 text-lg font-bold">{t("emailTitle")}</h2>
          <p className="mb-3">{t("emailBody")}</p>
          <a
            href="mailto:contact@ainaro.jp"
            className="inline-block rounded-full bg-primary px-6 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            contact@ainaro.jp
          </a>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("beforeTitle")}</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted">
            <li>{t("beforeContent")}</li>
            <li>
              {t.rich("beforePrivacy", {
                link: (chunks) => (
                  <Link href="/privacy" className="underline hover:text-text transition">{chunks}</Link>
                ),
              })}
            </li>
          </ul>
        </section>

        <section className="text-xs text-muted">
          <p>{t("responseTime")}</p>
        </section>
      </div>
    </div>
  );
}
