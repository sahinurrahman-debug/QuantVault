import React from 'react';

// Small stroke icon set (24x24, currentColor). No icon library needed.
const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const make = (children) => (props) => <svg {...base} {...props}>{children}</svg>;

export const IconShield = make(<><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></>);
export const IconClock = make(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconChart = make(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>);
export const IconAtom = make(<><circle cx="12" cy="12" r="1.6" /><ellipse cx="12" cy="12" rx="9" ry="3.8" /><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)" /></>);
export const IconWave = make(<><path d="M2 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0" /></>);
export const IconRoute = make(<><circle cx="5" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><path d="M7 5h6a4 4 0 010 8H9a4 4 0 000 8h8" /></>);
export const IconGithub = make(<><path d="M9 19c-4 1.3-4-2-6-2.5m12 4.5v-3.2c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.3 4.3 0 00-.1-3.2s-1-.3-3.4 1.3a11.7 11.7 0 00-6.2 0C6.1 2.8 5.1 3.1 5.1 3.1a4.3 4.3 0 00-.1 3.2A4.6 4.6 0 003.7 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.200-.5 2V21" /></>);
export const IconLinkedin = make(<><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6zM2 9h4v12H2zM4 4a2 2 0 100 .01" /></>);
export const IconX = make(<><path d="M4 4l16 16M20 4L4 20" /></>);
export const IconYoutube = make(<><rect x="2" y="5" width="20" height="14" rx="4" /><path d="M10 9l5 3-5 3z" /></>);
export const IconArrow = make(<><path d="M5 12h14M13 6l6 6-6 6" /></>);
export const IconMenu = make(<><path d="M4 7h16M4 12h16M4 17h16" /></>);
export const IconClose = make(<><path d="M6 6l12 12M18 6L6 18" /></>);
export const IconStar = (props) => <svg {...base} fill="currentColor" strokeWidth="0" {...props}><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.400l-5.900 3.100 1.200-6.500L2.500 9.400l6.600-.9z" /></svg>;
export const IconInbox = make(<><path d="M3 13l3-8h12l3 8v6H3z" /><path d="M3 13h5l1 3h6l1-3h5" /></>);
export const IconDatabase = make(<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.700 3.600 3 8 3s8-1.300 8-3V5M4 11v6c0 1.700 3.600 3 8 3s8-1.300 8-3v-6" /></>);
export const IconAlert = make(<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></>);
