import { Link } from 'react-router-dom';
import { AutoAwesomeIcon } from './icons/MaterialIcon';

interface AIConfigAlertProps {
  onClose: () => void;
  message?: string;
}

/**
 * AISetupPrompt — shown when a user taps an AI feature that isn't configured yet.
 *
 * This is a CTA, not an error. It frames AI as an unlockable upgrade and
 * deep-links to the AI settings tab. The `PricingTiers` placeholder below is
 * where paid AI plans / upsell options will slot in later — for now it's
 * BYOK-only, so the tiers section stays hidden.
 */
export function AIConfigAlert({ onClose, message }: AIConfigAlertProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-warning/15 p-2">
              <AutoAwesomeIcon size={24} className="text-warning" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Unlock AI Features</h2>
              <p className="text-sm text-muted-foreground">Set up AI to use this feature</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-muted-foreground">
            {message || 'This feature needs AI configured before it can be used.'}
          </p>

          <div className="bg-accent/10 rounded-lg p-4 border border-accent/20">
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <AutoAwesomeIcon size={18} />
              What you get with AI
            </h3>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside ml-2">
              <li>Generate recipes from ingredients or a description</li>
              <li>Smart meal plan suggestions</li>
              <li>Recipe enhancement and ingredient substitutions</li>
              <li>AI-generated food photography</li>
            </ul>
          </div>

          {/* Pricing tiers slot in here later. For now, Nommable is BYOK-only:
              users bring their own API key from OpenAI, Anthropic, Google AI,
              or run Ollama locally. When paid plans land, render <PricingTiers />
              here and gate the "Set Up AI" button behind plan selection. */}
          {false && <div data-testid="pricing-tiers" />}

          <p className="text-xs text-muted-foreground">
            Bring your own API key from OpenAI, Anthropic, or Google AI — or use
            Ollama for free local AI. Your key stays on your server.
          </p>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors"
          >
            Maybe Later
          </button>
          <Link
            to="/settings?tab=ai"
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors text-center inline-flex items-center justify-center gap-2"
          >
            <AutoAwesomeIcon size={18} />
            Set Up AI
          </Link>
        </div>
      </div>
    </div>
  );
}
