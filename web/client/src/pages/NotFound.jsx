import React from 'react';
import { EmptyState } from '../components/ui.jsx';
import { Link, usePageTitle } from '../router.jsx';

export default function NotFound() {
  usePageTitle('Page Not Found | QuantVault');
  return (
    <section className="wrap py-20">
      <div className="glass mx-auto max-w-xl rounded-3xl p-6 sm:p-10">
        <EmptyState title="Page Not Found" text="The address you followed does not exist. Check the link, or head back to the home page.">
          <Link to="/" className="btn primary mt-2 inline-block">Back to Home</Link>
        </EmptyState>
      </div>
    </section>
  );
}
