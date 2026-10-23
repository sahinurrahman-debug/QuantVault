import React from 'react';
import { SITE } from '../site.js';
import { IconGithub, IconLinkedin, IconX, IconYoutube } from './Icons.jsx';
import { Link, SectionLink } from '../router.jsx';
import { Logo } from './Navbar.jsx';

const SOCIAL_ICONS = { github: IconGithub, linkedin: IconLinkedin, x: IconX, youtube: IconYoutube };
const SOCIAL_NAMES = { github: 'GitHub', linkedin: 'LinkedIn', x: 'X', youtube: 'YouTube' };

function Column({ title, children }) {
  return (
    <div>
      <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
      <ul className="space-y-2.5 text-[0.95rem]">{children}</ul>
    </div>
  );
}

const linkCls = 'text-slate-300 transition-colors duration-500 hover:text-white';
const Ext = ({ href, children }) => <li><a className={linkCls} href={href} target="_blank" rel="noreferrer noopener">{children}</a></li>;

export default function Footer() {
  const socials = Object.entries(SITE.socials).filter(([, url]) => url);

  return (
    <footer className="mt-28 border-t border-white/10 bg-white/5 backdrop-blur-xl" aria-label="Site footer">
      <div className="wrap py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-[0.95rem] text-slate-300">{SITE.tagline}</p>
            {socials.length > 0 && (
              <div className="mt-5 flex gap-3">
                {socials.map(([key, url]) => {
                  const Icon = SOCIAL_ICONS[key];
                  return (
                    <a key={key} href={url} target="_blank" rel="noreferrer noopener" aria-label={SOCIAL_NAMES[key]}
                      className="grid size-10 place-items-center rounded-xl border border-white/15 bg-white/5 text-slate-200 transition-all duration-500 hover:-translate-y-0.5 hover:border-brand-300/70 hover:bg-white/10 hover:text-white">
                      <Icon className="size-5" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          <Column title="Product">
            <li><SectionLink id="features" className={linkCls}>Features</SectionLink></li>
            <li><Link to="/dashboard" className={linkCls}>Dashboard</Link></li>
            <li><SectionLink id="usecases" className={linkCls}>Use Cases</SectionLink></li>
            <li><Link to="/signup" className={linkCls}>Get Started</Link></li>
          </Column>

          <Column title="Resources">
            <Ext href={SITE.docs}>Methodology</Ext>
            <Ext href={SITE.repo}>Source Code</Ext>
            <Ext href="https://csrc.nist.gov/projects/post-quantum-cryptography">NIST Post-Quantum Project</Ext>
            <Ext href="https://docs.quantum.ibm.com/">Qiskit Documentation</Ext>
          </Column>

          <Column title="Event">
            <li className="text-slate-300">{SITE.event}</li>
            <li className="text-slate-300">Team {SITE.team}</li>
            <li className="text-slate-300">ID {SITE.teamId}</li>
            <Ext href={SITE.org}>Organisation on GitHub</Ext>
          </Column>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-sm text-slate-400">
          <p>© {new Date().getFullYear()} {SITE.team}. Released under the MIT License.</p>
        </div>
      </div>
    </footer>
  );
}
