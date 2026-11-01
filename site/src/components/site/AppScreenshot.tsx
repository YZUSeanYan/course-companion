export type ScreenshotName = 'live-class' | 'course-detail' | 'vocab' | 'review-card'

export default function AppScreenshot({
  screenshot,
  width = 300,
  shadow = true,
}: {
  screenshot: ScreenshotName
  width?: number
  shadow?: boolean
}) {
  const srcMap: Record<ScreenshotName, string> = {
    'live-class': '/screenshots/app-live-class.png',
    'course-detail': '/screenshots/app-course-detail.png',
    'vocab': '/screenshots/app-vocab.png',
    'review-card': '/screenshots/app-review-card.png',
  }

  return (
    <div className="phone" style={{ width, boxShadow: shadow ? undefined : 'none' }}>
      <div className="phone-screen">
        <div className="phone-notch">
          <span className="rec-dot" />
        </div>
        <img
          src={srcMap[screenshot]}
          alt="知习 App 截图"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top',
          }}
        />
      </div>
    </div>
  )
}
