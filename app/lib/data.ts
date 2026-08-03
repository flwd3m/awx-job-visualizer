"use server";

import { setTimeout } from "node:timers/promises";
import { getAwxConfig } from "./config";

class AwxRequestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AwxRequestError";
  }
}

export type JobStatus =
  | "new"
  | "pending"
  | "waiting"
  | "running"
  | "successful"
  | "failed"
  | "error"
  | "canceled";

export type AwxJob = {
  id: number;
  type: string;
  name: string;
  playbook: string;
  started: string | null;
  finished: string | null;
  status: JobStatus;
};

export type TaskStatus =
  | "running"
  | "ok"
  | "changed"
  | "failed"
  | "unreachable"
  | "skipped";

export type TaskColumn = {
  id: string;
  name: string;
  play: string;
  playId: string;
};

export type HostTaskResult = {
  status: TaskStatus;
  changed: boolean;
  duration: number | null;
  startedAt: string | null;
  detail: string | null;
};

export type AwxEvent =
  | {
      counter: number;
      type: "task";
      task: TaskColumn;
    }
  | {
      counter: number;
      type: "host_task_start";
      host: string;
      task: TaskColumn;
      startedAt: string | null;
    }
  | {
      counter: number;
      type: "host_task_result";
      host: string;
      task: TaskColumn;
      result: HostTaskResult;
    }
  | {
      counter: number;
      type: "end";
    };

type ListResponse<T> = {
  results: T[];
  next: string | null;
};

type RawAwxJob = {
  id: number;
  type: string;
  name: string;
  playbook?: string;
  started?: string | null;
  finished?: string | null;
  status: JobStatus;
};

type RawAwxEvent = {
  counter: number;
  created?: string;
  event: string;
  stdout?: string;
  event_data: {
    play?: string;
    play_uuid?: string;
    task?: string;
    task_uuid?: string;
    host?: string;
    duration?: number;
    res?: {
      changed?: boolean;
      msg?: unknown;
      stderr?: unknown;
      stdout?: unknown;
      exception?: unknown;
      rc?: unknown;
    };
  };
};

const request = async <T>(
  path: string,
  config = getAwxConfig(),
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(new URL(path, config.baseUrl), {
      headers: config.headers,
    });
  } catch (error) {
    throw new AwxRequestError(
      "Could not connect to AWX. Check AWX_URL and network connectivity.",
      { cause: error },
    );
  }
  if (!response.ok) {
    if (response.status === 401) {
      throw new AwxRequestError(
        "AWX authentication failed. Check the configured token or username and password.",
      );
    }
    if (response.status === 403) {
      throw new AwxRequestError(
        "AWX denied access. The configured account needs permission to view jobs.",
      );
    }
    throw new AwxRequestError(
      `AWX returned HTTP ${response.status} while loading data.`,
    );
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new AwxRequestError("AWX returned an invalid JSON response.", {
      cause: error,
    });
  }
};

export async function getJobs(): Promise<AwxJob[]> {
  const config = getAwxConfig();
  const historyParams = new URLSearchParams({
    not__launch_type: "sync",
    type: "job,workflow_job",
    order_by: "-finished",
    page: "1",
    page_size: "50",
  });
  const activeParams = new URLSearchParams({
    not__launch_type: "sync",
    type: "job,workflow_job",
    status__in: "pending,waiting,running",
    order_by: "-started",
    page_size: "50",
  });
  const [active, history] = await Promise.all([
    request<ListResponse<RawAwxJob>>(
      `/api/v2/unified_jobs/?${activeParams.toString()}`,
      config,
    ),
    request<ListResponse<RawAwxJob>>(
      `/api/v2/unified_jobs/?${historyParams.toString()}`,
      config,
    ),
  ]);
  const jobs = new Map<number, RawAwxJob>();
  for (const job of [...active.results, ...history.results]) {
    if (job.type !== "job" && job.type !== "workflow_job") continue;
    if (!jobs.has(job.id)) jobs.set(job.id, job);
  }

  return [...jobs.values()].map((job) => ({
    id: job.id,
    type: job.type,
    name: job.name,
    playbook: job.playbook ?? job.name,
    started: job.started ?? null,
    finished: job.finished ?? null,
    status: job.status,
  }));
}

const taskId = (event: RawAwxEvent) => {
  const {
    play,
    play_uuid: playUuid,
    task,
    task_uuid: taskUuid,
  } = event.event_data;
  return taskUuid
    ? `${playUuid ?? play ?? "play"}:${taskUuid}`
    : `${playUuid ?? play ?? "play"}:${task ?? "task"}`;
};

const stringifyDetail = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const resultDetail = (event: RawAwxEvent) => {
  if (event.stdout?.trim()) return event.stdout.trim().slice(0, 100_000);
  const result = event.event_data.res;
  if (!result) return null;
  return stringifyDetail(result)?.slice(0, 100_000) ?? null;
};

const resultStatus = (event: RawAwxEvent): TaskStatus | null => {
  switch (event.event) {
    case "runner_on_ok":
      return event.event_data.res?.changed ? "changed" : "ok";
    case "runner_on_failed":
      return "failed";
    case "runner_on_unreachable":
      return "unreachable";
    case "runner_on_skipped":
      return "skipped";
    default:
      return null;
  }
};

const parseRaw = (event: RawAwxEvent): AwxEvent | undefined => {
  if (event.event === "playbook_on_stats") {
    return { counter: event.counter, type: "end" };
  }

  const data = event.event_data;
  if (!data.task) return;
  const play = data.play ?? "Ungrouped play";
  const task: TaskColumn = {
    id: taskId(event),
    name: data.task,
    play,
    playId: data.play_uuid ?? play,
  };

  if (event.event === "playbook_on_task_start") {
    return { counter: event.counter, type: "task", task };
  }
  if (event.event === "runner_on_start" && data.host) {
    return {
      counter: event.counter,
      type: "host_task_start",
      host: data.host,
      task,
      startedAt: event.created ?? null,
    };
  }

  const status = resultStatus(event);
  if (!status || !data.host) return;
  return {
    counter: event.counter,
    type: "host_task_result",
    host: data.host,
    task,
    result: {
      status,
      changed: Boolean(data.res?.changed),
      duration: data.duration ?? null,
      startedAt: null,
      detail: resultDetail(event),
    },
  };
};

type RawWorkflowNode = {
  job: number | null;
  summary_fields?: {
    job?: {
      id: number;
      type?: string;
    };
  };
};

const ACTIVE_STATUSES = new Set<JobStatus>([
  "new",
  "pending",
  "waiting",
  "running",
]);
const POLL_INTERVAL_MS = 2_000;

async function* getJobEvents(
  jobId: number,
  afterCounter: number,
): AsyncGenerator<AwxEvent, number> {
  let lastCounter = afterCounter;
  let page = 1;
  while (true) {
    const params = new URLSearchParams({
      counter__gt: String(afterCounter),
      order_by: "counter",
      page: String(page),
      page_size: "50",
    });
    const data = await request<ListResponse<RawAwxEvent>>(
      `/api/v2/jobs/${jobId}/job_events/?${params.toString()}`,
    );
    for (const event of data.results) {
      lastCounter = Math.max(lastCounter, event.counter);
      const parsed = parseRaw(event);
      if (parsed) yield parsed;
    }
    if (!data.next) break;
    page += 1;
  }
  return lastCounter;
}

const getWorkflowNodes = async (jobId: number) => {
  const nodes: RawWorkflowNode[] = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({
      order_by: "id",
      page: String(page),
      page_size: "200",
    });
    const data = await request<ListResponse<RawWorkflowNode>>(
      `/api/v2/workflow_jobs/${jobId}/workflow_nodes/?${params.toString()}`,
    );
    nodes.push(...data.results);
    if (!data.next) break;
    page += 1;
  }
  return nodes;
};

const collectLeafJobs = async (
  workflowJobId: number,
  workflows: Set<number>,
  leafJobs: Set<number>,
) => {
  if (workflows.has(workflowJobId)) return;
  workflows.add(workflowJobId);
  for (const node of await getWorkflowNodes(workflowJobId)) {
    const childId = node.job ?? node.summary_fields?.job?.id;
    if (!childId) continue;
    if (node.summary_fields?.job?.type === "workflow_job") {
      await collectLeafJobs(childId, workflows, leafJobs);
    } else {
      leafJobs.add(childId);
    }
  }
};

const getJobStatus = async (jobId: number, jobType: string) => {
  const resource = jobType === "workflow_job" ? "workflow_jobs" : "jobs";
  const job = await request<{ status: JobStatus }>(
    `/api/v2/${resource}/${jobId}/`,
  );
  return job.status;
};

async function* streamRegularJob(jobId: number): AsyncGenerator<AwxEvent> {
  let counter = 0;
  while (true) {
    counter = yield* getJobEvents(jobId, counter);
    const status = await getJobStatus(jobId, "job");
    if (!ACTIVE_STATUSES.has(status)) break;
    await setTimeout(POLL_INTERVAL_MS);
  }
}

async function* streamWorkflowJob(jobId: number): AsyncGenerator<AwxEvent> {
  const counters = new Map<number, number>();
  while (true) {
    const leafJobs = new Set<number>();
    await collectLeafJobs(jobId, new Set(), leafJobs);
    for (const leafJobId of leafJobs) {
      const counter = yield* getJobEvents(
        leafJobId,
        counters.get(leafJobId) ?? 0,
      );
      counters.set(leafJobId, counter);
    }

    const status = await getJobStatus(jobId, "workflow_job");
    if (!ACTIVE_STATUSES.has(status)) break;
    await setTimeout(POLL_INTERVAL_MS);
  }
}

export async function* getEvents(jobId: number, jobType: string) {
  if (!Number.isSafeInteger(jobId) || jobId <= 0) {
    throw new Error("Invalid AWX job id");
  }
  if (jobType === "job") {
    yield* streamRegularJob(jobId);
    return;
  }
  if (jobType === "workflow_job") {
    yield* streamWorkflowJob(jobId);
    return;
  }
  throw new Error(`AWX ${jobType} #${jobId} does not contain playbook events`);
}
