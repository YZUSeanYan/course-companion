/** 首屏背后的两团缓慢漂移的暖光；纯径向渐变 + transform，不使用模糊滤镜。 */
export default function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <span className="aurora__blob aurora__blob--a" />
      <span className="aurora__blob aurora__blob--b" />
    </div>
  )
}
