import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import BottomNav from "@/components/layout/BottomNav";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
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

export const metadata: Metadata = {
  title: {
    default: `${siteName} — もっと面白い小説を、すべての人に`,
    template: `%s | ${siteName}`,
  },
  description:
    "面白さで選ばれた小説だけが並ぶ場所。異世界ファンタジー、恋愛、ホラーなど多ジャンル配信中。",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: siteName,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} h-full`} style={{ colorScheme: "light" }}>
      <body className="min-h-full flex flex-col bg-bg font-[family-name:var(--font-noto-sans-jp)] antialiased">
        <Header />
        <main className="flex-1 pb-14 md:pb-0">{children}</main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}
