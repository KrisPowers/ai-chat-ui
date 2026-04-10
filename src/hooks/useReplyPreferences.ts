import { useCallback, useEffect, useState } from 'react';
import {
  loadReplyPreferences,
  REPLY_PREFERENCES_STORAGE_KEY,
  REPLY_PREFERENCES_UPDATED_EVENT,
  removeReplyPreference,
  upsertReplyPreference,
} from '../lib/replyPreferences';
import type { ReplyPreferenceRecord } from '../types';

export function useReplyPreferences() {
  const [replyPreferences, setReplyPreferences] = useState<ReplyPreferenceRecord[]>([]);

  const refresh = useCallback(async () => {
    setReplyPreferences(await loadReplyPreferences());
  }, []);

  useEffect(() => {
    void refresh();

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === REPLY_PREFERENCES_STORAGE_KEY) {
        void refresh();
      }
    };
    const handleUpdate = () => {
      void refresh();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(REPLY_PREFERENCES_UPDATED_EVENT, handleUpdate);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(REPLY_PREFERENCES_UPDATED_EVENT, handleUpdate);
    };
  }, [refresh]);

  const savePreference = useCallback(async (entry: Omit<ReplyPreferenceRecord, 'createdAt' | 'updatedAt'>) => {
    const next = await upsertReplyPreference(entry);
    setReplyPreferences(next);
  }, []);

  const deletePreference = useCallback(async (id: string) => {
    const next = await removeReplyPreference(id);
    setReplyPreferences(next);
  }, []);

  return {
    replyPreferences,
    saveReplyPreference: savePreference,
    removeReplyPreference: deletePreference,
    refreshReplyPreferences: refresh,
  };
}
