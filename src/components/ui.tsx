import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps,
  View, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants';

export function Screen({ children, contentContainerStyle }: { children: React.ReactNode; contentContainerStyle?: ViewStyle }) {
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.screen, contentContainerStyle]}>{children}</ScrollView>;
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  return <View testID={testID} style={[styles.card, style]}>{children}</View>;
}

type ButtonProps = { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; testID?: string; compact?: boolean };
export function Button({ title, onPress, variant = 'primary', disabled, testID, compact }: ButtonProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} testID={testID} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, compact && styles.buttonCompact, styles[`button_${variant}`], (pressed || disabled) && styles.buttonDim]}>
    <Text style={[styles.buttonText, variant !== 'primary' && styles[`buttonText_${variant}`]]}>{title}</Text>
  </Pressable>;
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return <View style={styles.fieldWrap}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor="#9AA39B" style={[styles.input, props.multiline && styles.multiline]} {...props} />
    {!!hint && <Text style={styles.hint}>{hint}</Text>}
  </View>;
}

export function Chip({ label, active, onPress, testID }: { label: string; active?: boolean; onPress: () => void; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} testID={testID} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </Pressable>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text>{action && onAction && <Pressable onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></Pressable>}</View>;
}

export function Empty({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return <Card style={styles.empty}><View style={styles.emptyIcon}><MaterialCommunityIcons name="paw" size={28} color={COLORS.rose} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text>{action && onAction && <Button title={action} onPress={onAction} variant="secondary" />}</Card>;
}

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} style={styles.sheetRoot}>
      <View style={styles.sheetHeader}><Pressable accessibilityLabel="关闭" onPress={onClose}><Text style={styles.close}>关闭</Text></Pressable><Text style={styles.sheetTitle}>{title}</Text><View style={{ width: 40 }} /></View>
      {children}
    </SafeAreaView>
  </Modal>;
}

export function Loading({ label = '正在读取本地档案…' }: { label?: string }) {
  return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.sage} /><Text style={styles.hint}>{label}</Text></View>;
}

export const styles = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 120, gap: 14, backgroundColor: COLORS.cream, flexGrow: 1 },
  card: { backgroundColor: COLORS.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: COLORS.line, gap: 8 },
  button: { minHeight: 48, paddingHorizontal: 18, borderRadius: 14, backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center' },
  buttonCompact: { minHeight: 36, paddingHorizontal: 12, borderRadius: 11 },
  button_primary: { backgroundColor: COLORS.coral },
  button_secondary: { backgroundColor: COLORS.mint, borderWidth: 1, borderColor: '#BCD0BF' },
  button_danger: { backgroundColor: '#F4E2DF', borderWidth: 1, borderColor: '#D9B3AC' },
  button_ghost: { backgroundColor: 'transparent' },
  buttonDim: { opacity: 0.55 },
  buttonText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  buttonText_secondary: { color: COLORS.sageDark },
  buttonText_danger: { color: COLORS.brick },
  buttonText_ghost: { color: COLORS.sageDark },
  fieldWrap: { gap: 6 }, label: { color: COLORS.ink, fontWeight: '700', fontSize: 14 },
  input: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, color: COLORS.ink, fontSize: 16 },
  multiline: { minHeight: 88, textAlignVertical: 'top' }, hint: { fontSize: 12, lineHeight: 18, color: COLORS.muted },
  chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white },
  chipActive: { backgroundColor: COLORS.sage, borderColor: COLORS.sage }, chipText: { color: COLORS.muted, fontSize: 13 }, chipTextActive: { color: COLORS.white, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionTitle: { color: COLORS.ink, fontWeight: '800', fontSize: 19 }, sectionAction: { color: COLORS.sageDark, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 28 }, emptyIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.blush }, emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.ink }, emptyDetail: { textAlign: 'center', color: COLORS.muted, lineHeight: 21 },
  sheetRoot: { flex: 1, backgroundColor: COLORS.cream }, sheetHeader: { height: 58, paddingHorizontal: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { color: COLORS.sageDark, fontWeight: '700' }, sheetTitle: { color: COLORS.ink, fontWeight: '800', fontSize: 17 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: COLORS.cream },
});
