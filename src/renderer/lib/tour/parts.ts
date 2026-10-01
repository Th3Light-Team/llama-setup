/**
 * Product tour definition. Pure data: no DOM, no Driver.js, no `@/` imports,
 * so it can be unit-tested in plain Node.
 *
 * Anchors are `[data-tour="..."]` attributes added to the real UI elements.
 */

export type TourPartId = 'welcome' | 'hardware' | 'binaries' | 'registry' | 'launch' | 'bench'

export type TourSide = 'top' | 'right' | 'bottom' | 'left'
export type TourAlign = 'start' | 'center' | 'end'

export interface TourStep {
  /** CSS selector of the element to highlight (a comma list is allowed; first match in DOM order wins). */
  selector: string
  title: string
  /** Plain text / light HTML. What it is for + what to do next. */
  description: string
  side?: TourSide
  align?: TourAlign
  /**
   * Selector of something to click before this step is shown (e.g. a tab button),
   * used when `selector` only exists after that click. The step is still shown
   * when `selector` is already present.
   */
  clickFirst?: string
}

export interface TourPart {
  id: TourPartId
  /** Short name used in menus and Settings. */
  title: string
  /** One line for Settings / menus. */
  summary: string
  /**
   * Routes where this part applies. The first is the "home" route used when
   * replaying from elsewhere. Used for "Tour this page".
   */
  routes: string[]
  /** True when every anchor lives in the app shell (sidebar), so no navigation is needed. */
  shell?: boolean
  /** Element that signals the page has mounted; auto-start waits for it. */
  readySelector: string
  /** Best-effort extras to wait for (async data) before resolving steps. */
  settleSelectors?: string[]
  /** Parts that must be seen before this one auto-starts. */
  requires?: TourPartId[]
  next?: TourPartId
  /** Label of the last-step button leading to `next`. */
  nextCta?: string
  steps: TourStep[]
}

const t = (name: string) => `[data-tour="${name}"]`

export const TOUR_PARTS: TourPart[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    summary: 'The sidebar, status badges, queues and where to get help.',
    routes: ['/'],
    shell: true,
    readySelector: t('sidebar-nav'),
    next: 'hardware',
    nextCta: 'Next: Hardware',
    steps: [
      {
        selector: t('sidebar-brand'),
        title: 'Welcome to llama-studio',
        description:
          'It manages llama.cpp end to end: detect your hardware, install an engine, download a model, then launch it. This 1-minute tour shows where everything is.',
        side: 'right',
        align: 'start',
      },
      {
        selector: t('sidebar-nav'),
        title: 'Work down the sidebar',
        description:
          'Hardware, Binaries, Registry and Library, Launch, Bench: the order you will use them in. Click any item to switch pages. Each page offers a short tour the first time you open it.',
        side: 'right',
        align: 'start',
      },
      {
        selector: t('sidebar-hw'),
        title: 'Hardware and engine status',
        description:
          'Top badge: the best backend found (CUDA, Vulkan, Metal or CPU) and your VRAM. Bottom badge: how many llama.cpp builds were found. Hover either for details, or use Re-detect / Re-scan after a driver change.',
        side: 'right',
        align: 'end',
      },
      {
        selector: t('sidebar-status'),
        title: 'Downloads and benchmarks',
        description:
          'Chips appear here while something is downloading or benchmarking. Click one to open its drawer, or press Ctrl+Shift+D (downloads) / Ctrl+Shift+B (bench).',
        side: 'right',
        align: 'end',
      },
      {
        selector: t('help-button'),
        title: 'Need this again?',
        description:
          'Press ? any time to replay the tour for the page you are on, or pick any other tour. Next up: the Hardware page, to see what your machine can run.',
        side: 'right',
        align: 'start',
      },
    ],
  },
  {
    id: 'hardware',
    title: 'Hardware',
    summary: 'What your machine can run: backends, VRAM and RAM.',
    routes: ['/hardware'],
    readySelector: t('hw-header'),
    requires: ['welcome'],
    next: 'binaries',
    nextCta: 'Next: Binaries',
    steps: [
      {
        selector: t('hw-header'),
        title: 'Your hardware scan',
        description:
          'This is what llama-studio found. Plugged in a GPU or updated drivers? Press Re-detect to scan again.',
        side: 'bottom',
        align: 'start',
      },
      {
        selector: t('hw-recommended'),
        title: 'Recommended binary',
        description:
          'The llama.cpp build that matches your OS, CPU and GPU. The Binaries page uses it to pre-select the best download for you.',
        side: 'bottom',
        align: 'start',
      },
      {
        selector: t('hw-backends'),
        title: 'Compute backends',
        description:
          'Each row is a way llama.cpp can run: CUDA, Vulkan, Metal or plain CPU. "Available" means usable now; warnings say what is missing (usually a driver). You only need one available backend.',
        side: 'top',
        align: 'start',
      },
      {
        selector: `${t('hw-vram')}, ${t('hw-memory')}`,
        title: 'Memory decides what fits',
        description:
          'A model must fit in VRAM to run fast; whatever spills over runs on the CPU and slows down. Keep these numbers in mind when you pick a model size. Next: install an engine on the Binaries page.',
        side: 'top',
        align: 'start',
      },
    ],
  },
  {
    id: 'binaries',
    title: 'Binaries and engines',
    summary: 'Installed engines, health checks, default engine, new builds.',
    routes: ['/binaries'],
    readySelector: t('bin-engines'),
    settleSelectors: [t('bin-engine-card'), t('bin-get')],
    requires: ['welcome'],
    next: 'registry',
    nextCta: 'Next: Registry',
    steps: [
      {
        selector: t('bin-engines'),
        title: 'Your engines',
        description:
          'Every llama.cpp build on this machine: the ones llama-studio installed and ones it found elsewhere. Nothing listed? Install one with "Get a new build" below.',
        side: 'bottom',
        align: 'start',
      },
      {
        selector: t('bin-engine-card'),
        title: 'Health check',
        description:
          'Healthy means it starts and reports devices. Degraded means some tools fail; Broken will not run. Press Verify after a driver update to re-check it.',
        side: 'bottom',
        align: 'start',
      },
      {
        selector: t('bin-engine-actions'),
        title: 'Set default, update, import',
        description:
          'Set default picks the engine the Launch page uses. Update appears when a newer release exists for the same backend. Import copies an external build into llama-studio so it can manage it.',
        side: 'left',
        align: 'start',
      },
      {
        selector: t('bin-get'),
        title: 'Get a new build',
        description:
          '"Best for You" is the release matching your hardware: press Install. Use "Browse all releases" to add another backend (for example Vulkan next to CUDA) and compare them in Bench. Next: pick a model in Registry.',
        side: 'top',
        align: 'start',
      },
    ],
  },
  {
    id: 'registry',
    title: 'Registry and Library',
    summary: 'Find a model, choose a quantization, download, see where it lands.',
    routes: ['/registry'],
    readySelector: t('reg-modes'),
    requires: ['welcome'],
    next: 'launch',
    nextCta: 'Next: Launch',
    steps: [
      {
        selector: t('reg-modes'),
        title: 'Featured or Search',
        description:
          'Featured is a hand-picked list that is safe to start with. Search covers every GGUF model on Hugging Face: type a name, then sort by downloads, likes or recency.',
        side: 'bottom',
        align: 'start',
      },
      {
        selector: t('reg-panel'),
        title: 'Open a model',
        description:
          'Click any model card to see its files. Pick something that fits your VRAM (see the Hardware page): a small 3B to 8B model is a good first download.',
        side: 'top',
        align: 'start',
      },
      {
        selector: t('reg-variants'),
        title: 'Pick a quantization',
        description:
          'Each row is the same model compressed differently. Smaller means faster and lighter but less accurate; Q4_K_M is a good default. Press Download, confirm the disk and license check, and it is queued.',
        side: 'top',
        align: 'start',
      },
      {
        selector: t('sidebar-status'),
        title: 'Downloads run in the background',
        description:
          'Progress shows in the Downloads drawer: click the sidebar chip or press Ctrl+Shift+D. You can pause, resume or cancel there, and keep browsing meanwhile.',
        side: 'right',
        align: 'end',
      },
      {
        selector: t('nav-library'),
        title: 'Where models land',
        description:
          'Finished downloads appear in Library (saved to your default models folder, changeable in Settings). Use the play button on a model to open it in Launch. Next: set up and start a server.',
        side: 'right',
        align: 'start',
      },
    ],
  },
  {
    id: 'launch',
    title: 'Launch',
    summary: 'Profiles, flags, starting the server, reading its output.',
    routes: ['/launch'],
    readySelector: t('launch-profiles'),
    settleSelectors: [t('launch-tabs')],
    requires: ['welcome'],
    next: 'bench',
    nextCta: 'Next: Bench',
    steps: [
      {
        selector: t('launch-profiles'),
        title: 'Profiles',
        description:
          'A profile is a saved set of llama-server flags (model, GPU layers, context...). Pick one, or press + to create a new profile. No profile yet? Make one now.',
        side: 'bottom',
        align: 'start',
      },
      {
        selector: t('launch-tabs'),
        title: 'Run, Configure, Details',
        description:
          'Configure sets the flags, Run starts the server, Details shows the profile summary and past runs, and lets you delete it. The status pill above shows whether the server is running.',
        side: 'right',
        align: 'start',
      },
      {
        selector: t('launch-flags'),
        clickFirst: t('launch-tab-configure'),
        title: 'Configure flags',
        description:
          'Pick a group here, then adjust its flags on the right. A dot marks anything you changed. Set the model path in Core, raise GPU layers in GPU Offload, and watch the VRAM estimate. Press Save changes when done.',
        side: 'right',
        align: 'start',
      },
      {
        selector: t('launch-start'),
        clickFirst: t('launch-tab-run'),
        title: 'Start the server',
        description:
          'Start launches llama-server with your default engine and these flags. Disabled? Install an engine on the Binaries page first. Press Stop when you are done.',
        side: 'bottom',
        align: 'end',
      },
      {
        selector: t('launch-cli'),
        title: 'CLI preview',
        description:
          'The exact command that will run. Copy it to use the same setup from a terminal or a script.',
        side: 'bottom',
        align: 'start',
      },
      {
        selector: t('launch-output'),
        title: 'Server output',
        description:
          'Live logs from llama-server. Loading a model takes a moment; when it prints that the server is listening, open the port shown in the status pill. Next: measure speed in Bench.',
        side: 'top',
        align: 'start',
      },
    ],
  },
  {
    id: 'bench',
    title: 'Bench',
    summary: 'Measure and compare speed per engine and device.',
    routes: ['/bench'],
    readySelector: t('bench-new'),
    requires: ['welcome'],
    steps: [
      {
        selector: t('bench-new'),
        title: 'Measure real speed',
        description:
          'A bench runs llama-bench on one model and records prompt speed (pp) and generation speed (tg) in tokens per second. Start one from Library: press the gauge icon on a model.',
        side: 'bottom',
        align: 'end',
      },
      {
        selector: t('bench-board'),
        title: 'The leaderboard',
        description:
          'Each row is one engine x device combination for a model, ranked by speed. Run the same model on CUDA, Vulkan and CPU, and the fastest setup rises to the top. Click a row for the full run details.',
        side: 'top',
        align: 'start',
      },
      {
        selector: t('bench-filters'),
        title: 'Compare fairly',
        description:
          'Filter by model, engine or device, and rank by tg (chat speed) or pp (prompt reading speed). Comparing different models only shows raw speed, so filter to one model to compare hardware.',
        side: 'bottom',
        align: 'start',
      },
      {
        selector: t('nav-library'),
        title: 'Add more runs',
        description:
          'Every model in Library has a bench menu: Quick for sensible defaults, Custom to tune the test. Running benches show in the sidebar. That is the tour: press ? any time to replay a part.',
        side: 'right',
        align: 'start',
      },
    ],
  },
]
