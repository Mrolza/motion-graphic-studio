import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatCommonsCredit,
  isAllowedCommonsLicense,
  stripHtmlTags,
} from "@core/research/commons";
import {
  fetchOnThisDay,
  selectOnThisDayCandidates,
  type WikimediaOnThisDayItem,
} from "@core/research/wikimedia";

describe("Wikimedia Commons license & credit (M4.3)", () => {
  it("allows Public domain, PD-*, CC0, CC BY *, CC BY-SA * and rejects fair use / empty", () => {
    expect(isAllowedCommonsLicense("Public domain")).toBe(true);
    expect(isAllowedCommonsLicense("PD-USGov-NASA")).toBe(true);
    expect(isAllowedCommonsLicense("CC0")).toBe(true);
    expect(isAllowedCommonsLicense("CC BY 4.0")).toBe(true);
    expect(isAllowedCommonsLicense("CC BY-SA 3.0")).toBe(true);

    expect(isAllowedCommonsLicense("Fair use")).toBe(false);
    expect(isAllowedCommonsLicense("Non-free historic")).toBe(false);
    expect(isAllowedCommonsLicense("")).toBe(false);
  });

  it("strips HTML tags from Artist and formats credit properly", () => {
    const clean = stripHtmlTags('<a href="https://example.com">NASA / Neil</a>');
    expect(clean).toBe("NASA / Neil");
    expect(formatCommonsCredit('<span class="fn">NASA</span>', "Public domain")).toBe(
      "Foto: NASA / Wikimedia Commons, Public domain"
    );
  });
});

describe("Wikimedia OnThisDay parser & fallback (M4.2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses real 07-20 fixture and scores up to 8 candidates", () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "wikimedia-onthisday-07-20.json"
    );
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as {
      selected: WikimediaOnThisDayItem[];
      events: WikimediaOnThisDayItem[];
    };

    const candidates = selectOnThisDayCandidates(fixture, "Apollo");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(8);
    expect(candidates[0].pages.some((p) => Boolean(p.extract))).toBe(true);
  });

  it("falls back from id to en language and from primary to api.wikimedia.org endpoint", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "wikimedia-onthisday-07-20.json"
    );
    const fixtureJson = fs.readFileSync(fixturePath, "utf-8");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        const u = String(url);
        // id primary & fallback return empty (< 5 items)
        if (u.includes("/id/") || u.includes("id.wikipedia.org")) {
          return new Response(JSON.stringify({ selected: [], events: [] }), {
            status: 200,
          });
        }
        // en primary returns 503
        if (u.includes("en.wikipedia.org")) {
          return new Response("Unavailable", { status: 503 });
        }
        // en api.wikimedia.org fallback succeeds
        return new Response(fixtureJson, { status: 200 });
      });

    const feed = await fetchOnThisDay("07", "20");
    expect(feed.lang).toBe("en");
    expect(feed.selected.length + feed.events.length).toBeGreaterThanOrEqual(5);
    expect(fetchSpy).toHaveBeenCalled();
  });
});
