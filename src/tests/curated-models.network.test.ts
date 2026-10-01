/**
 * Network-gated check that every curated HF repo still exists. Opt in with
 *   CHECK_HF=1 npx vitest run src/tests/curated-models.network.test.ts
 * (set HF_TOKEN to avoid anonymous rate limits). Skipped otherwise so the
 * regular `npm test` stays hermetic.
 */
import { describe, it, expect } from 'vitest'
import { CURATED_MODELS } from '../renderer/data/curated-models'

const enabled = process.env.CHECK_HF === '1'

async function fetchRepo(id: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (process.env.HF_TOKEN) headers.Authorization = `Bearer ${process.env.HF_TOKEN}`
  let last: Response | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await fetch(`https://huggingface.co/api/models/${id}`, { headers })
    if (last.status !== 429 && last.status < 500) return last
    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
  }
  return last!
}

describe.skipIf(!enabled)('curated models exist on Hugging Face (CHECK_HF=1)', () => {
  it.each(CURATED_MODELS.map(m => m.id))('%s', async (id) => {
    const res = await fetchRepo(id)
    expect(res.status, `https://huggingface.co/api/models/${id} returned ${res.status}`).toBe(200)
    const body = (await res.json()) as { id?: string; siblings?: Array<{ rfilename: string }> }
    expect(body.id?.toLowerCase()).toBe(id.toLowerCase())
    // A GGUF repo with no .gguf file would give users an empty file list.
    if (body.siblings) {
      expect(body.siblings.some(s => s.rfilename.toLowerCase().endsWith('.gguf')), 'has .gguf files').toBe(true)
    }
  }, 30000)
})
