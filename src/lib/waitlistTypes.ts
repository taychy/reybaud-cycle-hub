export type WaitlistQuestionType =
  | "text"
  | "textarea"
  | "single_choice"
  | "multi_choice"
  | "date"
  | "number";

export interface WaitlistQuestion {
  id: string;
  orden: number;
  label: string;
  tipo: WaitlistQuestionType;
  opciones?: string[]; // usado en single_choice / multi_choice
  requerida?: boolean;
  placeholder?: string;
}

export const QUESTION_TYPE_LABELS: Record<WaitlistQuestionType, string> = {
  text: "Texto corto",
  textarea: "Texto largo",
  single_choice: "Opción única",
  multi_choice: "Selección múltiple",
  date: "Fecha",
  number: "Número",
};

export const genQuestionId = () =>
  `q_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

export const emptyQuestion = (orden: number): WaitlistQuestion => ({
  id: genQuestionId(),
  orden,
  label: "",
  tipo: "text",
  requerida: false,
});

export const WAITLIST_ENTRY_STATES = ["nuevo", "contactado", "convertido", "descartado"] as const;
export type WaitlistEntryState = (typeof WAITLIST_ENTRY_STATES)[number];

export const STATE_LABELS: Record<WaitlistEntryState, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  convertido: "Convertido",
  descartado: "Descartado",
};

export const STATE_COLORS: Record<WaitlistEntryState, string> = {
  nuevo: "bg-primary/15 text-primary border-primary/30",
  contactado: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  convertido: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  descartado: "bg-muted/40 text-muted-foreground border-border",
};
