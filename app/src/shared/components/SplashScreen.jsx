import { useEffect } from 'react'
import { SplashScreen as CapacitorSplashScreen } from '@capacitor/splash-screen'
import splashImage from '../../assets/CampusFind Splash.png'

export default function SplashScreen() {
  useEffect(() => {
    CapacitorSplashScreen.hide().catch(() => {})
  }, [])

  return (
    <div className="fixed inset-0 h-screen w-screen bg-[#012F28] flex items-center justify-center">
      {/* object-contain (not cover) - the artwork is designed to be seen
          whole, centered. object-cover looked fine full-bleed on a phone's
          narrow portrait screen, but on a wide desktop browser window it
          crops the top/bottom of the crest off to fill the width. Since
          the image's own background already matches the page's bg color,
          contain shows the full artwork with no visible letterboxing. */}
      <img
        src={splashImage}
        alt=""
        className="max-h-full max-w-full object-contain"
      />
    </div>
  )
}
