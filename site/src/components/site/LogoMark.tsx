export default function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      className="wiggle-target"
    >
      <circle cx="24" cy="24" r="21.5" fill="var(--brand)" />
      <path
        d="M10.5 17.25c5.15-.85 9.8.2 13.5 3.15v14.1c-3.7-2.95-8.35-4-13.5-3.15V17.25Z"
        fill="#fff"
        fillOpacity=".14"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M37.5 17.25c-5.15-.85-9.8.2-13.5 3.15v14.1c3.7-2.95 8.35-4 13.5-3.15V17.25Z"
        fill="#fff"
        fillOpacity=".14"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M24 20.4v14.1" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" opacity=".8" />
      <path d="M30.5 10.5a7 7 0 0 1 5.5 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".8" />
      <circle cx="29" cy="14.25" r="1.65" fill="#fff" />
    </svg>
  )
}
