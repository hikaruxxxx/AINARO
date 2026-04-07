import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "スワイプで発見 | Novelis",
  description: "スワイプして気になる作品を見つけよう。あなたの好みを学習して、おすすめを最適化します。",
};

export default function SwipeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
