import type { SceneGraphV1, Scene } from "../scene-graph/schema";
import type { PanelLintFeedback } from "../scene-graph/storyboard-from-scenes";
import type { NameLintFinding, NameLintReport } from "./name-lint";

const MAX_FEEDBACK_PANELS_PER_SCENE = 5;

function isActionableSeverity(severity: NameLintFinding["severity"]): severity is "fatal" | "warn" {
  return severity === "fatal" || severity === "warn";
}

function isActionableScope(scope: NameLintFinding["scope"]): boolean {
  return scope === "panel" || scope === "page";
}

function sceneById(sceneGraph: SceneGraphV1): Map<string, Scene> {
  return new Map(sceneGraph.scenes.map((scene) => [scene.scene_id, scene]));
}

function sceneForFinding(finding: NameLintFinding, sceneGraph: SceneGraphV1, byId: Map<string, Scene>): Scene | undefined {
  if (finding.scene_id) {
    const scene = byId.get(finding.scene_id);
    if (scene) return scene;
  }
  return sceneGraph.scenes.find((scene) => {
    if (
      finding.panel_no !== undefined &&
      finding.panel_no >= scene.panel_range.start_panel_no &&
      finding.panel_no <= scene.panel_range.end_panel_no
    ) {
      return true;
    }
    return (
      finding.page_no !== undefined &&
      finding.page_no >= scene.page_range.start &&
      finding.page_no <= scene.page_range.end
    );
  });
}

function targetPanelNo(finding: NameLintFinding, scene: Scene): number {
  return finding.panel_no ?? scene.panel_range.start_panel_no;
}

export function aggregateLintFeedbackByScene(
  findings: NameLintFinding[],
  sceneGraph: SceneGraphV1
): Map<string, PanelLintFeedback[]> {
  const out = new Map<string, PanelLintFeedback[]>();
  const byId = sceneById(sceneGraph);

  for (const finding of findings) {
    if (!isActionableSeverity(finding.severity) || !isActionableScope(finding.scope)) continue;
    const scene = sceneForFinding(finding, sceneGraph, byId);
    if (!scene) continue;
    const panelNo = targetPanelNo(finding, scene);
    if (panelNo < scene.panel_range.start_panel_no || panelNo > scene.panel_range.end_panel_no) continue;

    const sceneFeedback = out.get(scene.scene_id) ?? [];
    let panelFeedback = sceneFeedback.find((feedback) => feedback.panel_no === panelNo);
    if (!panelFeedback) {
      if (sceneFeedback.length >= MAX_FEEDBACK_PANELS_PER_SCENE) continue;
      panelFeedback = { panel_no: panelNo, findings: [] };
      sceneFeedback.push(panelFeedback);
      out.set(scene.scene_id, sceneFeedback);
    }
    panelFeedback.findings.push({
      rule: finding.rule,
      severity: finding.severity,
      message: finding.message,
      hint: finding.hint,
    });
  }

  return out;
}

export function filterFeedbackByPanelNos(
  feedback: Map<string, PanelLintFeedback[]>,
  panelNos: number[]
): Map<string, PanelLintFeedback[]> {
  const targets = new Set(panelNos);
  const out = new Map<string, PanelLintFeedback[]>();
  for (const [sceneId, panels] of feedback.entries()) {
    const filtered = panels.filter((panel) => targets.has(panel.panel_no));
    if (filtered.length > 0) out.set(sceneId, filtered);
  }
  return out;
}

export function compareReports(
  prev: NameLintReport,
  next: NameLintReport
): { improvementRate: number; regressed: boolean } {
  const prevCount = prev.findings.length;
  const nextCount = next.findings.length;
  return {
    improvementRate: prevCount > 0 ? (prevCount - nextCount) / prevCount : 0,
    regressed: nextCount > prevCount,
  };
}

export function selectScenesForReEnrich(
  feedback: Map<string, PanelLintFeedback[]>,
  options: { targetPanelNos?: number[] } = {}
): string[] {
  const filtered = options.targetPanelNos ? filterFeedbackByPanelNos(feedback, options.targetPanelNos) : feedback;
  return Array.from(filtered.entries())
    .filter(([, panels]) => panels.length > 0)
    .map(([sceneId]) => sceneId);
}
