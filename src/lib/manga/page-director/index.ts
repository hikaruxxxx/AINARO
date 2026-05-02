/**
 * L1.4 Page Direction 公開API
 *
 * Month 1 Week 2 時点: 型 + テンプレ + validator + template-selector + page-mapper。
 * render-constraints の派生は src/lib/manga/render/adapter.ts の deriveRenderConstraints。
 */

export * from "./types";
export {
  TEMPLATES,
  TEMPLATES_BY_ID,
  getTemplate,
} from "./layout-templates";
export { validatePagePlan } from "./validator";
export type { ValidateOptions } from "./validator";
export {
  rankTemplates,
  selectBestTemplate,
} from "./template-selector";
export type {
  PageSelectionContext,
  TemplateScore,
} from "./template-selector";
export {
  splitIntoPages,
  inferPageRole,
  inferVisualDensity,
  inferDialogueDensity,
  inferTurnStrength,
  mapStoryboardToPages,
  reportPageMapperWarnings,
} from "./page-mapper";
export type {
  PageMapperOptions,
  PageMapperWarning,
} from "./page-mapper";
export { resolveContinuityGroupIds } from "./continuity-resolver";
export type { ContinuityResolverArgs } from "./continuity-resolver";
export {
  buildGroupRefRegistry,
  resolveRefsForGroupIds,
  buildCharacterRefPathsFromRegistry,
} from "./continuity-refs";
export type {
  GroupRefRegistry,
  BuildGroupRefRegistryArgs,
} from "./continuity-refs";
