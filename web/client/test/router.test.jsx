import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, RouterProvider, safeNext, useRouter } from '../src/router.jsx';

describe('safeNext', () => {
  it('accepts same-site paths only', () => {
    expect(safeNext('?next=%2Fdashboard%2Frisk')).toBe('/dashboard/risk');
    expect(safeNext('?next=https%3A%2F%2Fevil.com')).toBeNull();
    expect(safeNext('?next=%2F%2Fevil.com')).toBeNull();
    expect(safeNext('?next=%2F%5Cevil.com')).toBeNull();
    expect(safeNext('')).toBeNull();
  });
});

function Where() {
  const { path } = useRouter();
  return <p data-testid="path">{path}</p>;
}

describe('Link', () => {
  it('navigates in-app and updates the address bar without a reload', async () => {
    render(<RouterProvider><Link to="/dashboard/qkd">go</Link><Where /></RouterProvider>);
    await userEvent.click(screen.getByText('go'));
    expect(screen.getByTestId('path').textContent).toBe('/dashboard/qkd');
    expect(window.location.pathname).toBe('/dashboard/qkd');
  });

  it('leaves modified clicks to the browser (open in a new tab)', async () => {
    render(<RouterProvider><Link to="/login">go</Link><Where /></RouterProvider>);
    fireEvent.click(screen.getByText('go'), { ctrlKey: true });
    expect(screen.getByTestId('path').textContent).toBe('/');
  });
});
