import { accountLabel } from './format';

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
