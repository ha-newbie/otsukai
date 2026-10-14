import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import type { AppData } from '../domain/models';
import { db } from '../persistence/database';

export function useAppData(): { data: AppData | null; error: string } {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const subscription = liveQuery(() => db.snapshot()).subscribe({ next: value => { setData(value); setError(''); }, error: () => setError('端末にデータを保存できません。ブラウザの空き容量やプライベートブラウズの設定を確認してください。') });
    return () => subscription.unsubscribe();
  }, []);
  return { data, error };
}
export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}
