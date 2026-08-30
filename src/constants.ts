import { CareCategory, HealthType } from './types';

export const COLORS = {
  sage: '#6F8F72',
  sageDark: '#48654D',
  mint: '#DDEADF',
  cream: '#F8F5EE',
  sand: '#ECE3D4',
  coral: '#E98266',
  blush: '#F3E1DF',
  apricot: '#F4D8C8',
  rose: '#BD7475',
  brick: '#A9574D',
  ink: '#26332A',
  muted: '#6D786F',
  white: '#FFFFFF',
  line: '#DFE5DD',
};

export const CARE_LABELS: Record<CareCategory, string> = {
  vaccine: '疫苗',
  deworm_internal: '体内驱虫',
  deworm_external: '体外驱虫',
  medication: '用药',
  checkup: '体检',
  bath: '洗澡',
  grooming: '美容',
  nails: '剪指甲',
  dental: '洁牙/刷牙',
  ears: '清洁耳朵',
  custom: '自定义护理',
};

export const HEALTH_LABELS: Record<HealthType, string> = {
  weight: '体重',
  symptom: '症状/异常',
  visit: '就诊',
  medication: '用药记录',
  daily: '健康状态',
};

const localDateIso = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
export const todayIso = () => localDateIso(new Date());
export const nowIso = () => new Date().toISOString();
export const addDays = (date: string, days: number) => {
  const value = new Date(`${date.slice(0, 10)}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};
export const formatDate = (value: string | null) => value ? value.slice(0, 10) : '未填写';
export const daysBetween = (from: string | null, to = todayIso()) => {
  if (!from) return null;
  const start = new Date(`${from.slice(0, 10)}T00:00:00`).getTime();
  const end = new Date(`${to.slice(0, 10)}T00:00:00`).getTime();
  return Math.max(0, Math.floor((end - start) / 86400000));
};
export const daysUntilAnniversary = (date: string | null, today = todayIso()) => {
  if (!date) return null;
  const [, month, day] = date.slice(0, 10).split('-').map(Number);
  const [year, todayMonth, todayDay] = today.split('-').map(Number);
  if (!month || !day || !year || !todayMonth || !todayDay) return null;
  const now = new Date(year, todayMonth - 1, todayDay, 12);
  let target = new Date(year, month - 1, day, 12);
  if (target < now) target = new Date(year + 1, month - 1, day, 12);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
};
