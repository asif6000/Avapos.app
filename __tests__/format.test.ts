import { RESTRICTED_STATES, isDeviceState } from '@/types/domain';
import { createTranslator } from '@/i18n';
import { formatCurrency, isValidBdPhone, maskPhone, normalizePhone, percentOf } from '@/utils/format';

describe('formatting', () => {
  it('formats Bangladeshi Taka with the ৳ symbol', () => {
    expect(formatCurrency(18500)).toBe('৳18,500');
    expect(formatCurrency(0)).toBe('৳0');
    expect(formatCurrency(1250000)).toBe('৳12,50,000');
    expect(formatCurrency(null)).toBe('৳0');
    expect(formatCurrency(2500.5)).toBe('৳2,500.50');
  });

  it('compacts large balances into lakh for the dashboard hero', () => {
    expect(formatCurrency(250000, { compact: true })).toBe('৳2.5 লক্ষ');
  });

  it('validates and normalizes Bangladeshi mobile numbers', () => {
    expect(isValidBdPhone('01712345678')).toBe(true);
    expect(isValidBdPhone('+8801712345678')).toBe(true);
    expect(isValidBdPhone('0171234567')).toBe(false);
    expect(isValidBdPhone('02123456789')).toBe(false);
    expect(normalizePhone('01712345678')).toBe('8801712345678');
    expect(normalizePhone('+880 1712-345678')).toBe('8801712345678');
  });

  it('masks a phone number for display', () => {
    expect(maskPhone('8801712345678')).toBe('880******678');
  });

  it('computes a clamped percentage', () => {
    expect(percentOf(5, 10)).toBe(50);
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(20, 10)).toBe(100);
  });
});

describe('device state model', () => {
  it('guards the restricted-state set', () => {
    expect(RESTRICTED_STATES).toContain('RESTRICTED');
    expect(RESTRICTED_STATES).toContain('SUSPENDED');
    expect(RESTRICTED_STATES).not.toContain('ACTIVE');
  });

  it('rejects unknown device states coming off the wire', () => {
    expect(isDeviceState('ACTIVE')).toBe(true);
    expect(isDeviceState('LOCKED_BY_ROOT')).toBe(false);
    expect(isDeviceState(undefined)).toBe(false);
  });
});

describe('localization', () => {
  const t = createTranslator('en');

  it('returns English strings by default', () => {
    expect(t('common.retry')).toBe('Retry');
  });

  it('interpolates parameters', () => {
    expect(t('auth.otpSubtitle', { phone: '8801712345678' })).toContain('8801712345678');
  });

  it('falls back to English for an unknown key', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });

  it('has a Bengali dictionary covering every English key', () => {
    const bn = createTranslator('bn');
    expect(bn('common.retry')).toBe('আবার চেষ্টা');
    expect(bn('states.RESTRICTED')).toBe('সীমাবদ্ধ');
  });
});
