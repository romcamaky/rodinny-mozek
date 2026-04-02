import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { ToastProvider } from './contexts/ToastContext'
import Capture from './pages/Capture'
import MealPlan from './pages/MealPlan'
import Notes from './pages/Notes'
import Places from './pages/Places'
import Tasks from './pages/Tasks'

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            {/* Capture is the default route because voice-first capture is the main entry point. */}
            <Route path="/" element={<Navigate to="/capture" replace />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/places" element={<Places />} />
            <Route path="/meal-plan" element={<MealPlan />} />
            <Route path="*" element={<Navigate to="/capture" replace />} />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App
