import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AppLayout } from './layouts/AppLayout';
import { AppRoutes } from './routes/AppRoutes';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout>
          <AppRoutes />
        </AppLayout>
      </AuthProvider>
    </BrowserRouter>
  );
}
