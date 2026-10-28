import axios from 'axios';

/**
 * Managed-mode Google model resolution.
 *
 * Background: managed mode used to run every Google query against a hardcoded
 * model id (`gemini-2.0-flash` in AIService.ENV_DEFAULT_MODELS). Google shut
 * that model down on 2026-06-01, so every managed Google query started failing
 * with a model-not-available error — even though the operator's key was fine
 * and newer Flash models were available. A hardcoded id will rot again, so
 * managed mode no longer trusts one: it resolves the model from Google's live
 * model list on every request (list responses are cached for about an hour),
 * and only falls back to a static chain when that list cannot be fetched.
 *
 * Default selection rule (documented here because it is a product decision,
 * not an implementation detail):
 * - Prefer the newest stable Gemini Flash text model: ids matching
 *   `gemini-<major>.<minor>-flash` (no suffix), ranked by version descending.
 *   Flash is the cost-efficient tier, and the newest stable release is the
 *   one Google still serves and the one that handles every recipe and pantry
 *   task (including vision: recipe-from-photo, pantry scan).
 * - If no stable main Flash exists, fall back to the newest stable Flash-Lite
 *   (`gemini-<version>-flash-lite`) — same tier family, cheaper, weaker.
 * - Only if no stable Flash of either kind exists, accept a preview or
 *   experimental Flash id. A preview model is better than a hard failure.
 * - Never select Pro, and never select capability variants: ids with a
 *   suffix other than `-lite`/`-preview`/`-exp` (e.g. `-tts`, `-live`,
 *   `-image`, `-001`) are not general text models and are excluded.
 *
 * This module governs managed mode only. BYOK users keep choosing their own
 * model; nothing here touches their selection, and nothing here touches
 * credit metering.
 */

/**
 * Last-resort chain when Google's live model list cannot be fetched at all.
 * Every entry was live on Google's deprecation page as of 2026-10-22 with no
 * shutdown date announced, newest first. This chain is a fallback, not the
 * selection mechanism — the live list is always tried first.
 */
export const MANAGED_GOOGLE_FLASH_FALLBACKS: string[] = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-2.5-flash',
];

/** How long a fetched live model list is trusted (matches AIService's 1h model cache). */
const LIVE_LIST_CACHE_TTL_MS = 60 * 60 * 1000;

let liveListCache: { timestamp: number; ids: string[] } | null = null;

interface FlashCandidate {
  id: string;
  major: number;
  minor: number;
  /** 0 = stable main Flash, 1 = stable Flash-Lite, 2 = preview/experimental Flash. */
  tier: number;
}

/**
 * Parse a Gemini model id into a Flash candidate, or null when the id is not
 * a Flash-tier text model (Pro, capability variants, embeddings, and
 * versioned `-001` aliases are all excluded — see the module doc above).
 */
function parseFlashCandidate(id: string): FlashCandidate | null {
  const match = /^gemini-(\d+)(?:\.(\d+))?-flash(-lite)?(-.+)?$/.exec(id);
  if (!match) return null;
  const suffix = match[4] ?? '';
  if (suffix && !/preview|exp/.test(suffix)) return null;
  return {
    id,
    major: Number(match[1]),
    minor: match[2] === undefined ? 0 : Number(match[2]),
    tier: suffix ? 2 : match[3] ? 1 : 0,
  };
}

/**
 * Pick the managed Google model from a list of model ids (e.g. Google's live
 * `GET /v1beta/models` list, stripped of the `models/` prefix). Returns null
 * when the list contains no Flash-tier text model at all.
 */
export function selectManagedGoogleFlash(modelIds: string[]): string | null {
  const candidates: FlashCandidate[] = [];
  for (const id of modelIds) {
    const candidate = parseFlashCandidate(id);
    if (candidate) candidates.push(candidate);
  }
  candidates.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.major !== b.major) return b.major - a.major;
    if (a.minor !== b.minor) return b.minor - a.minor;
    return a.id.localeCompare(b.id);
  });
  return candidates.length > 0 ? candidates[0].id : null;
}

/**
 * Fetch Google's live model ids (generateContent-capable only), cached for
 * about an hour. Returns null when the list cannot be fetched or is empty —
 * callers fall back to MANAGED_GOOGLE_FLASH_FALLBACKS in that case. Never
 * returns a hardcoded catalog: a hardcoded list is exactly what rotted.
 */
export async function fetchLiveGoogleModelIds(apiKey: string): Promise<string[] | null> {
  if (liveListCache && Date.now() - liveListCache.timestamp < LIVE_LIST_CACHE_TTL_MS) {
    return liveListCache.ids;
  }
  try {
    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { timeout: 8000 }
    );
    const models = response.data?.models;
    if (!Array.isArray(models)) return null;
    const ids = models
      .filter((m: any) => m?.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => String(m?.name ?? '').replace(/^models\//, ''))
      .filter((id: string) => id.length > 0);
    if (ids.length === 0) return null;
    liveListCache = { timestamp: Date.now(), ids };
    return ids;
  } catch (err: any) {
    console.warn(
      'Managed Google model resolution: live model list fetch failed, using fallback chain:',
      err?.message
    );
    return null;
  }
}

/**
 * Resolve the model a managed-mode Google query should use: the newest
 * stable Flash from Google's live list, or the head of the static fallback
 * chain when the live list is unavailable. Never throws for a missing list —
 * a failed list fetch must not become a failed query.
 */
export async function resolveManagedGoogleModel(apiKey: string): Promise<string> {
  const liveIds = await fetchLiveGoogleModelIds(apiKey);
  if (liveIds) {
    const pick = selectManagedGoogleFlash(liveIds);
    if (pick) return pick;
    console.warn(
      'Managed Google model resolution: live list contains no Flash model, using fallback chain'
    );
  }
  return MANAGED_GOOGLE_FLASH_FALLBACKS[0];
}

/**
 * The request-time fallback chain for one resolved model: the resolved model
 * first, then the static fallbacks (excluding the resolved model itself).
 * Used by GoogleProvider so a model that disappears between resolution and
 * request time degrades to the previous stable Flash instead of failing.
 */
export function managedGoogleFlashChain(resolvedModel: string): string[] {
  return [
    resolvedModel,
    ...MANAGED_GOOGLE_FLASH_FALLBACKS.filter((model) => model !== resolvedModel),
  ];
}

/** Test hook: drop the cached live list so the next resolution fetches again. */
export function clearManagedGoogleModelCache(): void {
  liveListCache = null;
}

/**
 * Managed-mode Google IMAGE model resolution.
 *
 * Background: the text fix above never reached image generation. When a
 * managed-mode recipe is created with its image checkbox on, the request
 * flows through GoogleProvider.generateImage — which ignored the resolved
 * text model and the fallback chain entirely and ran its own hardcoded
 * chain starting with `gemini-2.0-flash` (shut down 2026-06-01), then
 * Imagen endpoints that need a billed Google Cloud project. Every strategy
 * failed, and the recipe controller swallowed the error, so the user got a
 * recipe with no image and no error. The same rot, one layer down.
 *
 * Image selection rule (same principles as the text rule, Flash tier only):
 * - Prefer the newest stable dedicated Flash image model: ids matching
 *   `gemini-<major>.<minor>-flash-image` (no suffix), ranked by version
 *   descending. These are the models built for generateContent image output
 *   (responseModalities TEXT+IMAGE).
 * - Only if no stable image model exists, accept a preview/experimental
 *   Flash image id. A preview model is better than a hard failure.
 * - Never select Pro image models, `-001` aliases, or 2.0-era `-exp-image`
 *   ids — the matcher requires `-flash-image` right after the version.
 *
 * Managed mode only, like the text resolution. BYOK image-model choices
 * are untouched, and nothing here touches credit metering.
 */

/**
 * Last-resort image chain when Google's live model list cannot be fetched
 * at all. `gemini-2.5-flash-image` is the dedicated Flash image model the
 * codebase already treats as its image default; the live list is always
 * tried first and supersedes this the moment it changes.
 */
export const MANAGED_GOOGLE_FLASH_IMAGE_FALLBACKS: string[] = [
  'gemini-2.5-flash-image',
];

interface FlashImageCandidate {
  id: string;
  major: number;
  minor: number;
  /** 0 = stable Flash image model, 1 = preview/experimental Flash image model. */
  tier: number;
}

/**
 * Parse a Gemini model id into a Flash image candidate, or null when the id
 * is not a Flash-tier image model.
 */
function parseFlashImageCandidate(id: string): FlashImageCandidate | null {
  const match = /^gemini-(\d+)(?:\.(\d+))?-flash-image(-.+)?$/.exec(id);
  if (!match) return null;
  const suffix = match[3] ?? '';
  if (suffix && !/preview|exp/.test(suffix)) return null;
  return {
    id,
    major: Number(match[1]),
    minor: match[2] === undefined ? 0 : Number(match[2]),
    tier: suffix ? 1 : 0,
  };
}

/**
 * Pick the managed Google image model from a list of model ids (e.g.
 * Google's live `GET /v1beta/models` list, stripped of the `models/`
 * prefix). Returns null when the list contains no Flash image model.
 */
export function selectManagedGoogleFlashImage(modelIds: string[]): string | null {
  const candidates: FlashImageCandidate[] = [];
  for (const id of modelIds) {
    const candidate = parseFlashImageCandidate(id);
    if (candidate) candidates.push(candidate);
  }
  candidates.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.major !== b.major) return b.major - a.major;
    if (a.minor !== b.minor) return b.minor - a.minor;
    return a.id.localeCompare(b.id);
  });
  return candidates.length > 0 ? candidates[0].id : null;
}

/**
 * Resolve the model a managed-mode Google image request should use: the
 * newest stable Flash image model from Google's live list (same cached list
 * as the text resolution — one lookup per request at most), or the head of
 * the static image fallback chain when the live list is unavailable or
 * contains no image model. Never throws for a missing list.
 */
export async function resolveManagedGoogleImageModel(apiKey: string): Promise<string> {
  const liveIds = await fetchLiveGoogleModelIds(apiKey);
  if (liveIds) {
    const pick = selectManagedGoogleFlashImage(liveIds);
    if (pick) return pick;
    console.warn(
      'Managed Google image resolution: live list contains no Flash image model, using fallback chain'
    );
  }
  return MANAGED_GOOGLE_FLASH_IMAGE_FALLBACKS[0];
}

/**
 * The request-time fallback chain for one resolved image model: the resolved
 * model first, then the static image fallbacks (excluding the resolved model
 * itself). Used by GoogleProvider so an image model that disappears between
 * resolution and request time degrades instead of failing.
 */
export function managedGoogleFlashImageChain(resolvedImageModel: string): string[] {
  return [
    resolvedImageModel,
    ...MANAGED_GOOGLE_FLASH_IMAGE_FALLBACKS.filter((model) => model !== resolvedImageModel),
  ];
}
