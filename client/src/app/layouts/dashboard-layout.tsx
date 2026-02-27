import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { navItems } from '@/app/constants/nav-items';
import { useAuth } from '@/app/providers/auth-provider';
import { getAuthProfile } from '@/features/dashboard/api/api';
import { shortAddress } from '@/features/dashboard/lib/format';

const navLinkClassName = ({ isActive }: { isActive: boolean }): string =>
  `dashboard-sidebar-link${isActive ? ' dashboard-sidebar-link-active' : ''}`;

export const DashboardLayout = (): JSX.Element => {
  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async (): Promise<void> => {
      if (!session?.accessToken) {
        setIsAdmin(false);
        setWalletAddress(null);
        return;
      }

      try {
        const profile = await getAuthProfile(session.accessToken);
        if (isMounted) {
          setIsAdmin(profile.roles.includes('admin'));
          setWalletAddress(profile.walletAddress);
        }
      } catch {
        if (isMounted) {
          setIsAdmin(false);
          setWalletAddress(null);
        }
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [session?.accessToken]);

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => !item.requiresAdmin || isAdmin),
    [isAdmin],
  );

  const handleDisconnect = (): void => {
    signOut();
    navigate('/');
  };

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <p className="dashboard-brand">Daometer</p>
        <nav className="dashboard-sidebar-nav">
          {visibleNavItems.map((item) => (
            <NavLink key={item.href} to={item.href} end={item.href === '/dashboard'} className={navLinkClassName}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="dashboard-content-area">
        <header className="dashboard-topbar">
          <div>
            <p className="dashboard-topbar-kicker">Automation Workspace</p>
            <p className="dashboard-topbar-title">Operations Console</p>
          </div>
          <div className="dashboard-topbar-actions">
            <span className="status-chip status-chip--gray">
              {walletAddress ? shortAddress(walletAddress, 6) : 'No wallet'}
            </span>
            <button type="button" className="secondary-button" onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>
        </header>

        <section className="dashboard-main-panel">
          <Outlet />
        </section>
      </main>
    </div>
  );
};
