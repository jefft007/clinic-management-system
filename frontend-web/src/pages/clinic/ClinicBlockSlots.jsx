import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import TokenGrid, { Legend } from '../../components/TokenGrid';

/* helpers — calendar dates in the clinic's local timezone (IST),
   never UTC from toISOString(), which can shift "tomorrow" by a day.
   (Same helpers as ClinicBookToken.jsx, kept in sync deliberately so
   both pages behave identically around dates/sessions.) */
function localYMD(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
function todayStr() { return localYMD(new Date()); }
function plusDays(n) {
  var d = new Date();
  d.setDate(d.getDate() + n);
  return localYMD(d);
}
function dateKey(d) {
  if (!d) return '';
  var s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m && (s.length === 10 || s[10] === ' ')) return m[1];
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) return localYMD(dt);
  return m ? m[1] : s.slice(0, 10);
}
function fmtDateShort(d) {
  if (!d) return '\u2014';
  var dt = new Date(dateKey(d) + 'T00:00:00');
  var wd = dt.toLocaleDateString('en-IN', { weekday: 'short' });
  var dd = String(dt.getDate()).padStart(2, '0');
  var mm = String(dt.getMonth() + 1).padStart(2, '0');
  var yy = dt.getFullYear();
  return wd + ' ' + dd + '/' + mm + '/' + yy;
}
function isSessionExpired(row) {
  if (!row || !row.available_date || !row.end_time) return false;
  var key = dateKey(row.available_date);
  if (key < todayStr()) return true;
  if (key > todayStr()) return false;
  var parts = String(row.end_time).split(':').map(Number);
  var end = new Date();
  end.setHours(parts[0] || 0, parts[1] || 0, 0, 0);
  return end.getTime() <= Date.now();
}

/* Create a single continuous grid of tokens for the day, numbering them
   sequentially (e.g., 1-20 for morning, 21-40 for evening) regardless
   of what token_number the API returned. Sessions the clinic has blocked
   entirely are skipped. Sessions that have ended today are shown so staff
   can see the full picture, but their tokens are forced to is_available=false. */
function buildContinuousGrid(sessionsForDate, tokensBySessId, dateStr) {
  var sorted = sessionsForDate.slice().sort(function(a, b) {
    var ta = String(a.start_time || '').replace(':', '');
    var tb = String(b.start_time || '').replace(':', '');
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  var merged = [];
  var runningNumber = 1;
  for (var i = 0; i < sorted.length; i++) {
    var s = sorted[i];
    if (s.is_clinic_blocked) continue;
    var sessionExpired = dateStr === todayStr() && isSessionExpired(s);

    var tokens = (tokensBySessId[s.availability_id] || []).slice().sort(function(a, b) {
      return Number(a.token_number) - Number(b.token_number);
    });
    
    for (var k = 0; k < tokens.length; k++) {
      var t = tokens[k];
      var poolKey = t.booking_source === 'online' ? 'online' : 'walk_in';
      merged.push(Object.assign({}, t, {
        display_number: runningNumber++,
        unique_id: s.availability_id + '-' + poolKey + '-' + t.token_number,
        session_ref: s,
        is_available: sessionExpired ? false : t.is_available,
        session_expired: sessionExpired,
      }));
    }
  }
  return merged;
}

function isTokenClickable(t) { return t.is_available || t.status === 'Reserved'; }

var ClinicBlockSlots = function() {
  var doctorsState = useState([]);
  var doctors = doctorsState[0]; var setDoctors = doctorsState[1];

  var doctorIdState = useState('');
  var doctorId = doctorIdState[0]; var setDoctorId = doctorIdState[1];

  var maxDateState = useState('');
  var maxDateAllowed = maxDateState[0]; var setMaxDateAllowed = maxDateState[1];

  var fromDateState = useState(todayStr());
  var fromDate = fromDateState[0]; var setFromDate = fromDateState[1];

  var toDateState = useState(plusDays(6));
  var toDate = toDateState[0]; var setToDate = toDateState[1];

  var appliedState = useState({ from: todayStr(), to: plusDays(6) });
  var applied = appliedState[0]; var setApplied = appliedState[1];

  var activePresetState = useState('Week');
  var activePreset = activePresetState[0]; var setActivePreset = activePresetState[1];

  var sessionsState = useState([]);
  var sessions = sessionsState[0]; var setSessions = sessionsState[1];

  var loadingState = useState(false);
  var loading = loadingState[0]; var setLoading = loadingState[1];

  var uniqueDatesState = useState([]);
  var uniqueDates = uniqueDatesState[0]; var setUniqueDates = uniqueDatesState[1];

  var leaveDatesState = useState({});
  var leaveDatesMap = leaveDatesState[0]; var setLeaveDatesMap = leaveDatesState[1];

  var tokensByDateState = useState({});
  var tokensByDate = tokensByDateState[0]; var setTokensByDate = tokensByDateState[1];

  var loadingTokensState = useState(false);
  var loadingTokens = loadingTokensState[0]; var setLoadingTokens = loadingTokensState[1];


  var selectedMapState = useState({});
  var selectedMap = selectedMapState[0]; var setSelectedMap = selectedMapState[1];
  var selectedCount = Object.keys(selectedMap).length;

  var batchingState = useState(false);
  var batching = batchingState[0]; var setBatching = batchingState[1];

  var toastState = useState(null);
  var toast = toastState[0]; var setToast = toastState[1];

  var rightPanelRef = useRef(null);

  var showToast = function(message, type) {
    setToast({ message: message, type: type || 'success' });
    setTimeout(function() { setToast(null); }, 3500);
  };

  useEffect(function() {
    api.get('/clinic/dashboard').then(function(res) {
      if (res.data.success && res.data.clinic && res.data.clinic.booking_end_date) {
        setMaxDateAllowed(res.data.clinic.booking_end_date);
      }
    }).catch(function() {});

    api.get('/clinic/doctors').then(function(res) {
      if (res.data.success) {
        var active = (res.data.doctors || []).filter(function(d) { return d.status === 'Active'; });
        setDoctors(active);
        if (active.length > 0) setDoctorId(String(active[0].doctor_id));
      }
    }).catch(function() {});
  }, []);

  var loadAllTokens = useCallback(async function(freezableSessions, uniqueDatesArray) {
    if (!freezableSessions || freezableSessions.length === 0) {
      setTokensByDate({});
      setLoadingTokens(false);
      return;
    }
    setLoadingTokens(true);
    try {
      var tokensBySessId = {};
      var promises = freezableSessions.map(async function(s) {
        var res = await api.get('/clinic/availability/' + s.availability_id + '/tokens');
        if (res.data.success && res.data.tokens) {
          tokensBySessId[s.availability_id] = res.data.tokens;
        }
      });
      await Promise.all(promises);

      var newTokensByDate = {};
      for (var i = 0; i < uniqueDatesArray.length; i++) {
        var d = uniqueDatesArray[i];
        var sessionsForDate = freezableSessions.filter(function(fs) { return dateKey(fs.available_date) === d; });
        newTokensByDate[d] = buildContinuousGrid(sessionsForDate, tokensBySessId, d);
      }
      setTokensByDate(newTokensByDate);
    } catch (e) {
      showToast('Error loading tokens.', 'error');
    } finally {
      setLoadingTokens(false);
    }
  }, []);

  var fetchSessions = useCallback(async function() {
    if (!doctorId || !applied.from || !applied.to) return;
    setLoading(true);
    setTokensByDate({});
    try {
      var res = await api.get('/clinic/availability', {
        params: { doctor_id: doctorId, from_date: applied.from, to_date: applied.to }
      });
      if (res.data.success) {
        var list = res.data.availability || [];
        setSessions(list);

        var dates = [];
        var d = new Date(applied.from + 'T00:00:00');
        var endDt = new Date(applied.to + 'T00:00:00');
        while (d <= endDt) {
          dates.push(localYMD(d));
          d.setDate(d.getDate() + 1);
        }
        setUniqueDates(dates);

        var leaveMap = {};
        for (var i = 0; i < dates.length; i++) {
          var dateStr = dates[i];
          var sessionsForDate = list.filter(function(s) { return dateKey(s.available_date) === dateStr; });
          var hasLeave = sessionsForDate.some(function(s) { return s.is_leave; });
          var hasBookable = sessionsForDate.some(function(s) { return !s.is_leave; });
          if (hasLeave && !hasBookable) leaveMap[dateStr] = true;
        }
        setLeaveDatesMap(leaveMap);

        var freezable = list.filter(function(s) { return !s.is_leave; });
        loadAllTokens(freezable, dates);
      }
    } catch (e) {
      showToast('Failed to load slots.', 'error');
    } finally {
      setLoading(false);
    }
  }, [doctorId, applied, loadAllTokens]);

  useEffect(function() {
    fetchSessions();
    setSelectedMap({});
  }, [fetchSessions]);

  var handleApply = function() {
    if (!fromDate || !toDate) return;
    setApplied({ from: fromDate, to: toDate });
  };

  var toggleToken = function(key, t) {
    if (!isTokenClickable(t)) return;
    setSelectedMap(function(prev) {
      var next = Object.assign({}, prev);
      if (next[key]) delete next[key];
      else next[key] = t;
      return next;
    });
  };

  var clearSelection = function() { setSelectedMap({}); };

  var applySelected = async function() {
    var keys = Object.keys(selectedMap);
    if (keys.length === 0) return;

    var toFreeze = [];
    var toUnfreeze = [];
    for (var i = 0; i < keys.length; i++) {
      var t = selectedMap[keys[i]];
      if (t.is_available) {
        toFreeze.push(t);
      } else if (t.status === 'Reserved') {
        toUnfreeze.push(t);
      }
    }

    setBatching(true);
    try {
      if (toFreeze.length > 0) {
        // NOTE: freezing goes through the same single-token booking
        // endpoint as a normal booking, one call per SELECTED token —
        // status: 'Reserved' + no patient details tells the backend
        // this is a pure hold, not a real booking (see isPatientlessFreeze
        // in bookToken). There is no batch "/appointments/group" endpoint;
        // that route doesn't exist on the backend, which is why freezing
        // previously failed. Looping per-token here also guarantees only
        // the tokens actually selected get frozen — nothing more.
        var freezeResults = await Promise.all(toFreeze.map(function(tk) {
          var sr = tk.session_ref;
          return api.post('/clinic/appointments/book', {
            doctor_id: doctorId,
            availability_id: sr.availability_id,
            appointment_date: dateKey(sr.available_date),
            session: sr.session,
            token_number: Number(tk.token_number),
            status: 'Reserved',
            booking_source: tk.booking_source === 'online' ? 'online' : 'walk_in',
          });
        }));
        var failedFreeze = freezeResults.find(function(r) { return !r.data.success; });
        if (failedFreeze) throw new Error(failedFreeze.data.message || 'Freeze failed.');
      }
      if (toUnfreeze.length > 0) {
        var promises = toUnfreeze.map(function(tObj) {
          if (tObj && tObj.appointment_id) {
            return api.patch('/clinic/appointments/' + tObj.appointment_id + '/status', { status: 'Cancelled' });
          }
          return Promise.resolve();
        });
        await Promise.all(promises);
      }
      showToast('Tokens updated successfully!');
      setSelectedMap({});
      fetchSessions();
    } catch (e) {
      var msg = e.response && e.response.data && e.response.data.message ? e.response.data.message : e.message;
      showToast(msg || 'Failed to update tokens', 'error');
    } finally {
      setBatching(false);
    }
  };

  var isFreezing = false;
  var isUnfreezing = false;
  var keys = Object.keys(selectedMap);
  for (var k = 0; k < keys.length; k++) {
    if (selectedMap[keys[k]].is_available) isFreezing = true;
    if (selectedMap[keys[k]].status === 'Reserved') isUnfreezing = true;
  }
  var applyLabel = 'Freeze Selected';
  if (isFreezing && isUnfreezing) applyLabel = 'Apply Selected';
  else if (isUnfreezing) applyLabel = 'Unfreeze Selected';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '0.8rem 1rem', gap: '0' }}>
      
      {toast && (
        <div style={{
          position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999,
          background: toast.type === 'error' ? '#fee2e2' : '#dcfce7',
          color: toast.type === 'error' ? '#991b1b' : '#166534',
          padding: '0.75rem 1rem', borderRadius: 8, fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          borderLeft: '4px solid ' + (toast.type === 'error' ? '#ef4444' : '#22c55e')
        }}>
          {toast.message}
        </div>
      )}

      {/* Page header — title + centered doctor highlight share one row to save vertical space */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: '2.1rem', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Freeze Slots</h2>

        {doctorId && doctors.find(d => String(d.doctor_id) === String(doctorId)) && (
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.85rem',
              borderRadius: 999,
              background: '#2563eb',
            }}>
              <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>👨‍⚕️</span>
              <span style={{
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}>
                Dr. {doctors.find(d => String(d.doctor_id) === String(doctorId)).full_name}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '0.75rem', padding: '0.65rem 1rem', background: 'var(--bg-elevated)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.65rem', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '0.15rem' }}>

          <div className="form-group" style={{ marginBottom: 0, flexShrink: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.45rem' }}>
            <label className="form-label" style={{ marginBottom: 0, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Select Doctor</label>
            <select
              className="form-control"
              style={{ padding: '0.42rem 0.65rem', fontSize: '0.9rem', minWidth: '180px', border: '1.5px solid rgba(99,102,241,0.55)', background: 'rgba(99,102,241,0.12)' }}
              value={doctorId}
              onChange={function(e) { setDoctorId(e.target.value); }}
            >
              {doctors.map(function(d) {
                return <option key={d.doctor_id} value={d.doctor_id}>Dr. {d.full_name}</option>;
              })}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0, flexShrink: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.45rem' }}>
            <label className="form-label" style={{ marginBottom: 0, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>From</label>
            <input
              type="date" className="form-control"
              style={{ padding: '0.42rem 0.65rem', fontSize: '0.9rem', minWidth: '130px', border: '1.5px solid rgba(99,102,241,0.55)', background: 'rgba(99,102,241,0.12)' }}
              value={fromDate} min={todayStr()} max={maxDateAllowed || plusDays(365)}
              onChange={function(e) { setFromDate(e.target.value); }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flexShrink: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.45rem' }}>
            <label className="form-label" style={{ marginBottom: 0, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>To</label>
            <input
              type="date" className="form-control"
              style={{ padding: '0.42rem 0.65rem', fontSize: '0.9rem', minWidth: '130px', border: '1.5px solid rgba(99,102,241,0.55)', background: 'rgba(99,102,241,0.12)' }}
              value={toDate} min={fromDate} max={maxDateAllowed || plusDays(365)}
              onChange={function(e) { setToDate(e.target.value); }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flexShrink: 0 }}>
            <button
              className="btn btn-primary"
              style={{ padding: '0.45rem 1.05rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
              onClick={handleApply}
            >
              Apply
            </button>
          </div>

          {/* divider */}
          <div style={{ width: 1, height: 26, background: 'var(--border)', flexShrink: 0 }} />

          {/* quick presets */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'nowrap', alignItems: 'center', flexShrink: 0 }}>
            {[
              { label: 'Today',    isToday: true,     color: '#10b981', colorDark: '#059669', glow: 'rgba(16,185,129,0.4)', tint: 'rgba(16,185,129,0.12)', tintText: '#34d399', tintBorder: 'rgba(16,185,129,0.35)' },
              { label: 'Tomorrow', isTomorrow: true,  color: '#f59e0b', colorDark: '#d97706', glow: 'rgba(245,158,11,0.4)', tint: 'rgba(245,158,11,0.12)', tintText: '#f59e0b', tintBorder: 'rgba(245,158,11,0.35)' },
              { label: 'Week',     days: 6,           color: 'var(--primary)', colorDark: 'var(--primary-dark)', glow: 'rgba(37,99,235,0.4)', tint: 'rgba(37,99,235,0.12)', tintText: '#60a5fa', tintBorder: 'rgba(37,99,235,0.35)' },
              { label: 'Month',    days: 29,          color: '#8b5cf6', colorDark: '#7c3aed', glow: 'rgba(139,92,246,0.4)', tint: 'rgba(139,92,246,0.12)', tintText: '#a78bfa', tintBorder: 'rgba(139,92,246,0.35)' },
            ].map(function(preset) {
              var isPresetActive = activePreset === preset.label;
              return (
                <button
                  key={preset.label}
                  style={{
                    padding: '0.45rem 1.05rem',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    border: isPresetActive ? 'none' : '1px solid var(--border)',
                    background: isPresetActive
                      ? 'linear-gradient(135deg, ' + preset.color + ' 0%, ' + preset.colorDark + ' 100%)'
                      : 'var(--bg-elevated)',
                    color: isPresetActive ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
                    boxShadow: isPresetActive ? '0 3px 10px ' + preset.glow : 'none',
                    transform: isPresetActive ? 'translateY(-1px)' : 'none',
                  }}
                  onMouseEnter={function(e) {
                    if (!isPresetActive) {
                      e.currentTarget.style.background = preset.tint;
                      e.currentTarget.style.color = preset.tintText;
                      e.currentTarget.style.borderColor = preset.tintBorder;
                    }
                  }}
                  onMouseLeave={function(e) {
                    if (!isPresetActive) {
                      e.currentTarget.style.background = 'var(--bg-elevated)';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }
                  }}
                  onClick={function() {
                    var f = preset.isToday ? todayStr() : (preset.isTomorrow ? plusDays(1) : todayStr());
                    var t = preset.isToday ? todayStr() : (preset.isTomorrow ? plusDays(1) : plusDays(preset.days));
                    setFromDate(f);
                    setToDate(t);
                    setApplied({ from: f, to: t });
                    setActivePreset(preset.label);
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-elevated)', borderRadius: '8px', zIndex: 1 }} ref={rightPanelRef}>
        {loadingTokens && uniqueDates.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.95rem' }}>Loading tokens for all dates...</div>
        ) : uniqueDates.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.95rem' }}>No dates in the selected range.</div>
        ) : (
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg-elevated)', paddingBottom: '0.3rem' }}>
              <div style={{ display: 'flex', gap: '0.7rem', marginBottom: '0.3rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', alignItems: 'center' }}>
                <Legend />
                <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: '#6b7280', border: '1.5px solid #4b5563', display: 'inline-block' }} />
                  Frozen (click to unfreeze)
                </span>
              </div>
              {selectedCount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{selectedCount} selected</span>
                  <div style={{ display: 'flex', gap: '0.6rem' }}>
                    <button className="btn btn-ghost" style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }} onClick={clearSelection}>Unselect All</button>
                    <button className="btn btn-primary" style={{ padding: '0.3rem 0.9rem', fontSize: '0.78rem' }} onClick={applySelected} disabled={batching}>{applyLabel}</button>
                  </div>
                </div>
              )}
            </div>

            {uniqueDates.map(function(dateStr, dateIdx) {
              if (dateStr < todayStr()) return null;
              var dateTokens = tokensByDate[dateStr] || [];
              var remaining = 0, frozen = 0;
              for (var i = 0; i < dateTokens.length; i++) {
                if (dateTokens[i].is_available) remaining++;
                if (dateTokens[i].status === 'Reserved') frozen++;
              }

              var selSet = { has: function(k) { return Object.prototype.hasOwnProperty.call(selectedMap, k); } };
              var isEvenDate = dateIdx % 2 === 0;

              return (
                <div key={dateStr} style={{ marginBottom: '0.4rem', background: isEvenDate ? 'rgba(99,102,241,0.10)' : 'rgba(244,63,94,0.09)', border: isEvenDate ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(244,63,94,0.32)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{
                      width: '82px', flexShrink: 0, textAlign: 'center',
                      alignSelf: 'stretch', display: 'flex', flexDirection: 'column',
                      justifyContent: 'center',
                      background: isEvenDate ? 'rgba(99,102,241,0.18)' : 'rgba(244,63,94,0.15)',
                      border: isEvenDate ? '1px solid rgba(99,102,241,0.30)' : '1px solid rgba(244,63,94,0.28)',
                      borderRadius: 8,
                      padding: '0.4rem 0.3rem',
                    }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.75rem', lineHeight: 1.2 }}>{fmtDateShort(dateStr)}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.05rem' }}>{remaining} Available</div>
                      {frozen > 0 && <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, marginTop: '0.15rem' }}>🧊 {frozen} Frozen</div>}
                    </div>
                    <div style={{ flex: 1 }}>
                      {leaveDatesMap[dateStr] ? (
                        <div style={{
                          fontSize: '0.82rem', color: '#ef4444', padding: '0.5rem 0.75rem',
                          background: 'rgba(239,68,68,0.12)', borderRadius: 6, fontWeight: 600
                        }}>🚫 Doctor is on leave</div>
                      ) : (
                        <>
                          {dateStr === todayStr() && dateTokens.some(function(t) { return t.session_expired; }) && (
                            <div style={{
                              fontSize: '0.72rem', color: '#d97706', padding: '0.2rem 0.55rem',
                              background: 'rgba(120,53,15,0.18)', borderRadius: 5, fontWeight: 600,
                              marginBottom: '0.3rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                              border: '1px solid rgba(217,119,6,0.35)',
                            }}>⏱ Some sessions have ended</div>
                          )}
                          <TokenGrid
                            hideHeader={true}
                            columnsPerRow={20}
                            tokens={dateTokens}
                            selectedTokens={selSet}
                            isClickable={isTokenClickable}
                            onSelect={function(key, t) { toggleToken(key, t); }}
                            loading={loadingTokens}
                            emptyText="No tokens for this date."
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClinicBlockSlots;