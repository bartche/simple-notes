const CACHE_NAME = 'notes-pwa-cache-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/imgs/icon.png',
  '/imgs/icon-192x192.png',
  '/imgs/icon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Evento de Instalação: Salva os arquivos essenciais em cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache aberto. Adicionando URLs ao cache.');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// Evento de Fetch: Intercepta as requisições
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Se a resposta estiver no cache, retorna a versão do cache
        if (response) {
          return response;
        }
        // Se não, busca na rede
        return fetch(event.request);
      })
  );
});

// Evento de Ativação: Limpa caches antigos
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deletando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
