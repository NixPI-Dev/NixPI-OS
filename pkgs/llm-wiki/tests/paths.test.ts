import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appliesToHost,
  buildPagePath,
  countWords,
  dedupeSlug,
  extractHeadings,
  extractWikiLinks,
  folderMatches,
  formatAreasSuffix,
  formatDomainSuffix,
  formatHostsSuffix,
  getWikiRoot,
  getWikiRootForDomain,
  getWikiRoots,
  inferDomainFromFolder,
  isProtectedPath,
  isWikiPagePath,
  makeSourceId,
  normalizeAreas,
  normalizeDomain,
  normalizeHosts,
  normalizePageFolder,
  normalizeWikiLink,
  slugifyTitle,
} from "../extension/paths.ts";

afterEach(() => {
  delete process.env.PI_LLM_WIKI_DIR;
  delete process.env.PI_LLM_WIKI_ROOTS;
  delete process.env.PI_LLM_WIKI_HOST;
});

describe("getWikiRoot", () => {
  it("uses PI_LLM_WIKI_DIR when set", () => {
    process.env.PI_LLM_WIKI_DIR = "/tmp/custom-wiki";
    expect(getWikiRoot()).toBe("/tmp/custom-wiki");
  });

  it("falls back to ~/NixPI/wiki/technical", () => {
    delete process.env.PI_LLM_WIKI_DIR;
    expect(getWikiRoot()).toBe(path.join(process.env.HOME ?? "/root", "NixPI", "wiki", "technical"));
  });

  it("resolves split roots by domain", () => {
    process.env.PI_LLM_WIKI_DIR = "/tmp/default-wiki";
    process.env.PI_LLM_WIKI_ROOTS = "technical:/tmp/tech, personal:/tmp/personal";
    expect(getWikiRoots()).toEqual({ technical: "/tmp/tech", personal: "/tmp/personal" });
    expect(getWikiRootForDomain(" technical ")).toBe("/tmp/tech");
    expect(getWikiRootForDomain("personal")).toBe("/tmp/personal");
    expect(getWikiRootForDomain("unknown")).toBe("/tmp/default-wiki");
    expect(getWikiRootForDomain(undefined)).toBe("/tmp/default-wiki");
  });
});

describe("domain, area, and host normalization", () => {
  it("normalizes domains and areas", () => {
    expect(normalizeDomain(" Technical ")).toBe("technical");
    expect(normalizeAreas([" AI ", "ai", "Infra "])).toEqual(["ai", "infra"]);
  });

  it("normalizes hosts and evaluates host scope", () => {
    expect(normalizeHosts([" Yoga-Nixos ", "yoga-nixos", "vps-nixos "])).toEqual(["yoga-nixos", "vps-nixos"]);
    expect(appliesToHost([], "yoga-nixos")).toBe(true);
    expect(appliesToHost(["*"], "yoga-nixos")).toBe(true);
    expect(appliesToHost(["yoga-nixos"], "yoga-nixos")).toBe(true);
    expect(appliesToHost(["vps-nixos"], "yoga-nixos")).toBe(false);
  });

  it("formats domain, area, and host suffixes", () => {
    expect(formatDomainSuffix("technical")).toBe(" [domain: technical]");
    expect(formatAreasSuffix(["infra", "ai"])).toBe(" [areas: infra, ai]");
    expect(formatHostsSuffix(["yoga-nixos", "vps-nixos"])).toBe(" [hosts: yoga-nixos, vps-nixos]");
    expect(formatHostsSuffix([])).toBe("");
  });
});

describe("folder helpers", () => {
  it("normalizes wiki folders and blocks traversal", () => {
    expect(normalizePageFolder(" resources/technical ")).toBe("resources/technical");
    expect(() => normalizePageFolder("../bad")).toThrow(/Invalid wiki folder/);
  });

  it("builds page paths and extracts folders", () => {
    expect(buildPagePath("foo", "resources/technical")).toBe("pages/resources/technical/foo.md");
    expect(buildPagePath("foo")).toBe("pages/foo.md");
  });

  it("matches folders by exact prefix", () => {
    expect(folderMatches("resources/technical", undefined)).toBe(true);
    expect(folderMatches("resources/technical", "resources")).toBe(true);
    expect(folderMatches("resources/technical", "areas")).toBe(false);
  });

  it("infers domains from convenience folders", () => {
    expect(inferDomainFromFolder("technical")).toBe("technical");
    expect(inferDomainFromFolder("areas/personal")).toBe("personal");
    expect(inferDomainFromFolder("resources/mixed")).toBeUndefined();
  });
});

describe("slug, ids, and wiki links", () => {
  it("slugifies titles and dedupes slugs", () => {
    expect(slugifyTitle("Café Notes")).toBe("cafe-notes");
    expect(dedupeSlug("page", ["page", "page-2"])).toBe("page-3");
  });

  it("builds source ids", () => {
    const date = new Date("2026-04-19T12:00:00Z");
    expect(makeSourceId([], date)).toBe("SRC-2026-04-19-001");
    expect(makeSourceId(["SRC-2026-04-19-001", "SRC-2026-04-19-002"], date)).toBe("SRC-2026-04-19-003");
  });

  it("normalizes wiki links", () => {
    expect(normalizeWikiLink("sources/SRC-2026-04-19-001")).toBe("pages/sources/SRC-2026-04-19-001.md");
    expect(normalizeWikiLink("pages/resources/technical/system-landscape")).toBe(
      "pages/resources/technical/system-landscape.md",
    );
    expect(normalizeWikiLink("resources/technical/system-landscape")).toBe(
      "pages/resources/technical/system-landscape.md",
    );
    expect(normalizeWikiLink("resources/technical/system-landscape#Overview")).toBe(
      "pages/resources/technical/system-landscape.md",
    );
  });
});

describe("path protection and markdown extraction", () => {
  const wikiRoot = "/tmp/llm-wiki";

  it("protects raw and meta but allows pages", () => {
    expect(isProtectedPath(wikiRoot, `${wikiRoot}/raw/SRC-001/manifest.json`)).toBe(true);
    expect(isProtectedPath(wikiRoot, `${wikiRoot}/meta/registry.json`)).toBe(true);
    expect(isProtectedPath(wikiRoot, `${wikiRoot}/pages/resources/technical/foo.md`)).toBe(false);
    expect(isWikiPagePath(wikiRoot, `${wikiRoot}/pages/resources/technical/foo.md`)).toBe(true);
    expect(isWikiPagePath(wikiRoot, `${wikiRoot}/raw/SRC-001/manifest.json`)).toBe(false);
  });

  it("extracts wiki links, headings, and word counts", () => {
    const markdown = `# Hello\n\nSee [[resources/technical/system-landscape#Next Step|System Landscape]].\n\n## Next Step`;
    expect(extractWikiLinks(markdown)).toEqual(["resources/technical/system-landscape#Next Step"]);
    expect(extractHeadings(markdown)).toEqual(["Hello", "Next Step"]);
    expect(countWords("one two three")).toBe(3);
  });
});
