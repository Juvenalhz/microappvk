import { registerSW } from 'virtual:pwa-register';

export function registerPwaServiceWorker() {
  if ('serviceWorker' in navigator) {
    const updateSW = registerSW({
      onNeedRefresh() {
        console.log('[PWA] Nueva versión disponible. Actualizando en segundo plano...');
      },
      onOfflineReady() {
        console.log('[PWA] Microapp lista para funcionar 100% Offline');
      },
    });
  }
}
