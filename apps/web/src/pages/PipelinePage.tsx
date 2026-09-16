import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { JOB_STAGES, type JobStage, type JobSummary } from '@bench-press/shared/types';
import { api, errorMessage, JOBS_CHANGED_EVENT } from '../api/client.ts';
import { FitBadge } from '../components/FitBadge.tsx';
import { STAGE_LABELS } from '../components/JobDetail.tsx';
import { formatDate } from '../lib/format.ts';
import { toastError } from '../lib/toast.ts';

type Column = 'applied' | JobStage;
const COLUMNS: Column[] = ['applied', ...JOB_STAGES];
const COLUMN_LABELS: Record<Column, string> = { applied: 'Applied', ...STAGE_LABELS };

function columnOf(job: JobSummary): Column {
  return job.status === 'replied' ? (job.stage ?? 'replied') : 'applied';
}

/**
 * Kanban of everything applied to. Cards move with drag and drop or the arrow buttons;
 * every move is stored as a stage change and shows up in the job's history.
 */
export function PipelinePage() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<number | null>(null);

  const load = useCallback(() => {
    api.jobs
      .pipeline()
      .then(setJobs)
      .catch((err: unknown) => toastError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(JOBS_CHANGED_EVENT, load);
    return () => window.removeEventListener(JOBS_CHANGED_EVENT, load);
  }, [load]);

  const move = async (id: number, column: Column) => {
    const stage = column === 'applied' ? null : column;
    setJobs((current) =>
      current.map((job) =>
        job.id === id ? { ...job, stage, status: stage ? 'replied' : 'applied' } : job,
      ),
    );
    try {
      await api.jobs.update(id, { stage });
    } catch (err) {
      toastError(`Could not move: ${errorMessage(err)}`);
      load();
    }
  };

  const onDrop = (column: Column) => (event: DragEvent) => {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData('text/plain') || dragging);
    if (id) void move(id, column);
    setDragging(null);
  };

  return (
    <div className="board">
      {COLUMNS.map((column, columnIndex) => {
        const cards = jobs.filter((job) => columnOf(job) === column);
        return (
          <section
            key={column}
            className={`board__column board__column--${column}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop(column)}
          >
            <h2 className="board__title">
              {COLUMN_LABELS[column]} <span className="board__count">{cards.length}</span>
            </h2>
            {loading && cards.length === 0 && <p className="board__empty">Loading…</p>}
            {!loading && cards.length === 0 && <p className="board__empty">Empty</p>}
            {cards.map((job) => (
              <article
                key={job.id}
                className="board__card"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', String(job.id));
                  setDragging(job.id);
                }}
              >
                <div className="board__card-head">
                  <FitBadge fit={job.fit} fitRaw={job.fitRaw} notes={job.fitNotes} />
                  <a className="board__card-title" href={`#/jobs/${job.id}`}>
                    {job.title}
                  </a>
                </div>
                <p className="board__card-meta">
                  {job.company ?? 'unknown company'} · {job.source}
                  {job.appliedAt && ` · applied ${formatDate(job.appliedAt)}`}
                  {job.stageUpdatedAt && ` · moved ${formatDate(job.stageUpdatedAt)}`}
                </p>
                {job.notes && <p className="board__card-notes">{job.notes.slice(0, 140)}</p>}
                <div className="board__card-actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    disabled={columnIndex === 0}
                    title="Move left"
                    onClick={() => void move(job.id, COLUMNS[columnIndex - 1] as Column)}
                  >
                    ◀
                  </button>
                  <a className="btn btn--ghost btn--small" href={job.url} target="_blank" rel="noopener noreferrer">
                    Open
                  </a>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    disabled={columnIndex === COLUMNS.length - 1}
                    title="Move right"
                    onClick={() => void move(job.id, COLUMNS[columnIndex + 1] as Column)}
                  >
                    ▶
                  </button>
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
