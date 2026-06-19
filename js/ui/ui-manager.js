import { UIScreens, UISelectors } from './screens.js';

export class UIManager {
    constructor() {
        this.cache = new Map();
        this.handlers = new Map();
    }

    getElement(id) {
        if (id instanceof Element) {
            return id;
        }
        if (!this.cache.has(id)) {
            const el = document.getElementById(id);
            if (el) this.cache.set(id, el);
        }
        return this.cache.get(id) || null;
    }

    getRequiredElement(id) {
        const el = this.getElement(id);
        if (!el) {
            throw new Error(`UIManager: required element not found: ${id}`);
        }
        return el;
    }

    showScreen(screenId) {
        document.querySelectorAll(UISelectors.screen).forEach(screen => {
            screen.classList.remove(UISelectors.active);
        });
        const screen = this.getElement(screenId);
        if (screen) {
            screen.classList.add(UISelectors.active);
        }
    }

    setModalVisible(modalId, visible) {
        const modal = this.getElement(modalId);
        if (!modal) return;
        modal.classList.toggle(UISelectors.active, visible);
    }

    closeAllModals() {
        document.querySelectorAll(`${UISelectors.modalOverlay}.${UISelectors.active}`).forEach(modal => {
            modal.classList.remove(UISelectors.active);
        });
    }

    setText(id, text) {
        const el = this.getElement(id);
        if (!el) return;
        el.textContent = text;
    }

    setHTML(id, html) {
        const el = this.getElement(id);
        if (!el) return;
        el.innerHTML = html;
    }

    setVisible(id, visible) {
        const el = this.getElement(id);
        if (!el) return;
        el.classList.toggle(UISelectors.hidden, !visible);
    }

    toggleClass(id, className, add) {
        const el = this.getElement(id);
        if (!el) return;
        el.classList.toggle(className, add);
    }

    attachListener(id, event, handler) {
        const el = this.getElement(id);
        if (!el) return () => { };

        const wrappedHandler = handler.bind(this);
        el.addEventListener(event, wrappedHandler);

        const key = `${id}:${event}`;
        if (!this.handlers.has(key)) {
            this.handlers.set(key, []);
        }
        this.handlers.get(key).push({ el, event, wrappedHandler });

        return () => el.removeEventListener(event, wrappedHandler);
    }

    attachDelegatedListener(containerId, selector, event, handler) {
        const container = this.getElement(containerId);
        if (!container) return () => { };

        const delegatedHandler = eventObject => {
            const target = eventObject.target.closest(selector);
            if (target) {
                handler(eventObject, target);
            }
        };

        container.addEventListener(event, delegatedHandler);

        const key = `${containerId}:delegated:${event}`;
        if (!this.handlers.has(key)) {
            this.handlers.set(key, []);
        }
        this.handlers.get(key).push({ el: container, event, wrappedHandler: delegatedHandler });

        return () => container.removeEventListener(event, delegatedHandler);
    }

    bindImage(elementId, char, options = {}) {
        const el = this.getElement(elementId);
        if (!el || !('src' in el)) return;
        const url = char?.imgUrl || null;
        const loader = el.parentElement?.querySelector('.img-loader');
        const placeholder = el.parentElement?.querySelector('.card-img-placeholder') || el.parentElement?.querySelector('.mystery-card-emoji');

        if (url) {
            el.src = url;
            el.classList.add('loading');
            el.onload = () => {
                el.classList.remove('loading');
                if (loader) loader.style.display = 'none';
                if (placeholder && options.hidePlaceholder) placeholder.style.display = 'none';
            };
            el.onerror = () => {
                if (loader) loader.style.display = 'none';
                if (placeholder) placeholder.style.display = 'flex';
            };
        } else {
            if (loader) loader.style.display = 'none';
            if (placeholder) placeholder.style.display = 'flex';
        }
    }

    showToast(message, durationMs = 2500) {
        const toast = this.getElement(UISelectors.toast);
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), durationMs);
    }

    cleanup() {
        this.handlers.forEach(list => {
            list.forEach(({ el, event, wrappedHandler }) => {
                el.removeEventListener(event, wrappedHandler);
            });
        });
        this.handlers.clear();
    }

    invalidateCache() {
        this.cache.clear();
    }
}

export class ImageLoader {
    static getCharImage(charObj) {
        return charObj ? (charObj.imgUrl || null) : null;
    }

    static async preload(charItems = []) {
        return Promise.all(charItems.map(charObj => new Promise(resolve => {
            if (!charObj || !charObj.imgUrl) return resolve();
            const img = new Image();
            img.onload = resolve;
            img.onerror = resolve;
            img.src = charObj.imgUrl;
        })));
    }

    static bind(imgEl, char, options = {}) {
        const url = this.getCharImage(char);
        const loader = imgEl.parentElement?.querySelector('.img-loader');
        const placeholder = imgEl.parentElement?.querySelector('.card-img-placeholder') || imgEl.parentElement?.querySelector('.mystery-card-emoji');

        if (url) {
            imgEl.src = url;
            imgEl.onload = () => {
                imgEl.classList.remove('loading');
                if (loader) loader.style.display = 'none';
                if (placeholder && options.hidePlaceholder) placeholder.style.display = 'none';
            };
            imgEl.onerror = () => {
                if (loader) loader.style.display = 'none';
                if (placeholder) placeholder.style.display = 'flex';
            };
        } else {
            if (loader) loader.style.display = 'none';
            if (placeholder) placeholder.style.display = 'flex';
        }
    }
}
