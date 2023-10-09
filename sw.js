var version = '1.0.0';

self.addEventListener('install?timestamp=' + timeStamp, function(e) {
  var timeStamp = Date.now();
  e.waitUntil(
    caches.open('leocaseiro.github.io').then(function(cache) {
      return cache.addAll([
        '/',
        '/index.html',
        '/GrooveScribe/',
        '/GrooveScribe/css/groove_display_orange.css',
        '/GrooveScribe/css/groove_writer_orange.css',
        '/GrooveScribe/css/share-button.min.css',
        '/GrooveScribe/font-awesome/4.7.0/css/font-awesome.min.css',
        '/GrooveScribe/font-awesome/4.7.0/fonts/fontawesome-webfont.woff2?v=4.7.0',
        '/GrooveScribe/images/GScribe_Logo_lone_g.svg',
        '/GrooveScribe/images/GScribe_Logo_word_stack.svg',
        '/GrooveScribe/images/gscribe-icon-96.png',
        '/GrooveScribe/js/abc2svg-1.js',
        '/GrooveScribe/js/groove_utils.js',
        '/GrooveScribe/js/groove_writer.js',
        '/GrooveScribe/js/grooves.js',
        '/GrooveScribe/js/jsmidgen.js',
        '/GrooveScribe/js/pablo.min.js',
        '/GrooveScribe/js/share-button.min.js',
        '/GrooveScribe/MIDI.js/inc/Base64.js',
        '/GrooveScribe/MIDI.js/inc/base64binary.js',
        '/GrooveScribe/MIDI.js/inc/DOMLoader.XMLHttp.js',
        '/GrooveScribe/MIDI.js/inc/jasmid/midifile.js',
        '/GrooveScribe/MIDI.js/inc/jasmid/replayer.js',
        '/GrooveScribe/MIDI.js/inc/jasmid/stream.js',
        '/GrooveScribe/MIDI.js/js/MIDI/AudioDetect.js',
        '/GrooveScribe/MIDI.js/js/MIDI/LoadPlugin.js',
        '/GrooveScribe/MIDI.js/js/MIDI/Player.js',
        '/GrooveScribe/MIDI.js/js/MIDI/Plugin.js',
        '/GrooveScribe/soundfont/gunshot-ogg.js',
      ])
      .then(function() {
        return self.skipWaiting();
      });
    })
  )
});

self.addEventListener('activate?timestamp=' + timeStamp, function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch?timestamp=' + timeStamp, function(event) {
  event.respondWith(
    caches.match(event.request, {ignoreSearch:true}).then(function(response) {
      return response || fetch(event.request);
    })
  );
});