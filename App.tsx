import React, { useState } from 'react';
import { Alert, Image, Modal, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppProvider, useApp } from './src/state/AppContext';
import { COLORS } from './src/constants';
import { Loading, Sheet } from './src/components/ui';
import { AttachmentForm, CareForm, CareHistoryForm, HealthForm, PetForm, PhotoManager, TimelineForm, TrashView } from './src/components/forms';
import { CalendarScreen, GrowthScreen, ProfileScreen, SheetRequest, TodayScreen } from './src/screens/MainScreens';
import { MemoryCardView, SettingsView } from './src/screens/ToolsViews';
import { pickAndRestoreBackup } from './src/services/backup';
import { syncPendingNotifications } from './src/services/notifications';

type Tab = 'today' | 'calendar' | 'growth' | 'profile';

export default function App() {
  return <SafeAreaProvider><AppProvider><StatusBar barStyle="dark-content" backgroundColor={COLORS.cream} /><MainApp /></AppProvider></SafeAreaProvider>;
}

function MainApp() {
  const { loading, error, snapshot, setSelectedPetId, refresh } = useApp();
  const [tab, setTab] = useState<Tab>('today');
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const [quickVisible, setQuickVisible] = useState(false);
  const [restoring, setRestoring] = useState(false);
  if (loading) return <Loading />;
  if (error) return <SafeAreaView edges={['top', 'bottom']} style={appStyles.error}><Text style={appStyles.errorTitle}>本地档案无法打开</Text><Text style={appStyles.errorText}>{error}</Text></SafeAreaView>;
  if (snapshot.pets.length === 0) {
    const restoreOnboarding = () => Alert.alert('从完整备份恢复？', '选择之前导出的 ZIP 备份包。校验成功后会恢复宠物、记录、照片和附件。', [{ text: '取消' }, { text: '选择备份', onPress: async () => {
      setRestoring(true);
      try {
        const manifest = await pickAndRestoreBackup();
        if (!manifest) return;
        await refresh(); await syncPendingNotifications();
        Alert.alert('恢复成功', `已恢复 ${manifest.counts.pets ?? 0} 只宠物和 ${manifest.files.length - 1} 个本地文件。`);
      } catch (cause) { Alert.alert('恢复未完成', cause instanceof Error ? cause.message : '未知错误'); } finally { setRestoring(false); }
    } }]);
    return <SafeAreaView edges={['top', 'bottom']} style={appStyles.onboarding}>
    <View style={appStyles.onboardingHeader}><View style={appStyles.logoCircle}><Image source={require('./android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.webp')} style={appStyles.logoImage} resizeMode="cover" /></View><Text style={appStyles.brand}>爪印日记</Text><Text style={appStyles.promise}>无需注册 · 无需联网 · 数据只在手机里</Text><Pressable accessibilityRole="button" accessibilityLabel="从完整备份恢复" testID="onboarding-restore-button" disabled={restoring} onPress={restoreOnboarding} style={({ pressed }) => [appStyles.restoreButton, pressed && { opacity: 0.8 }]}><MaterialCommunityIcons name="backup-restore" size={20} color={COLORS.sageDark} /><Text style={appStyles.restoreButtonText}>{restoring ? '正在校验并恢复…' : '从完整备份恢复'}</Text></Pressable></View>
    <View style={{ flex: 1 }}><PetForm onDone={(petId) => { setSelectedPetId(petId); setTab('today'); }} /></View>
  </SafeAreaView>;
  }

  const openSheet = (request: SheetRequest) => setSheet(request);
  const closeSheet = () => setSheet(null);
  return <SafeAreaView edges={['top', 'bottom']} style={appStyles.root}>
    <View style={appStyles.topbar}><View style={appStyles.brandRow}><Image source={require('./android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.webp')} style={appStyles.brandIcon} resizeMode="cover" /><View><Text style={appStyles.brandSmall}>爪印日记</Text><Text style={appStyles.local}>本地模式 · 离线可用</Text></View></View><Pressable accessibilityRole="button" accessibilityLabel="设置" onPress={() => openSheet({ kind: 'settings' })} style={appStyles.settings}><MaterialCommunityIcons name="cog-outline" size={23} color={COLORS.sageDark} /></Pressable></View>
    <View style={appStyles.content}>
      {tab === 'today' && <TodayScreen openSheet={openSheet} />}
      {tab === 'calendar' && <CalendarScreen openSheet={openSheet} />}
      {tab === 'growth' && <GrowthScreen openSheet={openSheet} />}
      {tab === 'profile' && <ProfileScreen openSheet={openSheet} />}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="快速记录" testID="global-fab" onPress={() => setQuickVisible(true)} style={({ pressed }) => [appStyles.fab, pressed && { opacity: 0.8 }]}><Text style={appStyles.fabText}>＋</Text></Pressable>
    <View style={appStyles.nav}>
      <NavItem icon="weather-sunny" label="今天" active={tab === 'today'} onPress={() => setTab('today')} />
      <NavItem icon="calendar-month-outline" label="日历" active={tab === 'calendar'} onPress={() => setTab('calendar')} />
      <NavItem icon="sprout-outline" label="成长" active={tab === 'growth'} onPress={() => setTab('growth')} />
      <NavItem icon="paw-outline" label="档案" active={tab === 'profile'} onPress={() => setTab('profile')} />
    </View>
    <QuickMenu visible={quickVisible} close={() => setQuickVisible(false)} open={(request) => { setQuickVisible(false); openSheet(request); }} />
    <Sheet visible={!!sheet} title={sheetTitle(sheet)} onClose={closeSheet}>{sheet && renderSheet(sheet, closeSheet, setSheet, setSelectedPetId)}</Sheet>
  </SafeAreaView>;
}

function NavItem({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active }} testID={`tab-${label}`} onPress={onPress} style={appStyles.navItem}><MaterialCommunityIcons name={icon as never} size={23} color={active ? COLORS.rose : '#9AA39B'} /><Text style={[appStyles.navLabel, active && appStyles.navLabelActive]}>{label}</Text></Pressable>;
}

function QuickMenu({ visible, close, open }: { visible: boolean; close: () => void; open: (request: SheetRequest) => void }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
    <Pressable style={appStyles.overlay} onPress={close}><Pressable style={[appStyles.quickSheet, { paddingBottom: Math.max(24, insets.bottom + 12) }]} onPress={() => undefined}>
      <View style={appStyles.handle} /><Text style={appStyles.quickTitle}>快速记录</Text><Text style={appStyles.quickHint}>选择一种记录，常用操作不超过 3 步。</Text>
      <View style={appStyles.quickGrid}>
        <Quick title="体重" icon="scale-bathroom" onPress={() => open({ kind: 'health', type: 'weight' })} />
        <Quick title="疫苗" icon="needle" onPress={() => open({ kind: 'care', category: 'vaccine' })} />
        <Quick title="驱虫" icon="shield-check-outline" onPress={() => open({ kind: 'care', category: 'deworm_internal' })} />
        <Quick title="用药" icon="pill" onPress={() => open({ kind: 'health', type: 'medication' })} />
        <Quick title="症状" icon="stethoscope" onPress={() => open({ kind: 'health', type: 'symptom' })} />
        <Quick title="就诊" icon="hospital-building" onPress={() => open({ kind: 'health', type: 'visit' })} />
        <Quick title="成长照片" icon="camera-outline" onPress={() => open({ kind: 'timeline' })} />
        <Quick title="体检提醒" icon="clipboard-pulse-outline" onPress={() => open({ kind: 'care', category: 'checkup' })} />
      </View>
    </Pressable></Pressable>
  </Modal>;
}

function Quick({ title, icon, onPress }: { title: string; icon: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={appStyles.quickItem}><View style={appStyles.quickIconWrap}><MaterialCommunityIcons name={icon as never} size={25} color={COLORS.rose} /></View><Text style={appStyles.quickText}>{title}</Text></Pressable>;
}

function sheetTitle(sheet: SheetRequest | null): string {
  if (!sheet) return '';
  switch (sheet.kind) {
    case 'pet': return sheet.pet ? '编辑宠物档案' : '添加宠物';
    case 'photos': return '管理宠物照片';
    case 'care': return sheet.existing ? '编辑护理提醒' : '添加护理提醒';
    case 'care_history': return sheet.existing ? '编辑护理历史' : '补记护理历史';
    case 'health': return sheet.existing ? '编辑健康记录' : '添加健康记录';
    case 'timeline': return sheet.existing ? '编辑成长记录' : '添加成长记录';
    case 'attachment': return sheet.existing ? '编辑资料附件' : '添加资料附件';
    case 'trash': return '回收站';
    case 'settings': return '设置与本地数据';
    case 'memory': return sheet.mode === 'growth' ? '成长卡' : '年度回忆长图';
  }
}

function renderSheet(sheet: SheetRequest, close: () => void, setSheet: (next: SheetRequest | null) => void, setSelectedPetId: (id: string) => void) {
  switch (sheet.kind) {
    case 'pet': return <PetForm pet={sheet.pet} onDone={(petId) => { setSelectedPetId(petId); close(); }} />;
    case 'photos': return <PhotoManager pet={sheet.pet} />;
    case 'care': return <CareForm existing={sheet.existing} initialCategory={sheet.category} fromHistory={sheet.fromHistory} onDone={close} />;
    case 'care_history': return <CareHistoryForm existing={sheet.existing} onDone={close} />;
    case 'health': return <HealthForm existing={sheet.existing} initialType={sheet.type} onDone={close} />;
    case 'timeline': return <TimelineForm existing={sheet.existing} onDone={close} />;
    case 'attachment': return <AttachmentForm existing={sheet.existing} ownerType={sheet.ownerType} ownerId={sheet.ownerId} onDone={close} />;
    case 'trash': return <TrashView />;
    case 'settings': return <SettingsView onOpenTrash={() => setSheet({ kind: 'trash' })} />;
    case 'memory': return <MemoryCardView mode={sheet.mode} />;
  }
}

const appStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.cream }, content: { flex: 1 },
  topbar: { height: 58, backgroundColor: COLORS.cream, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: COLORS.line }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, brandIcon: { width: 38, height: 38, borderRadius: 11 },
  brandSmall: { color: COLORS.ink, fontWeight: '900', fontSize: 17 }, local: { color: COLORS.sageDark, fontSize: 11 }, settings: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  nav: { zIndex: 10, height: 72, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.line, flexDirection: 'row', paddingHorizontal: 8 }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }, navIcon: { fontSize: 21 }, navLabel: { fontSize: 11, color: COLORS.muted }, navLabelActive: { color: COLORS.sageDark, fontWeight: '900' },
  fab: { zIndex: 30, position: 'absolute', bottom: 46, alignSelf: 'center', width: 62, height: 62, borderRadius: 31, backgroundColor: COLORS.coral, borderWidth: 5, borderColor: COLORS.cream, alignItems: 'center', justifyContent: 'center', elevation: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8 }, fabText: { color: COLORS.white, fontSize: 36, lineHeight: 40, fontWeight: '400' },
  onboarding: { flex: 1, backgroundColor: COLORS.cream }, onboardingHeader: { padding: 24, alignItems: 'center', gap: 6, backgroundColor: COLORS.blush }, logoCircle: { width: 76, height: 76, borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8F4', borderWidth: 1, borderColor: '#EAC9C7' }, logoImage: { width: 76, height: 76 }, brand: { fontSize: 30, color: COLORS.ink, fontWeight: '900' }, promise: { color: COLORS.sageDark, fontWeight: '700' },
  restoreButton: { marginTop: 8, minHeight: 44, paddingHorizontal: 18, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line }, restoreButtonText: { color: COLORS.sageDark, fontWeight: '800' },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: COLORS.cream }, errorTitle: { fontSize: 22, color: COLORS.brick, fontWeight: '900' }, errorText: { color: COLORS.muted, marginTop: 12, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: '#00000055', justifyContent: 'flex-end' }, quickSheet: { backgroundColor: COLORS.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 36 }, handle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', backgroundColor: '#C8CEC7', marginBottom: 13 }, quickTitle: { color: COLORS.ink, fontSize: 22, fontWeight: '900' }, quickHint: { color: COLORS.muted, marginTop: 3, marginBottom: 14 }, quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, quickItem: { width: '22.5%', minHeight: 88, backgroundColor: COLORS.white, borderRadius: 15, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center', gap: 6 }, quickIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.blush, alignItems: 'center', justifyContent: 'center' }, quickText: { color: COLORS.ink, fontWeight: '700', fontSize: 12 },
});
