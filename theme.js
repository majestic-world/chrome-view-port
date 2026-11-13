// Loaded synchronously in <head> so the saved theme applies before first paint.
document.documentElement.dataset.theme = localStorage.getItem('vplab:theme') === 'light' ? 'light' : 'dark';
