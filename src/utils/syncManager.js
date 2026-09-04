import { supabase } from '@/lib/supabaseClient';

// Keys we want to sync explicitly
const SYNC_KEYS = [
  'dailykhata_permanently_deleted_ids',
  'dailykhata_recycle_bin_records',
  'dailykhata_previous_net_balances'
];

export function getLocalSettingsData() {
  const data = {};
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('dailykhata_')) {
      const val = localStorage.getItem(key);
      if (val) {
        try {
          data[key] = JSON.parse(val);
        } catch {
          data[key] = val;
        }
      }
    }
  }

  return data;
}

export async function syncLocalToSupabase(user) {
  if (!user || !user.id) return;
  const data = getLocalSettingsData();
  try {
    const { error } = await supabase
      .from('user_settings')
      .upsert({ 
        user_id: user.id, 
        settings_data: data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    if (error) console.warn('Failed to sync settings:', error.message);
  } catch (err) {
    console.warn('Sync error:', err);
  }
}

export async function syncSupabaseToLocal(user) {
  if (!user || !user.id) return;
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('settings_data')
      .eq('user_id', user.id)
      .single();
    if (error || !data || !data.settings_data) return;

    const settings = data.settings_data;
    for (const key of Object.keys(settings)) {
      if (typeof settings[key] === 'object') {
        localStorage.setItem(key, JSON.stringify(settings[key]));
      } else {
        localStorage.setItem(key, settings[key]);
      }
    }
    window.dispatchEvent(new CustomEvent('dailykhata_data_changed'));
  } catch (err) {
    console.warn('Sync fetch error:', err);
  }
}

export async function deleteUserAccount() {
  try {
    const { error } = await supabase.rpc('delete_user_account');
    if (error) throw error;
    localStorage.clear();
    return true;
  } catch (err) {
    console.error('Failed to delete account:', err);
    throw err;
  }
}
