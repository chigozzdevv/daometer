import { DashboardPageShell } from '@/features/dashboard/components/dashboard-page-shell';

export const DashboardSettingsPage = (): JSX.Element => (
  <DashboardPageShell title="Settings" description="Configure environment behavior and automation defaults.">
    <div className="simple-list">
      <article>
        <h3>Risk limits</h3>
        <p>Define max risk score for auto execution and manual approval requirements.</p>
      </article>
      <article>
        <h3>Worker defaults</h3>
        <p>Adjust retry delay, max attempts, and polling interval guidance.</p>
      </article>
    </div>
  </DashboardPageShell>
);
