import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import VideoPlayer from '../components/VideoPlayer';
import VideoAnalysisResults from '../components/VideoAnalysisResults';
import TranscriptionViewer from '../components/TranscriptionViewer';
import VideoProcessingStatus from '../components/VideoProcessingStatus';
import { Button } from '../components/ui/button-enhanced.jsx';

const VideoManagement = () => {
  const { user } = useAuth();
  const [videos, setVideos] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [processingVideoId, setProcessingVideoId] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState({});
  const channelRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchStats = useCallback(async () => {
    if (!user || !mountedRef.current) return;

    try {
      // Utiliser directement Supabase au lieu de l'Edge Function
      const { data: videoData, error: videoError } = await supabase
        .from('videos')
        .select('id, created_at, duration, status')
        .eq('user_id', user.id);

      if (videoError) throw videoError;

      const totalVideos = videoData?.length || 0;
      const totalDuration = videoData?.reduce((sum, video) => sum + (video.duration || 0), 0) || 0;
      const transcribedVideos = videoData?.filter(v => 
        v.status === 'transcribed' || v.status === 'analyzed'
      ).length || 0;
      const lastUpload = videoData?.length > 0 
        ? new Date(Math.max(...videoData.map(v => new Date(v.created_at)))) 
        : null;

      const computedStats = {
        total_videos: totalVideos,
        total_duration: totalDuration,
        transcribed_videos: transcribedVideos,
        last_upload: lastUpload,
        total_views: 0, // À implémenter si nécessaire
        total_likes: 0  // À implémenter si nécessaire
      };

      if (mountedRef.current) {
        setStats(computedStats);
      }
    } catch (err) {
      console.error('Erreur calcul stats:', err);
      if (mountedRef.current) {
        setError('Impossible de calculer les statistiques.');
      }
    }
  }, [user]);

  const refreshStats = async () => {
    await fetchStats();
    toast.success('Statistiques mises à jour');
  };

  const getStatusLabel = (status) => {
    const statusMap = {
      uploaded: 'Téléchargée',
      processing: 'En traitement',
      transcribed: 'Transcrite',
      analyzing: 'En analyse',
      analyzed: 'Analysée',
      published: 'Publiée',
      failed: 'Échec',
      draft: 'Brouillon',
      ready: 'Prête',
      pending: 'En attente',
      transcribing: 'Transcription en cours',
    };
    return statusMap[status] || status || 'Inconnu';
  };

  const fetchVideos = useCallback(async () => {
    if (!user || !mountedRef.current) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: supabaseError } = await supabase
        .from('videos')
        .select(`
          id,
          title,
          description,
          status,
          created_at,
          updated_at,
          transcription_text,
          transcription_data,
          analysis,
          ai_result,
          error_message,
          transcription_error,
          user_id,
          storage_path,
          file_path,
          public_url,
          duration,
          performance_score,
          language
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (supabaseError) {
        throw new Error(`Erreur Supabase: ${supabaseError.message}`);
      }

      const normalizedVideos = (data || []).map((video) => {
        // Gestion robuste de la transcription
        let transcriptionText = video.transcription_text;
        if (!transcriptionText && video.transcription_data) {
          if (typeof video.transcription_data === 'object') {
            transcriptionText = video.transcription_data.text || video.transcription_data.full_text || '';
          } else if (typeof video.transcription_data === 'string') {
            try {
              const parsedData = JSON.parse(video.transcription_data);
              transcriptionText = parsedData.text || parsedData.full_text || '';
            } catch (e) {
              transcriptionText = video.transcription_data;
            }
          }
        }

        // Gestion robuste de l'analyse
        let analysisData = video.analysis || {};
        if (!analysisData || Object.keys(analysisData).length === 0) {
          if (video.ai_result) {
            try {
              analysisData = typeof video.ai_result === 'string' 
                ? JSON.parse(video.ai_result) 
                : video.ai_result;
            } catch (e) {
              console.warn('Erreur parsing ai_result:', e);
              analysisData = { summary: video.ai_result };
            }
          }
        }

        const hasTranscription = !!transcriptionText;
        const hasAnalysis = !!(analysisData && Object.keys(analysisData).length > 0);
        
        let normalizedStatus = video.status || 'pending';
        let statusLabel = getStatusLabel(normalizedStatus);

        // Ajustement automatique du statut basé sur les données disponibles
        if (hasTranscription && !hasAnalysis && normalizedStatus !== 'analyzing') {
          normalizedStatus = 'transcribed';
          statusLabel = 'Transcrite';
        }

        if (hasAnalysis) {
          normalizedStatus = 'analyzed';
          statusLabel = 'Analysée';
        }

        return {
          ...video,
          normalizedStatus,
          statusLabel,
          hasTranscription,
          hasAnalysis,
          analysis_result: analysisData,
          transcription_text: transcriptionText,
          error_message: video.error_message || video.transcription_error || null,
        };
      });

      if (mountedRef.current) {
        setVideos(normalizedVideos);
        // Mettre à jour la vidéo sélectionnée si elle existe toujours
        setSelectedVideo((prevSelected) => {
          if (!prevSelected) return null;
          const updatedSelected = normalizedVideos.find((v) => v.id === prevSelected.id);
          return updatedSelected || normalizedVideos[0] || null;
        });
      }
    } catch (error) {
      console.error('Erreur chargement vidéos:', error);
      if (mountedRef.current) {
        setError(`Erreur de chargement: ${error.message}`);
        setVideos([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [user]);

  const getPublicUrl = (video) => {
    if (!video) return null;

    // Priorité à l'URL publique
    if (video.public_url) return video.public_url;

    // Fallback: construction depuis le storage path
    const path = video.storage_path || video.file_path;
    if (!path) return null;

    try {
      const { data } = supabase.storage.from('videos').getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      console.error('Erreur génération URL:', e);
      return null;
    }
  };

  const triggerManualAnalysis = async (video) => {
    if (!video) return;

    try {
      setProcessingVideoId(video.id);
      setAnalysisProgress(prev => ({
        ...prev,
        [video.id]: { step: 'Démarrage de l\'analyse...', progress: 10 }
      }));

      const toastId = toast.loading('Déclenchement de l\'analyse IA...');

      const { data: session, error: authError } = await supabase.auth.getSession();
      if (authError || !session?.session?.access_token) {
        throw new Error('Session non valide, veuillez vous reconnecter');
      }

      // Étape 1: Transcription
      setAnalysisProgress(prev => ({
        ...prev,
        [video.id]: { step: 'Transcription en cours...', progress: 30 }
      }));

      const transcribeResponse = await fetch(
        'https://nyxtckjfaajhacboxojd.supabase.co/functions/v1/transcribe-video',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({ 
            video_id: video.id,
            language: video.language || 'auto'
          }),
        }
      );

      if (!transcribeResponse.ok) {
        const errorText = await transcribeResponse.text();
        throw new Error(`Transcription échouée: ${transcribeResponse.status} - ${errorText}`);
      }

      const transcribeResult = await transcribeResponse.json();
      if (transcribeResult.error) {
        throw new Error(transcribeResult.error);
      }

      setAnalysisProgress(prev => ({
        ...prev,
        [video.id]: { step: 'Transcription terminée, analyse en cours...', progress: 60 }
      }));

      toast.success('Transcription terminée, analyse IA en cours...', { id: toastId });

      // Attendre que la transcription soit disponible
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Étape 2: Analyse
      setAnalysisProgress(prev => ({
        ...prev,
        [video.id]: { step: 'Analyse IA en cours...', progress: 80 }
      }));

      const analyzeResponse = await fetch(
        'https://nyxtckjfaajhacboxojd.supabase.co/functions/v1/analyze-transcription',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({ 
            video_id: video.id,
            enhance_analysis: true
          }),
        }
      );

      if (!analyzeResponse.ok) {
        const errorText = await analyzeResponse.text();
        throw new Error(`Analyse échouée: ${analyzeResponse.status} - ${errorText}`);
      }

      const analyzeResult = await analyzeResponse.json();
      if (analyzeResult.error) {
        throw new Error(analyzeResult.error);
      }

      setAnalysisProgress(prev => ({
        ...prev,
        [video.id]: { step: 'Analyse terminée !', progress: 100 }
      }));

      toast.success('Analyse IA terminée avec succès !', { id: toastId });

      // Mettre à jour l'interface
      setTimeout(() => {
        if (mountedRef.current) {
          fetchVideos();
          fetchStats();
        }
      }, 2000);

    } catch (err) {
      console.error('Erreur analyse manuelle:', err);
      let errorMessage = err.message;

      if (errorMessage.includes('Failed to fetch')) {
        errorMessage = 'Erreur de connexion au serveur. Vérifiez votre connexion internet.';
      }

      toast.error(`Erreur: ${errorMessage}`);
      
      // Mettre à jour le statut en échec
      setVideos((prev) =>
        prev.map((v) =>
          v.id === video.id ? { 
            ...v, 
            status: 'failed', 
            error_message: errorMessage 
          } : v
        )
      );
    } finally {
      setProcessingVideoId(null);
      setTimeout(() => {
        setAnalysisProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[video.id];
          return newProgress;
        });
      }, 3000);
    }
  };

  const transcribeVideo = async (video) => {
    if (!video) return;

    try {
      setProcessingVideoId(video.id);
      const toastId = toast.loading('Démarrage de la transcription...');

      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Session non valide');
      }

      const response = await fetch(
        'https://nyxtckjfaajhacboxojd.supabase.co/functions/v1/transcribe-video',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({ 
            video_id: video.id,
            language: video.language || 'auto'
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Transcription échouée: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }

      toast.success('Transcription démarrée avec succès', { id: toastId });

      setVideos((prev) =>
        prev.map((v) => v.id === video.id ? { ...v, status: 'transcribing' } : v)
      );

      setTimeout(() => {
        if (mountedRef.current) {
          fetchVideos();
          fetchStats();
        }
      }, 3000);
    } catch (err) {
      console.error('Erreur transcription:', err);
      toast.error(`Erreur: ${err.message}`);

      setVideos((prev) =>
        prev.map((v) =>
          v.id === video.id ? { 
            ...v, 
            status: 'failed', 
            error_message: err.message 
          } : v
        )
      );
    } finally {
      setProcessingVideoId(null);
    }
  };

  const analyzeVideo = async (video) => {
    if (!video) return;

    try {
      setProcessingVideoId(video.id);
      const toastId = toast.loading('Démarrage de l\'analyse IA...');

      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Session non valide');
      }

      const response = await fetch(
        'https://nyxtckjfaajhacboxojd.supabase.co/functions/v1/analyze-transcription',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({ 
            video_id: video.id,
            enhance_analysis: true
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Analyse échouée: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }

      toast.success('Analyse IA démarrée avec succès', { id: toastId });

      setVideos((prev) =>
        prev.map((v) => v.id === video.id ? { ...v, status: 'analyzing' } : v)
      );

      setTimeout(() => {
        if (mountedRef.current) {
          fetchVideos();
          fetchStats();
        }
      }, 3000);
    } catch (err) {
      console.error('Erreur analyse:', err);
      toast.error(`Erreur: ${err.message}`);

      setVideos((prev) =>
        prev.map((v) =>
          v.id === video.id ? { 
            ...v, 
            status: 'failed', 
            error_message: err.message 
          } : v
        )
      );
    } finally {
      setProcessingVideoId(null);
    }
  };

  const deleteVideo = async (video) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette vidéo ? Cette action est irréversible.')) {
      return;
    }

    try {
      // Supprimer d'abord les données associées
      const { error: transcriptionError } = await supabase
        .from('transcriptions')
        .delete()
        .eq('video_id', video.id);

      if (transcriptionError) {
        console.warn('Avertissement suppression transcription:', transcriptionError);
      }

      // Supprimer la vidéo de la base de données
      const { error: dbError } = await supabase
        .from('videos')
        .delete()
        .eq('id', video.id)
        .eq('user_id', user.id);

      if (dbError) throw dbError;

      // Supprimer le fichier de stockage si possible
      const path = video.storage_path || video.file_path;
      if (path) {
        try {
          const cleanPath = path.replace(/^videos\//, '');
          const { error: storageError } = await supabase.storage
            .from('videos')
            .remove([cleanPath]);

          if (storageError) {
            console.warn('Avertissement suppression fichier:', storageError);
          }
        } catch (storageErr) {
          console.warn('Erreur suppression fichier:', storageErr);
        }
      }

      toast.success('Vidéo supprimée avec succès');

      // Mettre à jour l'état local
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
      if (selectedVideo?.id === video.id) {
        setSelectedVideo(videos.find(v => v.id !== video.id) || null);
      }

      await refreshStats();
    } catch (err) {
      console.error('Erreur suppression:', err);
      toast.error(`Erreur lors de la suppression: ${err.message}`);
    }
  };

  // Configuration du realtime
  useEffect(() => {
    if (!user) return;

    const initializeData = async () => {
      setLoading(true);
      await Promise.all([fetchVideos(), fetchStats()]);
      setLoading(false);
    };

    initializeData();

    const setupRealtime = () => {
      try {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
        }

        channelRef.current = supabase
          .channel('videos_changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'videos',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              console.log('Changement vidéo détecté:', payload);
              // Rafraîchir les données après un court délai
              setTimeout(() => {
                if (mountedRef.current) {
                  fetchVideos();
                  fetchStats();
                }
              }, 1000);
            }
          )
          .subscribe((status) => {
            console.log('Statut subscription realtime:', status);
          });
      } catch (error) {
        console.error('Erreur configuration realtime:', error);
      }
    };

    setupRealtime();

    return () => {
      mountedRef.current = false;
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch (err) {
          console.error('Erreur nettoyage canal:', err);
        }
      }
    };
  }, [user, fetchVideos, fetchStats]);

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          <p>Veuillez vous connecter pour accéder à vos vidéos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Gestion des Vidéos</h1>
        <div className="flex space-x-2">
          <Button
            onClick={() => {
              fetchVideos();
              fetchStats();
            }}
            variant="outline"
            disabled={loading}
          >
            {loading ? 'Actualisation...' : '🔄 Actualiser'}
          </Button>
          <Button
            onClick={() => (window.location.href = '/upload')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            📤 Uploader une vidéo
          </Button>
        </div>
      </div>

      {/* Statistiques */}
      {stats && (
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <h2 className="text-xl font-semibold mb-3">📊 Statistiques Vidéos</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats.total_videos}</div>
              <div className="text-sm text-blue-800">Total Vidéos</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {Math.round(stats.total_duration / 60)} min
              </div>
              <div className="text-sm text-green-800">Durée totale</div>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{stats.transcribed_videos}</div>
              <div className="text-sm text-purple-800">Transcrites</div>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {stats.last_upload ? new Date(stats.last_upload).toLocaleDateString() : 'N/A'}
              </div>
              <div className="text-sm text-orange-800">Dernier upload</div>
            </div>
          </div>
        </div>
      )}

      {/* Contenu principal */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <p className="ml-4 text-gray-600">Chargement des vidéos...</p>
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p>{error}</p>
          <Button
            onClick={() => {
              fetchVideos();
              fetchStats();
            }}
            className="mt-2 bg-red-600 hover:bg-red-700"
          >
            🔄 Réessayer
          </Button>
        </div>
      ) : videos.length === 0 ? (
        <div className="bg-gray-100 rounded-lg p-8 text-center">
          <h3 className="text-lg font-medium mb-2">🎥 Aucune vidéo disponible</h3>
          <p className="text-gray-600 mb-4">Commencez par uploader votre première vidéo pour l'analyser</p>
          <Button
            onClick={() => (window.location.href = '/upload')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            📤 Uploader une vidéo
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Liste des vidéos */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-medium text-gray-800">Mes Vidéos ({videos.length})</h3>
            </div>
            <div className="overflow-y-auto max-h-[600px]">
              {videos.map((video) => (
                <div
                  key={video.id}
                  onClick={() => setSelectedVideo(video)}
                  className={`p-4 border-b cursor-pointer transition-colors ${
                    selectedVideo?.id === video.id 
                      ? 'bg-blue-50 border-blue-200' 
                      : 'hover:bg-gray-50 border-gray-100'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">
                        {video.title || 'Sans titre'}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {new Date(video.created_at).toLocaleDateString()}
                      </p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {video.hasTranscription && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                            📝 Transcrit
                          </span>
                        )}
                        {video.hasAnalysis && (
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                            🤖 Analysé
                          </span>
                        )}
                        {video.language && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                            🌐 {video.language}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 ml-2">
                      <VideoProcessingStatus 
                        videoId={video.id} 
                        initialStatus={video.normalizedStatus} 
                      />
                    </div>
                  </div>
                  
                  {video.normalizedStatus === 'failed' && video.error_message && (
                    <p className="text-xs text-red-500 mt-1 truncate" title={video.error_message}>
                      ❌ {video.error_message}
                    </p>
                  )}
                  
                  {/* Indicateur de progression */}
                  {analysisProgress[video.id] && (
                    <div className="mt-2 bg-blue-50 p-2 rounded border border-blue-200">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-blue-700">{analysisProgress[video.id].step}</span>
                        <span className="text-blue-900 font-medium">
                          {analysisProgress[video.id].progress}%
                        </span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-1.5">
                        <div 
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                          style={{ width: `${analysisProgress[video.id].progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Détails de la vidéo sélectionnée */}
          <div className="lg:col-span-3 bg-white rounded-lg shadow">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-medium text-gray-800">Détails de la vidéo</h3>
            </div>

            {selectedVideo ? (
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedVideo.title || 'Sans titre'}
                  </h2>
                  <div className="text-sm text-gray-500">
                    Uploadé le {new Date(selectedVideo.created_at).toLocaleString()}
                  </div>
                </div>

                {/* Lecteur vidéo */}
                <div className="mb-6">
                  <VideoPlayer video={selectedVideo} />
                </div>

                {/* Métadonnées */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-500">Statut</p>
                    <div className="font-medium text-gray-900">
                      <VideoProcessingStatus
                        videoId={selectedVideo.id}
                        initialStatus={selectedVideo.normalizedStatus}
                      />
                    </div>
                  </div>
                  {selectedVideo.duration && (
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-500">Durée</p>
                      <p className="font-medium text-gray-900">
                        {Math.round(selectedVideo.duration)} secondes
                      </p>
                    </div>
                  )}
                  {selectedVideo.performance_score && (
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-500">Score performance</p>
                      <p className="font-medium text-gray-900">
                        {selectedVideo.performance_score.toFixed(2)}
                      </p>
                    </div>
                  )}
                  {selectedVideo.language && (
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-500">Langue</p>
                      <p className="font-medium text-gray-900">
                        {selectedVideo.language}
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mb-6">
                  <Button
                    onClick={() => triggerManualAnalysis(selectedVideo)}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    disabled={processingVideoId === selectedVideo.id}
                  >
                    {processingVideoId === selectedVideo.id ? (
                      <>🔍 Analyse en cours...</>
                    ) : (
                      <>🤖 Analyser avec IA</>
                    )}
                  </Button>

                  {selectedVideo.normalizedStatus !== 'processing' &&
                   selectedVideo.normalizedStatus !== 'analyzing' &&
                   selectedVideo.normalizedStatus !== 'transcribing' && (
                    <>
                      {!selectedVideo.hasTranscription && (
                        <Button
                          onClick={() => transcribeVideo(selectedVideo)}
                          variant="outline"
                          disabled={processingVideoId === selectedVideo.id}
                        >
                          {processingVideoId === selectedVideo.id
                            ? '📝 Transcription...'
                            : '📝 Transcrire'}
                        </Button>
                      )}
                      {selectedVideo.hasTranscription && !selectedVideo.hasAnalysis && (
                        <Button
                          onClick={() => analyzeVideo(selectedVideo)}
                          variant="outline"
                          disabled={processingVideoId === selectedVideo.id}
                        >
                          {processingVideoId === selectedVideo.id
                            ? '🤖 Analyse...'
                            : '🤖 Analyser'}
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    onClick={() => deleteVideo(selectedVideo)}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    🗑️ Supprimer
                  </Button>
                </div>

                {/* Transcription */}
                {selectedVideo.hasTranscription && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3 text-gray-900">📝 Transcription</h3>
                    <TranscriptionViewer video={selectedVideo} />
                  </div>
                )}

                {/* Analyse IA */}
                {selectedVideo.hasAnalysis && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3 text-gray-900">🤖 Analyse IA</h3>
                    <VideoAnalysisResults video={selectedVideo} />
                  </div>
                )}

                {/* État vide */}
                {!selectedVideo.hasTranscription &&
                 !selectedVideo.hasAnalysis &&
                 selectedVideo.normalizedStatus !== 'failed' && (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
                    <p>
                      Aucune transcription ou analyse disponible. 
                      Utilisez le bouton "Analyser avec IA" pour lancer le processus complet.
                    </p>
                  </div>
                )}

                {/* Erreur */}
                {selectedVideo.normalizedStatus === 'failed' && selectedVideo.error_message && (
                  <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
                    <p className="font-medium">❌ Erreur de traitement</p>
                    <p className="mt-1">{selectedVideo.error_message}</p>
                    <Button
                      onClick={() => {
                        if (selectedVideo.hasTranscription) {
                          analyzeVideo(selectedVideo);
                        } else {
                          transcribeVideo(selectedVideo);
                        }
                      }}
                      className="mt-2 bg-red-600 hover:bg-red-700"
                    >
                      🔄 Réessayer
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                <div className="text-4xl mb-4">🎥</div>
                <p>Sélectionnez une vidéo pour voir les détails</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoManagement;
