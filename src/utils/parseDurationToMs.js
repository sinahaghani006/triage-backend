// Small local parser so we don't need an extra dependency (e.g. "ms")
// just to convert JWT_EXPIRES_IN ("1d", "12h", "30m", "45s") into the
// milliseconds that res.cookie's maxAge expects.
function parseDurationToMs(input) {
  const match = /^(\d+)\s*(d|h|m|s)?$/i.exec(String(input).trim());
  if (!match) {
    // Fallback: treat as seconds if it's a plain number, otherwise 1 day.
    const asNumber = Number(input);
    return Number.isFinite(asNumber) ? asNumber * 1000 : 24 * 60 * 60 * 1000;
  }

  const value = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const unitMs = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return value * unitMs[unit];
}

module.exports = parseDurationToMs;
