export type DashboardNavItem = {
  label: string;
  href: string;
  requiresAdmin?: boolean;
};

export const navItems: DashboardNavItem[] = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'DAOs', href: '/dashboard/daos' },
  { label: 'Flows', href: '/dashboard/flows' },
  { label: 'Proposals', href: '/dashboard/proposals' },
  { label: 'Workflows', href: '/dashboard/workflows' },
  { label: 'Notifications', href: '/dashboard/notifications' },
  { label: 'Executions', href: '/dashboard/executions', requiresAdmin: true },
  { label: 'Settings', href: '/dashboard/settings' },
];
