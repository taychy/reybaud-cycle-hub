import type { ComponentType } from 'npm:react@18.3.1'
import { template as coachFeedback } from './coach-feedback.tsx'

export type TemplateEntry = {
  component: ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'coach-feedback': coachFeedback,
}
