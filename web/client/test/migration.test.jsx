import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({ boardReport: vi.fn(), downloadText: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: { boardReport: mocks.boardReport } }));
vi.mock('../src/lib/download.js', () => ({ downloadText: mocks.downloadText }));

const { default: Migration } = await import('../src/pages/Migration.jsx');

const risk = { results: [], plan: [] };
const meta = { priorities: [], comparison: [], workflow_pqc: [], workflow_qkd: [] };
const show = () => render(<Migration risk={risk} meta={meta} z={20} />);

beforeEach(() => {
  mocks.boardReport.mockReset();
  mocks.downloadText.mockReset();
});

describe('board report download', () => {
  it('saves the Markdown report under a name that records the horizon', async () => {
    mocks.boardReport.mockResolvedValue({ markdown_content: '# Plan', html_content: '<p>Plan</p>' });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Download Report (.md)' }));
    await waitFor(() => expect(mocks.downloadText).toHaveBeenCalledTimes(1));
    expect(mocks.boardReport).toHaveBeenCalledWith(20);
    expect(mocks.downloadText).toHaveBeenCalledWith('QuantVault_Board_Report_Z20yr.md', '# Plan', 'text/markdown');
  });

  it('saves the printable HTML report too', async () => {
    mocks.boardReport.mockResolvedValue({ markdown_content: '# Plan', html_content: '<p>Plan</p>' });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Printable Report (.html)' }));
    await waitFor(() => expect(mocks.downloadText).toHaveBeenCalledWith('QuantVault_Board_Report_Z20yr.html', '<p>Plan</p>', 'text/html'));
  });

  it('shows the server error on the page and re-enables the buttons', async () => {
    mocks.boardReport.mockRejectedValue(new Error('The inventory is empty; add an asset or reset to the sample inventory'));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Download Report (.md)' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The inventory is empty');
    expect(mocks.downloadText).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Download Report (.md)' }).disabled).toBe(false);
  });

  it('does not save an empty file when the server returns an empty report', async () => {
    mocks.boardReport.mockResolvedValue({ markdown_content: '' });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Download Report (.md)' }));
    expect((await screen.findByRole('alert')).textContent).toContain('empty report');
    expect(mocks.downloadText).not.toHaveBeenCalled();
  });
});
