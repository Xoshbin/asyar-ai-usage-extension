import { mount } from 'svelte';
import { ExtensionContext, registerIconElement } from 'asyar-sdk/view';
import UsageView from './views/UsageView.svelte';

const extensionId = resolveExtensionId();
const context = new ExtensionContext();
context.setExtensionId(extensionId);
registerIconElement();
window.parent.postMessage({ type: 'asyar:extension:loaded', extensionId, role: 'view' }, '*');
mount(UsageView, { target: document.getElementById('app')!, props: { context } });

function resolveExtensionId(): string {
  const fallback = 'org.asyar.ai-usage';
  if (
    window.location.hostname === 'localhost' ||
    window.location.hostname === 'asyar-extension.localhost'
  )
    return window.location.pathname.split('/').filter(Boolean)[0] || fallback;
  return window.location.hostname || fallback;
}
