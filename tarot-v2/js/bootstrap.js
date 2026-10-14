// Show a recoverable message if the 3D runtime cannot initialize.
(() => {
  function failed() {
    const veil = document.getElementById('loading-veil');
    if (!veil || veil.dataset.failed) return;
    veil.dataset.failed = 'true'; veil.classList.remove('hidden');
    veil.querySelector('.loader-ring')?.remove();
    const text = veil.querySelector('.loader-text');
    text.textContent = 'Chưa mở được không gian 3D. Bạn thử tải lại hoặc bật tăng tốc phần cứng trong trình duyệt nhé.';
    text.style.maxWidth = '300px'; text.style.lineHeight = '1.8'; text.style.textAlign = 'center';
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'outline-button';
    retry.textContent = 'Tải lại'; retry.addEventListener('click', () => location.reload()); veil.appendChild(retry);
  }
  window.addEventListener('error', event => {
    if (!window.TarotExperience && String(event.filename).includes('/js/engine.js')) failed();
  });
  document.addEventListener('DOMContentLoaded', () => { if (!window.TarotExperience) failed(); });
})();
