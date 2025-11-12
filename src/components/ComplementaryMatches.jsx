import React, { useState, useEffect } from 'react';
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';
import { Button } from './ui/button-enhanced.jsx';
import { toast } from 'sonner';

const ComplementaryMatches = ({ user, profile }) => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [error, setError] = useState(null);
  const supabase = useSupabaseClient();
  const currentUser = useUser();

  const findComplementaryMatches = async () => {
    if (!currentUser) {
      toast.error('Vous devez être connecté');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('🔍 Recherche de matches complémentaires...');
      
      // ✅ GESTION D'ERREUR AMÉLIORÉE
      const { data, error: invokeError } = await supabase.functions.invoke('find-complementary-matches', {
        body: { 
          user_id: currentUser.id, 
          limit: 6,
          min_compatibility: 0.6
        }
      }).catch(error => {
        console.error('❌ Erreur invocation fonction:', error);
        throw new Error(`Erreur réseau: ${error.message}`);
      });

      if (invokeError) {
        console.error('❌ Erreur fonction Edge:', invokeError);
        throw new Error(invokeError.message || 'Erreur serveur');
      }

      if (!data) {
        throw new Error('Aucune réponse du serveur');
      }

      console.log('✅ Réponse matches:', data);
      
      // ✅ VALIDATION DES DONNÉES
      const validMatches = Array.isArray(data.matches) ? data.matches : [];
      setMatches(validMatches);
      
      if (validMatches.length === 0) {
        toast.info('Aucun match complémentaire trouvé pour le moment');
      } else {
        toast.success(`${validMatches.length} profils complémentaires trouvés !`);
      }
      
    } catch (error) {
      console.error('❌ Erreur recherche matches:', error);
      const errorMessage = error.message || 'Erreur lors de la recherche de matches';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const sendConnectionRequest = async (targetUserId, matchData) => {
    if (!currentUser) {
      toast.error('Vous devez être connecté');
      return;
    }

    try {
      console.log('🤝 Envoi demande connexion à:', targetUserId);
      
      const { data, error: connectError } = await supabase.functions.invoke('match-profiles', {
        body: {
          requester_id: currentUser.id,
          target_id: targetUserId,
          analysis_data: matchData || {}
        }
      });

      if (connectError) {
        throw new Error(connectError.message || 'Erreur lors de l\'envoi');
      }

      toast.success('Demande de connexion envoyée !');
      
      // Mettre à jour l'état local
      setMatches(prev => prev.filter(match => match.profile?.id !== targetUserId));
      
    } catch (error) {
      console.error('❌ Erreur envoi connexion:', error);
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const getColorBadge = (color) => {
    const colors = {
      red: { bg: 'bg-red-100', text: 'text-red-800', label: '🦁 Leader' },
      blue: { bg: 'bg-blue-100', text: 'text-blue-800', label: '🧠 Stratège' },
      green: { bg: 'bg-green-100', text: 'text-green-800', label: '🤝 Équipier' },
      yellow: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: '💡 Créatif' }
    };
    
    const colorConfig = colors[color] || colors.blue;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorConfig.bg} ${colorConfig.text}`}>
        {colorConfig.label}
      </span>
    );
  };

  const getScoreColor = (score) => {
    if (score >= 8.5) return 'text-green-600 font-bold';
    if (score >= 7.0) return 'text-yellow-600 font-semibold';
    return 'text-gray-600';
  };

  // ✅ CHARGEMENT INITIAL AMÉLIORÉ
  useEffect(() => {
    if (currentUser) {
      loadExistingMatches();
    }
  }, [currentUser]);

  const loadExistingMatches = async () => {
    if (!currentUser) return;
    
    try {
      console.log('📥 Chargement matches existants...');
      
      const { data, error: queryError } = await supabase
        .from('complementary_matches')
        .select(`
          *,
          matched_user:profiles!complementary_matches_matched_user_id_fkey(
            id,
            full_name,
            avatar_url,
            bio,
            passions,
            age_group,
            dominant_color
          )
        `)
        .eq('user_id', currentUser.id)
        .order('compatibility_score', { ascending: false })
        .limit(6);

      if (queryError) {
        console.warn('⚠️ Erreur chargement matches:', queryError);
        return;
      }

      if (data && data.length > 0) {
        const formattedMatches = data.map(item => ({
          profile: item.matched_user,
          compatibility_score: item.compatibility_score || 0,
          reasons: item.reasons || ['Synergie détectée'],
          suggested_connection: item.suggested_connection_type || 'collaboration',
          match_analysis: item.analysis_data || {}
        }));
        
        console.log('✅ Matches existants chargés:', formattedMatches.length);
        setMatches(formattedMatches);
      }
    } catch (error) {
      console.error('❌ Erreur chargement matches existants:', error);
    }
  };

  // ✅ COMPOSANT DE MATCH INDIVIDUEL
  const MatchCard = ({ match, index }) => {
    const profile = match.profile || {};
    
    return (
      <div key={profile.id || index} className="bg-gray-800 border border-gray-700 rounded-xl p-6 hover:border-purple-500 transition-all duration-300">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
              {profile.full_name?.charAt(0) || 'U'}
            </div>
            <div>
              <h3 className="font-semibold text-white text-lg">
                {profile.full_name || 'Utilisateur'}
              </h3>
              <div className="flex items-center space-x-2 mt-1">
                {profile.dominant_color && getColorBadge(profile.dominant_color)}
                <span className={`text-sm ${getScoreColor(match.compatibility_score)}`}>
                  {match.compatibility_score}/10
                </span>
              </div>
            </div>
          </div>
          
          <div className="text-right">
            <span className="inline-block px-2 py-1 bg-blue-900 text-blue-200 text-xs rounded-full capitalize">
              {match.suggested_connection}
            </span>
          </div>
        </div>

        {/* Passions */}
        {profile.passions && profile.passions.length > 0 && (
          <div className="mb-4">
            <p className="text-gray-400 text-sm mb-2">Passions communes:</p>
            <div className="flex flex-wrap gap-2">
              {profile.passions.slice(0, 3).map((passion, idx) => (
                <span key={idx} className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded-full">
                  {passion}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Raisons de la complémentarité */}
        <div className="mb-4">
          <p className="text-gray-400 text-sm mb-2">Synergies:</p>
          <ul className="text-gray-300 text-sm space-y-1">
            {(match.reasons || []).slice(0, 2).map((reason, idx) => (
              <li key={idx} className="flex items-start">
                <span className="text-green-400 mr-2 mt-1">✓</span>
                {reason}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex space-x-3">
          <Button
            onClick={() => sendConnectionRequest(profile.id, match.match_analysis)}
            className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white"
          >
            🤝 Se connecter
          </Button>
          
          <Button
            onClick={() => setSelectedMatch(match)}
            variant="outline"
            className="border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            📊 Détails
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* En-tête avec bouton de recherche */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-french font-bold text-white">
            🤝 Profils Complémentaires
          </h2>
          <p className="text-gray-300 mt-1">
            Découvrez des personnes avec qui vous pourriez créer des synergies
          </p>
        </div>
        
        <Button
          onClick={findComplementaryMatches}
          loading={loading}
          disabled={loading}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white whitespace-nowrap"
        >
          {loading ? '🔍 Recherche...' : '🔄 Trouver des matches'}
        </Button>
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-red-400 mr-3">⚠️</div>
            <div>
              <h4 className="font-semibold text-red-300">Erreur</h4>
              <p className="text-red-200 text-sm mt-1">{error}</p>
            </div>
          </div>
          <Button
            onClick={() => setError(null)}
            className="mt-3 bg-red-600 hover:bg-red-700 text-white text-sm"
          >
            ✕ Fermer
          </Button>
        </div>
      )}

      {/* Liste des matches */}
      {matches.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {matches.map((match, index) => (
            <MatchCard key={match.profile?.id || index} match={match} index={index} />
          ))}
        </div>
      ) : (
        /* État vide */
        <div className="text-center py-12 bg-gray-800 rounded-xl border border-gray-700">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold text-white mb-2">
            {loading ? 'Recherche en cours...' : 'Aucun match trouvé'}
          </h3>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            {loading 
              ? 'Notre IA analyse les profils pour trouver vos meilleures synergies...'
              : 'Cliquez sur "Trouver des matches" pour découvrir des profils complémentaires'
            }
          </p>
          
          {!loading && (
            <Button
              onClick={findComplementaryMatches}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            >
              🚀 Découvrir des synergies
            </Button>
          )}
        </div>
      )}

      {/* Modal de détails */}
      {selectedMatch && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">Détails de la synergie</h3>
                <Button
                  onClick={() => setSelectedMatch(null)}
                  variant="outline"
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  ✕ Fermer
                </Button>
              </div>
              
              <div className="space-y-6">
                {/* Contenu du modal... */}
                <div className="text-center">
                  <p className="text-gray-300">
                    Fonctionnalité de détail en cours de développement...
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplementaryMatches;
