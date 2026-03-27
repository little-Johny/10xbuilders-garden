/**
 * Avatar de usuario: muestra la foto de perfil o un placeholder con la
 * inicial del nombre cuando no hay URL.
 */
export function Avatar({ src, name = '', size = 'md', className = '' }) {
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-16 w-16 text-xl',
    xl: 'h-24 w-24 text-3xl',
  }
  const base = `${sizes[size] ?? sizes.md} rounded-full shrink-0 object-cover ${className}`
  const initial = name ? name[0].toUpperCase() : '?'

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        className={`${base} bg-x-secondary/40`}
      />
    )
  }

  return (
    <div
      className={`${base} flex items-center justify-center bg-x-secondary/50 font-bold text-x-text`}
      aria-hidden
    >
      {initial}
    </div>
  )
}
