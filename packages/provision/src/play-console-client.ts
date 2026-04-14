import { createReadStream } from 'node:fs'
import { androidpublisher, AuthPlus } from '@googleapis/androidpublisher'

export interface PlayConsoleCredentials {
  /** Path to Google Cloud service account JSON key file */
  serviceAccountKeyPath: string
}

export interface PlayConsoleResult {
  success: boolean
  output?: string
  error?: string
  versionCode?: number
}

export interface SubmitToTrackOpts {
  /** Android package name (e.g. "com.example.app") */
  packageName: string
  /** Path to the .aab file */
  aabPath: string
  /** Play Console track: "internal" (default), "alpha", "beta", "production" */
  track?: string
  /** Release status: "completed" (default) or "draft" */
  status?: 'completed' | 'draft'
}

const SCOPES = ['https://www.googleapis.com/auth/androidpublisher']

export class PlayConsoleClient {
  constructor(private creds: PlayConsoleCredentials) {}

  /** Upload an AAB and assign it to a Play Console track */
  async submitToTrack(opts: SubmitToTrackOpts): Promise<PlayConsoleResult> {
    const track = opts.track ?? 'internal'
    const status = opts.status ?? 'draft'

    try {
      const authPlus = new AuthPlus()
      const auth = await authPlus.getClient({
        keyFile: this.creds.serviceAccountKeyPath,
        scopes: SCOPES,
      })
      const publisher = androidpublisher({ version: 'v3', auth })
      const packageName = opts.packageName

      // 1. Create edit
      const { data: edit } = await publisher.edits.insert({
        packageName,
        requestBody: {},
      })
      const editId = edit.id!

      // 2. Upload AAB
      const { data: bundle } = await publisher.edits.bundles.upload({
        packageName,
        editId,
        media: {
          mimeType: 'application/octet-stream',
          body: createReadStream(opts.aabPath),
        },
      })
      const versionCode = bundle.versionCode!

      // 3. Assign to track
      await publisher.edits.tracks.update({
        packageName,
        editId,
        track,
        requestBody: {
          track,
          releases: [{
            status,
            versionCodes: [String(versionCode)],
          }],
        },
      })

      // 4. Commit edit
      await publisher.edits.commit({ packageName, editId })

      return {
        success: true,
        output: `Uploaded to ${track} track (versionCode: ${versionCode})`,
        versionCode,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  }
}
