function deriveStateAppearance({kind='empty',illustration='',density='page'}={}) {
  const inline = density === 'inline' || kind === 'loading'
  return {
    inline,
    showIllustration: kind === 'empty' && !inline && Boolean(illustration),
    icon: kind === 'error' ? 'warning' : kind === 'auth' ? 'profile' : '',
  }
}
module.exports = {deriveStateAppearance}
