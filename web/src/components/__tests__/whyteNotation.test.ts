import { describe, expect, it } from 'vitest';
import { trains as ironHorse } from '../../dataset';
import { vanillaTrains } from '../../vanilla';
import { parseWhyteNotation, whyteNotationLines } from '../whyteNotation';

describe('разбор нотации Уайта', () => {
  it('читает простую формулу', () => {
    const notation = parseWhyteNotation('0-8-4 Abernant');
    expect(notation).toEqual({
      formula: '0-8-4',
      units: [{ leadingWheels: 0, drivingWheels: [8], trailingWheels: 4 }],
    });
  });

  it('формулу из двух групп читает как две ходовые части', () => {
    const notation = parseWhyteNotation('2-6-0+0-6-2 Cardiff');
    expect(notation?.units).toEqual([
      { leadingWheels: 2, drivingWheels: [6], trailingWheels: 0 },
      { leadingWheels: 0, drivingWheels: [6], trailingWheels: 2 },
    ]);
  });

  it('читает две группы ведущих колёс подряд', () => {
    // 0-4-4-0 — две группы ведущих колёс подряд: у Thor это Фэрли, у Alfama — Маллет,
    // ровно поэтому подсказка не называет ни того, ни другого
    expect(parseWhyteNotation('0-4-4-0 Thor')?.units).toEqual([
      { leadingWheels: 0, drivingWheels: [4, 4], trailingWheels: 0 },
    ]);
  });

  it('находит формулу, стоящую не первым словом', () => {
    // единственный ванильный паровоз: поиск с начала строки потерял бы его
    expect(parseWhyteNotation('Wills 2-8-0')?.formula).toBe('2-8-0');
  });

  it('об имени без формулы не говорит ничего', () => {
    expect(parseWhyteNotation('Kirby Paul Tank')).toBeNull();
    expect(parseWhyteNotation('Grub')).toBeNull();
    // пара чисел — не формула: так ловились бы годы и колея
    expect(parseWhyteNotation('Class 9-2')).toBeNull();
  });
});

describe('текст подсказки', () => {
  it('называет колёса и число осей, которое из них выходит', () => {
    const hint = whyteNotationLines(parseWhyteNotation('0-8-4 Abernant')!, 'en').join('\n');
    expect(hint).toContain('Driving wheels: 8 (4 axles)');
    expect(hint).toContain('Trailing wheels: 4 (2 axles)');
    // группа без колёс названа, но работы ей не приписано
    expect(hint).toContain('Leading wheels: none');
    expect(hint).not.toMatch(/Leading wheels: none —/);
    // одна ось — не «1 axles»
    expect(whyteNotationLines(parseWhyteNotation('2-6-4 Bean Feast')!, 'en').join('\n')).toContain(
      'Leading wheels: 2 (1 axle)',
    );
    expect(hint).not.toContain('0 (0 axles)');
  });

  it('о формуле из нескольких групп говорит прямо и размечает части', () => {
    const hint = whyteNotationLines(parseWhyteNotation('2-6-0+0-6-2 Cardiff')!, 'en').join('\n');
    expect(hint).toContain('more than one running unit');
    // сочленённая или две в сцепе — имя не говорит, какая, и подсказка тоже
    expect(hint).toContain('coupled as one');
    expect(hint.match(/Driving wheels/g)).toHaveLength(2);
    // без пометок частей шесть групп читаются одним плоским списком
    expect(hint).toContain('Unit 1');
    expect(hint).toContain('Unit 2');
  });

  it('две группы ведущих колёс называет двумя, а не одной', () => {
    // не одна группа из восьми — и не тип машины, которого формула не определяет
    const hint = whyteNotationLines(parseWhyteNotation('0-4-4-0 Thor')!, 'en').join('\n');
    expect(hint).toContain('Driving wheels: 4 (2 axles) + 4 (2 axles)');
    expect(hint).toContain('groups written in a row');
    expect(hint).not.toMatch(/Mallet|Fairlie|boiler/);
    // ходовая часть одна, значит пометок частей нет
    expect(hint).not.toContain('Unit 1');
  });

  it('следует языку, который ему передали', () => {
    const notation = parseWhyteNotation('0-8-4 Abernant')!;
    expect(whyteNotationLines(notation, 'ru').join('\n')).toContain('Ведущих колёс: 8 (осей: 4)');
    // единственное число по-русски своё: «ось: 1», не «осей: 1»
    expect(whyteNotationLines(parseWhyteNotation('2-6-4 Bean Feast')!, 'ru').join('\n')).toContain(
      'Бегунковых колёс: 2 (ось: 1)',
    );
    expect(whyteNotationLines(notation, 'en').join('\n')).toContain('Driving wheels');
  });
});

describe('данные обоих наборов', () => {
  it('разбирают всякое имя, где цифры соединены дефисом', () => {
    // Набор, называющий машины иначе, обязан уронить тест, а не оставить игрока без
    // подсказки молча. У Iron Horse таких имён 44, у ванили одно.
    // нарочно шире боевой регулярки: любые две цифры через дефис. Набор, записывающий
    // формулы иначе («4-4», четвёртая группа), попадёт сюда и уронит тест — в этом и смысл.
    // Буквенная нотация вроде Bo-Bo за рамками: в её имени нет цифр, чтобы за них зацепиться.
    const candidates = [...ironHorse, ...vanillaTrains].filter((train) =>
      /\d-\d/.test(train.name),
    );
    expect(candidates.length).toBeGreaterThan(40);
    for (const train of candidates) {
      expect(parseWhyteNotation(train.name), train.name).not.toBeNull();
    }
  });

  it('машины без формулы оставляют в покое', () => {
    const hinted = [...ironHorse, ...vanillaTrains].filter(
      (train) => parseWhyteNotation(train.name) !== null,
    );
    // только движки: ни один вагон обоих наборов формулы в имени не носит
    expect(hinted.every((train) => train.kind === 'engine')).toBe(true);
  });
});
