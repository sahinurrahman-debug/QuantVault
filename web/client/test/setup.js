import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no layout engine; these are the few browser APIs the app calls.
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});
