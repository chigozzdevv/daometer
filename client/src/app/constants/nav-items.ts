export type DashboardNavItem = {
  label: string;
  href: string;
};

export const navItems: DashboardNavItem[] = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'Flows', href: '/dashboard/flows' },
  { label: 'Notifications', href: '/dashboard/notifications' },
  { label: 'Executions', href: '/dashboard/executions' },
  { label: 'Others', href: '/dashboard/others' },
  { label: 'Settings', href: '/dashboard/settings' },
];
