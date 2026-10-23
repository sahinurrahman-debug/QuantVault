import React from 'react';
import { SITE, STATS } from '../../site.js';
import { IconArrow } from '../Icons.jsx';
import { Link, SectionLink } from '../../router.jsx';
import { FadeText, Reveal } from '../Reveal.jsx';

export default function Hero() {
  return (
    <section className="wrap pt-12 sm:pt-20" aria-labelledby="hero-title">
      <div className="glass rounded-3xl px-6 py-12 text-center sm:px-12 sm:py-16">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm text-slate-200">
            <span className="size-2 rounded-full bg-aqua-300 shadow-[0_0_10px_#67e8f9]" />
            {SITE.event} · Track 1 · Quantum Cryptography &amp; Security
          </span>
        </Reveal>

        <FadeText as="h1" id="hero-title" delay={120} step={70}
          text="Know Which Systems Quantum Computers Will Break First"
          className="mx-auto mt-7 max-w-4xl font-display text-4xl font-semibold leading-[1.08] text-white sm:text-6xl" />

        <Reveal as="p" delay={700} className="mx-auto mt-6 max-w-2xl text-lg text-slate-300 sm:text-xl">
          QuantVault inventories your cryptography, ranks what to migrate first with Mosca&rsquo;s inequality, and lets you watch a
          Qiskit BB84 simulation catch an eavesdropper, all in one place.
        </Reveal>

        <Reveal delay={850} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/dashboard"
            className="group inline-flex items-center gap-2 rounded-xl border border-white/30 bg-linear-to-br from-brand-500 to-brand-600 px-6 py-3 text-base font-medium text-white shadow-[0_10px_34px_rgba(124,58,237,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_14px_44px_rgba(139,92,246,0.65)]">
            Open the Dashboard <IconArrow className="size-5 transition-transform duration-500 group-hover:translate-x-1" />
          </Link>
          <SectionLink id="features"
            className="rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-base font-medium text-white backdrop-blur-md transition-all duration-500 hover:-translate-y-0.5 hover:border-brand-300/70 hover:bg-white/15">
            Explore the Features
          </SectionLink>
        </Reveal>

        <Reveal delay={1000} className="mt-12">
          <dl className="glass grid grid-cols-2 overflow-hidden rounded-2xl md:grid-cols-4">
            {STATS.map((s, i) => (
              <div key={s.label} className={`px-4 py-6 ${i % 2 === 1 ? 'border-l border-white/10' : ''} ${i > 1 ? 'border-t border-white/10 md:border-t-0' : ''} ${i > 0 ? 'md:border-l md:border-white/10' : ''}`}>
                <dd className="font-display text-3xl font-semibold text-white sm:text-4xl">{s.value}</dd>
                <dt className="mt-1 text-sm text-slate-300">{s.label}</dt>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
