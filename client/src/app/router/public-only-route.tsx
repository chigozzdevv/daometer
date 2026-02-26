import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/app/providers/auth-provider';

export const PublicOnlyRoute = (): JSX.Element => {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
