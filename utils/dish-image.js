// Keep the original recipe object intact; failures are presentation state only.
function imageSource(value) {
  if (typeof value !== 'string' || value.length > 2048) return ''
  const source=value.trim()
  if(/[\u0000-\u001f\u007f]/.test(source))return ''
  if(/^\/(?!\/)/.test(source)||/^(?:assets|images)\//.test(source))return source
  const authority=/^https?:\/\/([^/?#]+)/i.exec(source)
  if(!authority||authority[1].includes('@')||/\s/.test(source))return ''
  // These exact legacy hosts were verified against identical bytes over valid HTTPS.
  return source.replace(/^http:/i, 'https:')
    .replace(/^https:\/\/cp[12]\.douguo\.net(?=:\d+(?:[/?#]|$)|[/?#]|$)/i, 'https://cp1.douguo.com')
}
function imageIdentity(dish={}){return JSON.stringify([dish.dishId || dish.id || '',dish.contentVersion || '',imageSource(dish.image)])}
function placeholderIcon(type) {
  return ['meat', 'veg', 'soup', 'staple', 'dessert', 'side'].includes(type) ? type : 'recipe'
}
module.exports = { imageSource, imageIdentity, placeholderIcon }
