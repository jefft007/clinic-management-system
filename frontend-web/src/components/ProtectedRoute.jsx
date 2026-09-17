// src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps routes that require authentication + a specific role.
 * allowedRoles: number[]  — e.g. [1] = Admin, [2] = Clinic, [3] = Doctor
 */
const ProtectedRoute = ({ allowedRoles }) => {
  const { user, token, loading } = useAuth();

  // While restoring session from localStorage, show a full-screen spinner
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-base)',
        }}
      >
        <div className="loading-screen">
          <div className="spinner" />
          <span>Loading session…</span>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated but wrong role — redirect to their home
  if (allowedRoles && !allowedRoles.includes(user.role_id)) {
    if (user.role_id === 1) return <Navigate to="/admin/dashboard"  replace />;
    if (user.role_id === 2) return <Navigate to="/clinic/dashboard" replace />;
    if (user.role_id === 3) return <Navigate to="/doctor/dashboard" replace />;
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
