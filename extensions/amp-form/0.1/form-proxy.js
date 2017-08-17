/**
 * Copyright 2016 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {dev} from '../../../src/log';
import {parseUrl} from '../../../src/url';
import {startsWith} from '../../../src/string';


/**
 * Blacklisted properties. Used mainly fot testing.
 * @type {?Array<string>}
 */
let blacklistedProperties = null;


/**
 * @param {?Array<string>} properties
 * @visibleForTesting
 */
export function setBlacklistedPropertiesForTesting(properties) {
  blacklistedProperties = properties;
}


/**
 * Creates a proxy object `form.$p` that proxies all of the methods and
 * properties to the original DOM APIs. This is to work around the problematic
 * forms feature where inputs mask DOM APIs.
 *
 * E.g. a `<input id="id">` will override `form.id` from the original DOM API.
 * Form proxy will give access to the original `id` value via `form.$p.id`.
 *
 * See https://medium.com/@dvoytenko/solving-conflicts-between-form-inputs-and-dom-api-535c45333ae4
 *
 * @param {!HTMLFormElement} form
 * @return {!Object}
 */
export function installFormProxy(form) {
  const constr = getFormProxyConstr(form.ownerDocument.defaultView);
  const proxy = new constr(form);
  if (!('action' in proxy)) {
    setupLegacyProxy(form, proxy);
  }
  form['$p'] = proxy;
  return proxy;
}


/**
 * @param {!Window} win
 * @return {function(new:Object, !HTMLFormElement)}
 */
function getFormProxyConstr(win) {
  if (!win.FormProxy) {
    win.FormProxy = createFormProxyConstr(win);
  }
  return win.FormProxy;
}


/**
 * @param {!Window} win
 * @return {function(new:Object, !HTMLFormElement)}
 */
function createFormProxyConstr(win) {

  /**
   * @param {!HTMLFormElement} form
   * @constructor
   */
  function FormProxy(form) {
    /** @private @const {!HTMLFormElement} */
    this.form_ = form;
  }

  const FormProxyProto = FormProxy.prototype;

  // Hierarchy:
  //   Node  <==  Element <== HTMLElement <== HTMLFormElement
  //   EventTarget  <==  HTMLFormElement
  const inheritance = [
    win.HTMLFormElement,
    win.HTMLElement,
    win.Element,
    win.Node,
    win.EventTarget,
  ];
  inheritance.forEach(function(klass) {
    const prototype = klass && klass.prototype;
    for (const name in prototype) {
      const property = win.Object.getOwnPropertyDescriptor(prototype, name);
      if (!property ||
          // Exclude constants.
          name.toUpperCase() == name ||
          // Exclude on-events.
          startsWith(name, 'on') ||
          // Exclude properties that already been created.
          win.Object.prototype.hasOwnProperty.call(FormProxyProto, name) ||
          // Exclude some properties. Currently only used for testing.
          blacklistedProperties && blacklistedProperties.indexOf(name) != -1) {
        continue;
      }
      if (typeof property.value == 'function') {
        // A method call. Call the original prototype method via `call`.
        const method = property.value;
        FormProxyProto[name] = function() {
          return method.apply(this.form_, arguments);
        };
      } else {
        // A read/write property. Call the original prototype getter/setter.
        const spec = {};
        if (property.get) {
          spec.get = function() {
            return property.get.call(this.form_);
          };
        }
        if (property.set) {
          spec.set = function(value) {
            return property.set.call(this.form_, value);
          };
        }
        win.Object.defineProperty(FormProxyProto, name, spec);
      }
    }
  });

  return FormProxy;
}


/**
 * This is a very heavy-handed way to support browsers that do not have
 * properties defined in the prototype chain. Specifically, this is necessary
 * for Chrome 45 and under.
 *
 * See https://developers.google.com/web/updates/2015/04/DOM-attributes-now-on-the-prototype-chain
 * for more info.
 *
 * @param {!HTMLFormElement} form
 * @param {!Object} proxy
 */
function setupLegacyProxy(form, proxy) {
  const win = form.ownerDocument.defaultView;
  const proto = win.HTMLFormElement.prototype.cloneNode.call(
      form, /* deep */ false);
  for (const name in proto) {
    if (name in proxy ||
        // Exclude constants.
        name.toUpperCase() == name ||
        // Exclude on-events.
        startsWith(name, 'on')) {
      continue;
    }
    const desc = LEGACY_PROPS[name];
    const current = form[name];
    if (desc) {
      if (desc.access == LegacyPropAccessType.READ_ONCE) {
        // A property such as `style`. The only way is to read this value
        // once and use it for all subsequent calls.
        let actual;
        if (current && current.nodeType) {
          // The overriding input, if present, has to be removed and re-added
          // (renaming does NOT work). Completely insane, I know.
          const element = dev().assertElement(current);
          const nextSibling = element.nextSibling;
          const parent = element.parentNode;
          parent.removeChild(element);
          try {
            actual = form[name];
          } finally {
            parent.insertBefore(element, nextSibling);
          }
        } else {
          actual = current;
        }
        Object.defineProperty(proxy, name, {
          get() {
            return actual;
          },
        });
      } else if (desc.access == LegacyPropAccessType.ATTR) {
        // An attribute-based property. We can use DOM API to read and write
        // with a minimal type conversion.
        const attr = desc.attr || name;
        Object.defineProperty(proxy, name, {
          get() {
            let value = proxy.getAttribute(attr);
            if (value == null && desc.def !== undefined) {
              value = desc.def;
            } else if (desc.type == LegacyPropDataType.BOOL) {
              value = (value === 'true');
            } else if (desc.type == LegacyPropDataType.TOGGLE) {
              value = (value != null);
            } else if (desc.type == LegacyPropDataType.URL) {
              // URLs, e.g. in `action` attribute are resolved against the
              // document's base.
              value = parseUrl(/** @type {string} */ (value || '')).href;
            }
            return value;
          },
          set(value) {
            if (desc.type == LegacyPropDataType.TOGGLE) {
              if (value) {
                value = '';
              } else {
                value = null;
              }
            }
            if (value != null) {
              proxy.setAttribute(attr, value);
            } else {
              proxy.removeAttribute(attr);
            }
          },
        });
      } else {
        dev().assert(false, 'unknown property access type: %s', desc.access);
      }
    } else {
      // Not a known property - proxy directly.
      Object.defineProperty(proxy, name, {
        get() {
          return form[name];
        },
        set(value) {
          form[name] = value;
        },
      });
    }
  }
}


/**
 * @enum {number}
 */
const LegacyPropAccessType = {
  ATTR: 1,
  READ_ONCE: 2,
};


/**
 * @enum {number}
 */
const LegacyPropDataType = {
  URL: 1,
  BOOL: 2,
  TOGGLE: 3,
};


/**
 * @const {!Object<string, {
 *   access: !LegacyPropAccessType,
 *   attr: (string|undefined),
 *   type: (LegacyPropDataType|undefined),
 *   def: *,
 * }>}
 */
const LEGACY_PROPS = {
  'acceptCharset': {
    access: LegacyPropAccessType.ATTR,
    attr: 'accept-charset',
  },
  'accessKey': {
    access: LegacyPropAccessType.ATTR,
    attr: 'accesskey',
  },
  'action': {
    access: LegacyPropAccessType.ATTR,
    type: LegacyPropDataType.URL,
  },
  'attributes': {
    access: LegacyPropAccessType.READ_ONCE,
  },
  'autocomplete': {
    access: LegacyPropAccessType.ATTR,
    def: 'on',
  },
  'children': {
    access: LegacyPropAccessType.READ_ONCE,
  },
  'dataset': {
    access: LegacyPropAccessType.READ_ONCE,
  },
  'dir': {
    access: LegacyPropAccessType.ATTR,
  },
  'draggable': {
    access: LegacyPropAccessType.ATTR,
    type: LegacyPropDataType.BOOL,
    def: false,
  },
  'elements': {
    access: LegacyPropAccessType.READ_ONCE,
  },
  'encoding': {
    access: LegacyPropAccessType.READ_ONCE,
  },
  'enctype': {
    access: LegacyPropAccessType.ATTR,
  },
  'hidden': {
    access: LegacyPropAccessType.ATTR,
    type: LegacyPropDataType.TOGGLE,
    def: false,
  },
  'id': {
    access: LegacyPropAccessType.ATTR,
    def: '',
  },
  'lang': {
    access: LegacyPropAccessType.ATTR,
  },
  'localName': {
    access: LegacyPropAccessType.READ_ONCE,
  },
  'method': {
    access: LegacyPropAccessType.ATTR,
    def: 'get',
  },
  'name': {
    access: LegacyPropAccessType.ATTR,
  },
  'noValidate': {
    access: LegacyPropAccessType.ATTR,
    attr: 'novalidate',
    type: LegacyPropDataType.TOGGLE,
    def: false,
  },
  'prefix': {
    access: LegacyPropAccessType.READ_ONCE,
  },
  'spellcheck': {
    access: LegacyPropAccessType.ATTR,
  },
  'style': {
    access: LegacyPropAccessType.READ_ONCE,
  },
  'target': {
    access: LegacyPropAccessType.ATTR,
    def: '',
  },
  'title': {
    access: LegacyPropAccessType.ATTR,
  },
  'translate': {
    access: LegacyPropAccessType.ATTR,
  },
};
