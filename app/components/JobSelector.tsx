"use client";

import Link from "next/link";
import { type FunctionComponent, useMemo, useState } from "react";
import type { AwxJob, JobStatus } from "@/app/lib/data";

const statusClass: Record<JobStatus, string> = {
  new: "bg-slate-500",
  pending: "bg-amber-400",
  waiting: "bg-amber-400",
  running: "bg-sky-400",
  successful: "bg-emerald-400",
  failed: "bg-rose-400",
  error: "bg-rose-400",
  canceled: "bg-slate-500",
};

const formatStarted = (value: string | null) => {
  if (!value) return "Start time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const JobItem: FunctionComponent<{
  job: AwxJob;
  selected: boolean;
}> = ({ job, selected }) => (
  <Link
    href={`?job=${job.id}`}
    className={`mb-1 block rounded-xl border px-3 py-3 transition ${
      selected
        ? "border-indigo-500/30 bg-indigo-500/10"
        : "border-transparent hover:border-slate-800 hover:bg-slate-900"
    }`}
  >
    <div className="flex items-start gap-3">
      <span
        className={`mt-1.5 size-2 shrink-0 rounded-full ${statusClass[job.status]}`}
        title={job.status}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={`truncate text-sm font-semibold ${selected ? "text-indigo-200" : "text-slate-300"}`}
          >
            {job.name}
          </p>
          <span className="shrink-0 font-mono text-[10px] text-slate-600">
            #{job.id}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">{job.playbook}</p>
        <time
          className="mt-1.5 block text-[11px] text-slate-600"
          dateTime={job.started ?? undefined}
          suppressHydrationWarning
        >
          {formatStarted(job.started)}
        </time>
      </div>
    </div>
  </Link>
);

export const JobSelector: FunctionComponent<{
  jobs: AwxJob[];
  selectedJobId: number | null;
}> = ({ jobs, selectedJobId }) => {
  const [query, setQuery] = useState("");
  const playbooks = useMemo(
    () => [...new Set(jobs.map((job) => job.playbook))].sort(),
    [jobs],
  );
  const [playbook, setPlaybook] = useState("all");
  const filteredJobs = jobs.filter((job) => {
    const matchesPlaybook = playbook === "all" || job.playbook === playbook;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      job.name.toLocaleLowerCase().includes(normalizedQuery) ||
      String(job.id).includes(normalizedQuery);
    return matchesPlaybook && matchesQuery;
  });
  const runningJobs = filteredJobs.filter((job) => job.status === "running");
  const recentJobs = filteredJobs.filter((job) => job.status !== "running");

  return (
    <aside className="flex h-auto max-h-80 min-h-0 w-full flex-col border-b border-slate-800 bg-slate-950/80 lg:h-full lg:max-h-none lg:w-80 lg:shrink-0 lg:border-r lg:border-b-0">
      <div className="border-b border-slate-800 p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-indigo-500 text-lg font-black text-white shadow-lg shadow-indigo-950/40">
            A
          </div>
          <div>
            <h1 className="font-bold tracking-tight text-slate-100">
              AWX Jobs
            </h1>
            <p className="text-xs text-slate-500">Execution matrix</p>
          </div>
        </div>
        <label className="relative block">
          <span className="sr-only">Search jobs</span>
          <svg
            aria-hidden="true"
            className="absolute top-2.5 left-3 size-4 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeWidth="2"
              d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
            />
          </svg>
          <input
            className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2 pr-3 pl-9 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search job or ID"
            value={query}
          />
        </label>
        <label className="mt-3 block">
          <span className="sr-only">Filter by playbook</span>
          <select
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-indigo-500"
            onChange={(event) => setPlaybook(event.target.value)}
            value={playbook}
          >
            <option value="all">All playbooks</option>
            {playbooks.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Jobs">
        {runningJobs.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-bold tracking-[0.16em] text-sky-400 uppercase">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-sky-400" />
              </span>
              Running · {runningJobs.length}
            </div>
            {runningJobs.map((job) => (
              <JobItem
                key={job.id}
                job={job}
                selected={selectedJobId === job.id}
              />
            ))}
            <div className="mx-3 my-2 border-t border-slate-800" />
          </>
        )}
        <div className="px-3 py-2 text-[11px] font-bold tracking-[0.16em] text-slate-600 uppercase">
          Recent runs · {recentJobs.length}
        </div>
        {recentJobs.map((job) => (
          <JobItem key={job.id} job={job} selected={selectedJobId === job.id} />
        ))}
        {filteredJobs.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-slate-600">
            No matching jobs
          </p>
        )}
      </nav>
    </aside>
  );
};
