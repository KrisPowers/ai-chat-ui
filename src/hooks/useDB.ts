import { useState, useEffect, useCallback } from 'react';
import { loadChats, saveChat, removeChat, clearChats } from '../lib/persistence';
import type { ChatRecord } from '../types';

export function useDB() {
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const nextChats = await loadChats();
      if (cancelled) return;
      setChats(nextChats);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const all = await loadChats();
    setChats(all);
  }, []);

  const save = useCallback(async (chat: ChatRecord) => {
    await saveChat(chat);
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await removeChat(id);
    await refresh();
  }, [refresh]);

  const clearAll = useCallback(async () => {
    await clearChats();
    await refresh();
  }, [refresh]);

  return { chats, ready, save, remove, clearAll, refresh };
}
