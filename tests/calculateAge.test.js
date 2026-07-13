const calculateAge = require('../src/utils/calculateAge');

describe('calculateAge', () => {
  it('computes age when the birthday has already passed this year', () => {
    const age = calculateAge('1995-01-15', new Date('2026-07-12'));
    expect(age).toBe(31);
  });

  it('computes age when the birthday has not happened yet this year', () => {
    const age = calculateAge('1995-12-15', new Date('2026-07-12'));
    expect(age).toBe(30);
  });

  it('computes age correctly on the exact birthday', () => {
    const age = calculateAge('1995-07-12', new Date('2026-07-12'));
    expect(age).toBe(31);
  });
});
