/**
 * Tiny DOM builder used instead of JSX.
 *
 *   h('div', { class: 'card', style: { color: 'red' }, onclick: fn }, [child])
 *   s('circle', { cx: 10, cy: 20, r: 5, class: 'chart-point' })
 *
 * Supported option keys:
 *   class / className     → class attribute
 *   text                  → textContent
 *   html                  → innerHTML (never feed user input here)
 *   style                 → object, camelCase CSS names; '-'-prefixed and '--'
 *                           custom properties are set via setProperty
 *   dataset               → data-* attributes
 *   on*                   → event listener (onclick → 'click')
 *   anything else         → setAttribute (numbers are stringified, `true`
 *                           renders an empty/presence attribute, falsey
 *                           values (except 0) are skipped)
 */
window.YW = window.YW || {};

(function (YW) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function applyStyle(el, style) {
    Object.keys(style).forEach((prop) => {
      const value = style[prop];
      if (value === null || value === undefined) return;
      if (prop.indexOf('-') === 0) el.style.setProperty(prop, String(value));
      else el.style[prop] = value;
    });
  }

  function setOpt(el, key, value) {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class' || key === 'className') {
      el.setAttribute('class', value);
      return;
    }
    if (key === 'text') {
      el.textContent = String(value);
      return;
    }
    if (key === 'html') {
      el.innerHTML = value;
      return;
    }
    if (key === 'style') {
      applyStyle(el, value);
      return;
    }
    if (key === 'dataset') {
      Object.keys(value).forEach((k) => {
        el.dataset[k] = value[k];
      });
      return;
    }
    if (key.indexOf('on') === 0 && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
      return;
    }
    if (value === true) {
      el.setAttribute(key, '');
      return;
    }
    el.setAttribute(key, String(value));
  }

  /**
   * Append children to an element. Accepts a single node, a value (rendered as
   * a text node) or arbitrarily nested arrays of both.
   */
  function appendChildren(el, children) {
    const list = Array.isArray(children) ? children : [children];
    list.forEach((child) => {
      if (child === null || child === undefined || child === false || child === true) return;
      if (Array.isArray(child)) {
        appendChildren(el, child);
        return;
      }
      if (typeof child === 'object' && typeof child.nodeType === 'number') {
        el.appendChild(child);
        return;
      }
      el.appendChild(document.createTextNode(String(child)));
    });
  }

  /** Create an HTML element. */
  function h(tag, opts, children) {
    const el = document.createElement(tag);
    if (opts) Object.keys(opts).forEach((k) => setOpt(el, k, opts[k]));
    if (children !== undefined && children !== null) appendChildren(el, children);
    return el;
  }

  /** Create an SVG element (needs the SVG namespace, hence a separate helper). */
  function s(tag, opts, children) {
    const el = document.createElementNS(SVG_NS, tag);
    if (opts) Object.keys(opts).forEach((k) => setOpt(el, k, opts[k]));
    if (children !== undefined && children !== null) appendChildren(el, children);
    return el;
  }

  /** Remove all children of a node. */
  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /** Replace the children of a node with the given content. */
  function mount(node, children) {
    clear(node);
    if (children !== null && children !== undefined && children !== false) {
      appendChildren(node, children);
    }
    return node;
  }

  YW.dom = {
    h: h,
    s: s,
    clear: clear,
    mount: mount,
    SVG_NS: SVG_NS,
  };
})(window.YW);
