/** Username: minúsculas, números y guión bajo, 3–30 caracteres */
export const USERNAME_RE = /^[a-z0-9_]{3,30}$/

export const AVATAR_ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])
