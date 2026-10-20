import { z } from 'zod';
export interface BookingRequestPackage { id: string; name: string; price: number; currency: string; bike_included: boolean; requires_alps: boolean }
export const bookingContactSchema = z.object({
 name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(255),
 phone: z.string().trim().min(6).max(30).regex(/^[+0-9() .-]+$/), note: z.string().trim().max(1000), consent: z.literal(true),
});
export function chooseBookingPackage(packages: BookingRequestPackage[], alps: boolean, bike: boolean) {
 return packages.find(p => p.requires_alps === alps && p.bike_included === bike);
}
export function bookingEligibilityAccepted(p: BookingRequestPackage, alps: boolean, rentals: boolean) {
 return !p.requires_alps || (alps && (!p.bike_included || rentals));
}