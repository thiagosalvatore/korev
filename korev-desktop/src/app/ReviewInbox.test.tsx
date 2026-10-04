import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApprovedReview, InboxSnapshot } from '../shared/inbox';
import { installFakeBridge, installMatchMedia } from './fake-bridge';
import { ReviewInbox } from './ReviewInbox';
import {
  APPROVED_REVIEW,
  INVOICE_REVIEW,
  SPIKE_REVIEW,
  makePr,
  makeSnapshot,
} from './test-fixtures';

beforeEach(() => installMatchMedia());
afterEach(cleanup);

function renderInbox(snapshot: InboxSnapshot = makeSnapshot()) {
  const utils = render(
    <ReviewInbox snapshot={snapshot} onOpenSettings={vi.fn()} />,
  );
  const rerenderWith = (next: InboxSnapshot) =>
    utils.rerender(<ReviewInbox snapshot={next} onOpenSettings={vi.fn()} />);
  return { ...utils, rerenderWith };
}

function rowTitled(title: string): HTMLElement {
  return screen.getByRole('option', { name: new RegExp(title) });
}

function optionTitles(): string[] {
  return screen.getAllByRole('option').map((row) => row.textContent ?? '');
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Pull request details' });
}

function reorderedSnapshot(): InboxSnapshot {
  const snapshot = makeSnapshot();
  const [invoice, engine, spike] = snapshot.reviews.entries;
  return {
    ...snapshot,
    reviews: { ...snapshot.reviews, entries: [spike, invoice, engine] },
  };
}

const API_APPROVED: ApprovedReview = {
  ...APPROVED_REVIEW,
  item: {
    ...APPROVED_REVIEW.item,
    pr: makePr(77, 'Drop legacy tokens', { repo: 'acme/api' }),
  },
};

function withApproved(
  entries: InboxSnapshot['reviews']['entries'] = makeSnapshot().reviews.entries,
): InboxSnapshot {
  return makeSnapshot({
    reviews: { entries, approved: [APPROVED_REVIEW, API_APPROVED] },
  });
}

describe('ReviewInbox', () => {
  it('lists requests in one list with the repo on each row, and marks only drafts', () => {
    installFakeBridge();
    renderInbox();
    expect(optionTitles()[0]).toContain(INVOICE_REVIEW.pr.title);
    expect(rowTitled(INVOICE_REVIEW.pr.title).textContent).toContain(
      'acme/billing',
    );
    expect(rowTitled(SPIKE_REVIEW.pr.title).textContent).toContain('acme/api');
    expect(screen.queryByRole('group', { name: 'acme/api' })).toBeNull();
    expect(screen.getAllByText('Draft')).toHaveLength(1);
    expect(rowTitled(SPIKE_REVIEW.pr.title).textContent).toContain('Draft');
  });

  it('keeps already-approved requests from every repo behind one collapsed toggle', async () => {
    installFakeBridge();
    renderInbox(withApproved());
    expect(screen.queryByText(APPROVED_REVIEW.item.pr.title)).toBeNull();
    expect(
      screen.getAllByRole('option', { name: /Already approved/ }),
    ).toHaveLength(1);

    fireEvent.click(rowTitled('Already approved'));

    await waitFor(() => {
      const row = rowTitled(APPROVED_REVIEW.item.pr.title);
      expect(row.textContent).toContain('Approved by @sakce');
      expect(row.textContent).toContain('acme/web');
      expect(within(row).getByText('Approved')).toBeTruthy();
      expect(rowTitled(API_APPROVED.item.pr.title)).toBeTruthy();
    });
  });

  it('says nothing is waiting while still listing approved requests', () => {
    installFakeBridge();
    renderInbox({ ...withApproved([]), reviewCount: 0 });

    expect(screen.getByText('No reviews waiting on you.')).toBeTruthy();
    expect(rowTitled('Already approved')).toBeTruthy();
  });

  it('opens the panel on Enter and returns focus to the row on Escape', () => {
    installFakeBridge();
    renderInbox();
    const row = rowTitled(INVOICE_REVIEW.pr.title);
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });

    expect(within(panel()).getByText('Ready for review')).toBeTruthy();
    expect(within(panel()).getByText(INVOICE_REVIEW.pr.title)).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('complementary')).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it('opens GitHub directly on ⌘Enter', () => {
    const { bridge } = installFakeBridge();
    renderInbox();
    const row = rowTitled(INVOICE_REVIEW.pr.title);
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter', metaKey: true });
    expect(bridge.shell.openGithub).toHaveBeenCalledWith(INVOICE_REVIEW.pr.url);
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('holds a reorder while hovered and applies it from the pill', () => {
    installFakeBridge();
    const { rerenderWith } = renderInbox();
    fireEvent.mouseEnter(screen.getByRole('listbox').parentElement!);

    rerenderWith(reorderedSnapshot());

    expect(optionTitles()[0]).toContain(INVOICE_REVIEW.pr.title);
    fireEvent.click(screen.getByRole('button', { name: /1 update/ }));
    expect(optionTitles()[0]).toContain(SPIKE_REVIEW.pr.title);
  });

  it('applies the first live sync after a cached launch without holding it', () => {
    installFakeBridge();
    const { rerenderWith } = renderInbox(makeSnapshot({ fromCache: true }));
    fireEvent.mouseEnter(screen.getByRole('listbox').parentElement!);

    rerenderWith(reorderedSnapshot());

    expect(optionTitles()[0]).toContain(SPIKE_REVIEW.pr.title);
    expect(screen.queryByRole('button', { name: /update/ })).toBeNull();
  });

  it('keeps the selected PR selected and in the panel across a reorder', () => {
    installFakeBridge();
    const { rerenderWith } = renderInbox();
    fireEvent.click(rowTitled(INVOICE_REVIEW.pr.title));

    rerenderWith(reorderedSnapshot());
    fireEvent.click(screen.getByRole('button', { name: /update/ }));

    const selected = screen.getByRole('option', { selected: true });
    expect(selected.textContent).toContain(INVOICE_REVIEW.pr.title);
    expect(within(panel()).getByText(INVOICE_REVIEW.pr.title)).toBeTruthy();
  });
});
