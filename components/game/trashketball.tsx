'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Check, CircleHelp, Crosshair, Flag, Leaf, LockKeyhole, Maximize2, Minimize2, Mouse, Move, RotateCcw, Send, Sparkles, Volume2, VolumeX, Waves } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { INITIAL_AIM, type Aim } from '@/lib/physics';
import type { GameEngine } from './engine';

export default function Trashketball() {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<GameEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [level, setLevel] = useState<1 | 2>(1);
  const [score, setScore] = useState(0);
  const [shots, setShots] = useState(0);
  const [hits, setHits] = useState(0);
  const [busy, setBusy] = useState(false);
  const [aim, setAim] = useState<Aim>({ ...INITIAL_AIM[1] });
  const aimRef = useRef(aim);
  const [sound, setSound] = useState(false);
  const [trajectory, setTrajectory] = useState(true);
  const [help, setHelp] = useState(false);
  const [transition, setTransition] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; success: boolean; key: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [session, setSession] = useState(0);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((text: string, success = false) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback({ text, success, key: Date.now() });
    feedbackTimer.current = setTimeout(() => setFeedback(null), 2200);
  }, []);

  useEffect(() => {
    let cancelled = false;
    import('./engine').then(({ GameEngine }) => {
      if (cancelled || !host.current) return;
      try {
        engine.current = new GameEngine(host.current, {
          onReady: () => setReady(true),
          onError: setError,
          onScore: () => { setScore(s => s + 10); setHits(h => h + 1); showFeedback('Nothing but bin.', true); },
          onResolve: scored => { setBusy(false); if (!scored) showFeedback('A little adjustment. Another shot.'); },
          onAim: next => { aimRef.current = next; setAim(next); },
        });
      } catch (err) {
        console.error('Unable to initialize the game', err);
        setError('This game needs WebGL 2. Try a recent browser with hardware acceleration enabled.');
      }
    }).catch(() => setError('The game could not load. Please reload and try again.'));
    return () => { cancelled = true; engine.current?.dispose(); engine.current = null; if (feedbackTimer.current) clearTimeout(feedbackTimer.current); };
  }, [showFeedback]);

  useEffect(() => {
    if (level !== 1 || score < 100) return;
    const timer = setTimeout(() => setTransition(true), 850);
    return () => clearTimeout(timer);
  }, [level, score, session]);

  useEffect(() => { if (engine.current) engine.current.paused = help || transition; }, [help, transition, ready]);

  const updateAim = useCallback((next: Aim) => {
    aimRef.current = next; setAim(next); engine.current?.setAim(next);
  }, []);

  const throwPaper = useCallback(() => {
    if (engine.current?.shoot()) { setShots(s => s + 1); setBusy(true); setFeedback(null); }
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, button, [role="slider"], [role="dialog"]') || help || transition || busy || !ready) return;
      const next = { ...aimRef.current };
      if (event.code === 'Space' && !event.repeat) { event.preventDefault(); throwPaper(); return; }
      if (event.code === 'ArrowLeft') next.yaw = Math.max(-28, next.yaw - 0.6);
      else if (event.code === 'ArrowRight') next.yaw = Math.min(28, next.yaw + 0.6);
      else if (event.code === 'ArrowUp') next.elevation = Math.min(70, next.elevation + 1);
      else if (event.code === 'ArrowDown') next.elevation = Math.max(25, next.elevation - 1);
      else if (event.key === '+' || event.key === '=') next.power = Math.min(100, next.power + 1);
      else if (event.key === '-' || event.key === '_') next.power = Math.max(10, next.power - 1);
      else return;
      event.preventDefault(); updateAim(next);
    };
    window.addEventListener('keydown', keyDown);
    const fullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', fullscreenChange);
    return () => { window.removeEventListener('keydown', keyDown); document.removeEventListener('fullscreenchange', fullscreenChange); };
  }, [help, transition, busy, ready, throwPaper, updateAim]);

  function reset() {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setSession(s => s + 1); setScore(0); setShots(0); setHits(0); setLevel(1); setBusy(false); setTransition(false); setFeedback(null);
    updateAim({ ...INITIAL_AIM[1] }); engine.current?.setLevel(1);
  }
  function nextLevel() {
    setTransition(false); setLevel(2); setScore(0); setShots(0); setHits(0); setBusy(false); setFeedback(null);
    updateAim({ ...INITIAL_AIM[2] }); engine.current?.setLevel(2);
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { showFeedback('Fullscreen isn’t available in this view.'); }
  }

  const locked = busy || !ready || Boolean(error);

  return (
    <main className={`game-shell ${level === 2 ? 'seaside' : ''}`}>
      <header className="masthead">
        <Link href="/" className="wordmark" aria-label="Trashketball home"><span className="brand-mark"><Send size={23} strokeWidth={1.8} /></span><span>trashketball<span className="brand-period">.</span></span></Link>
        <ol className="level-steps" aria-label="Game levels">
          <li className={level === 1 ? 'current' : 'complete'}><span className="step-number">{level === 1 ? '01' : <Check size={13} />}</span><span>The office</span></li>
          <li className="step-line" aria-hidden="true" />
          <li className={level === 2 ? 'current' : ''}><span className="step-number">02</span><span>The seaside</span>{level === 1 && <LockKeyhole size={12} />}</li>
        </ol>
        <div className="header-actions">
          <button className="icon-button" aria-label={sound ? 'Mute sound' : 'Enable sound'} title={sound ? 'Mute sound' : 'Enable sound'} aria-pressed={sound} onClick={() => { setSound(!sound); engine.current?.setSound(!sound); }}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
          <button className="icon-button" aria-label="How to play" title="How to play" onClick={() => setHelp(true)}><CircleHelp size={19} /></button>
          <span className="action-separator" />
          <button className="icon-button" aria-label="Restart game from level one" title="Restart game" disabled={!ready} onClick={reset}><RotateCcw size={18} /></button>
        </div>
      </header>

      <section className="play-area" aria-label={level === 1 ? 'Level one: the severed floor' : 'Level two: the seaside stay'}>
        <div className="world" ref={host} />
        <div className="scene-shade" aria-hidden="true" />
        <div className="scene-heading">
          <p className="eyebrow"><span className="live-dot" /> LEVEL 0{level} <span className="eyebrow-divider" /> {level === 1 ? 'SEVERED FLOOR' : 'VACATION MODE'}</p>
          <h1>{level === 1 ? <>Innie. Outie.<br />Nothing but bin.</> : <>Out of office.<br />Into the basket.</>}</h1>
          <p className="scene-caption">{level === 1 ? 'Please enjoy all throws equally.' : 'A better view. The same little obsession.'}</p>
        </div>

        <div className="score-card">
          <div className="score-label"><span>YOUR SCORE</span><Flag size={14} /></div>
          <div className="score-value" aria-live="polite" aria-atomic="true"><strong>{String(score).padStart(3, '0')}</strong>{level === 1 ? <span>/ 100</span> : <span>PTS</span>}</div>
          {level === 1 ? <Progress value={Math.min(score, 100)} aria-label="Progress to the seaside level" className="score-progress" /> : <div className="free-play-rule" />}
          <div className="score-footer">{level === 1 ? <><span>{10 - Math.min(hits, 10)} baskets to freedom</span><ArrowUpRight size={13} /></> : <><span>Stay a little longer. Free play.</span><Waves size={15} /></>}</div>
        </div>

        {!ready && !error && <output className="world-loading"><span className="loading-ball" /><span>Clocking in…</span></output>}
        {error && <div className="world-error" role="alert"><CircleHelp size={28} /><h2>Let’s get you back in the game.</h2><p>{error}</p><button className="primary-button" onClick={() => window.location.reload()}>Reload game <RotateCcw size={17} /></button></div>}

        {feedback && <output key={feedback.key} className={`shot-feedback ${feedback.success ? 'scored' : ''}`} aria-live="polite">{feedback.success && <strong>+10</strong>}<span>{feedback.text}</span></output>}

        <div className="scene-bottom">
          <div className="environment-label"><span className="environment-icon">{level === 1 ? <Crosshair size={17} /> : <Waves size={19} />}</span><div><strong>{level === 1 ? 'Macrodata Refinement' : 'The Seaside Stay'}</strong><span>{level === 1 ? 'LUMON INDUSTRIES' : 'PRIVATE BEACH · NO MEETINGS'}</span></div></div>
          <div className="drag-hint"><Mouse size={15} /><span>Drag to aim <i>·</i> Scroll for power</span></div>
          <button className="fullscreen-button icon-button" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title="Fullscreen" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        </div>
      </section>

      <section className="control-dock" aria-label="Throw controls">
        <div className="aim-control">
          <div className="control-title"><Move size={15} /><span>AIM YOUR SHOT</span></div>
          <div className="aim-buttons">
            <button className="direction-button" aria-label="Aim left" disabled={locked} onClick={() => updateAim({ ...aim, yaw: Math.max(-28, aim.yaw - 0.6) })}><ArrowLeft size={17} /></button>
            <button className="direction-button" aria-label="Aim lower" disabled={locked} onClick={() => updateAim({ ...aim, elevation: Math.max(25, aim.elevation - 1) })}><ArrowDown size={17} /></button>
            <button className="direction-button" aria-label="Aim higher" disabled={locked} onClick={() => updateAim({ ...aim, elevation: Math.min(70, aim.elevation + 1) })}><ArrowUp size={17} /></button>
            <button className="direction-button" aria-label="Aim right" disabled={locked} onClick={() => updateAim({ ...aim, yaw: Math.min(28, aim.yaw + 0.6) })}><ArrowRight size={17} /></button>
            <span className="angle-readout">{Math.round(aim.elevation)}<span>°</span></span>
          </div>
        </div>
        <div className="power-control">
          <div className="control-title"><span>THROW POWER</span><span className="power-value">{Math.round(aim.power)}<span>%</span></span></div>
          <Slider value={[aim.power]} min={10} max={100} step={1} disabled={locked} aria-label="Throw power" className="power-slider" onValueChange={value => updateAim({ ...aim, power: Array.isArray(value) ? value[0] : value })} />
          <div className="power-labels"><span>A gentle toss</span><span>All in</span></div>
        </div>
        <div className="trajectory-control"><Switch id="trajectory" checked={trajectory} onCheckedChange={checked => { setTrajectory(checked); engine.current?.setTrajectory(checked); }} aria-label="Show trajectory" /><label htmlFor="trajectory">Show trajectory</label></div>
        <button className="throw-button" disabled={locked} onClick={throwPaper}><span>{busy ? 'Paper in flight…' : 'Throw paper'}</span>{busy ? <span className="flight-dot" /> : <ArrowUpRight size={23} />}<kbd>SPACE</kbd></button>
      </section>
      <footer className="game-footer"><span><span className="footer-dot" /> {level === 1 ? 'A VERY PRODUCTIVE BREAK.' : 'YOU’VE EARNED THIS VIEW.'}</span><span>{shots} {shots === 1 ? 'throw' : 'throws'}<i>·</i>{shots ? Math.round(hits / shots * 100) : 0}% accuracy<i>·</i>10 points per basket</span></footer>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="game-dialog">
          <div className="dialog-icon"><Send size={28} /></div>
          <p className="eyebrow">THE ART OF DOING LESS</p>
          <DialogTitle className="dialog-title">Make a little<br />paperwork disappear.</DialogTitle>
          <DialogDescription className="dialog-description">Aim your crumpled paper at the basket. Every successful throw earns 10 points. Reach 100 to trade the office for the seaside.</DialogDescription>
          <div className="instructions">
            <div><Move size={20} /><p><strong>Line it up</strong><span>Drag across the room or use the arrow keys to adjust direction and angle.</span></p></div>
            <div><Crosshair size={20} /><p><strong>Find your arc</strong><span>Use the power slider, scroll, or + / − keys. The dotted path shows your actual trajectory.</span></p></div>
            <div><Send size={20} /><p><strong>Let it fly</strong><span>Click Throw paper or press Space. Gravity, air resistance, and rim bounces do the rest.</span></p></div>
          </div>
          <button className="primary-button" onClick={() => setHelp(false)}>Back to very important work <ArrowRight size={18} /></button>
        </DialogContent>
      </Dialog>

      <Dialog open={transition} onOpenChange={() => {}}>
        <DialogContent className="game-dialog level-dialog" showCloseButton={false}>
          <div className="dialog-icon"><Leaf size={30} /></div>
          <p className="eyebrow">LEVEL 01 COMPLETE</p>
          <DialogTitle className="dialog-title">Your outie<br />has other plans.</DialogTitle>
          <DialogDescription className="dialog-description">100 points. Ten beautiful baskets. Leave the fluorescent lights behind — your beach house is ready.</DialogDescription>
          <div className="next-level-card"><Waves size={30} /><div><span>NEXT UP · LEVEL 02</span><strong>The seaside stay</strong><p>Ocean views. Softer sofas. A fresh basket.</p></div><Sparkles size={18} /></div>
          <button className="primary-button" onClick={nextLevel}>Take the elevator <ArrowRight size={19} /></button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
