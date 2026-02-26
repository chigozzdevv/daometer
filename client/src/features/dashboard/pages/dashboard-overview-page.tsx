import { DashboardPageShell } from '@/features/dashboard/components/dashboard-page-shell';
import { MetricCard } from '@/features/dashboard/components/metric-card';

export const DashboardOverviewPage = (): JSX.Element => (
  <DashboardPageShell
    title="Overview"
    description="Track proposal health, workflow coverage, and execution stability from one place."
  >
    <div className="metric-grid">
      <MetricCard label="Active flows" value="12" />
      <MetricCard label="Queued executions" value="5" tone="accent" />
      <MetricCard label="Failed jobs" value="1" />
      <MetricCard label="Workflow rules" value="9" />
    </div>
  </DashboardPageShell>
);
