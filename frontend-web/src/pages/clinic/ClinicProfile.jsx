import React, { useState, useEffect } from 'react';
import api from '../../services/api';

const ClinicProfile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/clinic/profile');
        if (res.data.success) setProfile(res.data.clinic);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!profile) return <div>Failed to load profile.</div>;

  return (
    <div>
      <div className="page-header">
        <h2>Clinic Profile</h2>
        <p>Your clinic's official information.</p>
      </div>

      <div className="card" style={{ maxWidth: '600px' }}>
        <table className="table" style={{ width: '100%', textAlign: 'left' }}>
          <tbody>
            <tr>
              <th style={{ width: '40%', padding: '1rem 0' }}>Clinic Name</th>
              <td>{profile.clinic_name}</td>
            </tr>
            <tr>
              <th style={{ padding: '1rem 0' }}>Registration Number</th>
              <td>{profile.registration_number}</td>
            </tr>
            <tr>
              <th style={{ padding: '1rem 0' }}>Address</th>
              <td>{profile.address}, {profile.city}, {profile.state}</td>
            </tr>
            <tr>
              <th style={{ padding: '1rem 0' }}>Contact Phone</th>
              <td>{profile.phone}</td>
            </tr>
            <tr>
              <th style={{ padding: '1rem 0' }}>Contact Email</th>
              <td>{profile.email}</td>
            </tr>
            <tr>
              <th style={{ padding: '1rem 0' }}>Status</th>
              <td>
                <span className={`badge ${profile.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
                  {profile.status}
                </span>
              </td>
            </tr>
            <tr>
              <th style={{ padding: '1rem 0' }}>Registered On</th>
              <td>{new Date(profile.created_at).toLocaleDateString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default ClinicProfile;
