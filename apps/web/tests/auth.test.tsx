import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthForm } from '@/components/auth-form';
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  signInWithOAuth: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock('@/lib/supabase/client', () => ({
  configured: () => true,
  createClient: () => ({ auth: mocks }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
});
describe('account forms', () => {
  it('signs in with Supabase and navigates to the protected workspace', async () => {
    const user = userEvent.setup();
    render(<AuthForm />);
    await user.type(screen.getByLabelText('Email address'), 'alice@example.test');
    await user.type(screen.getByLabelText('Password'), 'valid-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'));
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'alice@example.test',
      password: 'valid-password',
    });
  });
  it('asks a registered user to verify their email without granting guest access', async () => {
    const user = userEvent.setup();
    render(<AuthForm />);
    await user.click(screen.getByRole('button', { name: 'Create an account' }));
    await user.type(screen.getByLabelText('Email address'), 'new@example.test');
    await user.type(screen.getByLabelText('Password'), 'long-password-123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Verify your email');
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it('returns a neutral password recovery message', async () => {
    const user = userEvent.setup();
    render(<AuthForm />);
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText('Email address'), 'any@example.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('If an account exists');
  });
  it('maps provider errors without displaying raw upstream details', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { message: 'PRIVATE-DIAGNOSTIC-SECRET' } });
    const user = userEvent.setup();
    render(<AuthForm />);
    await user.type(screen.getByLabelText('Email address'), 'alice@example.test');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to sign in');
    expect(screen.queryByText('PRIVATE-DIAGNOSTIC-SECRET')).not.toBeInTheDocument();
  });
});
