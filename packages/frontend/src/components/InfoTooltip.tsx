import { useState, useRef, useEffect } from 'react';
import { Info, Lightbulb, AlertTriangle } from 'lucide-react';
import { Callout } from './Callout';

interface InfoTooltipProps {
  content: string | React.ReactNode;
  className?: string;
}

export function InfoTooltip({ content, className = '' }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setIsVisible(false);
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible]);

  return (
    <div className={`relative inline-block ${className}`} ref={tooltipRef}>
      <button
        type="button"
        onClick={() => setIsVisible(!isVisible)}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="More information"
        aria-expanded={isVisible}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
      </button>
      {isVisible && (
        <div
          role="tooltip"
          className="absolute z-50 w-64 p-3 mt-2 text-sm bg-popover text-popover-foreground border border-border rounded-lg shadow-lg left-0 top-full"
        >
          <div className="relative">
            {typeof content === 'string' ? <p>{content}</p> : content}
          </div>
        </div>
      )}
    </div>
  );
}

interface InfoBannerProps {
  title: string;
  description: string | React.ReactNode;
  type?: 'info' | 'tip' | 'warning';
  className?: string;
}

export function InfoBanner({ title, description, type = 'info', className = '' }: InfoBannerProps) {
  const tone = type === 'tip' ? 'success' : type;

  const icons = {
    info: <Info className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />,
    tip: <Lightbulb className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />,
    warning: <AlertTriangle className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />,
  };

  return (
    <Callout tone={tone} title={title} icon={icons[type]} className={className}>
      {typeof description === 'string' ? <p>{description}</p> : description}
    </Callout>
  );
}
