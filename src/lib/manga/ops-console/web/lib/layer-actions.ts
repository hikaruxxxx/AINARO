/**
 * 各 view の toolbar から共通利用される layer アクション (再実行 / AI で修正) ヘルパ。
 * pipeline view 以外の bible / volume-plot / kdp-metadata / quality / revision / name-gate
 * すべての toolbar で同じ 2 ボタンを露出するために抽出。
 */
import { apiPostJob, openJobStream, type JobStartRequest, type LayerId } from "./api";
import { layerLabel, resolveAiEditHint, type LayerKey } from "../labels";
import { store } from "./store";
import { openLaunchModal, type LaunchArgSpec } from "./launch-modal";
import { openAiEditModal } from "../components/ai-edit-modal";

/** Console から spawn 可能な layer。 server LAYER_REGISTRY と同期させる。 */
const RUNNABLE = new Set<string>(["L01", "L01b", "L01c", "L02", "L02b", "L04", "L04_1", "L04_9", "L08.5", "L09", "L11", "L12", "L13"]);

export function isRunnableLayer(value: string | null | undefined): value is LayerId {
  return typeof value === "string" && RUNNABLE.has(value);
}

/** L13 の --volume 等、layer 固有の追加引数を返す。 */
export function launchArgsFor(layer: LayerId): LaunchArgSpec[] {
  if (layer === "L13") {
    return [
      {
        key: "volume",
        label: "巻番号",
        type: "number",
        defaultValue: "1",
        min: 1,
        required: true,
        hint: "data/manga/works/{slug}/volumes/v{NN}/ 配下に成果物が出ます",
      },
    ];
  }
  return [];
}

export function startRequest(
  layer: LayerId,
  slug: string,
  episode: number,
  extras?: Record<string, string>
): JobStartRequest {
  const req: JobStartRequest = { layer, slug, args: {} };
  // work scope layer は episode を付けずに起動する。
  if (layer === "L01b" || layer === "L01c" || layer === "L02") return req;
  if (layer === "L13") {
    const vol = Number(extras?.volume ?? 1);
    return { ...req, volume: Number.isFinite(vol) && vol > 0 ? vol : 1 };
  }
  if (layer === "L04") return { ...req, episode, args: { "--from-scene-graph": "" } };
  return { ...req, episode };
}

/** 「AI で修正」ボタン共通動作: per-layer hint を prefill して AI 編集 modal を開く。 */
export function navigateToAiEdit(
  layerId: string,
  ctx: { slug: string; episode: number; volume?: number }
): boolean {
  const hint = resolveAiEditHint(layerId, ctx);
  if (!hint) return false;
  void openAiEditModal({
    scope: ctx.slug,
    initialTarget: hint.target,
    initialPrompt: hint.promptTemplate,
    originLayer: layerId,
    originView: store.state.currentView,
  });
  return true;
}

export type SpawnCallbacks = {
  /** spawn 開始 / 終了の通知 (UI 上で disable 表示などに使う) */
  onProgress?: (running: boolean) => void;
  /** spawn 完了 (success) — refresh 等に使う */
  onSuccess?: () => void;
  /** L01/L02b の delegate 通知や spawn 失敗の文言を toast へ流すため */
  onError?: (message: string) => void;
};

/**
 * layer 起動の共通フロー: 確認 modal → spawn → SSE 完了監視。
 * pipeline view と各 view の toolbar の両方から呼ばれる。
 */
export async function spawnLayerWithModal(opts: {
  layer: LayerId;
  status?: "ready" | "missing" | "stale";
  slug: string;
  episode: number;
  extraArgs?: Record<string, string>;
  modalOverrides?: {
    title?: string;
    warning?: string;
    description?: string;
    confirmLabel?: string;
  };
  callbacks?: SpawnCallbacks;
}): Promise<void> {
  const { layer, status = "missing", slug, episode, extraArgs, modalOverrides, callbacks } = opts;

  // L01 / L02b は引数 (concept path / volume) が必要なので、再実行 UI は該当 view に委譲。
  if (layer === "L01") {
    store.update({ currentView: "bible" });
    callbacks?.onError?.("L01 は世界観・設定 view から起動してください (concept 引数が必要)");
    return;
  }
  if (layer === "L02b") {
    store.update({ currentView: "volume-plot" });
    callbacks?.onError?.("L02b は巻プロット view から起動してください (volume 引数が必要)");
    return;
  }

  const label = layerLabel(layer);
  const result = await openLaunchModal({
    title: modalOverrides?.title ?? `${layer} ${label.title} を ${status === "ready" ? "再実行" : "生成"}`,
    warning: modalOverrides?.warning ?? (
      status === "ready"
        ? "既に生成済みです。再実行すると現状の成果物が上書きされる可能性があります。"
        : undefined
    ),
    description: modalOverrides?.description ?? (
      status === "ready"
        ? "成果物のバックアップは取得しません (Phase 8C で対応予定)。続行する場合は git で diff を確認してください。"
        : undefined
    ),
    args: launchArgsFor(layer),
    confirmLabel: modalOverrides?.confirmLabel ?? (status === "ready" ? "再実行する" : "生成する"),
  });
  if (!result) return;

  callbacks?.onProgress?.(true);
  try {
    const req = startRequest(layer, slug, episode, result);
    if (extraArgs) req.args = { ...req.args, ...extraArgs };
    const job = await apiPostJob(req);
    openJobStream(job.job_id, {
      onEvent: () => undefined,
      onDone: () => {
        callbacks?.onProgress?.(false);
        callbacks?.onSuccess?.();
      },
      onError: (e) => {
        callbacks?.onProgress?.(false);
        callbacks?.onError?.(e.message);
      },
    });
  } catch (e) {
    callbacks?.onProgress?.(false);
    callbacks?.onError?.(e instanceof Error ? e.message : String(e));
  }
}

/**
 * 各 view の toolbar に挿し込む 2 ボタン HTML を返す。
 * 多 layer view (name-gate / revision 等) のために array 入力。
 */
export function renderLayerActionButtons(
  layers: Array<{ id: LayerKey | string; label?: string }>,
  opts?: { running?: boolean }
): string {
  return layers
    .map((entry) => {
      const id = entry.id;
      const layerLabelText = entry.label ?? id;
      const runnable = isRunnableLayer(id);
      const aiHint = resolveAiEditHint(id, { slug: "_dummy", episode: 1 });
      const rerunBtn = runnable
        ? `<button type="button" class="nc-button nc-button--secondary nc-button--sm" data-rerun-layer="${id}" ${opts?.running ? "disabled" : ""}>${escapeHtml(layerLabelText)} 再実行</button>`
        : "";
      const aiBtn = aiHint
        ? `<button type="button" class="nc-button nc-button--ghost nc-button--sm" data-ai-edit-layer="${id}" title="AI 編集 view へ遷移し、${escapeHtml(layerLabelText)} の context を prefill します">${escapeHtml(layerLabelText)} を AI で修正</button>`
        : "";
      return `${rerunBtn}${aiBtn}`;
    })
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
