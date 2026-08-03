"use client";

import {
  type FunctionComponent,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { AwxJob, HostTaskResult, TaskStatus } from "../lib/data";
import type { HostStatus } from "../lib/state";
import {
  useAwxJob,
  useHostSort,
  useHosts,
  useIsJobLoading,
  useJobError,
  usePlayGroups,
  useReloadJob,
  useResultCounts,
  useTasks,
} from "../lib/state";
import { AnsiText } from "./AnsiText";

const statusPresentation: Record<
  TaskStatus,
  { label: string; icon: string; className: string }
> = {
  ok: {
    label: "OK",
    icon: "✓",
    className: "border-emerald-500/25 bg-emerald-500/15 text-emerald-300",
  },
  changed: {
    label: "Changed",
    icon: "●",
    className: "border-sky-500/25 bg-sky-500/15 text-sky-300",
  },
  failed: {
    label: "Failed",
    icon: "×",
    className: "border-rose-500/25 bg-rose-500/15 text-rose-300",
  },
  unreachable: {
    label: "Unreachable",
    icon: "!",
    className: "border-orange-500/25 bg-orange-500/15 text-orange-300",
  },
  skipped: {
    label: "Skipped",
    icon: "–",
    className: "border-slate-700 bg-slate-800/70 text-slate-500",
  },
  running: {
    label: "Running",
    icon: "…",
    className: "border-violet-500/25 bg-violet-500/15 text-violet-300",
  },
};

const hostStatusPresentation: Record<
  HostStatus,
  { label: string; icon: string; className: string }
> = {
  running: {
    label: "Running",
    icon: "…",
    className: "border-violet-500/30 bg-violet-500/15 text-violet-300",
  },
  ok: {
    label: "OK",
    icon: "✓",
    className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  },
  failed: {
    label: "Failed",
    icon: "×",
    className: "border-rose-500/30 bg-rose-500/15 text-rose-300",
  },
};

const formatDate = (value: string | null) => {
  if (!value) return "Unknown start time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
};

const formatDuration = (value: number | null) => {
  if (value === null) return null;
  if (value < 1) return `${Math.round(value * 1000)} ms`;
  if (value < 60) return `${value.toFixed(2)} s`;

  const totalSeconds = Math.round(value);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return [
      `${hours}h`,
      minutes > 0 ? `${minutes}m` : null,
      seconds > 0 ? `${seconds}s` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
};

const formatCompactDuration = (value: number) => {
  if (value < 10) return `${value.toFixed(1)}s`;
  if (value < 60) return `${Math.round(value)}s`;

  const totalSeconds = Math.round(value);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;

  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
};

const clockListeners = new Set<() => void>();
let clockInterval: ReturnType<typeof setInterval> | null = null;
let clockNow = 0;

const subscribeToClock = (listener: () => void) => {
  clockListeners.add(listener);
  if (clockInterval === null) {
    clockNow = Date.now();
    clockInterval = setInterval(() => {
      clockNow = Date.now();
      for (const notify of clockListeners) notify();
    }, 1_000);
  }

  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockInterval !== null) {
      clearInterval(clockInterval);
      clockInterval = null;
      clockNow = 0;
    }
  };
};

const getClockSnapshot = () => clockNow;
const getServerClockSnapshot = () => 0;

const LiveDuration: FunctionComponent<{
  compact?: boolean;
  startedAt: string;
}> = ({ compact = false, startedAt }) => {
  const now = useSyncExternalStore(
    subscribeToClock,
    getClockSnapshot,
    getServerClockSnapshot,
  );
  const startedAtMs = Date.parse(startedAt);
  if (now === 0 || Number.isNaN(startedAtMs)) return null;

  const duration = Math.max(0, (now - startedAtMs) / 1_000);
  return compact ? formatCompactDuration(duration) : formatDuration(duration);
};

type SelectedResultData = {
  host: string;
  task: string;
  play: string;
  result: HostTaskResult;
};

const SelectedResult: FunctionComponent<{
  onClose: () => void;
  value: SelectedResultData;
}> = ({ onClose, value }) => {
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-end">
      <button
        aria-label="Close task result details"
        className="absolute inset-0 bg-black/25"
        onClick={onClose}
        type="button"
      />
      <section
        aria-label="Task result details"
        aria-modal="true"
        className="relative z-10 h-full w-full max-w-md overflow-y-auto border-l border-slate-700 bg-slate-950 p-6 shadow-2xl shadow-black/60"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-indigo-400">
              {value.play}
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-100">
              {value.task}
            </h3>
          </div>
          <button
            aria-label="Close details"
            className="grid size-8 place-items-center rounded-lg text-xl text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <dl className="mt-6 grid grid-cols-[6rem_1fr] gap-y-3 text-sm">
          <dt className="text-slate-600">Host</dt>
          <dd className="break-all font-mono text-slate-300">{value.host}</dd>
          <dt className="text-slate-600">Status</dt>
          <dd className="font-semibold text-slate-300">
            {statusPresentation[value.result.status].label}
          </dd>
          <dt className="text-slate-600">Duration</dt>
          <dd className="text-slate-300">
            {value.result.duration !== null ? (
              formatDuration(value.result.duration)
            ) : value.result.status === "running" && value.result.startedAt ? (
              <LiveDuration startedAt={value.result.startedAt} />
            ) : (
              "Not reported"
            )}
          </dd>
        </dl>
        {value.result.detail && (
          <div className="mt-7">
            <p className="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">
              Result detail
            </p>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-[#090c11] p-4 font-mono text-xs leading-5 text-slate-400">
              <AnsiText>{value.result.detail}</AnsiText>
            </pre>
          </div>
        )}
      </section>
    </div>
  );
};

export const Job: FunctionComponent<{ job: AwxJob }> = ({ job }) => {
  const [selectedResult, setSelectedResult] =
    useState<SelectedResultData | null>(null);
  const [, setAwxJob] = useAwxJob();
  const tasks = useTasks();
  const playGroups = usePlayGroups();
  const hosts = useHosts();
  const [hostSort, setHostSort] = useHostSort();
  const counts = useResultCounts();
  const isLoading = useIsJobLoading();
  const error = useJobError();
  const reload = useReloadJob();

  useEffect(() => {
    setAwxJob(job);
  }, [job, setAwxJob]);

  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#0b0e14]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
        <header className="sticky left-0 border-b border-slate-800 bg-[#0d1118] px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                <span className="truncate">{job.playbook}</span>
                <span aria-hidden="true">/</span>
                <span className="font-mono">#{job.id}</span>
              </div>
              <h2 className="truncate text-xl font-bold tracking-tight text-slate-100">
                {job.name}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Started{" "}
                <time
                  dateTime={job.started ?? undefined}
                  suppressHydrationWarning
                >
                  {formatDate(job.started)}
                </time>
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isLoading && tasks.length > 0 && (
                <span className="text-xs text-slate-500">Streaming…</span>
              )}
              <button
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
                disabled={isLoading}
                onClick={reload}
                type="button"
              >
                Refresh
              </button>
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${
                  job.status === "successful"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : job.status === "failed" || job.status === "error"
                      ? "bg-rose-500/15 text-rose-300"
                      : "bg-sky-500/15 text-sky-300"
                }`}
              >
                {job.status}
              </span>
            </div>
          </div>

          {(tasks.length > 0 || hosts.length > 0) && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
              <span>
                <strong className="text-slate-300">{hosts.length}</strong> hosts
              </span>
              <span>
                <strong className="text-slate-300">{tasks.length}</strong> tasks
              </span>
              {(Object.keys(statusPresentation) as TaskStatus[]).map(
                (status) =>
                  counts[status] ? (
                    <span key={status} className="flex items-center gap-1.5">
                      <span
                        className={`size-2 rounded-full ${statusPresentation[status].className}`}
                      />
                      {counts[status]}{" "}
                      {statusPresentation[status].label.toLowerCase()}
                    </span>
                  ) : null,
              )}
            </div>
          )}
        </header>

        {isLoading && tasks.length === 0 && (
          <div className="grid flex-1 place-items-center">
            <div className="text-center">
              <div className="mx-auto size-8 animate-spin rounded-full border-2 border-slate-800 border-t-indigo-400" />
              <p className="mt-3 text-sm text-slate-500">
                Loading host results…
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="m-6 rounded-xl border border-rose-500/20 bg-rose-500/10 p-5">
            <p className="font-semibold text-rose-300">
              Could not load job events
            </p>
            <p className="mt-1 text-sm text-rose-300/70">{error}</p>
          </div>
        )}

        {!isLoading && !error && tasks.length === 0 && (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <p className="text-base font-semibold text-slate-300">
                No task events yet
              </p>
              <p className="mt-1 text-sm text-slate-600">
                The job may not have started, or AWX returned no task data.
              </p>
            </div>
          </div>
        )}

        {tasks.length > 0 && (
          <table className="matrix-table w-max min-w-full border-separate border-spacing-0 text-left">
            <thead className="sticky top-0 z-20">
              <tr>
                <th
                  className="sticky left-0 z-30 min-w-56 border-r border-b border-slate-800 bg-[#111620] px-4 py-2 text-[10px] font-bold tracking-[0.14em] text-slate-500 uppercase"
                  rowSpan={2}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span>Host</span>
                    <label>
                      <span className="sr-only">Sort hosts</span>
                      <select
                        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold tracking-normal text-slate-400 normal-case outline-none hover:border-slate-600 focus:border-indigo-500"
                        onChange={(event) =>
                          setHostSort(
                            event.target.value === "name" ? "name" : "status",
                          )
                        }
                        value={hostSort}
                      >
                        <option value="status">Status</option>
                        <option value="name">Name</option>
                      </select>
                    </label>
                  </div>
                </th>
                {playGroups.map((play) => (
                  <th
                    key={play.id}
                    className="border-r border-b border-slate-800 bg-[#111620] px-3 py-2 text-center text-[10px] font-bold tracking-[0.12em] text-indigo-300/80 uppercase"
                    colSpan={play.count}
                  >
                    <span
                      className="block max-w-full truncate"
                      title={play.name}
                    >
                      {play.name}
                    </span>
                  </th>
                ))}
              </tr>
              <tr>
                {tasks.map((task, index) => (
                  <th
                    key={task.id}
                    className="h-20 w-28 max-w-28 min-w-28 border-r border-b border-slate-800 bg-[#111620] px-3 py-2 align-bottom text-xs font-semibold text-slate-400"
                    title={task.name}
                  >
                    <span className="line-clamp-3 leading-4">
                      <span className="mr-1 font-mono text-[9px] text-slate-600">
                        {index + 1}
                      </span>
                      {task.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hosts.map((host) => (
                <tr key={host.name} className="group">
                  <th
                    className="sticky left-0 z-10 max-w-56 border-r border-b border-slate-800/80 bg-[#0f131b] px-4 py-3 font-mono text-xs font-medium text-slate-300 group-hover:bg-[#151a24]"
                    title={host.name}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold ${hostStatusPresentation[host.status].className}`}
                        title={hostStatusPresentation[host.status].label}
                      >
                        <span aria-hidden="true">
                          {hostStatusPresentation[host.status].icon}
                        </span>
                        <span className="sr-only">
                          {hostStatusPresentation[host.status].label}
                        </span>
                      </span>
                      <span className="min-w-0 truncate">{host.name}</span>
                    </span>
                  </th>
                  {tasks.map((task) => {
                    const result = host.results.get(task.id);
                    if (!result) {
                      return (
                        <td
                          key={task.id}
                          className="border-r border-b border-slate-800/60 bg-[#0b0e14] p-2 text-center group-hover:bg-[#0e1219]"
                        >
                          <span className="text-slate-800">·</span>
                        </td>
                      );
                    }
                    const presentation = statusPresentation[result.status];
                    return (
                      <td
                        key={task.id}
                        className="border-r border-b border-slate-800/60 bg-[#0b0e14] p-2 text-center group-hover:bg-[#0e1219]"
                      >
                        <button
                          className={`mx-auto flex h-8 min-w-12 items-center justify-center gap-1.5 rounded-md border px-2 font-mono text-xs font-bold transition hover:brightness-125 ${presentation.className}`}
                          onClick={() =>
                            setSelectedResult({
                              host: host.name,
                              task: task.name,
                              play: task.play,
                              result,
                            })
                          }
                          title={`${presentation.label}${formatDuration(result.duration) ? ` · ${formatDuration(result.duration)}` : ""}`}
                          type="button"
                        >
                          <span aria-hidden="true">{presentation.icon}</span>
                          {result.duration !== null ? (
                            <span className="text-[9px] opacity-70">
                              {formatCompactDuration(result.duration)}
                            </span>
                          ) : (
                            result.status === "running" &&
                            result.startedAt && (
                              <span className="text-[9px] opacity-70">
                                <LiveDuration
                                  compact
                                  startedAt={result.startedAt}
                                />
                              </span>
                            )
                          )}
                          <span className="sr-only">{presentation.label}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedResult ? (
        <SelectedResult
          onClose={() => setSelectedResult(null)}
          value={selectedResult}
        />
      ) : null}
    </main>
  );
};
