// src/services/spotCoachService.js
// Service client optimisé avec cache et performances

import { supabase } from '../lib/supabase';

const FUNCTION_NAME = 'spotcoach-profile';
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache client simple
const clientCache = new Map();

function formatServiceError(error, fallbackMessage = 'Une erreur est survenue lors de la génération du profil symbolique.') {
  if (!error) {
    return new Error(fallbackMessage);
  }

  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  const message = error?.message || error?.error || fallbackMessage;
  return new Error(message);
}

function generateCacheKey(payload) {
  return JSON.stringify({
    birth: payload.birth,
    passions: payload.passions?.length || 0,
    talentQuiz: payload.talentQuiz?.length || 0,
    intentions: payload.intentions?.length || 0,
  });
}

export const spotCoachService = {
  /**
   * Calls the SpotCoach Edge Function to generate and persist a symbolic profile.
   * Now with client-side caching for better performance.
   */
  async generateSymbolicProfile(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload invalide pour la génération du profil symbolique.');
    }

    const cacheKey = generateCacheKey(payload);
    
    // Check cache first
    if (clientCache.has(cacheKey)) {
      console.log('[SpotCoachService] Returning cached result');
      return clientCache.get(cacheKey);
    }

    try {
      const startedAt = Date.now();
      const payloadSize = (() => {
        try { return JSON.stringify(payload).length; } catch { return undefined; }
      })();
      
      const counts = {
        passions: Array.isArray(payload.passions) ? payload.passions.length : 0,
        talentQuiz: Array.isArray(payload.talentQuiz) ? payload.talentQuiz.length : 0,
        intentions: Array.isArray(payload.intentions) ? payload.intentions.length : 0,
      };
      
      console.log('[SpotCoachService] invoke spotcoach-profile start', {
        birth: {
          date: payload?.birth?.date,
          time: payload?.birth?.time,
          latitude: payload?.birth?.latitude,
          longitude: payload?.birth?.longitude,
          timezone: payload?.birth?.timezone,
        },
        counts,
        payloadSize,
      });

      const invokePromise = supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          ...payload,
          _cache: true, // Indicate cache preference to edge function
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout après 30s - Service SpotCoach occupé')), 30000)
      );

      const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

      if (error) {
        const elapsed = Date.now() - startedAt;
        console.error('[SpotCoachService] invoke error', { ms: elapsed, error });
        throw formatServiceError(error);
      }

      if (!data?.success) {
        console.error('[SpotCoachService] invoke non-success', { ms: Date.now() - startedAt, data });
        throw formatServiceError(data?.error || 'La génération du profil symbolique a échoué.');
      }

      console.log('[SpotCoachService] invoke success', { 
        ms: Date.now() - startedAt, 
        mode: data?.mode,
        cached: data?.mode === 'cached'
      });

      // Cache the successful result
      clientCache.set(cacheKey, data);
      setTimeout(() => clientCache.delete(cacheKey), CLIENT_CACHE_TTL);

      return data;
    } catch (err) {
      console.error('[SpotCoach] generateSymbolicProfile error:', err);
      throw formatServiceError(err);
    }
  },

  async getExistingProfile() {
    const startedAt = Date.now();
    console.log('[SpotCoachService] getExistingProfile start');
    
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error('[SpotCoachService] getExistingProfile auth error:', authError);
      }
      
      if (!user) {
        console.log('[SpotCoachService] getExistingProfile: no user session');
        return null;
      }

      const timeoutMs = 10000;
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Timeout retrieving symbolic profile')), timeoutMs);
      });

      let data;
      let error;

      try {
        ({ data, error } = await Promise.race([
          supabase
            .from('profiles_symboliques')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          timeoutPromise,
        ]));
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data || null;
    } catch (err) {
      console.error('[SpotCoachService] getExistingProfile error:', err);
      return null;
    } finally {
      console.log('[SpotCoachService] getExistingProfile end', { ms: Date.now() - startedAt });
    }
  },

  // Nouvelle méthode pour vider le cache
  clearCache() {
    clientCache.clear();
    console.log('[SpotCoachService] Cache cleared');
  },

  // Méthode pour obtenir les statistiques du cache
  getCacheStats() {
    return {
      size: clientCache.size,
      keys: Array.from(clientCache.keys())
    };
  }
};

export default spotCoachService;
