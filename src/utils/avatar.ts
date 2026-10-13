const AVATAR_PALETTES = [
  ['#EAF3DE', '#3B6D11'],
  ['#E6F1FB', '#185FA5'],
  ['#FAEEDA', '#854F0B'],
  ['#EEEDFE', '#3C3489'],
  ['#FBEAF0', '#993556'],
  ['#FFF4E6', '#B45309'],
  ['#F0FDF4', '#166534'],
  ['#FEF2F2', '#991B1B'],
  ['#F3E8FF', '#6B21A8'],
  ['#ECFEFF', '#155E75'],
]

export function avatarColors(name) {
  return AVATAR_PALETTES[(name || '?').charCodeAt(0) % AVATAR_PALETTES.length]
}

export function initials(name) {
  return (name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}