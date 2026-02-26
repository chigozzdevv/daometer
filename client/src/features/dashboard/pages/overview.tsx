import { DashboardShell } from '@/features/dashboard/components/shell';
import { MetricCard } from '@/features/dashboard/components/metric';

export const DashboardOverviewPage = (): JSX.Element => (
  <DashboardShell
    title="Overview"
    description="Track proposal health, workflow coverage, and execution stability from one place."
  >
    <div className="metric-grid">
      <MetricCard label="Active flows" value="12" />
      <MetricCard label="Queued executions" value="5" tone="accent" />
      <MetricCard label="Failed jobs" value="1" />
      <MetricCard label="Workflow rules" value="9" />
    </div>
  </DashboardShell>
);
