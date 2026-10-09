import { createRoot } from 'react-dom/client';
import { createPublicCatalogProvider, loadCatalog } from './catalog/catalog.ts';
import { createSameOriginPublicCatalogTransport } from './catalog/public-transport.ts';
import { openRepository } from './data/repository.ts';
import { probeStorage } from './data/storage-status.ts';
import { App } from './ui/App.tsx';
import './ui/styles.css';

const provider = createPublicCatalogProvider(createSameOriginPublicCatalogTransport());
const catalogLoader = () => loadCatalog(provider);
const root = createRoot(document.getElementById('root')!);
root.render(<p role="status" aria-live="polite" aria-atomic="true">正在打开本地记录…</p>);
async function start() {
  const [opened, storageStatus] = await Promise.all([
    openRepository({ factory: globalThis.indexedDB, now: () => new Date(), uuid: () => globalThis.crypto.randomUUID() }),
    probeStorage(),
  ]);
  if (!opened.ok) storageStatus.error = opened.error;
  root.render(<App repository={opened.ok ? opened.value : null} catalogLoader={catalogLoader} storageStatus={storageStatus} />);
}
void start();
