/**
 * 行动区背景：一束收拢的声波。
 * 线条用同一套振幅包络（中间高、两侧收）画出来，作为「声音 → 文字」的图形记号。
 */
export default function WaveField() {
  // 振幅包络：越靠中间越高，两端收细
  const bars = 64
  const paths = Array.from({ length: 3 }, (_, row) => {
    const offset = row * 14
    return Array.from({ length: bars }, (_, i) => {
      const t = i / (bars - 1)
      const envelope = Math.sin(Math.PI * t) ** 1.6
      const wobble = 0.55 + 0.45 * Math.sin(i * 0.9 + offset * 0.3)
      const h = 8 + 118 * envelope * wobble
      return `M${i * 8} ${180 - h / 2}v${h}`
    }).join('')
  })

  return (
    <svg
      className="cta-wave"
      viewBox="0 0 512 180"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke="#fff"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.24 - i * 0.06}
          fill="none"
        />
      ))}
    </svg>
  )
}
