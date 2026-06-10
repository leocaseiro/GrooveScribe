var version = '1.2.4';
var timeStamp = Date.now();
var coreID = 'leocaseiro.github.io' + version;
var cacheIDs = [coreID];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(coreID).then(function(cache) {
      // Precache the app shell. Paths are relative to this sw.js (the app root),
      // so they resolve on BOTH GitHub Pages (/GrooveScribe/) and a local server
      // at the domain root (e.g. http://127.0.0.1:3000/). Absolute /GrooveScribe/
      // paths 404 locally, which rejects addAll and blocks SW install entirely.
      return cache.addAll([
        './?timestamp=' + timeStamp,
        './index.html?timestamp=' + timeStamp,
        './css/groove_display_orange.css?timestamp=' + timeStamp,
        './css/groove_writer_orange.css?timestamp=' + timeStamp,
        './css/share-button.min.css?timestamp=' + timeStamp,
        './font-awesome/4.7.0/css/font-awesome.min.css?timestamp=' + timeStamp,
        './font-awesome/4.7.0/fonts/fontawesome-webfont.woff2?v=4.7.0?timestamp=' + timeStamp,
        './images/GScribe_Logo_lone_g.svg?timestamp=' + timeStamp,
        './images/GScribe_Logo_word_stack.svg?timestamp=' + timeStamp,
        './images/gscribe-icon-96.png?timestamp=' + timeStamp,
        './js/abc2svg-1.js?timestamp=' + timeStamp,
        './js/groove_utils.js?timestamp=' + timeStamp,
        './js/alphatab_loader.js?timestamp=' + timeStamp,
        './js/groove_to_guitarpro.js?timestamp=' + timeStamp,
        './js/groove_practices.js?timestamp=' + timeStamp,
        './js/groove_writer.js?timestamp=' + timeStamp,
        './js/grooves.js?timestamp=' + timeStamp,
        './js/jsmidgen.js?timestamp=' + timeStamp,
        './js/pablo.min.js?timestamp=' + timeStamp,
        './js/share-button.min.js?timestamp=' + timeStamp,
        './MIDI.js/inc/Base64.js?timestamp=' + timeStamp,
        './MIDI.js/inc/base64binary.js?timestamp=' + timeStamp,
        './MIDI.js/inc/DOMLoader.XMLHttp.js?timestamp=' + timeStamp,
        './MIDI.js/inc/jasmid/midifile.js?timestamp=' + timeStamp,
        './MIDI.js/inc/jasmid/replayer.js?timestamp=' + timeStamp,
        './MIDI.js/inc/jasmid/stream.js?timestamp=' + timeStamp,
        './MIDI.js/js/MIDI/AudioDetect.js?timestamp=' + timeStamp,
        './MIDI.js/js/MIDI/LoadPlugin.js?timestamp=' + timeStamp,
        './MIDI.js/js/MIDI/Player.js?timestamp=' + timeStamp,
        './MIDI.js/js/MIDI/Plugin.js?timestamp=' + timeStamp,
        './soundfont/gunshot-ogg.js?timestamp=' + timeStamp,
      ])
      .then(function() {
        return self.skipWaiting();
      });
    })
  )
});

self.addEventListener('activate', function (event) {
	event.waitUntil(caches.keys().then(function (keys) {
		return Promise.all(keys.filter(function (key) {
			return !cacheIDs.includes(key);
		}).map(function (key) {
			return caches.delete(key);
		}));
	}).then(function () {
		return self.clients.claim();
	}));
});

// NOTE: keep this URL in sync with ALPHATAB_CDN_URL in js/groove_writer.js (also bump
// the SRI there). A version mismatch silently breaks offline export (SW caches a URL
// the app never requests).
var ALPHATAB_CDN_URL = 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.3/dist/alphaTab.min.js';

self.addEventListener('fetch', function(event) {
  // Runtime-cache the alphaTab CDN bundle so Guitar Pro export works offline
  // after the first use. jsDelivr is CORS-enabled, so the response is non-opaque.
  if (event.request.url === ALPHATAB_CDN_URL) {
    event.respondWith(
      caches.open(coreID).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          return cached || fetch(event.request).then(function(response) {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }
  event.respondWith(
    caches.match(event.request, {ignoreSearch:true}).then(function(response) {
      return response || fetch(event.request);
    })
  );
});
