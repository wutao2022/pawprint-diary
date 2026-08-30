import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as IntentLauncher from 'expo-intent-launcher';
import { CARE_LABELS, COLORS, HEALTH_LABELS, todayIso } from '../constants';
import { importPrivateFile, removePrivateFile, resolvePrivateUri } from '../data/files';
import {
  addPetPhoto, createAttachment, createCareRecord, createCareSchedule, createHealthRecord, createPet, createTimelineEntry,
  deletePetPhoto, listTrash, movePetPhoto, replacePetPhoto, restoreTrash, setPrimaryPhoto, updateAttachment,
  updateCareRecord, updateCareSchedule, updateHealthRecord, updatePet, updateTimelineEntry,
} from '../data/repository';
import { useApp } from '../state/AppContext';
import {
  Attachment, CareCategory, CareInput, CareRecord, CareSchedule, HealthInput, HealthRecord, HealthType, Pet, PetInput,
  TimelineEntry, TimelineInput, TrashItem,
} from '../types';
import { scheduleCareNotification } from '../services/notifications';
import { Button, Card, Chip, Empty, Field, Loading, SectionTitle } from './ui';

const dateValid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
const numberOrNull = (value: string) => value.trim() ? Number(value) : null;

function showError(error: unknown) {
  Alert.alert('操作未完成', error instanceof Error ? error.message : '发生未知错误');
}

async function captureImage(options: { allowsEditing?: boolean; aspect?: [number, number]; quality?: number } = {}) {
  const current = await ImagePicker.getCameraPermissionsAsync();
  const permission = current.granted ? current : await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      '相机权限未开启',
      '你仍可从系统相册选择图片；如需拍照，请在系统设置中允许爪印日记使用相机。',
      [{ text: '稍后', style: 'cancel' }, { text: '打开设置', onPress: () => Linking.openSettings() }],
    );
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.88, ...options });
  return result.canceled ? null : result.assets[0]!;
}

const blankPet = (): PetInput => ({
  name: '', species: '猫', breed: '', sex: '', birth_date: null, home_date: todayIso(), color: '', initial_weight: null,
  target_weight_min: null, target_weight_max: null,
  neutered: 0, neutered_date: null, microchip: '', allergies: '', chronic_conditions: '', long_term_medications: '',
  hospital: '', veterinarian: '', hospital_phone: '', owner_phone: '', notes: '',
});

const inputFromPet = (pet: Pet): PetInput => ({
  name: pet.name, species: pet.species, breed: pet.breed, sex: pet.sex, birth_date: pet.birth_date,
  home_date: pet.home_date, color: pet.color, initial_weight: pet.initial_weight, neutered: pet.neutered,
  target_weight_min: pet.target_weight_min, target_weight_max: pet.target_weight_max,
  neutered_date: pet.neutered_date, microchip: pet.microchip, allergies: pet.allergies,
  chronic_conditions: pet.chronic_conditions, long_term_medications: pet.long_term_medications,
  hospital: pet.hospital, veterinarian: pet.veterinarian, hospital_phone: pet.hospital_phone,
  owner_phone: pet.owner_phone, notes: pet.notes,
});

export function PetForm({ pet, onDone }: { pet?: Pet | null; onDone: (petId: string) => void }) {
  const { refresh } = useApp();
  const [form, setForm] = useState<PetInput>(() => pet ? inputFromPet(pet) : blankPet());
  const [weight, setWeight] = useState(pet?.initial_weight?.toString() ?? '');
  const [targetMin, setTargetMin] = useState(pet?.target_weight_min?.toString() ?? '');
  const [targetMax, setTargetMax] = useState(pet?.target_weight_max?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PetInput>(key: K, value: PetInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!form.name.trim()) return Alert.alert('请填写名字', '宠物名字不能为空。');
    if (form.birth_date && !dateValid(form.birth_date)) return Alert.alert('日期格式不正确', '请使用 YYYY-MM-DD。');
    if (form.home_date && !dateValid(form.home_date)) return Alert.alert('日期格式不正确', '请使用 YYYY-MM-DD。');
    setSaving(true);
    try {
      const min = numberOrNull(targetMin); const max = numberOrNull(targetMax);
      if (min != null && max != null && min > max) return Alert.alert('目标区间不正确', '最低目标体重不能大于最高目标体重。');
      const payload = { ...form, initial_weight: numberOrNull(weight), target_weight_min: min, target_weight_max: max };
      const petId = pet ? (await updatePet(pet.id, payload), pet.id) : await createPet(payload);
      await refresh();
      onDone(petId);
    } catch (error) { showError(error); } finally { setSaving(false); }
  };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={formStyles.content}>
    <Text style={formStyles.intro}>{pet ? '更新后立即写入本机 SQLite。' : '无需注册，先为毛孩子建立一份本地档案。照片可以稍后添加。'}</Text>
    <Field label="名字 *" value={form.name} onChangeText={(value) => set('name', value)} placeholder="例如：团子" testID="pet-name-input" />
    <Text style={formStyles.label}>物种</Text><View style={formStyles.chips}>{['猫', '狗', '其他'].map((value) => <Chip key={value} label={value} active={form.species === value} onPress={() => set('species', value)} />)}</View>
    <Field label="品种" value={form.breed} onChangeText={(value) => set('breed', value)} placeholder="例如：英短 / 柴犬" />
    <Text style={formStyles.label}>性别</Text><View style={formStyles.chips}>{['公', '母', '未知'].map((value) => <Chip key={value} label={value} active={form.sex === value} onPress={() => set('sex', value)} />)}</View>
    <View style={formStyles.row}><View style={formStyles.flex}><Field label="生日" value={form.birth_date ?? ''} onChangeText={(value) => set('birth_date', value || null)} placeholder="YYYY-MM-DD" /></View><View style={formStyles.flex}><Field label="到家日" value={form.home_date ?? ''} onChangeText={(value) => set('home_date', value || null)} placeholder="YYYY-MM-DD" /></View></View>
    <View style={formStyles.row}><View style={formStyles.flex}><Field label="毛色" value={form.color} onChangeText={(value) => set('color', value)} /></View><View style={formStyles.flex}><Field label="体重 kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" /></View></View>
    <Text style={formStyles.label}>目标体重区间（可选）</Text><View style={formStyles.row}><View style={formStyles.flex}><Field label="最低 kg" value={targetMin} onChangeText={setTargetMin} keyboardType="decimal-pad" placeholder="例如 3.8" /></View><View style={formStyles.flex}><Field label="最高 kg" value={targetMax} onChangeText={setTargetMax} keyboardType="decimal-pad" placeholder="例如 4.5" /></View></View>
    <Text style={formStyles.label}>绝育</Text><View style={formStyles.chips}><Chip label="未绝育" active={!form.neutered} onPress={() => set('neutered', 0)} /><Chip label="已绝育" active={!!form.neutered} onPress={() => set('neutered', 1)} /></View>
    {!!form.neutered && <Field label="绝育日期" value={form.neutered_date ?? ''} onChangeText={(value) => set('neutered_date', value || null)} placeholder="YYYY-MM-DD" />}
    <SectionTitle title="健康背景" />
    <Field label="芯片号" value={form.microchip} onChangeText={(value) => set('microchip', value)} />
    <Field label="过敏信息" value={form.allergies} onChangeText={(value) => set('allergies', value)} multiline />
    <Field label="慢性病" value={form.chronic_conditions} onChangeText={(value) => set('chronic_conditions', value)} multiline />
    <Field label="长期用药" value={form.long_term_medications} onChangeText={(value) => set('long_term_medications', value)} multiline />
    <SectionTitle title="常用医院" />
    <Field label="宠物医院" value={form.hospital} onChangeText={(value) => set('hospital', value)} />
    <Field label="医生" value={form.veterinarian} onChangeText={(value) => set('veterinarian', value)} />
    <View style={formStyles.row}><View style={formStyles.flex}><Field label="医院电话" value={form.hospital_phone} onChangeText={(value) => set('hospital_phone', value)} keyboardType="phone-pad" /></View><View style={formStyles.flex}><Field label="主人电话" value={form.owner_phone} onChangeText={(value) => set('owner_phone', value)} keyboardType="phone-pad" /></View></View>
    <Field label="备注" value={form.notes} onChangeText={(value) => set('notes', value)} multiline />
    <Button title={saving ? '正在保存…' : pet ? '保存档案' : '创建宠物'} disabled={saving} onPress={save} testID="save-pet-button" />
  </ScrollView>;
}

export function PhotoManager({ pet, onDone }: { pet: Pet; onDone?: () => void }) {
  const { snapshot, refresh } = useApp();
  const photos = snapshot.photos.filter((photo) => photo.pet_id === pet.id).sort((a, b) => a.position - b.position);
  const [busy, setBusy] = useState(false);
  const importAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    setBusy(true);
    const imported: string[] = [];
    try {
      for (const asset of assets.slice(0, 5 - photos.length)) {
        const relative = await importPrivateFile(asset.uri, 'photos', pet.id, asset.fileName, asset.mimeType);
        imported.push(relative);
        try { await addPetPhoto(pet.id, relative); } catch (error) { await removePrivateFile(relative); throw error; }
      }
      await refresh(); onDone?.();
    } catch (error) {
      for (const path of imported) await removePrivateFile(path).catch(() => undefined);
      showError(error);
    } finally { setBusy(false); }
  };
  const pick = async () => {
    if (photos.length >= 5) return Alert.alert('最多 5 张', '请先删除或替换一张照片。');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5 - photos.length, quality: 0.88 });
      if (!result.canceled) await importAssets(result.assets);
    } catch (error) { showError(error); }
  };
  const camera = async () => {
    if (photos.length >= 5) return Alert.alert('最多 5 张', '请先删除或替换一张照片。');
    try {
      const asset = await captureImage({ allowsEditing: true, aspect: [4, 3] });
      if (asset) await importAssets([asset]);
    } catch (error) { showError(error); }
  };
  const commitReplacement = async (photoId: string, asset: ImagePicker.ImagePickerAsset) => {
    try {
      setBusy(true);
      const relative = await importPrivateFile(asset.uri, 'photos', pet.id, asset.fileName, asset.mimeType);
      try {
        const oldPath = await replacePetPhoto(pet.id, photoId, relative);
        await removePrivateFile(oldPath);
      } catch (error) {
        await removePrivateFile(relative);
        throw error;
      }
      await refresh();
    } catch (error) { showError(error); } finally { setBusy(false); }
  };
  const replaceFromLibrary = async (photoId: string) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.88 });
      if (!result.canceled) await commitReplacement(photoId, result.assets[0]!);
    } catch (error) { showError(error); }
  };
  const replaceFromCamera = async (photoId: string) => {
    try {
      const asset = await captureImage({ allowsEditing: true, aspect: [4, 3] });
      if (asset) await commitReplacement(photoId, asset);
    } catch (error) { showError(error); }
  };
  const replace = (photoId: string) => Alert.alert('替换照片', '请选择图片来源。', [
    { text: '取消', style: 'cancel' },
    { text: '从相册选择', onPress: () => replaceFromLibrary(photoId) },
    { text: '拍照', onPress: () => replaceFromCamera(photoId) },
  ]);
  const remove = (photoId: string) => Alert.alert('删除这张照片？', '照片副本会从应用私有目录中清理。', [{ text: '取消' }, { text: '删除', style: 'destructive', onPress: async () => {
    try { const path = await deletePetPhoto(pet.id, photoId); await removePrivateFile(path); await refresh(); } catch (error) { showError(error); }
  } }]);
  return <ScrollView contentContainerStyle={formStyles.content}>
    <Text style={formStyles.intro}>{pet.name} 已保存 {photos.length}/5 张照片。第一张默认头像，也可手动设置。</Text>
    {photos.length === 0 ? <Empty title="还没有照片" detail="可以暂时跳过，后续随时补充。" /> : photos.map((photo, index) => <Card key={photo.id}>
      <Image source={{ uri: resolvePrivateUri(photo.relative_path)! }} style={formStyles.photo} resizeMode="cover" />
      <View style={formStyles.photoMeta}><Text style={formStyles.photoTitle}>第 {index + 1} 张 {photo.is_primary ? '· 主头像' : ''}</Text></View>
      <View style={formStyles.row}><Button compact title="设为主头像" disabled={!!photo.is_primary} variant="secondary" onPress={async () => { await setPrimaryPhoto(pet.id, photo.id); await refresh(); }} /><Button compact title="前移" variant="ghost" disabled={index === 0} onPress={async () => { await movePetPhoto(pet.id, photo.id, -1); await refresh(); }} /><Button compact title="后移" variant="ghost" disabled={index === photos.length - 1} onPress={async () => { await movePetPhoto(pet.id, photo.id, 1); await refresh(); }} /></View>
      <View style={formStyles.row}><View style={formStyles.flex}><Button compact title="替换照片" variant="secondary" disabled={busy} onPress={() => replace(photo.id)} /></View><View style={formStyles.flex}><Button compact title="删除照片" variant="danger" onPress={() => remove(photo.id)} /></View></View>
    </Card>)}
    <View style={formStyles.row}><View style={formStyles.flex}><Button title={busy ? '正在复制…' : '从系统相册选择'} disabled={busy || photos.length >= 5} onPress={pick} testID="pick-photo-button" /></View><View style={formStyles.flex}><Button title="拍照" variant="secondary" disabled={busy || photos.length >= 5} onPress={camera} testID="take-photo-button" /></View></View>
    <Text style={formStyles.notice}>照片选择器不会申请整个相册权限；选中的图片会复制到 APP 私有目录，除非你主动备份或分享，否则不会离开设备。</Text>
  </ScrollView>;
}

const blankCare = (petId: string, category: CareCategory = 'vaccine'): CareInput => ({
  pet_id: petId, category, title: CARE_LABELS[category], last_completed_date: null, due_date: todayIso(),
  recurrence_days: null, reminder_days: 1, notes: '', hospital: '', cost: null,
});

export function CareForm({ existing, initialCategory, fromHistory, onDone }: { existing?: CareSchedule | null; initialCategory?: CareCategory; fromHistory?: CareRecord | null; onDone: () => void }) {
  const { selectedPet, refresh } = useApp();
  const [form, setForm] = useState<CareInput>(() => existing ? {
    pet_id: existing.pet_id, category: existing.category, title: existing.title, last_completed_date: existing.last_completed_date,
    due_date: existing.due_date, recurrence_days: existing.recurrence_days, reminder_days: existing.reminder_days,
    notes: existing.notes, hospital: existing.hospital, cost: existing.cost,
  } : fromHistory ? { ...blankCare(selectedPet?.id ?? '', fromHistory.category), title: fromHistory.title, last_completed_date: fromHistory.occurred_at, notes: fromHistory.notes, cost: fromHistory.cost } : blankCare(selectedPet?.id ?? '', initialCategory));
  const [repeat, setRepeat] = useState(existing?.recurrence_days?.toString() ?? '');
  const [cost, setCost] = useState((existing?.cost ?? fromHistory?.cost)?.toString() ?? '');
  const set = <K extends keyof CareInput>(key: K, value: CareInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  if (!selectedPet) return <Loading />;
  const save = async () => {
    if (!form.title.trim()) return Alert.alert('请填写事项名称');
    if (!dateValid(form.due_date)) return Alert.alert('日期格式不正确', '请使用 YYYY-MM-DD。');
    try {
      const payload = { ...form, pet_id: selectedPet.id, recurrence_days: numberOrNull(repeat), cost: numberOrNull(cost) };
      const careId = existing ? (await updateCareSchedule(existing.id, payload), existing.id) : await createCareSchedule(payload);
      const schedule: CareSchedule = { ...payload, id: careId, status: 'pending', created_at: existing?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null };
      await scheduleCareNotification(schedule, selectedPet);
      await refresh(); onDone();
    } catch (error) { showError(error); }
  };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={formStyles.content}>
    <Text style={formStyles.intro}>为 {selectedPet.name} 安排本地提醒。周期请依据宠物医生意见填写。</Text>
    <Text style={formStyles.label}>类别</Text><View style={formStyles.chips}>{(Object.keys(CARE_LABELS) as CareCategory[]).map((value) => <Chip key={value} label={CARE_LABELS[value]} active={form.category === value} onPress={() => { set('category', value); if (!existing) set('title', CARE_LABELS[value]); }} />)}</View>
    <Field label="事项名称 *" value={form.title} onChangeText={(value) => set('title', value)} testID="care-title-input" />
    <Field label="计划日期 *" value={form.due_date} onChangeText={(value) => set('due_date', value)} placeholder="YYYY-MM-DD" />
    <Text style={formStyles.label}>提前提醒</Text><View style={formStyles.chips}>{[1, 3, 7].map((value) => <Chip key={value} label={`${value} 天`} active={form.reminder_days === value} onPress={() => set('reminder_days', value)} />)}</View>
    <Field label="重复周期（天）" value={repeat} onChangeText={setRepeat} keyboardType="number-pad" hint="留空表示单次。疫苗、药物和驱虫周期由你依据医生意见确认。" />
    <Field label="上次完成日期" value={form.last_completed_date ?? ''} onChangeText={(value) => set('last_completed_date', value || null)} placeholder="YYYY-MM-DD" />
    <Field label="医院" value={form.hospital} onChangeText={(value) => set('hospital', value)} />
    <Field label="费用" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
    <Field label="备注" value={form.notes} onChangeText={(value) => set('notes', value)} multiline />
    <Button title={existing ? '保存提醒' : '创建提醒'} onPress={save} testID="save-care-button" />
  </ScrollView>;
}

export function CareHistoryForm({ existing, onDone }: { existing?: CareRecord | null; onDone: () => void }) {
  const { selectedPet, refresh } = useApp();
  const [category, setCategory] = useState<CareCategory>(existing?.category ?? 'vaccine');
  const [title, setTitle] = useState(existing?.title ?? CARE_LABELS.vaccine);
  const [action, setAction] = useState<'completed' | 'skipped'>(existing?.action ?? 'completed');
  const [date, setDate] = useState(existing?.occurred_at ?? todayIso());
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [cost, setCost] = useState(existing?.cost?.toString() ?? '');
  if (!selectedPet) return <Loading />;
  const save = async () => {
    if (!title.trim()) return Alert.alert('请填写护理事项');
    if (!dateValid(date)) return Alert.alert('日期格式不正确', '请使用 YYYY-MM-DD。');
    const payload = { pet_id: selectedPet.id, category, title, action, occurred_at: date, notes, cost: numberOrNull(cost) };
    try {
      if (existing) await updateCareRecord(existing.id, payload); else await createCareRecord(payload);
      await refresh(); onDone();
    } catch (error) { showError(error); }
  };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={formStyles.content}>
    <Text style={formStyles.intro}>补记或修正已经发生的护理记录，不会自动创建提醒。</Text>
    <Text style={formStyles.label}>类别</Text><View style={formStyles.chips}>{(Object.keys(CARE_LABELS) as CareCategory[]).map((value) => <Chip key={value} label={CARE_LABELS[value]} active={category === value} onPress={() => { setCategory(value); if (!existing) setTitle(CARE_LABELS[value]); }} />)}</View>
    <Field label="护理事项 *" value={title} onChangeText={setTitle} testID="care-history-title-input" />
    <Text style={formStyles.label}>结果</Text><View style={formStyles.chips}><Chip label="已完成" active={action === 'completed'} onPress={() => setAction('completed')} /><Chip label="已跳过" active={action === 'skipped'} onPress={() => setAction('skipped')} /></View>
    <Field label="发生日期 *" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
    <Field label="费用" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
    <Field label="备注" value={notes} onChangeText={setNotes} multiline />
    <Button title={existing ? '保存护理历史' : '添加护理历史'} onPress={save} testID="save-care-history-button" />
  </ScrollView>;
}

const blankHealth = (petId: string, type: HealthType = 'weight'): HealthInput => ({
  pet_id: petId, type, occurred_at: todayIso(), title: HEALTH_LABELS[type], weight: null, body_condition: null,
  symptoms: '', mood: '', appetite: '', water: '', stool: '', diagnosis: '', treatment: '', medication: '', dosage: '',
  frequency: '', course: '', cost: null, notes: '',
});

export function HealthForm({ existing, initialType, onDone }: { existing?: HealthRecord | null; initialType?: HealthType; onDone: () => void }) {
  const { selectedPet, refresh } = useApp();
  const [form, setForm] = useState<HealthInput>(() => existing ? {
    pet_id: existing.pet_id, type: existing.type, occurred_at: existing.occurred_at, title: existing.title,
    weight: existing.weight, body_condition: existing.body_condition, symptoms: existing.symptoms, mood: existing.mood,
    appetite: existing.appetite, water: existing.water, stool: existing.stool, diagnosis: existing.diagnosis,
    treatment: existing.treatment, medication: existing.medication, dosage: existing.dosage, frequency: existing.frequency,
    course: existing.course, cost: existing.cost, notes: existing.notes,
  } : blankHealth(selectedPet?.id ?? '', initialType));
  const [weight, setWeight] = useState(existing?.weight?.toString() ?? '');
  const [body, setBody] = useState(existing?.body_condition?.toString() ?? '');
  const [cost, setCost] = useState(existing?.cost?.toString() ?? '');
  const set = <K extends keyof HealthInput>(key: K, value: HealthInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  if (!selectedPet) return <Loading />;
  const save = async () => {
    if (!form.title.trim()) return Alert.alert('请填写标题');
    if (!dateValid(form.occurred_at)) return Alert.alert('日期格式不正确', '请使用 YYYY-MM-DD。');
    try {
      const payload = { ...form, pet_id: selectedPet.id, weight: numberOrNull(weight), body_condition: numberOrNull(body), cost: numberOrNull(cost) };
      if (existing) await updateHealthRecord(existing.id, payload); else await createHealthRecord(payload);
      await refresh(); onDone();
    } catch (error) { showError(error); }
  };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={formStyles.content}>
    <Text style={formStyles.label}>记录类型</Text><View style={formStyles.chips}>{(Object.keys(HEALTH_LABELS) as HealthType[]).map((value) => <Chip key={value} label={HEALTH_LABELS[value]} active={form.type === value} onPress={() => { set('type', value); if (!existing) set('title', HEALTH_LABELS[value]); }} />)}</View>
    <Field label="日期 *" value={form.occurred_at} onChangeText={(value) => set('occurred_at', value)} placeholder="YYYY-MM-DD" />
    <Field label="标题 *" value={form.title} onChangeText={(value) => set('title', value)} testID="health-title-input" />
    {form.type === 'weight' && <><Field label="体重 kg *" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" testID="weight-input" /><Field label="体况评分（1–9）" value={body} onChangeText={setBody} keyboardType="number-pad" /></>}
    {(form.type === 'symptom' || form.type === 'daily') && <><Field label="症状/异常" value={form.symptoms} onChangeText={(value) => set('symptoms', value)} multiline /><View style={formStyles.row}><View style={formStyles.flex}><Field label="精神" value={form.mood} onChangeText={(value) => set('mood', value)} /></View><View style={formStyles.flex}><Field label="食欲" value={form.appetite} onChangeText={(value) => set('appetite', value)} /></View></View><View style={formStyles.row}><View style={formStyles.flex}><Field label="饮水" value={form.water} onChangeText={(value) => set('water', value)} /></View><View style={formStyles.flex}><Field label="排便" value={form.stool} onChangeText={(value) => set('stool', value)} /></View></View></>}
    {form.type === 'visit' && <><Field label="诊断/检查" value={form.diagnosis} onChangeText={(value) => set('diagnosis', value)} multiline /><Field label="处置" value={form.treatment} onChangeText={(value) => set('treatment', value)} multiline /></>}
    {(form.type === 'medication' || form.type === 'visit') && <><Field label="药物名称" value={form.medication} onChangeText={(value) => set('medication', value)} /><View style={formStyles.row}><View style={formStyles.flex}><Field label="剂量" value={form.dosage} onChangeText={(value) => set('dosage', value)} /></View><View style={formStyles.flex}><Field label="频率" value={form.frequency} onChangeText={(value) => set('frequency', value)} /></View></View><Field label="疗程" value={form.course} onChangeText={(value) => set('course', value)} /></>}
    {(form.type === 'visit' || form.type === 'medication') && <Field label="费用" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />}
    <Field label="备注" value={form.notes} onChangeText={(value) => set('notes', value)} multiline />
    <Text style={formStyles.notice}>APP 只保存你的记录，不提供疾病诊断，也不能替代宠物医生。</Text>
    <Button title={existing ? '保存健康记录' : '添加健康记录'} onPress={save} testID="save-health-button" />
  </ScrollView>;
}

const blankTimeline = (petId: string): TimelineInput => ({ pet_id: petId, type: 'milestone', occurred_at: todayIso(), title: '', note: '', location: '', relative_photo_path: null });

export function TimelineForm({ existing, onDone }: { existing?: TimelineEntry | null; onDone: () => void }) {
  const { selectedPet, refresh } = useApp();
  const [form, setForm] = useState<TimelineInput>(() => existing ? {
    pet_id: existing.pet_id, type: existing.type, occurred_at: existing.occurred_at, title: existing.title,
    note: existing.note, location: existing.location, relative_photo_path: existing.relative_photo_path,
  } : blankTimeline(selectedPet?.id ?? ''));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TimelineInput>(key: K, value: TimelineInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  if (!selectedPet) return <Loading />;
  const importPhoto = async (asset: ImagePicker.ImagePickerAsset) => {
    const relative = await importPrivateFile(asset.uri, 'timeline', selectedPet.id, asset.fileName, asset.mimeType);
    set('relative_photo_path', relative); set('type', 'photo');
  };
  const pick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.88 });
      if (!result.canceled) {
        setBusy(true);
        await importPhoto(result.assets[0]!);
      }
    } catch (error) { showError(error); } finally { setBusy(false); }
  };
  const camera = async () => {
    try {
      const asset = await captureImage();
      if (asset) { setBusy(true); await importPhoto(asset); }
    } catch (error) { showError(error); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!form.title.trim()) return Alert.alert('请填写成长标题');
    if (!dateValid(form.occurred_at)) return Alert.alert('日期格式不正确', '请使用 YYYY-MM-DD。');
    try {
      const payload = { ...form, pet_id: selectedPet.id };
      if (existing) await updateTimelineEntry(existing.id, payload); else await createTimelineEntry(payload);
      await refresh(); onDone();
    } catch (error) { showError(error); }
  };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={formStyles.content}>
    <Text style={formStyles.label}>类型</Text><View style={formStyles.chips}>{([['milestone', '里程碑'], ['photo', '成长照片'], ['birthday', '生日'], ['home_anniversary', '到家纪念']] as const).map(([value, label]) => <Chip key={value} label={label} active={form.type === value} onPress={() => set('type', value)} />)}</View>
    <Field label="日期 *" value={form.occurred_at} onChangeText={(value) => set('occurred_at', value)} placeholder="YYYY-MM-DD" />
    <Field label="标题 *" value={form.title} onChangeText={(value) => set('title', value)} placeholder="例如：第一次洗澡" testID="timeline-title-input" />
    <Field label="文字" value={form.note} onChangeText={(value) => set('note', value)} multiline />
    <Field label="地点备注" value={form.location} onChangeText={(value) => set('location', value)} />
    {!!form.relative_photo_path && <Image source={{ uri: resolvePrivateUri(form.relative_photo_path)! }} style={formStyles.photo} />}
    <View style={formStyles.row}><View style={formStyles.flex}><Button title={busy ? '正在复制…' : form.relative_photo_path ? '从相册替换' : '从相册选择'} variant="secondary" disabled={busy} onPress={pick} testID="timeline-library-button" /></View><View style={formStyles.flex}><Button title={form.relative_photo_path ? '拍照替换' : '拍摄成长照片'} variant="secondary" disabled={busy} onPress={camera} testID="timeline-camera-button" /></View></View>
    <Button title={existing ? '保存成长记录' : '添加到成长时间轴'} onPress={save} testID="save-timeline-button" />
  </ScrollView>;
}

export function AttachmentForm({ existing, ownerType = 'folder', ownerId = null, onDone }: { existing?: Attachment | null; ownerType?: Attachment['owner_type']; ownerId?: string | null; onDone: () => void }) {
  const { selectedPet, refresh } = useApp();
  const [category, setCategory] = useState(existing?.category ?? '检查报告');
  const [date, setDate] = useState(existing?.occurred_at ?? todayIso());
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  if (!selectedPet) return <Loading />;
  const saveAsset = async (asset: { uri: string; name?: string | null; mimeType?: string | null }) => {
    if (!dateValid(date)) return Alert.alert('日期格式不正确');
    setBusy(true);
    try {
      const relative = await importPrivateFile(asset.uri, 'attachments', selectedPet.id, asset.name, asset.mimeType);
      const payload = { pet_id: selectedPet.id, owner_type: existing?.owner_type ?? ownerType, owner_id: existing?.owner_id ?? ownerId,
        category, display_name: asset.name || existing?.display_name || `${category}-${date}`,
        mime_type: asset.mimeType || existing?.mime_type || 'application/octet-stream', relative_path: relative,
        occurred_at: date, notes } as const;
      try {
        if (existing) {
          await updateAttachment(existing.id, payload);
          await removePrivateFile(existing.relative_path);
        } else await createAttachment(payload);
      } catch (error) { await removePrivateFile(relative); throw error; }
      await refresh(); onDone();
    } catch (error) { showError(error); } finally { setBusy(false); }
  };
  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (!result.canceled) await saveAsset({ uri: result.assets[0]!.uri, name: result.assets[0]!.name, mimeType: result.assets[0]!.mimeType });
  };
  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!result.canceled) await saveAsset({ uri: result.assets[0]!.uri, name: result.assets[0]!.fileName, mimeType: result.assets[0]!.mimeType });
  };
  const takePhoto = async () => {
    try {
      const asset = await captureImage({ quality: 0.9 });
      if (asset) await saveAsset({ uri: asset.uri, name: asset.fileName ?? `拍摄资料-${date}.jpg`, mimeType: asset.mimeType ?? 'image/jpeg' });
    } catch (error) { showError(error); }
  };
  const saveMetadata = async () => {
    if (!existing) return;
    if (!dateValid(date)) return Alert.alert('日期格式不正确');
    try {
      await updateAttachment(existing.id, { pet_id: selectedPet.id, owner_type: existing.owner_type, owner_id: existing.owner_id,
        category, display_name: existing.display_name, mime_type: existing.mime_type, relative_path: existing.relative_path,
        occurred_at: date, notes });
      await refresh(); onDone();
    } catch (error) { showError(error); }
  };
  return <ScrollView contentContainerStyle={formStyles.content}>
    <Text style={formStyles.intro}>{existing ? `编辑 ${existing.display_name} 的资料信息，或选择新文件进行替换。` : ownerType === 'folder' ? '文件会归入当前宠物的健康资料夹。' : '文件会与当前记录关联，并同时出现在健康资料夹。'}</Text>
    <Text style={formStyles.label}>资料类型</Text><View style={formStyles.chips}>{['疫苗本', '检查报告', '化验单', '处方', '保险', '芯片证明', '其他'].map((value) => <Chip key={value} label={value} active={category === value} onPress={() => setCategory(value)} />)}</View>
    <Field label="日期" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
    <Field label="备注" value={notes} onChangeText={setNotes} multiline />
    {!!existing && <Button title="保存资料信息" onPress={saveMetadata} disabled={busy} testID="save-attachment-meta-button" />}
    <Button title={busy ? '正在复制到私有目录…' : existing ? '选择新文件替换' : '选择文件'} onPress={pickFile} disabled={busy} />
    <View style={formStyles.row}><View style={formStyles.flex}><Button title={existing ? '从相册选择新图片' : '从相册选择图片'} variant="secondary" onPress={pickPhoto} disabled={busy} testID="attachment-library-button" /></View><View style={formStyles.flex}><Button title={existing ? '拍照替换资料' : '拍摄资料'} variant="secondary" onPress={takePhoto} disabled={busy} testID="attachment-camera-button" /></View></View>
    <Text style={formStyles.notice}>相册使用 Android 系统照片选择器，无需读取整个相册；相机只在拍照时申请权限。所选文件会复制到 APP 私有目录，原文件不会被修改。</Text>
  </ScrollView>;
}

export function TrashView({ onDone }: { onDone?: () => void }) {
  const { refresh } = useApp();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const load = async () => setItems(await listTrash());
  useEffect(() => { load().catch(showError); }, []);
  if (!items) return <Loading />;
  return <ScrollView contentContainerStyle={formStyles.content}>
    <Text style={formStyles.intro}>删除的记录保留 30 天，可以在这里恢复。</Text>
    {items.length === 0 ? <Empty title="回收站为空" detail="健康、护理和成长记录删除后会出现在这里。" /> : items.map((item) => {
      let title = item.entity_type;
      try { title = String(JSON.parse(item.payload_json).title ?? JSON.parse(item.payload_json).name ?? item.entity_type); } catch { /* keep fallback */ }
      return <Card key={item.id}><Text style={formStyles.itemTitle}>{title}</Text><Text style={formStyles.itemMeta}>删除于 {item.deleted_at.slice(0, 16).replace('T', ' ')} · 保留至 {item.expires_at.slice(0, 10)}</Text><Button compact title="恢复" variant="secondary" onPress={async () => { try { await restoreTrash(item.id); await refresh(); await load(); onDone?.(); } catch (error) { showError(error); } }} /></Card>;
    })}
  </ScrollView>;
}

export async function openNotificationSettings() {
  if (Platform.OS === 'android') {
    try { await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS, { extra: { 'android.provider.extra.APP_PACKAGE': 'com.pawprint.diary' } }); return; } catch { /* fallback */ }
  }
  await Linking.openSettings();
}

const formStyles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 14 }, intro: { color: COLORS.muted, lineHeight: 22 },
  notice: { color: COLORS.sageDark, backgroundColor: COLORS.mint, borderRadius: 12, padding: 12, lineHeight: 20 },
  label: { color: COLORS.ink, fontWeight: '700', fontSize: 14 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, flex: { flex: 1, minWidth: 130 },
  photo: { width: '100%', height: 210, borderRadius: 14, backgroundColor: COLORS.sand }, photoMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  photoTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink }, itemTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink }, itemMeta: { color: COLORS.muted, fontSize: 12 },
});
