// groove_storage.js — localStorage wrapper for personal groove library
var grooveStorage = (function () {
    "use strict";

    var STORAGE_KEY = "GS_my_grooves";

    function load() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        } catch (e) {
            return [];
        }
    }

    function persist(grooves) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(grooves));
    }

    // Returns all grooves sorted newest-first.
    function getAll() {
        return load().sort(function (a, b) {
            return new Date(b.savedAt) - new Date(a.savedAt);
        });
    }

    // Upserts by name: replaces if name exists, appends if new.
    function save(groove) {
        var grooves = load();
        var idx = -1;
        for (var i = 0; i < grooves.length; i++) {
            if (grooves[i].name === groove.name) { idx = i; break; }
        }
        groove.savedAt = new Date().toISOString();
        if (idx >= 0) {
            grooves[idx] = groove;
        } else {
            grooves.push(groove);
        }
        persist(grooves);
    }

    function remove(name) {
        persist(load().filter(function (g) { return g.name !== name; }));
    }

    function getByName(name) {
        var all = load();
        for (var i = 0; i < all.length; i++) {
            if (all[i].name === name) return all[i];
        }
        return null;
    }

    // Returns a name that doesn't yet exist, by appending (imported), (imported 2), etc.
    function uniqueImportName(base, grooves) {
        var candidate = base + " (imported)";
        var n = 2;
        while (true) {
            var found = false;
            for (var i = 0; i < grooves.length; i++) {
                if (grooves[i].name === candidate) { found = true; break; }
            }
            if (!found) return candidate;
            candidate = base + " (imported " + n + ")";
            n++;
        }
    }

    // Merges an exported JSON string into the current library.
    // Returns { added: N, cloned: N }.
    function importJSON(json) {
        var data;
        try {
            data = JSON.parse(json);
        } catch (e) {
            throw new Error("Invalid JSON");
        }
        if (!data || !Array.isArray(data.grooves)) {
            throw new Error("Invalid format: missing grooves array");
        }
        var existing = load();
        var added = 0;
        var cloned = 0;
        data.grooves.forEach(function (g) {
            if (!g.name || !g.url) return;
            var hasName = false;
            for (var i = 0; i < existing.length; i++) {
                if (existing[i].name === g.name) { hasName = true; break; }
            }
            if (!hasName) {
                existing.push({
                    name: g.name,
                    artist: g.artist || "",
                    comment: g.comment || "",
                    url: g.url,
                    savedAt: g.savedAt || new Date().toISOString()
                });
                added++;
            } else {
                var cloneName = uniqueImportName(g.name, existing);
                existing.push({
                    name: cloneName,
                    artist: g.artist || "",
                    comment: g.comment || "",
                    url: g.url,
                    savedAt: new Date().toISOString()
                });
                cloned++;
            }
        });
        persist(existing);
        return { added: added, cloned: cloned };
    }

    // Returns a JSON string suitable for download.
    function exportJSON() {
        return JSON.stringify({
            version: 1,
            exported: new Date().toISOString(),
            grooves: load()
        }, null, 2);
    }

    return {
        getAll: getAll,
        save: save,
        remove: remove,
        getByName: getByName,
        importJSON: importJSON,
        exportJSON: exportJSON
    };
})();
