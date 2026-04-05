import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Novel } from "@/types/novel";
import NovelEditForm from "./NovelEditForm";

export const dynamic = "force-dynamic";

export default async function EditNovelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: novel } = await supabase
    .from("novels")
    .select("*")
    .eq("id", id)
    .single();

  if (!novel) {
    notFound();
  }

  return (
    <div>
      <h2 className="mb-6 text-lg font-bold">作品編集</h2>
      <NovelEditForm novel={novel as Novel} />
    </div>
  );
}
