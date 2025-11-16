// src/services/videoService.js
import { supabase } from '../lib/supabase';
import { VIDEO_STATUS, toDatabaseStatus } from '../constants/videoStatus';

/**
 * Valide et nettoie un chemin de stockage
 * @param {string} path - Chemin à valider
 * @returns {string} - Chemin validé et nettoyé
 */
function validateStoragePath(path) {
  if (!path) {
    throw new Error('Le chemin de stockage ne peut pas être vide');
  }
  
  // Nettoyer le chemin
  let cleanPath = path
    .replace(/[^a-zA-Z0-9_\-./]/g, '_') // Remplacer les caractères spéciaux
    .replace(/_{2,}/g, '_') // Remplacer les multiples underscores
    .replace(/^_+|_+$/g, ''); // Supprimer les underscores en début/fin
  
  // Vérifier la structure du chemin
  const pathParts = cleanPath.split('/');
  if (pathParts.length < 3 || pathParts[0] !== 'videos') {
    throw new Error('Le chemin de stockage doit commencer par "videos/<user_id>/<filename>"');
  }
  
  // Vérifier que l'ID utilisateur est valide
  const userId = pathParts[1];
  if (!userId || userId === 'null' || userId === 'undefined') {
    throw new Error('ID utilisateur invalide dans le chemin de stockage');
  }
  
  // Vérifier que le nom de fichier est valide
  const filename = pathParts[pathParts.length - 1];
  if (!filename || filename === 'null' || filename === 'undefined') {
    throw new Error('Nom de fichier invalide dans le chemin de stockage');
  }
  
  return cleanPath;
}

/**
 * Service pour gérer les opérations liées aux vidéos
 */
export const videoService = {
  async getVideoById(id) {
    if (!id) throw new Error('ID de vidéo requis');
    
    try {
      const { data, error } = await supabase
        .from('videos')
        .select(`
          *,
          profiles:user_id (username, avatar_url, full_name)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur lors de la récupération de la vidéo:', error);
      throw error;
    }
  },

  async getPublicVideos(limit = 10, page = 0) {
    try {
      const { data, error } = await supabase
        .from('videos')
        .select(`
          *,
          profiles:user_id (username, avatar_url, full_name)
        `)
        .eq('is_public', true)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erreur lors de la récupération des vidéos publiques:', error);
      throw error;
    }
  },

  async getUserVideos() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');
      
      const { data, error } = await supabase
        .from('videos')
        .select(`
          *,
          profiles:user_id (username, avatar_url, full_name)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erreur lors de la récupération des vidéos utilisateur:', error);
      throw error;
    }
  },

  async uploadVideo(file, metadata, onProgress) {
    if (!file) throw new Error('Fichier vidéo requis');
    if (!metadata || !metadata.title) throw new Error('Titre de la vidéo requis');
    
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('🔧 Début upload - Utilisateur:', user?.id, 'Session:', session?.user?.id);
      
      if (!user) throw new Error('Utilisateur non connecté');
      if (user.id !== session?.user?.id) {
        console.warn('⚠️ Incohérence détectée entre user.id et session.user.id');
      }

      // ✅ VALIDATION CRITIQUE : Vérifier la taille du fichier
      const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`Fichier trop volumineux. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      }

      // ✅ VALIDATION CRITIQUE : Vérifier le type MIME
      const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Type de fichier non supporté. Utilisez MP4, WebM, MOV ou AVI.');
      }

      // Générer un nom de fichier unique avec validation
      const fileNameParts = file.name?.split('.') || [];
      const fileExt = fileNameParts.length > 1 ? fileNameParts.pop() : 'webm';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      
      // Valider et générer le chemin de stockage
      const filePath = validateStoragePath(`videos/${user.id}/${fileName}`);
      console.log('📁 Chemin de stockage validé:', filePath);

      // ✅ UPLOAD AVEC GESTION D'ERREUR AMÉLIORÉE
      console.log('📤 Début de l\'upload dans le bucket videos...');
      
      let uploadProgress = 0;
      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
          onUploadProgress: (progress) => {
            const newProgress = Math.round((progress.loadedBytes / progress.totalBytes) * 100);
            // Éviter les appels trop fréquents
            if (newProgress > uploadProgress + 5 || newProgress === 100) {
              uploadProgress = newProgress;
              if (onProgress) {
                onProgress({
                  loaded: progress.loadedBytes,
                  total: progress.totalBytes,
                  percent: newProgress
                });
              }
            }
          }
        });

      if (uploadError) {
        console.error('❌ Erreur d\'upload dans storage:', uploadError);
        
        // ✅ GESTION D'ERREUR SPÉCIFIQUE
        if (uploadError.message.includes('bucket')) {
          throw new Error('Bucket de stockage non configuré. Contactez l\'administrateur.');
        } else if (uploadError.message.includes('exists')) {
          throw new Error('Un fichier avec ce nom existe déjà.');
        } else {
          throw new Error(`Échec de l'upload: ${uploadError.message}`);
        }
      }
      console.log('✅ Upload réussi dans le bucket videos.');

      // ✅ GÉNÉRATION URL PUBLIQUE (pas d'URL signée nécessaire)
      console.log('🔗 Génération de l\'URL publique...');
      const { data: publicUrlData } = supabase.storage
        .from('videos')
        .getPublicUrl(filePath);
      
      const publicUrl = publicUrlData?.publicUrl;
      console.log('✅ URL publique générée:', publicUrl);

      // ✅ CRÉATION ENTRÉE VIDÉO AVEC STRUCTURE CORRIGÉE
      console.log('💾 Insertion dans la table videos...');
      
      const videoData = {
        title: metadata.title.trim(),
        description: metadata.description?.trim() || null,
        status: toDatabaseStatus(VIDEO_STATUS.UPLOADED),
        user_id: user.id,
        original_file_name: file.name,
        file_size: file.size,
        format: file.type.split('/')[1] || 'mp4',
        duration: metadata.duration || null,
        is_public: metadata.isPublic || false,
        storage_path: filePath,
        file_path: filePath,
        public_url: publicUrl || null,
        transcription_text: null,
        transcription_data: null,
        analysis: null,
        ai_score: null,
        error_message: null
      };

      console.log('📋 Données à insérer:', videoData);

      const { data: insertedVideo, error: videoError } = await supabase
        .from('videos')
        .insert(videoData)
        .select()
        .single();

      if (videoError) {
        console.error('❌ Erreur lors de l\'insertion dans videos:', videoError);
        
        // ✅ NETTOYAGE : Supprimer le fichier uploadé si l'insertion échoue
        try {
          await supabase.storage
            .from('videos')
            .remove([filePath]);
          console.log('🧹 Fichier supprimé après erreur d\'insertion');
        } catch (cleanupError) {
          console.error('❌ Erreur lors du nettoyage:', cleanupError);
        }
        
        throw new Error(`Erreur base de données: ${videoError.message}`);
      }
      console.log('✅ Insertion réussie:', insertedVideo);

      // ✅ PROGRESSION FINALE GARANTIE
      if (onProgress) {
        onProgress({
          loaded: file.size,
          total: file.size,
          percent: 100
        });
      }

      return insertedVideo;
    } catch (error) {
      console.error('💥 Erreur détaillée lors du téléchargement:', error);
      throw new Error(`Échec de l'upload: ${error.message}`);
    }
  },

  async transcribeVideo(videoId) {
    if (!videoId) throw new Error('ID de vidéo requis');
    
    try {
      console.log('🎙️ Début de la transcription pour la vidéo:', videoId);
      
      // ✅ VÉRIFICATION PRÉALABLE DE LA VIDÉO
      const { data: video, error: videoError } = await supabase
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .single();
      
      if (videoError || !video) {
        throw new Error('Vidéo non trouvée');
      }
      
      if (!video.public_url) {
        throw new Error('URL de la vidéo non disponible');
      }

      await this.updateVideoStatus(videoId, VIDEO_STATUS.PROCESSING);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session non disponible');
      
      console.log('🚀 Appel de la Edge Function transcribe-video...');
      
      // ✅ APPEL AVEC PARAMÈTRES COMPLETS
      const requestBody = {
        videoId: videoId,
        userId: session.user.id,
        videoUrl: video.public_url,
        preferredLanguage: 'fr', // Par défaut français
        autoDetectLanguage: true
      };

      console.log('📦 Corps de la requête:', requestBody);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-video`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(requestBody)
        }
      );
      
      console.log('📡 Réponse reçue - Status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erreur HTTP:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: `Erreur HTTP ${response.status}: ${errorText}` };
        }
        
        await supabase
          .from('videos')
          .update({ 
            status: toDatabaseStatus(VIDEO_STATUS.FAILED),
            error_message: errorData.error || `Erreur HTTP ${response.status}`
          })
          .eq('id', videoId);
          
        throw new Error(errorData.error || 'Erreur lors de la transcription');
      }
      
      const result = await response.json();
      console.log('✅ Résultat transcription:', result);
      
      if (result.success || result.message) {
        return result;
      } else {
        await supabase
          .from('videos')
          .update({ 
            status: toDatabaseStatus(VIDEO_STATUS.FAILED),
            error_message: result.error || 'Échec de la transcription'
          })
          .eq('id', videoId);
          
        throw new Error(result.error || 'Échec de la transcription');
      }
    } catch (error) {
      console.error('💥 Erreur lors de la demande de transcription:', error);
      
      try {
        await supabase
          .from('videos')
          .update({ 
            status: toDatabaseStatus(VIDEO_STATUS.FAILED),
            error_message: error.message || 'Erreur inconnue lors de la transcription'
          })
          .eq('id', videoId);
      } catch (updateError) {
        console.error('❌ Erreur lors de la mise à jour du statut:', updateError);
      }
      
      throw error;
    }
  },

  async getTranscription(videoId) {
    if (!videoId) throw new Error('ID de vidéo requis');
    
    try {
      const { data: video, error } = await supabase
        .from('videos')
        .select('transcription_text, transcription_data, transcription_language')
        .eq('id', videoId)
        .single();
      
      if (error) throw error;
      
      if (video.transcription_text) {
        return {
          text: video.transcription_text,
          data: video.transcription_data,
          language: video.transcription_language
        };
      }
      
      return null;
    } catch (error) {
      console.error('Erreur lors de la récupération de la transcription:', error);
      throw error;
    }
  },

  async analyzeVideo(videoId) {
    if (!videoId) throw new Error('ID de vidéo requis');
    
    try {
      console.log('🔍 Début de l\'analyse pour la vidéo:', videoId);
      
      // ✅ VÉRIFICATION PRÉALABLE DE LA TRANSCRIPTION
      const { data: video, error: videoError } = await supabase
        .from('videos')
        .select('transcription_text, status')
        .eq('id', videoId)
        .single();
      
      if (videoError || !video) {
        throw new Error('Vidéo non trouvée');
      }
      
      if (!video.transcription_text) {
        throw new Error('Transcription non disponible pour l\'analyse');
      }

      await this.updateVideoStatus(videoId, VIDEO_STATUS.ANALYZING);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session non disponible');
      
      console.log('🚀 Appel de la Edge Function analyze-transcription...');
      
      const requestBody = {
        videoId: videoId,
        transcriptionText: video.transcription_text,
        userId: session.user.id,
        transcriptionLanguage: 'fr' // ou récupérer depuis la vidéo si disponible
      };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-transcription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(requestBody)
        }
      );
      
      console.log('📡 Réponse analyse reçue - Status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erreur HTTP analyse:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: `Erreur HTTP ${response.status}: ${errorText}` };
        }
        
        await supabase
          .from('videos')
          .update({ 
            status: toDatabaseStatus(VIDEO_STATUS.FAILED),
            error_message: errorData.error || `Erreur analyse HTTP ${response.status}`
          })
          .eq('id', videoId);
          
        throw new Error(errorData.error || 'Erreur lors de l\'analyse');
      }
      
      const result = await response.json();
      console.log('✅ Résultat analyse:', result);
      
      if (result.success) {
        return result;
      } else {
        throw new Error(result.error || 'Échec de l\'analyse');
      }
      
    } catch (error) {
      console.error('💥 Erreur lors de la demande d\'analyse:', error);
      
      try {
        await supabase
          .from('videos')
          .update({ 
            status: toDatabaseStatus(VIDEO_STATUS.FAILED),
            error_message: error.message || 'Erreur inconnue lors de l\'analyse'
          })
          .eq('id', videoId);
      } catch (updateError) {
        console.error('❌ Erreur lors de la mise à jour du statut:', updateError);
      }
      
      throw error;
    }
  },

  async getAnalysis(videoId) {
    if (!videoId) throw new Error('ID de vidéo requis');
    
    try {
      const { data: video, error } = await supabase
        .from('videos')
        .select('analysis, ai_score')
        .eq('id', videoId)
        .single();
      
      if (error) throw error;
      
      if (video.analysis) {
        return {
          analysis: video.analysis,
          ai_score: video.ai_score
        };
      }
      
      return null;
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'analyse:', error);
      throw error;
    }
  },

  async updateVideoStatus(videoId, status) {
    if (!videoId) throw new Error('ID de vidéo requis');
    if (!status) throw new Error('Statut requis');
    
    const dbStatus = toDatabaseStatus(status);
    
    try {
      const { data, error } = await supabase
        .from('videos')
        .update({ 
          status: dbStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', videoId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      throw error;
    }
  },

  async updateVideoMetadata(videoId, metadata) {
    if (!videoId) throw new Error('ID de vidéo requis');
    if (!metadata) throw new Error('Métadonnées requises');
    
    try {
      const updateData = {
        updated_at: new Date().toISOString()
      };
      
      if (metadata.title !== undefined) updateData.title = metadata.title.trim();
      if (metadata.description !== undefined) updateData.description = metadata.description.trim();
      if (metadata.isPublic !== undefined) updateData.is_public = metadata.isPublic;
      
      const { data, error } = await supabase
        .from('videos')
        .update(updateData)
        .eq('id', videoId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur lors de la mise à jour des métadonnées:', error);
      throw error;
    }
  },

  async publishVideo(videoId) {
    if (!videoId) throw new Error('ID de vidéo requis');
    
    try {
      const { data, error } = await supabase
        .from('videos')
        .update({ 
          status: toDatabaseStatus(VIDEO_STATUS.PUBLISHED),
          is_public: true,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', videoId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur lors de la publication de la vidéo:', error);
      throw error;
    }
  },

  async deleteVideo(videoId) {
    if (!videoId) throw new Error('ID de vidéo requis');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');
      
      const { data: video, error: fetchError } = await supabase
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .eq('user_id', user.id)
        .single();
      
      if (fetchError) throw fetchError;
      if (!video) throw new Error('Vidéo non trouvée ou accès non autorisé');
      
      // ✅ SUPPRESSION DU FICHIER STOCKAGE
      if (video.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('videos')
          .remove([video.storage_path]);
        
        if (storageError) {
          console.warn('⚠️ Erreur lors de la suppression du fichier:', storageError);
          // On continue quand même la suppression de l'entrée DB
        }
      }
      
      // ✅ SUPPRESSION DE L'ENTRÉE BASE DE DONNÉES
      const { error: deleteError } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId)
        .eq('user_id', user.id);
      
      if (deleteError) throw deleteError;
      
      console.log('✅ Vidéo supprimée avec succès');
      return { success: true, message: 'Vidéo supprimée avec succès' };
    } catch (error) {
      console.error('Erreur lors de la suppression de la vidéo:', error);
      throw error;
    }
  },

  async incrementViews(videoId) {
    if (!videoId) throw new Error('ID de vidéo requis');
    
    try {
      const { data: video, error: fetchError } = await supabase
        .from('videos')
        .select('views_count')
        .eq('id', videoId)
        .single();
      
      if (fetchError) throw fetchError;
      
      const newViewsCount = (video.views_count || 0) + 1;
      
      const { data, error } = await supabase
        .from('videos')
        .update({ 
          views_count: newViewsCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', videoId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur lors de l\'incrémentation des vues:', error);
      throw error;
    }
  },

  // ✅ FONCTION POUR RÉESSAYER LA TRANSCRIPTION
  async retryTranscription(videoId) {
    if (!videoId) throw new Error('ID de vidéo requis');
    
    try {
      // Réinitialiser le statut et les erreurs
      await supabase
        .from('videos')
        .update({ 
          status: toDatabaseStatus(VIDEO_STATUS.UPLOADED),
          error_message: null,
          transcription_text: null,
          transcription_data: null,
          analysis: null,
          ai_score: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', videoId);
      
      // Relancer la transcription
      return await this.transcribeVideo(videoId);
    } catch (error) {
      console.error('Erreur lors de la nouvelle tentative de transcription:', error);
      throw error;
    }
  },

  // ✅ FONCTION POUR RÉCUPÉRER L'URL DE LA VIDÉO
  async getVideoUrl(videoId) {
    if (!videoId) throw new Error('ID de vidéo requis');
    
    try {
      const { data: video, error } = await supabase
        .from('videos')
        .select('public_url, storage_path')
        .eq('id', videoId)
        .single();
      
      if (error) throw error;
      
      if (video.public_url) {
        return video.public_url;
      }
      
      // Fallback : générer une URL signée si public_url n'existe pas
      if (video.storage_path) {
        const { data: signedUrl } = await supabase.storage
          .from('videos')
          .createSignedUrl(video.storage_path, 3600); // 1 heure
        
        return signedUrl?.signedUrl;
      }
      
      throw new Error('URL de la vidéo non disponible');
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'URL vidéo:', error);
      throw error;
    }
  },

  // ✅ FONCTION POUR VÉRIFIER LE STATUT
  async checkVideoStatus(videoId) {
    if (!videoId) throw new Error('ID de vidéo requis');
    
    try {
      const { data, error } = await supabase
        .from('videos')
        .select('status, error_message, transcription_text, analysis')
        .eq('id', videoId)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur lors de la vérification du statut:', error);
      throw error;
    }
  }
};
