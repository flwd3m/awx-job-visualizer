import {
  atom,
  type Getter,
  type Setter,
  useAtom,
  useAtomValue,
  useSetAtom,
} from "jotai";
import {
  type AwxEvent,
  type AwxJob,
  getEvents,
  type HostTaskResult,
  type TaskColumn,
  type TaskStatus,
} from "./data";

type Play = {
  id: string;
  name: string;
  tasks: TaskColumn[];
};

type Hosts = Map<string, Map<string, HostTaskResult>>;
export type HostStatus = "running" | "ok" | "failed";
export type HostSort = "status" | "name";

const selectedJobAtom = atom<AwxJob | null>(null);
const reloadVersionAtom = atom(0);
const playsAtom = atom<Map<string, Play>>(new Map());
const hostsAtom = atom<Hosts>(new Map());
const isLoadingAtom = atom(false);
const errorAtom = atom<string | null>(null);
const hostSortAtom = atom<HostSort>("status");

const addTask = (task: TaskColumn, get: Getter, set: Setter) => {
  const plays = new Map(get(playsAtom));
  const play = plays.get(task.playId) ?? {
    id: task.playId,
    name: task.play,
    tasks: [],
  };
  if (!play.tasks.some((item) => item.id === task.id)) {
    plays.set(task.playId, { ...play, tasks: [...play.tasks, task] });
    set(playsAtom, plays);
  }
};

const setHostResult = (
  host: string,
  taskId: string,
  result: HostTaskResult,
  get: Getter,
  set: Setter,
) => {
  const hosts = new Map(get(hostsAtom));
  const results = new Map(hosts.get(host) ?? []);
  const previous = results.get(taskId);
  results.set(taskId, {
    ...result,
    startedAt: result.startedAt ?? previous?.startedAt ?? null,
  });
  hosts.set(host, results);
  set(hostsAtom, hosts);
};

const processEvent = (event: AwxEvent, get: Getter, set: Setter) => {
  switch (event.type) {
    case "task":
      addTask(event.task, get, set);
      break;
    case "host_task_start":
      addTask(event.task, get, set);
      setHostResult(
        event.host,
        event.task.id,
        {
          status: "running",
          changed: false,
          duration: null,
          startedAt: event.startedAt,
          detail: null,
        },
        get,
        set,
      );
      break;
    case "host_task_result":
      addTask(event.task, get, set);
      setHostResult(event.host, event.task.id, event.result, get, set);
      break;
    case "end":
      break;
  }
};

const run = async (job: AwxJob, version: number, get: Getter, set: Setter) => {
  set(playsAtom, new Map());
  set(hostsAtom, new Map());
  set(errorAtom, null);
  set(isLoadingAtom, true);

  try {
    for await (const event of await getEvents(job.id, job.type)) {
      if (
        get(selectedJobAtom)?.id !== job.id ||
        get(reloadVersionAtom) !== version
      ) {
        return;
      }
      processEvent(event, get, set);
    }
  } catch (error) {
    if (
      get(selectedJobAtom)?.id === job.id &&
      get(reloadVersionAtom) === version
    ) {
      set(errorAtom, error instanceof Error ? error.message : String(error));
    }
  } finally {
    if (
      get(selectedJobAtom)?.id === job.id &&
      get(reloadVersionAtom) === version
    ) {
      set(isLoadingAtom, false);
    }
  }
};

const awxJobAtom = atom(
  (get) => get(selectedJobAtom),
  (get, set, job: AwxJob | null) => {
    const version = get(reloadVersionAtom) + 1;
    set(selectedJobAtom, job);
    set(reloadVersionAtom, version);
    if (job) void run(job, version, get, set);
  },
);

const tasksAtom = atom((get) =>
  [...get(playsAtom).values()].flatMap((play) => play.tasks),
);

const playGroupsAtom = atom((get) =>
  [...get(playsAtom).values()].map((play) => ({
    id: play.id,
    name: play.name,
    count: play.tasks.length,
  })),
);

const hostRowsAtom = atom((get) => {
  const rows = [...get(hostsAtom).entries()].map(([name, results]) => {
    const statuses = [...results.values()].map((result) => result.status);
    const status: HostStatus = statuses.some(
      (item) => item === "failed" || item === "unreachable",
    )
      ? "failed"
      : statuses.includes("running")
        ? "running"
        : "ok";
    return { name, results, status };
  });
  const sort = get(hostSortAtom);
  const statusOrder: Record<HostStatus, number> = {
    failed: 0,
    running: 1,
    ok: 2,
  };
  return rows.sort((left, right) => {
    if (sort === "status") {
      const difference = statusOrder[left.status] - statusOrder[right.status];
      if (difference !== 0) return difference;
    }
    return left.name.localeCompare(right.name);
  });
});

const resultCountsAtom = atom((get) => {
  const counts: Partial<Record<TaskStatus, number>> = {};
  for (const results of get(hostsAtom).values()) {
    for (const result of results.values()) {
      counts[result.status] = (counts[result.status] ?? 0) + 1;
    }
  }
  return counts;
});

const reloadAtom = atom(null, (get, set) => {
  const job = get(selectedJobAtom);
  if (!job) return;
  const version = get(reloadVersionAtom) + 1;
  set(reloadVersionAtom, version);
  void run(job, version, get, set);
});

export const useAwxJob = () => useAtom(awxJobAtom);
export const useTasks = () => useAtomValue(tasksAtom);
export const usePlayGroups = () => useAtomValue(playGroupsAtom);
export const useHosts = () => useAtomValue(hostRowsAtom);
export const useHostSort = () => useAtom(hostSortAtom);
export const useResultCounts = () => useAtomValue(resultCountsAtom);
export const useIsJobLoading = () => useAtomValue(isLoadingAtom);
export const useJobError = () => useAtomValue(errorAtom);
export const useReloadJob = () => useSetAtom(reloadAtom);
