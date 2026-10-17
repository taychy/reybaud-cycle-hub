import { describe, it, expect } from 'vitest';
import { resolveChoiceSources, summarizeChoiceSources, type ChoiceAdminEntry } from './choiceSurveyAdmin';
import type { ChoiceSurveyConfig } from './choiceSurvey';
const survey: ChoiceSurveyConfig = { key: 'talle_camiseta', enabled: true, title: '', question: '', options: ['XXS','XS','S','M','L','XL','XXL','3XL'].map(value => ({ value, label: value })).concat([{ value: 'no_seguro', label: 'No estoy seguro/a', needs_follow_up: true }] as any) };
const admin = (value: string | null, candidates: string[] = []): ChoiceAdminEntry => ({ reservation_id: 'r', status: value ? 'confirmed' : 'pending', confirmed_value: value, candidates, notes: '' });
describe('administrative survey sources', () => {
  it('five administrative sizes count, Andrea XS/S remains pending', () => {
    const result = summarizeChoiceSources(survey, ['L','M','L','XS','S'].map(v => ({ admin: admin(v) })).concat([{ admin: admin(null, ['XS','S']) }]));
    expect(result.ready).toBe(5); expect(result.pending).toBe(1); expect(result.adminOnly).toBe(5);
    expect(result.counts.find(c => c.value === 'XS')?.count).toBe(1);
    expect(result.counts.find(c => c.value === 'S')?.count).toBe(1);
  });
  it('21 participant sizes plus five admin sizes equals 26 without changing answers', () => {
    const rows = [...Array.from({ length: 21 }, () => ({ answer: { respuesta: 'M' } })), { answer: { respuesta: 'no_seguro' } }, ...['L','M','L','XS','S'].map(v => ({ admin: admin(v) })), { admin: admin(null, ['XS','S']) }, ...Array.from({ length: 4 }, () => ({}))];
    expect(summarizeChoiceSources(survey, rows)).toMatchObject({ ready: 26, pending: 6 });
    expect(rows.filter(r => 'answer' in r)).toHaveLength(22);
  });
  it('same size from both sources counts once', () => { expect(summarizeChoiceSources(survey, [{ answer: { respuesta: 'L' }, admin: admin('L') }]).ready).toBe(1); });
  it('conflicting sources remain preserved and excluded until reviewed', () => { const a = { respuesta: 'S' }; const b = admin('L'); expect(resolveChoiceSources(survey, a, b)).toMatchObject({ conflict: true, value: null }); expect(a.respuesta).toBe('S'); expect(b.confirmed_value).toBe('L'); });
  it('uncertain answer alone is not ready', () => { expect(summarizeChoiceSources(survey, [{ answer: { respuesta: 'no_seguro' } }]).ready).toBe(0); });
});