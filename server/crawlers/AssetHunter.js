const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

class AssetHunter {
    constructor(outputDir) {
        this.outputDir = outputDir;
        this.processedAssets = new Map();
    }

    async processAssets(assets) {
        console.log(`🔍 Processing ${assets.length} assets...`);
        
        for (const asset of assets) {
            try {
                await this.processAsset(asset);
            } catch (error) {
                console.error(`Error processing asset ${asset.url}:`, error);
            }
        }
        
        // Generate asset manifest
        await this.generateAssetManifest(assets);
        
        // Create service worker for offline functionality
        await this.generateServiceWorker(assets);
        
        console.log('✅ Asset processing completed');
    }

    async processAsset(asset) {
        if (!asset.downloaded || !asset.localPath) {
            return;
        }
        
        switch (asset.type) {
            case 'image':
                await this.processImage(asset);
                break;
            case '3d-model':
                await this.process3DModel(asset);
                break;
            case 'texture':
                await this.processTexture(asset);
                break;
            case 'javascript':
                await this.processJavaScript(asset);
                break;
            case 'stylesheet':
                await this.processStylesheet(asset);
                break;
            default:
                // No special processing needed
                break;
        }
        
        this.processedAssets.set(asset.url, asset);
    }

    async processImage(asset) {
        try {
            const inputPath = asset.localPath;
            const outputDir = path.dirname(inputPath);
            const filename = path.basename(inputPath, path.extname(inputPath));
            const ext = path.extname(inputPath);
            
            // Get image metadata
            const metadata = await sharp(inputPath).metadata();
            asset.metadata = {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                size: metadata.size
            };
            
            // Create optimized versions for web
            if (metadata.width > 1920) {
                const optimizedPath = path.join(outputDir, `${filename}_optimized${ext}`);
                await sharp(inputPath)
                    .resize(1920, null, { withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toFile(optimizedPath);
                
                asset.optimizedPath = optimizedPath;
            }
            
            console.log(`🖼️  Processed image: ${filename}${ext} (${metadata.width}x${metadata.height})`);
            
        } catch (error) {
            console.error(`Error processing image ${asset.url}:`, error);
        }
    }

    async process3DModel(asset) {
        try {
            const inputPath = asset.localPath;
            const stats = await fs.stat(inputPath);
            
            asset.metadata = {
                size: stats.size,
                format: path.extname(inputPath).toLowerCase()
            };
            
            // For GLB/GLTF files, we could extract embedded textures
            // This would require a GLTF parser library
            console.log(`🎮 Processed 3D model: ${path.basename(inputPath)} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            
        } catch (error) {
            console.error(`Error processing 3D model ${asset.url}:`, error);
        }
    }

    async processTexture(asset) {
        try {
            // Textures are essentially images, so use similar processing
            await this.processImage(asset);
            
            // Additional texture-specific metadata
            const filename = path.basename(asset.localPath).toLowerCase();
            asset.textureType = this.identifyTextureType(filename);
            
            console.log(`🎨 Processed texture: ${filename} (${asset.textureType})`);
            
        } catch (error) {
            console.error(`Error processing texture ${asset.url}:`, error);
        }
    }

    identifyTextureType(filename) {
        if (filename.includes('normal') || filename.includes('norm')) return 'normal';
        if (filename.includes('diffuse') || filename.includes('albedo')) return 'diffuse';
        if (filename.includes('specular') || filename.includes('spec')) return 'specular';
        if (filename.includes('roughness') || filename.includes('rough')) return 'roughness';
        if (filename.includes('metallic') || filename.includes('metal')) return 'metallic';
        if (filename.includes('emission') || filename.includes('emissive')) return 'emission';
        if (filename.includes('height') || filename.includes('displacement')) return 'height';
        if (filename.includes('ambient') || filename.includes('ao')) return 'ambient-occlusion';
        if (filename.includes('envmap') || filename.includes('environment')) return 'environment';
        return 'unknown';
    }

    async processJavaScript(asset) {
        try {
            const content = await fs.readFile(asset.localPath, 'utf8');
            
            // Analyze JavaScript for asset references
            const assetReferences = this.extractAssetReferences(content);
            asset.referencedAssets = assetReferences;
            
            // Check for 3D frameworks
            const frameworks = this.detect3DFrameworks(content);
            asset.frameworks = frameworks;
            
            console.log(`📜 Processed JavaScript: ${path.basename(asset.localPath)} (${frameworks.join(', ')})`);
            
        } catch (error) {
            console.error(`Error processing JavaScript ${asset.url}:`, error);
        }
    }

    extractAssetReferences(jsContent) {
        const references = [];
        
        // Common asset loading patterns
        const patterns = [
            /['"`]([^'"`]*\.(?:glb|gltf|obj|fbx))['"`]/gi,
            /['"`]([^'"`]*\.(?:jpg|jpeg|png|gif|webp|exr|hdr))['"`]/gi,
            /['"`]([^'"`]*\.(?:mp4|webm|mov|avi))['"`]/gi,
            /['"`]([^'"`]*\.(?:mp3|wav|ogg))['"`]/gi,
            /['"`]([^'"`]*\.(?:woff|woff2|ttf|otf))['"`]/gi
        ];
        
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(jsContent)) !== null) {
                references.push(match[1]);
            }
        });
        
        return [...new Set(references)]; // Remove duplicates
    }

    detect3DFrameworks(jsContent) {
        const frameworks = [];
        
        if (jsContent.includes('THREE.') || jsContent.includes('three.js')) {
            frameworks.push('Three.js');
        }
        if (jsContent.includes('BABYLON.') || jsContent.includes('babylon.js')) {
            frameworks.push('Babylon.js');
        }
        if (jsContent.includes('A-Frame') || jsContent.includes('aframe')) {
            frameworks.push('A-Frame');
        }
        if (jsContent.includes('PlayCanvas')) {
            frameworks.push('PlayCanvas');
        }
        if (jsContent.includes('WebGL') || jsContent.includes('gl.')) {
            frameworks.push('WebGL');
        }
        
        return frameworks;
    }

    async processStylesheet(asset) {
        try {
            const content = await fs.readFile(asset.localPath, 'utf8');
            
            // Extract font and image references from CSS
            const assetReferences = this.extractCSSAssetReferences(content);
            asset.referencedAssets = assetReferences;
            
            console.log(`🎨 Processed stylesheet: ${path.basename(asset.localPath)}`);
            
        } catch (error) {
            console.error(`Error processing stylesheet ${asset.url}:`, error);
        }
    }

    extractCSSAssetReferences(cssContent) {
        const references = [];
        
        // Extract URLs from CSS
        const urlPattern = /url\(['"`]?([^'"`\)]+)['"`]?\)/gi;
        let match;
        
        while ((match = urlPattern.exec(cssContent)) !== null) {
            references.push(match[1]);
        }
        
        return [...new Set(references)];
    }

    async generateAssetManifest(assets) {
        const manifest = {
            generatedAt: new Date().toISOString(),
            totalAssets: assets.length,
            assetTypes: {},
            assets: assets.map(asset => ({
                url: asset.url,
                type: asset.type,
                size: asset.size,
                downloaded: asset.downloaded,
                localPath: asset.localPath ? path.relative(this.outputDir, asset.localPath) : null,
                metadata: asset.metadata,
                frameworks: asset.frameworks,
                textureType: asset.textureType
            }))
        };
        
        // Count assets by type
        assets.forEach(asset => {
            manifest.assetTypes[asset.type] = (manifest.assetTypes[asset.type] || 0) + 1;
        });
        
        const manifestPath = path.join(this.outputDir, 'asset-manifest.json');
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        
        console.log('📋 Generated asset manifest');
    }

    async generateServiceWorker(assets) {
        const assetUrls = assets
            .filter(asset => asset.downloaded && asset.localPath)
            .map(asset => path.relative(this.outputDir, asset.localPath));
        
        const serviceWorkerContent = `
// ProCloner Generated Service Worker
const CACHE_NAME = 'procloner-site-v1';
const urlsToCache = ${JSON.stringify(['/', ...assetUrls], null, 2)};

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
`;
        
        const swPath = path.join(this.outputDir, 'sw.js');
        await fs.writeFile(swPath, serviceWorkerContent);
        
        console.log('⚙️  Generated service worker for offline functionality');
    }
}

module.exports = AssetHunter;
