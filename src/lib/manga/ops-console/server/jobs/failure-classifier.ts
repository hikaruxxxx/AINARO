import type { JobEvent, JobState } from "./runner";

export type FailureReason =
  | "unresolved_entity"
  | "bible_ref_missing"
  | "name_gate_pending"
  | "panel_render_timeout"
  | "page_render_timeout"
  | "audit_failed"
  | "kdp_pdf_validation"
  | "kdp_keyword_invalid"
  | "spawn_failed"
  | "timeout"
  | "aborted"
  | "unknown";

export type ClassifiableJob = {
  state: JobState;
  events: JobEvent[];
};

export function classifyFailureReason(job: ClassifiableJob): FailureReason | null {
  if (job.state === "succeeded") return null;
  if (job.state === "aborted") return "aborted";

  const tail = job.events
    .slice(-50)
    .map((event) => `${event.channel}: ${event.line}`)
    .join("\n");

  if (/unresolved entity|entity_id .* not found|entities に居ない/.test(tail)) return "unresolved_entity";
  if (/bible ref(?:erence)? (?:missing|not found)|refs\/[^ ]+ ENOENT/.test(tail)) return "bible_ref_missing";
  if (/name_approval (?:not found|missing)|approval pending/i.test(tail)) return "name_gate_pending";
  if (/page_one_shot.*timeout/.test(tail)) return "page_render_timeout";
  if (/panel.*timeout|render timeout/.test(tail)) return "panel_render_timeout";
  if (/audit failed: (\d+)/.test(tail)) return "audit_failed";
  if (/PDF\/X-1a|page count mismatch|trim size/i.test(tail)) return "kdp_pdf_validation";
  if (/keyword.*(NG|invalid|forbidden)/i.test(tail)) return "kdp_keyword_invalid";
  if (/spawn failed/.test(tail)) return "spawn_failed";
  if (/^system: timeout/m.test(tail)) return "timeout";
  return "unknown";
}
