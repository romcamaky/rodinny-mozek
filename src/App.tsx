import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { ToastProvider } from './contexts/ToastContext'
import { AuthProvider } from './lib/authContext'
import Dashboard from './pages/Dashboard'
import MealPlan from './pages/MealPlan'
import AddMilestonePage from './pages/AddMilestonePage'
import MilestoneDetailPage from './pages/MilestoneDetailPage'
import MilestonesPage from './pages/MilestonesPage'
import LoginPage from './pages/LoginPage'
import Notes from './pages/Notes'
import Places from './pages/Places'
import Tasks from './pages/Tasks'
import WellbeingPage from './pages/WellbeingPage'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              {/* Capture is the default route because voice-first capture is the main entry point. */}
              <Route path="/" element={<Navigate to="/tasks" replace />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/places" element={<Places />} />
              <Route path="/meal-plan" element={<MealPlan />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dashboard/wellbeing" element={<WellbeingPage />} />
              <Route path="/milestones" element={<MilestonesPage />} />
              <Route path="/milestones/new" element={<AddMilestonePage />} />
              <Route path="/milestones/:id" element={<MilestoneDetailPage />} />
              <Route path="*" element={<Navigate to="/tasks" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
