import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "発見 | Novelis",
  description: "新しい作品と出会おう",
};

export default function DiscoverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-black">
      {children}
    </div>
  );
}
