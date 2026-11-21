import {
  addSection,
  fromLines,
  moveRow,
  removeSection,
  rowsIn,
  sectionLines,
  type EditorSection,
} from './recipe-editor';

type R = { key: number; section: number | null; name: string };

const keys = () => {
  let n = 100;
  return () => n++;
};

describe('fromLines', () => {
  test('makes one section per name, in order, and ties each row to its section', () => {
    const { sections, rows } = fromLines(
      [
        { name: 'Plater' },
        { name: 'Kjøttdeig', recipeSection: 'Kjøttsaus' },
        { name: 'Melk', recipeSection: 'Hvit saus' },
        { name: 'Løk', recipeSection: 'Kjøttsaus' },
      ],
      keys(),
    );
    expect(sections.map((s) => s.name)).toEqual(['Kjøttsaus', 'Hvit saus']);
    const [meat, white] = sections;
    expect(rows.map((r) => [r.name, r.section])).toEqual([
      ['Plater', null],
      ['Kjøttdeig', meat.key],
      ['Melk', white.key],
      ['Løk', meat.key],
    ]);
  });
});

const sections: EditorSection[] = [
  { key: 1, name: 'Kjøttsaus' },
  { key: 2, name: 'Hvit saus' },
];
const rows: R[] = [
  { key: 10, section: null, name: 'Plater' },
  { key: 11, section: 1, name: 'Kjøttdeig' },
  { key: 12, section: 2, name: 'Melk' },
  { key: 13, section: 1, name: 'Løk' },
];

describe('rowsIn', () => {
  test('lists a section’s rows in order; null is the rows without a section', () => {
    expect(rowsIn(rows, 1).map((r) => r.name)).toEqual(['Kjøttdeig', 'Løk']);
    expect(rowsIn(rows, null).map((r) => r.name)).toEqual(['Plater']);
  });
});

describe('addSection', () => {
  test('adds an empty, unnamed section last', () => {
    expect(addSection(sections, 3)).toEqual([...sections, { key: 3, name: '' }]);
  });
});

describe('moveRow', () => {
  test('puts the row last in its new section', () => {
    const moved = moveRow(rows, 11, 2);
    expect(rowsIn(moved, 2).map((r) => r.name)).toEqual(['Melk', 'Kjøttdeig']);
    expect(rowsIn(moved, 1).map((r) => r.name)).toEqual(['Løk']);
  });

  test('can take a row out of every section', () => {
    expect(rowsIn(moveRow(rows, 12, null), null).map((r) => r.name)).toEqual(['Plater', 'Melk']);
  });
});

describe('removeSection', () => {
  test('its rows join the section above, after that section’s own rows', () => {
    const after = removeSection(sections, rows, 2);
    expect(after.sections.map((s) => s.key)).toEqual([1]);
    expect(rowsIn(after.rows, 1).map((r) => r.name)).toEqual(['Kjøttdeig', 'Løk', 'Melk']);
  });

  test('the first section’s rows go to the rows without a section', () => {
    const after = removeSection(sections, rows, 1);
    expect(rowsIn(after.rows, null).map((r) => r.name)).toEqual(['Plater', 'Kjøttdeig', 'Løk']);
    expect(rowsIn(after.rows, 2).map((r) => r.name)).toEqual(['Melk']);
  });
});

describe('sectionLines', () => {
  test('orders rows for saving; a section without a name joins the one above', () => {
    const named = [...sections, { key: 3, name: '   ' }];
    const withBlank = [...rows, { key: 14, section: 3, name: 'Ost' }];
    expect(sectionLines(withBlank, named).map((l) => [l.name, l.recipeSection])).toEqual([
      ['Plater', undefined],
      ['Kjøttdeig', 'Kjøttsaus'],
      ['Løk', 'Kjøttsaus'],
      ['Melk', 'Hvit saus'],
      ['Ost', 'Hvit saus'],
    ]);
    const firstBlank = [{ key: 5, name: '' }];
    expect(
      sectionLines([{ key: 1, section: 5, name: 'Salt' }], firstBlank).map((l) => l.recipeSection),
    ).toEqual([undefined]);
  });
});
