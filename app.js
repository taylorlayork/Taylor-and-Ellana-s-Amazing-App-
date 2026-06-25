const CONFIG = {
  places: {
    us: {
      id: 'us', defaultName: 'Taylor', shortLabel: 'Ingleside', label: 'Ingleside, Illinois', country: 'United States', regionLabel: 'USA federal',
      timezone: 'America/Chicago', latitude: 42.377, longitude: -88.139, currency: 'USD', holidayCountry: 'US', holidayRegion: null, tempUnit: 'fahrenheit', windUnit: 'mph'
    },
    au: {
      id: 'au', defaultName: 'Ellana', shortLabel: 'Sydney', label: 'Sydney, New South Wales', country: 'Australia', regionLabel: 'Australia + NSW',
      timezone: 'Australia/Sydney', latitude: -33.8688, longitude: 151.2093, currency: 'AUD', holidayCountry: 'AU', holidayRegion: 'AU-NSW', tempUnit: 'celsius', windUnit: 'kmh'
    }
  },
  awakeStart: 7,
  awakeEnd: 23,
  forecastDays: 7
};

const WEATHER_CODE = {
  0:'Clear', 1:'Mostly clear', 2:'Partly cloudy', 3:'Cloudy', 45:'Fog', 48:'Rime fog',
  51:'Light drizzle', 53:'Drizzle', 55:'Heavy drizzle', 56:'Freezing drizzle', 57:'Freezing drizzle',
  61:'Light rain', 63:'Rain', 65:'Heavy rain', 66:'Freezing rain', 67:'Freezing rain',
  71:'Light snow', 73:'Snow', 75:'Heavy snow', 77:'Snow grains', 80:'Rain showers',
  81:'Rain showers', 82:'Heavy showers', 85:'Snow showers', 86:'Heavy snow showers',
  95:'Thunderstorms', 96:'Thunderstorms + hail', 99:'Thunderstorms + hail'
};

const state = { settings: loadSettings(), holidays: [], weather: {}, weatherUnits: loadWeatherUnits(), fxRate: null, fxDate: null, fxSource: null, fxError: null };


const $ = (selector) => document.querySelector(selector);


const CALL_ALERT_CALM_KEY = 'across.callAlertCalmedWindow';
function currentWindowKey(window) { return window?.start instanceof Date ? window.start.toISOString() : ''; }
function isCallAlertCalmed(window) {
  const key = currentWindowKey(window);
  return Boolean(key && localStorage.getItem(CALL_ALERT_CALM_KEY) === key);
}
function calmCallAlert(window) {
  const key = currentWindowKey(window);
  if (key) localStorage.setItem(CALL_ALERT_CALM_KEY, key);
}
function shouldFlashCallAlert(window, overlapNow) {
  if (!window || !overlapNow) return false;
  if (isCallAlertCalmed(window)) return false;
  return Date.now() - window.start.getTime() < 45000;
}
function callNowBannerHtml(window, shouldFlash) {
  const attrs = shouldFlash ? ' data-calm-call-alert="1"' : '';
  const hint = shouldFlash ? '<small>Tap to calm flashing</small>' : '<small>Good window is open</small>';
  const extraClass = shouldFlash ? 'is-flashing' : 'is-calm';
  return `<button type="button" class="call-now-banner ${extraClass}"${attrs}>CALL EACH OTHER... NOWWW${hint}</button>`;
}


function loadSettings() {
  const fallback = { names: { us: CONFIG.places.us.defaultName, au: CONFIG.places.au.defaultName }, awakeStart: CONFIG.awakeStart, awakeEnd: CONFIG.awakeEnd, customDates: [] };
  try {
    const stored = JSON.parse(localStorage.getItem('across.settings'));
    const merged = { ...fallback, ...stored, names: { ...fallback.names, ...(stored?.names || {}) }, customDates: Array.isArray(stored?.customDates) ? stored.customDates : [] };
    if (merged.names.au === 'Sydney') merged.names.au = CONFIG.places.au.defaultName;
    return merged;
  } catch { return fallback; }
}
function loadWeatherUnits() {
  try {
    const stored = JSON.parse(localStorage.getItem('across.weatherUnits'));
    return { us: stored?.us || 'F', au: stored?.au || 'C' };
  } catch { return { us: 'F', au: 'C' }; }
}
function saveWeatherUnits(){ localStorage.setItem('across.weatherUnits', JSON.stringify(state.weatherUnits)); }
function selectedWeatherUnit(place){ return state.weatherUnits[place.id] || (place.tempUnit === 'fahrenheit' ? 'F' : 'C'); }
function toggleWeatherUnit(placeId){
  state.weatherUnits[placeId] = selectedWeatherUnit(CONFIG.places[placeId]) === 'F' ? 'C' : 'F';
  saveWeatherUnits();
  renderWeather();
}
function saveSettingsToStorage(){ localStorage.setItem('across.settings', JSON.stringify(state.settings)); }
function nameFor(id){ return state.settings.names[id] || CONFIG.places[id].defaultName; }
function escapeHtml(value){ return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); }
async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function formatInZone(date, timezone, options = {}) { return new Intl.DateTimeFormat('en-US', { timeZone: timezone, ...options }).format(date); }
function partsInZone(date, timezone) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return { year:+parts.year, month:+parts.month, day:+parts.day, hour:+parts.hour, minute:+parts.minute, second:+parts.second };
}
function zoneOffsetMinutes(date, timezone) {
  const p = partsInZone(date, timezone);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime()) / 60000);
}
function localMinutes(date, timezone){ const p = partsInZone(date, timezone); return p.hour * 60 + p.minute; }
function isoDateInZone(date, timezone){ const p = partsInZone(date, timezone); return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`; }
function isWithinMinuteRange(mins, start, end) {
  return start < end ? mins >= start && mins < end : mins >= start || mins < end;
}
function availabilityForPlace(date, place) {
  if (place?.id === 'au') return { start: 6 * 60, end: 23 * 60, label: '6:00 AM–11:00 PM' };
  if (place?.id === 'us') {
    const weekday = formatInZone(date, place.timezone, { weekday: 'short' });
    const startHour = weekday === 'Mon' || weekday === 'Wed' ? 15 : 16;
    return { start: startHour * 60, end: 23 * 60, label: `${startHour === 15 ? '3:00' : '4:00'} PM–11:00 PM` };
  }
  return { start: Number(state.settings.awakeStart) * 60, end: Number(state.settings.awakeEnd) * 60, label: `${state.settings.awakeStart}:00–${state.settings.awakeEnd}:00` };
}
function isReasonableHour(date, placeOrTimezone) {
  if (typeof placeOrTimezone === 'string') {
    const mins = localMinutes(date, placeOrTimezone);
    const start = Number(state.settings.awakeStart) * 60;
    const end = Number(state.settings.awakeEnd) * 60;
    return isWithinMinuteRange(mins, start, end);
  }
  const place = placeOrTimezone;
  const window = availabilityForPlace(date, place);
  return isWithinMinuteRange(localMinutes(date, place.timezone), window.start, window.end);
}
function isGoodCallTime(date, place) {
  const window = availabilityForPlace(date, place);
  return isWithinMinuteRange(localMinutes(date, place.timezone), window.start, window.end);
}
function isLikelyQuietHours(date, place) {
  const mins = localMinutes(date, place.timezone);
  // Quiet means normal sleep-ish hours, not simply "outside the call window."
  // This keeps a normal afternoon in Illinois from being labeled quiet just because
  // the preferred call window starts later.
  return mins < 7 * 60 || mins >= 23 * 60;
}
function greetingFromMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  if (h < 5) return 'Late night';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Night';
}
function displayIsoDate(iso, opts = {}) { return new Intl.DateTimeFormat('en-US', { timeZone:'UTC', weekday:'short', month:'short', day:'numeric', year:'numeric', ...opts }).format(new Date(`${iso}T12:00:00Z`)); }
function shortDisplayIsoDate(iso) { return new Intl.DateTimeFormat('en-US', { timeZone:'UTC', weekday:'short', month:'short', day:'numeric' }).format(new Date(`${iso}T12:00:00Z`)); }
function relativeDay(date, timezone) {
  const today = isoDateInZone(new Date(), timezone);
  const tomorrow = isoDateInZone(new Date(Date.now() + 86400000), timezone);
  const target = isoDateInZone(date, timezone);
  if (target === today) return 'Today';
  if (target === tomorrow) return 'Tomorrow';
  return formatInZone(date, timezone, { weekday:'long', month:'short', day:'numeric' });
}
function formatLocalApiTime(isoString) {
  if (!isoString || !isoString.includes('T')) return '—';
  const [h, m] = isoString.split('T')[1].split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m).padStart(2,'0')} ${suffix}`;
}
function dateAddIso(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fToC(f){ return (Number(f) - 32) * 5 / 9; }
function cToF(c){ return Number(c) * 9 / 5 + 32; }
function roundTemp(value){ return Math.round(Number(value)); }
function primaryUnit(place){ return place.tempUnit === 'fahrenheit' ? '°F' : '°C'; }
function secondaryUnit(place){ return place.tempUnit === 'fahrenheit' ? '°C' : '°F'; }
function convertTempFromPrimary(value, place) { return place.tempUnit === 'fahrenheit' ? fToC(value) : cToF(value); }
function tempPair(value, place) { return `${roundTemp(value)}${primaryUnit(place)} / ${roundTemp(convertTempFromPrimary(value, place))}${secondaryUnit(place)}`; }
function valueInUnitFromPrimary(value, place, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  const sourceF = place.tempUnit === 'fahrenheit';
  if (unit === 'F') return sourceF ? n : cToF(n);
  return sourceF ? fToC(n) : n;
}
function tempTextForUnit(value, place, unit = selectedWeatherUnit(place)) {
  return `${roundTemp(valueInUnitFromPrimary(value, place, unit))}°${unit}`;
}
function tempPairForUnit(value, place, unit = selectedWeatherUnit(place)) {
  const other = unit === 'F' ? 'C' : 'F';
  return `${tempTextForUnit(value, place, unit)} / ${tempTextForUnit(value, place, other)}`;
}

function fxLines() {
  if (!state.fxRate) return `<span>${state.fxError ? 'Exchange rate unavailable' : 'Loading USD/AUD exchange rate…'}</span>`;
  return `<span>1 USD = ${state.fxRate.toFixed(4)} AUD</span><span>1 AUD = ${(1 / state.fxRate).toFixed(4)} USD</span>`;
}
function fxForCurrency(currency) {
  if (!state.fxRate) return state.fxError ? 'Unavailable' : 'Loading…';
  return currency === 'USD' ? `1 USD = ${state.fxRate.toFixed(4)} AUD` : `1 AUD = ${(1 / state.fxRate).toFixed(4)} USD`;
}
function renderFxNote() {
  const el = $('#fxQuickNote');
  if (!el) return;
  if (!state.fxRate) {
    el.textContent = state.fxError ? 'Exchange rate unavailable right now.' : 'Loading exchange rate…';
    return;
  }
  el.textContent = `1 USD = ${state.fxRate.toFixed(4)} AUD · 1 AUD = ${(1 / state.fxRate).toFixed(4)} USD`;
}

function clockPointFromHourMinutes(minutes, radius = 35, center = 50) {
  const angle = ((minutes % 720) / 720) * 360 - 90;
  const rad = angle * Math.PI / 180;
  return { x: center + radius * Math.cos(rad), y: center + radius * Math.sin(rad) };
}
function hourRingArcSegment(startMinutes, endMinutes, radius, className) {
  const duration = Math.max(0, endMinutes - startMinutes);
  if (duration < 5) return '';
  // Draw a true filled clock wedge from the center outward instead of a stroked ring.
  // AM wedges extend toward the outer 1–12 face; PM wedges stay inside the 13–24 inner circle.
  if (duration >= 715) return `<circle class="${className}" cx="50" cy="50" r="${radius}" />`;
  const start = clockPointFromHourMinutes(startMinutes, radius);
  const end = clockPointFromHourMinutes(endMinutes, radius);
  const largeArc = duration > 360 ? 1 : 0;
  return `<path class="${className}" d="M 50 50 L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z" />`;
}
function callWindowArcSvg(window, timezone, isActive = false) {
  if (!window) return '';
  const startMinutes = localMinutes(window.start, timezone);
  const durationMinutes = Math.max(30, Math.round((window.end - window.start) / 60000));
  const activeClass = isActive ? 'active-window' : 'upcoming-window';
  const pieces = [];
  let cursor = startMinutes;
  let remaining = durationMinutes;
  let guard = 0;
  while (remaining > 0 && guard < 8) {
    guard += 1;
    const dayMinute = ((cursor % 1440) + 1440) % 1440;
    const dayBoundary = 1440 - dayMinute;
    const chunk = Math.min(remaining, dayBoundary);
    const chunkEnd = dayMinute + chunk;
    const splitPoints = [dayMinute];
    if (dayMinute < 720 && chunkEnd > 720) splitPoints.push(720);
    splitPoints.push(chunkEnd);
    for (let i = 0; i < splitPoints.length - 1; i += 1) {
      const segmentStart = splitPoints[i];
      const segmentEnd = splitPoints[i + 1];
      if (segmentEnd <= segmentStart) continue;
      const isPmRing = segmentStart >= 720;
      const localStart = isPmRing ? segmentStart - 720 : segmentStart;
      const localEnd = isPmRing ? segmentEnd - 720 : segmentEnd;
      const ringClass = isPmRing ? 'pm-window' : 'am-window';
      const radius = isPmRing ? 25.5 : 43.5;
      pieces.push(hourRingArcSegment(localStart, localEnd, radius, `window-arc ${activeClass} ${ringClass}`));
    }
    cursor += chunk;
    remaining -= chunk;
  }
  return pieces.join('');
}
function outerClockNumbers() {
  const nums = [
    ['12', 50, 14], ['1', 68, 19], ['2', 81, 32], ['3', 86, 50], ['4', 81, 68], ['5', 68, 81],
    ['6', 50, 86], ['7', 32, 81], ['8', 19, 68], ['9', 14, 50], ['10', 19, 32], ['11', 32, 19]
  ];
  return nums.map(([text, x, y]) => `<text class="num outer-num" x="${x}" y="${y}">${text}</text>`).join('');
}
function innerTwentyFourHourLabels() {
  const labels = Array.from({ length: 12 }, (_, i) => {
    const hour = i === 11 ? 24 : i + 13;
    const minutes = ((hour === 24 ? 12 : hour - 12) % 12) * 60;
    const pt = clockPointFromHourMinutes(minutes, 25.5);
    return `<text class="num inner-num" x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}">${hour}</text>`;
  });
  return labels.join('');
}
function analogClockSvg(date, timezone, callWindow = null, isActiveOverlap = false) {
  const p = partsInZone(date, timezone);
  const minuteDeg = p.minute * 6;
  const hourDeg = ((p.hour % 12) + p.minute / 60) * 30;
  const isPmNow = p.hour >= 12;
  const currentRingMinutes = (p.hour % 12) * 60 + p.minute;
  const currentDot = clockPointFromHourMinutes(currentRingMinutes, isPmNow ? 25.5 : 36.2);
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const deg = i * 6;
    const isHour = i % 5 === 0;
    return `<line class="tick ${isHour ? 'hour-tick' : 'minute-tick'}" x1="50" y1="6.5" x2="50" y2="${isHour ? 12.5 : 9.5}" transform="rotate(${deg} 50 50)" />`;
  }).join('');
  return `<svg class="analog-clock" viewBox="0 0 100 100" role="img" aria-label="Analog clock with AM and PM filled call-window wedges">
    <circle class="face" cx="50" cy="50" r="45" />
    ${callWindowArcSvg(callWindow, timezone, isActiveOverlap)}
    ${ticks}
    ${outerClockNumbers()}
    <circle class="inner-hour-ring" cx="50" cy="50" r="25.5" />
    ${innerTwentyFourHourLabels()}
    <line class="hour-hand" x1="50" y1="50" x2="50" y2="31" transform="rotate(${hourDeg} 50 50)" />
    <line class="minute-hand" x1="50" y1="53" x2="50" y2="13" transform="rotate(${minuteDeg} 50 50)" />
    <circle class="now-dot ${isPmNow ? 'pm-now' : 'am-now'}" cx="${currentDot.x.toFixed(2)}" cy="${currentDot.y.toFixed(2)}" r="2.15" />
    <circle class="pin" cx="50" cy="50" r="3.5" />
  </svg>`;
}
function humanDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'now';
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function countdownParts(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return [{ value: 'now', unit: '' }];
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days > 0) parts.push({ value: days, unit: 'd' });
  if (hours > 0 || days > 0) parts.push({ value: hours, unit: 'h' });
  if (days === 0) parts.push({ value: minutes, unit: 'm' });
  return parts;
}
function countdownBigHtml(ms) {
  return `<div class="countdown-big">${countdownParts(ms).map(part => `<span><strong>${part.value}</strong><em>${part.unit}</em></span>`).join('')}</div>`;
}
function currentCallStatus(window, isActive) {
  if (!window) return { label: 'No overlap found', detail: 'Try widening reasonable hours in settings.', className: 'quiet' };
  const now = new Date();
  if (isActive) return { label: 'Good window right now', detail: `Ends in ${humanDuration(window.end - now)}`, className: 'active' };
  return { label: 'Not ideal right now', detail: `Next good window starts in ${humanDuration(window.start - now)}`, className: 'upcoming' };
}


function roundDown(date, minutes = 30){ const ms = minutes * 60000; return new Date(Math.floor(date.getTime() / ms) * ms); }
function roundUp(date, minutes = 30){ const ms = minutes * 60000; return new Date(Math.ceil(date.getTime() / ms) * ms); }
function formatClockTime(date, timezone){ return formatInZone(date, timezone, { hour:'numeric', minute:'2-digit', hour12:true }); }
function formatRange(start, end, timezone){ return `${relativeDay(start, timezone)}, ${formatClockTime(start, timezone)}–${formatClockTime(end, timezone)}`; }
function formatWindowDate(date, timezone){ return `${relativeDay(date, timezone)} · ${formatInZone(date, timezone, { weekday:'short', month:'short', day:'numeric' })}`; }
function formatWindowTimeRange(start, end, timezone) {
  const now = new Date();
  const startText = start <= now && end > now ? 'Now' : formatClockTime(start, timezone);
  const sameLocalDay = isoDateInZone(start, timezone) === isoDateInZone(end, timezone);
  const endText = sameLocalDay ? formatClockTime(end, timezone) : `${formatClockTime(end, timezone)} ${relativeDay(end, timezone)}`;
  return `${startText} – ${endText}`;
}
function windowDurationHours(w){ return Math.round(((w.end - w.start) / 3600000) * 10) / 10; }

function localWindowLine(w, place) {
  if (!w) return 'No overlap found';
  return `${place.shortLabel}: ${formatWindowDate(w.start, place.timezone)}, ${formatWindowTimeRange(w.start, w.end, place.timezone)}`;
}
function nextWindowDetailHtml(w) {
  if (!w) return `<strong>No overlap found</strong><span>Try widening reasonable hours in settings.</span>`;
  return `<strong>${localWindowLine(w, CONFIG.places.us)}</strong><span>${localWindowLine(w, CONFIG.places.au)}</span>`;
}

function computeCallWindows() {
  const slotMs = 30 * 60000;
  const now = new Date();
  const start = roundDown(now, 30);
  const slots = [];
  for (let i = 0; i < 14 * 48; i++) {
    const s = new Date(start.getTime() + i * slotMs);
    const e = new Date(s.getTime() + slotMs);
    if (e <= now) continue;
    if (isGoodCallTime(s, CONFIG.places.us) && isGoodCallTime(s, CONFIG.places.au)) slots.push({ start:s, end:e });
  }
  const windows = [];
  for (const slot of slots) {
    const last = windows[windows.length - 1];
    if (last && last.end.getTime() === slot.start.getTime()) last.end = slot.end;
    else windows.push({ ...slot });
  }
  return windows.filter(w => w.end - w.start >= 60 * 60000).slice(0, 8);
}
function nextWindowText(w) {
  if (!w) return 'No good window found in the next 14 days.';
  const usText = `${formatWindowDate(w.start, CONFIG.places.us.timezone)}, ${formatWindowTimeRange(w.start, w.end, CONFIG.places.us.timezone)}`;
  const auText = `${formatWindowDate(w.start, CONFIG.places.au.timezone)}, ${formatWindowTimeRange(w.start, w.end, CONFIG.places.au.timezone)}`;
  return `${usText} in Ingleside · ${auText} in Sydney`;
}

function renderTimes() {
  const now = new Date();
  const windows = computeCallWindows();
  const nextWindow = windows[0];
  const overlapNow = Boolean(nextWindow && nextWindow.start <= now && nextWindow.end > now && isGoodCallTime(now, CONFIG.places.us) && isGoodCallTime(now, CONFIG.places.au));
  Object.values(CONFIG.places).forEach(place => {
    const quiet = isLikelyQuietHours(now, place);
    const awake = !quiet;
    const localTime = formatClockTime(now, place.timezone);
    const dayName = formatInZone(now, place.timezone, { weekday:'long' });
    const dateRest = formatInZone(now, place.timezone, { month:'long', day:'numeric', year:'numeric' });
    const card = $(`#place-${place.id}`);
    card.innerHTML = `
      <div class="place-head"><div><h3>${escapeHtml(nameFor(place.id))}</h3><p class="meta">${place.label} · ${place.country}</p></div><span class="pill ${awake ? 'awake' : 'asleep'}">${awake ? 'Reasonable time' : 'Likely quiet hours'}</span></div>
      <div class="clock-layout"><div>${analogClockSvg(now, place.timezone, nextWindow, overlapNow)}</div><div><p class="digital-time">${localTime}</p><p class="day-name">${dayName}</p><p class="date-line">${dateRest}</p></div></div>`;
  });
  const us = CONFIG.places.us, au = CONFIG.places.au;
  const diffMins = zoneOffsetMinutes(now, au.timezone) - zoneOffsetMinutes(now, us.timezone);
  const diffHours = Math.abs(diffMins / 60);
  const diffText = Number.isInteger(diffHours) ? diffHours.toFixed(0) : diffHours.toFixed(1);
  const countdownMs = !nextWindow ? NaN : overlapNow ? nextWindow.end - now : nextWindow.start - now;
  const shouldFlash = shouldFlashCallAlert(nextWindow, overlapNow);
  const statusClass = overlapNow ? `active ${shouldFlash ? 'is-urgent' : 'is-calm'}` : 'upcoming';
  const statusTitle = !nextWindow ? 'No good call window found' : overlapNow ? 'Good shared window right now' : 'Next good window starts in';
  const statusSub = !nextWindow ? 'Try widening reasonable hours in settings.' : overlapNow ? (shouldFlash ? 'You are both inside the shared call window.' : 'The shared call window is open right now.') : 'Until the next shared window begins';
  const countdownMarkup = !nextWindow
    ? '<p class="muted">No overlap found in the next 14 days.</p>'
    : overlapNow
      ? callNowBannerHtml(nextWindow, shouldFlash)
      : countdownBigHtml(countdownMs);
  $('#differenceCard').innerHTML = `<div class="countdown-card ${statusClass}">
    <div><p class="eyebrow">Call timing now</p><h3>${statusTitle}</h3><p class="muted">${statusSub}</p></div>
    ${countdownMarkup}
    <p class="muted timezone-difference">Sydney is ${diffText} hours ahead of Ingleside.</p>
  </div>`;
  renderConnectionPrompt();
}



function renderCallWindows() {
  const now = new Date();
  const windows = computeCallWindows().slice(0, 2);
  $('#callWindows').innerHTML = windows.length ? windows.map((w, i) => {
    const hours = windowDurationHours(w);
    const active = w.start <= now && w.end > now;
    const urgent = active && shouldFlashCallAlert(w, true);
    const title = i === 0 && active ? 'Current good window' : i === 0 ? 'Next good window' : `Option ${i + 1}`;
    return `<article class="call-window ${active ? `active-call-window ${urgent ? 'is-urgent' : 'is-calm'}` : ''}">
      <div class="call-window-header"><div class="call-window-title"><strong>${title}</strong><span>${active ? 'CALL EACH OTHER... NOWWW' : `${hours} hour${hours === 1 ? '' : 's'} of overlap`}</span></div><span class="badge">${active ? 'good now' : `${hours} hr overlap`}</span></div>
      <div class="call-window-times">
        <div class="time-side"><span class="place-chip">Ingleside</span><strong>${formatWindowDate(w.start, CONFIG.places.us.timezone)}</strong><span>${formatWindowTimeRange(w.start, w.end, CONFIG.places.us.timezone)}</span></div>
        <div class="time-side"><span class="place-chip">Sydney</span><strong>${formatWindowDate(w.start, CONFIG.places.au.timezone)}</strong><span>${formatWindowTimeRange(w.start, w.end, CONFIG.places.au.timezone)}</span></div>
      </div>
    </article>`;
  }).join('') : `<p class="muted">No overlapping windows found. Try expanding the reasonable-hours range in settings.</p>`;
}

async function fetchWeather(place) {
  const params = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,precipitation_probability,precipitation',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    temperature_unit: place.tempUnit,
    wind_speed_unit: place.windUnit,
    timezone: 'auto',
    forecast_days: CONFIG.forecastDays
  });
  const response = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, {}, 9000);
  if (!response.ok) throw new Error(`Weather failed for ${place.shortLabel}`);
  return response.json();
}
async function loadWeather() {
  Object.values(CONFIG.places).forEach(place => $(`#weather-${place.id}`).innerHTML = `<p class="loading">Loading ${place.shortLabel} weather…</p>`);
  await Promise.all(Object.values(CONFIG.places).map(async place => {
    try { state.weather[place.id] = await fetchWeather(place); }
    catch (err) { state.weather[place.id] = { error: err.message }; }
  }));
  renderWeather();
}
function chartRowsForDay(data, place, dayIndex = 0) {
  const hourly = data.hourly;
  if (!hourly?.time?.length) return [];
  const targetIso = data.daily?.time?.[dayIndex] || isoDateInZone(new Date(), place.timezone);
  let indexes = hourly.time.map((t, i) => t.startsWith(targetIso) ? i : -1).filter(i => i >= 0);
  if (indexes.length < 6 && dayIndex === 0) indexes = hourly.time.slice(0, 24).map((_, i) => i);
  return indexes.slice(0, 24).map(i => ({
    time: hourly.time[i],
    hour: Number(hourly.time[i].split('T')[1].slice(0, 2)),
    temp: Number(hourly.temperature_2m[i]),
    pop: Number(hourly.precipitation_probability?.[i] ?? 0),
    precip: Number(hourly.precipitation?.[i] ?? 0)
  })).filter(row => Number.isFinite(row.temp));
}
function hourLabel(hour) {
  return hour === 0 ? '12a' : hour === 12 ? '12p' : hour > 12 ? `${hour - 12}p` : `${hour}a`;
}
function weatherDayLabel(data, place, dayIndex = 0) {
  const iso = data.daily?.time?.[dayIndex];
  if (!iso) return dayIndex === 0 ? 'Today' : 'Forecast day';
  const todayIso = isoDateInZone(new Date(), place.timezone);
  if (iso === todayIso) return 'Today';
  return displayIsoDate(iso, { weekday: 'long', month: 'short', day: 'numeric', year: undefined });
}
function buildWeatherChart(data, place, enlarged = false, dayIndex = 0) {
  const rows = chartRowsForDay(data, place, dayIndex);
  if (rows.length < 2) return `<p class="muted">Hourly graph is unavailable for this day right now.</p>`;
  const unit = selectedWeatherUnit(place);
  const temps = rows.map(r => valueInUnitFromPrimary(r.temp, place, unit));
  const pops = rows.map(r => Number.isFinite(r.pop) ? r.pop : 0);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const tempRange = Math.max(1, maxTemp - minTemp);
  const width = 640, height = 232, padL = 34, padR = 28, top = 20, tempBottom = 126, rainTop = 144, rainBase = 186;
  const plotW = width - padL - padR;
  const xFor = (i) => padL + (rows.length === 1 ? 0 : i * plotW / (rows.length - 1));
  const yTemp = (t) => tempBottom - ((t - minTemp) / tempRange) * 94;
  const yRain = (pct) => rainBase - (Math.max(0, Math.min(100, pct)) / 100) * (rainBase - rainTop);
  const path = rows.map((r, i) => `${i ? 'L' : 'M'}${xFor(i).toFixed(1)},${yTemp(valueInUnitFromPrimary(r.temp, place, unit)).toFixed(1)}`).join(' ');
  const bars = rows.map((r, i) => {
    const x = xFor(i) - Math.max(4, plotW / rows.length * .35);
    const barW = Math.max(4, plotW / rows.length * .7);
    const h = rainBase - yRain(pops[i]);
    return `<rect class="rain-bar" x="${x.toFixed(1)}" y="${(rainBase - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="2" />`;
  }).join('');
  const dots = rows.filter((_, i) => i % 4 === 0 || i === rows.length - 1).map((r) => {
    const originalIndex = rows.indexOf(r);
    return `<circle class="dot" cx="${xFor(originalIndex).toFixed(1)}" cy="${yTemp(valueInUnitFromPrimary(r.temp, place, unit)).toFixed(1)}" r="3" />`;
  }).join('');
  const labels = rows.map((r, i) => ({ r, i })).filter(({ i }) => i % 6 === 0 || i === rows.length - 1).map(({ r, i }) => {
    return `<text class="axis-label" x="${xFor(i).toFixed(1)}" y="220" text-anchor="middle">${hourLabel(r.hour)}</text>`;
  }).join('');
  const chartIso = data.daily?.time?.[dayIndex];
  const todayIso = isoDateInZone(new Date(), place.timezone);
  let nowLine = '';
  if (!chartIso || chartIso === todayIso) {
    const parts = partsInZone(new Date(), place.timezone);
    const nowDecimal = parts.hour + parts.minute / 60;
    let nowX = null;
    for (let i = 0; i < rows.length - 1; i += 1) {
      const a = rows[i].hour;
      const b = rows[i + 1].hour;
      const adjustedB = b < a ? b + 24 : b;
      const adjustedNow = nowDecimal < a ? nowDecimal + 24 : nowDecimal;
      if (adjustedNow >= a && adjustedNow <= adjustedB) {
        nowX = xFor(i) + ((adjustedNow - a) / Math.max(1, adjustedB - a)) * (xFor(i + 1) - xFor(i));
        break;
      }
    }
    if (nowX === null && rows.some(r => r.hour === parts.hour)) nowX = xFor(rows.findIndex(r => r.hour === parts.hour));
    nowLine = nowX === null ? '' : `<line class="now-line" x1="${nowX.toFixed(1)}" y1="${top}" x2="${nowX.toFixed(1)}" y2="${rainBase}" /><text class="now-label" x="${nowX.toFixed(1)}" y="13" text-anchor="middle">now</text>`;
  }
  const minLabel = `${roundTemp(minTemp)}°${unit}`;
  const maxLabel = `${roundTemp(maxTemp)}°${unit}`;
  const maxPop = Math.max(...pops);
  const buttonAttrs = enlarged ? '' : `tabindex="0" role="button" data-chart-place="${place.id}" data-chart-day="${dayIndex}" aria-label="Open ${place.shortLabel} ${weatherDayLabel(data, place, dayIndex)} weather chart larger"`;
  return `<div class="weather-chart-wrap ${enlarged ? 'enlarged-chart' : 'tap-chart'}" ${buttonAttrs}><div class="chart-title"><strong>${weatherDayLabel(data, place, dayIndex)} temp + rain chance</strong><span>${minLabel} to ${maxLabel}</span></div>
    <svg class="weather-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Hourly temperature and precipitation percentage graph${dayIndex === 0 ? ' with current-time marker' : ''}">
      <line class="grid-line" x1="${padL}" y1="${top}" x2="${width - padR}" y2="${top}" />
      <line class="grid-line" x1="${padL}" y1="${tempBottom}" x2="${width - padR}" y2="${tempBottom}" />
      <line class="grid-line rain-grid" x1="${padL}" y1="${rainTop}" x2="${width - padR}" y2="${rainTop}" />
      <line class="grid-line rain-grid" x1="${padL}" y1="${(rainTop + rainBase) / 2}" x2="${width - padR}" y2="${(rainTop + rainBase) / 2}" />
      <line class="grid-line" x1="${padL}" y1="${rainBase}" x2="${width - padR}" y2="${rainBase}" />
      ${bars}
      <path class="temp-line" d="${path}" />
      ${nowLine}
      ${dots}
      ${labels}
      <text class="axis-label" x="${padL}" y="15">${roundTemp(maxTemp)}°${unit}</text>
      <text class="axis-label" x="${padL}" y="139">${roundTemp(minTemp)}°${unit}</text>
      <text class="axis-label" x="${width - padR}" y="147" text-anchor="end">100%</text>
      <text class="axis-label" x="${width - padR}" y="168" text-anchor="end">50%</text>
      <text class="axis-label" x="${width - padR}" y="188" text-anchor="end">0%</text>
      <text class="axis-label rain-title" x="${padL}" y="141">Rain chance (%)</text>
    </svg>
    <div class="legend"><span><b>Line:</b> temperature</span><span><b>Bars:</b> rain chance, peak ${Math.round(maxPop)}%</span><span class="mobile-only">Tap chart to enlarge</span></div></div>`;
}
function displayWindUnit(unit) {
  return String(unit || '').replace('km/h', 'kph');
}
function buildForecastStrip(data, place) {
  const unit = selectedWeatherUnit(place);
  const highs = data.daily.temperature_2m_max.map(v => valueInUnitFromPrimary(v, place, unit)).filter(Number.isFinite);
  const lows = data.daily.temperature_2m_min.map(v => valueInUnitFromPrimary(v, place, unit)).filter(Number.isFinite);
  const globalLow = Math.min(...lows);
  const globalHigh = Math.max(...highs);
  const range = Math.max(1, globalHigh - globalLow);
  return `<details class="forecast-disclosure disclosure-card"><summary>Next days forecast bars</summary><div class="forecast-strip graphical-forecast">${data.daily.time.map((day, i) => {
    const high = valueInUnitFromPrimary(data.daily.temperature_2m_max[i], place, unit);
    const low = valueInUnitFromPrimary(data.daily.temperature_2m_min[i], place, unit);
    const left = Math.max(0, Math.min(100, ((low - globalLow) / range) * 100));
    const right = Math.max(0, Math.min(100, 100 - ((globalHigh - high) / range) * 100));
    const width = Math.max(8, right - left);
    const dayLabel = i === 0 ? 'Today' : displayIsoDate(day, {weekday:'short', month:undefined, year:undefined});
    const pop = data.daily.precipitation_probability_max[i] ?? 0;
    return `<div class="forecast-day graphical-day tap-forecast-day" tabindex="0" role="button" data-chart-place="${place.id}" data-chart-day="${i}" aria-label="Open ${place.shortLabel} ${dayLabel} weather chart larger">
      <div class="forecast-row-top"><strong>${dayLabel}</strong><span>${WEATHER_CODE[data.daily.weather_code[i]] || 'Forecast'}</span></div>
      <div class="forecast-range-row"><span>${roundTemp(low)}°</span><div class="forecast-track"><i style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></i></div><span>${roundTemp(high)}°</span></div>
      <div class="forecast-rain"><span style="width:${Math.max(4, Math.min(100, Number(pop) || 0))}%"></span><b>${pop}% rain</b></div>
    </div>`;
  }).join('')}</div></details>`;
}
function renderWeather() {
  Object.values(CONFIG.places).forEach(place => {
    const data = state.weather[place.id];
    const card = $(`#weather-${place.id}`);
    if (!data) return;
    if (data.error) { card.innerHTML = `<h3>${place.shortLabel}</h3><p class="error">${data.error}</p>`; return; }
    const windUnit = displayWindUnit(data.current_units?.wind_speed_10m || place.windUnit);
    const c = data.current;
    const todayLow = data.daily?.temperature_2m_min?.[0];
    const todayHigh = data.daily?.temperature_2m_max?.[0];
    const unit = selectedWeatherUnit(place);
    const otherUnit = unit === 'F' ? 'C' : 'F';
    const lowHighHtml = Number.isFinite(Number(todayLow)) && Number.isFinite(Number(todayHigh))
      ? `<div class="today-low-high"><span><b>Low</b> ${tempPairForUnit(todayLow, place, unit)}</span><span><b>High</b> ${tempPairForUnit(todayHigh, place, unit)}</span></div>`
      : '';
    card.innerHTML = `<div class="weather-head"><div><h3>${place.shortLabel}</h3><p class="meta">${WEATHER_CODE[c.weather_code] || 'Current weather'}</p></div><span class="badge">Live</span></div>
      <button class="weather-temp temp-toggle" type="button" data-temp-toggle="${place.id}" aria-label="Switch ${place.shortLabel} weather between Fahrenheit and Celsius">${tempTextForUnit(c.temperature_2m, place, unit)} <small>${tempTextForUnit(c.temperature_2m, place, otherUnit)}</small></button>
      ${lowHighHtml}
      <details class="weather-details-disclosure disclosure-card">
        <summary>More weather details</summary>
        <div class="weather-current-summary">
          <span>Feels ${tempPairForUnit(c.apparent_temperature, place, unit)}</span>
          <span>Humidity ${c.relative_humidity_2m}%</span>
          <span>Wind ${Math.round(c.wind_speed_10m)} ${windUnit}</span>
        </div>
        <div class="stat-grid weather-sun-grid"><div class="stat"><strong>${formatLocalApiTime(data.daily.sunrise[0])}</strong><span>Sunrise</span></div><div class="stat"><strong>${formatLocalApiTime(data.daily.sunset[0])}</strong><span>Sunset</span></div><div class="stat"><strong>${c.precipitation ?? 0} ${data.current_units?.precipitation || 'mm'}</strong><span>Precip now</span></div></div>
      </details>
      ${buildWeatherChart(data, place)}
      ${buildForecastStrip(data, place)}`;
  });
  attachChartOpeners();
}


function includeHoliday(holiday, place) {
  if (place.id === 'us') return holiday.global === true;
  if (place.id === 'au') return holiday.global === true || (Array.isArray(holiday.counties) && holiday.counties.includes(place.holidayRegion));
  return holiday.global === true;
}
async function fetchHolidaysForYear(year, place) {
  const response = await fetchWithTimeout(`https://date.nager.at/api/v3/PublicHolidays/${year}/${place.holidayCountry}`, {}, 9000);
  if (!response.ok) throw new Error(`Holiday feed failed for ${place.shortLabel}`);
  const rows = await response.json();
  return rows.filter(h => includeHoliday(h, place)).map(h => ({ id:`${place.id}-${h.date}-${h.name}`, date:h.date, name:h.name, localName:h.localName, placeId:place.id, placeLabel:place.regionLabel, counties:h.counties || [], types:h.types || [] }));
}
async function loadHolidays() {
  const currentYear = partsInZone(new Date(), CONFIG.places.us.timezone).year;
  const years = [currentYear, currentYear + 1, currentYear + 2];
  const holidayYear = $('#holidayYear');
  if (holidayYear) {
    holidayYear.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    holidayYear.value = String(currentYear);
  }
  const all = [];
  for (const year of years) for (const place of Object.values(CONFIG.places)) {
    try { all.push(...await fetchHolidaysForYear(year, place)); }
    catch (err) { console.warn(err); }
  }
  state.holidays = all.sort((a,b) => a.date.localeCompare(b.date) || a.placeId.localeCompare(b.placeId));
  renderHolidays();
  renderTripSuggestions();
}
function addYearsToIso(iso, years) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}
function renderHolidays() {
  const currentYear = partsInZone(new Date(), CONFIG.places.us.timezone).year;
  const selection = $('#holidayYear')?.value || String(currentYear);
  const filter = $('#holidayFilter')?.value || 'all';
  const todayIso = isoDateInZone(new Date(), CONFIG.places.us.timezone);
  const rows = state.holidays.filter(h => {
    const placeOk = filter === 'all' || h.placeId === filter;
    const timeOk = h.date.startsWith(selection);
    return placeOk && timeOk;
  });
  const list = rows.filter(h => h.date >= todayIso).length ? rows.filter(h => h.date >= todayIso) : rows;
  renderHolidayCalendar(selection, filter, rows, todayIso);
  const holidayList = $('#holidayList');
  if (holidayList) {
    holidayList.innerHTML = list.length ? `<div class="holiday-compact-list">${list.map(h => {
      const place = CONFIG.places[h.placeId];
      const sameDay = rows.some(x => x.date === h.date && x.placeId !== h.placeId);
      const tone = sameDay ? 'both' : h.placeId;
      return `<div class="holiday-compact-row ${tone}"><span class="holiday-compact-date">${shortDisplayIsoDate(h.date)}</span><span class="holiday-compact-name">${escapeHtml(h.name)}</span><span class="holiday-compact-place">${place.shortLabel}${sameDay ? ' + same date' : ''}</span></div>`;
    }).join('')}</div>` : `<p class="muted">No holidays loaded for this view. Try refreshing live data.</p>`;
  }
  const meta = $('#holidayDialogMeta');
  if (meta) {
    const viewLabel = filter === 'all' ? 'both places' : CONFIG.places[filter]?.shortLabel || 'selected place';
    meta.textContent = `${selection} · ${viewLabel} · ${list.length} holiday${list.length === 1 ? '' : 's'}`;
  }
}
function renderHolidayCalendar(selection, filter, rows, todayIso) {
  const target = $('#holidayCalendar');
  if (!target) return;
  if (!rows.length) { target.innerHTML = `<p class="muted">No holidays loaded for this view. Try another year or refresh live data.</p>`; return; }
  const byDate = new Map();
  for (const h of rows) {
    if (!byDate.has(h.date)) byDate.set(h.date, []);
    byDate.get(h.date).push(h);
  }
  const year = Number(selection) || partsInZone(new Date(), CONFIG.places.us.timezone).year;
  const monthKeys = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
  const legend = `<div class="holiday-legend"><span class="legend-dot us-dot"></span> Ingleside/USA <span class="legend-dot au-dot"></span> Sydney/Australia-NSW <span class="legend-dot both-dot"></span> Both same date</div>`;
  const months = monthKeys.map(monthKey => buildHolidayMonth(monthKey, byDate, filter)).join('');
  target.innerHTML = `${legend}<div class="holiday-calendar-grid">${months}</div>`;
}
function buildHolidayMonth(monthKey, byDate, filter) {
  const [year, month] = monthKey.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const startDow = first.getUTCDay();
  const monthName = new Intl.DateTimeFormat('en-US', { timeZone:'UTC', month:'long', year:'numeric' }).format(first);
  const blanks = Array.from({ length: startDow }, () => `<div class="calendar-cell blank"></div>`).join('');
  const dayCells = Array.from({ length: daysInMonth }, (_, idx) => {
    const day = idx + 1;
    const iso = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const rows = byDate.get(iso) || [];
    const hasUs = rows.some(h => h.placeId === 'us');
    const hasAu = rows.some(h => h.placeId === 'au');
    const cls = hasUs && hasAu ? 'has-both' : hasUs ? 'has-us' : hasAu ? 'has-au' : '';
    const title = rows.map(h => `${CONFIG.places[h.placeId].shortLabel}: ${h.name}`).join(' | ');
    const markers = rows.length ? `<span class="holiday-markers">${hasUs ? '<i class="marker us-dot"></i>' : ''}${hasAu ? '<i class="marker au-dot"></i>' : ''}</span>` : '';
    return `<div class="calendar-cell ${cls}" title="${escapeHtml(title)}"><span class="day-number">${day}</span>${markers}</div>`;
  }).join('');
  const labels = ['S','M','T','W','T','F','S'].map(d => `<span>${d}</span>`).join('');
  return `<article class="holiday-month"><h3>${monthName}</h3><div class="weekday-row">${labels}</div><div class="month-grid">${blanks}${dayCells}</div></article>`;
}


function eachDate(startIso, endIso){ const out=[]; let d=new Date(`${startIso}T12:00:00Z`); const end=new Date(`${endIso}T12:00:00Z`); while(d<=end){ out.push(d.toISOString().slice(0,10)); d=new Date(d.getTime()+86400000); } return out; }
function holidayMapByDate() {
  const holidayMap = new Map();
  for (const h of state.holidays) {
    if (!holidayMap.has(h.date)) holidayMap.set(h.date, []);
    holidayMap.get(h.date).push(h);
  }
  return holidayMap;
}
function renderTripResults() {
  if (!$('#tripStart') || !$('#tripEnd') || !$('#tripResults')) return;
  const start = $('#tripStart').value, end = $('#tripEnd').value;
  if (!start || !end) { $('#tripResults').innerHTML = `<p class="muted">Choose a start and end date to check the range.</p>`; return; }
  if (end < start) { $('#tripResults').innerHTML = `<p class="error">End date must be after start date.</p>`; return; }
  const days = eachDate(start, end);
  const holidayMap = holidayMapByDate();
  const weekends = days.filter(iso => { const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); return dow === 0 || dow === 6; }).length;
  const flagged = days.filter(iso => holidayMap.has(iso));
  const summary = `<div class="row"><div><strong>${days.length} calendar days · ${Math.max(0, days.length - 1)} nights</strong><span>${weekends} weekend days and ${flagged.length} holiday date${flagged.length === 1 ? '' : 's'} in this range.</span></div><span class="badge">${start} → ${end}</span></div>`;
  const holidayRows = flagged.map(iso => `<div class="row"><div><strong>${displayIsoDate(iso)}</strong><span>${holidayMap.get(iso).map(h => `${CONFIG.places[h.placeId].shortLabel}: ${h.name}`).join(' · ')}</span></div><span class="badge">holiday</span></div>`).join('');
  const customRows = state.settings.customDates.filter(d => d.date >= start && d.date <= end).map(d => `<div class="row"><div><strong>${escapeHtml(d.label)}</strong><span>${displayIsoDate(d.date)}</span></div><span class="badge">saved date</span></div>`).join('');
  $('#tripResults').innerHTML = summary + (holidayRows || '') + (customRows || '') + (!holidayRows && !customRows ? `<p class="muted">No loaded holidays or saved personal dates fall inside this range.</p>` : '');
}
function holidayNameKey(name) {
  return String(name || '').toLowerCase().replace(/\b(substitute|observed|additional|public holiday|holiday)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function holidaysForDays(days, holidayMap, placeId) {
  return days.flatMap(iso => (holidayMap.get(iso) || []).filter(h => h.placeId === placeId));
}
function tripHolidaySummary(days, holidayMap, placeId) {
  const rows = holidaysForDays(days, holidayMap, placeId).map(h => `${shortDisplayIsoDate(h.date)}: ${h.name}`);
  return rows.length ? [...new Set(rows)].join('; ') : 'No loaded holiday';
}
function scoreTripRange(start, end, holidayMap) {
  const days = eachDate(start, end);
  const weekendDays = days.filter(iso => { const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); return dow === 0 || dow === 6; }).length;
  const usRows = holidaysForDays(days, holidayMap, 'us');
  const auRows = holidaysForDays(days, holidayMap, 'au');
  const usDates = new Set(usRows.map(h => h.date));
  const auDates = new Set(auRows.map(h => h.date));
  let sameDateBoth = 0;
  for (const iso of days) {
    const rows = holidayMap.get(iso) || [];
    if (rows.some(h => h.placeId === 'us') && rows.some(h => h.placeId === 'au')) sameDateBoth++;
  }
  const bothPlaces = usDates.size > 0 && auDates.size > 0;
  const holidayKeys = new Set([...usRows, ...auRows].map(h => `${h.placeId}:${holidayNameKey(h.name) || h.date}`));
  const holidaySignature = [...holidayKeys].sort().join('|');
  const len = days.length;
  const score = weekendDays * .7 + usDates.size * 3.3 + auDates.size * 3.3 + sameDateBoth * 2 + (bothPlaces ? 8 : 0) + (len >= 9 && len <= 12 ? 1 : 0) - Math.abs(10 - len) * .12;
  return { score, days, weekendDays, usDates, auDates, usRows, auRows, bothPlaces, sameDateBoth, holidayKeys, holidaySignature };
}
function overlapDays(a, b) {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  if (start > end) return 0;
  return eachDate(start, end).length;
}
function rangesTooSimilar(candidate, selected) {
  return selected.some(existing => overlapDays(candidate, existing) >= 5);
}
function sharesUsedHoliday(candidate, usedHolidayKeys) {
  return [...candidate.holidayKeys].some(key => usedHolidayKeys.has(key));
}
function pickDistinctTripRanges(candidates, limit = 3) {
  const picked = [];
  const usedHolidayKeys = new Set();
  const usedSignatures = new Set();
  for (const c of candidates) {
    if (!c.bothPlaces) continue;
    if (!c.usRows.length || !c.auRows.length) continue;
    if (usedSignatures.has(c.holidaySignature)) continue;
    if (rangesTooSimilar(c, picked)) continue;
    if (sharesUsedHoliday(c, usedHolidayKeys)) continue;
    picked.push(c);
    usedSignatures.add(c.holidaySignature);
    c.holidayKeys.forEach(key => usedHolidayKeys.add(key));
    if (picked.length >= limit) break;
  }
  return picked;
}
function tripRangeHolidayRows(days, holidayMap) {
  const seen = new Set();
  return days.flatMap(iso => (holidayMap.get(iso) || []).map(h => ({ ...h, date: iso })))
    .filter(h => {
      const key = `${h.placeId}:${h.date}:${h.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
function monthKeysForRange(start, end) {
  const keys = [];
  let cursor = `${start.slice(0, 7)}-01`;
  const endMonth = end.slice(0, 7);
  while (cursor.slice(0, 7) <= endMonth && keys.length < 3) {
    keys.push(cursor.slice(0, 7));
    const [y, m] = cursor.split('-').map(Number);
    const next = new Date(Date.UTC(y, m, 1, 12));
    cursor = next.toISOString().slice(0, 10);
  }
  return keys;
}
function buildTripMiniMonth(monthKey, range, holidayMap) {
  const [year, month] = monthKey.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const startDow = first.getUTCDay();
  const monthName = new Intl.DateTimeFormat('en-US', { timeZone:'UTC', month:'short', year:'numeric' }).format(first);
  const blanks = Array.from({ length: startDow }, () => `<div class="trip-day blank"></div>`).join('');
  const dayCells = Array.from({ length: daysInMonth }, (_, idx) => {
    const day = idx + 1;
    const iso = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const inRange = iso >= range.start && iso <= range.end;
    const rows = inRange ? (holidayMap.get(iso) || []) : [];
    const hasUs = rows.some(h => h.placeId === 'us');
    const hasAu = rows.some(h => h.placeId === 'au');
    const cls = [inRange ? 'in-trip' : '', hasUs && hasAu ? 'has-both' : hasUs ? 'has-us' : hasAu ? 'has-au' : '', iso === range.start ? 'trip-start' : '', iso === range.end ? 'trip-end' : ''].filter(Boolean).join(' ');
    const title = rows.map(h => `${CONFIG.places[h.placeId].shortLabel}: ${h.name}`).join(' | ');
    return `<div class="trip-day ${cls}" title="${escapeHtml(title)}"><span>${day}</span></div>`;
  }).join('');
  const labels = ['S','M','T','W','T','F','S'].map(d => `<span>${d}</span>`).join('');
  return `<div class="trip-mini-month"><h4>${monthName}</h4><div class="trip-weekdays">${labels}</div><div class="trip-month-grid">${blanks}${dayCells}</div></div>`;
}
function buildTripSuggestionCard(r, index, holidayMap) {
  const daysText = `${r.days.length} days · ${Math.max(0, r.days.length - 1)} nights`;
  const monthKeys = monthKeysForRange(r.start, r.end);
  const holidayRows = tripRangeHolidayRows(r.days, holidayMap);
  const holidayChips = holidayRows.map(h => `<span class="trip-holiday-chip ${h.placeId}">${CONFIG.places[h.placeId].shortLabel}: ${shortDisplayIsoDate(h.date)} · ${escapeHtml(h.name)}</span>`).join('');
  return `<details class="trip-card trip-disclosure disclosure-card">
    <summary class="trip-card-head"><div><strong>${index + 1}. ${shortDisplayIsoDate(r.start)} → ${shortDisplayIsoDate(r.end)}</strong><span>${daysText} · ${r.weekendDays} weekend days</span></div><span class="badge">Tap to view calendar</span></summary>
    <div class="trip-calendars">${monthKeys.map(key => buildTripMiniMonth(key, r, holidayMap)).join('')}</div>
    <div class="trip-legend"><span><i class="range-dot"></i>Trip days</span><span><i class="legend-dot us-dot"></i>USA holiday</span><span><i class="legend-dot au-dot"></i>AUS/NSW holiday</span><span><i class="legend-dot both-dot"></i>Both</span></div>
    <div class="trip-holiday-chips">${holidayChips}</div>
  </details>`;
}
function renderTripSuggestions() {
  const target = $('#tripSuggestions');
  if (!target) return;
  if (!state.holidays.length) { target.innerHTML = `<p class="muted">Loading holiday-based trip ideas…</p>`; return; }
  const today = isoDateInZone(new Date(), CONFIG.places.us.timezone);
  const holidayMap = holidayMapByDate();
  const candidates = new Map();
  const futureHolidays = state.holidays.filter(h => h.date >= today);
  for (const h of futureHolidays) {
    for (let len = 7; len <= 14; len++) {
      for (let offset = 0; offset < len; offset++) {
        const start = dateAddIso(h.date, -offset);
        const end = dateAddIso(start, len - 1);
        if (start < today) continue;
        const key = `${start}/${end}`;
        if (candidates.has(key)) continue;
        const scored = scoreTripRange(start, end, holidayMap);
        if (!scored.bothPlaces) continue;
        candidates.set(key, { start, end, ...scored });
      }
    }
  }
  const sortedBoth = [...candidates.values()].sort((a,b) => b.score - a.score || a.start.localeCompare(b.start));
  const rows = pickDistinctTripRanges(sortedBoth, 4);
  target.innerHTML = rows.length ? `<div class="trip-ideas-grid">${rows.map((r, i) => buildTripSuggestionCard(r, i, holidayMap)).join('')}</div>` : `<p class="muted">No distinct 1–2 week ranges were found where both sides have holidays. Try checking the next year after more holidays load.</p>`;
}




async function loadFx() {
  const cached = (() => {
    try { return JSON.parse(localStorage.getItem('across.fxRate')); } catch { return null; }
  })();
  const sources = [
    {
      name: 'Frankfurter',
      url: 'https://api.frankfurter.app/latest?from=USD&to=AUD',
      parse: data => ({ rate: Number(data?.rates?.AUD), date: data?.date })
    },
    {
      name: 'Open ER API',
      url: 'https://open.er-api.com/v6/latest/USD',
      parse: data => ({ rate: Number(data?.rates?.AUD), date: data?.time_last_update_utc?.slice(0, 16) || data?.time_last_update_unix })
    },
    {
      name: 'ExchangeRate API',
      url: 'https://api.exchangerate-api.com/v4/latest/USD',
      parse: data => ({ rate: Number(data?.rates?.AUD), date: data?.date })
    }
  ];
  state.fxError = null;
  for (const source of sources) {
    try {
      const response = await fetchWithTimeout(source.url, { cache: 'no-store' }, 7000);
      if (!response.ok) throw new Error(`${source.name} failed`);
      const parsed = source.parse(await response.json());
      if (!Number.isFinite(parsed.rate) || parsed.rate <= 0) throw new Error(`${source.name} returned no AUD rate`);
      state.fxRate = parsed.rate;
      state.fxDate = parsed.date || 'today';
      state.fxSource = source.name;
      localStorage.setItem('across.fxRate', JSON.stringify({ rate: state.fxRate, date: state.fxDate, source: state.fxSource, savedAt: new Date().toISOString() }));
      if ($('#fxStatus')) $('#fxStatus').textContent = `Latest loaded rate: 1 USD = ${state.fxRate.toFixed(4)} AUD · 1 AUD = ${(1 / state.fxRate).toFixed(4)} USD (${state.fxDate}, ${state.fxSource}).`;
      convertFromUsd();
      renderFxNote();
      return;
    } catch (err) { console.warn(err); }
  }
  if (cached?.rate) {
    state.fxRate = Number(cached.rate);
    state.fxDate = cached.date || 'cached';
    state.fxSource = cached.source || 'cached rate';
    state.fxError = 'Using cached exchange rate';
    if ($('#fxStatus')) $('#fxStatus').textContent = `Using cached rate: 1 USD = ${state.fxRate.toFixed(4)} AUD · 1 AUD = ${(1 / state.fxRate).toFixed(4)} USD (${state.fxDate}).`;
    convertFromUsd();
    renderFxNote();
    return;
  }
  state.fxError = 'Exchange rate could not be loaded';
  if ($('#fxStatus')) $('#fxStatus').textContent = 'Exchange rate could not be loaded. Try Refresh live data later.';
  renderFxNote();
}

function convertFromUsd(){ if (!state.fxRate || !$('#audInput') || !$('#usdInput')) return; $('#audInput').value = (Number($('#usdInput').value || 0) * state.fxRate).toFixed(2); }
function convertFromAud(){ if (!state.fxRate || !$('#audInput') || !$('#usdInput')) return; $('#usdInput').value = (Number($('#audInput').value || 0) / state.fxRate).toFixed(2); }
function convertFromF(){ const f = Number($('#tempFInput').value || 0); $('#tempCInput').value = fToC(f).toFixed(1); }
function convertFromC(){ const c = Number($('#tempCInput').value || 0); $('#tempFInput').value = cToF(c).toFixed(1); }


function renderConnectionPrompt() {
  const prompts = [
    `Ask for one picture from ${CONFIG.places.au.shortLabel} today and send one from ${CONFIG.places.us.shortLabel}.`,
    `Plan the next call using the first good window above, then keep it low-pressure.`,
    `Trade a small local detail: coffee order, weather complaint, commute, sunset, or dinner.`,
    `Pick one shared watch/listen item and agree on a day to react to it.`
  ];
  const index = new Date().getDate() % prompts.length;
  $('#connectionPrompt').innerHTML = `<h3>Daily connection cue</h3><p>${prompts[index]}</p>`;
}

function openChartDialog(placeId, dayIndex = 0) {
  const place = CONFIG.places[placeId];
  const data = state.weather[placeId];
  if (!place || !data || data.error) return;
  const safeDayIndex = Math.max(0, Math.min(Number(dayIndex) || 0, (data.daily?.time?.length || 1) - 1));
  $('#chartDialogContent').innerHTML = `<h2>${place.shortLabel} · ${weatherDayLabel(data, place, safeDayIndex)}</h2>${buildWeatherChart(data, place, true, safeDayIndex)}`;
  $('#chartDialog').showModal();
}
function attachChartOpeners() {
  document.querySelectorAll('[data-chart-place]').forEach(el => {
    if (el.dataset.chartListenerAttached === 'true') return;
    el.dataset.chartListenerAttached = 'true';
    const open = () => openChartDialog(el.dataset.chartPlace, el.dataset.chartDay || 0);
    el.addEventListener('click', open);
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
  });
}

function renderSettings() {
  $('#nameUs').value = state.settings.names.us;
  $('#nameAu').value = state.settings.names.au;
  $('#awakeStart').value = state.settings.awakeStart;
  $('#awakeEnd').value = state.settings.awakeEnd;
  renderCustomDates();
}
function renderCustomDates() {
  const dates = state.settings.customDates.slice().sort((a,b) => a.date.localeCompare(b.date));
  $('#customDates').innerHTML = dates.length ? dates.map((d, i) => `<div class="row"><div><strong>${escapeHtml(d.label)}</strong><span>${displayIsoDate(d.date)}</span></div><button type="button" class="secondary" data-delete-date="${i}">Remove</button></div>`).join('') : `<p class="muted">No saved dates yet.</p>`;
  document.querySelectorAll('[data-delete-date]').forEach(btn => btn.addEventListener('click', () => { const sorted = state.settings.customDates.slice().sort((a,b) => a.date.localeCompare(b.date)); const item = sorted[Number(btn.dataset.deleteDate)]; state.settings.customDates = state.settings.customDates.filter(d => !(d.label === item.label && d.date === item.date)); saveSettingsToStorage(); renderCustomDates(); renderTripResults(); renderTripSuggestions(); }));
}
function saveSettingsFromForm() {
  state.settings.names.us = $('#nameUs').value.trim() || CONFIG.places.us.defaultName;
  state.settings.names.au = $('#nameAu').value.trim() || CONFIG.places.au.defaultName;
  state.settings.awakeStart = Math.max(0, Math.min(23, Number($('#awakeStart').value || CONFIG.awakeStart)));
  state.settings.awakeEnd = Math.max(1, Math.min(24, Number($('#awakeEnd').value || CONFIG.awakeEnd)));
  saveSettingsToStorage();
  renderAllStatic();
}
function addCustomDate() {
  const label = $('#customDateLabel').value.trim();
  const date = $('#customDateValue').value;
  if (!label || !date) return;
  state.settings.customDates.push({ label, date });
  $('#customDateLabel').value = ''; $('#customDateValue').value = '';
  saveSettingsToStorage(); renderCustomDates(); renderTripResults(); renderTripSuggestions();
}
function resetSettings() {
  localStorage.removeItem('across.settings');
  state.settings = loadSettings();
  renderSettings(); renderAllStatic();
}

function setDefaultTripDates() {
  if (!$('#tripStart') || !$('#tripEnd')) return;
  const today = isoDateInZone(new Date(), CONFIG.places.us.timezone);
  const nextWeek = new Date(`${today}T12:00:00Z`);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const tenDays = new Date(nextWeek.getTime()); tenDays.setUTCDate(tenDays.getUTCDate() + 9);
  $('#tripStart').value = nextWeek.toISOString().slice(0,10);
  $('#tripEnd').value = tenDays.toISOString().slice(0,10);
}
function renderAllStatic(){ renderTimes(); renderCallWindows(); renderHolidays(); renderConnectionPrompt(); renderTripSuggestions(); }
async function refreshAll() {
  $('#refreshAll').disabled = true;
  $('#refreshAll').textContent = 'Refreshing…';
  await Promise.all([loadWeather(), loadHolidays(), loadFx()]);
  renderAllStatic(); renderTripResults();
  $('#refreshAll').disabled = false;
  $('#refreshAll').textContent = 'Refresh live data';
}


let sideNavClickLockUntil = 0;
let sideNavMoveTimer = null;

function getSideNavElements() {
  const nav = document.querySelector('.side-nav nav');
  const shell = document.querySelector('.side-nav');
  const links = Array.from(document.querySelectorAll('[data-section-link]'));
  return { nav, shell, links };
}

function ensureMagnetDot() {
  const { nav } = getSideNavElements();
  if (!nav) return null;
  let dot = nav.querySelector('.nav-magnet-dot');
  if (!dot) {
    dot = document.createElement('span');
    dot.className = 'nav-magnet-dot';
    dot.setAttribute('aria-hidden', 'true');
    nav.prepend(dot);
  }
  return dot;
}

function moveMagnetDotTo(link, instant = false) {
  const { nav, shell } = getSideNavElements();
  const dot = ensureMagnetDot();
  if (!nav || !dot || !link || window.matchMedia('(max-width: 1119px)').matches) return;

  const navRect = nav.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const dotSize = dot.getBoundingClientRect().width || rem * 0.64;
  const anchorX = linkRect.left - navRect.left + rem * 0.7 + rem * 0.24;
  const anchorY = linkRect.top - navRect.top + linkRect.height / 2;
  dot.style.setProperty('--dot-x', `${(anchorX - dotSize / 2).toFixed(1)}px`);
  dot.style.setProperty('--dot-y', `${(anchorY - dotSize / 2).toFixed(1)}px`);

  if (instant) {
    dot.style.transition = 'none';
    requestAnimationFrame(() => { dot.style.transition = ''; });
  }

  shell?.classList.add('nav-moving');
  clearTimeout(sideNavMoveTimer);
  sideNavMoveTimer = setTimeout(() => shell?.classList.remove('nav-moving'), instant ? 80 : 650);
}

function setActiveSection(sectionId, options = {}) {
  const { links } = getSideNavElements();
  let activeLink = null;
  links.forEach(link => {
    const active = link.dataset.sectionLink === sectionId;
    link.classList.toggle('active', active);
    if (active) activeLink = link;
  });
  if (!activeLink) return;
  moveMagnetDotTo(activeLink, options.instant);
  if (window.matchMedia('(max-width: 1119px)').matches) {
    activeLink.scrollIntoView({ inline: 'center', block: 'nearest', behavior: options.instant ? 'auto' : 'smooth' });
  }
}

function setMobileNavOpen(open) {
  document.body.classList.toggle('nav-open', Boolean(open));
  const button = $('#mobileMenuToggle');
  const backdrop = $('#navBackdrop');
  if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (backdrop) backdrop.hidden = !open;
}

function initSideNav() {
  const { nav, links } = getSideNavElements();
  const menuButton = $('#mobileMenuToggle');
  const backdrop = $('#navBackdrop');
  menuButton?.addEventListener('click', () => setMobileNavOpen(!document.body.classList.contains('nav-open')));
  backdrop?.addEventListener('click', () => setMobileNavOpen(false));
  window.addEventListener('keydown', event => { if (event.key === 'Escape') setMobileNavOpen(false); });
  const sections = links.map(link => document.getElementById(link.dataset.sectionLink)).filter(Boolean);
  if (!links.length || !sections.length || !nav) return;
  ensureMagnetDot();
  setActiveSection(sections[0].id, { instant: true });
  requestAnimationFrame(() => setActiveSection(getCurrentSectionId(sections) || sections[0].id, { instant: true }));

  links.forEach(link => link.addEventListener('click', (event) => {
    const section = document.getElementById(link.dataset.sectionLink);
    if (!section) return;
    event.preventDefault();
    sideNavClickLockUntil = Date.now() + 950;
    setActiveSection(link.dataset.sectionLink);
    history.pushState(null, '', `#${link.dataset.sectionLink}`);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.matchMedia('(max-width: 1119px)').matches) setMobileNavOpen(false);
    window.setTimeout(() => { sideNavClickLockUntil = 0; setActiveSection(link.dataset.sectionLink); }, 1050);
  }));

  window.addEventListener('resize', () => setActiveSection(getCurrentSectionId(sections) || sections[0].id, { instant: true }));

  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    if (Date.now() < sideNavClickLockUntil) return;
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => {
        const aTop = Math.abs(a.boundingClientRect.top);
        const bTop = Math.abs(b.boundingClientRect.top);
        return (b.intersectionRatio - a.intersectionRatio) || (aTop - bTop);
      })[0];
    if (visible?.target?.id) setActiveSection(visible.target.id);
  }, { root: null, rootMargin: '-22% 0px -56% 0px', threshold: [0.08, 0.18, 0.35, 0.6] });
  sections.forEach(section => observer.observe(section));
}

function getCurrentSectionId(sections) {
  const viewportLine = window.innerHeight * 0.28;
  let current = sections[0];
  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    if (rect.top <= viewportLine) current = section;
  }
  return current?.id;
}

function setActiveAppTab(tab, options = {}) {
  const tabs = Array.from(document.querySelectorAll('[data-app-tab]'));
  const panels = Array.from(document.querySelectorAll('[data-tab-panel]'));
  const validTabs = new Set(tabs.map(button => button.dataset.appTab));
  const nextTab = validTabs.has(tab) ? tab : 'time';
  tabs.forEach(button => {
    const active = button.dataset.appTab === nextTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
    if (active && !options.instant) {
      button.classList.remove('tab-just-activated');
      void button.offsetWidth;
      button.classList.add('tab-just-activated');
      window.setTimeout(() => button.classList.remove('tab-just-activated'), 520);
    }
  });
  panels.forEach(panel => {
    const active = panel.dataset.tabPanel === nextTab;
    panel.hidden = !active;
    panel.classList.remove('tab-panel-entering');
    if (active && !options.instant) {
      void panel.offsetWidth;
      panel.classList.add('tab-panel-entering');
      window.setTimeout(() => panel.classList.remove('tab-panel-entering'), 520);
    }
  });
  document.body.dataset.activeTab = nextTab;
  try { localStorage.setItem('across.activeTab', nextTab); } catch (_) {}
  if (options.scroll) {
    const firstPanel = panels.find(panel => panel.dataset.tabPanel === nextTab);
    const target = firstPanel || document.querySelector('.hero');
    const top = Math.max(0, (target?.getBoundingClientRect().top || 0) + window.scrollY - 12);
    window.scrollTo({ top, behavior: options.instant ? 'auto' : 'smooth' });
  }
}

function tabFromPointerEvent(event, tabs) {
  let closest = null;
  let closestDistance = Infinity;
  tabs.forEach(button => {
    const rect = button.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const distance = Math.hypot(event.clientX - cx, event.clientY - cy);
    if (distance < closestDistance) {
      closest = button;
      closestDistance = distance;
    }
  });
  return closest;
}

function updateTabIndicator(tabbar, activeButton, options = {}) {
  if (!tabbar || !activeButton) return;
  const barRect = tabbar.getBoundingClientRect();
  const tabRect = activeButton.getBoundingClientRect();
  const x = tabRect.left - barRect.left;
  tabbar.style.setProperty('--tab-indicator-x', `${x}px`);
  tabbar.style.setProperty('--tab-indicator-w', `${tabRect.width}px`);
  tabbar.classList.toggle('is-dragging', Boolean(options.dragging));
}

function getCurrentTabOrder() {
  const fallback = ['time', 'weather', 'poster', 'vacation', 'extras'];
  try {
    const stored = JSON.parse(localStorage.getItem('across.tabOrder'));
    if (Array.isArray(stored) && fallback.every(tab => stored.includes(tab))) return stored.filter(tab => fallback.includes(tab));
  } catch (_) {}
  return fallback;
}
function saveCurrentTabOrder() {
  const order = Array.from(document.querySelectorAll('[data-app-tab]')).map(button => button.dataset.appTab);
  localStorage.setItem('across.tabOrder', JSON.stringify(order));
}
function applySavedTabOrder() {
  const tabbar = $('#bottomTabbar');
  if (!tabbar) return;
  const buttons = new Map(Array.from(tabbar.querySelectorAll('[data-app-tab]')).map(button => [button.dataset.appTab, button]));
  getCurrentTabOrder().forEach(tab => {
    const button = buttons.get(tab);
    if (button) tabbar.appendChild(button);
  });
}
function getOrderedTabs() {
  return Array.from(document.querySelectorAll('[data-app-tab]'));
}
// Swipe-left/right page switching intentionally removed. Use bottom tabs: tap or drag-across.

function markStandaloneDisplayMode() {
  const standalone = Boolean(window.navigator?.standalone) || window.matchMedia?.('(display-mode: standalone)')?.matches || window.matchMedia?.('(display-mode: fullscreen)')?.matches;
  document.body.classList.toggle('is-standalone-app', standalone);
}

function initBottomTabs() {
  const tabbar = $('#bottomTabbar');
  if (!tabbar) return;
  try { localStorage.removeItem('across.tabOrder'); } catch (_) {}
  let tabs = getOrderedTabs();
  if (!tabs.length) return;
  const hashTab = location.hash ? location.hash.replace('#', '') : '';
  const hashMap = { times: 'time', calls: 'time', extras: 'extras', differences: 'extras', weather: 'weather', poster: 'poster', holidays: 'vacation', planner: 'vacation' };

  const activateButton = (button, options = {}) => {
    if (!button) return;
    setActiveAppTab(button.dataset.appTab, { scroll: options.scroll !== false, instant: Boolean(options.instant) });
    updateTabIndicator(tabbar, button, { dragging: Boolean(options.dragging) });
  };

  setActiveAppTab(hashMap[hashTab] || 'time', { instant: true, scroll: false });
  updateTabIndicator(tabbar, document.querySelector('.tab-slab.active'), { dragging: false });

  let dragPointerId = null;
  let startX = 0;
  let startY = 0;
  let dragSelecting = false;
  let suppressNextClick = false;

  const resetDragState = () => {
    dragPointerId = null;
    startX = 0;
    startY = 0;
    dragSelecting = false;
    tabbar.classList.remove('is-dragging');
    updateTabIndicator(tabbar, document.querySelector('.tab-slab.active'), { dragging: false });
  };

  const activateFromPoint = (clientX, clientY, options = {}) => {
    tabs = getOrderedTabs();
    const nextButton = tabFromPointerEvent({ clientX, clientY }, tabs);
    if (!nextButton) return;
    const current = document.querySelector('.tab-slab.active');
    if (nextButton !== current) activateButton(nextButton, { scroll: true, dragging: Boolean(options.dragging) });
    else updateTabIndicator(tabbar, nextButton, { dragging: Boolean(options.dragging) });
  };

  // Capture-phase delegation keeps desktop/laptop clicking reliable even if
  // another pointer/touch listener runs later in the event chain.
  tabbar.addEventListener('click', event => {
    const button = event.target.closest('[data-app-tab]');
    if (!button) return;
    if (suppressNextClick) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    activateButton(button, { scroll: true, dragging: false });
  }, true);

  tabs.forEach(button => {
    button.addEventListener('click', event => {
      if (suppressNextClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      activateButton(button, { scroll: true, dragging: false });
    });
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateButton(button, { scroll: true, dragging: false });
      }
    });
  });

  tabbar.addEventListener('contextmenu', event => {
    if (event.target.closest('[data-app-tab]')) event.preventDefault();
  });

  if (window.PointerEvent) {
    tabbar.addEventListener('pointerdown', event => {
      const pressedButton = event.target.closest('[data-app-tab]');
      if (!pressedButton) return;
      // Desktop/laptop should be simple click-only. Pointer capture on mouse can
      // swallow clicks in some desktop browsers, so only use drag-to-switch for touch/pen.
      if (event.pointerType === 'mouse') return;
      if (event.button !== undefined && event.button !== 0) return;
      dragPointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      dragSelecting = false;
      try { tabbar.setPointerCapture?.(event.pointerId); } catch (_) {}
    });

    tabbar.addEventListener('pointermove', event => {
      if (dragPointerId === null || event.pointerId !== dragPointerId) return;
      const movedX = Math.abs(event.clientX - startX);
      const movedY = Math.abs(event.clientY - startY);
      if (!dragSelecting && Math.max(movedX, movedY) > 9) {
        dragSelecting = true;
        tabbar.classList.add('is-dragging');
      }
      if (!dragSelecting) return;
      if (event.cancelable) event.preventDefault();
      activateFromPoint(event.clientX, event.clientY, { dragging: true });
    });

    const finishDrag = event => {
      if (dragPointerId !== null && event?.pointerId !== undefined && event.pointerId !== dragPointerId) return;
      const didDrag = dragSelecting;
      resetDragState();
      if (didDrag) {
        suppressNextClick = true;
        window.setTimeout(() => { suppressNextClick = false; }, 240);
      }
    };

    tabbar.addEventListener('pointerup', finishDrag);
    tabbar.addEventListener('pointercancel', finishDrag);
    tabbar.addEventListener('lostpointercapture', finishDrag);
  }

  // Fallback for older iOS webviews that do not send PointerEvents reliably.
  tabbar.addEventListener('touchstart', event => {
    if (window.PointerEvent || event.touches.length !== 1) return;
    const pressedButton = event.target.closest('[data-app-tab]');
    if (!pressedButton) return;
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    dragSelecting = false;
  }, { passive: true });

  tabbar.addEventListener('touchmove', event => {
    if (window.PointerEvent || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const movedX = Math.abs(touch.clientX - startX);
    const movedY = Math.abs(touch.clientY - startY);
    if (!dragSelecting && Math.max(movedX, movedY) > 9) {
      dragSelecting = true;
      tabbar.classList.add('is-dragging');
    }
    if (!dragSelecting) return;
    event.preventDefault();
    activateFromPoint(touch.clientX, touch.clientY, { dragging: true });
  }, { passive: false });

  tabbar.addEventListener('touchend', () => {
    if (window.PointerEvent) return;
    const didDrag = dragSelecting;
    resetDragState();
    if (didDrag) {
      suppressNextClick = true;
      window.setTimeout(() => { suppressNextClick = false; }, 240);
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    markStandaloneDisplayMode();
    updateTabIndicator(tabbar, document.querySelector('.tab-slab.active'), { dragging: false });
  });
}


const POSTER_BUCKET = 'poster-media';
let posterClient = null;
let posterChannel = null;
let posterSeenIds = new Set();
let drawingContext = null;
let drawingHasInk = false;
let drawingPointerId = null;

function posterConfig() {
  return window.ACROSS_SUPABASE_CONFIG || {};
}
function hasPosterConfig() {
  const cfg = posterConfig();
  return Boolean(cfg.url && cfg.anonKey && !String(cfg.url).includes('YOUR_') && !String(cfg.anonKey).includes('YOUR_'));
}
function getPosterClient() {
  if (!hasPosterConfig() || !window.supabase?.createClient) return null;
  if (!posterClient) {
    const cfg = posterConfig();
    posterClient = window.supabase.createClient(cfg.url, cfg.anonKey);
  }
  return posterClient;
}
function setPosterStatus(message, isError = false) {
  const el = $('#posterStatus');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('error', Boolean(isError));
}
function showPosterSetupNotice() {
  const notice = $('#posterSetupNotice');
  const feed = $('#posterFeed');
  if (!notice) return;
  if (hasPosterConfig() && window.supabase?.createClient) {
    notice.hidden = true;
    if (feed && !feed.innerHTML.trim()) feed.innerHTML = '<p class="muted">Loading poster board…</p>';
    return;
  }
  notice.hidden = false;
  notice.innerHTML = `<strong>Finish Supabase setup first.</strong><span>Run <code>supabase-setup.sql</code> in Supabase, then paste your Project URL and anon public key into <code>supabase-config.js</code>.</span>`;
  if (feed) feed.innerHTML = '<article class="poster-empty card"><strong>Poster Board is ready in the website.</strong><p>It will go live after Supabase is configured.</p></article>';
}
function posterImageUrl(path) {
  const client = getPosterClient();
  if (!client || !path) return '';
  const { data } = client.storage.from(POSTER_BUCKET).getPublicUrl(path);
  return data?.publicUrl || '';
}
function posterPostHtml(post) {
  const safeAuthor = escapeHtml(post.author || 'Someone');
  const date = post.created_at ? new Date(post.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const meta = `<div class="poster-post-meta"><strong>${safeAuthor}</strong><span>${escapeHtml(date)}</span></div>`;
  if (post.kind === 'message') {
    return `<article class="poster-post card message-post">${meta}<p>${escapeHtml(post.body || '')}</p></article>`;
  }
  const url = posterImageUrl(post.image_path);
  return `<article class="poster-post card media-post">${meta}<img src="${escapeHtml(url)}" alt="${escapeHtml(post.kind)} from ${safeAuthor}" loading="lazy" /></article>`;
}
function renderPosterFeed(posts = []) {
  const feed = $('#posterFeed');
  if (!feed) return;
  posterSeenIds = new Set(posts.map(post => post.id).filter(Boolean));
  feed.innerHTML = posts.length ? posts.map(posterPostHtml).join('') : '<article class="poster-empty card"><strong>No posts yet.</strong><p>Be the first to post a message, photo, or drawing.</p></article>';
}
function addPosterPostToTop(post) {
  const feed = $('#posterFeed');
  if (!feed || !post?.id || posterSeenIds.has(post.id)) return;
  posterSeenIds.add(post.id);
  const empty = feed.querySelector('.poster-empty');
  if (empty) empty.remove();
  feed.insertAdjacentHTML('afterbegin', posterPostHtml(post));
}
async function loadPosterPosts() {
  showPosterSetupNotice();
  const client = getPosterClient();
  if (!client) return;
  setPosterStatus('Loading poster board…');
  const { data, error } = await client
    .from('poster_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) {
    setPosterStatus(`Poster Board error: ${error.message}`, true);
    return;
  }
  renderPosterFeed(data || []);
  setPosterStatus('');
}
function subscribePosterRealtime() {
  const client = getPosterClient();
  if (!client || posterChannel) return;
  posterChannel = client
    .channel('poster-board')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'poster_posts' }, payload => addPosterPostToTop(payload.new))
    .subscribe();
}
function posterAuthor() {
  return $('#posterAuthor')?.value || 'Taylor';
}
function cleanFileName(name = 'upload') {
  return String(name).replace(/[^a-z0-9._-]+/gi, '-').slice(-90);
}
async function uploadPosterBlob(blob, kind, originalName = 'upload.png') {
  const client = getPosterClient();
  if (!client) {
    showPosterSetupNotice();
    return null;
  }
  const ext = kind === 'drawing' ? 'png' : (cleanFileName(originalName).split('.').pop() || 'jpg');
  const filePath = `${kind}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await client.storage.from(POSTER_BUCKET).upload(filePath, blob, {
    contentType: blob.type || (kind === 'drawing' ? 'image/png' : 'image/jpeg'),
    upsert: false
  });
  if (error) throw error;
  return filePath;
}
async function createPosterPost(post) {
  const client = getPosterClient();
  if (!client) {
    showPosterSetupNotice();
    return;
  }
  const { error } = await client.from('poster_posts').insert(post);
  if (error) throw error;
}
async function postPosterMessage() {
  const input = $('#posterMessage');
  const body = input?.value.trim();
  if (!body) {
    setPosterStatus('Write a message first.', true);
    return;
  }
  try {
    setPosterStatus('Posting message…');
    await createPosterPost({ author: posterAuthor(), kind: 'message', body });
    input.value = '';
    setPosterStatus('Posted!');
    await loadPosterPosts();
  } catch (error) {
    setPosterStatus(error.message, true);
  }
}
async function resizeImageFile(file, maxSide = 1600) {
  if (!file.type.startsWith('image/')) return file;
  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(url);
  return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
}
async function postPosterPhoto() {
  const input = $('#posterPhotoInput');
  const file = input?.files?.[0];
  if (!file) {
    setPosterStatus('Choose a photo first.', true);
    return;
  }
  try {
    setPosterStatus('Uploading photo…');
    const blob = await resizeImageFile(file);
    const image_path = await uploadPosterBlob(blob, 'photo', file.name);
    await createPosterPost({ author: posterAuthor(), kind: 'photo', image_path });
    input.value = '';
    setPosterStatus('Photo posted!');
    await loadPosterPosts();
  } catch (error) {
    setPosterStatus(error.message, true);
  }
}
function setupDrawingCanvas() {
  const canvas = $('#drawingCanvas');
  if (!canvas) return;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, Math.round(rect.width || 600));
    const height = Math.max(240, Math.round(rect.height || 320));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    drawingContext = canvas.getContext('2d');
    drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawingContext.fillStyle = '#fffafc';
    drawingContext.fillRect(0, 0, width, height);
    drawingContext.lineCap = 'round';
    drawingContext.lineJoin = 'round';
    drawingContext.lineWidth = 7;
    drawingContext.strokeStyle = '#ec4899';
    drawingHasInk = false;
  };
  resize();
  const point = event => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  canvas.addEventListener('pointerdown', event => {
    event.preventDefault();
    drawingPointerId = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    const p = point(event);
    drawingContext.beginPath();
    drawingContext.moveTo(p.x, p.y);
  });
  canvas.addEventListener('pointermove', event => {
    if (drawingPointerId !== event.pointerId) return;
    event.preventDefault();
    const p = point(event);
    drawingContext.lineTo(p.x, p.y);
    drawingContext.stroke();
    drawingHasInk = true;
  });
  const stop = event => {
    if (drawingPointerId !== null && event?.pointerId !== undefined && drawingPointerId !== event.pointerId) return;
    drawingPointerId = null;
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  $('#clearDrawingBtn')?.addEventListener('click', resize);
}
async function postPosterDrawing() {
  const canvas = $('#drawingCanvas');
  if (!canvas || !drawingHasInk) {
    setPosterStatus('Draw something first.', true);
    return;
  }
  try {
    setPosterStatus('Uploading drawing…');
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const image_path = await uploadPosterBlob(blob, 'drawing', 'drawing.png');
    await createPosterPost({ author: posterAuthor(), kind: 'drawing', image_path });
    $('#clearDrawingBtn')?.click();
    setPosterStatus('Drawing posted!');
    await loadPosterPosts();
  } catch (error) {
    setPosterStatus(error.message, true);
  }
}
function initPosterBoard() {
  setupDrawingCanvas();
  showPosterSetupNotice();
  if (hasPosterConfig()) {
    loadPosterPosts();
    subscribePosterRealtime();
  }
}

function closeDialogOnBackdropClick(dialog) {
  if (!dialog) return;
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}

function initDialogBackdropClose() {
  document.querySelectorAll('dialog').forEach(closeDialogOnBackdropClick);
}

function onIf(selector, event, handler) {
  const el = $(selector);
  if (el) el.addEventListener(event, handler);
}
function attachEvents() {
  onIf('#refreshAll', 'click', refreshAll);
  onIf('#openSettings', 'click', () => { renderSettings(); $('#settingsDialog').showModal(); });
  onIf('#saveSettings', 'click', saveSettingsFromForm);
  onIf('#addCustomDate', 'click', addCustomDate);
  onIf('#resetSettings', 'click', resetSettings);
  onIf('#holidayYear', 'change', renderHolidays);
  onIf('#holidayFilter', 'change', renderHolidays);
  onIf('#usdInput', 'input', convertFromUsd);
  onIf('#audInput', 'input', convertFromAud);
  onIf('#tempFInput', 'input', convertFromF);
  onIf('#tempCInput', 'input', convertFromC);
  onIf('#closeChartDialog', 'click', () => $('#chartDialog').close());
  onIf('#openHolidayList', 'click', () => { renderHolidays(); $('#holidayListDialog').showModal(); });
  onIf('#closeHolidayListDialog', 'click', () => $('#holidayListDialog').close());
  onIf('#postMessageBtn', 'click', postPosterMessage);
  onIf('#postPhotoBtn', 'click', postPosterPhoto);
  onIf('#postDrawingBtn', 'click', postPosterDrawing);
  document.addEventListener('click', event => {
    const tempButton = event.target.closest('[data-temp-toggle]');
    if (tempButton) toggleWeatherUnit(tempButton.dataset.tempToggle);
    const calmButton = event.target.closest('[data-calm-call-alert]');
    if (calmButton) {
      const activeWindow = computeCallWindows()[0];
      const now = new Date();
      if (activeWindow && activeWindow.start <= now && activeWindow.end > now) {
        calmCallAlert(activeWindow);
        renderTimes();
        renderCallWindows();
      }
    }
  });
  setInterval(() => { renderTimes(); renderCallWindows(); }, 1000);
}

async function init() {
  markStandaloneDisplayMode();
  initBottomTabs();
  attachEvents();
  initDialogBackdropClose();
  initPosterBoard();
  convertFromF();
  renderSettings();
  renderFxNote();
  renderAllStatic();
  await refreshAll();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}
init();
