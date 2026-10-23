import React, { useEffect, useRef, useState } from 'react';

/** True once the element has scrolled into view (immediately when motion is reduced or unsupported). */
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) { setShown(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); io.disconnect(); }
    }, { threshold, rootMargin: '0px 0px -6% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, shown];
}

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, shown] = useInView();
  return (
    <Tag ref={ref} className={`reveal ${shown ? 'reveal-in' : ''} ${className}`}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }} {...rest}>
      {children}
    </Tag>
  );
}

/** Word-by-word fade-in text for headings. Screen readers get the full sentence. */
export function FadeText({ as: Tag = 'h2', text, className = '', delay = 0, step = 55, ...rest }) {
  const [ref, shown] = useInView(0.3);
  return (
    <Tag ref={ref} aria-label={text} className={`${shown ? 'reveal-in' : ''} ${className}`} {...rest}>
      {text.split(' ').map((word, i) => (
        <span key={`${word}-${i}`} aria-hidden="true" className="fade-word"
          style={{ transitionDelay: shown ? `${delay + i * step}ms` : '0ms' }}>
          {word}{' '}
        </span>
      ))}
    </Tag>
  );
}
