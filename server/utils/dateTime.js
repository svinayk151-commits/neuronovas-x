function parseAppDate(value) {
  if (!value) return new Date(NaN);
  const text = String(value);
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text);
}

function toSqlDate(value) {
  if (!value) return null;
  const date = parseAppDate(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').slice(0, 19) : null;
}

module.exports = { parseAppDate, toSqlDate };
