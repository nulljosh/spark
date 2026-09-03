// theme.js is the only thing keeping six pages on the same theme, and it runs
// in the browser with no module system, so it is exercised here against a
// hand-rolled stub of the handful of DOM APIs it touches. The stub is
// deliberately literal about selectors -- if theme.js starts querying
// something new, these tests should fail rather than silently pass.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = readFileSync(fileURLToPath(new URL('../theme.js', import.meta.url)), 'utf8');

function el(attrs = {}) {
    const node = {
        attrs: { ...attrs },
        innerHTML: '',
        handlers: {},
        getAttribute: k => (k in node.attrs ? node.attrs[k] : null),
        setAttribute: (k, v) => { node.attrs[k] = v; },
        addEventListener: (type, fn) => { (node.handlers[type] ||= []).push(fn); },
        click: () => (node.handlers.click || []).forEach(fn => fn())
    };
    return node;
}

// `nodes` maps the exact selector theme.js uses to the elements it should find.
function load({ stored = {}, nodes = {}, readyState = 'complete' } = {}) {
    const store = { ...stored };
    const localStorage = {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    };
    const root = el();
    root.style = {};
    const document = {
        documentElement: root,
        readyState,
        handlers: {},
        querySelectorAll: sel => nodes[sel] || [],
        addEventListener: (type, fn) => { (document.handlers[type] ||= []).push(fn); }
    };
    const window = { addEventListener: (type, fn) => { (window.handlers[type] ||= []).push(fn); }, handlers: {}, matchMedia: () => ({ matches: true, addEventListener() {} }) };
    new Function('window', 'document', 'localStorage', SOURCE)(window, document, localStorage);
    return { window, document, root, store };
}

const toggles = sel => ({ '[data-theme-toggle]': sel });

describe('theme.js', () => {
    it('defaults to dark when nothing is stored', () => {
        const { root, window } = load();
        expect(root.getAttribute('data-theme')).toBe('dark');
        expect(window.SparkTheme.get()).toBe('dark');
    });

    it('restores a stored preference', () => {
        const { root } = load({ stored: { spark_theme: 'light' } });
        expect(root.getAttribute('data-theme')).toBe('light');
    });

    it('ignores a stored value that is not a theme', () => {
        const { root } = load({ stored: { spark_theme: 'solarized' } });
        expect(root.getAttribute('data-theme')).toBe('dark');
    });

    // user.html used to keep its own `theme` key, which is why that page could
    // sit in light mode while the app was dark.
    it('migrates the legacy user.html key and clears it', () => {
        const { root, store } = load({ stored: { theme: 'light' } });
        expect(root.getAttribute('data-theme')).toBe('light');
        expect(store.spark_theme).toBe('light');
        expect(store.theme).toBeUndefined();
    });

    it('prefers the current key over the legacy one', () => {
        const { root } = load({ stored: { spark_theme: 'dark', theme: 'light' } });
        expect(root.getAttribute('data-theme')).toBe('dark');
    });

    it('applies the attribute before DOMContentLoaded fires', () => {
        // The <head> script has to paint the attribute immediately or the page
        // flashes the wrong theme.
        const { root } = load({ stored: { spark_theme: 'light' }, readyState: 'loading' });
        expect(root.getAttribute('data-theme')).toBe('light');
    });

    it('toggles, persists, and flips back', () => {
        const { window, root, store } = load();
        window.SparkTheme.toggle();
        expect(root.getAttribute('data-theme')).toBe('light');
        expect(store.spark_theme).toBe('light');
        window.SparkTheme.toggle();
        expect(root.getAttribute('data-theme')).toBe('dark');
        expect(store.spark_theme).toBe('dark');
    });

    it('rejects a set() to anything other than the two themes', () => {
        const { window, root } = load();
        window.SparkTheme.set('neon');
        expect(root.getAttribute('data-theme')).toBe('dark');
    });

    it('wires every [data-theme-toggle] button and labels it with the next theme', () => {
        const button = el({ 'data-theme-toggle': '' });
        const { root } = load({ nodes: toggles([button]) });
        expect(button.getAttribute('aria-label')).toBe('Switch to light mode');
        button.click();
        expect(root.getAttribute('data-theme')).toBe('light');
        expect(button.getAttribute('aria-label')).toBe('Switch to dark mode');
    });

    it('swaps theme-aware screenshots with the theme', () => {
        const shot = el({ 'data-shot-dark': '/d.png', 'data-shot-light': '/l.png' });
        const { window } = load({ nodes: { '[data-shot-dark][data-shot-light]': [shot] } });
        expect(shot.getAttribute('src')).toBe('/d.png');
        window.SparkTheme.toggle();
        expect(shot.getAttribute('src')).toBe('/l.png');
    });

    it('updates an unscoped theme-color meta but leaves the media-scoped ones alone', () => {
        const plain = el({ name: 'theme-color', content: '#111' });
        const scoped = el({ name: 'theme-color', content: '#fafafa', media: '(prefers-color-scheme: light)' });
        const { window } = load({ nodes: { 'meta[name="theme-color"]': [plain, scoped] } });
        window.SparkTheme.set('light');
        expect(plain.getAttribute('content')).toBe('#fafafa');
        expect(scoped.getAttribute('content')).toBe('#fafafa');
        expect(scoped.getAttribute('media')).toBe('(prefers-color-scheme: light)');
    });

    it('follows a toggle made in another tab', () => {
        const { window, root } = load();
        window.handlers.storage[0]({ key: 'spark_theme', newValue: 'light' });
        expect(root.getAttribute('data-theme')).toBe('light');
        window.handlers.storage[0]({ key: 'spark_token', newValue: 'light' });
        expect(root.getAttribute('data-theme')).toBe('light');
    });

    it('still works when localStorage throws', () => {
        // Safari private mode throws on both read and write.
        const root = el(); root.style = {};
        const document = {
            documentElement: root, readyState: 'complete', handlers: {},
            querySelectorAll: () => [], addEventListener: () => {}
        };
        const window = { addEventListener: () => {}, handlers: {}, matchMedia: () => ({ matches: true, addEventListener() {} }) };
        const hostile = {
            getItem: () => { throw new Error('denied'); },
            setItem: () => { throw new Error('denied'); },
            removeItem: () => { throw new Error('denied'); }
        };
        new Function('window', 'document', 'localStorage', SOURCE)(window, document, hostile);
        expect(root.getAttribute('data-theme')).toBe('dark');
        expect(() => window.SparkTheme.toggle()).not.toThrow();
        expect(root.getAttribute('data-theme')).toBe('light');
    });
});
