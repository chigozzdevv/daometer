import type { PropsWithChildren } from 'react';

type DashboardShellProps = PropsWithChildren<{
  title: string;
  description: string;
}>;

export const DashboardShell = ({ title, description, children }: DashboardShellProps): JSX.Element => (
  <section className="dashboard-page-shell">
    <header className="dashboard-page-header">
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
    {children}
  </section>
);
