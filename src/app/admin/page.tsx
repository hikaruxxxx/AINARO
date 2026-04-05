import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/auth";

export default async function AdminIndexPage() {
  await requireAdmin();
  redirect("/admin/novels");
}
