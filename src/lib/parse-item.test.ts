import { parseItemInput } from './parse-item';

test.each([
  ['2 l melk', { name: 'melk', qty: 2, unit: 'l' }],
  ['1,5 kg poteter', { name: 'poteter', qty: 1.5, unit: 'kg' }],
  ['3 onions', { name: 'onions', qty: 3 }],
  ['500g mince', { name: 'mince', qty: 500, unit: 'g' }],
  ['coffee', { name: 'coffee' }],
  ['  dish   soap ', { name: 'dish soap' }],
  ['7up', { name: '7up' }],
  ['2 l', { name: '2 l' }],
  ['2', { name: '2' }],
])('%s', (input, expected) => {
  expect(parseItemInput(input)).toEqual(expected);
});
