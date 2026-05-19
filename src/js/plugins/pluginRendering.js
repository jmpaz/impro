import { lightningBoltIconTemplate } from "/js/templates/icons/lightningBoltIcon.template.js";
import "/js/components/toggle-switch.js";

const ALLOWED_TAGS = [
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "code",
  "pre",
  "br",
  "hr",
  "button",
  "input",
  "select",
  "option",
  "label",
  "textarea",
];

const ALLOWED_EVENTS = ["click", "change", "input"];

function isAllowedTag(tag) {
  return ALLOWED_TAGS.includes(tag);
}

const ALLOWED_ATTRS = [
  "class",
  "title",
  "role",
  "lang",
  "dir",
  "type",
  "value",
  "placeholder",
  "checked",
  "selected",
  "disabled",
  "name",
  "for",
  "id",
];

function isAllowedAttr(name) {
  return (
    ALLOWED_ATTRS.includes(name) ||
    name.startsWith("data-") ||
    name.startsWith("aria-")
  );
}

const PLUGIN_ICON_TEMPLATES = {
  "lightning-bolt": lightningBoltIconTemplate,
};

function createVirtualEvent(e) {
  const target = e.target ?? {};
  const virtualTarget = {};
  if (typeof target.value === "string") virtualTarget.value = target.value;
  if (typeof target.checked === "boolean") {
    virtualTarget.checked = target.checked;
  }
  return {
    type: e.type,
    target: virtualTarget,
  };
}

const HANDLER_MAP = Symbol("pluginHandlerMap");

function resolveTag(node, pluginId) {
  let tag = typeof node.tag === "string" ? node.tag.toLowerCase() : "div";
  if (!isAllowedTag(tag)) {
    if (pluginId !== undefined) {
      console.warn(
        `[plugins] "${pluginId}" tried to render disallowed tag <${tag}>`,
      );
    }
    tag = "span";
  }
  if (tag === "input" && node.attrs?.type === "checkbox") tag = "toggle-switch";
  return tag;
}

// Render a serialized VirtualEl node ({ tag, attrs, text, children }) into a
// real element. Text and children are mutually exclusive on
// the worker side (setText() clears children).
export class PluginRenderer {
  constructor(pluginBridge, pluginId) {
    this.pluginBridge = pluginBridge;
    this.pluginId = pluginId;
  }

  createRoot() {
    const renderer = this;
    const pluginId = this.pluginId;
    return {
      tree: null,
      el: null,
      render(node) {
        if (this.el && renderer._sameType(this.tree, node)) {
          renderer._patch(this.el, this.tree, node, pluginId);
        } else {
          this.el = renderer._create(node, pluginId);
        }
        this.tree = node;
        return this.el;
      },
    };
  }

  _sameType(oldNode, newNode) {
    if (!oldNode || !newNode) return false;
    return resolveTag(oldNode) === resolveTag(newNode);
  }

  _create(node, pluginId) {
    const tag = resolveTag(node, pluginId);
    const element = document.createElement(tag);
    if (tag === "toggle-switch") {
      // toggle-switch is controlled — flip its state here since the plugin
      // worker can't observe events synchronously to re-render.
      element.addEventListener("change", (event) => {
        element.checked = event.detail?.checked ?? !element.checked;
      });
    }
    if (node.attrs) {
      for (const [name, value] of Object.entries(node.attrs)) {
        if (!isAllowedAttr(name)) {
          console.warn(
            `[plugins] "${pluginId}" tried to set disallowed attribute "${name}" on <${tag}>`,
          );
          continue;
        }
        element.setAttribute(name, String(value));
      }
    }
    this._patchEvents(element, null, node.events, pluginId);
    if (node.text != null) {
      element.textContent = node.text;
    } else if (Array.isArray(node.children)) {
      for (const child of node.children) {
        element.appendChild(this._create(child, pluginId));
      }
    }
    return element;
  }

  _patch(element, oldNode, newNode, pluginId) {
    const oldAttrs = oldNode.attrs ?? {};
    const newAttrs = newNode.attrs ?? {};
    const isFocused = document.activeElement === element;

    for (const name of Object.keys(oldAttrs)) {
      if (!(name in newAttrs) && isAllowedAttr(name)) {
        element.removeAttribute(name);
      }
    }
    for (const [name, value] of Object.entries(newAttrs)) {
      if (!isAllowedAttr(name)) {
        console.warn(
          `[plugins] "${pluginId}" tried to set disallowed attribute "${name}"`,
        );
        continue;
      }
      // Don't clobber what the user is currently editing.
      if (isFocused && (name === "value" || name === "checked")) continue;
      if (oldAttrs[name] !== value) element.setAttribute(name, String(value));
    }

    this._patchEvents(element, oldNode.events, newNode.events, pluginId);

    if (newNode.text != null) {
      if (newNode.text !== oldNode.text) element.textContent = newNode.text;
      return;
    }

    const oldChildren = Array.isArray(oldNode.children) ? oldNode.children : [];
    const newChildren = Array.isArray(newNode.children) ? newNode.children : [];
    // If old node had text, clear it before reconciling children.
    if (oldNode.text != null) {
      element.textContent = "";
    }
    const domChildren = Array.from(element.childNodes);
    const max = Math.max(oldChildren.length, newChildren.length);
    for (let index = 0; index < max; index++) {
      const oldChild = oldChildren[index];
      const newChild = newChildren[index];
      const domChild = domChildren[index];
      if (!oldChild && newChild) {
        element.appendChild(this._create(newChild, pluginId));
      } else if (oldChild && !newChild) {
        if (domChild) element.removeChild(domChild);
      } else if (this._sameType(oldChild, newChild)) {
        this._patch(domChild, oldChild, newChild, pluginId);
      } else {
        element.replaceChild(this._create(newChild, pluginId), domChild);
      }
    }
  }

  _patchEvents(element, oldEvents, newEvents, pluginId) {
    const map = (element[HANDLER_MAP] ??= {});
    const next = newEvents && typeof newEvents === "object" ? newEvents : {};
    if (oldEvents) {
      for (const name of Object.keys(oldEvents)) {
        if (!(name in next)) delete map[name];
      }
    }
    for (const [name, handlerId] of Object.entries(next)) {
      if (!ALLOWED_EVENTS.includes(name)) {
        console.warn(
          `[plugins] "${pluginId}" tried to bind disallowed event "${name}"`,
        );
        continue;
      }
      const isNew = !(name in map);
      map[name] = handlerId;
      if (isNew) {
        element.addEventListener(name, (event) => {
          const currentId = element[HANDLER_MAP]?.[name];
          if (currentId == null) return;
          this.pluginBridge.handleNodeEvent(
            pluginId,
            currentId,
            createVirtualEvent(event),
          );
        });
      }
    }
  }

  isEmptyNode(node) {
    if (!node) return true;
    if (node.text != null && node.text !== "") return false;
    if (Array.isArray(node.children) && node.children.length > 0) return false;
    return true;
  }
}

export function getPluginIconTemplate(icon) {
  const template = PLUGIN_ICON_TEMPLATES[icon];
  if (!template) {
    console.warn(`[plugins] requested unknown icon "${icon}"`);
    return null;
  }
  return template;
}
