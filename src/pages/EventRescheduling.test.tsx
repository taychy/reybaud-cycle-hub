import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import EventRescheduling from './EventRescheduling';

const mocks = vi.hoisted(() => ({ context: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), rpc: vi.fn(), listener: undefined as undefined | ((event: string) => void) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, auth: {
 getUser: mocks.getUser, signOut: mocks.signOut,
 onAuthStateChange: (cb: (event: string) => void) => { mocks.listener = cb; return { data: { subscription: { unsubscribe: vi.fn() } } }; },
} } }));
vi.mock('@/lib/rescheduling', async importOriginal => ({ ...await importOriginal<object>(), reschedulingContext: mocks.context }));
// Account ownership is mocked at the RPC boundary; no real identities or submissions are created.
const reservation = (id: string) => ({ reservation_id: id, participant: `Ficticio ${id}`, package: 'Doble', request: null,
 financial: { paid_reybaud: 100000, direct_paid: 0, direct_received: 0, effective_paid: 100000, previous_refunds: 0, estimated_remaining: 100000, requires_reconciliation: false, has_transfer: false, refund_obligation: null, credit_available: 0, credit_used: 0, finance_enabled: false },
 size: { confirmed: null, survey: null, administration: null, conflict: false, options: [] } });
const campaign = { event_id: 'event', public_enabled: true, jersey_price: 50000, policy_text: 'Plazo de reintegro: 5 a 7 días hábiles.', policy_version: 'v3', consent_text: 'Acepto la solicitud.', options: [{ value: 'help', label: 'Ayuda' }] };
let account: string | null;
const guest = 'rsg_' + 'b'.repeat(64);
function Location() { const location = useLocation(); return <output aria-label="Destino">{location.pathname}{location.search}</output>; }
function start(query = '') { return render(<MemoryRouter initialEntries={[`/reprogramacion/event${query}`]}><Location/><Routes><Route path="/reprogramacion/:eventId" element={<EventRescheduling/>}/><Route path="/" element={<p>Acceso por email</p>}/></Routes></MemoryRouter>); }
beforeEach(() => {
 account = 'A'; sessionStorage.clear(); mocks.rpc.mockReset(); mocks.context.mockReset(); mocks.signOut.mockReset();
 mocks.getUser.mockImplementation(async () => ({ data: { user: account ? { id: account } : null }, error: null }));
 mocks.signOut.mockImplementation(async () => { account = null; mocks.listener?.('SIGNED_OUT'); return { error: null }; });
 mocks.context.mockImplementation(async (_event, id, credential) => ({ available: true, campaign,
  admin_hint: account === 'admin', reservations: credential ? (credential === guest ? [reservation(id)] : []) : (account && account !== 'admin' && (!id || id === account) ? [reservation(account)] : []) }));
});
afterEach(() => { cleanup(); sessionStorage.clear(); });
describe('public survey account isolation', () => {
 it('A switches locally, loses previous URL and state, then B sees only B', async () => {
  start('?reserva=A&token=personal'); await screen.findByText('Ficticio A');
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar de usuario' }));
  await screen.findByRole('button', { name: 'Recibir código por email' });
  expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
  expect(screen.queryByText('Ficticio A')).toBeNull(); expect(screen.getByLabelText('Destino')).toHaveTextContent('/reprogramacion/event'); expect(screen.getByLabelText('Destino').textContent).not.toContain('?');
  account = 'B'; await act(async () => { mocks.listener?.('SIGNED_IN'); });
  await screen.findByText('Ficticio B'); expect(screen.queryByText('Ficticio A')).toBeNull(); expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it('A opening B link must verify, never falls back to A or exposes B', async () => {
  start('?reserva=B&token=personal'); await screen.findByText('Esta reserva corresponde a otra persona');
  expect(screen.queryByText('Ficticio A')).toBeNull(); expect(screen.queryByText('Ficticio B')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Continuar con el enlace/ })); expect(screen.getByRole('textbox', { name: 'DNI' })).toBeInTheDocument();
  expect(mocks.context.mock.calls.every(([, id]) => id === 'B')).toBe(true);
 });
 it('defensively filters an unscoped owner response to the link reservation', async () => {
  mocks.context.mockResolvedValue({ available: true, campaign, reservations: [reservation('A')] }); start('?reserva=B&token=personal');
  await screen.findByText('Esta reserva corresponde a otra persona'); expect(screen.queryByText('Ficticio A')).toBeNull();
 });
 it('guest switch removes only A credential and another account cannot reuse it', async () => {
  account = null; sessionStorage.setItem('rs_guest_A', JSON.stringify({ session: guest, expiresAt: new Date(9e12).toISOString() })); sessionStorage.setItem('preference', 'keep');
  start('?reserva=A&token=personal'); await screen.findByText('Ficticio A'); fireEvent.click(screen.getByRole('button', { name: 'Cambiar de usuario' }));
  await screen.findByRole('button', { name: 'Recibir código por email' }); expect(sessionStorage.getItem('rs_guest_A')).toBeNull(); expect(sessionStorage.getItem('preference')).toBe('keep'); expect(mocks.signOut).not.toHaveBeenCalled();
  account = 'B'; await act(async () => { mocks.listener?.('SIGNED_IN'); }); await screen.findByText('Ficticio B'); expect(screen.queryByText('Ficticio A')).toBeNull();
 });
 it('administrator sees guidance only and can switch', async () => {
  account = 'admin'; start(); await screen.findByText(/Para gestionar solicitudes/); expect(screen.queryByText(/Ficticio/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar de usuario' })); await screen.findByRole('button', { name: 'Recibir código por email' });
 });
 it('unsaved editing needs one confirmation; cancel keeps selection and never submits', async () => {
  start(); await screen.findByText('Ficticio A'); fireEvent.click(screen.getByRole('radio', { name: /Necesito ayuda/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar de usuario' })); await screen.findByRole('alertdialog'); expect(mocks.signOut).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Seguir con mi elección' })); expect(screen.getByRole('radio', { name: /Necesito ayuda/ })).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar de usuario' })); fireEvent.click(screen.getByRole('button', { name: 'Descartar y cambiar de usuario' }));
  await screen.findByRole('button', { name: 'Recibir código por email' }); expect(mocks.signOut).toHaveBeenCalledTimes(1); expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it('signout failure hides prior data and prevents login reuse', async () => {
  mocks.signOut.mockResolvedValue({ error: new Error('failure') }); start(); await screen.findByText('Ficticio A');
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar de usuario' })); await screen.findByRole('alert'); expect(screen.queryByText('Ficticio A')).toBeNull(); expect(screen.queryByRole('button', { name: 'Recibir código por email' })).toBeNull();
 });
 it('partial personal URL cannot fall back to own rows', async () => {
  start('?token=personal'); await screen.findByRole('alert'); expect(mocks.context).not.toHaveBeenCalled(); expect(screen.queryByText('Ficticio A')).toBeNull();
 });
 it('late A load cannot restore data after signout or auth change', async () => {
  let resolve: ((value: unknown) => void) | undefined;
  mocks.context.mockImplementationOnce(() => new Promise(r => { resolve = r; })); start(); await waitFor(() => expect(mocks.context).toHaveBeenCalledTimes(1));
  account = 'B'; await act(async () => { mocks.listener?.('SIGNED_IN'); }); await screen.findByText('Ficticio B');
  await act(async () => { resolve?.({ available: true, campaign, reservations: [reservation('A')] }); }); expect(screen.queryByText('Ficticio A')).toBeNull();
 });
 it('signed-out generic page contains no identity and login preserves generic returnTo', async () => {
  account = null; start(); await screen.findByRole('button', { name: 'Recibir código por email' }); expect(screen.queryByText(/Ficticio/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Recibir código por email' })); expect(screen.getByLabelText('Destino').textContent).toBe('/?returnTo=%2Freprogramacion%2Fevent');
 });
});