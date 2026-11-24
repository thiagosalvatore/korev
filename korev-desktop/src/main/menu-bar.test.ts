import { describe, expect, it, vi } from 'vitest';
import { menuBarTemplate, menuBarTitle } from './menu-bar';

function templateWith(running: number) {
  const open = vi.fn();
  const quit = vi.fn();
  return { open, quit, template: menuBarTemplate({ running, open, quit }) };
}

describe('menu bar', () => {
  it('shows the number of working agents next to the icon, and nothing when none work', () => {
    expect(menuBarTitle(0)).toBe('');
    expect(menuBarTitle(3)).toBe('3');
  });

  it('says how many agents are working', () => {
    expect(templateWith(0).template[0].label).toBe('No agents working');
    expect(templateWith(1).template[0].label).toBe('1 agent working');
    expect(templateWith(2).template[0].label).toBe('2 agents working');
  });

  it('opens Korev and quits it from the menu', () => {
    const { open, quit, template } = templateWith(1);
    const click = (label: string) =>
      (template.find((item) => item.label === label)!.click as () => void)();
    click('Open Korev');
    click('Quit Korev');
    expect(open).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
  });
});
