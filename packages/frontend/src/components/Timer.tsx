import { useState, useEffect, useRef } from 'react';

interface TimerProps {
  initialMinutes?: number;
  label?: string;
  onComplete?: () => void;
  onDelete?: () => void;
}

export function Timer({ initialMinutes = 5, label = 'Timer', onComplete, onDelete }: TimerProps) {
  const [totalSeconds, setTotalSeconds] = useState(initialMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  useEffect(() => {
    if (!isRunning || isComplete) return;

    const interval = setInterval(() => {
      setTotalSeconds((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          setIsComplete(true);
          onComplete?.();
          if (audioRef.current) {
            audioRef.current.play();
          }
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Timer Complete!', {
              body: `${label} is done`,
              icon: '/favicon.ico',
            });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, isComplete, label, onComplete]);

  const toggleTimer = () => {
    if (isComplete) {
      setTotalSeconds(initialMinutes * 60);
      setIsComplete(false);
    } else {
      setIsRunning(!isRunning);
    }
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTotalSeconds(initialMinutes * 60);
    setIsComplete(false);
  };

  const addMinute = () => {
    if (!isRunning) setTotalSeconds((prev) => prev + 60);
  };

  const removeMinute = () => {
    if (!isRunning) setTotalSeconds((prev) => Math.max(0, prev - 60));
  };

  const formatTime = (m: number, s: number) => {
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = ((initialMinutes * 60 - totalSeconds) / (initialMinutes * 60)) * 100;

  return (
    <div className={`rounded-xl border-2 p-4 transition-all ${
      isComplete
        ? 'border-secondary bg-secondary/10 animate-pulse-subtle'
        : isRunning
        ? 'border-primary bg-primary/5'
        : 'border-border bg-card'
    }`}>
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBiqFzvHglUULED+f3PK/ejYGJXfG7+GMOwcUW7Hp6qVWEwpCp+Dsumwhh" />

      {/* Screen-reader announcement when the timer completes */}
      <span className="sr-only" role="status" aria-live="assertive">
        {isComplete ? `${label} timer complete` : ''}
      </span>

      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-foreground">{label}</h3>
        {onDelete && (
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
            aria-label="Delete timer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="mb-4">
        <div className={`text-5xl font-bold text-center mb-2 font-mono ${
          isComplete ? 'text-secondary' : isRunning ? 'text-primary' : 'text-foreground'
        }`}>
          {formatTime(minutes, seconds)}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-background rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all ${isComplete ? 'bg-secondary' : 'bg-primary'}`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        {!isRunning && !isComplete && (
          <>
            <button
              onClick={removeMinute}
              disabled={minutes === 0}
              className="flex-1 py-2 rounded-lg border border-border bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Remove 1 minute"
            >
              -1m
            </button>
            <button
              onClick={addMinute}
              className="flex-1 py-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors"
              aria-label="Add 1 minute"
            >
              +1m
            </button>
          </>
        )}

        <button
          onClick={toggleTimer}
          className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
            isComplete
              ? 'bg-secondary text-secondary-foreground hover:bg-secondary/90'
              : isRunning
              ? 'bg-warning text-warning-foreground hover:bg-warning/90'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          {isComplete ? 'Reset' : isRunning ? 'Pause' : 'Start'}
        </button>

        {(isRunning || isComplete) && (
          <button
            onClick={resetTimer}
            className="px-4 py-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors"
            aria-label="Reset timer"
          >
            ↺
          </button>
        )}
      </div>

      {isComplete && (
        <div className="mt-3 text-center text-sm font-medium text-success animate-pulse">
          ✓ Timer Complete!
        </div>
      )}
    </div>
  );
}
