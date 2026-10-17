import { describe, expect, it } from 'vitest';
import { staffKey, summarizeJerseyOrder, type StaffJersey } from './staffJerseys';
import { summarizeChoiceSources } from './choiceSurveyAdmin';
import type { ChoiceSurveyConfig } from './choiceSurvey';

const survey: ChoiceSurveyConfig = { key: 'talle_camiseta', enabled: true, title: '', question: '', options: [...['XXS','XS','S','M','L','XL','XXL','3XL'].map(value => ({value,label:value})), {value:'no_seguro',label:'No seguro',needs_follow_up:true}] };
const staff: StaffJersey[] = [['Jackeline Lecoque','XXS'],['Jorge Romero','XS'],['Claudio Reybaud','S']].map(([recipient_name,size],i) => ({id:String(i),recipient_name,staff_key:staffKey(recipient_name),size,quantity:1,active:true}));
describe('Staff jerseys separate from reservations', () => {
  it('adds exactly the three authorized sizes to 32 participants', () => {
    const result = summarizeJerseyOrder(survey,[{value:'XS',count:6},{value:'S',count:3},{value:'M',count:10},{value:'L',count:8},{value:'XL',count:4},{value:'XXL',count:1}],staff);
    expect([result.participants,result.staff,result.total]).toEqual([32,3,35]);
    expect(result.counts.map(c => c.total)).toEqual([1,7,4,10,8,4,1,0]);
  });
  it('does not count removed staff', () => {
    expect(summarizeJerseyOrder(survey,[],staff.map(s => ({...s,active:false}))).total).toBe(0);
  });
  it('excludes pending participant choices and uncertain staff choices', () => {
    const participants = summarizeChoiceSources(survey,[{answer:{respuesta:'no_seguro'}},{admin:{reservation_id:'r',status:'pending',confirmed_value:null,candidates:['XS','S'],notes:''}}]);
    expect(summarizeJerseyOrder(survey,participants.counts,[{...staff[0],size:'no_seguro'}]).total).toBe(0);
  });
  it('normalizes staff identity for idempotent upsert', () => {
    expect(staffKey('  JÓRGE   Romero ')).toBe('jorge romero');
    expect(staffKey('Jackeline Lecoque')).toBe('jackeline lecoque');
  });
});