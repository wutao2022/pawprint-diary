import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { CARE_LABELS, COLORS, daysBetween } from '../constants';
import { resolvePrivateUri } from '../data/files';
import { getSetting } from '../data/repository';
import { exportBackup, pickAndRestoreBackup, saveBackupToFolder } from '../services/backup';
import { runLocalDiagnostics, DiagnosticResult } from '../services/diagnostics';
import { generateAnnualMemoryPdf, generateVisitSummary } from '../services/documents';
import {
  notificationPermissionStatus, requestNotificationPermission,
  scheduleTestNotification, syncPendingNotifications,
} from '../services/notifications';
import { useApp } from '../state/AppContext';
import { Button, Card, Empty, Loading, SectionTitle } from '../components/ui';
import { openNotificationSettings } from '../components/forms';

export function SettingsView({ onOpenTrash }: { onOpenTrash: () => void }) {
  const { selectedPet, refresh } = useApp();
  const [permission, setPermission] = useState<Notifications.PermissionStatus | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [lastRestore, setLastRestore] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[] | null>(null);
  const load = async () => {
    setPermission(await notificationPermissionStatus());
    setLastBackup(await getSetting('last_backup_at'));
    setLastRestore(await getSetting('last_restore_at'));
  };
  useEffect(() => { load().catch(() => undefined); }, []);
  const action = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try { await fn(); } catch (error) { Alert.alert('操作未完成', error instanceof Error ? error.message : '未知错误'); } finally { setBusy(null); await load(); }
  };
  const restore = () => Alert.alert('恢复完整备份？', '恢复前会保存当前数据快照；导入失败会自动回滚。成功后当前数据将被备份内容替换。', [{ text: '取消' }, { text: '选择备份', onPress: () => action('restore', async () => {
    const manifest = await pickAndRestoreBackup();
    if (!manifest) return;
    await refresh();
    await syncPendingNotifications();
    Alert.alert('恢复成功', `已恢复 ${manifest.counts.pets ?? 0} 只宠物、${manifest.files.length - 1} 个本地文件。`);
  }) }]);
  return <ScrollView contentContainerStyle={toolStyles.content}>
    <Text style={toolStyles.intro}>所有业务数据、照片和附件都保存在本机。只有你主动导出或分享时，文件才会离开应用私有目录。</Text>
    <SectionTitle title="本地通知" />
    <Card>
      <Text style={toolStyles.title}>权限状态：{permission === Notifications.PermissionStatus.GRANTED ? '已开启' : permission === Notifications.PermissionStatus.DENIED ? '已拒绝' : '尚未询问'}</Text>
      <Text style={toolStyles.meta}>疫苗、驱虫、用药、体检与护理事项使用系统本地通知，不依赖服务器。</Text>
      {permission === Notifications.PermissionStatus.GRANTED ? <Button title="5 秒后发送测试通知" disabled={!!busy} onPress={() => action('notification', async () => { await scheduleTestNotification(5); Alert.alert('已安排', '请回到桌面等待约 5 秒。'); })} testID="test-notification-button" /> : <Button title="开启通知权限" onPress={() => action('permission', async () => { const granted = await requestNotificationPermission(); if (!granted) Alert.alert('通知未开启', '首页仍会显示所有逾期事项。你可以稍后在系统设置中开启。'); })} />}
      <Button title="打开系统通知设置" variant="ghost" onPress={() => openNotificationSettings()} />
    </Card>
    <SectionTitle title="完整备份与恢复" />
    <Card>
      <Text style={toolStyles.title}>备份包含 SQLite 数据库、宠物照片、成长照片和资料附件</Text>
      <Text style={toolStyles.meta}>卸载 APP 前必须先导出备份。Android 自动云备份已关闭。</Text>
      <Text style={toolStyles.meta}>上次备份：{lastBackup?.slice(0, 19).replace('T', ' ') || '尚未备份'}</Text>
      <Text style={toolStyles.meta}>上次恢复：{lastRestore?.slice(0, 19).replace('T', ' ') || '尚未恢复'}</Text>
      <Button title={busy === 'backup' ? '正在打包并校验…' : '一键导出完整备份'} disabled={!!busy} onPress={() => action('backup', async () => { const result = await exportBackup(); Alert.alert('备份已生成', `共 ${result.manifest.files.length} 个文件，请在系统分享页保存到安全位置。`); })} testID="export-backup-button" />
      <Button title={busy === 'save-backup' ? '正在写入本地文件夹…' : '保存备份到本地文件夹'} variant="secondary" disabled={!!busy} onPress={() => action('save-backup', async () => { const result = await saveBackupToFolder(); if (result) Alert.alert('备份已保存', `已写入所选文件夹，共 ${result.manifest.files.length} 个文件。`); })} testID="save-backup-folder-button" />
      <Button title={busy === 'restore' ? '正在校验并恢复…' : '从备份完整恢复'} variant="secondary" disabled={!!busy} onPress={restore} testID="restore-backup-button" />
    </Card>
    <SectionTitle title="本地生成与分享" />
    <Card>
      {selectedPet ? <><Button title={`生成 ${selectedPet.name} 的就诊摘要 PDF`} variant="secondary" onPress={() => action('visit', async () => { await generateVisitSummary(selectedPet); })} /><Button title={`生成 ${new Date().getFullYear()} 年度回忆 PDF`} variant="ghost" onPress={() => action('annual', async () => { await generateAnnualMemoryPdf(selectedPet); })} /></> : <Text style={toolStyles.meta}>先创建宠物后可生成。</Text>}
    </Card>
    <SectionTitle title="回收站与完整性" />
    <Card>
      <Button title="打开 30 天回收站" variant="secondary" onPress={onOpenTrash} />
      <Button title={busy === 'diagnostics' ? '正在自检…' : '运行本地完整性自检'} variant="ghost" onPress={() => action('diagnostics', async () => setDiagnostics(await runLocalDiagnostics()))} testID="run-diagnostics-button" />
      {diagnostics?.map((item) => <View key={item.name} style={toolStyles.diag}><Text style={[toolStyles.diagStatus, { color: item.passed ? COLORS.sageDark : COLORS.brick }]}>{item.passed ? '✓' : '×'} {item.name}</Text><Text style={toolStyles.meta}>{item.detail}</Text></View>)}
    </Card>
    <SectionTitle title="隐私说明" />
    <Card><Text style={toolStyles.meta}>无需账号 · 无广告 · 无后端 · 离线可用</Text><Text style={toolStyles.meta}>未申请定位、通讯录、电话、麦克风或整个相册访问权限。相册使用 Android 系统照片选择器。</Text><Text style={toolStyles.meta}>版本 1.0.1 · 数据库架构 v3 · 备份格式 v1</Text></Card>
  </ScrollView>;
}

export function MemoryCardView({ mode }: { mode: 'growth' | 'annual' }) {
  const { selectedPet, snapshot } = useApp();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  if (!selectedPet) return <Empty title="没有可生成的内容" detail="请先创建宠物。" />;
  const entries = snapshot.timeline.filter((item) => item.pet_id === selectedPet.id);
  const photos = snapshot.photos.filter((item) => item.pet_id === selectedPet.id);
  const heroPath = entries.find((item) => item.relative_photo_path)?.relative_photo_path ?? photos.find((item) => item.is_primary)?.relative_path ?? photos[0]?.relative_path;
  const health = snapshot.healthRecords.filter((item) => item.pet_id === selectedPet.id);
  const latestWeight = health.find((item) => item.type === 'weight')?.weight;
  const completed = snapshot.careRecords.filter((item) => item.pet_id === selectedPet.id && item.action === 'completed').length;
  const year = new Date().getFullYear();
  const yearEntries = entries.filter((item) => item.occurred_at.startsWith(String(year)));
  const share = async () => {
    setBusy(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: mode === 'growth' ? `${selectedPet.name} 成长卡` : `${selectedPet.name} 年度回忆长图` });
    } catch (error) { Alert.alert('生成失败', error instanceof Error ? error.message : '未知错误'); } finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={toolStyles.content}>
    <View ref={cardRef} collapsable={false} style={[memoryStyles.card, mode === 'annual' && memoryStyles.annualCard]}>
      <Text style={memoryStyles.brand}>爪印日记 · 本机生成</Text>
      <Text style={memoryStyles.kicker}>{mode === 'annual' ? `${year} 年度回忆` : '我的成长卡'}</Text>
      <Text style={memoryStyles.name}>{selectedPet.name}</Text>
      {heroPath ? <Image source={{ uri: resolvePrivateUri(heroPath)! }} style={mode === 'annual' ? memoryStyles.annualPhoto : memoryStyles.photo} /> : <View style={[memoryStyles.photo, memoryStyles.photoEmpty]}><MaterialCommunityIcons name="paw" size={70} color={COLORS.rose} /></View>}
      <View style={memoryStyles.stats}><Stat value={`${daysBetween(selectedPet.home_date) ?? 0}`} label="陪伴天数" /><Stat value={`${latestWeight ?? '—'}`} label="最近体重 kg" /><Stat value={`${completed}`} label="完成护理" /></View>
      {mode === 'growth' ? <><Text style={memoryStyles.quote}>{entries[0]?.title ? `“${entries[0].title}”` : '每一个普通日子，都值得被保存。'}</Text><Text style={memoryStyles.detail}>{selectedPet.species} · {selectedPet.breed || '独一无二'} · 到家日 {selectedPet.home_date || '未填写'}</Text></> : <>
        <Text style={memoryStyles.section}>这一年的难忘时刻</Text>
        {yearEntries.slice(0, 8).map((entry) => <View key={entry.id} style={memoryStyles.memoryRow}><Text style={memoryStyles.memoryDate}>{entry.occurred_at.slice(5)}</Text><Text style={memoryStyles.memoryTitle}>{entry.title}</Text></View>)}
        {yearEntries.length === 0 && <Text style={memoryStyles.quote}>从今天开始，记录属于我们的这一年。</Text>}
        <Text style={memoryStyles.footer}>本年保存 {yearEntries.length} 个成长瞬间 · 所有内容仅在本机生成</Text>
      </>}
    </View>
    <Button title={busy ? '正在生成 PNG…' : mode === 'growth' ? '生成并分享成长卡 PNG' : '生成并分享年度回忆长图 PNG'} disabled={busy} onPress={share} testID="share-memory-card-button" />
    <Text style={toolStyles.meta}>分享的是生成图片，不包含可编辑的健康数据库。</Text>
  </ScrollView>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={memoryStyles.stat}><Text style={memoryStyles.statValue}>{value}</Text><Text style={memoryStyles.statLabel}>{label}</Text></View>;
}

const toolStyles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 50, gap: 14 }, intro: { color: COLORS.muted, lineHeight: 22 },
  title: { color: COLORS.ink, fontWeight: '800', fontSize: 16 }, meta: { color: COLORS.muted, lineHeight: 20, fontSize: 13 },
  diag: { borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 9 }, diagStatus: { fontWeight: '800' },
});

const memoryStyles = StyleSheet.create({
  card: { backgroundColor: COLORS.mint, borderRadius: 24, padding: 24, minHeight: 610, overflow: 'hidden', gap: 12 },
  annualCard: { minHeight: 980, backgroundColor: COLORS.cream, borderWidth: 8, borderColor: COLORS.mint },
  brand: { color: COLORS.sageDark, fontWeight: '800', fontSize: 12, letterSpacing: 1 }, kicker: { color: COLORS.coral, fontWeight: '900', fontSize: 15 }, name: { color: COLORS.ink, fontWeight: '900', fontSize: 38 },
  photo: { width: '100%', height: 265, borderRadius: 20, backgroundColor: COLORS.sand }, annualPhoto: { width: '100%', height: 360, borderRadius: 20, backgroundColor: COLORS.sand }, photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', backgroundColor: '#FFFFFFCC', borderRadius: 17, padding: 12 }, stat: { flex: 1, alignItems: 'center', gap: 3 }, statValue: { color: COLORS.ink, fontSize: 23, fontWeight: '900' }, statLabel: { color: COLORS.muted, fontSize: 10 },
  quote: { color: COLORS.sageDark, fontSize: 20, fontWeight: '800', lineHeight: 30, marginTop: 8 }, detail: { color: COLORS.muted }, section: { color: COLORS.sageDark, fontSize: 22, fontWeight: '900', marginTop: 10 },
  memoryRow: { flexDirection: 'row', gap: 15, borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingVertical: 10 }, memoryDate: { color: COLORS.coral, fontWeight: '900', width: 52 }, memoryTitle: { color: COLORS.ink, fontWeight: '700', flex: 1 }, footer: { color: COLORS.muted, marginTop: 'auto', textAlign: 'center', fontSize: 12 },
});
