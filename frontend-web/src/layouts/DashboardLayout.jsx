// src/layouts/DashboardLayout.jsx
import React from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ── Icon helpers ── */
const Icon = ({ children }) => (
  <span className="sidebar-nav-icon" aria-hidden="true">{children}</span>
);

/* ── Nav link configs per role ── */
const NAV_LINKS = {
  1: [ // Admin
    { to: '/admin/dashboard',  icon: '📊', label: 'Dashboard'     },
    { type: 'header', label: 'Healthcare' },
    { to: '/admin/clinics',    icon: '🏥', label: 'Clinics'       },
    { to: '/admin/doctors',    icon: '👨‍⚕️', label: 'Doctors'       },
    { type: 'header', label: 'Administration' },
    { to: '/admin/roles',      icon: '👥', label: 'Users & Roles'  },
    { to: '/admin/reports',    icon: '📈', label: 'Reports'        },
    { to: '/admin/settings',   icon: '⚙️', label: 'Settings'      },
  ],
  2: [ // Clinic
    { to: '/clinic/dashboard',    icon: '📊', label: 'Dashboard'    },
    { to: '/clinic/book-token',   icon: '🎟️', label: 'Token Booking'   },
    { to: '/clinic/block-slots',  icon: '🚫', label: 'Freeze Slots' },
    { to: '/clinic/doctors',      icon: '👨‍⚕️', label: 'Doctors'      },
    { to: '/clinic/staff',        icon: '👥', label: 'Staff'        },
    { to: '/clinic/patients',     icon: '🧑', label: 'Patients'     },
    { to: '/clinic/availability', icon: '📅', label: 'Manage Slots' },
    { to: '/clinic/appointments', icon: '📋', label: 'Appointments' },
    { to: '/clinic/reports',      icon: '📈', label: 'Reports'       },
    { to: '/clinic/profile',      icon: '🏥', label: 'Clinic Profile' },
    { to: '/clinic/settings',     icon: '⚙️', label: 'Settings'     },
  ],
  3: [ // Doctor
    { to: '/doctor/dashboard',    icon: '📊', label: 'Dashboard'    },
    { to: '/doctor/appointments', icon: '📋', label: 'Appointments' },
    { to: '/doctor/patients',     icon: '🧑', label: 'Patients'     },
    { to: '/doctor/slots',        icon: '📅', label: 'Manage Slots' },
    { to: '/doctor/settings',     icon: '⚙️', label: 'Settings'     },
  ],
};

const ROLE_META = {
  1: { label: 'Admin',  badgeClass: 'admin',  },
  2: { label: 'Clinic', badgeClass: 'clinic', },
  3: { label: 'Doctor', badgeClass: 'doctor', },
};

/* ── Derive page title from pathname ── */
const getPageTitle = (pathname) => {
  if (pathname.includes('/admin/roles'))        return 'Users & Roles';
  if (pathname.includes('/admin/doctors'))      return 'Doctors';
  if (pathname.includes('/admin/reports'))      return 'Reports';
  if (pathname.includes('/admin/audit-logs'))   return 'Audit Logs';
  if (pathname.includes('/admin/settings'))     return 'Settings';
  if (pathname.includes('/admin/appointments')) return 'Appointments';
  if (pathname.includes('/clinic/availability')) return 'Manage Slots';
  if (pathname.includes('/clinic/book-token'))   return 'Token Booking';
  if (pathname.includes('/clinic/block-slots'))  return 'Freeze Slots';
  if (pathname.includes('/clinic/reports'))      return 'Reports';
  const last = pathname.split('/').filter(Boolean).pop() || '';
  return last.charAt(0).toUpperCase() + last.slice(1);
};

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Close sidebar on route change (mobile)
  React.useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  const links    = (user && NAV_LINKS[user.role_id]) || [];
  const roleMeta = (user && ROLE_META[user.role_id]) || { label: 'User', badgeClass: '' };

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className={`app-container ${user?.role_id === 2 ? 'clinic-color-grade' : ''}`}>
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="sidebar-overlay" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR ─────────────────────────────── */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-header">
          <div className="sidebar-logo">🏥</div>
          <div className="sidebar-brand">
            <span className="sidebar-brand-name">ClinicSystem</span>
            <span className="sidebar-brand-tagline">Management Platform</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav" style={{ marginTop: '0.2rem' }}>
          {links.map((item, index) => {
            if (item.type === 'header') {
              return (
                <div key={`header-${index}`} className="sidebar-section-label" style={{ marginTop: index === 0 ? 0 : '0.4rem' }}>
                  {item.label}
                </div>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => isActive ? 'active' : ''}
              >
                <Icon>{item.icon}</Icon>
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer / User pill */}
        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.5rem', marginBottom: '0.5rem' }}>
            <div className="user-avatar" style={{ width: 32, height: 32, fontSize: '0.7rem' }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.full_name}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </div>
            </div>
          </div>
          <button className="sidebar-logout-btn" onClick={handleLogout} id="logout-btn">
            <Icon>🚪</Icon>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── MAIN ───────────────────────────────── */}
      {/* Every role now shares the same dark theme — the clinic
          portal no longer switches to the separate light "clinic-theme"
          palette, so Admin/Clinic/Doctor all look and feel consistent. */}
      <main className="main-content">
        {/* Top nav */}
        <header className="top-nav" style={{ position: 'relative' }}>
          <div className="top-nav-left" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem' }}>
            <button 
              className="mobile-menu-btn" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Toggle menu"
            >
              ☰
            </button>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="top-nav-title">{pageTitle}</div>
            </div>
          </div>

          {/* Clinic name — absolutely centred in the header */}
          {user?.clinic_name && (
            <div style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              fontWeight: 800,
              fontSize: '1.35rem',
              color: '#7dd3fc',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}>
              {user.clinic_name}
            </div>
          )}

          <div className="top-nav-right">
            <div className="user-pill">
              <div className="user-avatar">{initials}</div>
              <span className="user-name">{user?.full_name}</span>
              <span className={`role-badge ${roleMeta.badgeClass}`}>{roleMeta.label}</span>
            </div>
          </div>
        </header>

        {/* MAIN CONTENT AREA */}
        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;