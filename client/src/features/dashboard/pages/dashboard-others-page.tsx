import { DashboardPageShell } from '@/features/dashboard/components/dashboard-page-shell';

export const DashboardOthersPage = (): JSX.Element => (
  <DashboardPageShell title="Others" description="Auxiliary tools and integrations.">
    <div className="simple-list">
      <article>
        <h3>Workflow event log</h3>
        <p>Browse evaluated rules and emitted automation actions.</p>
      </article>
      <article>
        <h3>Resend diagnostics</h3>
        <p>Validate outbound notifications and delivery statuses.</p>
      </article>
    </div>
  </DashboardPageShell>
);
