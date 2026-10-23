import React from 'react';

/** Fixed deep-space gradient with three slow ambient blobs. Purely decorative. */
export default function Background() {
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden bg-linear-to-br from-slate-950 via-slate-950 to-purple-950">
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="blob blob-c" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,rgba(2,6,23,0.55)_100%)]" />
    </div>
  );
}
