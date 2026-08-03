import { Job } from "./components/Job";
import { JobSelector } from "./components/JobSelector";
import { getJobs } from "./lib/data";

export default async function App(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const jobs = await getJobs();
  const selectedJob =
    jobs.find((job) => job.id.toString() === searchParams.job) ??
    jobs.at(0) ??
    null;

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden text-slate-300 lg:flex-row">
      <JobSelector jobs={jobs} selectedJobId={selectedJob?.id ?? null} />
      {selectedJob ? (
        <Job key={selectedJob.id} job={selectedJob} />
      ) : (
        <main className="grid flex-1 place-items-center bg-[#0b0e14] p-8 text-center">
          <div>
            <h2 className="text-lg font-bold text-slate-200">
              No AWX jobs found
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Finished and active job runs will appear here.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
