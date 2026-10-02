// Monday's Home Cafe - Service Worker v1

const CACHE_NAME = "mondays-cafe-v2";
const OFFLINE_URL = "/offline.html";

const OFFLINE_ASSETS = [
  "/offline.html",
  "/manifest.json",
  "/images/logo.png",
];

// INSTALL
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log("[SW] Installing v2...");

      // Cache each file separately so one missing file
      // does not cause the whole installation to fail.
      for (const file of OFFLINE_ASSETS) {
        try {
          await cache.add(file);
          console.log("[SW] Cached:", file);
        } catch (error) {
          console.error("[SW] Failed to cache:", file, error);
        }
      }

      await self.skipWaiting();
    }),
  );
});

// ACTIVATE
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (name) =>
                name.startsWith("mondays-cafe-") &&
                name !== CACHE_NAME,
            )
            .map((name) => {
              console.log("[SW] Removing old cache:", name);
              return caches.delete(name);
            }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// FETCH
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Only handle this website's requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Do NOT intercept PHP/API requests.
  if (
    url.pathname.includes("/api/") ||
    url.pathname.endsWith(".php")
  ) {
    return;
  }

  // ------------------------------------------
  // IMPORTANT:
  // PAGE NAVIGATION
  // ------------------------------------------
  //
  // If the user refreshes while offline,
  // ALWAYS show offline.html.
  //
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => {
        console.log("[SW] Offline navigation detected.");

        return caches.match(OFFLINE_URL).then((offlinePage) => {
          if (offlinePage) {
            console.log("[SW] Showing offline.html");
            return offlinePage;
          }

          // Emergency fallback if offline.html
          // somehow wasn't cached.
          return new Response(
            `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="UTF-8">
                <meta name="viewport"
                      content="width=device-width, initial-scale=1.0">
                <title>Offline - Monday's Home Cafe</title>
                <style>
                  body {
                    margin: 0;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    font-family: Arial, sans-serif;
                    background: #fff8ef;
                    color: #3b2418;
                  }

                  .box {
                    padding: 40px;
                  }

                  h1 {
                    font-size: 32px;
                  }

                  p {
                    font-size: 18px;
                  }
                </style>
              </head>

              <body>
                <div class="box">
                  <h1>You're Offline ☕</h1>
                  <p>
                    Monday's Home Cafe is currently offline.
                  </p>
                  <p>
                    Please reconnect to the internet and try again.
                  </p>
                </div>
              </body>
            </html>
            `,
            {
              status: 503,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
              },
            },
          );
        });
      }),
    );

    return;
  }

  // ------------------------------------------
  // offline.html
  // ------------------------------------------

  if (url.pathname === "/offline.html") {
    event.respondWith(
      caches.match(OFFLINE_URL).then((cached) => {
        return cached || fetch(request);
      }),
    );

    return;
  }

  // ------------------------------------------
  // JavaScript / CSS
  // ------------------------------------------

  if (
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css")
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();

            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => {
                return cache.put(request, copy);
              }),
            );
          }

          return response;
        })
        .catch(() => caches.match(request)),
    );

    return;
  }

  // ------------------------------------------
  // Images / other resources
  // ------------------------------------------

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();

            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => {
                return cache.put(request, copy);
              }),
            );
          }

          return response;
        })
        .catch(() => {
          return new Response("Offline - resource unavailable.", {
            status: 503,
            headers: {
              "Content-Type": "text/plain",
            },
          });
        });
    }),
  );
});