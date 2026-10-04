import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CheckboxMenu, type CheckboxMenuGroup } from './CheckboxMenu';

const GROUPS: CheckboxMenuGroup[] = [
  {
    id: 'acme',
    label: 'acme',
    items: [
      { id: 'acme/api', label: 'api' },
      { id: 'acme/web', label: 'web' },
    ],
  },
];

function setPopoverState(element: HTMLElement, newState: 'open' | 'closed') {
  for (const type of ['beforetoggle', 'toggle']) {
    element.dispatchEvent(Object.assign(new Event(type), { newState }));
  }
}

function stubPopoverApi() {
  HTMLElement.prototype.showPopover = function () {
    setPopoverState(this, 'open');
  };
  HTMLElement.prototype.hidePopover = function () {
    setPopoverState(this, 'closed');
  };
  document.addEventListener('click', (event) => {
    const trigger = (event.target as Element).closest('[popovertarget]');
    const panel = document.getElementById(
      trigger?.getAttribute('popovertarget') ?? '',
    );
    if (panel) panel.showPopover();
  });
}

beforeAll(stubPopoverApi);
afterEach(cleanup);

function renderMenu(selected: string[] = ['acme/api']) {
  const onChange = vi.fn();
  render(
    <CheckboxMenu
      label="Repo filter"
      triggerLabel="1 of 2 repos"
      groups={GROUPS}
      selected={selected}
      onChange={onChange}
      resetLabel="Show all repos"
      onReset={vi.fn()}
    />,
  );
  return {
    onChange,
    trigger: screen.getByRole('button', { name: 'Repo filter' }),
  };
}

describe('CheckboxMenu', () => {
  it('checks every repo of an owner from the owner checkbox', () => {
    const { onChange } = renderMenu();
    const owner = screen.getByRole('checkbox', {
      name: 'acme',
      hidden: true,
    }) as HTMLInputElement;
    expect(owner.indeterminate).toBe(true);

    fireEvent.click(owner);

    expect(onChange).toHaveBeenCalledWith(['acme/api', 'acme/web']);
  });

  it('closes on Escape without letting the key reach other handlers, and returns focus', () => {
    const sidePanelEscape = vi.fn();
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) sidePanelEscape();
    });
    const { trigger } = renderMenu();

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(
      screen.getByRole('checkbox', { name: 'acme', hidden: true }),
    );
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

    expect(sidePanelEscape).not.toHaveBeenCalled();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});
