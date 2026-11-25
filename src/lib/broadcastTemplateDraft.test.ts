import { describe, expect, it } from "vitest";
import { templateContentUpdate } from "./broadcastTemplateDraft";

describe("template-only mailing preparation", () => {
  it("never persists audience, recipients or dispatch fields from the editor", () => {
    const input = {
      id: "template-id", name: "Jornada Scott", description: null,
      subject: "Jornada", preheader: null, content_html: "<p>Jornada</p>",
      segment_filters: {}, total_recipients: 20, sent_count: 20,
      recipients: ["someone@example.com"], status: "sending", scheduled_at: "tomorrow",
    };
    expect(Object.keys(templateContentUpdate(input)).sort()).toEqual([
      "content_html", "description", "name", "preheader", "subject", "updated_at",
    ]);
  });
});