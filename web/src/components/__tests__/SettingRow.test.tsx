/**
 * Ряд настройки: подпись слева называет элемент справа, а подсказка под подписью его
 * описывает — ровно пока подсказка есть. Описание, оставшееся ссылкой на пропавшую подсказку,
 * ничего не описывает.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider, Switch } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingRow } from '../SettingRow';

afterEach(cleanup);

function row(hint?: string) {
  return (
    <MantineProvider>
      <SettingRow label="Поломки транспорта" hint={hint}>
        <Switch checked={false} onChange={() => {}} label="выкл." />
      </SettingRow>
    </MantineProvider>
  );
}

const description = (control: HTMLElement) => {
  const id = control.getAttribute('aria-describedby');
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
};

describe('ряд настройки', () => {
  it('называет переключатель настройкой, а не его состоянием', () => {
    render(row('Как часто ломается транспорт'));
    const control = screen.getByRole('switch', { name: 'Поломки транспорта' });
    expect(description(control)).toBe('Как часто ломается транспорт');
  });

  it('перестаёт описывать элемент, когда подсказка пропала', () => {
    const view = render(row('Как часто ломается транспорт'));
    view.rerender(row());
    const control = screen.getByRole('switch', { name: 'Поломки транспорта' });
    expect(control.hasAttribute('aria-describedby')).toBe(false);
  });
});
