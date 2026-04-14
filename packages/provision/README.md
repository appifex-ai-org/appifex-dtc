# @dtc/provision

App store provisioning and submission:
- **iOS**: TestFlight via the [`asc` CLI](https://github.com/rudrankriyam/App-Store-Connect-CLI)
- **Android**: Play Console via [`@googleapis/androidpublisher`](https://www.npmjs.com/package/@googleapis/androidpublisher)

---

## iOS (TestFlight)

## Prerequisites

### 1. Apple Developer Account

You need an [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year).

### 2. Register a Bundle ID

Go to [developer.apple.com/account/resources/identifiers](https://developer.apple.com/account/resources/identifiers):
- Click **+** → **App IDs** → **App**
- Enter a description and a Bundle ID (e.g. `com.yourcompany.myapp`)
- Register it

### 3. Create an App in App Store Connect

Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+** → **New App**:
- Select **iOS** platform
- Enter app name
- Select the Bundle ID you just registered
- After creation, note the **numeric App ID** from the URL: `appstoreconnect.apple.com/apps/123456789/...`

### 4. Create a TestFlight Beta Group

In App Store Connect → your app → **TestFlight** tab:
- Click **+** next to "Internal Testing"
- Name the group (e.g. `Internal Testers`)
- Add yourself as a tester

### 5. Create an App Store Connect API Key

Go to [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api):
- Click **+** to generate a new key
- Give it **App Manager** or **Admin** role
- Download the `.p8` file (you can only download it once!)
- Note the **Key ID** and **Issuer ID** shown on the page
- Save the `.p8` file somewhere safe (e.g. `~/.appstoreconnect/AuthKey_XXXX.p8`)
- Set file permissions: `chmod 600 /path/to/AuthKey.p8`

### 6. Install the `asc` CLI

```bash
brew install asc
asc --version  # verify installation
```

## Setup

Run `dtc setup` and answer **Yes** to "Configure Apple TestFlight?":

```
◆  Configure Apple TestFlight?
│  Yes
│
◆  Apple Team ID
│  A1B2C3D4E5
│
◆  Bundle ID
│  com.example.petapp
│
◆  App Store Connect App ID (numeric)
│  123456789
│
◆  App Store Connect Key ID
│  ABC123DEF4
│
◆  App Store Connect Issuer ID
│  12345678-abcd-efgh-ijkl-123456789012
│
◆  Path to .p8 key file
│  ~/.appstoreconnect/AuthKey_ABC123DEF4.p8
```

This saves credentials to `~/.dtc/config.json` under the `apple` key.

## CLI Usage

```bash
# Archive a project and submit to TestFlight (full flow)
dtc provision submit --project ./my-app

# Archive with a specific scheme
dtc provision submit --project ./my-app --scheme PetApp

# Submit a pre-built .ipa directly (skip archive)
dtc provision submit --ipa ./build/PetApp.ipa
```

## Pipeline Integration

When Apple TestFlight is configured and all tests pass, the pipeline automatically archives and submits to TestFlight as the final step (SwiftUI projects only):

```bash
dtc run --prompt "Pet adoption app" --platform swiftui --out ./pet-app
# Pipeline: design → spec → tests → codegen → build → validate → fix → report → deliver → provision
```

## MCP Tool

The `dtc_provision_submit` MCP tool is available in Claude Code:

```
dtc_provision_submit({ projectDir: "/path/to/app" })                    # archive + submit
dtc_provision_submit({ projectDir: "/path/to/app", scheme: "PetApp" })  # with scheme
dtc_provision_submit({ ipaPath: "/path/to/App.ipa" })                   # pre-built IPA
```

## Programmatic Usage

```typescript
import { AscClient } from '@dtc/provision'
import { archiveSwift } from '@dtc/build'
import { LocalRunner } from '@dtc/runner'

const runner = new LocalRunner(process.cwd())

// Archive the project
const archive = await archiveSwift(runner, {
  projectDir: './my-app',
  scheme: 'PetApp',
  teamId: 'A1B2C3D4E5',
  bundleId: 'com.example.petapp',
  exportMethod: 'app-store',
})

// Submit to TestFlight
const asc = new AscClient(runner, {
  keyId: process.env.ASC_KEY_ID!,
  issuerId: process.env.ASC_ISSUER_ID!,
  keyPath: '~/.appstoreconnect/AuthKey.p8',
})
await asc.submitTestFlight({ appId: '123456789', ipaPath: archive.ipaPath! })

// Other AscClient methods
const apps = await asc.listApps()
await asc.createProfile({ name: 'PetApp Dev', bundleId: 'com.example.pet', type: 'development' })
```

---

## Android (Play Console)

### Prerequisites

#### 1. Google Play Developer Account

Register at [Google Play Console](https://play.google.com/console) ($25 one-time fee). Create your app listing.

#### 2. Create a Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts
2. Create a service account (e.g. `play-console-uploader`)
3. Click **Actions** → **Manage Keys** → **Add Key** → **Create New Key** → **JSON**
4. Download the JSON key file and save it (e.g. `~/.config/gcloud/play-console-key.json`)
5. In Google Play Console → **Setup** → **API Access**, link your Google Cloud project
6. Go to **Users and Permissions** → **Invite New User**, paste the service account email
7. Grant **Release Manager** permission for your app

#### 3. Create a Release Keystore

```bash
keytool -genkey -v -keystore release.keystore -alias release \
  -keyalg RSA -keysize 2048 -validity 10000
```

#### 4. First Upload (Required)

The Play Console API requires at least one manual upload before API uploads work. Upload your first AAB manually via Play Console → **Internal Testing** → **Create new release**.

### Setup

Run `dtc setup` and answer **Yes** to "Configure Google Play Console?":

```
◆  Configure Google Play Console?
│  Yes
│
◆  Service account JSON key path
│  ~/.config/gcloud/play-console-key.json
│
◆  Package name (application ID)
│  com.example.petapp
│
◆  Release keystore path (.jks)
│  ~/.android/release.keystore
│
◆  Keystore password
│  [hidden]
│
◆  Key alias
│  release
│
◆  Key password
│  [hidden]
│
◆  Play Console track
│  Internal Testing
```

This saves credentials to `~/.dtc/config.json` under the `android` key.

### CLI Usage

```bash
# Build AAB and submit to Play Console (auto-detects Android from project)
dtc provision submit --project ./my-app

# Submit a pre-built .aab directly (skip build)
dtc provision submit --aab ./app/build/outputs/bundle/release/app-release.aab
```

The CLI auto-detects the platform from the project directory (`build.gradle.kts` → Android, otherwise iOS).

### Pipeline Integration

When Google Play Console is configured and all tests pass, the pipeline automatically builds a release AAB and submits to the configured Play Console track:

```bash
dtc run --prompt "Pet adoption app" --platform kotlin-compose --out ./pet-app
# Pipeline: design → spec → tests → codegen → build → validate → fix → report → deliver → provision
```

### MCP Tool

The `dtc_provision_submit` MCP tool auto-detects the platform:

```
dtc_provision_submit({ projectDir: "/path/to/app" })                        # auto-detect + submit
dtc_provision_submit({ projectDir: "/path/to/app", platform: "android" })   # explicit Android
dtc_provision_submit({ aabPath: "/path/to/app.aab" })                       # pre-built AAB
```

### Programmatic Usage

```typescript
import { PlayConsoleClient } from '@dtc/provision'
import { bundleKotlin } from '@dtc/build'
import { createRunner } from '@dtc/runner'

const runner = createRunner({ type: 'local' })

// Build release AAB
const bundle = await bundleKotlin(runner, {
  projectDir: './my-app',
  keystorePath: '~/.android/release.keystore',
  keystorePassword: 'mypass',
  keyAlias: 'release',
  keyPassword: 'keypass',
})

// Submit to Play Console
const client = new PlayConsoleClient({
  serviceAccountKeyPath: '~/.config/gcloud/play-console-key.json',
})
await client.submitToTrack({
  packageName: 'com.example.petapp',
  aabPath: bundle.aabPath!,
  track: 'internal',
})
```
