import { supabase } from "../lib/supabase";

export async function getAstroProfile(userId) {
  try {
    console.log('🔍 Fetching astro profile for user:', userId);
    
    const { data, error } = await supabase
      .from('astro_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(); // Utiliser maybeSingle au lieu de single pour éviter les erreurs 406

    if (error) {
      if (error.code === 'PGRST116') {
        // Aucune ligne trouvée - c'est normal pour un nouveau utilisateur
        console.log('ℹ️ No astro profile found for user:', userId);
        return null;
      }
      throw error;
    }

    console.log('✅ Astro profile found:', data ? 'yes' : 'no');
    return data;
  } catch (error) {
    console.error('❌ Error fetching astro profile:', error);
    throw new Error(`Failed to fetch astro profile: ${error.message}`);
  }
}

export async function updateBirthData(userId, birthData) {
  try {
    console.log('📝 Updating birth data for user:', userId);
    
    // Vérifier que toutes les données requises sont présentes
    if (!birthData.date || !birthData.time || !birthData.place) {
      throw new Error('Missing required birth data: date, time, and place are required');
    }

    // Mettre à jour le profil
    const { data, error } = await supabase
      .from('profiles')
      .update({
        birth_date: birthData.date,
        birth_time: birthData.time,
        birth_place: birthData.place,
        birth_data_updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    // Déclencher le calcul astrologique
    console.log('🚀 Triggering astro calculation...');
    try {
      const { data: triggerData, error: triggerError } = await supabase.functions.invoke('calculate-astro-profile', {
        body: { user_id: userId }
      });

      if (triggerError) {
        console.warn('⚠️ Astro calculation trigger warning:', triggerError);
      } else {
        console.log('✅ Astro calculation triggered successfully');
      }
    } catch (triggerErr) {
      console.warn('⚠️ Astro calculation trigger failed:', triggerErr.message);
      // Ne pas bloquer le processus principal si le déclenchement échoue
    }

    return data;
  } catch (error) {
    console.error('❌ Error updating birth data:', error);
    throw new Error(`Failed to update birth data: ${error.message}`);
  }
}

export async function getAdvancedMatches() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    console.log('🔍 Fetching advanced matches for user:', user.id);
    
    const { data, error } = await supabase
      .from('advanced_matches')
      .select(`
        *,
        user_a:profiles!advanced_matches_user_a_id_fkey(id, full_name, avatar_url),
        user_b:profiles!advanced_matches_user_b_id_fkey(id, full_name, avatar_url)
      `)
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .order('overall_score', { ascending: false });

    if (error) {
      if (error.code === 'PGRST116') {
        // Aucun match trouvé
        return [];
      }
      throw error;
    }

    console.log(`✅ Found ${data?.length || 0} advanced matches`);
    return data || [];
  } catch (error) {
    console.error('❌ Error fetching advanced matches:', error);
    throw new Error(`Failed to fetch advanced matches: ${error.message}`);
  }
}

export async function triggerAdvancedMatching() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    console.log('🚀 Triggering advanced matching for user:', user.id);
    
    const { data, error } = await supabase.functions.invoke('find-advanced-matches', {
      body: { user_id: user.id }
    });

    if (error) throw error;

    console.log('✅ Advanced matching triggered successfully');
    return data;
  } catch (error) {
    console.error('❌ Error triggering advanced matching:', error);
    throw new Error(`Failed to trigger advanced matching: ${error.message}`);
  }
}
