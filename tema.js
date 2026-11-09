// Tema claro/escuro: aplicado antes de desenhar a página (evita piscar em branco).
// Guarda a escolha neste navegador; sem escolha, segue o tema do sistema.
(function () {
  var r = document.documentElement, k = 'gsm-tema', v = null;
  try { v = localStorage.getItem(k); } catch (e) {}
  if (!v && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) v = 'escuro';
  if (v === 'escuro') r.setAttribute('data-theme', 'dark');
  // Impressão e PDF sempre no tema claro
  var antes = null;
  addEventListener('beforeprint', function () { antes = r.getAttribute('data-theme'); r.removeAttribute('data-theme'); });
  addEventListener('afterprint', function () { if (antes) r.setAttribute('data-theme', antes); antes = null; });
})();
