import React, { useState } from 'react';
import { Reveal } from './Reveal.jsx';

/** Centred glass card used by the sign-in and sign-up pages. */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <section className="wrap py-14 sm:py-20" aria-labelledby="auth-title">
      <Reveal className="mx-auto w-full max-w-md">
        <div className="glass rounded-3xl p-7 sm:p-10">
          <h1 id="auth-title" className="text-center font-display text-3xl font-semibold text-white">{title}</h1>
          {subtitle && <p className="mt-2 text-center text-slate-300">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
        {footer && <p className="mt-6 text-center text-slate-300">{footer}</p>}
      </Reveal>
    </section>
  );
}

export function Field({ id, label, hint, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-200">{label}</label>
      {children}
      {hint && !error && <p className="mt-1.5 text-sm text-slate-400">{hint}</p>}
      {error && <p className="mt-1.5 text-sm text-rose-300" role="alert">{error}</p>}
    </div>
  );
}

export function PasswordInput({ id, value, onChange, autoComplete, invalid, describedBy, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete}
        aria-invalid={invalid || undefined} aria-describedby={describedBy} placeholder={placeholder} required maxLength={128} className="pw-input" />
      <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-2 my-auto h-8 rounded-lg px-2 text-sm text-slate-300 transition-colors duration-300 hover:text-white">
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
