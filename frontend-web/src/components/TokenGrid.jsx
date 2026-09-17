import React from 'react';

/*
 * TokenGrid
 * ---------
 * Movie-theatre / bus-ticket style token picker.
 *
 * Every token in the session is shown as its own tile —
 * clickable (white, with the number in green) if still free,
 * green if booked, red once the patient has been consulted,
 * grey if blocked by the clinic. Selecting a free token
 * highlights it in blue and shows the estimated window.
 *
 * Expects `tokens` in the shape returned by
 * GET /clinic/availability/:availabilityId/tokens:
 *   { token_number, is_available, status, patient_name,
 *     estimated_time_label, arrive_by_label, ... }
 *
 * When display_number is present on a token (set by the
 * parent for continuous cross-session numbering) it is
 * shown instead of the raw token_number.
 */

const STATUS_STYLE = {
  // Available — white inside, green outline. The number itself is a
  // dark neutral (not the same green as the outline) so it reads as
  // its own distinct color against the white tile.
  Available:     { bg: '#ffffff', border: '#15803d', color: '#0f172a' },
  // Booked — green inside (an appointment is on the books, patient not
  // yet seen). Kept apart from Available by the solid green fill vs.
  // Available's white fill + green outline/number.
  Booked:        { bg: '#15803d', border: '#166534', color: '#ffffff' },
  Reserved:      { bg: '#6b7280', border: '#4b5563', color: '#ffffff' },
  Waiting:       { bg: '#ef4444', border: '#dc2626', color: '#ffffff' },
  'In Progress': { bg: '#ef4444', border: '#dc2626', color: '#ffffff' },
  // Completed — shown to staff as "Consulted". Red inside once the
  // patient has actually been seen.
  Completed:     { bg: '#dc2626', border: '#b91c1c', color: '#ffffff' },
  Skipped:       { bg: '#ef4444', border: '#dc2626', color: '#ffffff' },
  Absent:        { bg: '#ef4444', border: '#dc2626', color: '#ffffff' },
};

const SELECTED_STYLE = { bg: '#2563eb', border: '#1d4ed8', color: '#ffffff' };
const FALLBACK_STYLE  = { bg: '#f1f3f5', border: '#9aabb8', color: '#3d5263' };

const EXPIRED_STYLE = { bg: '#78350f', border: '#d97706', color: '#fcd34d' };

// Senior-citizen (age > 80) tokens get their own shade + a glowing gold
// ring once booked, so staff can spot them in the grid at a glance
// (e.g. to prioritize them or arrange assistance) without having to
// open every tile. Applies on top of the normal status color — i.e.
// only once a token is actually occupied by a patient over 80.
const SENIOR_STYLE = { bg: '#9d174d', border: '#facc15', color: '#ffffff' };

// Multi-token ("procedure") bookings — several tokens booked together
// for the SAME patient (e.g. a procedure spanning more than one slot)
// — share a booking_group_id from the API. Individual tiles are colored
// the same green as a normal Booked token (they ARE booked, just linked),
// while the surrounding box (GROUP_BOX_STYLE, below) uses an orange
// highlight so the whole set stands out as a unit at a glance. The 🔗
// badge still marks each tile, and its title/tooltip carries the
// procedure note when a group is opened.
var GROUP_STYLE = { bg: '#15803d', border: '#166534', color: '#ffffff' };
var GROUP_BOX_STYLE = { border: '#fb923c', tint: 'rgba(251,146,60,0.10)', label: '#fb923c' };

function groupColorFor(groupId) {
  return GROUP_STYLE;
}

// On-Site (walk-in) vs Online booking pools each get their own accent
// color so staff can tell at a glance which pool a token belongs to,
// on top of its Available/Booked/Blocked status. Gold vs light blue —
// a classic, easy-to-read pairing — stays clear of every status color
// in use (white = Available, green = Booked, red = Consulted/Waiting/
// etc, gray = Reserved), so the pool ring never gets mistaken for a
// status color.
const POOL_STYLE = {
  walk_in: { accent: '#f59e0b', tint: 'rgba(245,158,11,0.16)', label: 'On-Site' },
  online:  { accent: '#2563eb', tint: 'rgba(37,99,235,0.16)', label: 'Online'  },
};

const STATUS_LABELS = { Reserved: 'Blocked' };
function displayStatus(status) {
  return STATUS_LABELS[status] || status;
}

function startTimeOnly(label) {
  if (!label) return '';
  var parts = label.split(' - ');
  return parts[0] || label;
}

export function Legend() {
  var items = [
    { style: STATUS_STYLE.Available, text: 'Available' },
    { style: SELECTED_STYLE,         text: 'Selected'  },
    { style: STATUS_STYLE.Booked,    text: 'Booked'    },
    { style: STATUS_STYLE.Completed, text: 'Consulted' },
    { style: STATUS_STYLE.Reserved,  text: 'Blocked'   },
    { style: EXPIRED_STYLE,          text: 'Session Ended' },
    { style: { bg: STATUS_STYLE.Booked.bg, border: SENIOR_STYLE.border }, text: 'Senior Citizen (80+)' },
    { style: { bg: GROUP_STYLE.bg, border: GROUP_BOX_STYLE.border }, text: 'Linked Tokens (same patient)' },
  ];
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '0.7rem',
      marginBottom: '0.25rem', fontSize: '0.7rem', fontWeight: 600,
      color: 'var(--text-secondary, #e2e8f0)'
    }}>
      {items.map(function(item) {
        return (
          <span key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{
              width: 11, height: 11, borderRadius: 3,
              background: item.style.bg,
              border: '1.5px solid ' + item.style.border,
              display: 'inline-block', flexShrink: 0
            }} />
            {item.text}
          </span>
        );
      })}
      {/* Divider */}
      <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border, rgba(255,255,255,0.15))' }} />
      {[POOL_STYLE.walk_in, POOL_STYLE.online].map(function(pool) {
        return (
          <span key={pool.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{
              width: 11, height: 11, borderRadius: 3,
              background: pool.tint,
              border: '3px solid ' + pool.accent,
              display: 'inline-block', flexShrink: 0
            }} />
            {pool.label}
          </span>
        );
      })}
    </div>
  );
}

function TokenGrid(props) {
  var tokens = props.tokens;
  var selectedToken = props.selectedToken;
  var selectedTokens = props.selectedTokens; /* optional Set/array of keys — multi-select mode */
  var onSelect = props.onSelect;
  var loading = props.loading;
  var emptyText = props.emptyText;
  /* Optional: fixed number of tokens per row (e.g. 20). When omitted,
     falls back to the original auto-fill/responsive column behavior. */
  var columnsPerRow = props.columnsPerRow;
  /* Optional overrides so other pages (e.g. Freeze Slots) can reuse this
     exact grid/selection UI while changing which tokens are clickable and
     how a given status is colored/labeled — without touching Book Token. */
  var isClickable = props.isClickable || function(t) { return t.is_available; };
  var statusStyles = props.statusStyles ? Object.assign({}, STATUS_STYLE, props.statusStyles) : STATUS_STYLE;
  var statusLabels = props.statusLabels ? Object.assign({}, STATUS_LABELS, props.statusLabels) : STATUS_LABELS;

  function isKeySelected(tKey) {
    if (selectedTokens) {
      if (typeof selectedTokens.has === 'function') return selectedTokens.has(String(tKey));
      return selectedTokens.indexOf(String(tKey)) !== -1;
    }
    return selectedToken !== undefined && selectedToken !== '' && String(tKey) === String(selectedToken);
  }

  if (loading) {
    return (
      <div style={{ padding: '1rem', color: 'var(--text-muted, #94a3b8)', fontSize: '0.82rem' }}>
        Loading tokens...
      </div>
    );
  }

  if (!tokens || tokens.length === 0) {
    return (
      <div style={{ padding: '1rem', color: 'var(--text-muted, #94a3b8)', fontSize: '0.82rem' }}>
        {emptyText || 'No tokens available for this session.'}
      </div>
    );
  }

  var selected = null;
  if (!selectedTokens) {
    for (var si = 0; si < tokens.length; si++) {
      var st = tokens[si];
      var stKey = st.unique_id || st.token_number;
      if (String(stKey) === String(selectedToken)) {
        selected = st;
        break;
      }
    }
  }

  var remaining = 0;
  for (var ri = 0; ri < tokens.length; ri++) {
    if (tokens[ri].is_available) remaining++;
  }

  function renderTile(t) {
    var tKey = t.unique_id || t.token_number;
    var isSelected = isKeySelected(tKey);
    // "Session Ended" styling should only apply to tokens that were
    // never claimed by a patient — a truly free slot that expired
    // along with the session. NOTE: the parent page (e.g.
    // ClinicBookToken's buildContinuousGrid) forces is_available=false
    // on EVERY token once a session expires, so is_available can't be
    // used here to tell "never booked" apart from "booked but session
    // over" — we key off the token's original status instead, which
    // is left untouched. A token whose status is anything other than
    // the default "Available" (Booked, Waiting, In Progress,
    // Completed, Cancelled, Absent, Reserved/Blocked) keeps showing
    // its real status even after the session's end time has passed,
    // so staff can still see what happened with it.
    var isExpired = !!t.session_expired && (t.status === 'Available' || t.status == null);
    // An expired-but-unclaimed slot can no longer be booked, even
    // though is_available is still true on the raw token data.
    var clickable = isClickable(t) && !isExpired;
    // Only meaningful once a token is actually occupied — an empty
    // token has no patient (and so no age/group) to check.
    var isSenior = !t.is_available && !isExpired && !!t.is_senior_citizen;
    var isGroup = !t.is_available && !isExpired && !!t.booking_group_id;
    var groupStyle = isGroup ? groupColorFor(String(t.booking_group_id)) : null;
    var cellStyle = isSelected
      ? SELECTED_STYLE
      : isExpired
        ? EXPIRED_STYLE
        : isGroup
          ? groupStyle
          : (statusStyles[t.status] || FALLBACK_STYLE);
    var displayNum = t.display_number != null ? t.display_number : t.token_number;
    var pool = isExpired ? null : (POOL_STYLE[t.booking_source] || null);

    var statusLabel = statusLabels[t.status] || displayStatus(t.status);
    var endTime = t.session_ref && t.session_ref.end_time ? t.session_ref.end_time.slice(0, 5) : '';
    var patientDetailLines = t.patient_name
      ? [
          'Name: ' + t.patient_name,
          t.patient_phone ? 'Phone: ' + t.patient_phone : null,
          t.patient_age != null ? 'Age: ' + t.patient_age : null,
          t.estimated_time_label ? 'Time: ' + t.estimated_time_label : null,
        ].filter(Boolean)
      : [];
    var titleText = isExpired
      ? ('Token ' + displayNum + ' — Session ended at ' + endTime + '. Cannot be booked.')
      : t.is_available
        ? ('Token ' + displayNum + ' — ' + (pool ? pool.label + ' — ' : '') + (t.estimated_time_label || ''))
        : ('Token ' + displayNum + ' — ' + (pool ? pool.label + ' — ' : '') + statusLabel
            + (isSenior ? ' — Senior Citizen' : '')
            + (isGroup ? ' — Linked / Procedure booking' + (t.procedure_note ? ' (' + t.procedure_note + ')' : '') : '')
            + (patientDetailLines.length ? '\n' + patientDetailLines.join('\n') : ''));

    // Pool (On-Site vs Online) is now shown as a clearly visible colored
    // border around the whole tile, instead of a small corner dot — much
    // easier to spot at a glance than a 9px circle. Selection still wins
    // visually (blue border), but pool color takes priority over the
    // normal status/group/senior border so it always reads clearly.
    var borderColor = isSelected
      ? cellStyle.border
      : (pool ? pool.accent : (isSenior ? SENIOR_STYLE.border : cellStyle.border));
    var borderWidth = isSelected
      ? '2px'
      : (pool ? '3px' : ((isSenior || isGroup) ? '2px' : '1.5px'));
    var boxShadow = isSelected
      ? '0 2px 6px -1px rgba(29,111,184,0.40)'
      : pool
        ? '0 0 0 1px ' + pool.accent + '55, 0 2px 6px -1px rgba(15,23,42,0.45)'
        : isGroup
          ? '0 0 0 2px ' + groupStyle.border + '55, 0 2px 6px -1px rgba(15,23,42,0.45)'
          : isSenior
            ? '0 0 0 2px rgba(250,204,21,0.35), 0 2px 6px -1px rgba(126,34,206,0.45)'
            : clickable
              ? '0 1px 3px rgba(15,30,45,0.08)'
              : 'none';

    var subLabel = '';
    if (isExpired) {
      subLabel = 'Ended';
    } else if (isGroup) {
      // Procedure/linked bookings get their own label INSIDE the tile
      // (not just the small corner badge) so staff recognize them at a
      // glance instead of having to notice a 6px dot or hover for the
      // tooltip.
      subLabel = 'Procedure';
    } else if (!t.is_available) {
      if (t.status === 'In Progress') subLabel = 'Live';
      else if (t.status === 'Completed') subLabel = 'Consulted';
      else subLabel = statusLabel;
    }

    return (
      <div key={tKey} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', minWidth: 0, width: '100%', flex: '1 1 0%' }}>
        {t.estimated_time_label ? (
          <span style={{
            fontSize: '0.58rem', fontWeight: 700,
            color: isSelected ? '#60a5fa' : 'var(--text-muted, #94a3b8)',
            textTransform: 'uppercase', letterSpacing: '0.01em',
            lineHeight: 1, whiteSpace: 'nowrap',
            overflow: 'hidden', maxWidth: '100%',
            textOverflow: 'ellipsis',
          }}>
            {startTimeOnly(t.estimated_time_label)}
          </span>
        ) : null}
        <div style={{ position: 'relative', width: '100%' }}>
          <button
            className="token-btn"
            role="option"
            aria-selected={isSelected}
            disabled={!clickable}
            onClick={function() { if (clickable) onSelect(tKey, t); }}
            title={titleText}
            style={{
              position: 'relative',
              minHeight: '42px',
              background: cellStyle.bg,
              borderRadius: '6px',
              border: borderWidth + ' solid ' + borderColor,
              color: cellStyle.color,
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: clickable ? 'pointer' : 'not-allowed',
              opacity: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              padding: '0.1rem 0.15rem',
              width: '100%',
              boxShadow: boxShadow,
              transition: 'transform 0.12s ease, box-shadow 0.12s ease',
              transform: isSelected ? 'translateY(-1px)' : 'none',
            }}
          >
            {isSelected ? (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                width: 11, height: 11, borderRadius: '50%',
                background: '#1d6fb8', color: '#fff',
                fontSize: '0.45rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1.5px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
              }}>
                ✓
              </span>
            ) : (isSenior ? (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                width: 13, height: 13, borderRadius: '50%',
                background: '#facc15', color: '#78350f',
                fontSize: '0.42rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1.5px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.28)',
              }} title="Senior Citizen (80+)">
                80+
              </span>
            ) : null)}
            {isGroup ? (
              <span style={{
                position: 'absolute', bottom: -4, right: -4,
                width: 12, height: 12, borderRadius: '50%',
                background: groupStyle.border, color: '#0f172a',
                fontSize: '0.42rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1.5px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.28)',
              }} title={'Linked booking' + (t.procedure_note ? ': ' + t.procedure_note : '')}>
                🔗
              </span>
            ) : null}
            <span>{displayNum}</span>
            {(isExpired || !t.is_available) ? (
              <span style={{
                fontSize: '0.6rem',
                fontWeight: 800,
                marginTop: 2,
                letterSpacing: '0.02em',
                lineHeight: 1.1,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textShadow: '0 1px 2px rgba(0,0,0,0.45)',
              }}>
                {subLabel}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {!props.hideHeader && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '0.5rem'
        }}>
          <Legend />
          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary, #fff)', whiteSpace: 'nowrap' }}>
            {remaining} Available
          </span>
        </div>
      )}

      {/* Procedure/linked tokens are grouped inside their own highlighted
          box so staff can spot the set as a unit, while each tile inside
          keeps the same red "Booked" color as any other booked token
          (it IS booked — just linked to others). The box's badge sits
          in normal document flow at the top of the box itself (not
          absolutely positioned above it), so it only ever grows the
          box's own height and never overlaps neighboring columns. */}
      {(function() {
        var segments = [];
        var groupMap = {};
        for (var gi = 0; gi < tokens.length; gi++) {
          var tk = tokens[gi];
          var gid = (!tk.is_available && tk.booking_group_id) ? String(tk.booking_group_id) : null;
          if (gid) {
            if (groupMap[gid] !== undefined) {
              segments[groupMap[gid]].tokens.push(tk);
            } else {
              groupMap[gid] = segments.length;
              segments.push({ type: 'group', groupId: gid, note: tk.procedure_note || '', tokens: [tk] });
            }
          } else {
            segments.push({ type: 'token', token: tk });
          }
        }

        var colCount = columnsPerRow || null;

        return (
          <div
            className="token-grid-container"
            style={{
              display: 'grid',
              gridTemplateColumns: colCount
                ? 'repeat(' + colCount + ', 1fr)'
                : 'repeat(auto-fill, minmax(46px, 1fr))',
              gap: '0.3rem 0.28rem',
              background: 'var(--bg-base, #1e293b)',
              padding: '0.4rem 0.5rem',
              borderRadius: 6,
              border: '1px solid var(--border)',
              alignItems: 'start',
            }}
          >
            {segments.map(function(seg) {
              if (seg.type === 'token') {
                return renderTile(seg.token);
              }
              var spanCount = seg.tokens.length;
              return (
                <div
                  key={'grp-' + seg.groupId}
                  style={{
                    gridColumn: colCount ? 'span ' + spanCount : undefined,
                    alignSelf: 'start',
                    position: 'relative',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    /* A straight flex row of tiles — same shape as a run of
                       plain tokens — so the tiles inside line up exactly
                       with the rest of the row instead of sitting one row
                       lower under a stacked header. */
                    display: 'flex',
                    gap: '0.28rem',
                    flexWrap: 'nowrap',
                    alignItems: 'flex-start',
                    border: '2px solid ' + GROUP_BOX_STYLE.border,
                    borderRadius: 8,
                    background: GROUP_BOX_STYLE.tint,
                    padding: '2px 4px',
                    boxShadow: '0 2px 6px -1px rgba(15,23,42,0.45)',
                  }}
                >
                  {/* Badge sits ON the box's top border, like a fieldset
                      legend, via absolute positioning — it takes no flow
                      height, so it never pushes the tiles below out of
                      line with neighboring tokens in the same row. */}
                  <span style={{
                    position: 'absolute', top: -7, left: 8,
                    display: 'inline-block', maxWidth: 'calc(100% - 16px)',
                    fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.04em',
                    textTransform: 'uppercase', color: GROUP_BOX_STYLE.label,
                    lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    background: 'var(--bg-base, #1e293b)', padding: '0 3px',
                  }} title={seg.note ? ('🔗 ' + seg.note) : '🔗 Procedure'}>
                    🔗 {seg.note || 'Procedure'}
                  </span>
                  {seg.tokens.map(function(gt) { return renderTile(gt); })}
                </div>
              );
            })}
          </div>
        );
      })()}

      {selected ? (
        <div style={{
          marginTop: '0.75rem', padding: '0.65rem 1rem',
          background: 'rgba(37,99,235,0.12)',
          border: '1px solid rgba(37,99,235,0.35)',
          borderRadius: '8px', fontSize: '0.81rem', color: '#93c5fd',
          fontWeight: 500,
        }}>
          {'🕐 Token '}
          <strong>{'#' + (selected.display_number != null ? selected.display_number : selected.token_number)}</strong>
          {' \u2014 estimated '}
          <strong>{selected.estimated_time_label}</strong>
          {'. Ask the patient to arrive by '}
          <strong>{selected.arrive_by_label}</strong>
          {' (times may shift with the queue).'}
        </div>
      ) : null}
    </div>
  );
}

export default TokenGrid;