import React, { useState } from 'react';
import { api } from '../../api.js';
import { IconArrow } from '../Icons.jsx';
import { FadeText, Reveal } from '../Reveal.jsx';
import { Spinner } from '../ui.jsx';

export default function CtaSection() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ status: 'idle', message: '' }); // idle | loading | done | error

  async function submit(e) {
    e.preventDefault();
    setState({ status: 'loading', message: '' });
    try {
      const r = await api.subscribe(email);
      setState({ status: 'done', message: r.already ? 'You are already on the list. Thank you!' : 'Thank you! You are on the pilot list.' });
      setEmail('');
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  }

  return (
    <section id="cta" className="wrap scroll-mt-24 pt-28" aria-labelledby="cta-title">
      <Reveal>
        <div className="glass relative overflow-hidden rounded-3xl px-6 py-14 text-center shadow-[0_0_90px_rgba(139,92,246,0.3)] sm:px-14 sm:py-20">
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 size-96 -translate-x-1/2 rounded-full bg-brand-500/30 blur-3xl" />
          <div className="relative">
            <FadeText as="h2" id="cta-title" text="Start Your Quantum-Readiness Assessment Today" className="mx-auto max-w-3xl font-display text-3xl font-semibold text-white sm:text-5xl" />
            <Reveal as="p" delay={300} className="mx-auto mt-5 max-w-xl text-lg text-slate-300">
              Explore the live dashboard now, or join the pilot list for project updates.
            </Reveal>

            <Reveal delay={450}>
              <form onSubmit={submit} className="mx-auto mt-9 flex max-w-xl flex-col gap-3 sm:flex-row" noValidate>
                <label htmlFor="cta-email" className="sr-only">Email address</label>
                <input id="cta-email" type="email" required autoComplete="email" placeholder="you@organisation.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} aria-describedby="cta-note"
                  className="h-12 flex-1 !rounded-xl !bg-white/10 px-4 text-base placeholder:text-slate-400" />
                <button type="submit" disabled={state.status === 'loading'}
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/30 bg-linear-to-br from-brand-500 to-brand-600 px-6 text-base font-medium text-white shadow-[0_8px_28px_rgba(124,58,237,0.5)] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_12px_38px_rgba(139,92,246,0.65)] disabled:opacity-60">
                  {state.status === 'loading' ? <Spinner text="Joining…" /> : <>Join the Pilot List <IconArrow className="size-4 transition-transform duration-500 group-hover:translate-x-1" /></>}
                </button>
              </form>
              <p id="cta-note" className="mt-3 text-sm text-slate-400">
                Your email is used only to contact you about the pilot.
              </p>
              <div role="status" aria-live="polite" className="mt-3 min-h-7 text-base">
                {state.status === 'done' && <span className="text-emerald-300">{state.message}</span>}
                {state.status === 'error' && <span className="text-rose-300">{state.message}</span>}
              </div>
            </Reveal>

          </div>
        </div>
      </Reveal>
    </section>
  );
}
