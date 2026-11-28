import { describe, expect, it } from 'vitest';
import { SAN_LUIS_SHARED_INVENTORY, sanLuisPaymentPreview } from './sanLuisCommercial';
import { bookableSpots, type Occupant } from './sanLuis2027Contract';
describe('San Luis agreed commercial rules', () => {
 it('39 shared places: 10 singles, 20 doubles, 9 cabins; no staff place', () => {
  expect(SAN_LUIS_SHARED_INVENTORY).toEqual({ total: 39, hotel_individual: { rooms: 10, places: 10 }, hotel_doble: { rooms: 10, places: 20 }, cabana_3_plazas: { rooms: 3, places: 9 } });
 });
 for (const [price,deposit,first] of [[1950000,585000,682500],[2480000,744000,868000],[1420000,426000,497000],[1070000,321000,374500],[1340000,402000,469000],[830000,249000,290500]]) {
  it(`30/35/35 for ARS ${price}`, () => {
   const p=sanLuisPaymentPreview(price,'2026-11-28');
   expect(p.installments.map(i=>i.amount)).toEqual([deposit,first,first]);
   expect(p.dueNow).toBe(deposit); expect(p.total).toBe(price);
  });
 }
 it('35% due 15 December is collected at booking on or after that date', () => {
  expect(sanLuisPaymentPreview(1950000,'2026-12-14').dueNow).toBe(585000);
  expect(sanLuisPaymentPreview(1950000,'2026-12-15').dueNow).toBe(1267500);
 });
 it('remaining 35% due 10 January is collected at late booking', () => {
  expect(sanLuisPaymentPreview(1950000,'2027-01-09').dueNow).toBe(1267500);
  expect(sanLuisPaymentPreview(1950000,'2027-01-10').dueNow).toBe(1950000);
 });
 it('cabins with/without food consume the same nine places', () => {
  const occupants: Occupant[]=Array.from({length:9},()=>({camp:'full',group:'cabana_3_plazas'}));
  expect(bookableSpots({inventory:{cabana_3_plazas:9},simultaneousCap:39,occupants},'mini','cabana_3_plazas').spots).toBe(0);
 });
 it('full30 plus mini cannot exceed39', () => {
  const occupants: Occupant[]=Array.from({length:30},()=>({camp:'full',group:'hotel_doble'}));
  expect(bookableSpots({inventory:{hotel_individual:10},simultaneousCap:39,occupants},'mini','hotel_individual').spots).toBe(9);
 });
});
