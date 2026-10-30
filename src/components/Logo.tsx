/** Знак застосунку: календар із галочкою (той самий, що й іконка PWA). */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <rect x="20" y="28" width="60" height="50" rx="7" fill="#fff" />
      <path d="M20 42V35a7 7 0 0 1 7-7h46a7 7 0 0 1 7 7v7z" fill="#fbe8a8" />
      <rect x="34" y="20" width="5.5" height="14" rx="2.7" fill="#fff" />
      <rect x="60.5" y="20" width="5.5" height="14" rx="2.7" fill="#fff" />
      <path d="M35 60l11 9 20-19" fill="none" stroke="#6fa597" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
