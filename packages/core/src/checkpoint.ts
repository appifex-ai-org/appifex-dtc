import Database from 'better-sqlite3'
import type { PhaseId, CheckpointData } from './types.js'

export class Checkpoint {
  private db: Database.Database
  // Phase 13 (WR-02): idempotent close tracking — prevents double-close
  // TypeError from better-sqlite3 when SIGINT handler + exit handler both
  // try to close the same instance.
  private closed = false

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS phases (
        run_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (run_id, phase)
      )
    `)
  }

  /** Phase 13: generic typed savePhase. Existing untyped call sites remain valid
   *  because all CheckpointData branches accept optional status/completedAt (D-02).
   *
   *  Phase 13 (CR-01 fix): uses `json_patch` (RFC 7396 JSON merge patch) on
   *  conflict so that partial upserts from targeted call sites (e.g.
   *  `{ platformSpec }` at pipeline.ts:1332) do NOT clobber the `status` /
   *  `completedAt` fields written moments earlier by the centralized emit()
   *  hook. Without this, `lastCompletedPhase` (which filters rows by
   *  `$.status = 'completed'`) would miss phases whose targeted writes land
   *  last, silently breaking resume on add-feature runs. Requires SQLite JSON1
   *  (already required by `lastCompletedPhase`). */
  savePhase<P extends PhaseId>(runId: string, phase: P, data: CheckpointData[P]): void {
    this.db.prepare(`
      INSERT INTO phases (run_id, phase, data) VALUES (?, ?, ?)
      ON CONFLICT (run_id, phase) DO UPDATE SET
        data = json_patch(phases.data, excluded.data),
        updated_at = datetime('now')
    `).run(runId, phase, JSON.stringify(data))
  }

  getPhase(runId: string, phase: PhaseId): unknown | null {
    const row = this.db.prepare(
      'SELECT data FROM phases WHERE run_id = ? AND phase = ?'
    ).get(runId, phase) as { data: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.data)
    } catch (err) {
      // Phase 13 (WR-03): surface corrupt-row context instead of letting a raw
      // SyntaxError bubble up with no run/phase attribution. Resume code relies
      // on this error message to diagnose a wedged checkpoint DB.
      throw new Error(`Checkpoint row corrupt for run=${runId} phase=${phase}: ${String(err)}`)
    }
  }

  completedPhases(runId: string): PhaseId[] {
    const rows = this.db.prepare(
      'SELECT phase FROM phases WHERE run_id = ? ORDER BY rowid'
    ).all(runId) as Array<{ phase: PhaseId }>
    return rows.map(r => r.phase)
  }

  /** Phase 13 (D-16, criterion #4): returns the highest-rowid completed phase for a run, or null. */
  lastCompletedPhase(runId: string): PhaseId | null {
    const row = this.db.prepare(`
      SELECT phase FROM phases
      WHERE run_id = ? AND json_extract(data, '$.status') = 'completed'
      ORDER BY rowid DESC LIMIT 1
    `).get(runId) as { phase: PhaseId } | undefined
    return row?.phase ?? null
  }

  close(): void {
    // Phase 13 (WR-02): guard against double-close. better-sqlite3 throws
    // `TypeError: The database connection is not open` on the second call,
    // which races between pipeline SIGINT handler + exit handler.
    if (this.closed) return
    this.closed = true
    this.db.close()
  }
}
