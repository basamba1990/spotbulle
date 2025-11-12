// src/services/videoService.js
import { supabase } from '../lib/supabase';

/**
 * Service pour gérer les opérations liées aux vidéos
 */
export const videoService = {
  async getVideoById(id) {
    if (!id) throw new Error('ID de vidéo requis');
    
    try {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur lors de la récupération de la vidéo:', error);
      throw error;
    }
  },

  async getUserVideos() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');
      
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erreur lors de la récupération des vidéos utilisateur:', error);
      throw error;
    }
  },

  async getVideosForChallenges() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');
      
      const { data, error } = await supabase
        .from('videos')
        .select('id, title, created_at, duration, status')
        .eq('user_id', user.id)
        .eq('status', 'analyzed')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erreur lors de la récupération des vidéos pour défis:', error);
      throw error;
    }
  },

  async uploadVideo(file, metadata, onProgress) {
    if (!file) throw new Error('Fichier vidéo requis');
    if (!metadata || !metadata.title) throw new Error('Titre de la vidéo requis');
    
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');

      // Générer un nom de fichier unique
      const fileExt = file.name.split('.').pop() || 'webm';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `videos/${user.id}/${fileName}`;

      console.log('Début de l\'upload...');
      
      // Upload du fichier
      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
          onUploadProgress: (progress) => {
            if (onProgress) {
              const percent = Math.round((progress.loadedBytes / progress.totalBytes) * 100);
              onProgress({
                loaded: progress.loadedBytes,
                total: progress.totalBytes,
                percent: percent
              });
            }
          }
        });

      if (uploadError) {
        console.error('Erreur d\'upload:', uploadError);
        throw new Error(`Échec de l'upload: ${uploadError.message}`);
      }

      console.log('Upload réussi, création de l\'entrée en base...');

      // Créer l'entrée en base de données
      const { data: videoData, error: videoError } = await supabase
        .from('videos')
        .insert({
          title: metadata.title.trim(),
          description: metadata.description?.trim() || null,
          status: 'uploaded',
          user_id: user.id,
          original_file_name: file.name,
          file_size: file.size,
          format: file.type.split('/')[1] || 'mp4',
          duration: metadata.duration || null,
          is_public: metadata.isPublic || false,
          storage_path: filePath,
          file_path: filePath,
        })
        .select()
        .single();

      if (videoError) {
        console.error('Erreur base de données:', videoError);
        throw new Error(`Erreur base de données: ${videoError.message}`);
      }

      // Mettre la progression à 100%
      if (onProgress) {
        onProgress({
          loaded: file.size,
          total: file.size,
          percent: 100
        });
      }

      return videoData;
    } catch (error) {
      console.error('Erreur détaillée lors du téléchargement:', error);
      throw new Error(`Échec de l'upload: ${error.message}`);
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
      
      // Supprimer le fichier de stockage
      if (video.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('videos')
          .remove([video.storage_path]);
        
        if (storageError) {
          console.warn('Erreur suppression fichier:', storageError);
        }
      }
      
      // Supprimer l'entrée en base
      const { error: deleteError } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId)
        .eq('user_id', user.id);
      
      if (deleteError) throw deleteError;
      
      return { success: true };
    } catch (error) {
      console.error('Erreur lors de la suppression de la vidéo:', error);
      throw error;
    }
  }
};
