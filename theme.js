// Shared theme control for every Sparkjar page.
//
// Before this existed each page carried its own copy: app.html and reset.html
// read `spark_theme` and set `data-theme` on <html>, user.html read a separate
// `theme` key and toggled `body.dark`, and index/support/tos were hardcoded
// dark. Toggling on one page left the next one on the other theme. One file,
// loaded synchronously in <head>, keeps them in step -- no build step needed
// (CLAUDE.md), it is just a plain script tag.
//
// Contract for a page using this:
//   <script src="/theme.js"></script>   in <head>, before any painted markup
//   :root[data-theme="dark"] { ... }    and a matching [data-theme="light"]
//   <button data-theme-toggle>          optional; glyph and label are managed
//   <img data-shot-dark="..." data-shot-light="...">   optional; src follows
(function () {
    'use strict';

    var KEY = 'spark_theme';
    var LEGACY_KEY = 'theme';       // user.html's old key, migrated on first read
    var DEFAULT = 'dark';           // Sparkjar is dark-first: an unset preference stays dark
    var MOON = '&#9790;';
    var SUN = '&#9728;';
    var BAR = { dark: '#111111', light: '#fafafa' };

    // localStorage throws in Safari private mode rather than returning null.
    function readStored() {
        try {
            var stored = localStorage.getItem(KEY);
            if (stored) return stored;
            var legacy = localStorage.getItem(LEGACY_KEY);
            if (legacy === 'dark' || legacy === 'light') {
                localStorage.setItem(KEY, legacy);
                localStorage.removeItem(LEGACY_KEY);
                return legacy;
            }
        } catch (e) { /* storage unavailable -- fall through to the default */ }
        return null;
    }

    function store(theme) {
        try { localStorage.setItem(KEY, theme); } catch (e) { /* not fatal */ }
    }

    function resolve() {
        var stored = readStored();
        return (stored === 'dark' || stored === 'light') ? stored : DEFAULT;
    }

    var current = resolve();

    // Runs at <head> parse time so the first paint is already correct. The rest
    // of the DOM does not exist yet, hence the split with decorate() below.
    document.documentElement.setAttribute('data-theme', current);

    function paintBrowserChrome(theme) {
        var metas = document.querySelectorAll('meta[name="theme-color"]');
        for (var i = 0; i < metas.length; i++) {
            // Leave the media-scoped pair alone -- the browser picks between
            // those itself, and overwriting them would pin both to one colour.
            if (metas[i].getAttribute('media')) continue;
            metas[i].setAttribute('content', BAR[theme] || BAR.dark);
        }
        document.documentElement.style.colorScheme = theme;
    }

    function paintToggles(theme) {
        var buttons = document.querySelectorAll('[data-theme-toggle]');
        for (var i = 0; i < buttons.length; i++) {
            var next = theme === 'dark' ? 'light' : 'dark';
            buttons[i].innerHTML = theme === 'dark' ? MOON : SUN;
            buttons[i].setAttribute('title', 'Switch to ' + next + ' mode');
            buttons[i].setAttribute('aria-label', 'Switch to ' + next + ' mode');
        }
    }

    // Screenshots of the app are themed too: a light-mode phone shot on a dark
    // page was the mismatch that started all this.
    function paintShots(theme) {
        var shots = document.querySelectorAll('[data-shot-dark][data-shot-light]');
        for (var i = 0; i < shots.length; i++) {
            var src = shots[i].getAttribute(theme === 'dark' ? 'data-shot-dark' : 'data-shot-light');
            if (src && shots[i].getAttribute('src') !== src) shots[i].setAttribute('src', src);
        }
    }

    function paint(theme) {
        current = theme;
        document.documentElement.setAttribute('data-theme', theme);
        paintBrowserChrome(theme);
        paintToggles(theme);
        paintShots(theme);
    }

    function set(theme) {
        if (theme !== 'dark' && theme !== 'light') return;
        store(theme);
        paint(theme);
    }

    function toggle() {
        set(current === 'dark' ? 'light' : 'dark');
    }

    function decorate() {
        var buttons = document.querySelectorAll('[data-theme-toggle]');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener('click', toggle);
        }
        paint(current);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', decorate);
    } else {
        decorate();
    }

    // A toggle in one tab should not leave the other tab on the old theme.
    window.addEventListener('storage', function (e) {
        if (e.key === KEY && (e.newValue === 'dark' || e.newValue === 'light')) paint(e.newValue);
    });

    window.SparkTheme = { get: function () { return current; }, set: set, toggle: toggle };
    window.toggleTheme = toggle;   // pages still call this from markup
})();
