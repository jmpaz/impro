import { isDev } from "/js/utils.js";
import { PluginHost } from "./pluginHost.js";
import { setupPluginModals } from "./pluginModals.js";

const ENABLED_PLUGINS_KEY = "enabled-plugins";

function readEnabledPlugins() {
  try {
    const raw = localStorage.getItem(ENABLED_PLUGINS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeEnabledPlugins(ids) {
  localStorage.setItem(ENABLED_PLUGINS_KEY, JSON.stringify(ids));
}

class PluginService {
  constructor() {
    this.pluginHost = new PluginHost({ verbose: isDev() });
    setupPluginModals(this.pluginHost);
  }

  async loadPlugins() {
    await this.pluginHost.loadEnabledPlugins({
      enabledIds: readEnabledPlugins(),
    });
  }

  enablePlugin(pluginId) {
    const ids = readEnabledPlugins();
    if (!ids.includes(pluginId)) {
      ids.push(pluginId);
      writeEnabledPlugins(ids);
    }
  }

  disablePlugin(pluginId) {
    const ids = readEnabledPlugins();
    const next = ids.filter((id) => id !== pluginId);
    if (next.length !== ids.length) writeEnabledPlugins(next);
  }

  getSidebarItems() {
    return [...this.pluginHost.registries.sidebarItems];
  }
}

export const pluginService = new PluginService();

window.enablePlugin = (pluginId) => pluginService.enablePlugin(pluginId);
window.disablePlugin = (pluginId) => pluginService.disablePlugin(pluginId);
