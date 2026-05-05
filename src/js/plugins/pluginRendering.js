import { lightningBoltIconTemplate } from "/js/templates/icons/lightningBoltIcon.template.js";

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
];

function isAllowedTag(tag) {
  return ALLOWED_TAGS.includes(tag);
}

const ALLOWED_ATTRS = ["class", "title", "role", "lang", "dir"];

function isAllowedAttr(name) {
  return (
    ALLOWED_ATTRS.includes(name) ||
    name.startsWith("data-") ||
    name.startsWith("aria-")
  );
}

// Render a serialized VirtualEl node ({ tag, attrs, text, children }) into a
// real element. Text and children are mutually exclusive on
// the worker side (setText() clears children).
export function renderNode(node, pluginId) {
  let tag = typeof node.tag === "string" ? node.tag.toLowerCase() : "div";
  if (!isAllowedTag(tag)) {
    console.warn(
      `[plugins] "${pluginId}" tried to render disallowed tag <${tag}>`,
    );
    tag = "span";
  }
  const element = document.createElement(tag);
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
  if (node.text != null) {
    element.textContent = node.text;
  } else if (Array.isArray(node.children)) {
    for (const child of node.children) {
      element.appendChild(renderNode(child, pluginId));
    }
  }
  return element;
}

export function isEmptyNode(node) {
  if (!node) return true;
  if (node.text != null && node.text !== "") return false;
  if (Array.isArray(node.children) && node.children.length > 0) return false;
  return true;
}

const PLUGIN_ICON_TEMPLATES = {
  "lightning-bolt": lightningBoltIconTemplate,
};

export function getPluginIconTemplate(icon) {
  const template = PLUGIN_ICON_TEMPLATES[icon];
  if (!template) {
    console.warn(`[plugins] requested unknown icon "${icon}"`);
    return null;
  }
  return template;
}
