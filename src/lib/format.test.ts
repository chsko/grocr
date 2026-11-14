import { accountLabel, formatKroner, priceInput } from './format';

describe('accountLabel', () => {
  test('shows the email, or the name without one', () => {
    expect(accountLabel({ email: 'kari@example.no', name: 'Kari' }, 'hidden')).toBe(
      'kari@example.no',
    );
    expect(accountLabel({ name: 'Kari' }, 'hidden')).toBe('Kari');
  });

  test("hides Apple's relay addresses", () => {
    expect(accountLabel({ email: 'abc@privaterelay.appleid.com', name: 'Kari' }, 'hidden')).toBe(
      'hidden',
    );
  });
});

describe('formatKroner', () => {
  test('groups thousands and shows øre only when there are some', () => {
    expect(formatKroner('en', 1299.5)).toBe('1,299.50 kr');
    expect(formatKroner('en', 300)).toBe('300 kr');
    expect(formatKroner('nb', 1299.5).replace(/\s/g, ' ')).toBe('1 299,50 kr');
  });

  test('edit fields use the language decimal mark', () => {
    expect(priceInput('nb', 49.9)).toBe('49,9');
    expect(priceInput('en', 49.9)).toBe('49.9');
    expect(priceInput('en', null)).toBe('');
  });
});
