import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { CARE_LABELS, COLORS, HEALTH_LABELS, daysBetween, daysUntilAnniversary, todayIso } from '../constants';
import { resolvePrivateUri } from '../data/files';
import { actOnCare, createHealthRecord, moveToTrash, snoozeCare } from '../data/repository';
import { cancelCareNotification, syncPendingNotifications } from '../services/notifications';
import { useApp } from '../state/AppContext';
import { Attachment, CareCategory, CareRecord, CareSchedule, HealthRecord, HealthType, Pet, TimelineEntry } from '../types';
import { Button, Card, Empty, Screen, SectionTitle } from '../components/ui';

export type OpenSheet = (sheet: SheetRequest) => void;
export type SheetRequest =
  | { kind: 'pet'; pet?: Pet }
  | { kind: 'photos'; pet: Pet }
  | { kind: 'care'; existing?: CareSchedule; category?: CareCategory; fromHistory?: CareRecord }
  | { kind: 'care_history'; existing?: CareRecord }
  | { kind: 'health'; existing?: HealthRecord; type?: HealthType }
  | { kind: 'timeline'; existing?: TimelineEntry }
  | { kind: 'attachment'; existing?: Attachment; ownerType?: Attachment['owner_type']; ownerId?: string | null }
  | { kind: 'trash' }
  | { kind: 'settings' }
  | { kind: 'memory'; mode: 'growth' | 'annual' };

function PetSwitcher() {
  const { snapshot, selectedPetId, setSelectedPetId } = useApp();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={screenStyles.petSwitch}>
    {snapshot.pets.map((pet) => {
      const primary = snapshot.photos.find((photo) => photo.pet_id === pet.id && photo.is_primary);
      return <Pressable key={pet.id} accessibilityRole="button" accessibilityLabel={`切换到${pet.name}`} onPress={() => setSelectedPetId(pet.id)} style={[screenStyles.petChip, selectedPetId === pet.id && screenStyles.petChipActive]}>
        {primary ? <Image source={{ uri: resolvePrivateUri(primary.relative_path)! }} style={screenStyles.petAvatar} /> : <View style={screenStyles.petAvatarFallback}><MaterialCommunityIcons name="paw" size={16} color={COLORS.rose} /></View>}
        <Text style={[screenStyles.petChipText, selectedPetId === pet.id && screenStyles.petChipTextActive]}>{pet.name}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

function WeightChart({ records }: { records: HealthRecord[] }) {
  const weights = records.filter((item) => item.type === 'weight' && item.weight != null).slice(0, 8).reverse();
  if (weights.length < 2) return <Text style={screenStyles.muted}>至少记录两次体重后显示趋势。</Text>;
  const values = weights.map((item) => item.weight!);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 310; const height = 140; const pad = 22;
  const points = weights.map((item, index) => {
    const x = pad + index * ((width - pad * 2) / Math.max(1, weights.length - 1));
    const y = height - pad - ((item.weight! - min) / range) * (height - pad * 2);
    return { x, y, item };
  });
  return <View accessibilityLabel={`体重趋势，从${values[0]}到${values.at(-1)}千克`}>
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke={COLORS.line} strokeWidth="1" />
      <Polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={COLORS.sage} strokeWidth="4" strokeLinejoin="round" />
      {points.map(({ x, y, item }) => <React.Fragment key={item.id}><Circle cx={x} cy={y} r="5" fill={COLORS.coral} /><SvgText x={x} y={y - 10} fontSize="10" textAnchor="middle" fill={COLORS.ink}>{item.weight}</SvgText></React.Fragment>)}
    </Svg>
    <View style={screenStyles.chartDates}><Text style={screenStyles.tiny}>{weights[0]!.occurred_at.slice(5)}</Text><Text style={screenStyles.tiny}>{weights.at(-1)!.occurred_at.slice(5)}</Text></View>
  </View>;
}

function CareRow({ schedule, onEdit, onAttachment }: { schedule: CareSchedule; onEdit: () => void; onAttachment: () => void }) {
  const { refresh } = useApp();
  const overdue = schedule.due_date < todayIso();
  const act = async (action: 'completed' | 'skipped') => {
    try {
      await actOnCare(schedule.id, action);
      await cancelCareNotification(schedule.id);
      await refresh();
      await syncPendingNotifications();
    } catch (error) { Alert.alert('操作未完成', error instanceof Error ? error.message : '未知错误'); }
  };
  const remove = () => Alert.alert('移入回收站？', '这条提醒会保留 30 天，可随时恢复。', [{ text: '取消' }, { text: '删除', style: 'destructive', onPress: async () => { await cancelCareNotification(schedule.id); await moveToTrash('care', schedule.id); await refresh(); } }]);
  return <Card testID={`care-${schedule.id}`}>
    <View style={screenStyles.between}><View style={{ flex: 1 }}><Text style={screenStyles.itemTitle}>{CARE_LABELS[schedule.category]} · {schedule.title}</Text><Text style={[screenStyles.itemMeta, overdue && screenStyles.overdue]}>{overdue ? '已逾期' : '计划'} {schedule.due_date} · 提前 {schedule.reminder_days} 天</Text></View><View style={[screenStyles.statusDot, overdue && { backgroundColor: COLORS.brick }]} /></View>
    {!!schedule.notes && <Text style={screenStyles.muted}>{schedule.notes}</Text>}
    <View style={screenStyles.actionRow}><Button compact title="完成" onPress={() => act('completed')} /><Button compact title="稍后 1 天" variant="secondary" onPress={async () => { await snoozeCare(schedule.id); await refresh(); await syncPendingNotifications(); }} /><Button compact title="跳过" variant="ghost" onPress={() => act('skipped')} /></View>
    <View style={screenStyles.actionRow}><Button compact title="编辑" variant="ghost" onPress={onEdit} /><Button compact title="加附件" variant="secondary" onPress={onAttachment} /><Button compact title="删除" variant="danger" onPress={remove} /></View>
  </Card>;
}

export function TodayScreen({ openSheet }: { openSheet: OpenSheet }) {
  const { snapshot, selectedPet, refresh } = useApp();
  if (!selectedPet) return <Screen><Empty title="还没有宠物" detail="先创建一份本地宠物档案。" action="创建宠物" onAction={() => openSheet({ kind: 'pet' })} /></Screen>;
  const photos = snapshot.photos.filter((photo) => photo.pet_id === selectedPet.id);
  const hero = photos[(new Date().getDate() - 1) % Math.max(photos.length, 1)];
  const pending = snapshot.careSchedules.filter((item) => item.pet_id === selectedPet.id && item.status === 'pending').slice(0, 4);
  const health = snapshot.healthRecords.filter((item) => item.pet_id === selectedPet.id);
  const weights = health.filter((item) => item.type === 'weight' && item.weight != null);
  const latest = weights[0]; const previous = weights[1];
  const companionDays = daysBetween(selectedPet.home_date);
  const birthdayDays = daysUntilAnniversary(selectedPet.birth_date);
  const homeAnniversaryDays = daysUntilAnniversary(selectedPet.home_date);
  const targetSummary = latest?.weight == null || (selectedPet.target_weight_min == null && selectedPet.target_weight_max == null)
    ? null
    : selectedPet.target_weight_min != null && latest.weight < selectedPet.target_weight_min
      ? `距目标下限 ${(selectedPet.target_weight_min - latest.weight).toFixed(2)} kg`
      : selectedPet.target_weight_max != null && latest.weight > selectedPet.target_weight_max
        ? `高于目标上限 ${(latest.weight - selectedPet.target_weight_max).toFixed(2)} kg`
        : '在目标体重区间内';
  const normal = async () => {
    await createHealthRecord({ pet_id: selectedPet.id, type: 'daily', occurred_at: todayIso(), title: '今天一切正常', weight: null, body_condition: null, symptoms: '', mood: '正常', appetite: '正常', water: '正常', stool: '正常', diagnosis: '', treatment: '', medication: '', dosage: '', frequency: '', course: '', cost: null, notes: '快捷确认' });
    await refresh();
    Alert.alert('已记录', '今天一切正常，已保存到本机。');
  };
  return <Screen>
    <PetSwitcher />
    <Card style={screenStyles.hero}>
      {hero ? <Image source={{ uri: resolvePrivateUri(hero.relative_path)! }} style={screenStyles.heroPhoto} /> : <View style={screenStyles.heroEmpty}><MaterialCommunityIcons name="paw" size={48} color={COLORS.rose} /><Text style={screenStyles.muted}>给 {selectedPet.name} 添加一张照片吧</Text></View>}
      <View style={screenStyles.heroContent}>
        <Text style={screenStyles.heroEyebrow}>今天和 {selectedPet.name} 在一起</Text>
        <Text style={screenStyles.heroContentTitle}>{companionDays == null ? '从今天开始记录' : `陪伴第 ${companionDays + 1} 天`}</Text>
        {(birthdayDays != null || homeAnniversaryDays != null) && <View style={screenStyles.anniversaryRow}>
          {birthdayDays != null && <View style={screenStyles.anniversaryPill}><MaterialCommunityIcons name="cake-variant-outline" size={16} color={COLORS.rose} /><Text style={screenStyles.anniversaryText}>{birthdayDays === 0 ? '今天生日' : `生日还有 ${birthdayDays} 天`}</Text></View>}
          {homeAnniversaryDays != null && <View style={screenStyles.anniversaryPill}><MaterialCommunityIcons name="home-heart" size={16} color={COLORS.sageDark} /><Text style={screenStyles.anniversaryText}>{homeAnniversaryDays === 0 ? '今天是到家纪念日' : `到家纪念还有 ${homeAnniversaryDays} 天`}</Text></View>}
        </View>}
        <View style={screenStyles.heroButtonSafe}><Button title="✓ 今天一切正常" variant="secondary" onPress={normal} testID="today-normal-button" /></View>
      </View>
    </Card>
    <SectionTitle title="需要留意" action="新增提醒" onAction={() => openSheet({ kind: 'care' })} />
    {pending.length ? pending.map((item) => <CareRow key={item.id} schedule={item} onEdit={() => openSheet({ kind: 'care', existing: item })} onAttachment={() => openSheet({ kind: 'attachment', ownerType: 'care', ownerId: item.id })} />) : <Empty title="今天没有待办" detail="疫苗、驱虫、用药和体检提醒会显示在这里。" action="添加提醒" onAction={() => openSheet({ kind: 'care' })} />}
    <SectionTitle title="最近健康" action="添加记录" onAction={() => openSheet({ kind: 'health' })} />
    <Card>
      <View style={screenStyles.between}><View><Text style={screenStyles.itemMeta}>最近体重</Text><Text style={screenStyles.metric}>{latest?.weight ?? '—'} <Text style={screenStyles.unit}>kg</Text></Text></View><Text style={screenStyles.delta}>{latest && previous ? `${latest.weight! - previous.weight! >= 0 ? '+' : ''}${(latest.weight! - previous.weight!).toFixed(2)} kg` : '等待更多记录'}</Text></View>
      {!!targetSummary && <View style={[screenStyles.targetBadge, targetSummary.includes('区间内') && screenStyles.targetBadgeOk]}><MaterialCommunityIcons name={targetSummary.includes('区间内') ? 'check-circle-outline' : 'information-outline'} size={17} color={targetSummary.includes('区间内') ? COLORS.sageDark : COLORS.brick} /><Text style={[screenStyles.targetText, !targetSummary.includes('区间内') && { color: COLORS.brick }]}>{targetSummary}</Text></View>}
      <WeightChart records={health} />
      <Text style={screenStyles.notice}>明显变化只建议关注并咨询专业人士，APP 不进行疾病判断。</Text>
    </Card>
    <SectionTitle title="快捷记录" />
    <View style={screenStyles.quickGrid}>
      {([['体重', 'weight', 'scale-bathroom'], ['症状', 'symptom', 'stethoscope'], ['就诊', 'visit', 'hospital-building'], ['用药', 'medication', 'pill']] as const).map(([label, type, icon]) => <Pressable key={type} accessibilityRole="button" accessibilityLabel={`记录${label}`} style={screenStyles.quick} onPress={() => openSheet({ kind: 'health', type })}><View style={screenStyles.quickIconWrap}><MaterialCommunityIcons name={icon} size={24} color={COLORS.rose} /></View><Text style={screenStyles.quickText}>{label}</Text></Pressable>)}
    </View>
  </Screen>;
}

export function CalendarScreen({ openSheet }: { openSheet: OpenSheet }) {
  const { snapshot, selectedPet } = useApp();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  if (!selectedPet) return <Screen><Empty title="暂无日历" detail="创建宠物后可查看提醒和记录。" /></Screen>;
  const events = [
    ...snapshot.careSchedules.filter((item) => item.pet_id === selectedPet.id).map((item) => ({ date: item.due_date, kind: CARE_LABELS[item.category], title: item.title, color: item.status === 'pending' ? COLORS.coral : COLORS.sage, action: () => openSheet({ kind: 'care', existing: item }) })),
    ...snapshot.healthRecords.filter((item) => item.pet_id === selectedPet.id).map((item) => ({ date: item.occurred_at, kind: HEALTH_LABELS[item.type], title: item.title, color: COLORS.sage, action: () => openSheet({ kind: 'health', existing: item }) })),
    ...snapshot.timeline.filter((item) => item.pet_id === selectedPet.id).map((item) => ({ date: item.occurred_at, kind: '成长', title: item.title, color: '#B58563', action: () => openSheet({ kind: 'timeline', existing: item }) })),
  ].filter((item) => item.date.slice(0, 7) === month).sort((a, b) => b.date.localeCompare(a.date));
  const grouped = events.reduce<Record<string, typeof events>>((acc, event) => { (acc[event.date] ??= []).push(event); return acc; }, {});
  const changeMonth = (delta: number) => {
    const [year, value] = month.split('-').map(Number);
    const next = new Date(year!, value! - 1 + delta, 1, 12);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };
  return <Screen>
    <PetSwitcher />
    <Card style={screenStyles.calendarHeader}>
      <Text style={screenStyles.eyebrow}>{selectedPet.name} 的日历</Text>
      <View style={screenStyles.monthNav}><Pressable accessibilityRole="button" accessibilityLabel="上个月" onPress={() => changeMonth(-1)} style={screenStyles.monthButton}><MaterialCommunityIcons name="chevron-left" size={25} color={COLORS.sageDark} /></Pressable><Text style={screenStyles.heroTitle}>{month.replace('-', ' 年 ')} 月</Text><Pressable accessibilityRole="button" accessibilityLabel="下个月" onPress={() => changeMonth(1)} style={screenStyles.monthButton}><MaterialCommunityIcons name="chevron-right" size={25} color={COLORS.sageDark} /></Pressable></View>
      <View style={screenStyles.monthActions}><Button compact title="回到本月" variant="ghost" disabled={month === todayIso().slice(0, 7)} onPress={() => setMonth(todayIso().slice(0, 7))} /><Text style={screenStyles.muted}>{events.length} 条记录</Text></View>
      <Text style={screenStyles.muted}>护理计划、健康记录和成长事件按月集中显示。</Text>
    </Card>
    {Object.keys(grouped).length === 0 ? <Empty title="这个月还没有记录" detail="切换月份查看，或从悬浮加号添加第一条记录。" /> : Object.entries(grouped).map(([date, items]) => <View key={date} style={screenStyles.dateGroup}><Text style={screenStyles.dateTitle}>{date}</Text>{items.map((item, index) => <Pressable key={`${item.kind}-${index}`} onPress={item.action} style={screenStyles.calendarRow}><View style={[screenStyles.calendarDot, { backgroundColor: item.color }]} /><View style={{ flex: 1 }}><Text style={screenStyles.itemTitle}>{item.title}</Text><Text style={screenStyles.itemMeta}>{item.kind} · 点击编辑</Text></View></Pressable>)}</View>)}
  </Screen>;
}

export function GrowthScreen({ openSheet }: { openSheet: OpenSheet }) {
  const { snapshot, selectedPet, refresh } = useApp();
  if (!selectedPet) return <Screen><Empty title="暂无成长记录" detail="创建宠物后开始记录成长。" /></Screen>;
  const entries = snapshot.timeline.filter((item) => item.pet_id === selectedPet.id);
  const remove = (entry: TimelineEntry) => Alert.alert('移入回收站？', '成长照片文件会保留，恢复记录后仍可显示。', [{ text: '取消' }, { text: '删除', style: 'destructive', onPress: async () => { await moveToTrash('timeline', entry.id); await refresh(); } }]);
  return <Screen>
    <PetSwitcher />
    <Card style={screenStyles.growthHero}><Text style={screenStyles.eyebrow}>成长时间轴</Text><Text style={screenStyles.heroTitle}>{selectedPet.name} · {daysBetween(selectedPet.home_date) ?? 0} 天陪伴</Text><View style={screenStyles.actionRow}><Button compact title="添加成长记录" onPress={() => openSheet({ kind: 'timeline' })} /><Button compact title="生成成长卡" variant="secondary" onPress={() => openSheet({ kind: 'memory', mode: 'growth' })} /><Button compact title="年度回忆长图" variant="ghost" onPress={() => openSheet({ kind: 'memory', mode: 'annual' })} /></View></Card>
    {entries.length === 0 ? <Empty title="第一段回忆等你记录" detail="照片、里程碑、生日和到家纪念都会出现在这里。" action="添加成长记录" onAction={() => openSheet({ kind: 'timeline' })} /> : entries.map((entry, index) => <React.Fragment key={entry.id}>
      {(index === 0 || entries[index - 1]!.occurred_at.slice(0, 4) !== entry.occurred_at.slice(0, 4)) && <Text style={screenStyles.yearTitle}>{entry.occurred_at.slice(0, 4)} 年</Text>}
      <View style={screenStyles.timelineRow}>
      <View style={screenStyles.timelineRail}><View style={screenStyles.timelineDot} />{index < entries.length - 1 && <View style={screenStyles.timelineLine} />}</View>
      <Card style={screenStyles.timelineCard}>
        {!!entry.relative_photo_path && <Image source={{ uri: resolvePrivateUri(entry.relative_photo_path)! }} style={screenStyles.timelinePhoto} />}
        <Text style={screenStyles.itemMeta}>{entry.occurred_at} · {entry.location || '成长瞬间'}</Text><Text style={screenStyles.itemTitle}>{entry.title}</Text>{!!entry.note && <Text style={screenStyles.muted}>{entry.note}</Text>}
        <View style={screenStyles.actionRow}><Button compact title="编辑" variant="ghost" onPress={() => openSheet({ kind: 'timeline', existing: entry })} /><Button compact title="删除" variant="danger" onPress={() => remove(entry)} /></View>
      </Card>
    </View></React.Fragment>)}
  </Screen>;
}

export function ProfileScreen({ openSheet }: { openSheet: OpenSheet }) {
  const { snapshot, selectedPet, refresh } = useApp();
  const [attachmentFilter, setAttachmentFilter] = useState('全部');
  if (!selectedPet) return <Screen><Empty title="建立第一份档案" detail="不需要登录，数据只保存在手机中。" action="创建宠物" onAction={() => openSheet({ kind: 'pet' })} /></Screen>;
  const photos = snapshot.photos.filter((item) => item.pet_id === selectedPet.id).sort((a, b) => a.position - b.position);
  const health = snapshot.healthRecords.filter((item) => item.pet_id === selectedPet.id);
  const careHistory = snapshot.careRecords.filter((item) => item.pet_id === selectedPet.id);
  const attachments = snapshot.attachments.filter((item) => item.pet_id === selectedPet.id);
  const attachmentCategories = ['全部', ...Array.from(new Set(attachments.map((item) => item.category)))];
  // Editing an attachment can remove the currently selected category, and switching
  // pets can expose an entirely different set of categories. Fall back immediately
  // so the folder never looks empty because of a stale, invisible filter.
  const effectiveAttachmentFilter = attachmentCategories.includes(attachmentFilter) ? attachmentFilter : '全部';
  const filteredAttachments = effectiveAttachmentFilter === '全部' ? attachments : attachments.filter((item) => item.category === effectiveAttachmentFilter);
  const removeHealth = (item: HealthRecord) => Alert.alert('移入回收站？', '记录保留 30 天，可在设置中恢复。', [{ text: '取消' }, { text: '删除', style: 'destructive', onPress: async () => { await moveToTrash('health', item.id); await refresh(); } }]);
  const removeAttachment = (id: string) => Alert.alert('移入回收站？', '附件文件暂不清理，30 天内可恢复。', [{ text: '取消' }, { text: '删除', style: 'destructive', onPress: async () => { await moveToTrash('attachment', id); await refresh(); } }]);
  const removeCareHistory = (item: CareRecord) => Alert.alert('移入回收站？', '护理历史保留 30 天，可在设置中恢复。', [{ text: '取消' }, { text: '删除', style: 'destructive', onPress: async () => { await moveToTrash('care_record', item.id); await refresh(); } }]);
  const removePet = () => Alert.alert(`删除 ${selectedPet.name} 的档案？`, '宠物档案进入回收站后，它的照片与全部记录会暂时隐藏；30 天内恢复档案即可重新显示。', [{ text: '取消' }, { text: '移入回收站', style: 'destructive', onPress: async () => {
    for (const item of snapshot.careSchedules.filter((value) => value.pet_id === selectedPet.id)) await cancelCareNotification(item.id);
    await moveToTrash('pet', selectedPet.id); await refresh();
  } }]);
  const shareAttachment = async (item: Attachment) => {
    const uri = resolvePrivateUri(item.relative_path);
    if (!uri || !(await Sharing.isAvailableAsync())) return Alert.alert('无法打开系统分享面板');
    await Sharing.shareAsync(uri, { dialogTitle: `打开或分享 ${item.display_name}`, mimeType: item.mime_type });
  };
  return <Screen>
    <PetSwitcher />
    <Card style={screenStyles.profileHero}>
      {photos[0] ? <Image source={{ uri: resolvePrivateUri((photos.find((item) => item.is_primary) ?? photos[0])!.relative_path)! }} style={screenStyles.profilePhoto} /> : <View style={screenStyles.profilePhotoFallback}><MaterialCommunityIcons name="paw" size={52} color={COLORS.rose} /></View>}
      <Text style={screenStyles.heroTitle}>{selectedPet.name}</Text><Text style={screenStyles.muted}>{selectedPet.species} · {selectedPet.breed || '品种未填写'} · {selectedPet.sex || '性别未填写'}</Text>
      {photos.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={screenStyles.profileGallery}>{photos.map((photo) => <Image key={photo.id} source={{ uri: resolvePrivateUri(photo.relative_path)! }} style={[screenStyles.galleryPhoto, !!photo.is_primary && screenStyles.galleryPrimary]} />)}</ScrollView>}
      <View style={screenStyles.actionRow}><Button compact title="编辑档案" onPress={() => openSheet({ kind: 'pet', pet: selectedPet })} /><Button compact title={`管理照片 ${photos.length}/5`} variant="secondary" onPress={() => openSheet({ kind: 'photos', pet: selectedPet })} /><Button compact title="添加宠物" variant="ghost" onPress={() => openSheet({ kind: 'pet' })} /></View>
    </Card>
    <SectionTitle title="健康背景" />
    <Card><Info label="生日" value={selectedPet.birth_date || '未填写'} /><Info label="到家日" value={selectedPet.home_date || '未填写'} /><Info label="目标体重" value={selectedPet.target_weight_min == null && selectedPet.target_weight_max == null ? '未设置' : `${selectedPet.target_weight_min ?? '—'}–${selectedPet.target_weight_max ?? '—'} kg`} /><Info label="芯片号" value={selectedPet.microchip || '未填写'} /><Info label="过敏" value={selectedPet.allergies || '无记录'} /><Info label="慢性病" value={selectedPet.chronic_conditions || '无记录'} /><Info label="长期用药" value={selectedPet.long_term_medications || '无记录'} /><Info label="常用医院" value={[selectedPet.hospital, selectedPet.veterinarian, selectedPet.hospital_phone].filter(Boolean).join(' · ') || '未填写'} /></Card>
    <SectionTitle title="健康记录" action="新增" onAction={() => openSheet({ kind: 'health' })} />
    {health.length === 0 ? <Empty title="暂无健康记录" detail="体重、症状、就诊和用药会保存在这里。" /> : health.slice(0, 12).map((item) => <Card key={item.id}><View style={screenStyles.between}><Text style={[screenStyles.itemTitle, { flex: 1 }]}>{HEALTH_LABELS[item.type]} · {item.title}</Text><Text style={screenStyles.itemMeta}>{item.occurred_at}</Text></View><Text style={screenStyles.muted}>{item.type === 'weight' ? `${item.weight ?? '-'} kg · 体况 ${item.body_condition ?? '-'}` : item.diagnosis || item.symptoms || item.medication || item.notes || '无补充内容'}</Text><Text style={screenStyles.itemMeta}>{attachments.filter((value) => value.owner_type === 'health' && value.owner_id === item.id).length} 个关联附件</Text><View style={screenStyles.actionRow}><Button compact title="编辑" variant="ghost" onPress={() => openSheet({ kind: 'health', existing: item })} /><Button compact title="加附件" variant="secondary" onPress={() => openSheet({ kind: 'attachment', ownerType: 'health', ownerId: item.id })} /><Button compact title="删除" variant="danger" onPress={() => removeHealth(item)} /></View></Card>)}
    <SectionTitle title="护理历史" action="补记" onAction={() => openSheet({ kind: 'care_history' })} />
    {careHistory.length === 0 ? <Empty title="暂无护理历史" detail="完成或跳过提醒后会自动记录，也可以手动补记。" /> : careHistory.slice(0, 12).map((item) => <Card key={item.id}><View style={screenStyles.between}><Text style={[screenStyles.itemTitle, { flex: 1 }]}>{CARE_LABELS[item.category]} · {item.title}</Text><Text style={screenStyles.itemMeta}>{item.occurred_at}</Text></View><Text style={screenStyles.muted}>{item.action === 'completed' ? '已完成' : '已跳过'}{item.cost != null ? ` · ¥${item.cost}` : ''}{item.notes ? ` · ${item.notes}` : ''}</Text><View style={screenStyles.actionRow}><Button compact title="编辑" variant="ghost" onPress={() => openSheet({ kind: 'care_history', existing: item })} /><Button compact title="创建下次计划" variant="secondary" onPress={() => openSheet({ kind: 'care', fromHistory: item })} /><Button compact title="删除" variant="danger" onPress={() => removeCareHistory(item)} /></View></Card>)}
    <SectionTitle title="健康资料夹" action="添加附件" onAction={() => openSheet({ kind: 'attachment' })} />
    {attachments.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={screenStyles.filterRow}>{attachmentCategories.map((category) => <Pressable key={category} accessibilityRole="button" accessibilityLabel={`筛选${category}`} onPress={() => setAttachmentFilter(category)} style={[screenStyles.filterChip, effectiveAttachmentFilter === category && screenStyles.filterChipActive]}><Text style={[screenStyles.filterText, effectiveAttachmentFilter === category && screenStyles.filterTextActive]}>{category}</Text></Pressable>)}</ScrollView>}
    {attachments.length === 0 ? <Empty title="资料夹为空" detail="疫苗本、检查报告、处方和芯片证明可保存在本机。" /> : filteredAttachments.length === 0 ? <Empty title="此类型暂无资料" detail="切换资料类型，或添加新的本地附件。" /> : filteredAttachments.map((item) => <Card key={item.id}><View style={screenStyles.attachmentTitle}><MaterialCommunityIcons name="paperclip" size={20} color={COLORS.rose} /><Text style={[screenStyles.itemTitle, { flex: 1 }]}>{item.display_name}</Text></View><Text style={screenStyles.itemMeta}>{item.category} · {item.occurred_at}{item.owner_type !== 'folder' ? ' · 已关联记录' : ''}</Text><Text style={screenStyles.muted}>{item.notes || '已保存在应用私有目录'}</Text><View style={screenStyles.actionRow}><Button compact title="打开/分享" variant="secondary" onPress={() => shareAttachment(item).catch((error) => Alert.alert('无法打开', error instanceof Error ? error.message : '未知错误'))} /><Button compact title="编辑" variant="ghost" onPress={() => openSheet({ kind: 'attachment', existing: item })} /><Button compact title="删除" variant="danger" onPress={() => removeAttachment(item.id)} /></View></Card>)}
    <SectionTitle title="数据与工具" />
    <Card><Button title="生成一分钟就诊摘要 PDF" variant="secondary" onPress={() => openSheet({ kind: 'settings' })} /><Button title="备份、恢复、通知与回收站" variant="ghost" onPress={() => openSheet({ kind: 'settings' })} /><Button title={`删除 ${selectedPet.name} 的档案`} variant="danger" onPress={removePet} /></Card>
  </Screen>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={screenStyles.info}><Text style={screenStyles.infoLabel}>{label}</Text><Text style={screenStyles.infoValue}>{value}</Text></View>;
}

const screenStyles = StyleSheet.create({
  petSwitch: { gap: 8, paddingVertical: 2 }, petChip: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 6, paddingRight: 12, borderRadius: 999, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line },
  petChipActive: { backgroundColor: COLORS.sage, borderColor: COLORS.sage }, petChipText: { color: COLORS.ink, fontWeight: '700' }, petChipTextActive: { color: COLORS.white }, petAvatar: { width: 30, height: 30, borderRadius: 15 }, petAvatarFallback: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.sand },
  hero: { overflow: 'hidden', padding: 0 }, heroPhoto: { width: '100%', height: 210 }, heroEmpty: { height: 160, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.blush },
  heroContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, gap: 8 }, heroEyebrow: { color: COLORS.sageDark, fontWeight: '700' }, heroContentTitle: { color: COLORS.ink, fontSize: 25, fontWeight: '900' }, heroButtonSafe: { marginTop: 4 },
  anniversaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, anniversaryPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.blush, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 }, anniversaryText: { color: COLORS.sageDark, fontSize: 12, fontWeight: '700' },
  eyebrow: { color: COLORS.sageDark, fontWeight: '700' }, heroTitle: { color: COLORS.ink, fontSize: 25, fontWeight: '900' },
  itemTitle: { color: COLORS.ink, fontWeight: '800', fontSize: 16 }, itemMeta: { color: COLORS.muted, fontSize: 12 }, muted: { color: COLORS.muted, lineHeight: 20 }, tiny: { color: COLORS.muted, fontSize: 10 }, overdue: { color: COLORS.brick, fontWeight: '700' }, statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.sage },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { color: COLORS.ink, fontSize: 32, fontWeight: '900' }, unit: { fontSize: 15, color: COLORS.muted }, delta: { color: COLORS.sageDark, fontWeight: '700' }, chartDates: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, marginTop: -17 }, notice: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  targetBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#F7E9E5', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12 }, targetBadgeOk: { backgroundColor: COLORS.mint }, targetText: { color: COLORS.sageDark, fontSize: 12, fontWeight: '700' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, quick: { width: '47%', minHeight: 86, borderRadius: 16, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, padding: 14, justifyContent: 'center', gap: 7 }, quickIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.blush }, quickText: { color: COLORS.ink, fontWeight: '800' },
  calendarHeader: { backgroundColor: COLORS.mint }, monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, monthButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line }, monthActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, dateGroup: { gap: 7 }, dateTitle: { fontWeight: '900', color: COLORS.sageDark, fontSize: 17 }, calendarRow: { backgroundColor: COLORS.white, borderRadius: 14, padding: 13, flexDirection: 'row', gap: 11, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line }, calendarDot: { width: 10, height: 10, borderRadius: 5 },
  growthHero: { backgroundColor: COLORS.mint }, yearTitle: { color: COLORS.sageDark, fontWeight: '900', fontSize: 20, marginTop: 4 }, timelineRow: { flexDirection: 'row', alignItems: 'stretch' }, timelineRail: { width: 28, alignItems: 'center' }, timelineDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: COLORS.coral, marginTop: 20, zIndex: 2 }, timelineLine: { flex: 1, width: 2, backgroundColor: '#C9D7CA' }, timelineCard: { flex: 1, marginBottom: 12 }, timelinePhoto: { width: '100%', height: 180, borderRadius: 13, backgroundColor: COLORS.sand },
  profileHero: { alignItems: 'center', backgroundColor: COLORS.blush }, profilePhoto: { width: 116, height: 116, borderRadius: 58, borderWidth: 4, borderColor: COLORS.white }, profilePhotoFallback: { width: 116, height: 116, borderRadius: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8F4' }, profileGallery: { gap: 8, paddingVertical: 4 }, galleryPhoto: { width: 66, height: 66, borderRadius: 14, borderWidth: 2, borderColor: COLORS.white }, galleryPrimary: { borderColor: COLORS.coral },
  info: { flexDirection: 'row', gap: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingVertical: 8 }, infoLabel: { width: 72, color: COLORS.muted }, infoValue: { flex: 1, color: COLORS.ink, fontWeight: '600' },
  filterRow: { gap: 8, paddingVertical: 2 }, filterChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line }, filterChipActive: { backgroundColor: COLORS.sage, borderColor: COLORS.sage }, filterText: { color: COLORS.muted, fontSize: 13 }, filterTextActive: { color: COLORS.white, fontWeight: '800' }, attachmentTitle: { flexDirection: 'row', alignItems: 'center', gap: 7 },
});
