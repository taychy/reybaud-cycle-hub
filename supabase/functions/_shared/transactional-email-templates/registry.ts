import type { ComponentType } from 'npm:react@18.3.1'
import { template as coachFeedback } from './coach-feedback.tsx'
import { template as supplierOrderCreated } from './supplier-order-created.tsx'

export type TemplateEntry = {
  component: ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'coach-feedback': coachFeedback,
  'supplier-order-created': supplierOrderCreated,
}
