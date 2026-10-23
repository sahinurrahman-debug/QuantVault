import React, { useEffect, useRef, useState } from 'react';
import { initialsOf, useAuth } from '../auth/AuthContext.jsx';
import { Link, SectionLink, useRouter } from '../router.jsx';
import { SITE } from '../site.js';
import { IconArrow, IconClose, IconMenu } from './Icons.jsx';

export function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight text-white ${className}`}>
      <span className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-brand-400 to-brand-600 shadow-[0_0_22px_rgba(139,92,246,0.55)]">
        <svg viewBox="0 0 24 24" className="size-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l7 3v5c0 4.500-3 8-7 10-4-2-7-5.500-7-10V6l7-3z" /><circle cx="12" cy="11.500" r="2" />
        </svg>
      </span>
      <span>Quant<span className="text-brand-300">Vault</span></span>
    </span>
  );
}

const linkCls = 'rounded-lg px-3 py-2 text-left text-[0.95rem] text-slate-200 transition-colors duration-500 hover:bg-white/10 hover:text-white';
const primaryCls = 'group items-center justify-center gap-2 rounded-xl border border-white/25 bg-linear-to-br from-brand-500/90 to-brand-600/90 px-4 py-2 text-[0.95rem] font-medium text-white shadow-[0_6px_24px_rgba(124,58,237,0.4),inset_0_1px_0_rgba(255,255,255,0.3)] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_10px_32px_rgba(139,92,246,0.55)]';
const ghostCls = 'items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[0.95rem] font-medium text-slate-100 transition-all duration-500 hover:border-brand-300/60 hover:bg-white/10 hover:text-white';

/** Close on Escape or on a click outside `ref`, while `active`. */
function useDismiss(active, ref, close) {
  useEffect(() => {
    if (!active) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [active, ref, close]);
}

function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const close = () => { setOpen(false); };
  useDismiss(open, ref, close);

  // Keyboard: opening focuses the first item; arrows move; Escape closes and returns focus to the button.
  useEffect(() => { if (open) ref.current?.querySelector('[role=menuitem]')?.focus(); }, [open]);
  const onKeyDown = (e) => {
    if (!open) return;
    const items = [...ref.current.querySelectorAll('[role=menuitem]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    if (e.key === 'Escape') buttonRef.current?.focus();
  };

  return (
    <div className="relative" ref={ref} onKeyDown={onKeyDown}>
      <button ref={buttonRef} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/5 py-1.5 pl-1.5 pr-3 text-[0.95rem] text-slate-100 transition-all duration-500 hover:border-brand-300/60 hover:bg-white/10">
        <span className="grid size-8 place-items-center rounded-lg bg-linear-to-br from-brand-400 to-aqua-400 font-display text-xs font-semibold text-slate-950">{initialsOf(user.name)}</span>
        <span className="hidden max-w-32 truncate sm:block">{user.name.split(' ')[0]}</span>
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="menu-panel absolute right-0 top-full z-50 mt-3 w-64 rounded-2xl p-2">
          <div className="border-b border-white/10 px-3 py-3">
            <p className="truncate font-medium text-white">{user.name}</p>
            <p className="truncate text-sm text-slate-400">{user.demo ? 'Demo workspace' : user.email}</p>
          </div>
          <Link to="/dashboard" role="menuitem" onClick={close} className={`${linkCls} mt-2 block`}>Dashboard</Link>
          <Link to="/account" role="menuitem" onClick={close} className={`${linkCls} block`}>Account</Link>
          <button role="menuitem" className={`${linkCls} block w-full`} onClick={() => { close(); onSignOut(); }}>Sign Out</button>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const { path, navigate } = useRouter();
  const { user, ready, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const mobileRef = useRef(null);
  const close = () => setOpen(false);
  const signOut = async () => { close(); await logout(); navigate('/'); };
  useDismiss(open, mobileRef, close);

  useEffect(() => { setOpen(false); }, [path]);

  const inDashboard = path === '/dashboard' || path.startsWith('/dashboard/');
  const navLinks = (
    <>
      <SectionLink id="features" className={linkCls} onClick={close}>Features</SectionLink>
      <SectionLink id="usecases" className={linkCls} onClick={close}>Use Cases</SectionLink>
      <a className={linkCls} href={SITE.docs} target="_blank" rel="noreferrer noopener">Docs</a>
      <Link to="/dashboard" onClick={close} aria-current={inDashboard ? 'page' : undefined}
        className={`${linkCls} ${inDashboard ? 'bg-white/10 text-white' : ''}`}>Dashboard</Link>
    </>
  );

  return (
    // The wrapper uses the same horizontal padding as every page, so the bar's edges line up with the content below.
    <header className="pointer-events-none sticky top-0 z-40">
      <div className="wrap pt-3" ref={mobileRef}>
        <div className="nav-bar glass pointer-events-auto flex h-16 items-center justify-between rounded-2xl px-3 sm:px-4 md:grid md:grid-cols-[1fr_auto_1fr]">
          <Link to="/" aria-label="QuantVault home" className="justify-self-start rounded-lg pl-1"><Logo /></Link>

          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">{navLinks}</nav>

          <div className="flex items-center gap-2 md:justify-self-end">
            {ready && user && <UserMenu user={user} onSignOut={signOut} />}
            {ready && !user && (
              <>
                <Link to="/login" className={`${ghostCls} hidden sm:inline-flex`}>Sign In</Link>
                <Link to="/signup" className={`${primaryCls} hidden sm:inline-flex`}>
                  Get Started <IconArrow className="size-4 transition-transform duration-500 group-hover:translate-x-1" />
                </Link>
              </>
            )}
            <button className="grid size-10 place-items-center rounded-xl border border-white/15 bg-white/5 md:hidden" aria-expanded={open} aria-controls="mobile-menu" aria-label="Toggle menu" onClick={() => setOpen((o) => !o)}>
              {open ? <IconClose className="size-5" /> : <IconMenu className="size-5" />}
            </button>
          </div>
        </div>

        {open && (
          <nav id="mobile-menu" aria-label="Mobile" className="menu-panel pointer-events-auto mt-2 flex flex-col gap-1 rounded-2xl p-3 md:hidden">
            {navLinks}
            {ready && !user && (
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                <Link to="/login" onClick={close} className={`${ghostCls} inline-flex`}>Sign In</Link>
                <Link to="/signup" onClick={close} className={`${primaryCls} inline-flex`}>Get Started</Link>
              </div>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
