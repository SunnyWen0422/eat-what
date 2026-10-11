// Keep the original recipe object intact; failures are presentation state only.
function imageSource(value) {
  return typeof value === 'string' ? value.trim().replace(/^http:/i, 'https:') : ''
}
function placeholderIcon(type) {
  return ['meat', 'veg', 'soup', 'staple', 'dessert', 'side'].includes(type) ? type : 'recipe'
}
module.exports = { imageSource, placeholderIcon }
