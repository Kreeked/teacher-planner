/** Знак застосунку: розкритий журнал із двох сторінок (той самий, що й іконка PWA). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path
        d="M47 32C38 23 22 21 9 26V72C22 67 38 68 47 78Z"
        fill="#f4cf5c"
        stroke="#f4cf5c"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <path
        d="M53 32C62 23 78 21 91 26V72C78 67 62 68 53 78Z"
        fill="#b9a2ea"
        stroke="#b9a2ea"
        strokeWidth="6"
        strokeLinejoin="round"
      />
    </svg>
  )
}
