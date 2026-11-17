<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    ActionCategory,
    ActionContext,
    ClipboardItemType,
    type ExtensionContext,
    type ExtensionStateProxy,
    type IActionService,
    type IClipboardHistoryService,
    type IFeedbackService,
  } from 'asyar-sdk/view';
  import type { CachedSource, SourceId, UsageSnapshot } from '../lib/types';

  let { context }: { context: ExtensionContext } = $props();

  // `context` is injected once per iframe; resolve its services up front.
  const actions = untrack(() => context.getService<IActionService>('actions'));
  const clipboard = untrack(() => context.getService<IClipboardHistoryService>('clipboard'));
  const feedback = untrack(() => context.getService<IFeedbackService>('feedback'));

  const EXTENSION_ID = 'org.asyar.ai-usage';
  const REFRESH_ACTION_ID = `${EXTENSION_ID}:refresh`;
  const SETTINGS_ACTION_ID = `${EXTENSION_ID}:settings`;
  const COPY_ACTION_ID = `${EXTENSION_ID}:copy-report`;
  const REFRESH_TIMEOUT_MS = 35_000;

  const sources: Array<{ id: SourceId; name: string; unofficial: boolean }> = [
    { id: 'codex', name: 'Codex', unofficial: true },
    { id: 'claude', name: 'Claude', unofficial: true },
    { id: 'openrouter', name: 'OpenRouter', unofficial: false },
  ];

  let caches = $state<Partial<Record<SourceId, CachedSource | null>>>({});
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state('');
  let now = $state(Date.now());

  async function reload(): Promise<void> {
    try {
      caches = await context.request<Partial<Record<SourceId, CachedSource | null>>>(
        'getSnapshots',
      );
      error = '';
    } catch {
      error = 'Usage data could not be loaded. Your saved readings are still shown below.';
    } finally {
      loading = false;
    }
  }

  async function refresh(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    try {
      await context.request('refreshNow', undefined, { timeoutMs: REFRESH_TIMEOUT_MS });
      await reload();
      await feedback.showHUD('Usage refreshed');
    } catch {
      error = 'Refresh took too long or a provider could not be reached. Showing the last reading.';
    } finally {
      refreshing = false;
    }
  }

  function openSettings(): void {
    window.parent.postMessage(
      { type: 'asyar:navigate-settings-tab', payload: { tab: 'extensions' } },
      '*',
    );
  }

  function remaining(snapshot: UsageSnapshot): number {
    return Math.max(0, Math.min(100, 100 - (snapshot.percentUsed ?? 0)));
  }

  function toneClass(snapshot: UsageSnapshot): string {
    const value = remaining(snapshot);
    if (value >= 50) return 'tone-success';
    return value >= 20 ? 'tone-warning' : 'tone-danger';
  }

  function money(value?: number): string {
    return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : '$—';
  }

  function clockTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function duration(milliseconds: number): string {
    const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `${rest}m`;
    if (hours < 48) return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
    const days = Math.floor(hours / 24);
    const leftover = hours % 24;
    return leftover === 0 ? `${days}d` : `${days}d ${leftover}h`;
  }

  function resetLine(resetsAt?: number | null): string {
    if (!resetsAt || !Number.isFinite(resetsAt)) return 'Reset time unavailable';
    const at = clockTime(resetsAt);
    return resetsAt <= now ? `Resets at ${at}` : `Resets at ${at} · in ${duration(resetsAt - now)}`;
  }

  function age(fetchedAt: number): string {
    const seconds = Math.max(0, Math.floor((now - fetchedAt) / 1000));
    if (seconds < 60) return 'Updated just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Updated ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `Updated ${hours}h ago` : `Updated ${Math.floor(hours / 24)}d ago`;
  }

  function describe(snapshot: UsageSnapshot): string {
    if (snapshot.status !== 'ok') return `${snapshot.label}: ${snapshot.message ?? 'unavailable'}`;
    if (snapshot.kind === 'credits') return `${snapshot.label}: ${money(snapshot.remainingUsd)} left`;
    const reset = snapshot.resetsAt ? ` (${resetLine(snapshot.resetsAt)})` : '';
    return `${snapshot.label}: ${Math.round(remaining(snapshot))}% remaining${reset}`;
  }

  async function copyReport(): Promise<void> {
    const lines = [`AI usage · ${new Date(now).toLocaleString()}`];
    for (const source of sources) {
      const cache = caches[source.id] ?? null;
      const kind = source.unofficial ? 'unofficial' : 'official';
      const readings = (cache?.snapshots ?? []).map(describe).join('; ');
      lines.push(`${source.name} (${kind}): ${readings || 'no reading yet'}`);
    }
    try {
      await clipboard.writeToClipboard({
        id: `ai-usage-report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: ClipboardItemType.Text,
        content: lines.join('\n'),
        createdAt: Date.now(),
        favorite: false,
      });
      await feedback.showHUD('Usage report copied');
    } catch {
      await feedback.showHUD('Usage report could not be copied');
    }
  }

  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 30_000);
    return () => clearInterval(timer);
  });

  $effect(() => {
    let dispose: (() => Promise<void>) | undefined;
    void reload();
    void context
      .getService<ExtensionStateProxy>('state')
      .subscribe('updatedAt', () => {
        void reload();
      })
      .then((value) => {
        dispose = value;
      });
    return () => {
      void dispose?.();
    };
  });

  onMount(() => {
    actions.registerAction({
      id: REFRESH_ACTION_ID,
      title: 'Refresh now',
      description: 'Poll every configured source for a fresh reading',
      icon: '↺',
      shortcut: 'Mod+R',
      primary: true,
      category: ActionCategory.PRIMARY,
      extensionId: EXTENSION_ID,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => refresh(),
    });
    actions.registerAction({
      id: SETTINGS_ACTION_ID,
      title: 'Open AI Usage settings',
      description: 'Configure the OpenRouter key, menu bar item and low-quota alerts',
      icon: '⚙',
      shortcut: 'Mod+O',
      category: ActionCategory.NAVIGATION,
      extensionId: EXTENSION_ID,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => openSettings(),
    });
    actions.registerAction({
      id: COPY_ACTION_ID,
      title: 'Copy usage report',
      description: 'Copy a plain-text summary of every source to the clipboard',
      icon: '📋',
      shortcut: 'Mod+Shift+C',
      category: ActionCategory.SHARE,
      extensionId: EXTENSION_ID,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => copyReport(),
    });

    return () => {
      actions.unregisterAction(REFRESH_ACTION_ID);
      actions.unregisterAction(SETTINGS_ACTION_ID);
      actions.unregisterAction(COPY_ACTION_ID);
    };
  });
</script>

<main class="page" class:busy={refreshing} aria-busy={refreshing}>
  {#if error}
    <div class="banner" role="status">
      <span class="banner-dot" aria-hidden="true"></span>
      <span>{error}</span>
    </div>
  {/if}

  {#if loading}
    <p class="visually-hidden" role="status">Loading usage data</p>
    <div class="grid" aria-hidden="true">
      {#each [0, 1, 2] as index (index)}
        <section class="card">
          <div class="card-head">
            <span class="skeleton skeleton-title"></span>
            <span class="skeleton skeleton-badge"></span>
          </div>
          <span class="skeleton skeleton-metric"></span>
          <span class="skeleton skeleton-meter"></span>
          <span class="skeleton skeleton-line"></span>
        </section>
      {/each}
    </div>
  {:else}
    <div class="grid">
      {#each sources as source (source.id)}
        {@const cache = caches[source.id] ?? null}
        {@const readings = cache?.snapshots ?? []}
        {@const unofficial = readings[0]?.isUnofficial ?? source.unofficial}
        <section class="card" aria-label={source.name}>
          <div class="card-head">
            <h2>{source.name}</h2>
            <span class="badge">{unofficial ? 'Unofficial' : 'Official'}</span>
            {#if cache}
              <span class="age">{age(cache.fetchedAt)}</span>
            {/if}
          </div>

          {#if readings.length === 0}
            <p class="note">No reading yet. Press ⌘R to check this source.</p>
          {:else}
            {#each readings as snapshot, index (index)}
              <div class="reading">
                {#if snapshot.status !== 'ok'}
                  <p class="note">{snapshot.message ?? 'This source could not be read.'}</p>
                {:else if snapshot.kind === 'credits'}
                  <div class="metric">
                    <span class="metric-value">{money(snapshot.remainingUsd)}</span>
                    <span class="metric-unit">left</span>
                  </div>
                {:else}
                  <span class="reading-label">{snapshot.label}</span>
                  <div class="metric">
                    <span class="metric-value {toneClass(snapshot)}"
                      >{Math.round(remaining(snapshot))}%</span
                    >
                    <span class="metric-unit">remaining</span>
                  </div>
                  <div
                    class="meter"
                    role="progressbar"
                    aria-label={`${source.name} ${snapshot.label}: ${Math.round(
                      remaining(snapshot),
                    )}% remaining`}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={Math.round(remaining(snapshot))}
                  >
                    <span
                      class="meter-fill {toneClass(snapshot)}"
                      style:width={`${remaining(snapshot)}%`}
                    ></span>
                  </div>
                  <p class="reset">{resetLine(snapshot.resetsAt)}</p>
                {/if}
              </div>
            {/each}
          {/if}
        </section>
      {/each}
    </div>
  {/if}

  <section class="more" aria-labelledby="more-sources-title">
    <h2 id="more-sources-title">More sources</h2>
    <ul class="more-list">
      <li class="more-row">
        <span class="more-name">Antigravity</span>
        <span class="more-desc">
          Its quota only surfaces through an unsupported local process, so it stays out of this
          dashboard.
        </span>
      </li>
      <li class="more-row">
        <span class="more-name">ChatGPT and Claude on the web</span>
        <span class="more-desc">
          Browser sessions carry no API token an extension can read.
        </span>
      </li>
    </ul>
    <div class="more-foot">
      <button type="button" class="action-button" onclick={openSettings}>
        Configure API keys in settings
      </button>
      <span class="more-meta">Menu bar and low-quota alerts live there too.</span>
    </div>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    color: var(--text-primary);
    background: var(--bg-primary);
    font-family: var(--font-ui);
  }
  :global(*) {
    box-sizing: border-box;
  }

  .page {
    box-sizing: border-box;
    min-height: 100vh;
    overflow-y: auto;
    padding: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    transition: opacity var(--transition-normal);
  }
  .page.busy {
    opacity: 0.62;
  }

  .page::-webkit-scrollbar {
    width: var(--size-xs);
  }
  .page::-webkit-scrollbar-thumb {
    border-radius: var(--radius-full);
    background: var(--scrollbar-thumb);
  }
  .page::-webkit-scrollbar-track {
    background: transparent;
  }

  h2,
  p,
  ul,
  li {
    margin: 0;
  }
  ul {
    padding: 0;
    list-style: none;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
  }
  @media (max-width: 559px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .more-row {
      flex-direction: column;
      gap: var(--space-0-5);
    }
    .more-name,
    .more-desc {
      min-width: 0;
    }
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-5);
    border: 1px solid var(--separator);
    border-radius: var(--radius-lg);
    background: var(--bg-secondary);
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }
  .card-head h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    letter-spacing: var(--tracking-tight);
    color: var(--text-primary);
  }

  .badge {
    padding: var(--space-0-5) var(--space-1-5);
    border-radius: var(--radius-xs);
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    font-size: var(--font-size-2xs);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
  }

  .age {
    margin-left: auto;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .reading {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .reading + .reading {
    margin-top: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid var(--divider-soft);
  }

  .reading-label {
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
  }

  .metric {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .metric-value {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--tracking-tight);
  }
  .metric-unit {
    color: var(--text-tertiary);
    font-size: var(--font-size-xs);
  }

  .tone-success {
    color: var(--accent-success);
  }
  .tone-warning {
    color: var(--accent-warning);
  }
  .tone-danger {
    color: var(--accent-danger);
  }

  .meter {
    height: 6px; /* design-ok: meter bar thickness, below the smallest size token */
    overflow: hidden;
    border-radius: var(--radius-full);
    background: var(--bg-hover);
  }
  .meter-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    transition:
      width var(--transition-smooth),
      background var(--transition-normal);
  }
  .meter-fill.tone-success {
    background: var(--accent-success);
  }
  .meter-fill.tone-warning {
    background: var(--accent-warning);
  }
  .meter-fill.tone-danger {
    background: var(--accent-danger);
  }

  .reset {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
  }

  .note {
    color: var(--text-tertiary);
    font-size: var(--font-size-xs);
    line-height: 1.5;
  }

  .banner {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border: 1px solid color-mix(in srgb, var(--accent-warning) 28%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--accent-warning) 12%, transparent);
    color: var(--accent-warning);
    font-size: var(--font-size-xs);
    line-height: 1.5;
  }
  .banner-dot {
    flex: none;
    width: 6px; /* design-ok: status pip, below the smallest size token */
    height: 6px;
    margin-top: 5px;
    border-radius: var(--radius-full);
    background: var(--accent-warning);
  }

  .more {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    border: 1px solid var(--separator);
    border-radius: var(--radius-lg);
    background: var(--bg-secondary);
  }
  .more h2 {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }
  .more-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .more-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
    flex-wrap: wrap;
    font-size: var(--font-size-xs);
    line-height: 1.5;
  }
  .more-name {
    min-width: 140px;
    color: var(--text-primary);
    font-weight: var(--font-weight-medium);
  }
  .more-desc {
    flex: 1;
    min-width: 200px;
    color: var(--text-tertiary);
  }
  .more-foot {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--divider-soft);
  }
  .more-meta {
    color: var(--text-tertiary);
    font-size: var(--font-size-2xs);
  }

  .action-button {
    display: inline-flex;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    cursor: default;
    transition: background var(--transition-fast);
  }
  .action-button:hover {
    background: var(--bg-hover);
  }
  .action-button:focus-visible {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: var(--shadow-focus);
  }

  .skeleton {
    display: block;
    border-radius: var(--radius-xs);
    background: var(--bg-tertiary);
    animation: skeleton-pulse 1.6s var(--ease-travel) infinite;
  }
  .skeleton-title {
    width: 45%;
    height: var(--size-xs);
  }
  .skeleton-badge {
    width: 52px;
    height: var(--size-xs);
  }
  .skeleton-metric {
    width: 38%;
    height: var(--size-lg);
    margin-top: var(--space-2);
  }
  .skeleton-meter {
    width: 100%;
    height: 6px; /* design-ok: matches the real meter bar */
    margin-top: var(--space-1);
    border-radius: var(--radius-full);
  }
  .skeleton-line {
    width: 60%;
    height: var(--font-size-xs);
    margin-top: var(--space-1);
  }

  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 0.45;
    }
    50% {
      opacity: 0.9;
    }
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
      opacity: 0.6;
    }
    .meter-fill {
      transition: none;
    }
  }
</style>
