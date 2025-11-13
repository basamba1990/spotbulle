import React, { useState, useEffect } from "react";
import { updateBirthData, getAstroProfile } from "../services/astroService";
import { useAuth } from "../context/AuthContext";

const BirthDataForm = ({ onProfileUpdated }) => {
  const { user } = useAuth();
  const [birthData, setBirthData] = useState({
    date: "",
    time: "",
    place: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchAstroProfile = async () => {
      if (user) {
        try {
          const profile = await getAstroProfile(user.id);
          if (profile) {
            setMessage("Votre profil astrologique a déjà été calculé.");
            // Pré-remplir les données si disponibles
            if (profile.birth_data) {
              setBirthData({
                date: profile.birth_data.birth_date || "",
                time: profile.birth_data.birth_time || "",
                place: profile.birth_data.birth_place || "",
              });
            }
          }
        } catch (error) {
          console.log("Aucun profil astrologique existant:", error.message);
        }
      }
    };
    fetchAstroProfile();
  }, [user]);

  const handleChange = (e) => {
    setBirthData({
      ...birthData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      setMessage("Erreur: Utilisateur non authentifié.");
      return;
    }

    // Validation des données
    if (!birthData.date || !birthData.time || !birthData.place) {
      setMessage("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const updatedProfile = await updateBirthData(user.id, birthData);
      setMessage("Données de naissance mises à jour. Le calcul astrologique est déclenché par le trigger de la base de données.");
      
      // Le trigger de la DB appelle la Edge Function. Nous attendons un peu, puis nous demandons à AstroDashboard de se rafraîchir.
      setTimeout(() => {
        if (onProfileUpdated) {
          onProfileUpdated(true);
        }
      }, 5000);
      
    } catch (error) {
      setMessage(`Erreur lors de la mise à jour: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="birth-data-form">
      <h2>Saisissez vos données de naissance</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="date">Date de naissance:</label>
          <input
            type="date"
            id="date"
            name="date"
            value={birthData.date}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="time">Heure de naissance:</label>
          <input
            type="time"
            id="time"
            name="time"
            value={birthData.time}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="place">Lieu de naissance:</label>
          <input
            type="text"
            id="place"
            name="place"
            value={birthData.place}
            onChange={handleChange}
            placeholder="Ville, Pays (ex: Paris, France)"
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Traitement..." : "Calculer mon Profil Astro"}
        </button>
      </form>
      {message && <p className="message">{message}</p>}
    </div>
  );
};

export default BirthDataForm;
