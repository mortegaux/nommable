import { useState, useRef, useEffect } from 'react';
import { recipeApi } from '@/services/api';
import { Camera, Image as ImageIcon, Loader2, X } from 'lucide-react';

interface ImageUploadProps {
  currentImageUrl?: string;
  onImageChange: (imageUrl: string) => void;
  onUpload: (file: File) => Promise<{ imageUrl: string }>;
  maxSizeMB?: number;
  acceptedFormats?: string[];
  recipeId?: string;
  recipeTitle?: string;
  recipeDescription?: string;
}

export function ImageUpload({
  currentImageUrl,
  onImageChange,
  onUpload,
  maxSizeMB = 5,
  acceptedFormats = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  recipeId,
  recipeTitle,
  recipeDescription,
}: ImageUploadProps) {
  const [mode, setMode] = useState<'upload' | 'url' | 'ai'>('upload');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatingAi, setGeneratingAi] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize URL input if there's a current image URL
  useEffect(() => {
    if (currentImageUrl) {
      setUrlInput(currentImageUrl);
      // If it's an uploaded file path, show upload mode, otherwise URL mode
      setMode(currentImageUrl.startsWith('/uploads/') ? 'upload' : 'url');
    }
  }, [currentImageUrl]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');

    // Validate file type
    if (!acceptedFormats.includes(file.type)) {
      setError(`Invalid file type. Accepted: ${acceptedFormats.map(f => f.split('/')[1]).join(', ')}`);
      return;
    }

    // Validate file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      setError(`File size must be less than ${maxSizeMB}MB`);
      return;
    }

    // Upload file
    setUploading(true);
    try {
      const result = await onUpload(file);
      console.log('Upload result:', result);
      console.log('Image URL from upload:', result.imageUrl);
      onImageChange(result.imageUrl);
      setUrlInput(''); // Clear URL input when file is uploaded
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    onImageChange('');
    setUrlInput('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setError('');
  };

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    setError('');
    onImageChange(urlInput.trim());
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleUrlSubmit();
    }
  };

  const handleGenerateAi = async () => {
    setError('');
    setGeneratingAi(true);
    try {
      const res = recipeId
        ? await recipeApi.generateImage(recipeId, aiPrompt.trim() || undefined)
        : await recipeApi.generateImagePreview({
            title: recipeTitle || 'delicious culinary recipe',
            description: recipeDescription,
            prompt: aiPrompt.trim() || undefined,
          });
      onImageChange(res.data.imageUrl);
      setAiPrompt('');
    } catch (err: any) {
      console.error('AI image preview error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to generate image with AI');
    } finally {
      setGeneratingAi(false);
    }
  };

  // Build proper image URL for display
  const getImageSrc = (): string | null => {
    if (!currentImageUrl) return null;

    console.log('currentImageUrl:', currentImageUrl);

    // Full URLs
    if (currentImageUrl.startsWith('http://') || currentImageUrl.startsWith('https://')) {
      console.log('Using full URL:', currentImageUrl);
      return currentImageUrl;
    }
    // Relative paths from server
    if (currentImageUrl.startsWith('/')) {
      const url = `${window.location.origin}${currentImageUrl}`;
      console.log('Built URL from relative path:', url);
      return url;
    }
    // Fallback
    console.log('Using fallback URL:', currentImageUrl);
    return currentImageUrl;
  };

  const imageSrc = getImageSrc();
  console.log('Final imageSrc:', imageSrc);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-card-foreground mb-2">
          Recipe image
        </label>

        {/* Image Preview */}
        {imageSrc && (
          <div className="relative w-full h-48 mb-3 rounded-lg overflow-hidden border border-border">
            <img
              src={imageSrc}
              alt="Recipe preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                console.error('Image failed to load:', currentImageUrl);
                e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';
              }}
            />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-2 hover:bg-destructive/90 transition-colors shadow-lg"
              title="Remove image"
              aria-label="Remove image"
            >
              <X className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Mode Tabs */}
        {!imageSrc && (
          <>
            <div className="flex border-b border-border mb-4">
              <button
                type="button"
                onClick={() => setMode('upload')}
                className={`px-3 py-2 font-medium text-sm border-b transition-colors ${
                  mode === 'upload'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Upload file
              </button>
              <button
                type="button"
                onClick={() => setMode('url')}
                className={`px-3 py-2 font-medium text-sm border-b transition-colors ${
                  mode === 'url'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Enter URL
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('ai');
                  if (!aiPrompt && recipeTitle) {
                    setAiPrompt(`A mouthwatering, professional food photograph of ${recipeTitle}, plated beautifully, natural warm lighting.`);
                  }
                }}
                className={`px-3 py-2 font-medium text-sm border-b transition-colors flex items-center gap-1.5 ${
                  mode === 'ai'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Generate with AI
              </button>
            </div>

            {/* Upload Mode */}
            {mode === 'upload' && (
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptedFormats.join(',')}
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="recipe-image-capture"
                  disabled={uploading}
                />
                <input
                  type="file"
                  accept={acceptedFormats.join(',')}
                  onChange={handleFileSelect}
                  className="hidden"
                  id="recipe-image-gallery"
                  disabled={uploading}
                />
                <div className={`flex flex-col items-center gap-2 ${uploading ? 'opacity-50' : ''}`}>
                  <ImageIcon className="w-12 h-12 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                  {uploading ? (
                    <span className="text-sm font-medium text-muted-foreground">Uploading</span>
                  ) : (
                    <div className="flex gap-3">
                      <label
                        htmlFor="recipe-image-capture"
                        className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                      >
                        <Camera className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                        Take photo
                      </label>
                      <label
                        htmlFor="recipe-image-gallery"
                        className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm font-medium hover:bg-accent transition-colors"
                      >
                        <ImageIcon className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                        Choose from gallery
                      </label>
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">
                    JPEG, PNG, GIF, WebP up to {maxSizeMB}MB
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Tab to a button above and press Enter to browse files.
                  </span>
                </div>
              </div>
            )}

            {/* URL Mode */}
            {mode === 'url' && (
              <div className="space-y-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={handleUrlKeyDown}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="https://example.com/image.jpg"
                />
                <button
                  type="button"
                  onClick={handleUrlSubmit}
                  className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Use this URL
                </button>
              </div>
            )}

            {/* AI Generate Mode */}
            {mode === 'ai' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Image prompt (Google Imagen 3 or OpenAI)
                  </label>
                  <textarea
                    rows={2}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder={recipeTitle ? `e.g. A vibrant food photograph of ${recipeTitle}` : 'Describe the food photo to generate'}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    disabled={generatingAi}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleGenerateAi}
                  disabled={generatingAi}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {generatingAi ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating</span>
                    </>
                  ) : (
                    <>
                      <span>Generate image</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
