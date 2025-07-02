const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const { logger } = require('./logger');

class PackageBuilder {
    constructor(outputDir) {
        this.outputDir = outputDir;
    }

    // Create necessary symlinks for common path mismatches
    async createPathMappingSymlinks() {
        try {
            logger.info('Creating path mapping symlinks', {
                component: 'PackageBuilder',
                outputDir: this.outputDir
            });

            const pathMappings = [
                { source: 'assets/image', target: 'img' },
                { source: 'assets/images', target: 'images' },
                { source: 'assets/stylesheet', target: 'css' },
                { source: 'assets/javascript', target: 'js' },
                { source: 'assets/font', target: 'fonts' },
                { source: 'assets/video', target: 'media' },
                { source: 'assets/audio', target: 'media' },
                { source: 'static/media', target: 'media' },
                { source: 'build/static', target: 'static' }
            ];

            let symlinksCreated = 0;

            for (const mapping of pathMappings) {
                const sourcePath = path.join(this.outputDir, mapping.source);
                const targetPath = path.join(this.outputDir, mapping.target);

                // Check if source directory exists and target doesn't
                if (await fs.pathExists(sourcePath) && !await fs.pathExists(targetPath)) {
                    try {
                        // Calculate relative path from target to source
                        const relativePath = path.relative(path.dirname(targetPath), sourcePath);
                        await fs.symlink(relativePath, targetPath, 'dir');
                        
                        symlinksCreated++;
                        logger.info('Created symlink for path mapping', {
                            component: 'PackageBuilder',
                            source: mapping.source,
                            target: mapping.target,
                            relativePath
                        });
                    } catch (symlinkError) {
                        // If symlink fails, try copying the directory instead
                        logger.debug('Symlink failed, attempting copy', {
                            component: 'PackageBuilder',
                            source: mapping.source,
                            target: mapping.target,
                            error: symlinkError.message
                        });
                        
                        try {
                            await fs.copy(sourcePath, targetPath);
                            logger.info('Created directory copy for path mapping', {
                                component: 'PackageBuilder',
                                source: mapping.source,
                                target: mapping.target
                            });
                            symlinksCreated++;
                        } catch (copyError) {
                            logger.warn('Failed to create path mapping', {
                                component: 'PackageBuilder',
                                source: mapping.source,
                                target: mapping.target,
                                symlinkError: symlinkError.message,
                                copyError: copyError.message
                            });
                        }
                    }
                }
            }

            // Auto-detect and create custom mappings based on HTML analysis
            await this.analyzeHtmlForPathMismatches();

            logger.info('Path mapping symlinks creation completed', {
                component: 'PackageBuilder',
                symlinksCreated
            });

            return symlinksCreated;
        } catch (error) {
            logger.error('Path mapping symlinks creation failed', {
                component: 'PackageBuilder',
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    // Analyze HTML files to detect potential path mismatches
    async analyzeHtmlForPathMismatches() {
        try {
            const htmlFiles = await this.findHtmlFiles();
            const pathReferences = new Set();

            for (const htmlFile of htmlFiles) {
                try {
                    const htmlContent = await fs.readFile(htmlFile, 'utf8');
                    const detectedPaths = this.extractImagePaths(htmlContent);
                    detectedPaths.forEach(p => pathReferences.add(p));
                } catch (error) {
                    logger.debug('Error analyzing HTML file for paths', {
                        component: 'PackageBuilder',
                        htmlFile,
                        error: error.message
                    });
                }
            }

            // Check for common mismatches
            const commonMismatches = [
                { pattern: /^\/img\//, actualDir: 'assets/image' },
                { pattern: /^\/images\//, actualDir: 'assets/image' },
                { pattern: /^\/css\//, actualDir: 'assets/stylesheet' },
                { pattern: /^\/js\//, actualDir: 'assets/javascript' },
                { pattern: /^\/fonts\//, actualDir: 'assets/font' },
                { pattern: /^\/media\//, actualDir: 'assets/video' },
                { pattern: /^\/static\//, actualDir: 'build/static' }
            ];

            for (const mismatch of commonMismatches) {
                const hasReferences = Array.from(pathReferences).some(path => mismatch.pattern.test(path));
                const actualPath = path.join(this.outputDir, mismatch.actualDir);
                const expectedPath = path.join(this.outputDir, mismatch.pattern.source.slice(2, -2)); // Remove /^ and $/

                if (hasReferences && await fs.pathExists(actualPath) && !await fs.pathExists(expectedPath)) {
                    try {
                        const relativePath = path.relative(path.dirname(expectedPath), actualPath);
                        await fs.symlink(relativePath, expectedPath, 'dir');
                        
                        logger.info('Created auto-detected symlink', {
                            component: 'PackageBuilder',
                            pattern: mismatch.pattern.source,
                            actualDir: mismatch.actualDir,
                            expectedPath: expectedPath.replace(this.outputDir, ''),
                            actualPath: actualPath.replace(this.outputDir, '')
                        });
                    } catch (error) {
                        logger.debug('Failed to create auto-detected symlink', {
                            component: 'PackageBuilder',
                            pattern: mismatch.pattern.source,
                            error: error.message
                        });
                    }
                }
            }
        } catch (error) {
            logger.debug('HTML path analysis failed', {
                component: 'PackageBuilder',
                error: error.message
            });
        }
    }

    // Extract image paths from HTML content
    extractImagePaths(htmlContent) {
        const imagePaths = new Set();
        
        // Common image path patterns
        const patterns = [
            /src=["']([^"']*\.(png|jpg|jpeg|gif|svg|webp)[^"']*)["']/gi,
            /href=["']([^"']*\.(png|jpg|jpeg|gif|svg|webp)[^"']*)["']/gi,
            /url\(['"]?([^'")]*\.(png|jpg|jpeg|gif|svg|webp)[^'")]*)/gi,
            /background-image:\s*url\(['"]?([^'")]*\.(png|jpg|jpeg|gif|svg|webp)[^'")]*)/gi
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(htmlContent)) !== null) {
                const imagePath = match[1];
                if (imagePath && imagePath.startsWith('/')) {
                    imagePaths.add(imagePath);
                }
            }
        });

        return Array.from(imagePaths);
    }

    // Find all HTML files in the output directory
    async findHtmlFiles() {
        const htmlFiles = [];
        
        try {
            const files = await fs.readdir(this.outputDir);
            
            for (const file of files) {
                const fullPath = path.join(this.outputDir, file);
                const stat = await fs.stat(fullPath);
                
                if (stat.isFile() && file.endsWith('.html')) {
                    htmlFiles.push(fullPath);
                }
            }
        } catch (error) {
            logger.debug('Error finding HTML files', {
                component: 'PackageBuilder',
                error: error.message
            });
        }

        return htmlFiles;
    }

    async createZip() {
        try {
            // Validate output directory exists
            if (!await fs.pathExists(this.outputDir)) {
                throw new Error(`Output directory does not exist: ${this.outputDir}`);
            }

            // Create ZIP file path
            const tempDir = path.dirname(this.outputDir);
            await fs.ensureDir(tempDir);
            const zipPath = path.join(tempDir, `cloned-site-${Date.now()}.zip`);
            
            logger.info('Starting ZIP creation', {
                component: 'PackageBuilder',
                outputDir: this.outputDir,
                zipPath
            });

            return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', {
                zlib: { level: 9 } // Maximum compression
            });

            output.on('close', () => {
                logger.info('ZIP package created', {
                    component: 'PackageBuilder',
                    zipPath,
                    sizeMB: (archive.pointer() / 1024 / 1024).toFixed(2)
                });
                resolve(zipPath);
            });

            archive.on('error', (err) => {
                logger.error('ZIP creation failed', {
                    component: 'PackageBuilder',
                    error: err.message,
                    outputDir: this.outputDir
                });
                reject(err);
            });

            archive.pipe(output);
            
            // Add all files from output directory
            archive.directory(this.outputDir, false);
            
            // Add package.json for easy setup
            const packageJson = this.generatePackageJson();
            archive.append(JSON.stringify(packageJson, null, 2), { name: 'package.json' });
            
            // Add README
            const readme = this.generateReadme();
            archive.append(readme, { name: 'README.md' });
            
            archive.finalize();
            });
        } catch (error) {
            logger.error('ZIP creation setup failed', {
                component: 'PackageBuilder',
                error: error.message,
                outputDir: this.outputDir
            });
            throw error;
        }
    }

    generatePackageJson() {
        return {
            name: "cloned-website",
            version: "1.0.0",
            description: "Website cloned with ProCloner",
            scripts: {
                start: "python3 -m http.server 8080",
                serve: "npx serve .",
                dev: "npx live-server"
            },
            devDependencies: {
                "live-server": "^1.2.2",
                "serve": "^14.2.1"
            },
            keywords: ["cloned-website", "procloner"],
            author: "ProCloner",
            license: "MIT"
        };
    }

    generateReadme() {
        return `# Cloned Website

This website was cloned using **ProCloner** - an advanced website cloning tool.

## 🚀 Quick Start

### Option 1: Python Server (Recommended)
\`\`\`bash
python3 -m http.server 8080
\`\`\`
Then open: http://localhost:8080

### Option 2: Node.js Serve
\`\`\`bash
npm install
npm run serve
\`\`\`

### Option 3: Live Server (Development)
\`\`\`bash
npm install
npm run dev
\`\`\`

## 📁 Project Structure

- \`index.html\` - Main HTML file
- \`assets/\` - All website assets organized by type
  - \`3d-model/\` - 3D models (.glb, .gltf)
  - \`texture/\` - Texture files
  - \`image/\` - Images
  - \`video/\` - Video files
  - \`audio/\` - Audio files
  - \`javascript/\` - JavaScript files
  - \`stylesheet/\` - CSS files
  - \`font/\` - Font files
- \`asset-manifest.json\` - Complete asset inventory
- \`sw.js\` - Service worker for offline functionality

## 🔧 Features

- ✅ **Offline Ready**: Service worker included for offline functionality
- ✅ **3D Assets**: All WebGL/Three.js content preserved
- ✅ **Optimized**: Images optimized for web delivery
- ✅ **Complete**: All dependencies included

## 📊 Asset Summary

Check \`asset-manifest.json\` for detailed information about all cloned assets.

## 🛠️ Troubleshooting

### CORS Issues
If you encounter CORS errors, make sure to serve the files through a web server (not file:// protocol).

### Missing Assets
Check the browser console for any 404 errors and verify the asset paths in \`asset-manifest.json\`.

### 3D Content Not Loading
Ensure WebGL is enabled in your browser and try refreshing the page.

---

**Cloned with ❤️ using ProCloner**
`;
    }

    async createVSCodeProject() {
        // Create VS Code workspace configuration
        const vscodeDir = path.join(this.outputDir, '.vscode');
        await fs.ensureDir(vscodeDir);
        
        // Launch configuration
        const launchConfig = {
            version: "0.2.0",
            configurations: [
                {
                    name: "Launch with Live Server",
                    type: "node",
                    request: "launch",
                    program: "${workspaceFolder}/node_modules/.bin/live-server",
                    args: ["--port=8080", "--open=/"],
                    console: "integratedTerminal"
                }
            ]
        };
        
        await fs.writeFile(
            path.join(vscodeDir, 'launch.json'),
            JSON.stringify(launchConfig, null, 2)
        );
        
        // Settings
        const settings = {
            "liveServer.settings.port": 8080,
            "liveServer.settings.root": "/",
            "files.associations": {
                "*.glb": "binary",
                "*.gltf": "json"
            }
        };
        
        await fs.writeFile(
            path.join(vscodeDir, 'settings.json'),
            JSON.stringify(settings, null, 2)
        );
        
        // Extensions recommendations
        const extensions = {
            recommendations: [
                "ritwickdey.liveserver",
                "ms-vscode.vscode-json",
                "cesium.gltf-vscode"
            ]
        };
        
        await fs.writeFile(
            path.join(vscodeDir, 'extensions.json'),
            JSON.stringify(extensions, null, 2)
        );
        
        logger.info('VS Code project configuration created', { component: 'PackageBuilder' });
    }

    async createDockerConfig() {
        // Dockerfile
        const dockerfile = `FROM nginx:alpine

# Copy website files
COPY . /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
`;

        // Nginx configuration
        const nginxConfig = `events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    
    # Add MIME types for 3D assets
    location ~* \\.(glb|gltf)$ {
        add_header Content-Type application/octet-stream;
    }
    
    location ~* \\.(exr)$ {
        add_header Content-Type image/x-exr;
    }
    
    server {
        listen 80;
        server_name localhost;
        
        location / {
            root /usr/share/nginx/html;
            index index.html;
            try_files $uri $uri/ /index.html;
        }
        
        # Enable gzip compression
        gzip on;
        gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    }
}
`;

        await fs.writeFile(path.join(this.outputDir, 'Dockerfile'), dockerfile);
        await fs.writeFile(path.join(this.outputDir, 'nginx.conf'), nginxConfig);
        
        // Docker Compose
        const dockerCompose = `version: '3.8'

services:
  website:
    build: .
    ports:
      - "8080:80"
    volumes:
      - .:/usr/share/nginx/html:ro
`;

        await fs.writeFile(path.join(this.outputDir, 'docker-compose.yml'), dockerCompose);
        
        logger.info('Docker configuration created', { component: 'PackageBuilder' });
    }

    async createNetlifyConfig() {
        
        await fs.writeFile(
            path.join(this.outputDir, 'netlify.toml'),
            `# Netlify configuration for cloned website

[build]
  publish = "."

[[headers]]
  for = "*.glb"
  [headers.values]
    Content-Type = "application/octet-stream"

[[headers]]
  for = "*.gltf"
  [headers.values]
    Content-Type = "application/json"

[[headers]]
  for = "*.exr"
  [headers.values]
    Content-Type = "image/x-exr"
`
        );
        
        logger.info('Netlify configuration created', { component: 'PackageBuilder' });
    }
}

module.exports = PackageBuilder;
