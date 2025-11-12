// src/components/ChallengeList.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext'; // ✅ CORRECTION : "../context" au lieu de "../contexts"
import { getChallenges, submitChallenge, getUserVideosForChallenges } from '../services/challengeService';
import { toast } from 'sonner';
import { Button } from './ui/button-enhanced.jsx';

const ChallengeList = () => {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState([]);
  const [userVideos, setUserVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      
      setLoading(true);
      setError(null);
      
      try {
        console.log('🔄 Fetching challenges and videos...');
        
        const [challengesData, videosData] = await Promise.all([
          getChallenges().catch(err => {
            console.warn('Could not fetch challenges:', err.message);
            return [];
          }),
          getUserVideosForChallenges().catch(err => {
            console.warn('Could not fetch user videos:', err.message);
            return [];
          })
        ]);

        setChallenges(challengesData);
        setUserVideos(videosData);
        
        console.log(`✅ Loaded ${challengesData.length} challenges and ${videosData.length} videos`);
        
      } catch (err) {
        console.error('❌ Error loading data:', err);
        setError(err.message);
        toast.error('Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleSubmitChallenge = async (challengeId) => {
    if (!selectedVideo) {
      toast.error('Veuillez sélectionner une vidéo');
      return;
    }

    if (!user) {
      toast.error('Vous devez être connecté pour soumettre un défi');
      return;
    }

    setSubmitting(true);
    
    try {
      console.log('🚀 Submitting challenge:', { challengeId, videoId: selectedVideo });
      
      await submitChallenge(challengeId, selectedVideo);
      toast.success('🎉 Défi soumis avec succès !');
      
      // Recharger les défis pour mettre à jour les soumissions
      const updatedChallenges = await getChallenges();
      setChallenges(updatedChallenges);
      
      // Réinitialiser la sélection
      setSelectedVideo('');
      
    } catch (err) {
      console.error('❌ Error submitting challenge:', err);
      toast.error(`Erreur lors de la soumission: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getDifficultyColor = (difficulty) => {
    const colors = {
      beginner: 'bg-green-100 text-green-800 border-green-300',
      intermediate: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      advanced: 'bg-red-100 text-red-800 border-red-300',
      expert: 'bg-purple-100 text-purple-800 border-purple-300'
    };
    return colors[difficulty] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getStatusBadge = (challenge) => {
    if (challenge.user_submission) {
      return (
        <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full border border-green-300">
          ✅ Déjà soumis
        </span>
      );
    }
    
    if (challenge.end_date && new Date(challenge.end_date) < new Date()) {
      return (
        <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full border border-red-300">
          ⌛ Terminé
        </span>
      );
    }
    
    return (
      <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full border border-blue-300">
        🎯 Actif
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <p className="ml-4 text-gray-300">Chargement des défis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-red-400 mr-3">⚠️</div>
            <div>
              <h4 className="font-semibold text-red-300">Erreur de chargement</h4>
              <p className="text-red-200 text-sm mt-1">{error}</p>
            </div>
          </div>
          <Button
            onClick={() => window.location.reload()}
            className="mt-3 bg-red-600 hover:bg-red-700 text-white"
          >
            🔄 Réessayer
          </Button>
        </div>
      )}

      {/* Sélecteur de vidéo */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">
          🎥 Sélectionner une Vidéo pour Soumission
        </h3>
        
        {userVideos.length > 0 ? (
          <div className="space-y-4">
            <select
              value={selectedVideo}
              onChange={(e) => setSelectedVideo(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- Choisir une vidéo --</option>
              {userVideos.map((video) => (
                <option key={video.id} value={video.id}>
                  {video.title} - {new Date(video.created_at).toLocaleDateString()}
                  {video.duration && ` (${Math.round(video.duration)}s)`}
                </option>
              ))}
            </select>
            
            <p className="text-sm text-gray-400">
              {userVideos.length} vidéo(s) analysée(s) disponible(s) pour les défis
            </p>
          </div>
        ) : (
          <div className="text-center py-6 bg-gray-700/50 rounded-lg border border-gray-600">
            <div className="text-4xl mb-4">🎥</div>
            <p className="text-gray-300 mb-2">Aucune vidéo analysée disponible</p>
            <p className="text-gray-400 text-sm mb-4">
              Analysez d'abord vos vidéos pour pouvoir participer aux défis
            </p>
            <Button
              onClick={() => window.location.href = '/record'}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              🎥 Créer une nouvelle vidéo
            </Button>
          </div>
        )}
      </div>

      {/* Liste des défis */}
      <div className="space-y-4">
        {challenges.length === 0 ? (
          <div className="text-center py-12 bg-gray-800 rounded-xl border border-gray-700">
            <div className="text-6xl mb-4">🏆</div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Aucun défi disponible pour le moment
            </h3>
            <p className="text-gray-400 mb-6">
              Revenez bientôt pour découvrir de nouveaux défis passionnants !
            </p>
            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 inline-block">
              <p className="text-blue-300 text-sm">📅 De nouveaux défis arrivent régulièrement</p>
            </div>
          </div>
        ) : (
          challenges.map((challenge) => (
            <div
              key={challenge.id}
              className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-colors"
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <h3 className="text-xl font-bold text-white">{challenge.title}</h3>
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${getDifficultyColor(challenge.difficulty_level)}`}>
                      {challenge.difficulty_level || 'beginner'}
                    </span>
                    {getStatusBadge(challenge)}
                  </div>
                  
                  <p className="text-gray-300 mb-4 leading-relaxed">
                    {challenge.description}
                  </p>
                  
                  <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                    {challenge.category && (
                      <div className="flex items-center gap-1">
                        <span>📁</span>
                        <span>{challenge.category}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-1">
                      <span>👥</span>
                      <span>{challenge.submissions_count || 0} participant(s)</span>
                    </div>
                    
                    {challenge.created_by && (
                      <div className="flex items-center gap-1">
                        <span>👤</span>
                        <span>Créé par {challenge.created_by.full_name}</span>
                      </div>
                    )}
                    
                    {challenge.end_date && (
                      <div className="flex items-center gap-1">
                        <span>⏰</span>
                        <span>Jusqu'au {new Date(challenge.end_date).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                  
                  {challenge.required_skills && challenge.required_skills.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-400 mb-2">Compétences requises:</p>
                      <div className="flex flex-wrap gap-2">
                        {challenge.required_skills.map((skill, index) => (
                          <span
                            key={index}
                            className="bg-blue-900/30 text-blue-300 text-xs px-3 py-1 rounded-full border border-blue-700"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col gap-3 min-w-[200px]">
                  {challenge.user_submission ? (
                    <div className="text-center p-3 bg-green-900/20 border border-green-700 rounded-lg">
                      <p className="text-green-300 text-sm font-medium">✅ Déjà soumis</p>
                      <p className="text-green-400 text-xs mt-1">
                        Le {new Date(challenge.user_submission.submission_date).toLocaleDateString()}
                      </p>
                      {challenge.user_submission.score && (
                        <p className="text-green-300 text-sm mt-1">
                          Score: {challenge.user_submission.score}/10
                        </p>
                      )}
                    </div>
                  ) : challenge.end_date && new Date(challenge.end_date) < new Date() ? (
                    <div className="text-center p-3 bg-red-900/20 border border-red-700 rounded-lg">
                      <p className="text-red-300 text-sm">⌛ Défi terminé</p>
                    </div>
                  ) : userVideos.length === 0 ? (
                    <Button
                      onClick={() => window.location.href = '/record'}
                      className="bg-blue-600 hover:bg-blue-700 text-white w-full"
                    >
                      🎥 Créer une vidéo
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleSubmitChallenge(challenge.id)}
                      disabled={!selectedVideo || submitting}
                      className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <>📤 Envoi en cours...</>
                      ) : (
                        <>🚀 Soumettre ma vidéo</>
                      )}
                    </Button>
                  )}
                  
                  {challenge.reward_points > 0 && (
                    <div className="text-center p-2 bg-yellow-900/20 border border-yellow-700 rounded-lg">
                      <p className="text-yellow-300 text-sm font-medium">
                        🏅 {challenge.reward_points} points
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Section d'information */}
      <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-xl p-6 border border-purple-700/50">
        <h3 className="text-lg font-semibold text-white mb-3">💡 Comment participer aux défis ?</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="text-center p-4 bg-white/5 rounded-lg">
            <div className="text-2xl mb-2">1</div>
            <p className="text-white font-medium mb-1">Créez votre vidéo</p>
            <p className="text-gray-400">Enregistrez et analysez votre performance</p>
          </div>
          <div className="text-center p-4 bg-white/5 rounded-lg">
            <div className="text-2xl mb-2">2</div>
            <p className="text-white font-medium mb-1">Sélectionnez un défi</p>
            <p className="text-gray-400">Choisissez un défi qui correspond à vos compétences</p>
          </div>
          <div className="text-center p-4 bg-white/5 rounded-lg">
            <div className="text-2xl mb-2">3</div>
            <p className="text-white font-medium mb-1">Soumettez et gagnez</p>
            <p className="text-gray-400">Obtenez des points et montez dans le classement</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChallengeList;
