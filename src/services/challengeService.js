import { supabase } from "../lib/supabase";

export async function getChallenges() {
  try {
    console.log('🔍 Fetching challenges...');
    
    // Requête SIMPLIFIÉE sans jointures complexes
    const { data: challenges, error } = await supabase
      .from('spotbulle_challenges')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST116') {
        return [];
      }
      throw error;
    }

    // Récupérer les données supplémentaires séparément
    if (challenges && challenges.length > 0) {
      const enhancedChallenges = await Promise.all(
        challenges.map(async (challenge) => {
          // Récupérer le créateur
          const { data: creatorData } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', challenge.created_by)
            .maybeSingle();

          // Compter les soumissions
          const { count: submissionsCount } = await supabase
            .from('challenge_submissions')
            .select('*', { count: 'exact', head: true })
            .eq('challenge_id', challenge.id);

          // Récupérer la soumission de l'utilisateur actuel
          const { data: { user } } = await supabase.auth.getUser();
          let userSubmission = null;
          
          if (user) {
            const { data: submissionData } = await supabase
              .from('challenge_submissions')
              .select('*')
              .eq('challenge_id', challenge.id)
              .eq('user_id', user.id)
              .maybeSingle();
            
            userSubmission = submissionData;
          }

          return {
            ...challenge,
            created_by_profile: creatorData,
            submissions_count: submissionsCount || 0,
            user_submission: userSubmission
          };
        })
      );

      return enhancedChallenges;
    }

    return challenges || [];
  } catch (error) {
    console.error('❌ Error fetching challenges:', error);
    throw new Error(`Failed to fetch challenges: ${error.message}`);
  }
}

export async function submitChallenge(challengeId, videoId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("User not authenticated.");
    }

    console.log('📝 Submitting challenge:', { challengeId, videoId, userId: user.id });

    const { data, error } = await supabase
      .from('challenge_submissions')
      .upsert(
        {
          challenge_id: challengeId,
          user_id: user.id,
          video_id: videoId,
          submission_date: new Date().toISOString(),
          status: 'submitted'
        },
        { onConflict: 'challenge_id,user_id' }
      )
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Challenge submission successful');
    return data;
  } catch (error) {
    console.error('❌ Error submitting challenge:', error);
    throw new Error(`Failed to submit challenge: ${error.message}`);
  }
}

export async function getUserSubmission(challengeId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("User not authenticated.");
    }

    const { data, error } = await supabase
      .from('challenge_submissions')
      .select('*, videos(title, thumbnail_url)')
      .eq('challenge_id', challengeId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('❌ Error fetching user submission:', error);
    throw new Error(`Failed to fetch user submission: ${error.message}`);
  }
}

export async function getUserVideosForChallenges() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("User not authenticated.");
    }

    const { data, error } = await supabase
      .from('videos')
      .select('id, title, created_at, thumbnail_url, duration')
      .eq('user_id', user.id)
      .eq('status', 'analyzed')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('❌ Error fetching user videos:', error);
    throw new Error(`Failed to fetch user videos: ${error.message}`);
  }
}
