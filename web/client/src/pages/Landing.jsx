import React from 'react';
import { usePageTitle } from '../router.jsx';
import CtaSection from '../components/landing/CtaSection.jsx';
import Features from '../components/landing/Features.jsx';
import Hero from '../components/landing/Hero.jsx';
import UseCases from '../components/landing/UseCases.jsx';

export default function Landing() {
  usePageTitle('QuantVault | Quantum-Aware Cryptographic Risk & Migration');
  return (
    <>
      <Hero />
      <Features />
      <UseCases />
      <CtaSection />
    </>
  );
}
