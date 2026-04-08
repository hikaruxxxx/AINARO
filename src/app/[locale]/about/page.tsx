import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("about");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function AboutPage() {
  const t = await getTranslations("about");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-text">{t("heading")}</h1>

      <div className="space-y-10 text-base leading-loose text-text">
        <section>
          <h2 className="mb-3 text-lg font-bold">{t("missionTitle")}</h2>
          <p>{t("missionBody")}</p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("dataTitle")}</h2>
          <p>{t("dataBody")}</p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("featuresTitle")}</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li><span className="font-bold">{t("feature1Title")}</span> — {t("feature1Body")}</li>
            <li><span className="font-bold">{t("feature2Title")}</span> — {t("feature2Body")}</li>
            <li><span className="font-bold">{t("feature3Title")}</span> — {t("feature3Body")}</li>
            <li><span className="font-bold">{t("feature4Title")}</span> — {t("feature4Body")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("creatorTitle")}</h2>
          <p>{t("creatorBody1")}</p>
          <p className="mt-3">{t("creatorBody2")}</p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("contactTitle")}</h2>
          <p>
            {t.rich("contactBody", {
              link: (chunks) => (
                <Link href="/contact" className="underline hover:text-text transition">{chunks}</Link>
              ),
            })}
          </p>
        </section>

        <section className="border-t border-border pt-6">
          <p className="text-muted">
            <Link href="/terms" className="underline hover:text-text transition">{t("terms")}</Link>
            {" / "}
            <Link href="/privacy" className="underline hover:text-text transition">{t("privacy")}</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
