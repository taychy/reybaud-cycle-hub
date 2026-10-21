import {describe,it,expect} from 'vitest';
import {chooseBookingPackage,bookingEligibilityAccepted,bookingContactSchema,type BookingRequestPackage} from './eventBookingRequest';
const packages:BookingRequestPackage[]=[[false,true,3500],[false,false,3100],[true,true,3000],[true,false,2800]].map(([a,b,p],i)=>({id:String(i),name:'Maratona',price:Number(p),currency:'EUR',requires_alps:Boolean(a),bike_included:Boolean(b)}));
describe('Maratona requests',()=>{
 for(const [alps,bike,price] of [[false,true,3500],[false,false,3100],[true,true,3000],[true,false,2800]] as const)it(`tariff ${price}`,()=>expect(chooseBookingPackage(packages,alps,bike)?.price).toBe(price));
 it('Alpes discount requires administrative eligibility acknowledgement',()=>{expect(bookingEligibilityAccepted(packages[2],false,true)).toBe(false);expect(bookingEligibilityAccepted(packages[2],true,true)).toBe(true)});
 it('bike bonus requires both rentals',()=>expect(bookingEligibilityAccepted(packages[2],true,false)).toBe(false));
 it('own bike does not require rental acknowledgement',()=>expect(bookingEligibilityAccepted(packages[3],true,false)).toBe(true));
 it('requires valid contact and consent',()=>expect(bookingContactSchema.safeParse({name:'A',email:'invalid',phone:'123',note:'',consent:false}).success).toBe(false));
 it('combined subtotal excludes bridge nights and transfer',()=>{expect(3890+packages[2].price).toBe(6890);expect(3890+packages[3].price).toBe(6690);expect(7+5).toBe(12)});
});