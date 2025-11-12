import { supabase } from "../lib/supabase";

export async function getAstroProfile(userId) {
  try {
    console.log('🔍 Fetching astro profile for user:', userId);
    
    // Requête SIMPLIFIÉE sans jointure complexe
    const { data, error } = await supabase
      .from('astro_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('ℹ️ No astro profile found');
        return null;
      }
      throw error;
    }

    // Récupérer les données utilisateur séparément si nécessaire
    if (data) {
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, birth_date, birth_time, birth_place')
        .eq('id', userId)
        .maybeSingle();
      
      if (!userError && userData) {
        data.user = userData;
      }
    }

    return data;
  } catch (error) {
    console.error('❌ Error fetching astro profile:', error);
    throw new Error(`Failed to fetch astro profile: ${error.message}`);
  }
}

export async function updateBirthData(userId, birthData) {
  try {
    console.log('📝 Updating birth data for user:', userId);
    
    if (!birthData.date || !birthData.time || !birthData.place) {
      throw new Error('Missing required birth data');
    }

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
    
    // Requête SIMPLIFIÉE sans jointure complexe
    const { data, error } = await supabase
      .from('advanced_matches')
      .select('*')
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .order('overall_score', { ascending: false });

    if (error) {
      if (error.code === 'PGRST116') {
        return [];
      }
      throw error;
    }

    // Récupérer les informations utilisateur séparément
    if (data && data.length > 0) {
      const userIds = [...new Set(data.flatMap(match => [match.user_a_id, match.user_b_id]))];
      
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);

      if (!usersError && usersData) {
        const usersMap = usersData.reduce((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {});

        data.forEach(match => {
          match.user_a = usersMap[match.user_a_id];
          match.user_b = usersMap[match.user_b_id];
        });
      }
    }

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

export async function generateSymbolicProfile(userId) {
  try {
    const { data, error } = await supabase.functions.invoke('generate-symbolic-profile', {
      body: { user_id: userId }
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('❌ Error generating symbolic profile:', error);
    throw new Error(`Failed to generate symbolic profile: ${error.message}`);
  }
}
