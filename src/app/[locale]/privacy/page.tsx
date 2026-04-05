import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("privacy");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-text">{t("heading")}</h1>
      <p className="mb-8 text-sm text-muted">{t("lastUpdated")}</p>

      <div className="space-y-8 text-sm leading-relaxed text-text">
        <section>
          <h2 className="mb-3 text-lg font-bold">{t("s1Title")}</h2>
          <p>{t("s1Body")}</p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("s2Title")}</h2>
          <p className="mb-3">{t("s2Intro")}</p>
          <h3 className="mb-2 font-bold">{t("s2aTitle")}</h3>
          <ul className="mb-4 list-disc space-y-1 pl-6">
            <li>{t("s2a1")}</li>
            <li>{t("s2a2")}</li>
            <li>{t("s2a3")}</li>
          </ul>
          <h3 className="mb-2 font-bold">{t("s2bTitle")}</h3>
          <ul className="list-disc space-y-1 pl-6">
            <li>{t("s2b1")}</li>
            <li>{t("s2b2")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("s3Title")}</h2>
          <p className="mb-2">{t("s3Intro")}</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>{t("s3a")}</li>
            <li>{t("s3b")}</li>
            <li>{t("s3c")}</li>
            <li>{t("s3d")}</li>
            <li>{t("s3e")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("s4Title")}</h2>
          <p className="mb-3">{t("s4Body")}</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>{t("s4a")}</li>
            <li>{t("s4b")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("s5Title")}</h2>
          <p className="mb-2">{t("s5Body")}</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>{t("s5a")}</li>
            <li>{t("s5b")}</li>
            <li>{t("s5c")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("s6Title")}</h2>
          <p>{t("s6Body")}</p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("s7Title")}</h2>
          <p>{t("s7Body")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>{t("s7a")}</li>
            <li>{t("s7b")}</li>
            <li>{t("s7c")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("s8Title")}</h2>
          <p className="mb-2">{t("s8Intro")}</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>{t("s8a")}</li>
            <li>{t("s8b")}</li>
          </ul>
          <p className="mt-2">
            {t.rich("s8Contact", {
              link: (chunks) => <Link href="/contact" className="underline hover:text-text transition">{chunks}</Link>,
            })}
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("s9Title")}</h2>
          <p>{t("s9Body")}</p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">{t("s10Title")}</h2>
          <p>
            {t.rich("s10Body", {
              link: (chunks) => <Link href="/contact" className="underline hover:text-text transition">{chunks}</Link>,
            })}
          </p>
        </section>
      </div>
    </div>
  );
}
