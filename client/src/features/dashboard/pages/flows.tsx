import { DashboardShell } from '@/features/dashboard/components/shell';

export const DashboardFlowsPage = (): JSX.Element => (
  <DashboardShell title="Flows" description="Build and manage proposal automation flows.">
    <div className="simple-list">
      <article>
        <h3>Treasury Safety Flow</h3>
        <p>Transfer checks + config updates + manual approval gate.</p>
      </article>
      <article>
        <h3>Voting Reminder Flow</h3>
        <p>Trigger email 5 hours before voting end and queue execution on success.</p>
      </article>
    </div>
  </DashboardShell>
);
