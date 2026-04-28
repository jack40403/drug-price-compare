/**
 * SimpleStore – A minimal JSON-file-based key/value store.
 * Replaces electron-store to avoid the ESM/CJS conflict from
 * conf → env-paths v3 (ESM-only) used in electron-store v8.
 *
 * The file path is resolved lazily on first access so that
 * app.getPath() is never called before Electron's app is ready.
 */
import { app } from 'electron'
import { join } from 'path'
import fs from 'fs'

class SimpleStore {
  private _filePath: string | null = null
  private _data: Record<string, unknown> | null = null
  private readonly name: string

  constructor(name = 'config') {
    this.name = name
  }

  /** Resolved lazily so app.getPath() is called only after app is ready. */
  private get filePath(): string {
    if (!this._filePath) {
      this._filePath = join(app.getPath('userData'), `${this.name}.json`)
    }
    return this._filePath
  }

  /** Data is loaded lazily on first access. */
  private get data(): Record<string, unknown> {
    if (!this._data) {
      this._data = this._load()
    }
    return this._data
  }

  private _load(): Record<string, unknown> {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }

  private _save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  /** Get a value, supports dot-notation: e.g. "creds.binli" */
  get(key: string): unknown {
    return key.split('.').reduce<unknown>((obj, k) => {
      if (obj && typeof obj === 'object') {
        return (obj as Record<string, unknown>)[k]
      }
      return undefined
    }, this.data)
  }

  /** Set a value, supports dot-notation: e.g. "creds.binli" */
  set(key: string, value: unknown) {
    const parts = key.split('.')
    let cursor: Record<string, unknown> = this.data
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') {
        cursor[parts[i]] = {}
      }
      cursor = cursor[parts[i]] as Record<string, unknown>
    }
    cursor[parts[parts.length - 1]] = value
    this._save()
  }
}

export default SimpleStore

