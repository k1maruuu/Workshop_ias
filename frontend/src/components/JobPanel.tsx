import type { BoardJob } from '@/types/experiments'

export function JobPanel({ jobs }: { jobs: BoardJob[] }) {
  if (jobs.length === 0) return null

  return (
    <section className="panel-card">
      <div className="panel-card__header">
        <h2 className="panel-card__title">Запуски</h2>
      </div>
      <div className="panel-card__body">
        <div className="status-list">
          {jobs.map((job) => (
            <article className="status-item" key={job.jobId}>
              <div className="status-item__top">
                <strong>{job.label}</strong>
                <span className={`status-badge status-badge--${job.status}`}>{job.status}</span>
              </div>
              <span>{job.jobId}</span>
              {job.experimentRunId ? <span>run: {job.experimentRunId}</span> : null}
              {job.error ? <span>{job.error}</span> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
