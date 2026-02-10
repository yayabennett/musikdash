import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import Head from 'next/head';

// ─── Global Audio Context (only one song plays at a time) ───
const AudioContext = createContext({ playing: null, setPlaying: () => {} });

function AudioProvider({ children }) {
  const [playing, setPlaying] = useState(null);
  return (
    <AudioContext.Provider value={{ playing, setPlaying }}>
      {children}
    </AudioContext.Provider>
  );
}

// ─── Custom Audio Player ───
function AudioPlayer({ src, type, songId }) {
  const { playing: globalPlaying, setPlaying: setGlobalPlaying } = useContext(AudioContext);
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const volumeTrackRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(((-20 + 60) / 60));
  const [draggingVol, setDraggingVol] = useState(false);

  const dbToLinear = (db) => Math.pow(10, db / 20);
  const linearToDb = (lin) => 20 * Math.log10(lin);
  const sliderToDb = (slider) => slider * 60 - 60;
  const dbToSlider = (db) => (db + 60) / 60;
  const linearVolume = dbToLinear(sliderToDb(volume));

  const fmt = (s) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const getDB = () => {
    const db = sliderToDb(volume);
    if (volume < 0.001) return '-∞';
    return db.toFixed(1);
  };

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      setGlobalPlaying(songId);
      audioRef.current.play().catch(() => {});
    }
  };

  // Stop when another song starts playing
  useEffect(() => {
    if (globalPlaying !== songId && playing && audioRef.current) {
      audioRef.current.pause();
    }
  }, [globalPlaying, songId, playing]);

  const seek = (e) => {
    if (!audioRef.current || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * duration;
  };

  const applyVolume = useCallback((e) => {
    if (!volumeTrackRef.current) return;
    const rect = volumeTrackRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const sliderPos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setVolume(sliderPos);
    const linear = dbToLinear(sliderToDb(sliderPos));
    if (audioRef.current) audioRef.current.volume = linear;
  }, []);

  const onVolDown = (e) => {
    e.preventDefault();
    setDraggingVol(true);
    applyVolume(e);
  };

  useEffect(() => {
    if (!draggingVol) return;
    const onMove = (e) => { e.preventDefault(); applyVolume(e); };
    const onUp = () => setDraggingVol(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [draggingVol, applyVolume]);

  const toggleMute = () => {
    const newSlider = volume > 0.001 ? 0 : dbToSlider(-20);
    setVolume(newSlider);
    const linear = dbToLinear(sliderToDb(newSlider));
    if (audioRef.current) audioRef.current.volume = linear;
  };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => setDuration(a.duration);
    const onEnd = () => { setPlaying(false); setCurrent(0); };
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('ended', onEnd);
    };
  }, []);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const fillClass = type === 'sketch' ? 'sketch-fill' : 'song-fill';
  const eqClass = type === 'sketch' ? 'sketch-eq' : 'song-eq';
  const volPct = volume * 100;

  return (
    <div className="custom-player">
      <audio ref={audioRef} src={src} preload="none" />
      <button className="player-play-btn" onClick={toggle} aria-label={playing ? 'Pausieren' : 'Abspielen'}>
        {playing ? '❚❚' : '▶'}
      </button>

      <div className="eq-bars">
        <div className={`eq-bar ${eqClass} ${playing ? 'active' : ''}`} style={{ height: playing ? undefined : '4px' }} />
        <div className={`eq-bar ${eqClass} ${playing ? 'active' : ''}`} style={{ height: playing ? undefined : '4px' }} />
        <div className={`eq-bar ${eqClass} ${playing ? 'active' : ''}`} style={{ height: playing ? undefined : '4px' }} />
      </div>

      <span className="player-time">{fmt(currentTime)}</span>
      <div className="progress-bar" ref={progressRef} onClick={seek} onTouchStart={seek}>
        <div className={`progress-bar-fill ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="player-time">{fmt(duration)}</span>

      <div className={`volume-wrapper ${draggingVol ? 'locked' : ''}`}>
        <button className="volume-icon-btn" onClick={toggleMute} title="Stumm">
          {volume < 0.05 ? '🔇' : volume < 0.35 ? '🔈' : volume < 0.65 ? '🔉' : '🔊'}
        </button>
        <div className="volume-track-wrap">
          <div className="volume-track" ref={volumeTrackRef} onMouseDown={onVolDown} onTouchStart={onVolDown}>
            <div className="volume-track-fill" style={{ width: `${volPct}%` }} />
          </div>
          <span className="volume-db">{getDB()} dB</span>
        </div>
      </div>
    </div>
  );
}

// ─── Star Rating Input ───
function StarInput({ value, onChange, color = 'var(--accent)' }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="star-input" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className={`star ${i <= (hover || value) ? 'filled' : ''}`}
          style={{ '--star-color': color }}
          onMouseEnter={() => setHover(i)}
          onClick={() => onChange(i)}
        >
          ★
        </span>
      ))}
    </div>
  );
}

// ─── Average Stars (display only) ───
function StarDisplay({ value, count, color = 'var(--accent)' }) {
  const full = Math.floor(value);
  const frac = value - full;
  return (
    <div className="star-display-wrap">
      <div className="star-display">
        {[1, 2, 3, 4, 5].map(i => (
          <span key={i} className="star-bg" style={{ '--star-color': color }}>
            ★
            <span
              className="star-fg"
              style={{
                width: i <= full ? '100%' : i === full + 1 ? `${frac * 100}%` : '0%',
                '--star-color': color,
              }}
            >★</span>
          </span>
        ))}
      </div>
      {count > 0 && <span className="star-avg-text">{value.toFixed(1)} · {count}</span>}
    </div>
  );
}

// ─── Rating Panel ───
const CRITERIA = [
  { key: 'melody', label: 'Melodie', icon: '🎵', color: '#a78bfa' },
  { key: 'production', label: 'Produktion', icon: '🎛️', color: '#60a5fa' },
  { key: 'emotion', label: 'Emotion', icon: '💫', color: '#f472b6' },
  { key: 'originality', label: 'Originalität', icon: '✨', color: '#fbbf24' },
];

function RatingPanel({ songId, user, ratings, onRate, showToast }) {
  const [open, setOpen] = useState(false);
  const [scores, setScores] = useState({ melody: 0, production: 0, emotion: 0, originality: 0 });
  const [submitting, setSubmitting] = useState(false);

  const myRating = ratings.find(r => r.username === user);
  const hasRated = !!myRating;

  useEffect(() => {
    if (myRating) {
      setScores({
        melody: myRating.melody,
        production: myRating.production,
        emotion: myRating.emotion,
        originality: myRating.originality,
      });
    }
  }, [myRating]);

  const avgFor = (key) => {
    if (ratings.length === 0) return 0;
    return ratings.reduce((sum, r) => sum + r[key], 0) / ratings.length;
  };

  const totalAvg = ratings.length === 0 ? 0 :
    ratings.reduce((sum, r) => sum + (r.melody + r.production + r.emotion + r.originality) / 4, 0) / ratings.length;

  const submitRating = async () => {
    const allFilled = Object.values(scores).every(v => v >= 1);
    if (!allFilled) {
      showToast('Bitte bewerte alle Kategorien', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song_id: songId, username: user, ...scores }),
      });
      if (res.ok) {
        showToast(hasRated ? 'Bewertung aktualisiert' : 'Bewertung gespeichert');
        onRate();
      } else {
        const err = await res.json();
        showToast(err.error || 'Fehler beim Bewerten', 'error');
      }
    } catch {
      showToast('Netzwerkfehler', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rating-section">
      {/* Summary bar - always visible */}
      <div className="rating-summary" onClick={() => user && setOpen(!open)}>
        <div className="rating-summary-left">
          <StarDisplay value={totalAvg} count={ratings.length} />
        </div>
        <div className="rating-summary-right">
          {ratings.length > 0 && CRITERIA.map(c => (
            <div key={c.key} className="rating-mini-bar">
              <span className="rating-mini-icon">{c.icon}</span>
              <div className="rating-mini-track">
                <div className="rating-mini-fill" style={{ width: `${(avgFor(c.key) / 5) * 100}%`, background: c.color }} />
              </div>
              <span className="rating-mini-val">{avgFor(c.key).toFixed(1)}</span>
            </div>
          ))}
          {user && (
            <button className={`rating-toggle-btn ${open ? 'open' : ''}`}>
              {open ? '▾' : '▸'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded rating form */}
      {open && user && (
        <div className="rating-form">
          <div className="rating-form-header">
            <span className="rating-form-title">{hasRated ? 'Deine Bewertung bearbeiten' : 'Jetzt bewerten'}</span>
            <span className="rating-form-user">{user}</span>
          </div>
          <div className="rating-criteria-grid">
            {CRITERIA.map(c => (
              <div key={c.key} className="rating-criterion">
                <div className="criterion-label">
                  <span className="criterion-icon">{c.icon}</span>
                  <span>{c.label}</span>
                </div>
                <StarInput
                  value={scores[c.key]}
                  onChange={(v) => setScores(prev => ({ ...prev, [c.key]: v }))}
                  color={c.color}
                />
              </div>
            ))}
          </div>
          <button
            className="btn btn-rate"
            onClick={submitRating}
            disabled={submitting}
          >
            {submitting ? '...' : hasRated ? 'Aktualisieren' : 'Bewertung abgeben'}
          </button>

          {/* Alle Bewertungen */}
          {ratings.length > 0 && (
            <div className="all-ratings">
              <span className="all-ratings-title">Alle Bewertungen ({ratings.length})</span>
              {ratings.map(r => {
                const isMe = r.username === user;
                const avg = (r.melody + r.production + r.emotion + r.originality) / 4;
                return (
                  <div key={r.id} className={`user-rating-card ${isMe ? 'is-me' : ''}`}>
                    <div className="user-rating-header">
                      <div className="user-rating-avatar">{r.username.charAt(0).toUpperCase()}</div>
                      <div className="user-rating-meta">
                        <span className="user-rating-name">
                          {r.username}
                          {isMe && <span className="user-rating-badge">Du</span>}
                        </span>
                        <span className="user-rating-date">
                          {new Date(r.rated_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="user-rating-avg">
                        <span className="user-rating-avg-star">★</span>
                        <span className="user-rating-avg-val">{avg.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="user-rating-details">
                      {CRITERIA.map(c => (
                        <div key={c.key} className="user-rating-criterion">
                          <span className="user-rating-criterion-label" style={{ color: c.color }}>
                            {c.icon} {c.label}
                          </span>
                          <div className="user-rating-stars-row">
                            {[1, 2, 3, 4, 5].map(i => (
                              <span key={i} className={`user-rating-star ${i <= r[c.key] ? 'filled' : ''}`} style={{ '--star-color': c.color }}>★</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Song Card ───
function SongCard({ song, type, canDelete, onDelete, user, ratings, onRate, showToast }) {
  return (
    <div className="song-card">
      <div className="song-card-top">
        <div className={`song-card-indicator ${type}`} />
        <div className="song-card-info">
          <div className="song-card-name">{song.originalname}</div>
          <div className="song-card-meta">
            <span className={`song-card-type ${type}`}>
              {type === 'sketch' ? 'Skizze' : 'Song'}
            </span>
            <span>·</span>
            <span>{new Date(song.uploaded_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="song-card-actions">
          {canDelete && (
            <button onClick={() => onDelete(song.id)} className="btn btn-danger" title="Löschen">✕</button>
          )}
        </div>
      </div>
      <AudioPlayer src={`/api/stream/${song.id}`} type={type} songId={song.id} />
      <RatingPanel songId={song.id} user={user} ratings={ratings} onRate={onRate} showToast={showToast} />
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [songs, setSongs] = useState([]);
  const [ratings, setRatings] = useState({});
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadType, setUploadType] = useState('song');
  const [toast, setToast] = useState({ message: '', show: false, type: 'info' });
  const fileInputRef = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('musik_user');
    if (savedUser) setUser(savedUser);
    fetchSongs();
    fetchAllRatings();
  }, []);

  const showToast = (message, type = 'info') => {
    setToast({ message, show: true, type });
    setTimeout(() => setToast({ message: '', show: false, type: 'info' }), 3000);
  };

  const fetchSongs = async () => {
    try {
      const res = await fetch('/api/songs');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      if (Array.isArray(data)) setSongs(data);
    } catch (err) {
      console.error('Failed to fetch songs', err);
    }
  };

  const fetchAllRatings = async () => {
    try {
      const res = await fetch('/api/ratings');
      if (!res.ok) return;
      const data = await res.json();
      const grouped = {};
      data.forEach(r => {
        if (!grouped[r.song_id]) grouped[r.song_id] = [];
        grouped[r.song_id].push(r);
      });
      setRatings(grouped);
    } catch (err) {
      console.error('Failed to fetch ratings', err);
    }
  };

  const refreshSongRatings = async (songId) => {
    try {
      const res = await fetch(`/api/ratings?song_id=${songId}`);
      if (!res.ok) return;
      const data = await res.json();
      setRatings(prev => ({ ...prev, [songId]: data }));
    } catch (err) {
      console.error('Failed to refresh song ratings', err);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const name = usernameInput.trim();
    if (!name || name.length < 2) {
      showToast('Bitte gib einen Namen ein (min. 2 Zeichen)', 'error');
      return;
    }
    const normalizedName = name.toLowerCase();
    setUser(normalizedName);
    localStorage.setItem('musik_user', normalizedName);
    document.cookie = `username=${normalizedName}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Strict; Secure`;
    showToast(`Willkommen, ${normalizedName}!`);
    setUsernameInput('');
  };

  const handleLogout = () => {
    setUser('');
    localStorage.removeItem('musik_user');
    document.cookie = 'username=; path=/; max-age=0';
    showToast('Abgemeldet');
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      showToast('Bitte lade eine Audiodatei hoch', 'error');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('song', file);
    formData.append('uploader', user);
    formData.append('type', uploadType);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        showToast(`${uploadType === 'sketch' ? 'Skizze' : 'Song'} erfolgreich hochgeladen`);
        fetchSongs();
      } else {
        const err = await res.json();
        showToast(err.error || 'Upload fehlgeschlagen', 'error');
      }
    } catch (err) {
      showToast('Netzwerkfehler beim Upload', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bist du sicher, dass du diesen Titel löschen möchtest?')) return;
    try {
      const res = await fetch(`/api/songs?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Erfolgreich gelöscht');
        fetchSongs();
      } else {
        showToast('Löschen fehlgeschlagen', 'error');
      }
    } catch (err) {
      showToast('Fehler beim Löschen', 'error');
    }
  };

  const songsByType = (type) => songs.filter(s => (s.type || 'song') === type);

  return (
    <AudioProvider>
    <div className="container">
      <Head>
        <title>{`Musik — ${user ? 'Bennett' : 'Library'}`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="description" content="Bennetts persönliche Musik-Bibliothek — Songs anhören, bewerten und entdecken." />
        <meta property="og:title" content="Musik — Bennett" />
        <meta property="og:description" content="Persönliche Musik-Bibliothek mit Songs, Skizzen und Community-Bewertungen." />
        <meta property="og:type" content="website" />
        <meta name="theme-color" content="#0a0a0c" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎵</text></svg>" />
      </Head>

      <header className="header">
        <div className="header-left">
          <h1>
            <span className="logo-dot" /> musik
          </h1>
          <div className="bennett-signature">
            <span className="bennett-tag">by bennett</span>
          </div>
        </div>
        <div className="header-right">
          {!user ? (
            <form onSubmit={handleLogin} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="login-input"
                placeholder="Dein Name"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
              />
              <button type="submit" className="btn btn-primary">Rein</button>
            </form>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500 }}>{user}</span>
              <button onClick={handleLogout} className="btn btn-ghost">Abmelden</button>
            </div>
          )}
        </div>
      </header>

      {user === 'bennett' && (
        <section className="upload-card">
          <div className="type-selector">
            <div 
              className={`type-option ${uploadType === 'song' ? 'active' : ''}`}
              data-type="song"
              onClick={() => setUploadType('song')}
            >
              Song
            </div>
            <div 
              className={`type-option ${uploadType === 'sketch' ? 'active' : ''}`}
              data-type="sketch"
              onClick={() => setUploadType('sketch')}
            >
              Skizze
            </div>
          </div>

          <div 
            className={`upload-area ${dragActive ? 'drag-over' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleUpload(e.target.files[0]);
                }
              }}
              accept="audio/*"
              style={{ display: 'none' }}
              tabIndex={-1}
            />
            <div className="upload-icon">
              {uploading ? '◌' : '+'}
            </div>
            <p className="upload-label">
              {uploading ? 'Lädt hoch…' : `Hier ablegen oder klicken zum Durchsuchen`}
            </p>
          </div>
        </section>
      )}

      {/* Songs */}
      {songsByType('song').length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">Songs</span>
            <span className="section-count">{songsByType('song').length}</span>
          </div>
          <div className="song-cards">
            {songsByType('song').map(song => (
              <SongCard
                key={song.id}
                song={song}
                type="song"
                canDelete={user === 'bennett'}
                onDelete={handleDelete}
                user={user}
                ratings={ratings[song.id] || []}
                onRate={() => refreshSongRatings(song.id)}
                showToast={showToast}
              />
            ))}
          </div>
        </>
      )}

      {/* Sketches */}
      {songsByType('sketch').length > 0 && (
        <>
          <div className="section-divider" />
          <div className="section-header">
            <span className="section-title">Skizzen</span>
            <span className="section-count">{songsByType('sketch').length}</span>
          </div>
          <div className="song-cards">
            {songsByType('sketch').map(song => (
              <SongCard
                key={song.id}
                song={song}
                type="sketch"
                canDelete={user === 'bennett'}
                onDelete={handleDelete}
                user={user}
                ratings={ratings[song.id] || []}
                onRate={() => refreshSongRatings(song.id)}
                showToast={showToast}
              />
            ))}
          </div>
        </>
      )}

      {songs.length === 0 && (
        <p className="empty-msg">Noch keine Titel – lade oben etwas hoch.</p>
      )}

      <footer className="footer-brand">
        <p className="footer-brand-text">
          crafted by <span>bennett</span>
        </p>
      </footer>

      <div className={`toast ${toast.show ? 'show' : ''} ${toast.type === 'error' ? 'error' : ''}`}>
        {toast.message}
      </div>
    </div>
    </AudioProvider>
  );
}
