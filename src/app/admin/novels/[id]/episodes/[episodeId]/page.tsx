import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Episode } from "@/types/novel";
import EpisodeEditForm from "./EpisodeEditForm";

export const dynamic = "force-dynamic";

export default async function EditEpisodePage({
  params,
}: {
  params: Promise<{ id: string; episodeId: string }>;
}) {
  const { id: novelId, episodeId } = await params;
  const supabase = await createClient();

  const { data: episode } = await supabase
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .eq("novel_id", novelId)
    .single();

  if (!episode) {
    notFound();
  }

  return (
    <div>
      <h2 className="mb-6 text-lg font-bold">エピソード編集</h2>
      <EpisodeEditForm episode={episode as Episode} novelId={novelId} />
    </div>
  );
}
