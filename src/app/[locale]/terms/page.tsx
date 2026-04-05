import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("terms");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function TermsPage() {
  const t = await getTranslations("terms");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-text">{t("heading")}</h1>
      <p className="mb-8 text-sm text-muted">{t("lastUpdated")}</p>

      <div className="space-y-8 text-sm leading-relaxed text-text">
        <section>
          <h2 className="mb-3 text-lg font-bold">{t("a1Title")}</h2>
          <p>{t("a1Body")}</p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("a2Title")}</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>{t("a2a")}</li>
            <li>{t("a2b")}</li>
            <li>{t("a2c")}</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("a3Title")}</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>{t("a3a")}</li>
            <li>{t("a3b")}</li>
            <li>{t("a3c")}</li>
            <li>{t("a3d")}</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("a4Title")}</h2>
          <p className="mb-2">{t("a4Intro")}</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>{t("a4a")}</li>
            <li>{t("a4b")}</li>
            <li>{t("a4c")}</li>
            <li>{t("a4d")}</li>
            <li>{t("a4e")}</li>
            <li>{t("a4f")}</li>
            <li>{t("a4g")}</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("a5Title")}</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>{t("a5a")}</li>
            <li>{t("a5b")}</li>
            <li>{t("a5c")}</li>
            <li>
              {t.rich("a5d", {
                link: (chunks) => <Link href="/contact" className="underline hover:text-text transition">{chunks}</Link>,
              })}
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("a6Title")}</h2>
          <p>{t("a6Body")}</p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("a7Title")}</h2>
          <p>{t("a7Body")}</p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("a8Title")}</h2>
          <p>{t("a8Body")}</p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("a9Title")}</h2>
          <p>{t("a9Body")}</p>
        </section>
      </div>
    </div>
  );
}
