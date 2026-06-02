// Открываем приложение в новой вкладке при клике на кнопку
document.getElementById('openApp')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  window.close(); // Закрываем popup
});
