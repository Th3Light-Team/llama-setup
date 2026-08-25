/**
 * Hand-curated catalog of recommended GGUF models and trusted HF authors.
 *
 * Editing guide
 * ─────────────
 * • CURATED_MODELS  — individual model entries shown in the Featured tab.
 *   Each entry maps to a real HuggingFace repo that hosts GGUF files.
 *   - `id`         HF repo path, e.g. "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF"
 *   - `family`     display name for the model family
 *   - `author`     HF org/user that *owns* the model (may differ from the repo host)
 *   - `category`   one of: 'small' | 'chat' | 'code' | 'general'
 *   - `recQuant`   recommended quantization for most users (Q4_K_M is a safe default)
 *   - `contextK`   context window in thousands of tokens (e.g. 128 = 128 k)
 *   - `minVramGB`  rough minimum VRAM at recommended quant
 *   - `tags`       short display labels shown on the card
 *   - `description` one sentence shown on the card
 *
 * • CURATED_AUTHORS — trusted HF organisations shown in the "Browse authors" section.
 *   Clicking one triggers a search filtered to that author.
 *   - `id`    HF organisation slug (used as the search query author filter)
 *   - `label` display name
 *   - `note`  one-liner about what they publish
 */

export type ModelCategory = 'small' | 'chat' | 'code' | 'general'

export interface CuratedModel {
  id: string          // HuggingFace repo path (host of the GGUF files)
  family: string      // model family name, e.g. "Llama 3.1 8B"
  author: string      // originating org, e.g. "meta-llama"
  category: ModelCategory
  recQuant: string    // recommended quantization
  contextK: number    // context window in k-tokens
  minVramGB: number   // rough minimum at recQuant
  tags: string[]
  description: string
}

export interface CuratedAuthor {
  id: string          // HF org slug used as search filter
  label: string
  note: string
}

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  small:   'Small & Fast',
  chat:    'Chat & Instruct',
  code:    'Coding',
  general: 'General Purpose',
}

export const CATEGORY_ORDER: ModelCategory[] = ['small', 'chat', 'code', 'general']

// ─── Curated models ────────────────────────────────────────────────────────────
// Sources: bartowski, unsloth, and first-party GGUF repos are all valid.
// bartowski and unsloth produce well-tested, consistently named GGUF files.

export const CURATED_MODELS: CuratedModel[] = [
  // ── Small & Fast ───────────────────────────────────────────────────────────
  {
    id: 'bartowski/Qwen2.5-1.5B-Instruct-GGUF',
    family: 'Qwen 2.5 1.5B',
    author: 'Qwen',
    category: 'small',
    recQuant: 'Q4_K_M',
    contextK: 32,
    minVramGB: 1,
    tags: ['fast', 'efficient', 'chat'],
    description: 'Smallest practical instruct model; ideal for low-VRAM or CPU-only setups.',
  },
  {
    id: 'bartowski/Phi-3.5-mini-instruct-GGUF',
    family: 'Phi-3.5 Mini',
    author: 'microsoft',
    category: 'small',
    recQuant: 'Q4_K_M',
    contextK: 128,
    minVramGB: 2,
    tags: ['microsoft', 'fast', '128k ctx'],
    description: 'Microsoft\'s compact powerhouse — punches above its weight with a 128k context window.',
  },
  {
    id: 'bartowski/gemma-3-4b-it-GGUF',
    family: 'Gemma 3 4B',
    author: 'google',
    category: 'small',
    recQuant: 'Q4_K_M',
    contextK: 128,
    minVramGB: 3,
    tags: ['google', '128k ctx', 'multilingual'],
    description: 'Google\'s 4B instruct model with strong multilingual capabilities and 128k context.',
  },
  {
    id: 'bartowski/SmolLM2-1.7B-Instruct-GGUF',
    family: 'SmolLM2 1.7B',
    author: 'HuggingFaceTB',
    category: 'small',
    recQuant: 'Q4_K_M',
    contextK: 8,
    minVramGB: 1,
    tags: ['huggingface', 'tiny', 'fast'],
    description: 'HuggingFace\'s ultra-compact 1.7B instruct model; extreme speed on CPU.',
  },

  // ── Chat & Instruct ────────────────────────────────────────────────────────
  {
    id: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
    family: 'Llama 3.1 8B',
    author: 'meta-llama',
    category: 'chat',
    recQuant: 'Q4_K_M',
    contextK: 128,
    minVramGB: 5,
    tags: ['meta', '128k ctx', 'popular'],
    description: 'Meta\'s highly capable 8B instruct model with 128k context — the community gold standard.',
  },
  {
    id: 'bartowski/Mistral-7B-Instruct-v0.3-GGUF',
    family: 'Mistral 7B v0.3',
    author: 'mistralai',
    category: 'chat',
    recQuant: 'Q4_K_M',
    contextK: 32,
    minVramGB: 5,
    tags: ['mistral', 'fast', 'proven'],
    description: 'The model that sparked the efficient-LLM movement — battle-tested and fast.',
  },
  {
    id: 'bartowski/Qwen2.5-7B-Instruct-GGUF',
    family: 'Qwen 2.5 7B',
    author: 'Qwen',
    category: 'chat',
    recQuant: 'Q4_K_M',
    contextK: 128,
    minVramGB: 5,
    tags: ['multilingual', '128k ctx', 'reasoning'],
    description: 'Strong multilingual 7B model from Alibaba with excellent reasoning across tasks.',
  },
  {
    id: 'bartowski/gemma-3-12b-it-GGUF',
    family: 'Gemma 3 12B',
    author: 'google',
    category: 'chat',
    recQuant: 'Q4_K_M',
    contextK: 128,
    minVramGB: 8,
    tags: ['google', '12B', 'multilingual'],
    description: 'Google\'s 12B instruct with top-tier instruction following and broad language support.',
  },
  {
    id: 'bartowski/Llama-3.3-70B-Instruct-GGUF',
    family: 'Llama 3.3 70B',
    author: 'meta-llama',
    category: 'chat',
    recQuant: 'Q3_K_M',
    contextK: 128,
    minVramGB: 32,
    tags: ['meta', '70B', 'flagship'],
    description: 'Meta\'s flagship 70B — frontier-quality chat and reasoning for those with the VRAM.',
  },

  // ── Coding ─────────────────────────────────────────────────────────────────
  {
    id: 'bartowski/Qwen2.5-Coder-7B-Instruct-GGUF',
    family: 'Qwen 2.5 Coder 7B',
    author: 'Qwen',
    category: 'code',
    recQuant: 'Q4_K_M',
    contextK: 128,
    minVramGB: 5,
    tags: ['code', 'fill-in-middle', '128k ctx'],
    description: 'State-of-the-art 7B coding model with 128k context and fill-in-the-middle support.',
  },
  {
    id: 'bartowski/Qwen2.5-Coder-32B-Instruct-GGUF',
    family: 'Qwen 2.5 Coder 32B',
    author: 'Qwen',
    category: 'code',
    recQuant: 'Q4_K_M',
    contextK: 128,
    minVramGB: 20,
    tags: ['code', '32B', 'best-in-class'],
    description: 'The most capable open-source coding model at 32B — matches GPT-4o on many benchmarks.',
  },
  {
    id: 'bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF',
    family: 'DeepSeek Coder V2 Lite',
    author: 'deepseek-ai',
    category: 'code',
    recQuant: 'Q4_K_M',
    contextK: 128,
    minVramGB: 10,
    tags: ['MoE', 'code', '128k ctx'],
    description: 'DeepSeek\'s MoE coding model with excellent multi-language code generation.',
  },

  // ── General Purpose ────────────────────────────────────────────────────────
  {
    id: 'bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF',
    family: 'DeepSeek R1 Distill 7B',
    author: 'deepseek-ai',
    category: 'general',
    recQuant: 'Q4_K_M',
    contextK: 128,
    minVramGB: 5,
    tags: ['reasoning', 'R1 distill', 'chain-of-thought'],
    description: 'DeepSeek R1 reasoning distilled into a 7B model — strong step-by-step problem solving.',
  },
  {
    id: 'bartowski/Mistral-Nemo-Instruct-2407-GGUF',
    family: 'Mistral Nemo 12B',
    author: 'mistralai',
    category: 'general',
    recQuant: 'Q4_K_M',
    contextK: 128,
    minVramGB: 8,
    tags: ['mistral', '12B', '128k ctx'],
    description: 'Mistral\'s 12B model jointly developed with NVIDIA — excellent balance of speed and quality.',
  },
  {
    id: 'unsloth/Phi-4-GGUF',
    family: 'Phi-4 14B',
    author: 'microsoft',
    category: 'general',
    recQuant: 'Q4_K_M',
    contextK: 16,
    minVramGB: 9,
    tags: ['microsoft', '14B', 'STEM'],
    description: 'Microsoft\'s 14B model trained on high-quality synthetic data — outstanding on STEM tasks.',
  },
]

// ─── Curated authors ───────────────────────────────────────────────────────────
// These appear as clickable chips in the "Browse authors" section.
// Clicking one sets the search query to `author:{id}` and switches to Search mode.

export const CURATED_AUTHORS: CuratedAuthor[] = [
  { id: 'meta-llama',      label: 'Meta Llama',      note: 'Llama 3.x family' },
  { id: 'mistralai',       label: 'Mistral AI',      note: 'Mistral, Mixtral, Nemo' },
  { id: 'Qwen',            label: 'Qwen',            note: 'Qwen 2.5, Coder, Math' },
  { id: 'google',          label: 'Google',          note: 'Gemma 2 & 3 family' },
  { id: 'microsoft',       label: 'Microsoft',       note: 'Phi-3, Phi-3.5, Phi-4' },
  { id: 'deepseek-ai',     label: 'DeepSeek',        note: 'Coder V2, R1 distills' },
  { id: 'bartowski',       label: 'bartowski',       note: 'High-quality GGUF repacks' },
  { id: 'unsloth',         label: 'unsloth',         note: 'Optimised GGUF fine-tunes' },
  { id: 'HuggingFaceTB',   label: 'HuggingFace',     note: 'SmolLM, Zephyr, HF models' },
  { id: 'NousResearch',    label: 'Nous Research',   note: 'Hermes, Capybara series' },
  { id: 'cognitivecomputations', label: 'Cognitive Comp.', note: 'Dolphin uncensored fine-tunes' },
  { id: 'lmstudio-community', label: 'LM Studio',   note: 'Community GGUF repacks' },
]
