/**
 * 漫画パイプライン用 DB アクセス層
 *
 * Supabase service-role クライアント（既存 src/lib/supabase/admin.ts）を流用し、
 * 漫画関連テーブルの CRUD を集約する。型安全な薄いラッパー。
 *
 * 命名規則: <create|get|list|update|delete><Entity>
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  MangaWorkRow,
  MangaEpisodeRow,
  CharacterBibleRow,
  CostumeStateRow,
  LocationBibleRow,
  PropRow,
  CharacterRelationRow,
  ShotlistRow,
  AssetRow,
  MangaPanelRow,
  PanelCharacterRow,
  BubbleRow,
  MangaKpiRow,
  QaLogRow,
  PublishPackageRow,
  EpisodePlotRow,
  MangaWorkStatus,
  MangaEpisodeStatus,
  PrimaryModel,
  ArtStyle,
  MangaPlatform,
  AssetKind,
  AssetVisibility,
  ModerationStatus,
  PanelRole,
  PanelAspect,
  PanelCamera,
  QaStatus,
  QaDecision,
  CharacterRole,
  LocationType,
  RelationType,
  KpiMetricType,
  PublishStatus,
  PanelSpatialPosition,
  BubbleType,
  RefsStatus,
  NarrativeFunction,
} from "../types";
import type {
  CharacterSpec,
  CharacterReferenceImages,
  CostumeSpec,
  CostumeReferenceImages,
  LocationSpec,
  LocationReferenceImages,
  PropSpec,
  PropReferenceImages,
  PropOwnershipEntry,
  RelationHistoryEntry,
  AttributeClassifierLabels,
  ShotlistData,
  GenerationMetadata,
  RightsStatus,
  PublishMeta,
  ComplianceChecklist,
  CvInspectionResult,
  BubblePosition,
  EpisodePlotData,
} from "../schemas";

const sb = () => createAdminClient();

// ============================================================
// manga_works
// ============================================================

export async function createMangaWork(input: {
  novel_id: string;
  title: string;
  title_en?: string;
  art_style: ArtStyle;
  primary_model?: PrimaryModel;
  target_platforms?: MangaPlatform[];
  rights_status: RightsStatus;
  metadata?: Record<string, unknown>;
}): Promise<MangaWorkRow> {
  const { data, error } = await sb()
    .from("manga_works")
    .insert({
      novel_id: input.novel_id,
      title: input.title,
      title_en: input.title_en ?? null,
      art_style: input.art_style,
      primary_model: input.primary_model ?? "gpt-image-1.5",
      target_platforms: input.target_platforms ?? ["self"],
      rights_status: input.rights_status,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();
  if (error) throw new Error(`createMangaWork failed: ${error.message}`);
  return data as MangaWorkRow;
}

export async function getMangaWork(id: string): Promise<MangaWorkRow | null> {
  const { data, error } = await sb()
    .from("manga_works")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getMangaWork failed: ${error.message}`);
  return data as MangaWorkRow | null;
}

export async function getMangaWorkByNovelId(
  novel_id: string
): Promise<MangaWorkRow | null> {
  const { data, error } = await sb()
    .from("manga_works")
    .select("*")
    .eq("novel_id", novel_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getMangaWorkByNovelId failed: ${error.message}`);
  return data as MangaWorkRow | null;
}

export async function updateMangaWorkStatus(
  id: string,
  status: MangaWorkStatus
): Promise<void> {
  const { error } = await sb()
    .from("manga_works")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(`updateMangaWorkStatus failed: ${error.message}`);
}

// ============================================================
// manga_episodes
// ============================================================

export async function createMangaEpisode(input: {
  work_id: string;
  ep_num: number;
  title?: string;
  source_episode_id?: string;
}): Promise<MangaEpisodeRow> {
  const { data, error } = await sb()
    .from("manga_episodes")
    .insert({
      work_id: input.work_id,
      ep_num: input.ep_num,
      title: input.title ?? null,
      source_episode_id: input.source_episode_id ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createMangaEpisode failed: ${error.message}`);
  return data as MangaEpisodeRow;
}

export async function listMangaEpisodes(
  work_id: string
): Promise<MangaEpisodeRow[]> {
  const { data, error } = await sb()
    .from("manga_episodes")
    .select("*")
    .eq("work_id", work_id)
    .order("ep_num", { ascending: true });
  if (error) throw new Error(`listMangaEpisodes failed: ${error.message}`);
  return (data ?? []) as MangaEpisodeRow[];
}

export async function updateMangaEpisodeStatus(
  id: string,
  status: MangaEpisodeStatus
): Promise<void> {
  const { error } = await sb()
    .from("manga_episodes")
    .update({ status })
    .eq("id", id);
  if (error)
    throw new Error(`updateMangaEpisodeStatus failed: ${error.message}`);
}

// ============================================================
// character_bibles
// ============================================================

export async function createCharacterBible(input: {
  work_id: string;
  character_name: string;
  character_role?: CharacterRole;
  spec: CharacterSpec;
  reference_images?: CharacterReferenceImages;
  attribute_classifier?: AttributeClassifierLabels;
  master_seed?: number;
}): Promise<CharacterBibleRow> {
  const { data, error } = await sb()
    .from("character_bibles")
    .insert({
      work_id: input.work_id,
      character_name: input.character_name,
      character_role: input.character_role ?? null,
      spec: input.spec,
      reference_images: input.reference_images ?? {},
      attribute_classifier: input.attribute_classifier ?? {},
      master_seed: input.master_seed ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createCharacterBible failed: ${error.message}`);
  return data as CharacterBibleRow;
}

export async function listCharacterBibles(
  work_id: string
): Promise<CharacterBibleRow[]> {
  const { data, error } = await sb()
    .from("character_bibles")
    .select("*")
    .eq("work_id", work_id)
    .order("character_name");
  if (error) throw new Error(`listCharacterBibles failed: ${error.message}`);
  return (data ?? []) as CharacterBibleRow[];
}

export async function updateCharacterBibleReferences(
  id: string,
  references: CharacterReferenceImages
): Promise<void> {
  const { error } = await sb()
    .from("character_bibles")
    .update({ reference_images: references })
    .eq("id", id);
  if (error)
    throw new Error(`updateCharacterBibleReferences failed: ${error.message}`);
}

export async function updateCharacterRefsStatus(
  id: string,
  status: RefsStatus
): Promise<void> {
  const { error } = await sb()
    .from("character_bibles")
    .update({ refs_status: status })
    .eq("id", id);
  if (error)
    throw new Error(`updateCharacterRefsStatus failed: ${error.message}`);
}

export async function updateLocationRefsStatus(
  id: string,
  status: RefsStatus
): Promise<void> {
  const { error } = await sb()
    .from("location_bibles")
    .update({ refs_status: status })
    .eq("id", id);
  if (error) throw new Error(`updateLocationRefsStatus failed: ${error.message}`);
}

export async function updateMangaWorkStyleSheet(
  id: string,
  asset_id: string
): Promise<void> {
  const { error } = await sb()
    .from("manga_works")
    .update({ style_sheet_asset_id: asset_id })
    .eq("id", id);
  if (error) throw new Error(`updateMangaWorkStyleSheet failed: ${error.message}`);
}

// ============================================================
// costume_states
// ============================================================

export async function createCostumeState(input: {
  character_id: string;
  state_name: string;
  spec: CostumeSpec;
  reference_images?: CostumeReferenceImages;
  valid_from_episode?: number;
  valid_to_episode?: number;
  notes?: string;
}): Promise<CostumeStateRow> {
  const { data, error } = await sb()
    .from("costume_states")
    .insert({
      character_id: input.character_id,
      state_name: input.state_name,
      spec: input.spec,
      reference_images: input.reference_images ?? {},
      valid_from_episode: input.valid_from_episode ?? null,
      valid_to_episode: input.valid_to_episode ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createCostumeState failed: ${error.message}`);
  return data as CostumeStateRow;
}

export async function listCostumeStates(
  character_id: string
): Promise<CostumeStateRow[]> {
  const { data, error } = await sb()
    .from("costume_states")
    .select("*")
    .eq("character_id", character_id)
    .order("valid_from_episode", { ascending: true, nullsFirst: true });
  if (error) throw new Error(`listCostumeStates failed: ${error.message}`);
  return (data ?? []) as CostumeStateRow[];
}

// ============================================================
// location_bibles
// ============================================================

export async function createLocationBible(input: {
  work_id: string;
  location_name: string;
  location_type?: LocationType;
  spec: LocationSpec;
  reference_images?: LocationReferenceImages;
  master_seed?: number;
}): Promise<LocationBibleRow> {
  const { data, error } = await sb()
    .from("location_bibles")
    .insert({
      work_id: input.work_id,
      location_name: input.location_name,
      location_type: input.location_type ?? null,
      spec: input.spec,
      reference_images: input.reference_images ?? {},
      master_seed: input.master_seed ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createLocationBible failed: ${error.message}`);
  return data as LocationBibleRow;
}

export async function listLocationBibles(
  work_id: string
): Promise<LocationBibleRow[]> {
  const { data, error } = await sb()
    .from("location_bibles")
    .select("*")
    .eq("work_id", work_id)
    .order("location_name");
  if (error) throw new Error(`listLocationBibles failed: ${error.message}`);
  return (data ?? []) as LocationBibleRow[];
}

export async function updateLocationBibleReferences(
  id: string,
  references: LocationReferenceImages
): Promise<void> {
  const { error } = await sb()
    .from("location_bibles")
    .update({ reference_images: references })
    .eq("id", id);
  if (error)
    throw new Error(`updateLocationBibleReferences failed: ${error.message}`);
}

// ============================================================
// props
// ============================================================

export async function createProp(input: {
  work_id: string;
  prop_name: string;
  spec: PropSpec;
  reference_images?: PropReferenceImages;
  ownership_history?: PropOwnershipEntry[];
}): Promise<PropRow> {
  const { data, error } = await sb()
    .from("props")
    .insert({
      work_id: input.work_id,
      prop_name: input.prop_name,
      spec: input.spec,
      reference_images: input.reference_images ?? {},
      ownership_history: input.ownership_history ?? [],
    })
    .select("*")
    .single();
  if (error) throw new Error(`createProp failed: ${error.message}`);
  return data as PropRow;
}

export async function listProps(work_id: string): Promise<PropRow[]> {
  const { data, error } = await sb()
    .from("props")
    .select("*")
    .eq("work_id", work_id);
  if (error) throw new Error(`listProps failed: ${error.message}`);
  return (data ?? []) as PropRow[];
}

// ============================================================
// character_relations
// ============================================================

export async function createCharacterRelation(input: {
  work_id: string;
  char_a_id: string;
  char_b_id: string;
  relation_type?: RelationType;
  address_a_to_b?: string;
  address_b_to_a?: string;
  intimacy_level?: number;
  current_status?: string;
  history?: RelationHistoryEntry[];
}): Promise<CharacterRelationRow> {
  const { data, error } = await sb()
    .from("character_relations")
    .insert({
      work_id: input.work_id,
      char_a_id: input.char_a_id,
      char_b_id: input.char_b_id,
      relation_type: input.relation_type ?? null,
      address_a_to_b: input.address_a_to_b ?? null,
      address_b_to_a: input.address_b_to_a ?? null,
      intimacy_level: input.intimacy_level ?? null,
      current_status: input.current_status ?? null,
      history: input.history ?? [],
    })
    .select("*")
    .single();
  if (error)
    throw new Error(`createCharacterRelation failed: ${error.message}`);
  return data as CharacterRelationRow;
}

export async function listCharacterRelations(
  work_id: string
): Promise<CharacterRelationRow[]> {
  const { data, error } = await sb()
    .from("character_relations")
    .select("*")
    .eq("work_id", work_id);
  if (error) throw new Error(`listCharacterRelations failed: ${error.message}`);
  return (data ?? []) as CharacterRelationRow[];
}

// ============================================================
// episode_plots (L0)
// ============================================================

export async function upsertEpisodePlot(input: {
  episode_id: string;
  data: EpisodePlotData;
  generation_version?: string;
}): Promise<EpisodePlotRow> {
  const { data, error } = await sb()
    .from("episode_plots")
    .upsert(
      {
        episode_id: input.episode_id,
        data: input.data,
        generation_version: input.generation_version ?? null,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "episode_id" }
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertEpisodePlot failed: ${error.message}`);
  return data as EpisodePlotRow;
}

export async function getEpisodePlot(
  episode_id: string
): Promise<EpisodePlotRow | null> {
  const { data, error } = await sb()
    .from("episode_plots")
    .select("*")
    .eq("episode_id", episode_id)
    .maybeSingle();
  if (error) throw new Error(`getEpisodePlot failed: ${error.message}`);
  return data as EpisodePlotRow | null;
}

// ============================================================
// shotlists
// ============================================================

export async function upsertShotlist(input: {
  episode_id: string;
  data: ShotlistData;
}): Promise<ShotlistRow> {
  const { data, error } = await sb()
    .from("shotlists")
    .upsert(
      {
        episode_id: input.episode_id,
        data: input.data,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "episode_id" }
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertShotlist failed: ${error.message}`);
  return data as ShotlistRow;
}

export async function getShotlist(
  episode_id: string
): Promise<ShotlistRow | null> {
  const { data, error } = await sb()
    .from("shotlists")
    .select("*")
    .eq("episode_id", episode_id)
    .maybeSingle();
  if (error) throw new Error(`getShotlist failed: ${error.message}`);
  return data as ShotlistRow | null;
}

// ============================================================
// assets
// ============================================================

export async function createAsset(input: {
  asset_kind: AssetKind;
  parent_id?: string;
  version?: number;
  derived_from_asset_id?: string;
  storage_key: string;
  cdn_url?: string;
  hash_sha256: string;
  width_px?: number;
  height_px?: number;
  file_size_bytes?: number;
  mime_type: string;
  prompt?: string;
  negative_prompt?: string;
  seed?: number;
  model_used?: string;
  generation_metadata?: GenerationMetadata;
  visibility?: AssetVisibility;
  moderation_status?: ModerationStatus;
}): Promise<AssetRow> {
  const { data, error } = await sb()
    .from("assets")
    .insert({
      asset_kind: input.asset_kind,
      parent_id: input.parent_id ?? null,
      version: input.version ?? 1,
      derived_from_asset_id: input.derived_from_asset_id ?? null,
      storage_key: input.storage_key,
      cdn_url: input.cdn_url ?? null,
      hash_sha256: input.hash_sha256,
      width_px: input.width_px ?? null,
      height_px: input.height_px ?? null,
      file_size_bytes: input.file_size_bytes ?? null,
      mime_type: input.mime_type,
      prompt: input.prompt ?? null,
      negative_prompt: input.negative_prompt ?? null,
      seed: input.seed ?? null,
      model_used: input.model_used ?? null,
      generation_metadata: input.generation_metadata ?? {},
      visibility: input.visibility ?? "internal",
      moderation_status: input.moderation_status ?? "pending",
    })
    .select("*")
    .single();
  if (error) throw new Error(`createAsset failed: ${error.message}`);
  return data as AssetRow;
}

export async function findAssetByHash(
  hash_sha256: string
): Promise<AssetRow | null> {
  const { data, error } = await sb()
    .from("assets")
    .select("*")
    .eq("hash_sha256", hash_sha256)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findAssetByHash failed: ${error.message}`);
  return data as AssetRow | null;
}

export async function getNextAssetVersion(parent_id: string): Promise<number> {
  const { data, error } = await sb()
    .from("assets")
    .select("version")
    .eq("parent_id", parent_id)
    .order("version", { ascending: false })
    .limit(1);
  if (error) throw new Error(`getNextAssetVersion failed: ${error.message}`);
  if (!data || data.length === 0) return 1;
  return ((data[0] as { version: number }).version ?? 0) + 1;
}

// ============================================================
// manga_panels
// ============================================================

export async function createMangaPanel(input: {
  episode_id: string;
  panel_idx: number;
  role: PanelRole;
  aspect: PanelAspect;
  width_px: number;
  height_px: number;
  scene_id?: string;
  location_id?: string;
  camera?: PanelCamera;
  emotion_tag?: string;
  narrative_function?: NarrativeFunction;
  panel_purpose?: string;
}): Promise<MangaPanelRow> {
  const { data, error } = await sb()
    .from("manga_panels")
    .insert({
      episode_id: input.episode_id,
      panel_idx: input.panel_idx,
      role: input.role,
      aspect: input.aspect,
      width_px: input.width_px,
      height_px: input.height_px,
      scene_id: input.scene_id ?? null,
      location_id: input.location_id ?? null,
      camera: input.camera ?? null,
      emotion_tag: input.emotion_tag ?? null,
      narrative_function: input.narrative_function ?? null,
      panel_purpose: input.panel_purpose ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createMangaPanel failed: ${error.message}`);
  return data as MangaPanelRow;
}

export async function setPanelCurrentAsset(
  panel_id: string,
  asset_id: string
): Promise<void> {
  const { error } = await sb()
    .from("manga_panels")
    .update({ current_asset_id: asset_id })
    .eq("id", panel_id);
  if (error) throw new Error(`setPanelCurrentAsset failed: ${error.message}`);
}

export async function updatePanelQa(
  panel_id: string,
  qa_status: QaStatus,
  qa_reason?: string,
  consistency_score?: number
): Promise<void> {
  const { error } = await sb()
    .from("manga_panels")
    .update({
      qa_status,
      qa_reason: qa_reason ?? null,
      consistency_score: consistency_score ?? null,
    })
    .eq("id", panel_id);
  if (error) throw new Error(`updatePanelQa failed: ${error.message}`);
}

export async function listEpisodePanels(
  episode_id: string
): Promise<MangaPanelRow[]> {
  const { data, error } = await sb()
    .from("manga_panels")
    .select("*")
    .eq("episode_id", episode_id)
    .order("panel_idx", { ascending: true });
  if (error) throw new Error(`listEpisodePanels failed: ${error.message}`);
  return (data ?? []) as MangaPanelRow[];
}

// ============================================================
// panel_characters
// ============================================================

export async function addPanelCharacter(input: {
  panel_id: string;
  character_id: string;
  costume_state_id?: string;
  emotion?: string;
  spatial_position?: PanelSpatialPosition;
}): Promise<PanelCharacterRow> {
  const { data, error } = await sb()
    .from("panel_characters")
    .insert({
      panel_id: input.panel_id,
      character_id: input.character_id,
      costume_state_id: input.costume_state_id ?? null,
      emotion: input.emotion ?? null,
      spatial_position: input.spatial_position ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`addPanelCharacter failed: ${error.message}`);
  return data as PanelCharacterRow;
}

// ============================================================
// bubbles
// ============================================================

export async function createBubble(input: {
  panel_id: string;
  bubble_idx: number;
  speaker_id?: string;
  text: string;
  text_lang?: string;
  bubble_type?: BubbleType;
  position: BubblePosition;
  font_family?: string;
  font_size?: number;
  z_index?: number;
  reading_order: number;
}): Promise<BubbleRow> {
  const { data, error } = await sb()
    .from("bubbles")
    .insert({
      panel_id: input.panel_id,
      bubble_idx: input.bubble_idx,
      speaker_id: input.speaker_id ?? null,
      text: input.text,
      text_lang: input.text_lang ?? "ja",
      bubble_type: input.bubble_type ?? "normal",
      position: input.position,
      font_family: input.font_family ?? null,
      font_size: input.font_size ?? null,
      z_index: input.z_index ?? 100,
      reading_order: input.reading_order,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createBubble failed: ${error.message}`);
  return data as BubbleRow;
}

// ============================================================
// qa_logs
// ============================================================

export async function createQaLog(input: {
  panel_id: string;
  asset_id?: string;
  attempt_num: number;
  cv_results: CvInspectionResult;
  decision: QaDecision;
  failure_reasons?: string[];
  human_override?: boolean;
  reviewer_id?: string;
}): Promise<QaLogRow> {
  const { data, error } = await sb()
    .from("qa_logs")
    .insert({
      panel_id: input.panel_id,
      asset_id: input.asset_id ?? null,
      attempt_num: input.attempt_num,
      cv_results: input.cv_results,
      decision: input.decision,
      failure_reasons: input.failure_reasons ?? [],
      human_override: input.human_override ?? false,
      reviewer_id: input.reviewer_id ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createQaLog failed: ${error.message}`);
  return data as QaLogRow;
}

// ============================================================
// publish_packages
// ============================================================

export async function createPublishPackage(input: {
  episode_id: string;
  platform: MangaPlatform;
  package_asset_id?: string;
  meta: PublishMeta;
  compliance_checklist?: ComplianceChecklist;
}): Promise<PublishPackageRow> {
  const { data, error } = await sb()
    .from("publish_packages")
    .insert({
      episode_id: input.episode_id,
      platform: input.platform,
      package_asset_id: input.package_asset_id ?? null,
      meta: input.meta,
      compliance_checklist: input.compliance_checklist ?? {},
    })
    .select("*")
    .single();
  if (error) throw new Error(`createPublishPackage failed: ${error.message}`);
  return data as PublishPackageRow;
}

// ============================================================
// manga_kpi
// ============================================================

export async function recordKpi(input: {
  episode_id?: string;
  panel_id?: string;
  platform: MangaPlatform;
  metric_type: KpiMetricType;
  metric_value: number;
  measured_at?: string;
  raw_data?: Record<string, unknown>;
}): Promise<MangaKpiRow> {
  const { data, error } = await sb()
    .from("manga_kpi")
    .insert({
      episode_id: input.episode_id ?? null,
      panel_id: input.panel_id ?? null,
      platform: input.platform,
      metric_type: input.metric_type,
      metric_value: input.metric_value,
      measured_at: input.measured_at ?? new Date().toISOString(),
      raw_data: input.raw_data ?? {},
    })
    .select("*")
    .single();
  if (error) throw new Error(`recordKpi failed: ${error.message}`);
  return data as MangaKpiRow;
}
