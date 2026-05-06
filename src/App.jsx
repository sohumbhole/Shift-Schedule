import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import Login from './pages/Login';
import { UndoHistoryProvider } from '@/lib/undoHistory';
import { DashboardNavProvider } from '@/lib/dashboardNav';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import UndoToast from '@/components/ui/UndoToast';
import { useState, useCallback } from 'react';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// Mounts the global Ctrl+Z / Ctrl+Shift+Z listener and the undo toast.
// Must live inside the Router so it can use useNavigate/useLocation.
function UndoRedoController() {
  const [toast, setToast] = useState(null);
  const [toastKey, setToastKey] = useState(0);

  const showToast = useCallback(({ message, isRedo }) => {
    setToast({ message, isRedo });
    setToastKey((k) => k + 1);
  }, []);

  useUndoRedo({ showToast });

  return toast ? (
    <UndoToast
      key={toastKey}
      message={toast.message}
      isRedo={toast.isRedo}
      onDismiss={() => setToast(null)}
    />
  ) : null;
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <>
      <UndoRedoController />
      <Routes>
        <Route path="/" element={
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        } />
        {Object.entries(Pages).map(([path, Page]) => (
          <Route
            key={path}
            path={`/${path}`}
            element={
              <LayoutWrapper currentPageName={path}>
                <Page />
              </LayoutWrapper>
            }
          />
        ))}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </>
  );
};


function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <UndoHistoryProvider>
        <DashboardNavProvider>
          <Router>
            <Routes>
              <Route
                path="/login"
                element={isSupabaseConfigured() ? <Login /> : <Navigate to="/" replace />}
              />
              <Route
                path="*"
                element={
                  <AuthProvider>
                    <AuthenticatedApp />
                  </AuthProvider>
                }
              />
            </Routes>
          </Router>
          <Toaster />
        </DashboardNavProvider>
      </UndoHistoryProvider>
    </QueryClientProvider>
  )
}

export default App
