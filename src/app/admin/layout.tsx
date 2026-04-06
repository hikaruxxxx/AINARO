import Link from "next/link";
import type { Metadata } from "next";
import { isAdmin } from "@/lib/supabase/auth";
import AdminSidebar from "./AdminSidebar";

export const metadata: Metadata = {
  title: "管理画面 | Novelis",
  robots: "noindex, nofollow",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await isAdmin();

  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <main className="flex-1 overflow-auto pl-60">
        <div className="mx-auto max-w-6xl px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
