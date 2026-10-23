import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthShell, { Field, PasswordInput } from '../components/AuthShell.jsx';
import { Spinner } from '../components/ui.jsx';
import { Link, usePageTitle, useRouter } from '../router.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Signup() {
  usePageTitle('Create Account | QuantVault');
  const { signup } = useAuth();
  const { search } = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const found = {};
    if (!form.name.trim()) found.name = 'Enter your name.';
    if (!EMAIL_RE.test(form.email.trim())) found.email = 'Enter a valid email address.';
    if (form.password.length < 10) found.password = 'Use at least 10 characters.';
    setErrors(found);
    setServerError('');
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await signup(form.name.trim(), form.email.trim(), form.password); // the route guard then redirects
    } catch (err) {
      setServerError(err.message);
      setBusy(false);
    }
  }

  const next = search ? `/login${search}` : '/login';
  return (
    <AuthShell title="Create Your Account" subtitle="Your own private workspace, ready in seconds."
      footer={<>Already have an account? <Link to={next} className="font-medium text-aqua-300 hover:text-white">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field id="name" label="Full Name" error={errors.name}>
          <input id="name" type="text" value={form.name} onChange={set('name')} autoComplete="name" maxLength={80} required placeholder="Your full name" aria-invalid={!!errors.name || undefined} />
        </Field>
        <Field id="email" label="Email Address" error={errors.email}>
          <input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required placeholder="you@organisation.com" aria-invalid={!!errors.email || undefined} />
        </Field>
        <Field id="password" label="Password" hint="At least 10 characters." error={errors.password}>
          <PasswordInput id="password" value={form.password} onChange={set('password')} autoComplete="new-password" invalid={!!errors.password} placeholder="Create a password" />
        </Field>
        <div role="alert" aria-live="polite">{serverError && <p className="error !mt-0">{serverError}</p>}</div>
        <button type="submit" disabled={busy} className="btn primary w-full !py-3 !text-base">
          {busy ? <Spinner text="Creating account…" /> : 'Create Account'}
        </button>
      </form>
    </AuthShell>
  );
}
