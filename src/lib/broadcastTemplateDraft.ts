export interface MailingTemplateDraft {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  preheader: string | null;
  content_html: string;
}

// Whitelist content fields: editing a template never persists audience or dispatch state.
export function templateContentUpdate(template: MailingTemplateDraft) {
  return {
    name: template.name.trim(),
    description: template.description,
    subject: template.subject.trim(),
    preheader: template.preheader,
    content_html: template.content_html,
    updated_at: new Date().toISOString(),
  };
}