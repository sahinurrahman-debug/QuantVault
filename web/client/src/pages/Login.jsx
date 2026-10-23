import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthShell, { Field, PasswordInput } from '../components/AuthShell.jsx';
import { Spinner } from '../components/ui.jsx';
import { Link, usePageTitle, useRouter } from '../router.jsx';

export default function Login() {
  usePageTitle('Sign In | QuantVault');
  const { login } = useAuth();
  const { search } = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(null); // { enabled, email, password } from the server

  useEffect(() => {
    let active = true;
    api.demoInfo().then((d) => { if (active) setDemo(d); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // The route guard redirects to ?next= or the dashboard once the user is set.
  async function signIn(e, p) {
    setBusy(true);
    setError('');
    try {
      await login(e, p);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const submit = (ev) => { ev.preventDefault(); signIn(email, password); };
  const useDemo = () => { setEmail(demo.email); setPassword(demo.password); signIn(demo.email, demo.password); };

  const next = search ? `/signup${search}` : '/signup';
  return (
    <AuthShell title="Welcome Back" subtitle="Sign in to open your risk dashboard."
      footer={<>New to QuantVault? <Link to={next} className="font-medium text-aqua-300 hover:text-white">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field id="email" label="Email Address">
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="you@organisation.com" />
        </Field>
        <Field id="password" label="Password">
          <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter your password" />
        </Field>
        <div role="alert" aria-live="polite">{error && <p className="error !mt-0">{error}</p>}</div>
        <button type="submit" disabled={busy} className="btn primary w-full !py-3 !text-base">
          {busy ? <Spinner text="Signing in…" /> : 'Sign In'}
        </button>
      </form>

      {demo?.enabled && (
        <>
          <div className="divider" aria-hidden="true">or</div>
          <div className="demo-box">
            <p className="font-medium text-white">Try the Demo Account</p>
            <dl>
              <dt>Email</dt><dd>{demo.email}</dd>
              <dt>Password</dt><dd>{demo.password}</dd>
            </dl>
            <button type="button" onClick={useDemo} disabled={busy} className="btn w-full !py-2.5">
              {busy ? <Spinner text="Signing in…" /> : 'Sign In with Demo Account'}
            </button>
          </div>
        </>
      )}
    </AuthShell>
  );
}
