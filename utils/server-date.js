// MySQL timestamps without a zone follow the application's UTC+08 contract.
// Construct numerically: iOS does not consistently parse "YYYY-MM-DD HH:mm:ss".
function serverDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null
  if (typeof value !== 'string') return null
  const local = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(value)
  if (local) {
    const [, year, month, day, hour, minute, second, fraction = ''] = local
    const parts = [year, month, day, hour, minute, second].map(Number)
    const [y, m, d, h, min, s] = parts
    const stamp = Date.UTC(y, m - 1, d, h, min, s, Number(fraction.padEnd(3, '0')))
    const check = new Date(stamp)
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d || h > 23 || min > 59 || s > 59) return null
    return new Date(stamp - 8 * 3600000)
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const stamp = Date.parse(value)
  return Number.isFinite(stamp) ? new Date(stamp) : null
}
module.exports = { serverDate }
