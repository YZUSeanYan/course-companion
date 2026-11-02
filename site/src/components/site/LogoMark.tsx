import appIcon from '../../assets/app-icon.png'

/**
 * 品牌标：直接复用 App 的启动图标（app/src/main/res/drawable-nodpi/ic_brand_square.png）。
 * 早先这里是手绘的开卷 SVG，和 App 后来换的「Z + 声波」图标对不上，官网页头/页脚/下载页
 * 因此一直在用旧标。现在统一用同一张位图，尺寸与 App 保持一致。
 */
export default function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <img
      src={appIcon}
      width={size}
      height={size}
      alt=""
      aria-hidden
      className="wiggle-target"
      style={{ borderRadius: Math.round(size * 0.24), display: 'block' }}
    />
  )
}
