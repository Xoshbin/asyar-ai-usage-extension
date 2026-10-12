<script lang="ts">
  import type { ExtensionContext, ExtensionStateProxy } from 'asyar-sdk/view';
  import { ActionContext } from 'asyar-sdk/contracts';
  import type { CachedSource, SourceId, UsageSnapshot } from '../lib/types';

  let { context }: { context: ExtensionContext } = $props();
  let caches = $state<Partial<Record<SourceId, CachedSource | null>>>({});
  let loading = $state(true);
  let error = $state('');
  const sources: Array<{ id: SourceId; name: string; unofficial: boolean }> = [
    { id: 'codex', name: 'Codex', unofficial: true },
    { id: 'claude', name: 'Claude', unofficial: true },
    { id: 'openrouter', name: 'OpenRouter', unofficial: false },
  ];

  async function reload(): Promise<void> {
    try {
      caches = await context.request('getSnapshots');
      error = '';
    } catch {
      error = 'Usage data could not be loaded. Try refreshing.';
    } finally {
      loading = false;
    }
  }
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

    const ACTION_ID = 'org.asyar.ai-usage:refresh';
    context.registerAction({
      id: ACTION_ID,
      title: 'Refresh Now',
      description: 'Refresh AI usage data from all sources',
      icon: '↺',
      extensionId: 'org.asyar.ai-usage',
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        try {
          await context.request('refreshNow', undefined, { timeoutMs: 35_000 });
          await reload();
        } catch {
          error = 'Refresh took too long or a provider could not be reached.';
        }
      },
    });

    return () => {
      void dispose?.();
      context.unregisterAction(ACTION_ID);
    };
  });

  function remaining(snapshot: UsageSnapshot): number {
    return Math.max(0, Math.min(100, 100 - (snapshot.percentUsed ?? 0)));
  }
  function tone(snapshot: UsageSnapshot): string {
    const value = remaining(snapshot);
    return value >= 50
      ? 'var(--accent-success)'
      : value >= 20
        ? 'var(--accent-warning)'
        : 'var(--accent-danger)';
  }
  function until(timestamp?: number | null): string {
    if (!timestamp || !Number.isFinite(timestamp)) return 'Reset time unavailable';
    const minutes = Math.max(0, Math.ceil((timestamp - Date.now()) / 60_000));
    return `Resets in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  function age(timestamp: number): string {
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
    return minutes < 1
      ? 'Updated just now'
      : `Updated ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
</script>

<main class="page custom-scrollbar">
  {#if loading}<p class="state">Loading usage…</p>{:else if error}<p class="error">
      {error}
    </p>{:else}
    <div class="grid">
      {#each sources as source}{@const cache = caches[source.id]}
        <section class="card">
          <div class="source">
            <h2>{source.name}</h2>
            <span>{source.unofficial ? 'Unofficial source' : 'Official'}</span>
          </div>
          {#if !cache}<p class="state">
              No reading yet. Refresh to check this source.
            </p>{:else}{#each cache.snapshots as snapshot}
              <div class="reading">
                <div class="label">
                  <strong>{snapshot.label}</strong><span>{age(cache.fetchedAt)}</span>
                </div>
                {#if snapshot.status !== 'ok'}<p class="state">
                    {snapshot.message}
                  </p>{:else if snapshot.kind === 'quota'}<div class="value">
                    <span>{Math.round(remaining(snapshot))}% left</span><span
                      >{until(snapshot.resetsAt)}</span
                    >
                  </div>
                  <div
                    class="meter"
                    aria-label={`${snapshot.label}: ${Math.round(remaining(snapshot))}% remaining`}
                  >
                    <div
                      style:width={`${remaining(snapshot)}%`}
                      style:background={tone(snapshot)}
                    ></div>
                  </div>{:else}<p class="credits">
                    ${snapshot.remainingUsd?.toFixed(2) ?? '—'} remaining
                  </p>{/if}
              </div>{/each}{/if}
        </section>{/each}
    </div>
  {/if}
  <section class="more">
    <h2>More sources</h2>
    <p>
      <strong>Antigravity</strong> — its quota is only exposed through an unsupported local process interface.
    </p>
    <p>
      <strong>Browser-only ChatGPT and Claude</strong> — no personal API token is available to check browser
      usage from an extension.
    </p>
    <p>
      Set your OpenRouter key, menu bar, and notification preferences in Settings → Extensions → AI
      Usage.
    </p>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    color: var(--text-primary);
    background: var(--bg-primary);
    font-family: var(--font-ui);
  }
  .page {
    box-sizing: border-box;
    height: 100vh;
    overflow-y: auto;
    padding: var(--space-5);
  }
  .source,
  .label,
  .value {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  h2,
  p {
    margin: 0;
  }
  h2 {
    font-size: var(--font-size-md);
  }
  .source span,
  .label span,
  .value span:last-child {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }
  .grid {
    display: grid;
    gap: var(--space-4);
    margin-top: var(--space-5);
  }
  .card,
  .more {
    padding: var(--space-4);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
  }
  .reading {
    margin-top: var(--space-4);
  }
  .value {
    margin-top: var(--space-2);
  }
  .meter {
    height: var(--size-xs);
    margin-top: var(--space-2);
    overflow: hidden;
    border-radius: var(--radius-full);
    background: var(--bg-tertiary);
  }
  .meter > div {
    height: 100%;
  }
  .state,
  .credits {
    margin-top: var(--space-3);
    color: var(--text-secondary);
  }
  .error {
    margin-top: var(--space-5);
    color: var(--accent-danger);
  }
  .more {
    margin-top: var(--space-5);
  }
  .more p {
    margin-top: var(--space-3);
    color: var(--text-secondary);
  }
</style>
