import { registerSW } from 'virtual:pwa-register';

export function registerPwaServiceWorker() {
  if ('serviceWorker' in navigator) {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        console.log('[PWA] Nueva versión detectada. Actualizando automáticamente...');
        updateSW(true);
      },
      onOfflineReady() {
        console.log('[PWA] Microapp lista para funcionar 100% Offline');
      },
    });
  }
}
