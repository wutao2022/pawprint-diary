import * as Crypto from 'expo-crypto';
import { addDays, nowIso, todayIso } from '../constants';
import {
  AppSnapshot, Attachment, CareInput, CareRecord, CareSchedule, HealthInput, HealthRecord,
  Pet, PetInput, PetPhoto, TimelineEntry, TimelineInput, TrashItem,
} from '../types';
import { getDatabase } from './database';

const id = () => Crypto.randomUUID();
const active = 'deleted_at IS NULL';

export async function listPets(): Promise<Pet[]> {
  return (await getDatabase()).getAllAsync<Pet>(`SELECT * FROM pets WHERE ${active} ORDER BY created_at`);
}

export async function createPet(input: PetInput): Promise<string> {
  const db = await getDatabase();
  const petId = id();
  const now = nowIso();
  await db.runAsync(`INSERT INTO pets (
    id,name,species,breed,sex,birth_date,home_date,color,initial_weight,target_weight_min,target_weight_max,neutered,neutered_date,
    microchip,allergies,chronic_conditions,long_term_medications,hospital,veterinarian,hospital_phone,
    owner_phone,notes,created_at,updated_at,deleted_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
  petId, input.name.trim(), input.species, input.breed, input.sex, input.birth_date, input.home_date,
  input.color, input.initial_weight, input.target_weight_min, input.target_weight_max, input.neutered, input.neutered_date, input.microchip, input.allergies,
  input.chronic_conditions, input.long_term_medications, input.hospital, input.veterinarian,
  input.hospital_phone, input.owner_phone, input.notes, now, now);
  if (input.initial_weight) {
    await createHealthRecord({
      pet_id: petId, type: 'weight', occurred_at: todayIso(), title: '初始体重', weight: input.initial_weight,
      body_condition: null, symptoms: '', mood: '', appetite: '', water: '', stool: '', diagnosis: '',
      treatment: '', medication: '', dosage: '', frequency: '', course: '', cost: null, notes: '',
    });
  }
  return petId;
}

export async function updatePet(petId: string, input: PetInput): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE pets SET name=?,species=?,breed=?,sex=?,birth_date=?,home_date=?,color=?,
    initial_weight=?,target_weight_min=?,target_weight_max=?,neutered=?,neutered_date=?,microchip=?,allergies=?,chronic_conditions=?,
    long_term_medications=?,hospital=?,veterinarian=?,hospital_phone=?,owner_phone=?,notes=?,updated_at=?
    WHERE id=? AND ${active}`,
  input.name.trim(), input.species, input.breed, input.sex, input.birth_date, input.home_date, input.color,
  input.initial_weight, input.target_weight_min, input.target_weight_max, input.neutered, input.neutered_date, input.microchip, input.allergies,
  input.chronic_conditions, input.long_term_medications, input.hospital, input.veterinarian,
  input.hospital_phone, input.owner_phone, input.notes, nowIso(), petId);
}

export async function listPetPhotos(petId?: string): Promise<PetPhoto[]> {
  const db = await getDatabase();
  return petId
    ? db.getAllAsync<PetPhoto>('SELECT * FROM pet_photos WHERE pet_id=? ORDER BY position', petId)
    : db.getAllAsync<PetPhoto>('SELECT * FROM pet_photos WHERE pet_id IN (SELECT id FROM pets WHERE deleted_at IS NULL) ORDER BY pet_id, position');
}

export async function addPetPhoto(petId: string, relativePath: string): Promise<string> {
  const db = await getDatabase();
  const count = await db.getFirstAsync<{ total: number }>('SELECT COUNT(*) total FROM pet_photos WHERE pet_id=?', petId);
  if ((count?.total ?? 0) >= 5) throw new Error('每只宠物最多保存 5 张照片');
  const photoId = id();
  const position = count?.total ?? 0;
  await db.runAsync('INSERT INTO pet_photos(id,pet_id,relative_path,position,is_primary,created_at) VALUES (?,?,?,?,?,?)',
    photoId, petId, relativePath, position, position === 0 ? 1 : 0, nowIso());
  return photoId;
}

export async function setPrimaryPhoto(petId: string, photoId: string): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE pet_photos SET is_primary=0 WHERE pet_id=?', petId);
    await txn.runAsync('UPDATE pet_photos SET is_primary=1 WHERE id=? AND pet_id=?', photoId, petId);
  });
}

export async function movePetPhoto(petId: string, photoId: string, delta: number): Promise<void> {
  const db = await getDatabase();
  const photos = await listPetPhotos(petId);
  const index = photos.findIndex((photo) => photo.id === photoId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= photos.length) return;
  const other = photos[target]!;
  const current = photos[index]!;
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE pet_photos SET position=? WHERE id=?', other.position, current.id);
    await txn.runAsync('UPDATE pet_photos SET position=? WHERE id=?', current.position, other.id);
  });
}

export async function deletePetPhoto(petId: string, photoId: string): Promise<string> {
  const db = await getDatabase();
  const photos = await listPetPhotos(petId);
  if (photos.length <= 1) throw new Error('添加照片后至少保留 1 张，可使用“替换照片”更新');
  const photo = photos.find((item) => item.id === photoId);
  if (!photo) throw new Error('照片不存在');
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM pet_photos WHERE id=?', photoId);
    const remaining = photos.filter((item) => item.id !== photoId);
    for (let index = 0; index < remaining.length; index += 1) {
      await txn.runAsync('UPDATE pet_photos SET position=?,is_primary=? WHERE id=?', index, photo.is_primary && index === 0 ? 1 : remaining[index]!.is_primary, remaining[index]!.id);
    }
  });
  return photo.relative_path;
}

export async function replacePetPhoto(petId: string, photoId: string, relativePath: string): Promise<string> {
  const db = await getDatabase();
  const photo = await db.getFirstAsync<PetPhoto>('SELECT * FROM pet_photos WHERE id=? AND pet_id=?', photoId, petId);
  if (!photo) throw new Error('照片不存在');
  await db.runAsync('UPDATE pet_photos SET relative_path=? WHERE id=? AND pet_id=?', relativePath, photoId, petId);
  return photo.relative_path;
}

export async function listCareSchedules(petId?: string, includeCompleted = true): Promise<CareSchedule[]> {
  const db = await getDatabase();
  const status = includeCompleted ? '' : " AND status='pending'";
  return petId
    ? db.getAllAsync<CareSchedule>(`SELECT * FROM care_schedules WHERE pet_id=? AND ${active}${status} ORDER BY due_date`, petId)
    : db.getAllAsync<CareSchedule>(`SELECT * FROM care_schedules WHERE ${active} AND pet_id IN (SELECT id FROM pets WHERE deleted_at IS NULL)${status} ORDER BY due_date`);
}

export async function createCareSchedule(input: CareInput): Promise<string> {
  const db = await getDatabase();
  const careId = id();
  const now = nowIso();
  await db.runAsync(`INSERT INTO care_schedules(id,pet_id,category,title,last_completed_date,due_date,
    recurrence_days,reminder_days,status,notes,hospital,cost,created_at,updated_at,deleted_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`, careId, input.pet_id, input.category, input.title.trim(),
  input.last_completed_date, input.due_date, input.recurrence_days, input.reminder_days, 'pending', input.notes,
  input.hospital, input.cost, now, now);
  return careId;
}

export async function updateCareSchedule(careId: string, input: CareInput): Promise<void> {
  await (await getDatabase()).runAsync(`UPDATE care_schedules SET pet_id=?,category=?,title=?,last_completed_date=?,
    due_date=?,recurrence_days=?,reminder_days=?,notes=?,hospital=?,cost=?,status='pending',updated_at=? WHERE id=? AND ${active}`,
  input.pet_id, input.category, input.title.trim(), input.last_completed_date, input.due_date, input.recurrence_days,
  input.reminder_days, input.notes, input.hospital, input.cost, nowIso(), careId);
}

export async function actOnCare(careId: string, action: 'completed' | 'skipped', occurredAt = todayIso()): Promise<string | null> {
  const db = await getDatabase();
  const schedule = await db.getFirstAsync<CareSchedule>('SELECT * FROM care_schedules WHERE id=? AND deleted_at IS NULL', careId);
  if (!schedule) throw new Error('护理计划不存在');
  let nextId: string | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE care_schedules SET status=?,last_completed_date=?,updated_at=? WHERE id=?', action, action === 'completed' ? occurredAt : schedule.last_completed_date, nowIso(), careId);
    await txn.runAsync(`INSERT INTO care_records(id,schedule_id,pet_id,category,title,action,occurred_at,notes,cost,created_at,deleted_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,NULL)`, id(), careId, schedule.pet_id, schedule.category, schedule.title, action, occurredAt, schedule.notes, schedule.cost, nowIso());
    if (action === 'completed' && schedule.recurrence_days) {
      nextId = id();
      await txn.runAsync(`INSERT INTO care_schedules(id,pet_id,category,title,last_completed_date,due_date,recurrence_days,
        reminder_days,status,notes,hospital,cost,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
      nextId, schedule.pet_id, schedule.category, schedule.title, occurredAt, addDays(occurredAt, schedule.recurrence_days),
      schedule.recurrence_days, schedule.reminder_days, 'pending', schedule.notes, schedule.hospital, schedule.cost, nowIso(), nowIso());
    }
  });
  return nextId;
}

export async function snoozeCare(careId: string, days = 1): Promise<void> {
  const db = await getDatabase();
  const schedule = await db.getFirstAsync<CareSchedule>('SELECT * FROM care_schedules WHERE id=?', careId);
  if (!schedule) throw new Error('护理计划不存在');
  await db.runAsync('UPDATE care_schedules SET due_date=?,status=\'pending\',updated_at=? WHERE id=?', addDays(todayIso(), days), nowIso(), careId);
}

export async function listCareRecords(petId?: string): Promise<CareRecord[]> {
  const db = await getDatabase();
  return petId
    ? db.getAllAsync<CareRecord>(`SELECT * FROM care_records WHERE pet_id=? AND ${active} ORDER BY occurred_at DESC`, petId)
    : db.getAllAsync<CareRecord>(`SELECT * FROM care_records WHERE ${active} AND pet_id IN (SELECT id FROM pets WHERE deleted_at IS NULL) ORDER BY occurred_at DESC`);
}

export async function createCareRecord(input: Omit<CareRecord, 'id' | 'schedule_id' | 'created_at' | 'deleted_at'>): Promise<string> {
  const recordId = id();
  await (await getDatabase()).runAsync(`INSERT INTO care_records(
    id,schedule_id,pet_id,category,title,action,occurred_at,notes,cost,created_at,deleted_at
  ) VALUES (?,NULL,?,?,?,?,?,?,?,?,NULL)`, recordId, input.pet_id, input.category, input.title.trim(), input.action,
  input.occurred_at, input.notes, input.cost, nowIso());
  return recordId;
}

export async function updateCareRecord(recordId: string, input: Omit<CareRecord, 'id' | 'schedule_id' | 'created_at' | 'deleted_at'>): Promise<void> {
  await (await getDatabase()).runAsync(`UPDATE care_records SET pet_id=?,category=?,title=?,action=?,occurred_at=?,
    notes=?,cost=? WHERE id=? AND ${active}`, input.pet_id, input.category, input.title.trim(), input.action,
  input.occurred_at, input.notes, input.cost, recordId);
}

export async function listHealthRecords(petId?: string): Promise<HealthRecord[]> {
  const db = await getDatabase();
  return petId
    ? db.getAllAsync<HealthRecord>(`SELECT * FROM health_records WHERE pet_id=? AND ${active} ORDER BY occurred_at DESC,created_at DESC`, petId)
    : db.getAllAsync<HealthRecord>(`SELECT * FROM health_records WHERE ${active} AND pet_id IN (SELECT id FROM pets WHERE deleted_at IS NULL) ORDER BY occurred_at DESC,created_at DESC`);
}

export async function createHealthRecord(input: HealthInput): Promise<string> {
  const db = await getDatabase();
  const recordId = id();
  const now = nowIso();
  await db.runAsync(`INSERT INTO health_records(id,pet_id,type,occurred_at,title,weight,body_condition,symptoms,
    mood,appetite,water,stool,diagnosis,treatment,medication,dosage,frequency,course,cost,notes,created_at,
    updated_at,deleted_at,archived) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,0)`,
  recordId, input.pet_id, input.type, input.occurred_at, input.title.trim(), input.weight, input.body_condition,
  input.symptoms, input.mood, input.appetite, input.water, input.stool, input.diagnosis, input.treatment,
  input.medication, input.dosage, input.frequency, input.course, input.cost, input.notes, now, now);
  return recordId;
}

export async function updateHealthRecord(recordId: string, input: HealthInput): Promise<void> {
  await (await getDatabase()).runAsync(`UPDATE health_records SET pet_id=?,type=?,occurred_at=?,title=?,weight=?,
    body_condition=?,symptoms=?,mood=?,appetite=?,water=?,stool=?,diagnosis=?,treatment=?,medication=?,dosage=?,
    frequency=?,course=?,cost=?,notes=?,updated_at=? WHERE id=? AND ${active}`,
  input.pet_id, input.type, input.occurred_at, input.title.trim(), input.weight, input.body_condition, input.symptoms,
  input.mood, input.appetite, input.water, input.stool, input.diagnosis, input.treatment, input.medication,
  input.dosage, input.frequency, input.course, input.cost, input.notes, nowIso(), recordId);
}

export async function listTimeline(petId?: string): Promise<TimelineEntry[]> {
  const db = await getDatabase();
  return petId
    ? db.getAllAsync<TimelineEntry>(`SELECT * FROM timeline_entries WHERE pet_id=? AND ${active} ORDER BY occurred_at DESC,created_at DESC`, petId)
    : db.getAllAsync<TimelineEntry>(`SELECT * FROM timeline_entries WHERE ${active} AND pet_id IN (SELECT id FROM pets WHERE deleted_at IS NULL) ORDER BY occurred_at DESC,created_at DESC`);
}

export async function createTimelineEntry(input: TimelineInput): Promise<string> {
  const db = await getDatabase();
  const entryId = id();
  const now = nowIso();
  await db.runAsync(`INSERT INTO timeline_entries(id,pet_id,type,occurred_at,title,note,location,relative_photo_path,
    created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,NULL)`, entryId, input.pet_id, input.type,
  input.occurred_at, input.title.trim(), input.note, input.location, input.relative_photo_path, now, now);
  return entryId;
}

export async function updateTimelineEntry(entryId: string, input: TimelineInput): Promise<void> {
  await (await getDatabase()).runAsync(`UPDATE timeline_entries SET pet_id=?,type=?,occurred_at=?,title=?,note=?,
    location=?,relative_photo_path=?,updated_at=? WHERE id=? AND ${active}`, input.pet_id, input.type,
  input.occurred_at, input.title.trim(), input.note, input.location, input.relative_photo_path, nowIso(), entryId);
}

export async function listAttachments(petId?: string): Promise<Attachment[]> {
  const db = await getDatabase();
  return petId
    ? db.getAllAsync<Attachment>(`SELECT * FROM attachments WHERE pet_id=? AND ${active} ORDER BY occurred_at DESC`, petId)
    : db.getAllAsync<Attachment>(`SELECT * FROM attachments WHERE ${active} AND pet_id IN (SELECT id FROM pets WHERE deleted_at IS NULL) ORDER BY occurred_at DESC`);
}

export async function createAttachment(input: Omit<Attachment, 'id' | 'created_at' | 'deleted_at'>): Promise<string> {
  const attachmentId = id();
  await (await getDatabase()).runAsync(`INSERT INTO attachments(id,pet_id,owner_type,owner_id,category,display_name,
    mime_type,relative_path,occurred_at,notes,created_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)`,
  attachmentId, input.pet_id, input.owner_type, input.owner_id, input.category, input.display_name, input.mime_type,
  input.relative_path, input.occurred_at, input.notes, nowIso());
  return attachmentId;
}

export async function updateAttachment(attachmentId: string, input: Omit<Attachment, 'id' | 'created_at' | 'deleted_at'>): Promise<void> {
  await (await getDatabase()).runAsync(`UPDATE attachments SET pet_id=?,owner_type=?,owner_id=?,category=?,display_name=?,
    mime_type=?,relative_path=?,occurred_at=?,notes=? WHERE id=? AND ${active}`,
  input.pet_id, input.owner_type, input.owner_id, input.category, input.display_name, input.mime_type,
  input.relative_path, input.occurred_at, input.notes, attachmentId);
}

const trashTable: Record<string, string> = {
  pet: 'pets', care: 'care_schedules', care_record: 'care_records', health: 'health_records',
  timeline: 'timeline_entries', attachment: 'attachments',
};

export async function moveToTrash(entityType: keyof typeof trashTable, entityId: string): Promise<void> {
  const table = trashTable[entityType];
  if (!table) throw new Error('不支持的回收类型');
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id=? AND deleted_at IS NULL`, entityId);
  if (!row) throw new Error('记录不存在或已删除');
  const deletedAt = nowIso();
  const expiresAt = addDays(deletedAt, 30);
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(`UPDATE ${table} SET deleted_at=? WHERE id=?`, deletedAt, entityId);
    await txn.runAsync('INSERT INTO trash(id,entity_type,entity_id,payload_json,deleted_at,expires_at) VALUES (?,?,?,?,?,?)',
      id(), entityType, entityId, JSON.stringify(row), deletedAt, expiresAt);
  });
}

export async function listTrash(): Promise<TrashItem[]> {
  const db = await getDatabase();
  const expired = await db.getAllAsync<TrashItem>('SELECT * FROM trash WHERE expires_at<?', nowIso());
  for (const item of expired) {
    const table = trashTable[item.entity_type];
    if (table) await db.runAsync(`DELETE FROM ${table} WHERE id=? AND deleted_at IS NOT NULL`, item.entity_id);
    await db.runAsync('DELETE FROM trash WHERE id=?', item.id);
  }
  return db.getAllAsync<TrashItem>('SELECT * FROM trash ORDER BY deleted_at DESC');
}

export async function restoreTrash(trashId: string): Promise<void> {
  const db = await getDatabase();
  const item = await db.getFirstAsync<TrashItem>('SELECT * FROM trash WHERE id=?', trashId);
  if (!item) throw new Error('回收站项目不存在');
  const table = trashTable[item.entity_type];
  if (!table) throw new Error('不支持的回收类型');
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(`UPDATE ${table} SET deleted_at=NULL WHERE id=?`, item.entity_id);
    await txn.runAsync('DELETE FROM trash WHERE id=?', trashId);
  });
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await (await getDatabase()).getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await (await getDatabase()).runAsync(`INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`, key, value, nowIso());
}

export async function getSnapshot(): Promise<AppSnapshot> {
  const [pets, photos, careSchedules, careRecords, healthRecords, timeline, attachments] = await Promise.all([
    listPets(), listPetPhotos(), listCareSchedules(), listCareRecords(), listHealthRecords(), listTimeline(), listAttachments(),
  ]);
  return { pets, photos, careSchedules, careRecords, healthRecords, timeline, attachments };
}

export async function getCounts(): Promise<Record<string, number>> {
  const db = await getDatabase();
  const tables = ['pets', 'pet_photos', 'care_schedules', 'care_records', 'health_records', 'timeline_entries', 'attachments', 'trash'];
  const result: Record<string, number> = {};
  for (const table of tables) {
    const row = await db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) total FROM ${table}`);
    result[table] = row?.total ?? 0;
  }
  return result;
}
