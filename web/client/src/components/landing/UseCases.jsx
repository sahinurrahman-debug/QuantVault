import React from 'react';
import { FadeText, Reveal } from '../Reveal.jsx';

const CASES = [
  { initials: 'HS', role: 'Hospital Security Lead', tag: 'Security Leadership',
    text: 'Rank systems by exposure, adjust the threat horizon live, and explain the migration order to the board.' },
  { initials: 'PE', role: 'Platform Engineer', tag: 'Engineering',
    text: 'See hybrid key establishment, unknown configurations and the Mosca margin for every asset as an actionable list.' },
  { initials: 'QS', role: 'Quantum-Computing Student', tag: 'Learning',
    text: 'Watch an eavesdropper push the error rate to about 25%, and see how noise and key accounting shape the final key.' },
];

export default function UseCases() {
  return (
    <section id="usecases" className="wrap scroll-mt-24 pt-28" aria-labelledby="usecases-title">
      <div className="mx-auto max-w-2xl text-center">
        <Reveal as="p" className="text-sm font-medium uppercase tracking-[0.2em] text-brand-300">Use Cases</Reveal>
        <FadeText as="h2" id="usecases-title" text="Built for Teams Who Own the Migration" className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl" />
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {CASES.map((c, i) => (
          <Reveal key={c.initials} delay={i * 140} className="h-full">
            <article className="glass glass-lift flex h-full flex-col p-7">
              <span className="self-start rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm text-slate-200">{c.tag}</span>
              <p className="mt-5 flex-1 text-[1.02rem] leading-relaxed text-slate-100">{c.text}</p>
              <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5">
                <span className="grid size-11 place-items-center rounded-full bg-linear-to-br from-brand-400 to-aqua-400 font-display text-sm font-semibold text-slate-950">{c.initials}</span>
                <span className="font-medium text-white">{c.role}</span>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
