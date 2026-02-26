import { DashboardPageShell } from '@/features/dashboard/components/dashboard-page-shell';

export const DashboardNotificationsPage = (): JSX.Element => (
  <DashboardPageShell title="Notifications" description="Keep operators and delegates informed by state and timing.">
    <div className="simple-list">
      <article>
        <h3>Voting ends in 5h</h3>
        <p>Email reminders sent to ops@daometer.dev and dao-core@daometer.dev.</p>
      </article>
      <article>
        <h3>Manual approval needed</h3>
        <p>Execution paused pending review for high-risk proposal.</p>
      </article>
    </div>
  </DashboardPageShell>
);
