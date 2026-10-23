import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  api: {
    me: vi.fn(), login: vi.fn(), logout: vi.fn(), demoInfo: vi.fn(), signOutEverywhere: vi.fn(), deleteAccount: vi.fn(),
    changePassword: vi.fn(), meta: vi.fn(), risk: vi.fn(), sweep: vi.fn(),
  },
}));
vi.mock('../src/api.js', () => ({ api: mocks.api }));

const { default: App } = await import('../src/App.jsx');
const { api } = mocks;
const USER = { id: 'u1', name: 'Asha Rao', email: 'asha@example.com', demo: false };

function open(path) {
  window.history.replaceState(null, '', path);
  return render(<App />);
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.demoInfo.mockResolvedValue({ enabled: false });
  api.meta.mockReturnValue(new Promise(() => {})); // the dashboard stays on its skeleton; these tests are about routing
});

describe('protected routes', () => {
  it('sends a signed-out visitor from /dashboard/risk to sign in, remembering where they were going', async () => {
    api.me.mockRejectedValue(new Error('no session'));
    open('/dashboard/risk');
    await screen.findByRole('heading', { name: 'Welcome Back' });
    expect(window.location.pathname).toBe('/login');
    expect(new URLSearchParams(window.location.search).get('next')).toBe('/dashboard/risk');
  });

  it('returns to the saved page after sign in', async () => {
    api.me.mockRejectedValue(new Error('no session'));
    api.login.mockResolvedValue({ user: USER });
    open('/login?next=%2Fdashboard%2Frisk');
    await userEvent.type(await screen.findByLabelText('Email Address'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard/risk'));
  });

  it('sends a signed-in user away from the sign-in page', async () => {
    api.me.mockResolvedValue({ user: USER });
    open('/login');
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
  });

  it('keeps the address for unknown paths and renders a page', async () => {
    api.me.mockRejectedValue(new Error('no session'));
    open('/no/such/page');
    await waitFor(() => expect(document.querySelector('main').textContent.length).toBeGreaterThan(0));
    expect(window.location.pathname).toBe('/no/such/page');
  });
});

describe('header menu', () => {
  it('opens with the keyboard, moves with the arrows and Escape returns focus to the button', async () => {
    api.me.mockResolvedValue({ user: USER });
    open('/');
    const button = await screen.findByRole('button', { name: /asha/i });
    await userEvent.click(button);
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Dashboard', 'Account', 'Sign Out']);
    expect(document.activeElement).toBe(items[0]);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(items[2]);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe('account page', () => {
  it('asks before signing out everywhere, and does nothing when cancelled', async () => {
    api.me.mockResolvedValue({ user: USER });
    open('/account');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign Out Everywhere' }));
    expect(await screen.findByText('Sign out everywhere?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.signOutEverywhere).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/account');
  });

  it('signs out everywhere once confirmed and returns to the landing page', async () => {
    api.me.mockResolvedValue({ user: USER });
    api.signOutEverywhere.mockResolvedValue({});
    open('/account');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign Out Everywhere' }));
    const title = await screen.findByText('Sign out everywhere?');
    await userEvent.click(within(title.closest('dialog')).getByRole('button', { name: 'Sign Out Everywhere' }));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(api.signOutEverywhere).toHaveBeenCalledTimes(1);
  });

  it('hides password change for a demo workspace and offers End Demo instead', async () => {
    api.me.mockResolvedValue({ user: { ...USER, demo: true, name: 'Demo User' } });
    open('/account');
    await screen.findByRole('heading', { name: 'End Demo' });
    expect(screen.queryByRole('heading', { name: 'Change Password' })).toBeNull();
  });

  it('requires a password before enabling account deletion', async () => {
    api.me.mockResolvedValue({ user: USER });
    open('/account');
    const del = await screen.findByRole('button', { name: 'Delete My Account' });
    expect(del.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText('Confirm With Your Password'), 'whatever-password');
    expect(del.disabled).toBe(false);
  });
});
