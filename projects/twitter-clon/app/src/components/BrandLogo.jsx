/**
 * Marca estilo X: forma geométrica en “X” (no es el logotipo oficial).
 */
export function BrandLogo({ className = 'h-8 w-8' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M13.317 10.774 21.5 2h-1.94l-6.64 7.31L7.17 2H2.5l9.06 12.23L2.5 22h1.94l7.02-7.71L16.83 22h4.67L13.317 10.774Zm-2.63 2.97-1.02-1.38L4.5 3.76h3.22l4.92 6.64 1.02 1.38 6.36 8.62h-3.22l-5.2-7.07Z"
      />
    </svg>
  )
}
