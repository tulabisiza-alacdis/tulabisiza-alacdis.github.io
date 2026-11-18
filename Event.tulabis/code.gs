/**
 * OrgPass — Google Apps Script backend (free).
 * Bind this script to a Google Sheet (Extensions > Apps Script), then
 * Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
 *
 * Sheets (auto-created):
 *   Guests: Name, TicketCode, Role, Status, CheckInTime, CheckedInBy
 *   Events: ID, Title, Date, Time, Venue, Description, IsActive
 *
 * All write operations are idempotent, so the offline queue can safely retry.
 */

const GUEST_HEADERS = ['Name', 'TicketCode', 'Role', 'Status', 'CheckInTime', 'CheckedInBy'];
const EVENT_HEADERS = ['ID', 'Title', 'Date', 'Time', 'Venue', 'Description', 'IsActive'];

/** Run this once manually from the editor to authorize and create the sheets. */
function setup() {
  ensureSheet_('Guests', GUEST_HEADERS);
  ensureSheet_('Events', EVENT_HEADERS);
}

/* ---------- HTTP entry points ---------- */

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'getAll';
    if (action === 'getAll' || action === 'ping') return json_(readAll_());
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// The app posts a text/plain JSON body so the browser skips the CORS preflight.
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const ops = body.action === 'batch' ? (body.ops || []) : [body];
    const ctx = newCtx_();
    ops.forEach(function (op) { applyOp_(ctx, op); });
    SpreadsheetApp.flush();
    return json_({ ok: true, applied: ops.length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Sheet helpers ---------- */

function ensureSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    // Plain-text format keeps ticket codes like "0012" and times exactly as written.
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#093D5E').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

function str_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).slice(0, 500);
}

function norm_(c) {
  return String(c || '').toUpperCase().replace(/\s+/g, '');
}

function ensureRows_(sh, lastRow, extra) {
  const need = lastRow + extra - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need + 20);
}

/* ---------- Read ---------- */

function readAll_() {
  const gs = ensureSheet_('Guests', GUEST_HEADERS);
  const es = ensureSheet_('Events', EVENT_HEADERS);
  const gn = gs.getLastRow() - 1;
  const en = es.getLastRow() - 1;
  const guests = (gn > 0 ? gs.getRange(2, 1, gn, 6).getValues() : [])
    .filter(function (r) { return str_(r[0]) || str_(r[1]); })
    .map(function (r) {
      return { name: str_(r[0]), code: str_(r[1]), role: str_(r[2]) || 'Guest',
               status: str_(r[3]) === 'Present' ? 'Present' : 'Absent',
               time: str_(r[4]), by: str_(r[5]) };
    });
  const events = (en > 0 ? es.getRange(2, 1, en, 7).getValues() : [])
    .filter(function (r) { return str_(r[0]); })
    .map(function (r) {
      return { id: str_(r[0]), title: str_(r[1]), date: str_(r[2]), time: str_(r[3]),
               venue: str_(r[4]), description: str_(r[5]),
               active: str_(r[6]).toUpperCase() === 'TRUE' };
    });
  return { ok: true, guests: guests, events: events, serverTime: new Date().toISOString() };
}

/* ---------- Write operations ---------- */

function newCtx_() {
  return {
    gs: ensureSheet_('Guests', GUEST_HEADERS),
    es: ensureSheet_('Events', EVENT_HEADERS),
    map: null,   // normalized code -> row number (lazy)
    last: 1      // last used row on Guests
  };
}

function loadGuests_(ctx) {
  if (ctx.map) return;
  ctx.map = {};
  ctx.last = Math.max(1, ctx.gs.getLastRow());
  if (ctx.last > 1) {
    const codes = ctx.gs.getRange(2, 2, ctx.last - 1, 1).getValues();
    codes.forEach(function (r, i) {
      const c = norm_(r[0]);
      if (c && !ctx.map[c]) ctx.map[c] = i + 2;
    });
  }
}

function appendGuests_(ctx, list) {
  if (!list.length) return;
  loadGuests_(ctx);
  ensureRows_(ctx.gs, ctx.last, list.length);
  const rows = list.map(function (g) {
    return [str_(g.name), str_(g.code), str_(g.role) || 'Guest',
            g.status === 'Present' ? 'Present' : 'Absent', str_(g.time), str_(g.by)];
  });
  const range = ctx.gs.getRange(ctx.last + 1, 1, rows.length, 6);
  range.setNumberFormat('@').setValues(rows);
  rows.forEach(function (r, i) { ctx.map[norm_(r[1])] = ctx.last + 1 + i; });
  ctx.last += rows.length;
}

function readEvents_(ctx) {
  const n = ctx.es.getLastRow() - 1;
  return n > 0 ? ctx.es.getRange(2, 1, n, 7).getValues() : [];
}

function applyOp_(ctx, op) {
  switch (op.action) {
    case 'checkin': {
      loadGuests_(ctx);
      const code = norm_(op.code);
      const row = ctx.map[code];
      if (row) {
        if (str_(ctx.gs.getRange(row, 4).getValue()) === 'Present') return; // first scan wins
        ctx.gs.getRange(row, 4, 1, 3).setValues([['Present', str_(op.time), str_(op.by)]]);
      } else if (op.name) {
        appendGuests_(ctx, [{ name: op.name, code: op.code, role: op.role,
                              status: 'Present', time: op.time, by: op.by }]);
      }
      return;
    }
    case 'uncheck': {
      loadGuests_(ctx);
      const row = ctx.map[norm_(op.code)];
      if (row) ctx.gs.getRange(row, 4, 1, 3).setValues([['Absent', '', '']]);
      return;
    }
    case 'addGuest': {
      loadGuests_(ctx);
      const g = op.guest || {};
      const row = ctx.map[norm_(g.code)];
      if (row) {
        ctx.gs.getRange(row, 1, 1, 6).setNumberFormat('@').setValues([[
          str_(g.name), str_(g.code), str_(g.role) || 'Guest',
          g.status === 'Present' ? 'Present' : 'Absent', str_(g.time), str_(g.by)]]);
      } else {
        appendGuests_(ctx, [g]);
      }
      return;
    }
    case 'bulkAdd': {
      loadGuests_(ctx);
      const seen = {};
      const fresh = (op.guests || []).filter(function (g) {
        const c = norm_(g.code);
        if (!c || ctx.map[c] || seen[c]) return false;
        seen[c] = true;
        return true;
      });
      appendGuests_(ctx, fresh);
      return;
    }
    case 'deleteGuest': {
      loadGuests_(ctx);
      const row = ctx.map[norm_(op.code)];
      if (row) { ctx.gs.deleteRow(row); ctx.map = null; }
      return;
    }
    case 'reset': {
      const rows = ctx.gs.getMaxRows() - 1;
      if (rows > 0) ctx.gs.getRange(2, 1, rows, 6).clearContent();
      ctx.map = {};
      ctx.last = 1;
      return;
    }
    case 'addEvent': {
      const ev = op.event || {};
      const rows = readEvents_(ctx);
      const idx = rows.findIndex(function (r) { return str_(r[0]) === str_(ev.id); });
      const active = idx >= 0 ? str_(rows[idx][6]) : 'FALSE';
      const vals = [[str_(ev.id), str_(ev.title), str_(ev.date), str_(ev.time),
                     str_(ev.venue), str_(ev.description), active || 'FALSE']];
      const rowNum = idx >= 0 ? idx + 2 : Math.max(1, ctx.es.getLastRow()) + 1;
      ensureRows_(ctx.es, rowNum - 1, 1);
      ctx.es.getRange(rowNum, 1, 1, 7).setNumberFormat('@').setValues(vals);
      return;
    }
    case 'deleteEvent': {
      const rows = readEvents_(ctx);
      const idx = rows.findIndex(function (r) { return str_(r[0]) === str_(op.id); });
      if (idx >= 0) ctx.es.deleteRow(idx + 2);
      return;
    }
    case 'setActive': {
      const rows = readEvents_(ctx);
      if (!rows.length) return;
      const flags = rows.map(function (r) { return [str_(r[0]) === str_(op.id) ? 'TRUE' : 'FALSE']; });
      ctx.es.getRange(2, 7, flags.length, 1).setNumberFormat('@').setValues(flags);
      return;
    }
    default:
      return; // ignore unknown ops
  }
}