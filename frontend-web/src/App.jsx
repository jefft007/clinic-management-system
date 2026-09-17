import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';

import Login          from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';
import AdminDashboard   from './pages/admin/AdminDashboard';
import ClinicManagement from './pages/admin/ClinicManagement';
import RoleManagement   from './pages/admin/RoleManagement';
import AdminDoctors     from './pages/admin/AdminDoctors';
import Reports          from './pages/admin/Reports';
import AdminSettings    from './pages/admin/AdminSettings';
import ClinicDashboard  from './pages/clinic/ClinicDashboard';
import DoctorDashboard  from './pages/doctor/DoctorDashboard';

// Clinic placeholder components
const Placeholder = ({ title }) => (
  <div style={{ padding: '2rem' }}>
    <h2>{title}</h2>
    <p>Module coming soon.</p>
  </div>
);

// We will create these files next, but for now they can be placeholders if they don't exist
import ClinicDoctors      from './pages/clinic/ClinicDoctors';
import ClinicStaff        from './pages/clinic/ClinicStaff';
import ClinicPatients     from './pages/clinic/ClinicPatients';
import ClinicAvailability from './pages/clinic/ClinicAvailability';
import ClinicAppointments from './pages/clinic/ClinicAppointments';
import ClinicProfile      from './pages/clinic/ClinicProfile';
import ClinicBookToken    from './pages/clinic/ClinicBookToken';
import ClinicBlockSlots   from './pages/clinic/ClinicBlockSlots';
import ClinicReports      from './pages/clinic/ClinicReports';

import DoctorAppointments from './pages/doctor/DoctorAppointments';
import DoctorManageSlots  from './pages/doctor/DoctorManageSlots';
import DoctorPatients     from './pages/doctor/DoctorPatients';
import DoctorSettings     from './pages/doctor/DoctorSettings';

import ClinicSettings     from './pages/clinic/ClinicSettings';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Admin Routes (Role 1) */}
          <Route element={<ProtectedRoute allowedRoles={[1]} />}>
            <Route path="/admin" element={<DashboardLayout />}>
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="clinics"   element={<ClinicManagement />} />
              <Route path="hospitals" element={<ClinicManagement />} />
              <Route path="doctors"   element={<AdminDoctors />} />
              <Route path="roles"     element={<RoleManagement />} />
              <Route path="reports"   element={<Reports />} />
              <Route path="settings"  element={<AdminSettings />} />
              <Route path="*"         element={<Navigate to="dashboard" replace />} />
            </Route>
          </Route>

          {/* Clinic Routes (Role 2) */}
          <Route element={<ProtectedRoute allowedRoles={[2]} />}>
            <Route path="/clinic" element={<DashboardLayout />}>
              <Route path="dashboard"    element={<ClinicDashboard />} />
              <Route path="book-token"   element={<ClinicBookToken />} />
              <Route path="block-slots"  element={<ClinicBlockSlots />} />
              <Route path="doctors"      element={<ClinicDoctors />} />
              <Route path="staff"        element={<ClinicStaff />} />
              <Route path="patients"     element={<ClinicPatients />} />
              <Route path="availability" element={<ClinicAvailability />} />
              <Route path="appointments" element={<ClinicAppointments />} />
              <Route path="reports"      element={<ClinicReports />} />
              <Route path="profile"      element={<ClinicProfile />} />
              <Route path="settings"     element={<ClinicSettings />} />
              <Route path="*"            element={<Navigate to="dashboard" replace />} />
            </Route>
          </Route>

          {/* Doctor Routes (Role 3) */}
          <Route element={<ProtectedRoute allowedRoles={[3]} />}>
            <Route path="/doctor" element={<DashboardLayout />}>
              <Route path="dashboard"    element={<DoctorDashboard />} />
              <Route path="appointments" element={<DoctorAppointments />} />
              <Route path="slots"        element={<DoctorManageSlots />} />
              <Route path="patients"     element={<DoctorPatients />} />
              <Route path="settings"     element={<DoctorSettings />} />
              <Route path="*"            element={<Navigate to="dashboard" replace />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;