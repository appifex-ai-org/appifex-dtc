import { execFile } from 'node:child_process'

export function which(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('which', [binary], (err) => resolve(!err))
  })
}
