import type { Viewport } from "next";
import { Noto_Sans_JP, Inter } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { locales } from "@/i18n/config";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Novelis";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  colorScheme: "light",
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    title: {
      default: `${siteName} — ${t("siteTagline")}`,
      template: `%s | ${siteName}`,
    },
    description: t("siteDescription"),
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default" as const,
      title: siteName,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!hasLocale(locales, locale)) {
    notFound();
  }

  const messages = (await import(`@/messages/${locale}.json`)).default;

  // 日本語ならNoto Sans JP優先、英語ならInter優先
  const fontClass = locale === "ja"
    ? "font-[family-name:var(--font-noto-sans-jp)]"
    : "font-[family-name:var(--font-inter)]";

  return (
    <html lang={locale} className={`${notoSansJP.variable} ${inter.variable} h-full`} style={{ colorScheme: "light" }}>
      <body className={`min-h-full flex flex-col bg-bg ${fontClass} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
