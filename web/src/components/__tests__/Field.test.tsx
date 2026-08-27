/**
 * Ячейка ряда отбора. Важна связка: подпись обязана называть то, что стоит под
 * ней, а группа кнопок — единственный вид элемента, который сам себя назвать не
 * может: у radiogroup нет элемента, на который указал бы `for` подписи.
 * Подпись, висящая над безымянной группой, на экране читается так же, а всему
 * остальному не говорит ничего.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider, SegmentedControl } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Field } from '../Field';

afterEach(cleanup);

const show = (ui: React.ReactNode) => render(<MantineProvider>{ui}</MantineProvider>);

const goal = (labelId: string) => (
  <SegmentedControl
    aria-labelledby={labelId}
    data={[
      { value: 'profit', label: 'Прибыль' },
      { value: 'haul', label: 'Вывоз' },
    ]}
  />
);

describe('Field', () => {
  it('группа кнопок называется своей подписью', () => {
    show(<Field label="Цель">{({ labelId }) => goal(labelId)}</Field>);

    expect(screen.getByRole('radiogroup', { name: 'Цель' })).toBeTruthy();
  });

  it('пояснение показывается под контролом', () => {
    show(
      <Field label="Цель" description="Ранжирование по вывозу требует выпуска">
        {({ labelId }) => goal(labelId)}
      </Field>,
    );

    expect(screen.getByText('Ранжирование по вывозу требует выпуска')).toBeTruthy();
  });

  it('ширина берётся из шкалы, а не из содержимого', () => {
    const { container } = show(
      <Field label="Цель" width="narrow">
        {({ labelId }) => goal(labelId)}
      </Field>,
    );

    expect(container.querySelector('.field-cell')!.getAttribute('data-width')).toBe('narrow');
  });

  it('по умолчанию поле стоит на средней ступени шкалы', () => {
    const { container } = show(<Field label="Цель">{({ labelId }) => goal(labelId)}</Field>);

    expect(container.querySelector('.field-cell')!.getAttribute('data-width')).toBe('normal');
  });
});
