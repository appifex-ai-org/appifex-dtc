import type { BaasProvider } from '@appifex/core'

interface GeneratedFile {
  path: string
  content: string
}

const FIREBASE_DEEP_LINK_INSTRUCTIONS = `// Deep Link Configuration — Firebase Password Reset
//
// Firebase Dynamic Links was shut down August 25, 2025.
// Password reset deep links now use Firebase Hosting Universal Links.
//
// iOS Setup:
//   1. Add Associated Domains capability in Xcode
//   2. Add: applinks:REPLACE_PROJECT_ID.firebaseapp.com
//   3. Ensure your Firebase project has Hosting enabled
//
// Android Setup:
//   The intent filter below handles Universal Links from Firebase Hosting.
//   Add to your Activity in AndroidManifest.xml.
//
// See: firebase.google.com/docs/auth/ios/email-link-migration`

const FIREBASE_ANDROID_INTENT_FILTER = `<!-- Add inside <activity> in AndroidManifest.xml for Firebase password reset deep links -->
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="https"
        android:host="REPLACE_PROJECT_ID.firebaseapp.com"
        android:pathPrefix="/auth" />
</intent-filter>`

const SUPABASE_URL_SCHEME_PLIST = `<!-- Add to Info.plist for Supabase password reset deep links -->
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>REPLACE_URL_SCHEME</string>
    </array>
  </dict>
</array>`

const SUPABASE_ANDROID_INTENT_FILTER = `<!-- Add inside <activity> in AndroidManifest.xml for Supabase password reset deep links -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="REPLACE_URL_SCHEME"
        android:host="reset-password" />
</intent-filter>`

export function generateAuthDeepLinkConfig(provider: BaasProvider): GeneratedFile[] {
  if (provider === 'mock') return []
  const files: GeneratedFile[] = []

  if (provider === 'firebase') {
    files.push({
      path: 'deep-link-setup-firebase.txt',
      content: FIREBASE_DEEP_LINK_INSTRUCTIONS,
    })
    files.push({
      path: 'android-intent-filter-firebase.xml',
      content: FIREBASE_ANDROID_INTENT_FILTER,
    })
  } else {
    files.push({
      path: 'Info.plist.auth-snippet.xml',
      content: SUPABASE_URL_SCHEME_PLIST,
    })
    files.push({
      path: 'android-intent-filter-supabase.xml',
      content: SUPABASE_ANDROID_INTENT_FILTER,
    })
  }

  return files
}
