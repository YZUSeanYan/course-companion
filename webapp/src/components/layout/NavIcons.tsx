// 导航图标：与 Android 端 rootNavIcon 同一套语义（麦克风 / 书本 / 卡片 / 齿轮），
// 线条语言统一为 1.6px 圆头描边，24 网格，避免混用不同图标族的粗细差异。

type IconProps = { size?: number }

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: "false" as const,
  }
}

export function MicIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </svg>
  )
}

export function BookIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3.5 5.2c2.2-1.1 4.3-1.4 6.4-.6.9.34 1.6.9 2.1 1.6.5-.7 1.2-1.26 2.1-1.6 2.1-.8 4.2-.5 6.4.6v12.1c-2.2-1.1-4.3-1.35-6.4-.55-.9.35-1.6.9-2.1 1.6-.5-.7-1.2-1.25-2.1-1.6-2.1-.8-4.2-.55-6.4.55Z" />
      <path d="M12 6.2v12.1" />
    </svg>
  )
}

export function CardsIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <rect x="3" y="7" width="13" height="10" rx="2.4" />
      <path d="M7.5 4.2h9.8a3.7 3.7 0 0 1 3.7 3.7v7.4" />
      <path d="M6.5 11.2h6M6.5 13.8h3.6" />
    </svg>
  )
}

export function SettingsIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.32a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.68 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.68a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9v.1a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.1A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  )
}

export function ChevronLeftIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  )
}
