// src/pages/SpotCoach.jsx
// Version ultra-professionnelle avec tableau de bord

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Gauge } from '../components/ui/gauge.jsx';
import { spotCoachService } from '../services/spotCoachService.js';

const initialState = {
  name: '',
  birthDate: '',
  birthTime: '',
  birthCity: '',
  latitude: '',
  longitude: '',
  timezone: '',
  passions: '',
  talents: '',
  intentions: '',
};

function parseMultiline(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// Composant Gauge personnalisé pour les scores
const ScoreGauge = ({ value, max = 360, label, description, color = 'blue' }) => {
  const percentage = Math.min((value / max) * 100, 100);
  const colorClasses = {
    amber: 'from-amber-500 to-orange-500',
    blue: 'from-blue-500 to-cyan-500',
    emerald: 'from-emerald-500 to-green-500',
    purple: 'from-purple-500 to-pink-500'
  };

  return (
    <div className="text-center p-4 bg-slate-800/50 rounded-lg border border-slate-700">
      <div className="mb-2">
        <div className="text-sm text-slate-400 mb-1">{label}</div>
        <div className="text-2xl font-bold text-white">{value}°</div>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
        <div 
          className={`h-2 rounded-full bg-gradient-to-r ${colorClasses[color]}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <div className="text-xs text-slate-400">{description}</div>
    </div>
  );
};

// Composant Badge professionnel
const ProfessionalBadge = ({ children, variant = 'default' }) => (
  <Badge 
    className={`
      px-3 py-1 text-sm font-medium
      ${variant === 'pro' 
        ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-200' 
        : 'bg-slate-700/50 border-slate-600 text-slate-300'
      }
    `}
  >
    {children}
  </Badge>
);

export default function SpotCoach() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingExisting(true);
      try {
        const existing = await spotCoachService.getExistingProfile();
        if (!mounted) return;
        if (existing) {
          const passions = Array.isArray(existing.passions)
            ? existing.passions
            : typeof existing.passions === 'string'
              ? (() => {
                  try {
                    const parsed = JSON.parse(existing.passions);
                    return Array.isArray(parsed) ? parsed : [existing.passions];
                  } catch {
                    return [existing.passions];
                  }
                })()
              : [];

          const mapped = {
            mode: 'persisted',
            profile: {
              phrase_synchronie: existing.phrase_synchronie ?? '',
              archetype: existing.archetype ?? '',
              element: existing.element ?? '',
              signe_soleil: existing.signe_soleil ?? '',
              signe_lune: existing.signe_lune ?? '',
              signe_ascendant: existing.signe_ascendant ?? '',
              profile_text: existing.profile_text ?? '',
              passions,
              soleil_degre: existing.soleil,
              lune_degre: existing.lune,
              ascendant_degre: existing.ascendant,
            },
            stored: existing,
          };
          setResult(mapped);
          setForm((prev) => ({
            ...prev,
            name: existing.name ?? '',
            birthDate: existing.date ?? '',
            birthTime: existing.time ?? '',
            birthCity: existing.city ?? '',
            latitude: existing.lat ?? '',
            longitude: existing.lon ?? '',
            timezone: existing.timezone ?? '',
          }));
          setShowForm(false);
        } else {
          setShowForm(true);
          setResult(null);
        }
      } catch (err) {
        console.error('[SpotCoach] Load existing profile error:', err);
        setShowForm(true);
        setResult(null);
      } finally {
        if (mounted) setLoadingExisting(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const narrativeSections = useMemo(() => {
    const text = result?.profile?.profile_text;
    if (!text) return [];

    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const sections = [];
    let current = null;

    const isTitle = (line) =>
      line.includes('—') || /^ATOUTS STRATÉGIQUES$/i.test(line) || /^SYNTHÈSE$/i.test(line);

    lines.forEach((line) => {
      if (isTitle(line)) {
        current = { title: line, rows: [] };
        sections.push(current);
      } else if (current) {
        current.rows.push(line);
      }
    });

    return sections;
  }, [result]);

  const inputClass = 'bg-slate-950/60 border-slate-800 focus:border-amber-500 text-slate-100 placeholder:text-slate-500 focus:ring-amber-500/20';

  const isSubmitDisabled = useMemo(() => {
    if (!form.birthDate || !form.latitude || !form.longitude) {
      return true;
    }
    return loading;
  }, [form.birthDate, form.latitude, form.longitude, loading]);

  const handleChange = (field) => (event) => {
    const value = event?.target ? event.target.value : event;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildPayload = () => {
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);

    return {
      name: form.name || undefined,
      birth: {
        date: form.birthDate,
        time: form.birthTime || null,
        city: form.birthCity || undefined,
        latitude: Number.isFinite(latitude) ? latitude : undefined,
        longitude: Number.isFinite(longitude) ? longitude : undefined,
        timezone: form.timezone || undefined,
      },
    };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setResult(null);

    try {
      setLoading(true);
      const startedAt = Date.now();
      const payload = buildPayload();
      
      console.log('[SpotCoach Pro] submit start', { 
        payloadSnapshot: {
          name: payload?.name,
          birth: payload?.birth,
        }
      });

      const response = await spotCoachService.generateSymbolicProfile(payload);

      console.log('[SpotCoach Pro] submit success', { 
        ms: Date.now() - startedAt, 
        mode: response?.mode 
      });
      
      setResult(response);
      setShowForm(false);
    } catch (err) {
      console.error('[SpotCoach Pro] Form submission error:', err);
      const message = err?.message || err?.error || 'Impossible de générer le profil symbolique.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        {/* En-tête professionnel */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              ← Retour à l'accueil
            </Button>
            <ProfessionalBadge variant="pro">
              🎯 VERSION PRO
            </ProfessionalBadge>
          </div>
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-400 via-orange-400 to-amber-600">
              SpotCoach Pro
            </h1>
            <p className="text-slate-300 max-w-3xl mx-auto text-lg">
              Votre profil symbolique stratégique pour l'excellence professionnelle et personnelle. 
              Analyse précise basée sur vos données de naissance.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Formulaire */}
          <Card className="xl:col-span-2 bg-slate-900/60 border border-slate-800 backdrop-blur shadow-2xl">
            <CardHeader className="border-b border-slate-800">
              <CardTitle className="flex items-center gap-2 text-amber-100">
                📊 Questionnaire & Informations
              </CardTitle>
              <CardDescription className="text-slate-400">
                Fournis des données précises pour une analyse symbolique optimale. 
                Les champs latitude/longitude sont requis pour la précision.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {loadingExisting ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
                  <span className="ml-3 text-slate-300">Chargement du profil...</span>
                </div>
              ) : showForm ? (
                <form className="space-y-6" onSubmit={handleSubmit}>
                  <section className="space-y-5">
                    <h2 className="text-lg font-semibold text-amber-200 flex items-center gap-2">
                      👤 Identité & Naissance
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="coach-name" className="text-slate-300">Nom (optionnel)</Label>
                        <Input
                          id="coach-name"
                          placeholder="Ex: Alex Dupont"
                          value={form.name}
                          onChange={handleChange('name')}
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="coach-date" className="text-slate-300">Date de naissance *</Label>
                        <Input
                          id="coach-date"
                          type="date"
                          value={form.birthDate}
                          onChange={handleChange('birthDate')}
                          required
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="coach-time" className="text-slate-300">Heure de naissance (optionnelle)</Label>
                        <Input
                          id="coach-time"
                          type="time"
                          value={form.birthTime}
                          onChange={handleChange('birthTime')}
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="coach-city" className="text-slate-300">Ville de naissance</Label>
                        <Input
                          id="coach-city"
                          placeholder="Ex: Paris, France"
                          value={form.birthCity}
                          onChange={handleChange('birthCity')}
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="coach-lat" className="text-slate-300">Latitude *</Label>
                        <Input
                          id="coach-lat"
                          type="number"
                          step="0.000001"
                          placeholder="48.856613"
                          value={form.latitude}
                          onChange={handleChange('latitude')}
                          required
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="coach-lon" className="text-slate-300">Longitude *</Label>
                        <Input
                          id="coach-lon"
                          type="number"
                          step="0.000001"
                          placeholder="2.352222"
                          value={form.longitude}
                          onChange={handleChange('longitude')}
                          required
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="coach-timezone" className="text-slate-300">Fuseau horaire (optionnel)</Label>
                        <Input
                          id="coach-timezone"
                          placeholder="Ex: Europe/Paris"
                          value={form.timezone}
                          onChange={handleChange('timezone')}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </section>

                  <div className="flex items-center gap-3 pt-4">
                    <Button 
                      type="submit" 
                      disabled={isSubmitDisabled} 
                      className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-semibold px-8 py-2 transition-all disabled:opacity-50"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-950"></div>
                          Génération en cours...
                        </span>
                      ) : (
                        '🎯 Générer Mon Profil Pro'
                      )}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800" 
                      onClick={() => setForm(initialState)} 
                      disabled={loading}
                    >
                      Réinitialiser
                    </Button>
                  </div>

                  {error && (
                    <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 text-sm">
                      {error}
                    </div>
                  )}
                </form>
              ) : (
                <div className="space-y-4 text-center py-6">
                  <div className="text-4xl mb-4">✅</div>
                  <p className="text-slate-300">Un profil SpotCoach Pro existe déjà pour cet utilisateur.</p>
                  <Button 
                    onClick={() => { setShowForm(true); setError(null); }} 
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-semibold"
                  >
                    🔄 Régénérer le profil symbolique
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tableau de bord des résultats */}
          <div className="xl:col-span-2 space-y-6">
            <Card className="bg-slate-900/60 border border-slate-800 backdrop-blur shadow-2xl">
              <CardHeader className="border-b border-slate-800">
                <CardTitle className="flex items-center gap-2 text-amber-100">
                  📈 Tableau de Bord SpotCoach Pro
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Votre analyse stratégique complète avec métriques d'influence
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {!result && !loading && !loadingExisting && (
                  <div className="text-center py-12 space-y-4">
                    <div className="text-6xl opacity-50">🎯</div>
                    <p className="text-slate-400 text-lg">
                      Complète le formulaire pour découvrir votre profil symbolique professionnel
                    </p>
                  </div>
                )}

                {loading && (
                  <div className="text-center py-12 space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
                    <p className="text-amber-300 text-lg font-semibold">
                      Analyse symbolique en cours...
                    </p>
                    <p className="text-slate-400">
                      SpotCoach Pro fusionne les données astrologiques et vos intentions
                    </p>
                  </div>
                )}

                {result && result.profile && (
                  <div className="space-y-6">
                    {/* Métriques principales */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <ScoreGauge 
                        value={result.profile.soleil_degre} 
                        label="Soleil" 
                        description="Score de pertinence de votre essence fondamentale"
                        color="amber"
                      />
                      <ScoreGauge 
                        value={result.profile.lune_degre} 
                        label="Lune" 
                        description="Intensité de votre intelligence émotionnelle"
                        color="blue"
                      />
                      <ScoreGauge 
                        value={result.profile.ascendant_degre} 
                        label="Ascendant" 
                        description="Précision de votre image sociale"
                        color="emerald"
                      />
                    </div>

                    {/* Orientation stratégique */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                        <p className="text-xs uppercase text-slate-500 mb-1">Élément</p>
                        <p className="font-semibold text-amber-400 text-lg">{result.profile.element}</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                        <p className="text-xs uppercase text-slate-500 mb-1">Archétype</p>
                        <p className="font-semibold text-amber-400 text-lg">{result.profile.archetype}</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                        <p className="text-xs uppercase text-slate-500 mb-1">Mode</p>
                        <ProfessionalBadge variant="pro">
                          {result.mode === 'cached' ? 'CACHÉ' : 'PROFESSIONNEL'}
                        </ProfessionalBadge>
                      </div>
                    </div>

                    {/* Mantra de synchronie */}
                    <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-6 text-center">
                      <p className="text-amber-200 italic text-lg font-medium">
                        "{result.profile.phrase_synchronie}"
                      </p>
                      <p className="text-amber-400/70 text-sm mt-2">Mantra de Synchronie</p>
                    </div>

                    {/* Signature astrologique */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      {[
                        { label: 'Soleil', value: result.profile.signe_soleil, emoji: '☀️' },
                        { label: 'Lune', value: result.profile.signe_lune, emoji: '🌙' },
                        { label: 'Ascendant', value: result.profile.signe_ascendant, emoji: '⚡️' }
                      ].map((item, index) => (
                        <div key={index} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{item.emoji}</span>
                              <div>
                                <p className="text-sm text-slate-400">{item.label}</p>
                                <p className="font-semibold text-white text-lg">{item.value}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Domaines d'excellence */}
                    {Array.isArray(result.profile.passions) && result.profile.passions.length > 0 && (
                      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                        <p className="text-sm uppercase tracking-wide text-slate-500 mb-4">🎯 Domaines d'Excellence</p>
                        <div className="flex flex-wrap gap-2">
                          {result.profile.passions.map((passion, index) => (
                            <ProfessionalBadge key={`${passion}-${index}`} variant="pro">
                              {passion}
                            </ProfessionalBadge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Analyse détaillée */}
                    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                      <p className="text-sm uppercase tracking-wide text-slate-500 mb-4">📊 Analyse Stratégique Détaillée</p>
                      <div className="space-y-6">
                        {narrativeSections.map((section, index) => (
                          <div key={index} className="border-l-4 border-amber-500 pl-4 py-2">
                            <h3 className="font-semibold text-amber-300 mb-3 text-lg">{section.title}</h3>
                            <div className="text-slate-200 space-y-3">
                              {section.rows.map((row, rowIndex) => (
                                <p key={rowIndex} className="leading-relaxed">{row}</p>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Informations de sauvegarde */}
                    {result.stored && (
                      <div className="text-xs text-slate-500 border-t border-slate-800 pt-4 text-center">
                        Profil SpotCoach Pro sauvegardé le {new Date(result.stored.updated_at).toLocaleString()}
                        {result.mode === 'cached' && ' • (Version mise en cache pour performance)'}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
