import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Field, PasswordInput } from '../components/AuthShell.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { Card, ErrorBox, Spinner } from '../components/ui.jsx';
import { usePageTitle, useRouter } from '../router.jsx';

export default function Account() {
  usePageTitle('Account | QuantVault');
  const { user, signedOut } = useAuth();
  const { navigate } = useRouter();
  const confirm = useConfirm();

  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [pwState, setPwState] = useState({ busy: false, error: null, done: false });
  const [deletePw, setDeletePw] = useState('');
  const [danger, setDanger] = useState({ busy: false, error: null });

  const leave = () => { signedOut(); navigate('/', { replace: true }); };

  async function changePassword(e) {
    e.preventDefault();
    if (pw.next.length < 10) return setPwState({ busy: false, error: new Error('Use at least 10 characters for the new password.'), done: false });
    if (pw.next !== pw.again) return setPwState({ busy: false, error: new Error('The two new passwords do not match.'), done: false });
    setPwState({ busy: true, error: null, done: false });
    try {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', again: '' });
      return setPwState({ busy: false, error: null, done: true });
    } catch (err) {
      return setPwState({ busy: false, error: err, done: false });
    }
  }

  async function signOutEverywhere() {
    const ok = await confirm({ title: 'Sign out everywhere?', text: 'Every device, including this one, will be signed out.', confirmLabel: 'Sign Out Everywhere' });
    if (!ok) return;
    setDanger({ busy: true, error: null });
    try { await api.signOutEverywhere(); leave(); } catch (err) { setDanger({ busy: false, error: err }); }
  }

  async function deleteAccount() {
    const ok = await confirm({
      title: user.demo ? 'End the demo and delete its data?' : 'Delete your account?',
      text: user.demo ? 'This workspace and everything in it is removed now.' : 'Your account, inventory, simulation history and experiments are permanently deleted. This cannot be undone.',
      confirmLabel: user.demo ? 'End Demo' : 'Delete Account', danger: true,
    });
    if (!ok) return;
    setDanger({ busy: true, error: null });
    try { await api.deleteAccount(deletePw); leave(); } catch (err) { setDanger({ busy: false, error: err }); }
  }

  return (
    <div className="wrap pb-6 pt-12">
      <Reveal className="dash-head">
        <h1 className="font-display text-3xl font-semibold text-white sm:text-4xl">Account</h1>
        <p className="mt-3 text-slate-300">Manage your profile, password and data.</p>
      </Reveal>

      <div className="stack">
        <Card title="Profile">
          <dl className="profile">
            <dt>Name</dt><dd>{user.name}</dd>
            <dt>Email</dt><dd>{user.email}</dd>
            {user.demo && <><dt>Workspace</dt><dd><span className="badge m-indeterminate">Demo · Deleted After 24 Hours</span></dd></>}
          </dl>
        </Card>

        {!user.demo && (
          <Card title="Change Password" lead="Other devices are signed out when you change it.">
            <form onSubmit={changePassword} className="form-narrow" noValidate>
              <Field id="current-pw" label="Current Password">
                <PasswordInput id="current-pw" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" placeholder="Enter your current password" />
              </Field>
              <Field id="new-pw" label="New Password" hint="At least 10 characters.">
                <PasswordInput id="new-pw" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" placeholder="Choose a new password" />
              </Field>
              <Field id="again-pw" label="Repeat New Password">
                <PasswordInput id="again-pw" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} autoComplete="new-password" placeholder="Repeat the new password" />
              </Field>
              <ErrorBox error={pwState.error} />
              {pwState.done && <p className="ok" role="status">Password updated. Your other devices were signed out.</p>}
              <div className="row-actions">
                <button className="btn primary" type="submit" disabled={pwState.busy}>{pwState.busy ? <Spinner text="Saving…" /> : 'Update Password'}</button>
              </div>
            </form>
          </Card>
        )}

        <Card title="Sessions" lead="Sign out of every browser and device that is signed in to this account.">
          <div className="row-actions" style={{ marginTop: 0 }}>
            <button className="btn" onClick={signOutEverywhere} disabled={danger.busy}>Sign Out Everywhere</button>
          </div>
        </Card>

        <Card title={user.demo ? 'End Demo' : 'Delete Account'}
          lead={user.demo ? 'Remove this demo workspace and its data now instead of waiting for it to expire.' : 'Permanently delete your account and everything it owns.'}>
          <div className="form-narrow">
            {!user.demo && (
              <Field id="delete-pw" label="Confirm With Your Password">
                <PasswordInput id="delete-pw" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} autoComplete="current-password" placeholder="Enter your password" />
              </Field>
            )}
            <ErrorBox error={danger.error} />
            <div className="row-actions">
              <button className="btn danger" onClick={deleteAccount} disabled={danger.busy || (!user.demo && !deletePw)}>
                {danger.busy ? <Spinner text="Working…" /> : (user.demo ? 'End Demo and Delete Data' : 'Delete My Account')}
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
