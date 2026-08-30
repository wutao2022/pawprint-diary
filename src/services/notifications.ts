import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { CARE_LABELS, addDays } from '../constants';
import { CareSchedule, Pet } from '../types';
import { getDatabase } from '../data/database';
import { listCareSchedules, listPets } from '../data/repository';

export const CARE_CHANNEL_ID = 'care-reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function prepareNotifications(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CARE_CHANNEL_ID, {
    name: '护理与健康提醒',
    description: '疫苗、驱虫、用药、体检和护理事项的本地提醒',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 180, 250],
    lightColor: '#6F8F72',
  });
}

export async function notificationPermissionStatus(): Promise<Notifications.PermissionStatus> {
  return (await Notifications.getPermissionsAsync()).status;
}

export async function requestNotificationPermission(): Promise<boolean> {
  await prepareNotifications();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

function notificationDate(schedule: CareSchedule): Date {
  const reminderDate = addDays(schedule.due_date, -schedule.reminder_days);
  const date = new Date(`${reminderDate}T09:00:00`);
  if (date.getTime() <= Date.now()) return new Date(Date.now() + 5000);
  return date;
}

export async function cancelCareNotification(scheduleId: string): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ notification_id: string }>('SELECT notification_id FROM notification_jobs WHERE schedule_id=?', scheduleId);
  if (row?.notification_id) {
    try { await Notifications.cancelScheduledNotificationAsync(row.notification_id); } catch { /* already delivered */ }
  }
  await db.runAsync('DELETE FROM notification_jobs WHERE schedule_id=?', scheduleId);
}

export async function scheduleCareNotification(schedule: CareSchedule, pet: Pet): Promise<string | null> {
  await cancelCareNotification(schedule.id);
  if (schedule.status !== 'pending' || schedule.deleted_at) return null;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return null;
  await prepareNotifications();
  const date = notificationDate(schedule);
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: `${pet.name} · ${CARE_LABELS[schedule.category]}`,
      body: `${schedule.title}，计划日期 ${schedule.due_date}`,
      data: { scheduleId: schedule.id, petId: pet.id, localOnly: true },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: CARE_CHANNEL_ID,
    },
  });
  const db = await getDatabase();
  await db.runAsync(`INSERT INTO notification_jobs(id,schedule_id,notification_id,scheduled_at,created_at)
    VALUES (?,?,?,?,?) ON CONFLICT(schedule_id) DO UPDATE SET notification_id=excluded.notification_id,
    scheduled_at=excluded.scheduled_at,created_at=excluded.created_at`,
  schedule.id, schedule.id, notificationId, date.toISOString(), new Date().toISOString());
  return notificationId;
}

export async function syncPendingNotifications(): Promise<number> {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return 0;
  const [schedules, pets] = await Promise.all([listCareSchedules(undefined, false), listPets()]);
  const petMap = new Map(pets.map((pet) => [pet.id, pet]));
  let count = 0;
  for (const schedule of schedules) {
    const pet = petMap.get(schedule.pet_id);
    if (pet) {
      await scheduleCareNotification(schedule, pet);
      count += 1;
    }
  }
  return count;
}

export async function scheduleTestNotification(seconds = 5): Promise<string> {
  if (!await requestNotificationPermission()) throw new Error('通知权限未开启');
  return Notifications.scheduleNotificationAsync({
    content: {
      title: '爪印日记提醒测试',
      body: '这是一条仅保存在本机的测试通知。',
      data: { localOnly: true, test: true },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: CARE_CHANNEL_ID,
    },
  });
}
