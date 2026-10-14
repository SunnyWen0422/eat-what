// Keep the original recipe object intact; failures are presentation state only.
function imageSource(value) {
  if (typeof value !== 'string') return ''
  // These exact legacy hosts were verified against identical bytes over valid HTTPS.
  return value.trim().replace(/^http:/i, 'https:')
    .replace(/^https:\/\/cp[12]\.douguo\.net(?=:\d+(?:[/?#]|$)|[/?#]|$)/i, 'https://cp1.douguo.com')
}
function placeholderIcon(type) {
  return ['meat', 'veg', 'soup', 'staple', 'dessert', 'side'].includes(type) ? type : 'recipe'
}
module.exports = { imageSource, placeholderIcon }
