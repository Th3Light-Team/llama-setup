import { db } from './__mocks__/db'
import { afterEach } from 'vitest'

/** Wipe all downloads rows between tests so each test starts clean. */
afterEach(() => {
  db.prepare('DELETE FROM downloads').run()
})
