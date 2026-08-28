import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { ThemeProvider } from './theme/ThemeProvider';
import { Layout } from './components/Layout';
import { AppShell } from './components/shell/AppShell';
import { WelcomePage } from './pages/WelcomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { GestureEnrollmentPage } from './pages/GestureEnrollmentPage';
import { MessagesPage } from './pages/MessagesPage';
import { SearchPage } from './pages/SearchPage';
import { ProfilePage } from './pages/ProfilePage';
import { GestureSettingsPage } from './pages/GestureSettingsPage';
import { DevicesPage } from './pages/DevicesPage';
import { ConversationPage } from './pages/ConversationPage';
import { ContactSecurityPage } from './pages/ContactSecurityPage';

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<WelcomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Enrollment runs outside the shell: it is the last step of sign-up, and the
                  bottom bar would offer escapes from a flow that has nothing to escape to. */}
              <Route
                path="/enroll"
                element={
                  <ProtectedRoute>
                    <GestureEnrollmentPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<MessagesPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="profile/gesture" element={<GestureSettingsPage />} />
                <Route path="profile/devices" element={<DevicesPage />} />
                <Route path="conversations/:conversationId" element={<ConversationPage />} />
                <Route
                  path="conversations/:conversationId/security"
                  element={<ContactSecurityPage />}
                />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
