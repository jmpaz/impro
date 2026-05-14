import { TestSuite } from "../testSuite.js";
import { assert, assertEquals } from "../testHelpers.js";
import { SourceProvider } from "/js/plugins/sourceProvider.js";

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

function fakeRegistry(listingsById) {
  return {
    async getPluginListing(id) {
      return listingsById[id] ?? null;
    },
  };
}

const t = new TestSuite("sourceProviders");

t.describe("SourceProvider with local listings", (it) => {
  it("fetches local manifest from /plugins-local/", async () => {
    let fetchedUrl = null;
    const fetchImpl = async (url) => {
      fetchedUrl = url;
      return jsonResponse({ id: "alpha", name: "A", version: "1.0.0" });
    };
    const provider = new SourceProvider(
      fakeRegistry({ alpha: { id: "alpha", name: "A", local: true } }),
      null,
      { fetchImpl },
    );
    const manifest = await provider.getManifest("alpha");
    assertEquals(fetchedUrl, "/plugins-local/alpha/manifest.json");
    assertEquals(manifest.version, "1.0.0");
  });

  it("fetches local source from /plugins-local/", async () => {
    let fetchedUrl = null;
    const fetchImpl = async (url) => {
      fetchedUrl = url;
      return jsonResponse("alert(1)");
    };
    const provider = new SourceProvider(
      fakeRegistry({ alpha: { id: "alpha", name: "A", local: true } }),
      null,
      { fetchImpl },
    );
    await provider.getSource("alpha");
    assertEquals(fetchedUrl, "/plugins-local/alpha/main.js");
  });

  it("rejects manifest with mismatched id", async () => {
    const fetchImpl = async () =>
      jsonResponse({ id: "different", name: "A", version: "1.0.0" });
    const provider = new SourceProvider(
      fakeRegistry({ alpha: { id: "alpha", name: "A", local: true } }),
      null,
      { fetchImpl },
    );
    let threw = false;
    try {
      await provider.getManifest("alpha");
    } catch (error) {
      threw = true;
      assert(error.message.includes("does not match"));
    }
    assert(threw);
  });

  it("getCacheUrls returns empty for local plugins", async () => {
    const provider = new SourceProvider(
      fakeRegistry({ alpha: { id: "alpha", name: "A", local: true } }),
      null,
    );
    assertEquals(await provider.getCacheUrls("alpha"), []);
  });
});

t.describe("SourceProvider with remote listings", (it) => {
  it("fetches manifest from versioned release URL via plugin cache", async () => {
    let fetchedUrl = null;
    const pluginCache = {
      async fetch(url) {
        fetchedUrl = url;
        return jsonResponse({ id: "alpha", name: "A", version: "1.0.0" });
      },
    };
    const provider = new SourceProvider(
      fakeRegistry({ alpha: { id: "alpha", repo: "ow/alpha" } }),
      pluginCache,
    );
    const manifest = await provider.getManifest("alpha", "1.0.0");
    assertEquals(
      fetchedUrl,
      "https://raw.githubusercontent.com/ow/alpha/1.0.0/manifest.json",
    );
    assertEquals(manifest.id, "alpha");
  });

  it("uses the version that was passed in", async () => {
    let fetchedUrl = null;
    const pluginCache = {
      async fetch(url) {
        fetchedUrl = url;
        return jsonResponse("alert(1)");
      },
    };
    const provider = new SourceProvider(
      fakeRegistry({ alpha: { id: "alpha", repo: "ow/alpha" } }),
      pluginCache,
    );
    await provider.getSource("alpha", "2.5.0");
    assertEquals(
      fetchedUrl,
      "https://raw.githubusercontent.com/ow/alpha/2.5.0/main.js",
    );
  });

  it("throws when version is omitted for a remote plugin", async () => {
    const provider = new SourceProvider(
      fakeRegistry({ alpha: { id: "alpha", repo: "ow/alpha" } }),
      { async fetch() {} },
    );
    let threw = false;
    try {
      await provider.getManifest("alpha");
    } catch (error) {
      threw = true;
      assert(error.message.includes("version required"));
    }
    assert(threw);
  });

  it("throws when plugin is not in registry", async () => {
    const provider = new SourceProvider(fakeRegistry({}), null);
    let threw = false;
    try {
      await provider.getManifest("missing");
    } catch (error) {
      threw = true;
      assert(error.message.includes("not in registry"));
    }
    assert(threw);
  });

  it("getCacheUrls returns both manifest and main.js URLs", async () => {
    const provider = new SourceProvider(
      fakeRegistry({ alpha: { id: "alpha", repo: "ow/alpha" } }),
      null,
    );
    const urls = await provider.getCacheUrls("alpha", "1.2.3");
    assertEquals(urls, [
      "https://raw.githubusercontent.com/ow/alpha/1.2.3/manifest.json",
      "https://raw.githubusercontent.com/ow/alpha/1.2.3/main.js",
    ]);
  });
});

t.describe("SourceProvider.getLiveManifest", (it) => {
  it("hits raw.githubusercontent.com at main", async () => {
    const liveUrl =
      "https://raw.githubusercontent.com/ow/alpha/main/manifest.json";
    let fetchedUrl = null;
    const fetchImpl = async (url) => {
      fetchedUrl = url;
      return jsonResponse({ id: "alpha", name: "Alpha", version: "9.9.9" });
    };
    const provider = new SourceProvider(
      fakeRegistry({ alpha: { id: "alpha", repo: "ow/alpha" } }),
      null,
      { fetchImpl },
    );
    const manifest = await provider.getLiveManifest("alpha");
    assertEquals(manifest.version, "9.9.9");
    assertEquals(fetchedUrl, liveUrl);
  });
});

await t.run();
