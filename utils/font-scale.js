module.exports = function fontScale() {
  // Product default: standard typography; do not apply an additional device
  // font multiplier to the shared design tokens.
  return 1
}

module.exports.base = require('./ui-tokens').font.body
