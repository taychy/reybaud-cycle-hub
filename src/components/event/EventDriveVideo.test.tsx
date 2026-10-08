import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EventDriveVideo from "./EventDriveVideo";

describe("EventDriveVideo", () => {
  it("embeds the same Drive file lazily without requesting autoplay and keeps an external fallback", () => {
    const html = renderToStaticMarkup(<EventDriveVideo video={{ file_id: "1DUfP6-_UZ-rlZFcyiYBfg7b2bbC1oWbz", title: "Bormio - La Gran Conquista" }} />);
    expect(html).toContain("https://drive.google.com/file/d/1DUfP6-_UZ-rlZFcyiYBfg7b2bbC1oWbz/preview");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('allow="autoplay; fullscreen"');
    expect(html).toContain('title="Bormio - La Gran Conquista"');
    expect(html).toContain("/view?usp=drivesdk");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Ver video");
    expect(html).toContain("aspect-video");
    expect(html).not.toContain("autoplay=1");
  });

  it("rejects URLs and invalid file IDs instead of embedding arbitrary origins", () => {
    for (const file_id of ["", "https://example.com", "../../other", 'bad" onload="']) {
      expect(renderToStaticMarkup(<EventDriveVideo video={{ file_id }} />)).toBe("");
    }
  });
});