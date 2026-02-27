import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardLayout } from '@/app/layouts/dashboard-layout';
import { ProtectedRoute } from '@/app/router/protected-route';
import { PublicOnlyRoute } from '@/app/router/public-only-route';
import { AuthPage } from '@/features/auth/pages/auth';
import { DashboardDaosPage } from '@/features/dashboard/pages/daos';
import { DashboardExecutionPage } from '@/features/dashboard/pages/execution';
import { DashboardFlowsPage } from '@/features/dashboard/pages/flows';
import { DashboardNotificationsPage } from '@/features/dashboard/pages/notifications';
import { DashboardOverviewPage } from '@/features/dashboard/pages/overview';
import { DashboardProposalsPage } from '@/features/dashboard/pages/proposals';
import { DashboardSettingsPage } from '@/features/dashboard/pages/settings';
import { DashboardWorkflowsPage } from '@/features/dashboard/pages/workflows';
import { LandingPage } from '@/features/landing/pages/landing';

export const AppRouter = (): JSX.Element => (
  <Routes>
    <Route path="/" element={<LandingPage />} />

    <Route element={<PublicOnlyRoute />}>
      <Route path="/auth" element={<AuthPage />} />
    </Route>

    <Route element={<ProtectedRoute />}>
      <Route element={<DashboardLayout />}>
        <Route path="/dashboard" element={<DashboardOverviewPage />} />
        <Route path="/dashboard/daos" element={<DashboardDaosPage />} />
        <Route path="/dashboard/proposals" element={<DashboardProposalsPage />} />
        <Route path="/dashboard/flows" element={<DashboardFlowsPage />} />
        <Route path="/dashboard/workflows" element={<DashboardWorkflowsPage />} />
        <Route path="/dashboard/notifications" element={<DashboardNotificationsPage />} />
        <Route path="/dashboard/executions" element={<DashboardExecutionPage />} />
        <Route path="/dashboard/settings" element={<DashboardSettingsPage />} />
      </Route>
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
