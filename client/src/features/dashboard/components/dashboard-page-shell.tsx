import type { PropsWithChildren } from 'react';

type DashboardPageShellProps = PropsWithChildren<{
  title: string;
  description: string;
}>;

export const DashboardPageShell = ({ title, description, children }: DashboardPageShellProps): JSX.Element => (
  <section className="dashboard-page-shell">
    <header className="dashboard-page-header">
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
    {children}
  </section>
);
