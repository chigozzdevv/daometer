import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/app/providers/auth-provider';

export const ProtectedRoute = (): JSX.Element => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
};
