/**
 * Имя машины и подсказка, объясняющая её формулу. Важна связка: машина с формулой в имени
 * получает подсказку, машина без формулы рисуется простым текстом — ни пустого тултипа, ни
 * обёртки, от которой поедет строка списка.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { VehicleName } from '../VehicleName';

afterEach(cleanup);

const show = (ui: React.ReactNode) => render(<MantineProvider>{ui}</MantineProvider>);

describe('имя машины', () => {
  it('объясняет формулу машины, у которой она есть', async () => {
    show(<VehicleName train={{ name: '0-8-4 Abernant' }} />);
    await userEvent.hover(screen.getByText('0-8-4 Abernant'));
    expect(await screen.findByText(/Driving wheels: 8 \(4 axles\)/)).toBeTruthy();
  });

  it('имя без формулы оставляет простым текстом', () => {
    // меряем на своём узле: MantineProvider кладёт в контейнер ещё и свой лист стилей
    show(
      <span data-testid="host">
        <VehicleName train={{ name: 'Kirby Paul Tank' }} />
      </span>,
    );
    const host = screen.getByTestId('host');
    expect(host.textContent).toBe('Kirby Paul Tank');
    // вокруг ничего: строка списка не должна ехать в зависимости от машины
    expect(host.children).toHaveLength(0);
  });

  it('показывает подпись списка, объясняя машину за ней', async () => {
    // в подписи формулы нарочно нет: подсказка обязана браться из имени машины
    show(<VehicleName train={{ name: '0-8-0 Haar' }} label="2× Haar" />);
    await userEvent.hover(screen.getByText('2× Haar'));
    expect(await screen.findByText(/Whyte notation 0-8-0/)).toBeTruthy();
  });
});
