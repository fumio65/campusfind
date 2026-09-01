import { registerPlugin } from '@capacitor/core'

// Bridges to SaveFilePlugin.java (android/app/src/main/java/com/nwssu/campusfind) -
// not an npm package, since no existing Capacitor plugin exposes Android's
// "Save As" picker (ACTION_CREATE_DOCUMENT). registerPlugin() works the same
// way for a plugin registered directly in MainActivity as it does for an
// npm-installed one; it just proxies calls to whatever native class
// declared that name via @CapacitorPlugin.
export const SaveFile = registerPlugin('SaveFile')
