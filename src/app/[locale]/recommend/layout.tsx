import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "おすすめ | Novelis",
  description: "あなたの好みに合った作品をおすすめします",
};

export default function RecommendLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black">
      {children}
    </div>
  );
}
