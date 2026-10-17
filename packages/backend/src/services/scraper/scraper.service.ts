import * as cheerio from 'cheerio';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { RecipeCreateDto } from '@nommable/shared';
import {
  assertSafeScrapeUrl,
  fetchWithGuardedRedirects,
  resolveRedirectChain,
} from '../../utils/ssrf-guard';

const execFileAsync = promisify(execFile);

export class ScraperService {
  async scrapeRecipe(url: string): Promise<Partial<RecipeCreateDto>> {
    // Validate before any network access (SSRF protection)
    const safeUrl = await assertSafeScrapeUrl(url);

    // 1. Try Python recipe-scrapers library first (supports 600+ sites).
    // recipe-scrapers follows redirects with its own client, so resolve the
    // redirect chain (with per-hop SSRF validation) first and hand it the
    // final URL instead of the user-supplied one.
    try {
      const finalUrl = await resolveRedirectChain(safeUrl);
      const pythonResult = await this.scrapWithPython(finalUrl);
      if (pythonResult) {
        return pythonResult;
      }
    } catch (error) {
      console.warn('Python scraper failed, falling back to cheerio:', error);
    }

    // 2. Try direct cheerio-based scraping with adaptive User-Agent
    try {
      const html = await this.fetchHtml(safeUrl);
      const $ = cheerio.load(html);

      // Try to extract recipe data from JSON-LD schema first
      const jsonLd = this.extractJsonLd($);
      if (jsonLd) {
        return jsonLd;
      }

      // Try to get partial metadata from incomplete JSON-LD
      const partialJsonLd = this.extractPartialJsonLd($);

      // Fallback to manual scraping, merging any partial JSON-LD metadata
      const manual = this.manualScrape($, safeUrl);
      if (partialJsonLd) {
        return {
          ...manual,
          title: partialJsonLd.title || manual.title,
          description: partialJsonLd.description || manual.description,
          imageUrl: partialJsonLd.imageUrl || manual.imageUrl,
          prepTime: partialJsonLd.prepTime || manual.prepTime,
          cookTime: partialJsonLd.cookTime || manual.cookTime,
          servings: partialJsonLd.servings || manual.servings,
          nutrition: partialJsonLd.nutrition || manual.nutrition,
        };
      }
      return manual;
    } catch (directError: any) {
      console.warn(
        `Direct scraper fetch failed (${directError.message}), attempting bypass fallbacks...`
      );

      // 3. Fallback for WordPress / Cloudflare-protected blogs (WP REST API)
      try {
        const wpResult = await this.scrapeWithWpApi(safeUrl);
        if (wpResult) {
          return wpResult;
        }
      } catch (wpError: any) {
        console.warn('WordPress REST API fallback failed:', wpError.message);
      }

      // 4. Fallback to Wayback Machine archive capture
      try {
        const archiveResult = await this.scrapeWithArchive(safeUrl);
        if (archiveResult) {
          return archiveResult;
        }
      } catch (archiveError: any) {
        console.warn('Wayback Machine archive fallback failed:', archiveError.message);
      }

      // If all scrapers failed, throw clear error
      if (directError.response?.status === 403) {
        throw new Error(
          'This recipe website is protected by Cloudflare bot verification and cannot be reached directly. Please copy the ingredients and steps or use the AI recipe extractor.'
        );
      }
      throw new Error(`Failed to scrape recipe: ${directError.message}`);
    }
  }

  private async fetchHtml(url: string): Promise<string> {
    const userAgents = [
      'Nommable/1.0 (Recipe Importer; +https://github.com/mortegaux/nommable)',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];

    let lastError: any = null;

    for (const ua of userAgents) {
      try {
        // Guarded fetch: re-validates every redirect target (plain axios
        // maxRedirects would let a public URL 302 to an internal address).
        const response = await fetchWithGuardedRedirects(url, {
          headers: {
            'User-Agent': ua,
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: 10000,
        });

        if (response.data && typeof response.data === 'string') {
          return response.data;
        }
      } catch (err: any) {
        lastError = err;
        // If 403 or blocked, try next User-Agent
      }
    }

    throw lastError || new Error('Failed to fetch recipe HTML');
  }

  private async scrapWithPython(url: string): Promise<Partial<RecipeCreateDto> | null> {
    try {
      const scriptPath = path.join(__dirname, 'recipe_scraper.py');
      const { stdout, stderr } = await execFileAsync('python', [scriptPath, url], {
        timeout: 30000,
      });

      if (stderr) {
        console.warn('Python scraper stderr:', stderr);
      }

      const result = JSON.parse(stdout);

      if (!result.success) {
        throw new Error(result.error);
      }

      const data = result.data;

      return {
        title: data.title,
        description: data.description,
        servings: this.parseServings(data.servings),
        prepTime: data.prepTime || (data.totalTime ? Math.floor(data.totalTime / 2) : undefined),
        cookTime: data.cookTime || (data.totalTime ? Math.ceil(data.totalTime / 2) : undefined),
        imageUrl: data.imageUrl,
        sourceUrl: data.sourceUrl,
        instructions: data.instructions || [],
        ingredients: this.transformPythonIngredients(data.ingredients || []),
        categories: data.categories || [],
        tags: data.tags || [],
        nutrition: data.nutrition || undefined,
      };
    } catch {
      return null;
    }
  }

  private transformPythonIngredients(ingredients: string[]): any[] {
    return ingredients.map((ing, index) => {
      const parsed = this.parseIngredientString(ing);
      return { ...parsed, order: index };
    });
  }

  /**
   * Scrapes recipe data from WordPress blogs using the public WP REST API.
   * This bypasses Cloudflare bot protection on WordPress sites (e.g. WP Recipe Maker, Tasty Recipes).
   */
  private async scrapeWithWpApi(url: string): Promise<Partial<RecipeCreateDto> | null> {
    try {
      const parsed = new URL(url);
      const pathSegments = parsed.pathname.split('/').filter(Boolean);
      if (pathSegments.length === 0) return null;

      const slug = pathSegments[pathSegments.length - 1];

      // Endpoints to check: standard posts and custom recipe post types
      const endpoints = [
        `${parsed.origin}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}`,
        `${parsed.origin}/wp-json/wp/v2/recipes?slug=${encodeURIComponent(slug)}`,
      ];

      for (const endpoint of endpoints) {
        try {
          // Same origin as the validated URL, but redirects still need
          // per-hop validation — use the guarded fetch.
          const res = await fetchWithGuardedRedirects(endpoint, {
            headers: {
              'User-Agent':
                'Nommable/1.0 (Recipe Importer; +https://github.com/mortegaux/nommable)',
              Accept: 'application/json',
            },
            timeout: 10000,
          });

          if (Array.isArray(res.data) && res.data.length > 0) {
            const recipe = this.parseWpPost(res.data[0], url);
            if (recipe) return recipe;
          }
        } catch {
          // Continue to next endpoint
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private parseWpPost(post: any, sourceUrl: string): Partial<RecipeCreateDto> | null {
    if (!post || !post.content || !post.content.rendered) return null;

    // Check embedded yoast schema first
    if (post.yoast_head_json && post.yoast_head_json.schema) {
      const jsonLdRecipe = this.findRecipeInJsonLd(post.yoast_head_json.schema);
      if (jsonLdRecipe) {
        const parsed = this.parseRecipeFromSchema(jsonLdRecipe);
        if (parsed) return parsed;
      }
    }

    const $ = cheerio.load(post.content.rendered);

    // Check inline JSON-LD inside post content
    const inlineJsonLd = this.extractJsonLd($);
    if (inlineJsonLd && inlineJsonLd.ingredients && inlineJsonLd.ingredients.length > 0) {
      return inlineJsonLd;
    }

    // WP Recipe Maker (WPRM) extraction
    if ($('.wprm-recipe').length > 0) {
      const title =
        $('.wprm-recipe-name').first().text().trim() || post.title?.rendered || 'Untitled Recipe';

      const description =
        $('.wprm-recipe-summary').first().text().trim() || post.excerpt?.rendered || undefined;

      const imageUrl =
        $('img.wprm-recipe-image').first().attr('src') ||
        $('.wprm-recipe-image img').first().attr('src') ||
        post.jetpack_featured_media_url ||
        post.featured_media_src_url ||
        $('img').first().attr('src') ||
        undefined;

      const servings = this.parseServings($('.wprm-recipe-servings').first().text().trim());
      const prepTime = this.parseDuration($('.wprm-recipe-prep_time').first().text().trim());
      const cookTime = this.parseDuration($('.wprm-recipe-cook_time').first().text().trim());

      const ingredients: any[] = [];
      $('.wprm-recipe-ingredient').each((index, el) => {
        const amount = $(el).find('.wprm-recipe-ingredient-amount').text().trim();
        const unit = $(el).find('.wprm-recipe-ingredient-unit').text().trim();
        const name = $(el).find('.wprm-recipe-ingredient-name').text().trim();
        const notes = $(el).find('.wprm-recipe-ingredient-notes').text().trim();

        const fullText = $(el)
          .text()
          .replace(/[▢\u25a2\u25a1]/g, '')
          .trim()
          .replace(/\s+/g, ' ');

        const parsed = fullText ? this.parseIngredientString(fullText) : {};
        ingredients.push({
          order: index,
          name: name || parsed.name || fullText,
          quantity: amount ? parseFloat(amount) || parsed.quantity : parsed.quantity,
          unit: unit || parsed.unit,
          notes: notes || parsed.notes,
        });
      });

      const instructions: string[] = [];
      $('.wprm-recipe-instruction-text, .wprm-recipe-instruction').each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ');
        if (text) instructions.push(text);
      });

      if (ingredients.length > 0 || instructions.length > 0) {
        return {
          title: this.cleanHtmlEntities(title),
          description: description ? this.cleanHtmlEntities(description) : undefined,
          imageUrl,
          sourceUrl,
          servings,
          prepTime,
          cookTime,
          ingredients,
          instructions: instructions.length > 0 ? instructions : ['See original recipe'],
        };
      }
    }

    // Tasty Recipes, Mediavine Create, or heading-based fallback
    const manual = this.manualScrape($, sourceUrl);
    if (manual && manual.ingredients && manual.ingredients.length > 0) {
      return {
        ...manual,
        title: post.title?.rendered ? this.cleanHtmlEntities(post.title.rendered) : manual.title,
      };
    }

    return null;
  }

  /**
   * Fallback using Wayback Machine archives for sites blocking automated traffic.
   */
  private async scrapeWithArchive(url: string): Promise<Partial<RecipeCreateDto> | null> {
    try {
      const archiveUrl = `https://web.archive.org/web/${url}`;
      const res = await fetchWithGuardedRedirects(archiveUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 15000,
      });

      if (res.data) {
        const $ = cheerio.load(res.data);
        const jsonLd = this.extractJsonLd($);
        if (jsonLd) return jsonLd;

        const manual = this.manualScrape($, url);
        if (manual && manual.ingredients && manual.ingredients.length > 0) {
          return manual;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private cleanHtmlEntities(str: string): string {
    if (!str) return '';
    return str
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&#038;/g, '&')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  private extractJsonLd($: cheerio.CheerioAPI): Partial<RecipeCreateDto> | null {
    const scripts = $('script[type="application/ld+json"]');

    for (let i = 0; i < scripts.length; i++) {
      try {
        const data = JSON.parse($(scripts[i]).html() || '');
        const recipe = this.findRecipeInJsonLd(data);

        if (recipe) {
          const parsed = this.parseRecipeFromSchema(recipe);
          if (parsed) return parsed;
        }
      } catch {
        // Continue to next script tag
      }
    }

    return null;
  }

  private parseRecipeFromSchema(recipe: any): Partial<RecipeCreateDto> | null {
    if (!recipe) return null;
    const instructions = this.parseInstructions(recipe.recipeInstructions);
    const ingredients = this.parseIngredients(recipe.recipeIngredient);

    if (instructions.length === 0 && ingredients.length === 0) {
      return null;
    }

    return {
      title: recipe.name ? this.cleanHtmlEntities(recipe.name) : 'Untitled Recipe',
      description: recipe.description ? this.cleanHtmlEntities(recipe.description) : undefined,
      servings: this.parseServings(recipe.recipeYield),
      prepTime: this.parseDuration(recipe.prepTime),
      cookTime: this.parseDuration(recipe.cookTime),
      imageUrl: this.extractImage(recipe.image),
      instructions,
      ingredients,
      categories: this.parseCategories(recipe.recipeCategory, recipe.recipeCuisine),
      tags: this.parseTags(recipe.keywords, recipe.suitableForDiet),
      nutrition: recipe.nutrition
        ? {
            calories: this.parseCalories(recipe.nutrition.calories),
            protein: this.parseNutrient(recipe.nutrition.proteinContent),
            carbohydrates: this.parseNutrient(recipe.nutrition.carbohydrateContent),
            fat: this.parseNutrient(recipe.nutrition.fatContent),
            fiber: this.parseNutrient(recipe.nutrition.fiberContent),
            sugar: this.parseNutrient(recipe.nutrition.sugarContent),
            sodium: this.parseNutrient(recipe.nutrition.sodiumContent),
          }
        : undefined,
    };
  }

  private extractPartialJsonLd($: cheerio.CheerioAPI): Partial<RecipeCreateDto> | null {
    const scripts = $('script[type="application/ld+json"]');

    for (let i = 0; i < scripts.length; i++) {
      try {
        const data = JSON.parse($(scripts[i]).html() || '');
        const recipe = this.findRecipeInJsonLd(data);
        if (recipe) {
          return {
            title: recipe.name ? this.cleanHtmlEntities(recipe.name) : undefined,
            description: recipe.description
              ? this.cleanHtmlEntities(recipe.description)
              : undefined,
            servings: this.parseServings(recipe.recipeYield),
            prepTime: this.parseDuration(recipe.prepTime),
            cookTime: this.parseDuration(recipe.cookTime),
            imageUrl: this.extractImage(recipe.image),
            nutrition: recipe.nutrition
              ? {
                  calories: this.parseCalories(recipe.nutrition.calories),
                  protein: this.parseNutrient(recipe.nutrition.proteinContent),
                  carbohydrates: this.parseNutrient(recipe.nutrition.carbohydrateContent),
                  fat: this.parseNutrient(recipe.nutrition.fatContent),
                  fiber: this.parseNutrient(recipe.nutrition.fiberContent),
                  sugar: this.parseNutrient(recipe.nutrition.sugarContent),
                  sodium: this.parseNutrient(recipe.nutrition.sodiumContent),
                }
              : undefined,
          };
        }
      } catch {
        // Continue
      }
    }
    return null;
  }

  private findRecipeInJsonLd(data: any): any {
    if (!data) return null;
    // Direct Recipe type
    const types = Array.isArray(data['@type']) ? data['@type'] : [data['@type']];
    if (types.includes('Recipe')) return data;
    // Array of items
    if (Array.isArray(data)) {
      for (const item of data) {
        const found = this.findRecipeInJsonLd(item);
        if (found) return found;
      }
    }
    // @graph wrapper (WordPress/Yoast/WPRM pattern)
    if (data['@graph'] && Array.isArray(data['@graph'])) {
      for (const item of data['@graph']) {
        const found = this.findRecipeInJsonLd(item);
        if (found) return found;
      }
    }
    return null;
  }

  private manualScrape($: cheerio.CheerioAPI, sourceUrl: string): Partial<RecipeCreateDto> {
    const title =
      $('h1[itemprop="name"]').first().text() ||
      $('h1.recipe-title').first().text() ||
      $('h1').first().text() ||
      'Untitled Recipe';

    const description =
      $('[itemprop="description"]').first().text() ||
      $('.recipe-description').first().text() ||
      $('meta[property="og:description"]').attr('content') ||
      '';

    const imageUrl =
      $('[itemprop="image"]').attr('src') || $('meta[property="og:image"]').attr('content') || '';

    const ingredients = this.extractSectionContent($, ['ingredients']);
    const instructions = this.extractSectionContent($, [
      'directions',
      'instructions',
      'method',
      'steps',
      'preparation',
    ]);

    return {
      title: this.cleanHtmlEntities(title.trim()),
      description: description.trim() ? this.cleanHtmlEntities(description.trim()) : undefined,
      imageUrl: imageUrl || undefined,
      sourceUrl,
      instructions:
        instructions.length > 0
          ? instructions
          : ['Manual entry required - could not auto-extract instructions'],
      ingredients:
        ingredients.length > 0
          ? ingredients.map((ing, index) => ({ ...this.parseIngredientString(ing), order: index }))
          : [{ name: 'Manual entry required - could not auto-extract ingredients', order: 0 }],
    };
  }

  private extractSectionContent($: cheerio.CheerioAPI, keywords: string[]): string[] {
    const results: string[] = [];

    $('h1, h2, h3, h4').each((_, el) => {
      if (results.length > 0) return;

      const heading = $(el);
      const text = heading.text().toLowerCase().trim();
      if (!keywords.some((kw) => text.includes(kw))) return;

      const headingLevel = parseInt(el.tagName.replace('h', ''), 10);

      let sibling = heading.next();
      while (sibling.length) {
        const tag = sibling.prop('tagName')?.toLowerCase() || '';

        if (/^h[1-6]$/.test(tag) && parseInt(tag.replace('h', ''), 10) <= headingLevel) {
          break;
        }

        this.extractListItems($, sibling, results);
        sibling = sibling.next();
      }
    });

    return results;
  }

  private extractListItems(
    $: cheerio.CheerioAPI,
    el: cheerio.Cheerio<any>,
    results: string[]
  ): void {
    const tag = el.prop('tagName')?.toLowerCase() || '';

    if (tag === 'ul' || tag === 'ol') {
      el.children('li').each((_, li) => {
        const item = $(li).text().trim();
        if (item) results.push(item);
      });
      return;
    }

    const nestedLists = el.find('ul, ol');
    if (nestedLists.length > 0) {
      nestedLists.each((_, list) => {
        $(list)
          .children('li')
          .each((_, li) => {
            const item = $(li).text().trim();
            if (item) results.push(item);
          });
      });
      return;
    }

    if (tag === 'p') {
      const content = el.text().trim();
      if (
        content &&
        !(el.children('strong, b').length > 0 && el.children().text().trim() === content)
      ) {
        const lines = content
          .split(/\n/)
          .map((l) => l.replace(/^\d+[.)]\s*/, '').trim())
          .filter(Boolean);
        results.push(...lines);
      }
    }
  }

  private parseServings(yield_: any): number | undefined {
    if (!yield_) return undefined;
    const str = String(yield_);
    const match = str.match(/\d+/);
    const servings = match ? parseInt(match[0], 10) : undefined;
    return servings && servings > 0 && servings <= 100 ? servings : undefined;
  }

  private parseDuration(duration: string): number | undefined {
    if (!duration) return undefined;
    const isoMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (isoMatch && (isoMatch[1] || isoMatch[2])) {
      const hours = parseInt(isoMatch[1] || '0', 10);
      const minutes = parseInt(isoMatch[2] || '0', 10);
      return hours * 60 + minutes;
    }
    let total = 0;
    const hourMatch = duration.match(/(\d+)\s*hours?/i);
    const minMatch = duration.match(/(\d+)\s*min(?:ute)?s?/i);
    if (hourMatch) total += parseInt(hourMatch[1], 10) * 60;
    if (minMatch) total += parseInt(minMatch[1], 10);
    return total > 0 ? total : undefined;
  }

  private extractImage(image: any): string | undefined {
    if (!image) return undefined;
    if (typeof image === 'string') return image;
    if (Array.isArray(image)) {
      return this.extractImage(image[0]);
    }
    if (typeof image === 'object') {
      if (image.url) return image.url;
      if (image.contentUrl) return image.contentUrl;
      if (image['@id']) return image['@id'];
    }
    return undefined;
  }

  private parseInstructions(instructions: any): string[] {
    if (!instructions) return [];
    if (typeof instructions === 'string') return [instructions];
    if (Array.isArray(instructions)) {
      const result: string[] = [];
      for (const inst of instructions) {
        if (typeof inst === 'string') {
          result.push(inst);
        } else if (inst['@type'] === 'HowToSection' && inst.itemListElement) {
          result.push(...this.parseInstructions(inst.itemListElement));
        } else if (inst.text) {
          result.push(inst.text);
        } else if (inst.itemListElement) {
          result.push(...this.parseInstructions(inst.itemListElement));
        }
      }
      return result.filter(Boolean);
    }
    return [];
  }

  private parseIngredients(ingredients: any): any[] {
    if (!ingredients) return [];
    if (Array.isArray(ingredients)) {
      return ingredients.map((ing, index) => {
        const parsed = this.parseIngredientString(String(ing));
        return { ...parsed, order: index };
      });
    }
    return [];
  }

  private parseIngredientString(str: string): any {
    const cleaned = str.trim();

    const notesMatch = cleaned.match(/\(([^)]+)\)/);
    const notes = notesMatch ? notesMatch[1] : undefined;
    const withoutNotes = cleaned.replace(/\([^)]+\)/g, '').trim();

    const units = [
      'cup',
      'cups',
      'tablespoon',
      'tablespoons',
      'tbsp',
      'teaspoon',
      'teaspoons',
      'tsp',
      'ounce',
      'ounces',
      'oz',
      'pound',
      'pounds',
      'lb',
      'lbs',
      'gram',
      'grams',
      'g',
      'kilogram',
      'kilograms',
      'kg',
      'milliliter',
      'milliliters',
      'ml',
      'liter',
      'liters',
      'l',
      'pinch',
      'dash',
      'clove',
      'cloves',
      'can',
      'cans',
      'package',
      'packages',
      'pkg',
    ];

    const quantityPattern = '(\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+\\.\\d+|\\d+)?';
    const unitPattern = `\\s*(${units.join('|')})?`;
    const regex = new RegExp(`^${quantityPattern}${unitPattern}\\s*(.+)$`, 'i');
    const match = withoutNotes.match(regex);

    if (match) {
      const quantityStr = match[1];
      const unit = match[2];
      const name = match[3] || withoutNotes;

      let quantity: number | undefined;
      if (quantityStr) {
        if (quantityStr.includes(' ') && quantityStr.includes('/')) {
          const parts = quantityStr.split(' ');
          const whole = parseFloat(parts[0]);
          const fractionParts = parts[1].split('/');
          const numerator = parseFloat(fractionParts[0]);
          const denominator = parseFloat(fractionParts[1]);
          quantity = whole + numerator / denominator;
        } else if (quantityStr.includes('/')) {
          const fractionParts = quantityStr.split('/');
          const numerator = parseFloat(fractionParts[0]);
          const denominator = parseFloat(fractionParts[1]);
          quantity = numerator / denominator;
        } else {
          quantity = parseFloat(quantityStr);
        }
      }

      return {
        quantity,
        unit: unit || undefined,
        name: name.trim(),
        notes,
      };
    }

    return {
      name: withoutNotes,
      notes,
    };
  }

  private parseCalories(calories: string): number | undefined {
    if (!calories) return undefined;
    const match = String(calories).match(/\d+/);
    return match ? parseInt(match[0], 10) : undefined;
  }

  private parseNutrient(nutrient: string): number | undefined {
    if (!nutrient) return undefined;
    const match = String(nutrient).match(/[\d.]+/);
    return match ? parseFloat(match[0]) : undefined;
  }

  private parseCategories(category: any, cuisine: any): string[] {
    const categories: string[] = [];

    if (category) {
      if (Array.isArray(category)) {
        categories.push(
          ...category.flatMap((c: string) =>
            c
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
          )
        );
      } else if (typeof category === 'string') {
        categories.push(
          ...category
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
        );
      }
    }

    if (cuisine) {
      if (Array.isArray(cuisine)) {
        categories.push(
          ...cuisine.flatMap((c: string) =>
            c
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
          )
        );
      } else if (typeof cuisine === 'string') {
        categories.push(
          ...cuisine
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
        );
      }
    }

    return categories.length > 0 ? categories : (undefined as any);
  }

  private parseTags(keywords: any, suitableForDiet: any): string[] {
    const tags: string[] = [];

    if (keywords) {
      if (typeof keywords === 'string') {
        tags.push(...keywords.split(',').map((k: string) => k.trim()));
      } else if (Array.isArray(keywords)) {
        tags.push(...keywords);
      }
    }

    if (suitableForDiet) {
      const diets = Array.isArray(suitableForDiet) ? suitableForDiet : [suitableForDiet];
      diets.forEach((diet: string) => {
        const dietStr = String(diet).toLowerCase();
        if (dietStr.includes('vegetarian')) tags.push('Vegetarian');
        if (dietStr.includes('vegan')) tags.push('Vegan');
        if (dietStr.includes('glutenfree')) tags.push('Gluten-Free');
        if (dietStr.includes('dairyfree')) tags.push('Dairy-Free');
        if (dietStr.includes('lowcarb')) tags.push('Low-Carb');
        if (dietStr.includes('ketogenic')) tags.push('Keto');
      });
    }

    return tags.length > 0 ? tags : (undefined as any);
  }
}
