const HEIGHTS = [10, 16, 22, 14, 20, 9, 18, 12]

export default function Waveform({ color = 'var(--brand)' }: { color?: string }) {
  return (
    <span className="wave" style={{ color }} aria-hidden>
      {HEIGHTS.map((h, i) => (
        <span
          key={i}
          className="wave-bar"
          style={{ height: h, animationDelay: `${i * 0.09}s` }}
        />
      ))}
    </span>
  )
}
