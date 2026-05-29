// install.js — "Add to Desktop" PWA install: a menu item + a dismissible banner.
// Both only appear when the app is installable (Chromium fires beforeinstallprompt
// only when it's not already installed and we're in a secure context).

(function () {
  let deferredPrompt = null;

  const isInstalled = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const $ = (id) => document.getElementById(id);

  function showBanner() {
    if (isInstalled()) return;
    const b = $('install-banner');
    if (b) b.classList.remove('hidden');
  }
  function hideBanner() {
    const b = $('install-banner');
    if (b) b.classList.add('hidden');
  }

  async function doInstall() {
    const dd = $('menu-dropdown');
    if (dd) dd.classList.add('hidden');

    if (!deferredPrompt) {
      // Already installed, unsupported browser, or prompt not ready yet.
      if (typeof showToast === 'function') {
        showToast('To add it, use the install icon in your browser’s address bar.');
      }
      return;
    }
    deferredPrompt.prompt();
    let outcome = 'dismissed';
    try { ({ outcome } = await deferredPrompt.userChoice); } catch (e) {}
    deferredPrompt = null;
    hideBanner();
    if (outcome === 'accepted' && typeof showToast === 'function') {
      showToast('Added to your desktop! 🌴');
    }
  }

  // Browser signals the app can be installed → stash the event and show the pop.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showBanner();
  });

  // Already added — clean up the prompts.
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideBanner();
    const m = $('install-btn');
    if (m) m.style.display = 'none';
    if (typeof showToast === 'function') showToast('Added to your desktop! 🌴');
  });

  function wire() {
    if (isInstalled()) {
      const m = $('install-btn');
      if (m) m.style.display = 'none';
      hideBanner();
      return;
    }
    const m = $('install-btn');
    if (m) m.addEventListener('click', doInstall);
    const add = $('install-banner-btn');
    if (add) add.addEventListener('click', doInstall);
    const x = $('install-banner-close');
    if (x) x.addEventListener('click', hideBanner);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
