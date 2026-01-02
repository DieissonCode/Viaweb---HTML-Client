// service-worker.js - Basic offline support for Viaweb application
const CACHE_NAME = 'viaweb-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/main.js',
    '/config.js',
    '/crypto.js',
    '/units-db.js',
    '/hot-reload.js',
    '/styles.css'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache when offline, otherwise fetch from network
self.addEventListener('fetch', (event) => {
    // Skip WebSocket connections and API calls when offline
    if (event.request.url.startsWith('ws://') || 
        event.request.url.startsWith('wss://') ||
        event.request.url.includes('/api/')) {
        return;
    }
    
    // Skip HEAD requests (cannot be cached)
    if (event.request.method === 'HEAD') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached response if available
                if (response) {
                    console.log('[SW] Serving from cache:', event.request.url);
                    return response;
                }

                // Otherwise fetch from network
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        // Add to cache for future offline use
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch(() => {
                        // Return offline page if available
                        console.log('[SW] Fetch failed, serving offline content');
                        return caches.match('/index.html');
                    });
            })
    );
});

// Message event - handle commands from the client
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            console.log('[SW] Cache cleared');
        });
    }
});
