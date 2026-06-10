import type http from "node:http";
import type { JobEvent, JobRecord } from "./runner";

const MAX_SUBSCRIBERS_PER_JOB = 8;

function writeEvent(res: http.ServerResponse, event: JobEvent): void {
  res.write(`id: ${event.seq}\n`);
  res.write(`event: data\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function writeDone(res: http.ServerResponse, job: JobRecord): void {
  res.write("event: done\n");
  res.write(`data: ${JSON.stringify({ state: job.state, exitCode: job.exitCode })}\n\n`);
}

export function streamJob(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  job: JobRecord
): void {
  if (job.subscribers.size >= MAX_SUBSCRIBERS_PER_JOB) {
    res.writeHead(503, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "5",
    });
    res.end("too many SSE subscribers\n");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");

  const lastIdRaw = req.headers["last-event-id"];
  const lastId = Array.isArray(lastIdRaw) ? Number(lastIdRaw[0]) : Number(lastIdRaw ?? 0);
  const first = job.events[0];
  if (Number.isFinite(lastId) && first && first.seq > lastId + 1) {
    writeEvent(res, {
      seq: lastId + 1,
      ts: new Date().toISOString(),
      channel: "system",
      line: `missed ${first.seq - lastId - 1} events (ring buffer overflow)`,
    });
  }
  for (const event of job.events) {
    if (!Number.isFinite(lastId) || event.seq > lastId) writeEvent(res, event);
  }

  if (job.state !== "running") {
    writeDone(res, job);
    res.end();
    return;
  }

  const subscriber = (event: JobEvent) => {
    writeEvent(res, event);
    if (job.state !== "running" && event.channel === "system" && event.line.startsWith("done:")) {
      writeDone(res, job);
      res.end();
    }
  };
  job.subscribers.add(subscriber);
  req.on("close", () => {
    job.subscribers.delete(subscriber);
  });
}
