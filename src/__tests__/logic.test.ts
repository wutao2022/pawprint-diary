import { addDays, daysBetween, daysUntilAnniversary } from '../constants';
import { isSafeBackupPath } from '../services/backupUtils';

describe('date helpers', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2026-08-30', 3)).toBe('2026-09-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('accepts timestamps when calculating trash expiry', () => {
    expect(addDays('2026-08-30T12:34:56.000Z', 30)).toBe('2026-09-29');
  });

  it('calculates non-negative companion days', () => {
    expect(daysBetween('2026-08-01', '2026-08-30')).toBe(29);
    expect(daysBetween('2026-09-01', '2026-08-30')).toBe(0);
    expect(daysBetween(null)).toBeNull();
  });

  it('calculates the next anniversary across the year boundary', () => {
    expect(daysUntilAnniversary('2020-01-02', '2026-12-31')).toBe(2);
    expect(daysUntilAnniversary('2020-08-30', '2026-08-30')).toBe(0);
  });
});

describe('backup path validation', () => {
  test.each(['database.db', 'files/photos/pet/photo.jpg', 'files/attachments/report.pdf'])(
    'accepts safe relative path %s', (path) => expect(isSafeBackupPath(path)).toBe(true),
  );

  test.each(['', '../database.db', 'files/../../escape', '/absolute/file', '\\server\share', 'files\\windows']) (
    'rejects unsafe archive path %s', (path) => expect(isSafeBackupPath(path)).toBe(false),
  );
});
