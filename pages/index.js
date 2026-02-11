import { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo, memo } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  HiPlay, HiPause, HiSpeakerWave, HiSpeakerXMark, 
  HiMagnifyingGlass, HiArrowDownTray, HiXMark, HiPlus,
  HiMusicalNote, HiSparkles, HiArrowRightOnRectangle,
  HiChevronRight, HiStar, HiClock
} from 'react-icons/hi2';

// ─── Global Audio Context ───
const AudioCtx = createContext({ 
  playingId: null, 
  setPlayingId: () => {}, 
  playNext: () => {},
  isPlaying: false,
  setIsPlaying: () => {}
});

function AudioProvider({ children, songs }) {
  const [playingId, setPlayingId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const playNext = useCallback(() => {
    if (!playingId) return;
    const idx = songs.findIndex(s => s.id === playingId);
    if (idx !== -1 && idx < songs.length - 1) {
      setPlayingId(songs[idx + 1].id);
      setIsPlaying(true);
    } else {
      setPlayingId(null);
      setIsPlaying(false);
    }
  }, [playingId, songs]);

  return (
    <AudioCtx.Provider value={{ playingId, setPlayingId, playNext, isPlaying, setIsPlaying }}>
      {children}
    </AudioCtx.Provider>
  );
}

// ─── Fallback Player (simple progress bar if WaveSurfer fails) ───
function FallbackPlayer({ src, type, songId }) {
  const { playingId, setPlayingId, isPlaying, setIsPlaying, playNext } = useContext(AudioCtx);
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const isActive = playingId === songId && isPlaying;
  const fillClass = type === 'sketch' ? 'sketch-fill' : 'song-fill';

  const fmt = (s) => { if (!s || !isFinite(s)) return '0:00'; return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`; };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playingId === songId) {
      if (isPlaying) a.play().catch(() => {});
      else a.pause();
    } else { a.pause(); a.currentTime = 0; }
  }, [playingId, songId, isPlaying]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => setDuration(a.duration);
    const onEnd = () => { setIsPlaying(false); setCurrent(0); playNext(); };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnd);
    return () => { a.removeEventListener('timeupdate', onTime); a.removeEventListener('loadedmetadata', onMeta); a.removeEventListener('ended', onEnd); };
  }, [playNext, setIsPlaying]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (isActive) { audioRef.current.pause(); setIsPlaying(false); }
    else { setPlayingId(songId); setIsPlaying(true); setTimeout(() => audioRef.current.play().catch(() => {}), 0); }
  };

  const seek = (e) => {
    if (!audioRef.current || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    audioRef.current.currentTime = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="waveform-player">
      <audio ref={audioRef} src={src} preload="none" />
      <div className="waveform-controls">
        <motion.button className={`player-play-btn ${isActive ? 'active' : ''}`} onClick={toggle} whileTap={{ scale: 0.9 }}>
          {isActive ? <HiPause /> : <HiPlay />}
        </motion.button>
        <span className="player-time mono">{fmt(currentTime)}</span>
      </div>
      <div className="waveform-center">
        <div className="progress-bar" ref={progressRef} onClick={seek} onTouchStart={seek}>
          <div className={`progress-bar-fill ${fillClass}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="waveform-right">
        <span className="player-time mono">{fmt(duration)}</span>
        <a href={`/api/stream/${songId}?download=true`} className="btn-download" title="Download" download>
          <HiArrowDownTray />
        </a>
      </div>
    </div>
  );
}

// ─── Waveform Player (WaveSurfer.js + Framer Motion) ───
function WaveformPlayer({ src, type, songId }) {
  const { playingId, setPlayingId, isPlaying, setIsPlaying, playNext } = useContext(AudioCtx);
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);
  const volumeTrackRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState((-20 + 60) / 60);
  const [draggingVol, setDraggingVol] = useState(false);

  const dbToLinear = (db) => Math.pow(10, db / 20);
  const sliderToDb = (slider) => slider * 60 - 60;
  const dbToSlider = (db) => (db + 60) / 60;
  const fmt = (s) => { if (!s || !isFinite(s)) return '0:00'; return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`; };
  const getDB = () => { if (volume < 0.001) return '-∞'; return sliderToDb(volume).toFixed(1); };

  const isActive = playingId === songId && isPlaying;
  const progressColor = type === 'sketch' ? '#f59e0b' : '#34d399';

  // Init WaveSurfer — resolve presigned URL first, then load
  useEffect(() => {
    if (!containerRef.current) return;
    let ws = null;
    let cancelled = false;
    const init = async () => {
      try {
        // Get direct presigned URL (avoids CORS issues with 302 redirect)
        const presignRes = await fetch(`/api/presign/${songId}`);
        if (!presignRes.ok) throw new Error('presign failed');
        const { url: directUrl } = await presignRes.json();
        if (cancelled) return;

        const WaveSurfer = (await import('wavesurfer.js')).default;
        if (cancelled) return;

        ws = WaveSurfer.create({
          container: containerRef.current,
          waveColor: 'rgba(255,255,255,0.15)',
          progressColor: progressColor,
          cursorColor: 'transparent',
          barWidth: 2,
          barRadius: 2,
          barGap: 2,
          height: 48,
          fillParent: true,
          normalize: true,
          interact: true,
          dragToSeek: true,
          url: directUrl,
        });

        ws.on('ready', () => { 
          if (!cancelled) { setDuration(ws.getDuration()); setReady(true); }
        });
        ws.on('timeupdate', (t) => { if (!cancelled) setCurrentTime(t); });
        ws.on('finish', () => { 
          if (!cancelled) { setIsPlaying(false); setCurrentTime(0); playNext(); }
        });
        ws.on('error', (err) => {
          console.warn('[WaveSurfer] Error:', err);
          if (!cancelled) setFailed(true);
        });

        ws.setVolume(dbToLinear(sliderToDb(volume)));
        wavesurferRef.current = ws;
      } catch (err) {
        console.warn('[WaveSurfer] Init error:', err);
        if (!cancelled) setFailed(true);
      }
    };
    init();
    return () => { cancelled = true; if (ws) ws.destroy(); wavesurferRef.current = null; };
  }, [songId]);

  // Sync with global context
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || !ready) return;
    if (playingId === songId) {
      if (isPlaying && !ws.isPlaying()) ws.play().catch(() => {});
      else if (!isPlaying && ws.isPlaying()) ws.pause();
    } else {
      if (ws.isPlaying()) ws.pause();
      ws.setTime(0);
      setCurrentTime(0);
    }
  }, [playingId, isPlaying, songId, ready]);

  const toggle = () => {
    if (!wavesurferRef.current || !ready) return;
    if (isActive) {
      wavesurferRef.current.pause();
      setIsPlaying(false);
    } else {
      setPlayingId(songId);
      setIsPlaying(true);
      wavesurferRef.current.play().catch(() => {});
    }
  };

  // Volume
  const applyVolume = useCallback((e) => {
    if (!volumeTrackRef.current) return;
    const rect = volumeTrackRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setVolume(pos);
    if (wavesurferRef.current) wavesurferRef.current.setVolume(dbToLinear(sliderToDb(pos)));
  }, []);

  const onVolDown = (e) => { setDraggingVol(true); applyVolume(e); };
  useEffect(() => {
    if (!draggingVol) return;
    const onMove = (e) => { e.preventDefault(); applyVolume(e); };
    const onUp = () => setDraggingVol(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
  }, [draggingVol, applyVolume]);

  const toggleMute = () => {
    const newV = volume > 0.001 ? 0 : dbToSlider(-20);
    setVolume(newV);
    if (wavesurferRef.current) wavesurferRef.current.setVolume(dbToLinear(sliderToDb(newV)));
  };

  const volPct = volume * 100;

  // Fallback player if waveform fails to load
  if (failed) {
    return <FallbackPlayer src={src} type={type} songId={songId} />;
  }

  return (
    <div className="waveform-player">
      <div className="waveform-controls">
        <motion.button 
          className={`player-play-btn ${isActive ? 'active' : ''}`} 
          onClick={toggle} 
          whileTap={{ scale: 0.9 }}
          aria-label={isActive ? 'Pausieren' : 'Abspielen'}
        >
          {isActive ? <HiPause /> : <HiPlay />}
        </motion.button>
        <span className="player-time mono">{fmt(currentTime)}</span>
      </div>

      <div className="waveform-center">
        <div ref={containerRef} className="waveform-container" />
        {!ready && (
          <div className="waveform-loading">
            <div className="skeleton" style={{ width: '100%', height: '48px', borderRadius: '4px' }} />
          </div>
        )}
      </div>

      <div className="waveform-right">
        <span className="player-time mono">{fmt(duration)}</span>
        <div className={`volume-wrapper ${draggingVol ? 'locked' : ''}`}>
          <button className="volume-icon-btn" onClick={toggleMute} title="Stumm">
            {volume < 0.05 ? <HiSpeakerXMark /> : <HiSpeakerWave />}
          </button>
          <div className="volume-track-wrap">
            <div className="volume-track" ref={volumeTrackRef} onMouseDown={onVolDown} onTouchStart={onVolDown}>
              <div className="volume-track-fill" style={{ width: `${volPct}%` }} />
            </div>
            <span className="volume-db mono">{getDB()} dB</span>
          </div>
        </div>
        <a href={`/api/stream/${songId}?download=true`} className="btn-download" title="Download" download>
          <HiArrowDownTray />
        </a>
      </div>
    </div>
  );
}

// ─── Upload Dropzone (react-dropzone) ───
function UploadDropzone({ user, uploadType, setUploadType, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback(async (accepted) => {
    const file = accepted[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      toast.error('Bitte lade eine Audiodatei hoch');
      return;
    }
    setUploading(true);
    setProgress(0);
    const interval = setInterval(() => setProgress(p => Math.min(p + 8, 90)), 200);
    const formData = new FormData();
    formData.append('song', file);
    formData.append('uploader', user);
    formData.append('type', uploadType);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      clearInterval(interval);
      setProgress(100);
      if (res.ok) { toast.success(`${uploadType === 'sketch' ? 'Skizze' : 'Song'} hochgeladen!`); onUploaded(); }
      else { const err = await res.json(); toast.error(err.error || 'Upload fehlgeschlagen'); }
    } catch { clearInterval(interval); toast.error('Netzwerkfehler beim Upload'); }
    finally { setTimeout(() => { setUploading(false); setProgress(0); }, 600); }
  }, [user, uploadType, onUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'audio/*': ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a'] },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <motion.section 
      className="upload-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="type-selector">
        {['song', 'sketch'].map(t => (
          <motion.div key={t} className={`type-option ${uploadType === t ? 'active' : ''}`} data-type={t} onClick={() => setUploadType(t)} whileTap={{ scale: 0.95 }}>
            {t === 'song' ? <><HiMusicalNote /> Song</> : <><HiSparkles /> Skizze</>}
          </motion.div>
        ))}
      </div>
      <div {...getRootProps()} className={`upload-area ${isDragActive ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}>
        <input {...getInputProps()} />
        {uploading ? (
          <div className="upload-progress-wrap">
            <div className="upload-progress-bar">
              <motion.div className="upload-progress-fill" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
            </div>
            <span className="upload-progress-text mono">{progress}%</span>
          </div>
        ) : (
          <motion.div animate={isDragActive ? { scale: 1.05, y: -5 } : { scale: 1, y: 0 }} className="upload-content">
            <div className="upload-icon"><HiPlus /></div>
            <p className="upload-label">{isDragActive ? 'Loslassen zum Hochladen' : 'Ablegen oder klicken'}</p>
            <span className="upload-hint">MP3, WAV, FLAC, OGG, AAC</span>
          </motion.div>
        )}
      </div>
    </motion.section>
  );
}

// ─── Search Bar ───
function SearchBar({ value, onChange }) {
  return (
    <motion.div className="search-wrapper" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
      <HiMagnifyingGlass className="search-icon" />
      <input type="text" className="search-input" placeholder="Songs, Skizzen durchsuchen..." value={value} onChange={(e) => onChange(e.target.value)} />
      {value && <button className="search-clear" onClick={() => onChange('')}><HiXMark /></button>}
    </motion.div>
  );
}

// ─── Skeleton Loader ───
function SongSkeleton() {
  return (
    <div className="song-cards">
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton skeleton-card" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

// ─── Activity Stream (date-fns + Framer Motion) ───
const ActivityStream = memo(({ ratings, songs }) => {
  const recent = useMemo(() =>
    [...ratings].sort((a, b) => new Date(b.rated_at) - new Date(a.rated_at)).slice(0, 6), [ratings]
  );
  if (!recent.length) return null;
  return (
    <motion.div className="activity-stream" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
      <div className="section-header">
        <HiClock style={{ color: 'var(--text-muted)', fontSize: '14px' }} />
        <span className="section-title">Letzte Aktivitäten</span>
      </div>
      <AnimatePresence>
        {recent.map((r, i) => {
          const song = songs.find(s => s.id === r.song_id);
          if (!song) return null;
          const avg = (r.melody + r.production + r.emotion + r.originality) / 4;
          const timeAgo = formatDistanceToNow(new Date(r.rated_at), { locale: de, addSuffix: true });
          return (
            <motion.div key={`${r.song_id}-${r.username}`} className="activity-item"
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
              <div className="activity-avatar">{r.username[0].toUpperCase()}</div>
              <div className="activity-content">
                <b>{r.username}</b> bewertete <b>{song.originalname}</b> mit {avg.toFixed(1)} ★
                <span className="time">{timeAgo}</span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
});
ActivityStream.displayName = 'ActivityStream';

// ─── Star Rating Input (Framer Motion) ───
function StarInput({ value, onChange, color = 'var(--accent)' }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="star-input" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(i => (
        <motion.span key={i} className={`star ${i <= (hover || value) ? 'filled' : ''}`}
          style={{ '--star-color': color }} onMouseEnter={() => setHover(i)} onClick={() => onChange(i)}
          whileHover={{ scale: 1.3, rotate: 8 }} whileTap={{ scale: 0.8 }}
          animate={i <= value ? { scale: [1, 1.3, 1] } : {}} transition={{ duration: 0.2 }}>★</motion.span>
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

function RatingPanel({ songId, user, ratings, onRate }) {
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
      toast.error('Bitte bewerte alle Kategorien');
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
        toast.success(hasRated ? 'Bewertung aktualisiert' : 'Bewertung gespeichert ⭐');
        onRate();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Fehler beim Bewerten');
      }
    } catch {
      toast.error('Netzwerkfehler');
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
            <motion.button className="rating-toggle-btn" animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }}>
              <HiChevronRight />
            </motion.button>
          )}
        </div>
      </div>

      {/* Expanded rating form */}
      <AnimatePresence>
      {open && user && (
        <motion.div className="rating-form"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{ overflow: 'hidden' }}
        >
          <div className="rating-form-inner">
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
          <motion.button
            className="btn btn-rate"
            onClick={submitRating}
            disabled={submitting}
            whileTap={{ scale: 0.96 }}
          >
            {submitting ? '...' : hasRated ? 'Aktualisieren' : 'Bewertung abgeben'}
          </motion.button>

          {/* Alle Bewertungen */}
          {ratings.length > 0 && (
            <div className="all-ratings">
              <span className="all-ratings-title">Alle Bewertungen ({ratings.length})</span>
              {ratings.map(r => {
                const isMe = r.username === user;
                const avg = (r.melody + r.production + r.emotion + r.originality) / 4;
                const timeAgo = formatDistanceToNow(new Date(r.rated_at), { locale: de, addSuffix: true });
                return (
                  <motion.div key={r.id} className={`user-rating-card ${isMe ? 'is-me' : ''}`}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="user-rating-header">
                      <div className="user-rating-avatar">{r.username.charAt(0).toUpperCase()}</div>
                      <div className="user-rating-meta">
                        <span className="user-rating-name">
                          {r.username}
                          {isMe && <span className="user-rating-badge">Du</span>}
                        </span>
                        <span className="user-rating-date">{timeAgo}</span>
                      </div>
                      <div className="user-rating-avg">
                        <HiStar style={{ color: 'var(--accent)', fontSize: '14px' }} />
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
                  </motion.div>
                );
              })}
            </div>
          )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

// ─── Song Card (Framer Motion + WaveSurfer + react-icons) ───
const SongCard = memo(({ song, type, canDelete, onDelete, user, ratings, onRate, index }) => {
  return (
    <motion.div className="song-card"
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
    >
      <div className="song-card-top">
        <div className={`song-card-indicator ${type}`} />
        <div className="song-card-info">
          <div className="song-card-name">{song.originalname}</div>
          <div className="song-card-meta">
            <span className={`song-card-type ${type}`}>
              {type === 'sketch' ? <><HiSparkles /> Skizze</> : <><HiMusicalNote /> Song</>}
            </span>
            <span className="meta-dot">·</span>
            <span>{formatDistanceToNow(new Date(song.uploaded_at), { locale: de, addSuffix: true })}</span>
          </div>
        </div>
        <div className="song-card-actions">
          {canDelete && (
            <motion.button onClick={() => onDelete(song.id)} className="btn btn-danger" title="Löschen"
              whileHover={{ rotate: 90, scale: 1.15 }} whileTap={{ scale: 0.85 }}>
              <HiXMark />
            </motion.button>
          )}
        </div>
      </div>
      <WaveformPlayer src={`/api/stream/${song.id}`} type={type} songId={song.id} />
      <RatingPanel songId={song.id} user={user} ratings={ratings} onRate={onRate} />
    </motion.div>
  );
});
SongCard.displayName = 'SongCard';

export default function Home() {
  const [user, setUser] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [songs, setSongs] = useState([]);
  const [ratings, setRatings] = useState({});
  const [uploadType, setUploadType] = useState('song');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const { playingId, isPlaying } = useContext(AudioCtx);

  useEffect(() => {
    const savedUser = localStorage.getItem('musik_user');
    if (savedUser) setUser(savedUser);
    fetchSongs();
    fetchAllRatings();
  }, []);

  const fetchSongs = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/songs');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      if (Array.isArray(data)) setSongs(data);
    } catch (err) {
      console.error('Failed to fetch songs', err);
    } finally {
      setLoading(false);
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
      toast.error('Bitte gib einen Namen ein (min. 2 Zeichen)');
      return;
    }
    const normalizedName = name.toLowerCase();
    setUser(normalizedName);
    localStorage.setItem('musik_user', normalizedName);
    const secure = window.location.protocol === 'https:' ? 'Secure; ' : '';
    document.cookie = `username=${normalizedName}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Strict; ${secure}`;
    toast.success(`Willkommen, ${normalizedName}!`);
    setUsernameInput('');
  };

  const handleLogout = () => {
    setUser('');
    localStorage.removeItem('musik_user');
    document.cookie = 'username=; path=/; max-age=0';
    toast('Abgemeldet 👋');
  };

  const handleDelete = async (id) => {
    if (!confirm('Titel wirklich löschen?')) return;
    try {
      const res = await fetch(`/api/songs?id=${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Gelöscht'); fetchSongs(); }
      else toast.error('Löschen fehlgeschlagen');
    } catch { toast.error('Fehler beim Löschen'); }
  };

  const filtered = useMemo(() => {
    if (!search) return songs;
    const s = search.toLowerCase();
    return songs.filter(song => song.originalname.toLowerCase().includes(s) || (song.type || 'song').includes(s));
  }, [songs, search]);

  const byType = (t) => filtered.filter(s => (s.type || 'song') === t);

  // Dynamic Background Colors
  const ambientColors = useMemo(() => {
    if (!isPlaying || !playingId) return { c1: 'rgba(167, 139, 250, 0.07)', c2: 'rgba(110, 231, 183, 0.05)' };
    const song = songs.find(s => s.id === playingId);
    if (song?.type === 'sketch') return { c1: 'rgba(251, 191, 36, 0.08)', c2: 'rgba(248, 113, 113, 0.04)' };
    return { c1: 'rgba(110, 231, 183, 0.08)', c2: 'rgba(167, 139, 250, 0.06)' };
  }, [isPlaying, playingId, songs]);

  const allRatingsFlat = useMemo(() => Object.values(ratings).flat(), [ratings]);
  const songCount = byType('song').length;
  const sketchCount = byType('sketch').length;

  return (
    <AudioProvider songs={songs}>
      <Head>
        <title>{`Musik — ${user ? (user === 'bennett' ? 'Bennett' : user) : 'Library'}`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="description" content="Bennetts persönliche Musik-Bibliothek — Songs anhören, bewerten und entdecken." />
        <meta property="og:title" content="Musik — Bennett" />
        <meta property="og:description" content="Persönliche Musik-Bibliothek mit Songs, Skizzen und Community-Bewertungen." />
        <meta property="og:type" content="website" />
        <meta name="theme-color" content="#0a0a0c" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎵</text></svg>" />
      </Head>

      <div className="ambient-orb ambient-orb-1" style={{ '--ambient-1': ambientColors.c1 }} />
      <div className="ambient-orb ambient-orb-2" style={{ '--ambient-2': ambientColors.c2 }} />

      <div className="container">
        {/* Header */}
        <motion.header className="header"
          initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="header-left">
            <h1><span className="logo-dot" /> musik</h1>
            <div className="bennett-signature"><span className="bennett-tag">by bennett</span></div>
          </div>
          <div className="header-right">
            {!user ? (
              <form onSubmit={handleLogin} className="login-form">
                <input type="text" className="login-input" placeholder="Dein Name" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} />
                <motion.button type="submit" className="btn btn-primary" whileTap={{ scale: 0.95 }}>
                  <HiArrowRightOnRectangle /> Rein
                </motion.button>
              </form>
            ) : (
              <motion.div className="user-badge" onClick={handleLogout} title="Abmelden"
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <div className="user-avatar">{user[0].toUpperCase()}</div>
                <span className="user-name">{user === 'bennett' ? 'Bennett' : user}</span>
              </motion.div>
            )}
          </div>
        </motion.header>

        {/* Upload */}
        {user === 'bennett' && (
          <UploadDropzone user={user} uploadType={uploadType} setUploadType={setUploadType} onUploaded={fetchSongs} />
        )}

        {/* Search */}
        <SearchBar value={search} onChange={setSearch} />

        {/* Songs */}
        {loading ? (
          <SongSkeleton />
        ) : (
          <LayoutGroup>
            <AnimatePresence mode="popLayout">
              {songCount > 0 && (
                <motion.div key="songs-section" layout>
                  <div className="section-header">
                    <HiMusicalNote style={{ color: 'var(--song-color)' }} />
                    <span className="section-title">Songs</span>
                    <span className="section-count">{songCount}</span>
                  </div>
                  <div className="song-cards">
                    <AnimatePresence mode="popLayout">
                      {byType('song').map((song, i) => (
                        <SongCard key={song.id} song={song} type="song" canDelete={user === 'bennett'} onDelete={handleDelete} user={user} ratings={ratings[song.id] || []} onRate={() => refreshSongRatings(song.id)} index={i} />
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}

              {sketchCount > 0 && (
                <motion.div key="sketch-section" layout>
                  <div className="section-divider" />
                  <div className="section-header">
                    <HiSparkles style={{ color: 'var(--sketch-color)' }} />
                    <span className="section-title">Skizzen</span>
                    <span className="section-count">{sketchCount}</span>
                  </div>
                  <div className="song-cards">
                    <AnimatePresence mode="popLayout">
                      {byType('sketch').map((song, i) => (
                        <SongCard key={song.id} song={song} type="sketch" canDelete={user === 'bennett'} onDelete={handleDelete} user={user} ratings={ratings[song.id] || []} onRate={() => refreshSongRatings(song.id)} index={i} />
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}

              {filtered.length === 0 && (
                <motion.div key="empty" className="empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <span className="empty-icon">📭</span>
                  <p>Keine Einträge gefunden</p>
                </motion.div>
              )}
            </AnimatePresence>
          </LayoutGroup>
        )}

        {/* Activity */}
        <ActivityStream ratings={allRatingsFlat} songs={songs} />

        {/* Footer */}
        <footer className="footer-brand">
          <p className="footer-brand-text">crafted by <span>bennett</span></p>
        </footer>
      </div>
    </AudioProvider>
  );
}
