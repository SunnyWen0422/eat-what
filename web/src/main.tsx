import { createRoot } from 'react-dom/client';
import { createPublicCatalogProvider, loadCatalog } from './catalog/catalog.ts';
import { createSameOriginPublicCatalogTransport } from './catalog/public-transport.ts';
import { initializeStorage } from './startup.ts';
import { App } from './ui/App.tsx';
import './ui/styles.css';

const provider = createPublicCatalogProvider(createSameOriginPublicCatalogTransport());
const catalogLoader = () => loadCatalog(provider);
const root = createRoot(document.getElementById('root')!);
root.render(<p role="status" aria-live="polite" aria-atomic="true">正在打开本地记录…</p>);
async function start() {
  const { repository, storageStatus } = await initializeStorage();
  root.render(<App repository={repository} catalogLoader={catalogLoader} storageStatus={storageStatus} />);
}
void start();
