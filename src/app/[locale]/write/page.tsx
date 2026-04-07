import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("write");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function WritePage() {
  const t = await getTranslations("write");

  const features = [
    {
      icon: (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
      ),
      title: t("featureAITitle"),
      description: t("featureAIDesc"),
    },
    {
      icon: (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
      title: t("featureDataTitle"),
      description: t("featureDataDesc"),
    },
    {
      icon: (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
        </svg>
      ),
      title: t("featureRevenueTitle"),
      description: t("featureRevenueDesc"),
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* ヒーロー（シンプルな白基調） */}
      <section className="border-b border-gray-100 bg-white pb-14 pt-16 text-center md:pb-20 md:pt-24">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="mb-5 whitespace-pre-line text-3xl font-extrabold leading-tight tracking-tight text-gray-900 md:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mb-8 text-base leading-relaxed text-gray-600 md:text-lg">
            {t("heroSubtitle")}
          </p>
          <Link
            href="/write/apply"
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-8 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
          >
            {t("ctaButton")}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* 特徴3つ */}
      <section className="mx-auto max-w-5xl px-6 py-16 md:py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="mb-4 text-indigo-600">{f.icon}</div>
              <h3 className="mb-2 text-lg font-bold text-gray-900">{f.title}</h3>
              <p className="text-sm leading-relaxed text-gray-600">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 最終CTA */}
      <section className="mx-auto max-w-2xl px-6 pb-20 text-center">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 md:p-12">
          <h2 className="mb-3 text-2xl font-bold text-gray-900 md:text-3xl">
            {t("ctaTitle")}
          </h2>
          <p className="mb-6 text-sm text-gray-600 md:text-base">
            {t("ctaSubtitle")}
          </p>
          <Link
            href="/write/apply"
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-8 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
          >
            {t("ctaButton")}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  );
}
