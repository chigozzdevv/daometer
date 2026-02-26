import { DashboardShell } from '@/features/dashboard/components/shell';

export const DashboardExecutionPage = (): JSX.Element => (
  <DashboardShell title="Executions" description="Inspect queue state, retries, and completed actions.">
    <div className="simple-list">
      <article>
        <h3>Job #a13 - processing</h3>
        <p>Onchain execution synced and lock held by worker-1.</p>
      </article>
      <article>
        <h3>Job #a11 - failed once</h3>
        <p>Retry scheduled in 10 minutes due to temporary RPC error.</p>
      </article>
    </div>
  </DashboardShell>
);
