import { useState, useEffect, useRef } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';

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
            new Notification('Timer complete', {
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
    <div className={`rounded-xl border p-4 transition-colors ${
      isComplete
        ? 'border-secondary bg-secondary/10'
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
        <h3 className="font-medium text-foreground">{label}</h3>
        {onDelete && (
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
            aria-label="Delete timer"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="mb-4">
        <div className={`text-5xl font-medium text-center mb-2 font-mono tabular-nums ${
          isComplete ? 'text-secondary' : isRunning ? 'text-primary' : 'text-foreground'
        }`}>
          {formatTime(minutes, seconds)}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-background rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-[width] ${isComplete ? 'bg-secondary' : 'bg-primary'}`}
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
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
      </div>

      {isComplete && (
        <div className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-success">
          <Check className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          Timer complete
        </div>
      )}
    </div>
  );
}
