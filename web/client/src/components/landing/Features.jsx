import React from 'react';
import { IconAtom, IconChart, IconClock, IconRoute, IconShield, IconWave } from '../Icons.jsx';
import { FadeText, Reveal } from '../Reveal.jsx';

const FEATURES = [
  { icon: IconShield, title: 'Cryptographic Inventory',
    text: 'Catalogue each asset by role (key establishment, signature, symmetric) and class. Unknown configurations are scored conservatively, never as safe.' },
  { icon: IconClock, title: 'Mosca Threat Horizon',
    text: 'Apply X + Y > Z with a slider for the quantum-threat horizon and watch priorities shift, with the assumptions always visible.' },
  { icon: IconChart, title: 'Transparent Risk Scoring',
    text: 'Four weighted components (lifetime, quantum exposure, external exposure, migration difficulty) with a separate exposure score.' },
  { icon: IconAtom, title: 'Qiskit BB84 Laboratory',
    text: 'Alice, Bob and an intercept-resend Eve on Qiskit Aer. Eve pushes the sifted-key error rate to about 25% and the run aborts.' },
  { icon: IconWave, title: 'Noise and Key Accounting',
    text: 'Bit-flip, depolarizing and readout noise, Cascade reconciliation, leakage tracking and Toeplitz privacy amplification.' },
  { icon: IconRoute, title: 'Migration Roadmap',
    text: 'A five-phase plan built from your inventory, plus an honest QKD vs post-quantum comparison: PQC first, QKD for fixed fibre links.' },
];

function FeatureCard({ icon: Icon, title, text }) {
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <article onMouseMove={onMove} className="glass glass-lift spot group h-full p-7">
      <span className="grid size-12 place-items-center rounded-xl border border-white/15 bg-white/10 text-brand-300 transition-all duration-500 group-hover:scale-110 group-hover:border-brand-300/60 group-hover:text-aqua-300">
        <Icon className="size-6" />
      </span>
      <h3 className="mt-5 font-display text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 text-[0.97rem] leading-relaxed text-slate-300">{text}</p>
    </article>
  );
}

export default function Features() {
  return (
    <section id="features" className="wrap scroll-mt-24 pt-28" aria-labelledby="features-title">
      <div className="mx-auto max-w-2xl text-center">
        <Reveal as="p" className="text-sm font-medium uppercase tracking-[0.2em] text-brand-300">Features</Reveal>
        <FadeText as="h2" id="features-title" text="From Unknown Risk to a Ranked Migration Plan" className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl" />
      </div>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={(i % 3) * 120} className="h-full"><FeatureCard {...f} /></Reveal>
        ))}
      </div>
    </section>
  );
}
