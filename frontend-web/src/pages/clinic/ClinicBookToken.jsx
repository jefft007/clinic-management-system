import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import TokenGrid, { Legend } from '../../components/TokenGrid';

/* helpers — calendar dates in the clinic's local timezone (IST),
   never UTC from toISOString(), which can shift "tomorrow" by a day. */
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
function fmtDate(d) {
  if (!d) return '\u2014';
  var dt = new Date(dateKey(d) + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
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
// A whole calendar date that has already gone by. Staff can still browse
// these to see what happened (who was booked/consulted/etc.), but nothing
// on a past date can be newly booked.
function isPastDate(dateStr) {
  return !!dateStr && dateStr < todayStr();
}

var FORM_DEFAULT = {
  patient_name: '', patient_phone: '', patient_alt_phone: '',
  patient_age: '', patient_gender: 'Male', patient_address: '',
  procedure_note: '', /* only used in multi-token (procedure) booking */
};

/* Create a single continuous grid of tokens for the day, numbering them
   sequentially (e.g., 1-20 for morning, 21-40 for evening) regardless
   of what token_number the API returned. Sessions that have ended today are
   still shown so staff can see the full picture, but their tokens are
   forced to is_available=false so they cannot be booked. */
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
    // A past date is always "expired" for booking purposes, on top of
    // today's own session-end-time check — staff can still see exactly
    // what each token's real status was, they just can't book new ones.
    var sessionExpired = isPastDate(dateStr) || (dateStr === todayStr() && isSessionExpired(s));

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
        // Force unavailable for expired sessions so they display but can't be booked
        is_available: sessionExpired ? false : t.is_available,
        session_expired: sessionExpired,
      }));
    }
  }
  return merged;
}

var ClinicBookToken = function() {
  var searchParamsResult = useSearchParams();
  var searchParams = searchParamsResult[0];

  /* Dashboard's Week / Month / Custom-range "Book Token" button links
     here with doctor_id / from_date / to_date so this page opens
     already filtered to whatever range staff had selected. Past dates
     are allowed through as-is — staff can browse a previous date's
     token status here, they just can't book anything new on it (see
     isPastDate / buildContinuousGrid below). */
  var qDoctorId = searchParams.get('doctor_id') || '';
  var qFromRaw = searchParams.get('from_date') || '';
  var qToRaw = searchParams.get('to_date') || '';
  var qFrom = qFromRaw || '';
  var qTo = qToRaw && (!qFrom || qToRaw >= qFrom) ? qToRaw : '';
  var hasIncomingFilter = !!(qFromRaw || qToRaw || qDoctorId);

  var doctorsState = useState([]);
  var doctors = doctorsState[0]; var setDoctors = doctorsState[1];

  var doctorIdState = useState(qDoctorId);
  var doctorId = doctorIdState[0]; var setDoctorId = doctorIdState[1];

  var maxDateState = useState('');
  var maxDateAllowed = maxDateState[0]; var setMaxDateAllowed = maxDateState[1];

  /* date range filter — default: today to today+6 (weekly), unless
     the dashboard passed its own range in the URL */
  var fromDateState = useState(qFrom || todayStr());
  var fromDate = fromDateState[0]; var setFromDate = fromDateState[1];

  var toDateState = useState(qTo || plusDays(6));
  var toDate = toDateState[0]; var setToDate = toDateState[1];

  var appliedState = useState({ from: qFrom || todayStr(), to: qTo || plusDays(6) });
  var applied = appliedState[0]; var setApplied = appliedState[1];

  var sessionsState = useState([]);
  var sessions = sessionsState[0]; var setSessions = sessionsState[1];

  var loadingState = useState(false);
  var loading = loadingState[0]; var setLoading = loadingState[1];

  var uniqueDatesState = useState([]);
  var uniqueDates = uniqueDatesState[0]; var setUniqueDates = uniqueDatesState[1];

  // Dates within the selected range where the doctor is marked on leave
  // (and has no other bookable session that day) — shown as "Doctor is
  // on leave" instead of the empty-tokens message.
  var leaveDatesState = useState({});
  var leaveDatesMap = leaveDatesState[0]; var setLeaveDatesMap = leaveDatesState[1];

  var tokensByDateState = useState({});
  var tokensByDate = tokensByDateState[0]; var setTokensByDate = tokensByDateState[1];

  var activePresetState = useState(hasIncomingFilter ? '' : 'Week');
  var activePreset = activePresetState[0]; var setActivePreset = activePresetState[1];

  var loadingTokensState = useState(false);
  var loadingTokens = loadingTokensState[0]; var setLoadingTokens = loadingTokensState[1];

  var selectedTokenObjState = useState(null);
  var selectedTokenObj = selectedTokenObjState[0]; var setSelectedTokenObj = selectedTokenObjState[1];

  /* Multi-token ("procedure") booking mode — lets staff select several
     tokens across the grid for the SAME patient (e.g. a procedure that
     needs more than one slot) and book them together in one action.
     selectedGroup is a map of unique_id -> token object so we keep the
     full token (date/session/pool) for each pick, not just its key. */
  var multiModeState = useState(false);
  var multiMode = multiModeState[0]; var setMultiMode = multiModeState[1];

  var selectedGroupState = useState({});
  var selectedGroup = selectedGroupState[0]; var setSelectedGroup = selectedGroupState[1];

  var groupBookingOpenState = useState(false);
  var groupBookingOpen = groupBookingOpenState[0]; var setGroupBookingOpen = groupBookingOpenState[1];

  var groupBookingState = useState(false);
  var groupBooking = groupBookingState[0]; var setGroupBooking = groupBookingState[1];

  var selectedGroupList = Object.keys(selectedGroup).map(function(k) { return selectedGroup[k]; })
    .sort(function(a, b) { return Number(a.token_number) - Number(b.token_number); });

  var formState = useState(FORM_DEFAULT);
  var form = formState[0]; var setForm = formState[1];

  var bookingState = useState(false);
  var booking = bookingState[0]; var setBooking = bookingState[1];

  var msgState = useState(null);
  var msg = msgState[0]; var setMsg = msgState[1];

  var hasSavedState = useState(true);
  var hasSavedSettings = hasSavedState[0]; var setHasSavedSettings = hasSavedState[1];

  /* Active pool tab — 'walk_in' (On-Site, default) or 'online' */
  var activePoolState = useState('all');
  var activePool = activePoolState[0]; var setActivePool = activePoolState[1];

  /* "Add extra tokens" per date — appended after that day's existing
     tokens (never renumbers anything already there). Keyed by dateStr. */
  var addTokenInputsState = useState({});
  var addTokenInputs = addTokenInputsState[0]; var setAddTokenInputs = addTokenInputsState[1];

  var addingTokensState = useState({});
  var addingTokens = addingTokensState[0]; var setAddingTokens = addingTokensState[1];

  var rightPanelRef = useRef(null);

  /* initial loads */
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
        // Only fall back to the first doctor when none came in via the
        // URL (e.g. dashboard's "Book Token" button already picked one).
        if (!qDoctorId && active.length > 0) setDoctorId(String(active[0].doctor_id));
      }
    }).catch(function() {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(function() {
    if (!doctorId) return;
    api.get('/clinic/doctors/' + doctorId + '/session-token-settings').then(function(res) {
      if (res.data.success) {
        setHasSavedSettings(res.data.settings && res.data.settings.length > 0);
      }
    }).catch(function() {});
  }, [doctorId]);

  var loadAllTokens = useCallback(async function(fetchedSessions, uniqueDatesArray) {
    if (!fetchedSessions || fetchedSessions.length === 0) {
      setTokensByDate({});
      setLoadingTokens(false);
      return;
    }
    setLoadingTokens(true);
    setMsg(null);
    try {
      var tokensBySessId = {};
      // No booking_source filter — clinic staff can book from either
      // pool, so fetch On-Site and Online tokens together for the grid.
      var promises = fetchedSessions.map(async function(s) {
        var res = await api.get('/clinic/availability/' + s.availability_id + '/tokens');
        if (res.data.success && res.data.tokens) {
          tokensBySessId[s.availability_id] = res.data.tokens;
        }
      });
      await Promise.all(promises);

      var newTokensByDate = {};
      for (var j = 0; j < uniqueDatesArray.length; j++) {
        var dStr = uniqueDatesArray[j];
        var sessionsForDate = fetchedSessions.filter(function(s) { return dateKey(s.available_date) === dStr; });
        newTokensByDate[dStr] = buildContinuousGrid(sessionsForDate, tokensBySessId, dStr);
      }
      setTokensByDate(newTokensByDate);
    } catch (e) {
      setMsg({ type: 'error', text: 'Could not load tokens. Please try again.' });
    } finally {
      setLoadingTokens(false);
    }
  }, []);

  /* fetch sessions when doctor or applied date range changes */
  var fetchSessions = useCallback(async function() {
    if (!doctorId || !applied.from || !applied.to) return;
    setLoading(true);
    setTokensByDate({});
    // could quietly still include 17,20 picked earlier before the filter
    // changed. Clearing here guarantees a booking only ever contains
    // tokens actually selected in the current view.
    setSelectedGroup({});
    setGroupBookingOpen(false);
    try {
      var res = await api.get('/clinic/availability', {
        params: { doctor_id: doctorId, from_date: applied.from, to_date: applied.to }
      });
      if (res.data.success) {
        var fetched = res.data.availability || [];
        // Bookable sessions only — leave records are excluded from the
        // token grid, but tracked separately below so we can tell staff
        // *why* a date has nothing bookable instead of just showing empty.
        var bookable = fetched.filter(function(a) { return !a.is_leave; });
        setSessions(bookable);

        var bookableDateSet = {};
        for (var b = 0; b < bookable.length; b++) {
          bookableDateSet[dateKey(bookable[b].available_date)] = true;
        }
        var leaveMap = {};
        for (var l = 0; l < fetched.length; l++) {
          if (fetched[l].is_leave) {
            var lk = dateKey(fetched[l].available_date);
            // Only "on leave" if nothing else that day is bookable.
            if (!bookableDateSet[lk]) leaveMap[lk] = true;
          }
        }
        setLeaveDatesMap(leaveMap);

        var dates = [];
        var seen = {};
        for (var i = 0; i < fetched.length; i++) {
          var dk = dateKey(fetched[i].available_date);
          if (!seen[dk]) { seen[dk] = true; dates.push(dk); }
        }
        dates.sort();
        setUniqueDates(dates);
        loadAllTokens(bookable, dates);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [doctorId, applied, loadAllTokens]);

  useEffect(function() { fetchSessions(); }, [fetchSessions]);

  var loadTokensForDate = useCallback(async function(dateStr) {
    setMsg(null);
    var sessionsForDate = sessions.filter(function(s) { return dateKey(s.available_date) === dateStr; });
    try {
      var tokensBySessId = {};
      for (var i = 0; i < sessionsForDate.length; i++) {
        var s = sessionsForDate[i];
        var res = await api.get('/clinic/availability/' + s.availability_id + '/tokens');
        if (res.data.success && res.data.tokens) {
          tokensBySessId[s.availability_id] = res.data.tokens;
        }
      }
      setTokensByDate(function(prev) {
        var updated = Object.assign({}, prev);
        updated[dateStr] = buildContinuousGrid(sessionsForDate, tokensBySessId, dateStr);
        return updated;
      });
    } catch (e) {
      setMsg({ type: 'error', text: 'Could not load tokens for this date. Please try again.' });
    }
  }, [sessions]);

  /* "Add extra tokens" for a date — always applied to that day's LAST
     session (Evening if it exists, else Morning), since the day's
     continuous numbering always ends there; the new tokens are
     appended after whatever number that day already ends on, so
     nothing already on the grid ever gets renumbered. */
  var handleAddTokens = async function(dateStr) {
    var sessionsForDate = sessions.filter(function(s) { return dateKey(s.available_date) === dateStr; })
      .slice()
      .sort(function(a, b) {
        var ta = String(a.start_time || '').replace(':', '');
        var tb = String(b.start_time || '').replace(':', '');
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      });
    if (sessionsForDate.length === 0) return;
    var lastSession = sessionsForDate[sessionsForDate.length - 1];

    var raw = addTokenInputs[dateStr];
    var count = parseInt(raw, 10);
    if (!count || count <= 0) {
      setMsg({ type: 'error', text: 'Enter how many tokens to add (a positive whole number).' });
      return;
    }
    var poolChoice = activePool === 'all' ? 'all' : activePool;

    setAddingTokens(function(prev) {
      var updated = Object.assign({}, prev);
      updated[dateStr] = true;
      return updated;
    });
    setMsg(null);
    try {
      var res = await api.post('/clinic/availability/' + lastSession.availability_id + '/add-tokens', {
        pool: poolChoice,
        count: count,
      });
      if (res.data.success) {
        setMsg({ type: 'success', text: res.data.message || (count + ' token(s) added.') });
        setAddTokenInputs(function(prev) { var updated = Object.assign({}, prev); delete updated[dateStr]; return updated; });
        loadTokensForDate(dateStr);
      }
    } catch (err) {
      var errMsg = err && err.response && err.response.data && err.response.data.message
        ? err.response.data.message : 'Could not add tokens.';
      setMsg({ type: 'error', text: errMsg });
    } finally {
      setAddingTokens(function(prev) { var updated = Object.assign({}, prev); delete updated[dateStr]; return updated; });
    }
  };

  /* booking */
  var handleBook = async function() {
    if (!selectedTokenObj || !form.patient_name || !form.patient_phone) {
      setMsg({ type: 'error', text: 'Please fill in patient name & phone.' });
      return;
    }
    var sessionRow = selectedTokenObj.session_ref;
    if (isSessionExpired(sessionRow)) {
      var endTime = sessionRow && sessionRow.end_time ? sessionRow.end_time.slice(0, 5) : '';
      setMsg({ type: 'error', text: 'This session ended at ' + endTime + ' and can no longer be booked.' });
      return;
    }
    setBooking(true);
    setMsg(null);
    try {
      var res = await api.post('/clinic/appointments/book', Object.assign({
        doctor_id: doctorId,
        availability_id: sessionRow.availability_id,
        appointment_date: dateKey(sessionRow.available_date),
        session: sessionRow.session,
        token_number: Number(selectedTokenObj.token_number),
        status: 'Booked',
        // Book into whichever pool this specific token belongs to
        // (the grid now shows On-Site and Online tokens together).
        booking_source: selectedTokenObj.booking_source === 'online' ? 'online' : 'walk_in',
      }, form));
      if (res.data.success) {
        setMsg({ type: 'success', text: 'Token #' + selectedTokenObj.display_number + ' booked successfully!' });
        setForm(FORM_DEFAULT);
        var bookedDate = dateKey(sessionRow.available_date);
        setSelectedTokenObj(null);
        loadTokensForDate(bookedDate);
      }
    } catch (err) {
      var errMsg = err && err.response && err.response.data && err.response.data.message
        ? err.response.data.message : 'Booking failed.';
      setMsg({ type: 'error', text: errMsg });
    } finally {
      setBooking(false);
    }
  };

  var handleApply = function() {
    setApplied({ from: fromDate, to: toDate });
    setActivePreset('');
  };

  var toggleMultiMode = function() {
    setMultiMode(function(m) { return !m; });
    setSelectedTokenObj(null);
    setSelectedGroup({});
    setGroupBookingOpen(false);
    setMsg(null);
    setForm(FORM_DEFAULT);
  };

  /* Multi-select mode: clicking a free token adds/removes it from the
     group instead of opening the single-token popup. */
  var handleGroupToggle = function(key, t) {
    if (!t.is_available) return;
    setSelectedGroup(function(prev) {
      var updated = Object.assign({}, prev);
      if (updated[key]) delete updated[key];
      else updated[key] = t;
      return updated;
    });
  };

  /* booking — multiple tokens, one patient */
  var handleBookGroup = async function() {
    if (selectedGroupList.length < 2) {
      setMsg({ type: 'error', text: 'Select at least two tokens to book a multi-token (procedure) booking.' });
      return;
    }
    // Defensive re-check against the freshest loaded grid data: a token
    // picked earlier could have gone stale (booked by someone else,
    // session ended, or simply no longer present after a reload). Only
    // tokens that are STILL free right now, in the current tokensByDate,
    // are allowed through — anything else is dropped and the staff member
    // is told, instead of silently booking whatever was left in state.
    var staleKeys = [];
    for (var gi = 0; gi < selectedGroupList.length; gi++) {
      var gt = selectedGroupList[gi];
      var dStr = dateKey(gt.session_ref.available_date);
      var freshForDate = tokensByDate[dStr] || [];
      var stillGood = freshForDate.some(function(ft) {
        return ft.unique_id === gt.unique_id && ft.is_available;
      });
      if (!stillGood) staleKeys.push(gt.unique_id);
    }
    if (staleKeys.length > 0) {
      setSelectedGroup(function(prev) {
        var updated = Object.assign({}, prev);
        staleKeys.forEach(function(k) { delete updated[k]; });
        return updated;
      });
      setMsg({ type: 'error', text: staleKeys.length + ' selected token(s) are no longer available and were removed from the selection. Please review and try again.' });
      return;
    }
    if (!form.patient_name || !form.patient_phone) {
      setMsg({ type: 'error', text: 'Please fill in patient name & phone.' });
      return;
    }
    for (var i = 0; i < selectedGroupList.length; i++) {
      if (isSessionExpired(selectedGroupList[i].session_ref)) {
        setMsg({ type: 'error', text: 'One of the selected sessions has already ended. Please remove it and try again.' });
        return;
      }
    }
    setGroupBooking(true);
    setMsg(null);
    try {
      var tokensPayload = selectedGroupList.map(function(t) {
        var sr = t.session_ref;
        return {
          doctor_id: doctorId,
          availability_id: sr.availability_id,
          appointment_date: dateKey(sr.available_date),
          session: sr.session,
          token_number: Number(t.token_number),
          booking_source: t.booking_source === 'online' ? 'online' : 'walk_in',
        };
      });
      console.log('[handleBookGroup DEBUG] selectedGroupList right before POST:', selectedGroupList);
      console.log('[handleBookGroup DEBUG] tokensPayload:', tokensPayload);
      var res = await api.post('/clinic/appointments/book-multiple', Object.assign({
        tokens: tokensPayload,
      }, form));
      if (res.data.success) {
        setMsg({ type: 'success', text: res.data.message || (tokensPayload.length + ' tokens booked successfully!') });
        var touchedDates = {};
        selectedGroupList.forEach(function(t) { touchedDates[dateKey(t.session_ref.available_date)] = true; });
        setForm(FORM_DEFAULT);
        setSelectedGroup({});
        setGroupBookingOpen(false);
        Object.keys(touchedDates).forEach(function(d) { loadTokensForDate(d); });
      }
    } catch (err) {
      var errMsg = err && err.response && err.response.data && err.response.data.message
        ? err.response.data.message : 'Booking failed.';
      setMsg({ type: 'error', text: errMsg });
    } finally {
      setGroupBooking(false);
    }
  };

  /* ── render ── */
  return (
    <div>
      {/* Page header — title + centered doctor highlight share one row to save vertical space */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: '2.1rem', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Token Booking</h2>

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

      {!hasSavedSettings && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderRadius: 8, marginBottom: '0.75rem', border: '1px solid rgba(245,158,11,0.2)', fontSize: '0.85rem' }}>
          {'⚠️'} <strong>Booking Settings Not Configured:</strong> Token counts are using estimated fallback values. Go to <strong>Manage Slots &rarr; Booking Settings</strong> and click <strong>Save Settings</strong> to apply them.
        </div>
      )}

      {/* Filter bar — above layout */}
      <div className="card" style={{ padding: '0.65rem 1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.65rem', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '0.15rem' }}>
          
          <div className="form-group" style={{ marginBottom: 0, flexShrink: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.45rem' }}>
            <label className="form-label" style={{ marginBottom: 0, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Doctor</label>
            <select
              className="form-control"
              style={{ padding: '0.42rem 0.65rem', fontSize: '0.9rem', minWidth: '180px', border: '1.5px solid rgba(99,102,241,0.55)', background: 'rgba(99,102,241,0.12)' }}
              value={doctorId}
              onChange={function(e) { setDoctorId(e.target.value); }}
            >
              <option value="" style={{ background: '#1e293b', color: '#f1f5f9' }}>-- Select Doctor --</option>
              {doctors.map(function(d) {
                return <option key={d.doctor_id} value={d.doctor_id} style={{ background: '#1e293b', color: '#f1f5f9' }}>{d.full_name}</option>;
              })}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0, flexShrink: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.45rem' }}>
            <label className="form-label" style={{ marginBottom: 0, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>From Date</label>
            <input
              type="date" className="form-control"
              style={{ padding: '0.42rem 0.65rem', fontSize: '0.9rem', minWidth: '130px', border: '1.5px solid rgba(99,102,241,0.55)', background: 'rgba(99,102,241,0.12)' }}
              value={fromDate} min={plusDays(-90)} max={maxDateAllowed || plusDays(365)}
              onChange={function(e) { setFromDate(e.target.value); }}
              onKeyDown={function(e) { if (e.key === 'Enter') handleApply(); }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flexShrink: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.45rem' }}>
            <label className="form-label" style={{ marginBottom: 0, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>To Date</label>
            <input
              type="date" className="form-control"
              style={{ padding: '0.42rem 0.65rem', fontSize: '0.9rem', minWidth: '130px', border: '1.5px solid rgba(99,102,241,0.55)', background: 'rgba(99,102,241,0.12)' }}
              value={toDate} min={fromDate} max={maxDateAllowed || plusDays(365)}
              onChange={function(e) { setToDate(e.target.value); }}
              onKeyDown={function(e) { if (e.key === 'Enter') handleApply(); }}
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
              { label: 'Yesterday', isYesterday: true, color: '#64748b', colorDark: '#475569', glow: 'rgba(100,116,139,0.4)', tint: 'rgba(100,116,139,0.12)', tintText: '#94a3b8', tintBorder: 'rgba(100,116,139,0.35)' },
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
                    var f = preset.isYesterday ? plusDays(-1) : preset.isToday ? todayStr() : (preset.isTomorrow ? plusDays(1) : todayStr());
                    var t = preset.isYesterday ? plusDays(-1) : preset.isToday ? todayStr() : (preset.isTomorrow ? plusDays(1) : plusDays(preset.days));
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

      {/* Pool tabs — All (default) | On-Site | Online — plus the
          multi-token (procedure) booking toggle */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {[
          { key: 'all',     label: '📋 All',     activeBg: 'linear-gradient(135deg,#4f46e5,#6366f1)', glow: 'rgba(99,102,241,0.3)'  },
          { key: 'walk_in', label: '🏥 On-Site', activeBg: 'linear-gradient(135deg,#0891b2,#06b6d4)', glow: 'rgba(6,182,212,0.3)' },
          { key: 'online',  label: '🌐 Online',  activeBg: 'linear-gradient(135deg,#d97706,#f59e0b)', glow: 'rgba(245,158,11,0.3)' },
        ].map(function(tab) {
          var isActive = activePool === tab.key;
          return (
            <button
              key={tab.key}
              onClick={function() {
                if (activePool !== tab.key) {
                  setActivePool(tab.key);
                  setSelectedTokenObj(null);
                  setMsg(null);
                  setForm(FORM_DEFAULT);
                }
              }}
              style={{
                padding: '0.42rem 1.2rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                borderRadius: '8px 8px 0 0',
                border: isActive ? 'none' : '1px solid var(--border)',
                borderBottom: 'none',
                background: isActive ? tab.activeBg : 'var(--bg-elevated)',
                color: isActive ? '#fff' : 'var(--text-secondary)',
                cursor: isActive ? 'default' : 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: isActive ? '0 -3px 10px ' + tab.glow : 'none',
                marginBottom: '-1px',
                position: 'relative',
                zIndex: isActive ? 2 : 1,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Multi-token (procedure) booking toggle — select several
          tokens for one patient (e.g. a procedure spanning more than
          one slot) and book them all together. */}
      <button
        onClick={toggleMultiMode}
        title="Select multiple tokens for one patient (e.g. a procedure)"
        style={{
          padding: '0.25rem 0.6rem',
          fontSize: '0.68rem',
          fontWeight: 700,
          borderRadius: '6px',
          border: multiMode ? 'none' : '1px solid var(--border)',
          background: multiMode ? 'linear-gradient(135deg,#0f766e,#0d9488)' : 'var(--bg-elevated)',
          color: multiMode ? '#fff' : 'var(--text-secondary)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxShadow: multiMode ? '0 2px 6px rgba(13,148,136,0.3)' : 'none',
          alignSelf: 'flex-start',
          whiteSpace: 'nowrap',
        }}
      >
        {multiMode ? ('🔗 Procedure Mode: ON (' + selectedGroupList.length + ' selected)') : '🔗 Book Multiple Tokens (Procedure)'}
      </button>
      </div>

      {/* Floating selection bar — only in multi-select mode with at
          least one token picked. Lets staff review picks and confirm
          before opening the patient details popup. */}
      {multiMode && selectedGroupList.length > 0 && (function() {
        var spanDates = {};
        selectedGroupList.forEach(function(t) { spanDates[dateKey(t.session_ref.available_date)] = true; });
        var dateCount = Object.keys(spanDates).length;
        return (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '0.4rem',
          padding: '0.5rem 0.75rem', marginTop: '0.4rem',
          background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.35)',
          borderRadius: 8,
        }}>
          {/* A procedure booking is normally same-day, multiple slots.
              Selections spanning more than one calendar date are easy to
              pick up by accident (e.g. tokens left selected on an earlier
              date before the filter was changed) — flag it clearly rather
              than letting it slip into the booking unnoticed. */}
          {dateCount > 1 && (
            <div style={{
              fontSize: '0.74rem', fontWeight: 700, color: '#fca5a5',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: 6, padding: '0.3rem 0.55rem',
            }}>
              ⚠️ Selected tokens span {dateCount} different dates — double-check these are all meant to be in the same procedure booking.
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#5eead4' }}>
              {selectedGroupList.length} token{selectedGroupList.length > 1 ? 's' : ''} selected:
            </span>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', flex: 1 }}>
              {selectedGroupList.map(function(t) {
                return (
                  <span key={t.unique_id} style={{
                    fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem',
                    borderRadius: 999, background: 'rgba(13,148,136,0.25)', color: '#5eead4',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                  }}>
                    {'#' + t.display_number + ' \u00b7 ' + fmtDateShort(t.session_ref.available_date)}
                    <span
                      onClick={function() { handleGroupToggle(t.unique_id, t); }}
                      style={{ cursor: 'pointer', fontWeight: 800 }}
                      title="Remove"
                    >✕</span>
                  </span>
                );
              })}
            </div>
            <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }}
              onClick={function() { setSelectedGroup({}); }}>
              Clear
            </button>
            <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.9rem' }}
              disabled={selectedGroupList.length < 2}
              onClick={function() { setGroupBookingOpen(true); setMsg(null); }}>
              Book {selectedGroupList.length} Tokens
            </button>
          </div>
        </div>
        );
      })()}

      {/* Main single-column layout */}
      <div className="card" style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-elevated)', borderTopLeftRadius: activePool === 'all' ? 0 : undefined, zIndex: 1 }} ref={rightPanelRef}>
        
        {loadingTokens && uniqueDates.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Loading tokens for all dates...
          </div>
        ) : uniqueDates.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            No dates in the selected range.
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
              {/* Shared Legend at the very top */}
              {uniqueDates.length > 0 && (
                <div style={{ marginBottom: '0.3rem' }}>
                  <Legend />
                </div>
              )}

              {uniqueDates
                .map(function(dateStr, dateIdx) {
                var allTokens = tokensByDate[dateStr] || [];
                var dateTokens = activePool === 'all'
                  ? allTokens
                  : allTokens.filter(function(t) { return t.booking_source === activePool; });
                var remaining = 0;
                for (var i = 0; i < dateTokens.length; i++) {
                  if (dateTokens[i].is_available) remaining++;
                }

                /* Alternate shading per date box */
                var isEvenDate = dateIdx % 2 === 0;

                return (
                  <div key={dateStr} id={'date-section-' + dateStr} style={{
                    marginBottom: '0.4rem',
                    background: isEvenDate ? 'rgba(99,102,241,0.10)' : 'rgba(244,63,94,0.09)',
                    border: isEvenDate ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(244,63,94,0.32)',
                    borderRadius: 10,
                    padding: '0.6rem 0.75rem',
                  }}>
                    {/* Date label (left) + token grid (right), both inside the same box */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {/* Left: Date label — its own panel shade (lighter
                          than the tinted date-section box around it) so it
                          reads as a distinct sidebar, not part of the grid. */}
                      <div style={{
                        width: '82px', flexShrink: 0, textAlign: 'center',
                        alignSelf: 'stretch', display: 'flex', flexDirection: 'column',
                        justifyContent: 'center',
                        background: isEvenDate ? 'rgba(99,102,241,0.18)' : 'rgba(244,63,94,0.15)',
                        border: isEvenDate ? '1px solid rgba(99,102,241,0.30)' : '1px solid rgba(244,63,94,0.28)',
                        borderRadius: 8,
                        padding: '0.4rem 0.3rem',
                      }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.75rem', lineHeight: 1.2 }}>
                          {fmtDateShort(dateStr)}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.05rem' }}>
                          {remaining} Available
                        </div>
                      </div>

                      {/* Right: token grid (or leave notice) */}
                      <div style={{ flex: 1 }}>
                        {leaveDatesMap[dateStr] ? (
                          <div style={{
                            fontSize: '0.82rem', color: '#ef4444', padding: '0.5rem 0.75rem',
                            background: 'rgba(239,68,68,0.12)', borderRadius: 6, fontWeight: 600
                          }}>
                            🚫 Doctor is on leave
                          </div>
                        ) : (
                          <>
                            {/* Show a notice if this date has any tokens that
                                can no longer be booked — either because the
                                date itself is in the past, or (for today)
                                because that session's end time has passed. */}
                            {dateTokens.some(function(t) { return t.session_expired; }) && (
                              <div style={{
                                fontSize: '0.72rem', color: '#d97706', padding: '0.2rem 0.55rem',
                                background: 'rgba(120,53,15,0.18)', borderRadius: 5, fontWeight: 600,
                                marginBottom: '0.3rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                border: '1px solid rgba(217,119,6,0.35)',
                              }}>
                                {isPastDate(dateStr)
                                  ? '📅 This date has passed — you can view token status here, but nothing can be booked'
                                  : '⏱ Some sessions have ended — those tokens cannot be booked'}
                              </div>
                            )}

                            {/* Add extra tokens — appended after this day's
                                existing tokens for the currently active tab
                                (All → split evenly, On-Site/Online → all to
                                that pool). Never renumbers anything above.
                                Not offered for a past date — nothing on a
                                bygone day can be booked, so there's nothing
                                to add tokens for. */}
                            {!isPastDate(dateStr) && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.35rem', marginBottom: '0.3rem' }}>
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                  Add tokens{activePool === 'all' ? ' (split On-Site/Online)' : activePool === 'walk_in' ? ' (On-Site)' : ' (Online)'}:
                                </span>
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="e.g. 5"
                                  value={addTokenInputs[dateStr] || ''}
                                  onChange={function(e) {
                                    var val = e.target.value;
                                    setAddTokenInputs(function(prev) {
                                      var updated = Object.assign({}, prev);
                                      if (val === '') delete updated[dateStr]; else updated[dateStr] = val;
                                      return updated;
                                    });
                                  }}
                                  onKeyDown={function(e) { if (e.key === 'Enter') handleAddTokens(dateStr); }}
                                  className="form-control"
                                  style={{ width: '64px', padding: '0.15rem 0.35rem', fontSize: '0.75rem' }}
                                />
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                                  disabled={!!addingTokens[dateStr]}
                                  onClick={function() { handleAddTokens(dateStr); }}
                                >
                                  {addingTokens[dateStr] ? 'Adding…' : '+ Add'}
                                </button>
                              </div>
                            )}

                            <TokenGrid
                              hideHeader={true}
                              columnsPerRow={20}
                              tokens={dateTokens}
                              selectedTokens={multiMode ? Object.keys(selectedGroup) : undefined}
                              selectedToken={multiMode ? undefined : (selectedTokenObj ? selectedTokenObj.unique_id : undefined)}
                              isClickable={function(t) { return multiMode ? t.is_available : true; }}
                              onSelect={multiMode ? handleGroupToggle : function(key, t) {
                                /* toggle: clicking the already-selected token deselects it */
                                if (selectedTokenObj && selectedTokenObj.unique_id === key) {
                                  setSelectedTokenObj(null);
                                  setMsg(null);
                                  setForm(FORM_DEFAULT);
                                } else {
                                  setSelectedTokenObj(t);
                                  setMsg(null);
                                  setForm(FORM_DEFAULT);
                                }
                              }}
                              loading={loadingTokens}
                              emptyText="No tokens available for this date."
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

      {/* Patient Details popup — opens as its own small floating window
          the moment a token is selected, instead of expanding inline
          under the date row. */}
      {selectedTokenObj && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem',
          }}
        >
          <div
            style={{
              width: '100%', maxWidth: '640px', maxHeight: '92vh', overflowY: 'auto',
              background: 'var(--bg-elevated)', border: '1px solid rgba(37,99,235,0.35)',
              borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
              padding: '1.1rem 1.35rem',
            }}
          >
            {/* Header — date/pool + big highlighted token number + close */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.9rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Patient Details
                </div>
                <div style={{ color: '#60a5fa', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.2rem' }}>
                  {fmtDate(selectedTokenObj.session_ref.available_date)}
                  <span style={{
                    marginLeft: '0.5rem', fontSize: '0.68rem', fontWeight: 700,
                    padding: '0.1rem 0.5rem', borderRadius: 999,
                    background: selectedTokenObj.booking_source === 'online' ? 'rgba(245,158,11,0.16)' : 'rgba(6,182,212,0.16)',
                    color: selectedTokenObj.booking_source === 'online' ? '#f59e0b' : '#06b6d4',
                    border: '1px solid ' + (selectedTokenObj.booking_source === 'online' ? 'rgba(245,158,11,0.35)' : 'rgba(6,182,212,0.35)'),
                  }}>
                    {selectedTokenObj.booking_source === 'online' ? 'Online' : 'On-Site'}
                  </span>
                </div>
              </div>
              <div style={{
                background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff',
                borderRadius: 10, padding: '0.5rem 1rem', fontWeight: 800, fontSize: '1.5rem',
                lineHeight: 1, boxShadow: '0 4px 14px rgba(37,99,235,0.45)', flexShrink: 0,
                minWidth: '64px', textAlign: 'center',
              }}>
                #{selectedTokenObj.display_number}
              </div>
              {/* ✕ unselect */}
              <button
                title="Unselect token"
                onClick={function() { setSelectedTokenObj(null); setMsg(null); setForm(FORM_DEFAULT); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '1.3rem', lineHeight: 1,
                  padding: '0 0.2rem', flexShrink: 0,
                }}
              >✕</button>
            </div>

            {/* Status message (errors / success) */}
            {msg && (
              <div style={{
                padding: '0.45rem 0.75rem', borderRadius: 6, marginBottom: '0.7rem',
                background: msg.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
                color: msg.type === 'success' ? 'var(--success)' : 'var(--danger)',
                fontSize: '0.82rem', fontWeight: 600,
              }}>
                {msg.type === 'success' ? '✅ ' : '⚠️ '}{msg.text}
              </div>
            )}

            {/* Form fields — 2 columns */}
            {!selectedTokenObj.is_available ? (
              <div style={{ marginBottom: '0.8rem', padding: '1rem', background: 'rgba(239,68,68,0.05)', border: '1px dashed rgba(239,68,68,0.3)', borderRadius: 8 }}>
                <div style={{ fontSize: '0.9rem', color: '#ef4444', fontWeight: 700, marginBottom: '0.5rem' }}>
                  This token is already {selectedTokenObj.status === 'Reserved' ? 'Frozen' : (selectedTokenObj.status === 'Completed' ? 'Consulted' : 'Booked')}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Patient Name: <strong>{selectedTokenObj.patient_name || 'N/A'}</strong><br/>
                  Phone: <strong>{selectedTokenObj.patient_phone || 'N/A'}</strong>
                </div>
                {selectedTokenObj.procedure_note && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Note: {selectedTokenObj.procedure_note}
                  </div>
                )}
                {selectedTokenObj.status === 'Completed' && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    This patient has already been consulted, so this token can no longer be cancelled.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem 1rem', marginBottom: '0.8rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Patient Name *</label>
                  <input className="form-control" placeholder="Full name" value={form.patient_name}
                    onChange={function(e) { setForm(function(f) { return Object.assign({}, f, { patient_name: e.target.value }); }); }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Phone 1 *</label>
                  <input className="form-control" placeholder="Mobile number" value={form.patient_phone}
                    onChange={function(e) { setForm(function(f) { return Object.assign({}, f, { patient_phone: e.target.value }); }); }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Phone 2</label>
                  <input className="form-control" placeholder="Optional" value={form.patient_alt_phone}
                    onChange={function(e) { setForm(function(f) { return Object.assign({}, f, { patient_alt_phone: e.target.value }); }); }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Age</label>
                  <input type="number" className="form-control" min="0" max="150" value={form.patient_age}
                    onChange={function(e) { setForm(function(f) { return Object.assign({}, f, { patient_age: e.target.value }); }); }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Gender</label>
                  <select className="form-control" value={form.patient_gender}
                    onChange={function(e) { setForm(function(f) { return Object.assign({}, f, { patient_gender: e.target.value }); }); }}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Place</label>
                  <input className="form-control" placeholder="Place (optional)" value={form.patient_address}
                    onChange={function(e) { setForm(function(f) { return Object.assign({}, f, { patient_address: e.target.value }); }); }} />
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost"
                onClick={function() { setSelectedTokenObj(null); setMsg(null); setForm(FORM_DEFAULT); }}>
                Close
              </button>
              {!selectedTokenObj.is_available ? (
                selectedTokenObj.status === 'Completed' ? (
                  <span style={{
                    fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600,
                    alignSelf: 'center', fontStyle: 'italic',
                  }}>
                    Consulted — cannot be cancelled
                  </span>
                ) : (
                <button className="btn btn-primary" onClick={async function() {
                  if (!window.confirm('Are you sure you want to cancel this booking?')) return;
                  try {
                    setBooking(true);
                    var url = selectedTokenObj.status === 'Reserved' 
                      ? '/clinic/appointments/' + selectedTokenObj.appointment_id + '/unblock'
                      : '/clinic/appointments/' + selectedTokenObj.appointment_id + '/status';
                    var payload = selectedTokenObj.status === 'Reserved' ? {} : { status: 'Cancelled' };
                    var method = selectedTokenObj.status === 'Reserved' ? 'delete' : 'patch';
                    var res = await api[method](url, payload);
                    if (res.data.success) {
                      setMsg({ type: 'success', text: 'Token cancelled successfully!' });
                      setTimeout(function() {
                        var bookedDate = dateKey(selectedTokenObj.session_ref.available_date);
                        setSelectedTokenObj(null);
                        loadTokensForDate(bookedDate);
                      }, 1000);
                    }
                  } catch (e) {
                    setMsg({ type: 'error', text: 'Failed to cancel token' });
                  } finally {
                    setBooking(false);
                  }
                }} disabled={booking} style={{ background: '#ef4444', borderColor: '#ef4444' }}>
                  {booking ? 'Cancelling...' : 'Cancel Appointment'}
                </button>
                )
              ) : (
                <button className="btn btn-primary" onClick={handleBook} disabled={booking}>
                  {booking ? 'Booking...' : ('🎟️ Book Token #' + selectedTokenObj.display_number)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Multi-token (procedure) booking popup — same look as the
          single-token popup, but lists every selected token and books
          them all together for one patient. */}
      {groupBookingOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem',
          }}
        >
          <div
            style={{
              width: '100%', maxWidth: '640px', maxHeight: '92vh', overflowY: 'auto',
              background: 'var(--bg-elevated)', border: '1px solid rgba(13,148,136,0.35)',
              borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
              padding: '1.1rem 1.35rem',
            }}
          >
            {/* Header — patient details + token chips + close */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', marginBottom: '0.9rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Multi-Token Booking (Procedure)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.3rem' }}>
                  {selectedGroupList.map(function(t) {
                    return (
                      <span key={t.unique_id} style={{
                        fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.55rem',
                        borderRadius: 999, background: 'rgba(13,148,136,0.18)', color: '#5eead4',
                        border: '1px solid rgba(13,148,136,0.4)',
                      }}>
                        #{t.display_number} {'\u00b7'} {fmtDate(t.session_ref.available_date)}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div style={{
                background: 'linear-gradient(135deg,#0f766e,#0d9488)', color: '#fff',
                borderRadius: 10, padding: '0.5rem 0.9rem', fontWeight: 800, fontSize: '1rem',
                lineHeight: 1.2, boxShadow: '0 4px 14px rgba(13,148,136,0.45)', flexShrink: 0,
                textAlign: 'center',
              }}>
                🔗<br />{selectedGroupList.length}
              </div>
              {/* ✕ close */}
              <button
                title="Close"
                onClick={function() { setGroupBookingOpen(false); setMsg(null); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '1.3rem', lineHeight: 1,
                  padding: '0 0.2rem', flexShrink: 0,
                }}
              >✕</button>
            </div>

            {/* Status message (errors / success) */}
            {msg && (
              <div style={{
                padding: '0.45rem 0.75rem', borderRadius: 6, marginBottom: '0.7rem',
                background: msg.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
                color: msg.type === 'success' ? 'var(--success)' : 'var(--danger)',
                fontSize: '0.82rem', fontWeight: 600,
              }}>
                {msg.type === 'success' ? '✅ ' : '⚠️ '}{msg.text}
              </div>
            )}

            {/* Form fields */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem 1rem', marginBottom: '0.65rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Patient Name *</label>
                <input className="form-control" placeholder="Full name" value={form.patient_name}
                  onChange={function(e) { setForm(function(f) { return Object.assign({}, f, { patient_name: e.target.value }); }); }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Phone 1 *</label>
                <input className="form-control" placeholder="Mobile number" value={form.patient_phone}
                  onChange={function(e) { setForm(function(f) { return Object.assign({}, f, { patient_phone: e.target.value }); }); }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Phone 2</label>
                <input className="form-control" placeholder="Optional" value={form.patient_alt_phone}
                  onChange={function(e) { setForm(function(f) { return Object.assign({}, f, { patient_alt_phone: e.target.value }); }); }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Age</label>
                <input type="number" className="form-control" min="0" max="150" value={form.patient_age}
                  onChange={function(e) { setForm(function(f) { return Object.assign({}, f, { patient_age: e.target.value }); }); }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Gender</label>
                <select className="form-control" value={form.patient_gender}
                  onChange={function(e) { setForm(function(f) { return Object.assign({}, f, { patient_gender: e.target.value }); }); }}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Place</label>
                <input className="form-control" placeholder="Place (optional)" value={form.patient_address}
                  onChange={function(e) { setForm(function(f) { return Object.assign({}, f, { patient_address: e.target.value }); }); }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Reason / Procedure (optional)</label>
                <input className="form-control" placeholder="e.g. Dressing procedure, minor surgery follow-up" value={form.procedure_note}
                  onChange={function(e) { setForm(function(f) { return Object.assign({}, f, { procedure_note: e.target.value }); }); }} />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost"
                onClick={function() { setGroupBookingOpen(false); setMsg(null); }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleBookGroup} disabled={groupBooking}
                style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)', borderColor: '#0d9488' }}>
                {groupBooking ? 'Booking...' : ('🔗 Book ' + selectedGroupList.length + ' Tokens')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClinicBookToken;