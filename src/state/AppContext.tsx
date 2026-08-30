import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ensurePrivateDirectories } from '../data/files';
import { getDatabase } from '../data/database';
import { getSetting, getSnapshot, setSetting } from '../data/repository';
import { AppSnapshot, Pet } from '../types';
import { prepareNotifications } from '../services/notifications';

type AppContextValue = {
  loading: boolean;
  error: string | null;
  snapshot: AppSnapshot;
  selectedPetId: string | null;
  selectedPet: Pet | null;
  setSelectedPetId: (id: string) => void;
  refresh: () => Promise<void>;
};

const emptySnapshot: AppSnapshot = {
  pets: [], photos: [], careSchedules: [], careRecords: [], healthRecords: [], timeline: [], attachments: [],
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [selectedPetId, setSelectedPetState] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const next = await getSnapshot();
      setSnapshot(next);
      const stored = selectedPetId ?? await getSetting('selected_pet_id');
      const valid = next.pets.find((pet) => pet.id === stored)?.id ?? next.pets[0]?.id ?? null;
      setSelectedPetState(valid);
      if (valid) await setSetting('selected_pet_id', valid);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载本地数据失败');
    } finally {
      setLoading(false);
    }
  }, [selectedPetId]);

  useEffect(() => {
    (async () => {
      await getDatabase();
      await ensurePrivateDirectories();
      await prepareNotifications();
      await refresh();
    })().catch((cause) => {
      setError(cause instanceof Error ? cause.message : '初始化失败');
      setLoading(false);
    });
  }, []);

  const setSelectedPetId = useCallback((nextId: string) => {
    setSelectedPetState(nextId);
    setSetting('selected_pet_id', nextId).catch(() => undefined);
  }, []);

  const selectedPet = useMemo(() => snapshot.pets.find((pet) => pet.id === selectedPetId) ?? null, [snapshot.pets, selectedPetId]);
  const value = useMemo(() => ({ loading, error, snapshot, selectedPetId, selectedPet, setSelectedPetId, refresh }),
    [loading, error, snapshot, selectedPetId, selectedPet, setSelectedPetId, refresh]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp 必须在 AppProvider 中使用');
  return context;
}
