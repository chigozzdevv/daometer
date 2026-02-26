import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardLayout } from '@/app/layouts/dashboard-layout';
import { ProtectedRoute } from '@/app/router/protected-route';
import { PublicOnlyRoute } from '@/app/router/public-only-route';
import { AuthPage } from '@/features/auth/pages/auth-page';
import { DashboardExecutionsPage } from '@/features/dashboard/pages/dashboard-executions-page';
import { DashboardFlowsPage } from '@/features/dashboard/pages/dashboard-flows-page';
import { DashboardNotificationsPage } from '@/features/dashboard/pages/dashboard-notifications-page';
import { DashboardOthersPage } from '@/features/dashboard/pages/dashboard-others-page';
import { DashboardOverviewPage } from '@/features/dashboard/pages/dashboard-overview-page';
import { DashboardSettingsPage } from '@/features/dashboard/pages/dashboard-settings-page';
import { LandingPage } from '@/features/landing/pages/landing-page';

export const AppRouter = (): JSX.Element => (
  <Routes>
    <Route path="/" element={<LandingPage />} />

    <Route element={<PublicOnlyRoute />}>
      <Route path="/auth" element={<AuthPage />} />
    </Route>

    <Route element={<ProtectedRoute />}>
      <Route element={<DashboardLayout />}>
        <Route path="/dashboard" element={<DashboardOverviewPage />} />
        <Route path="/dashboard/flows" element={<DashboardFlowsPage />} />
        <Route path="/dashboard/notifications" element={<DashboardNotificationsPage />} />
        <Route path="/dashboard/executions" element={<DashboardExecutionsPage />} />
        <Route path="/dashboard/others" element={<DashboardOthersPage />} />
        <Route path="/dashboard/settings" element={<DashboardSettingsPage />} />
      </Route>
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
