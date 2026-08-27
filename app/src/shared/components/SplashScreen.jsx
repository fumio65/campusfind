import { useEffect } from 'react'
import { SplashScreen as CapacitorSplashScreen } from '@capacitor/splash-screen'
import splashImage from '../../assets/CampusFind Splash.png'

export default function SplashScreen() {
  useEffect(() => {
    CapacitorSplashScreen.hide().catch(() => {})
  }, [])

  return (
    <div className="fixed inset-0 h-screen w-screen bg-[#012F28]">
      <img
        src={splashImage}
        alt=""
        className="h-full w-full object-cover"
      />
    </div>
  )
}
