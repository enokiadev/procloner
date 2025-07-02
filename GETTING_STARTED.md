# 🚀 ProCloner - Getting Started Guide

## Quick Start

### 1. Install Dependencies
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client && npm install && cd ..
```

### 2. Start Development Server
```bash
# Start both backend and frontend
npm run dev
```

This will start:
- Backend server on `http://localhost:3001`
- Frontend React app on `http://localhost:3000`

### 3. Open ProCloner
Navigate to `http://localhost:3000` in your browser to see the ProCloner interface.

## 🎯 How to Use ProCloner

### Basic Website Cloning
1. **Enter URL**: Paste any website URL in the input field
2. **Configure Options**: Expand "Advanced Options" to customize:
   - Crawl depth (1-5 levels)
   - Asset types to include
   - Export formats
   - Optimization settings
3. **Start Cloning**: Click "Start Cloning" button
4. **Monitor Progress**: Watch real-time progress with asset discovery
5. **Download Results**: Choose from multiple export options

### Supported Website Types
- ✅ **Static Websites**: Traditional HTML/CSS/JS sites
- ✅ **Single Page Applications**: React, Vue, Angular apps
- ✅ **3D Websites**: Three.js, WebGL, glTF content
- ✅ **Media-Rich Sites**: Videos, audio, high-res images
- ✅ **Modern Web Apps**: Progressive Web Apps (PWAs)

### Example URLs to Test
```
https://sponsorships.aramco.com    # 3D interactive site
https://threejs.org/examples/      # WebGL examples
https://bruno-simon.com            # Award-winning 3D portfolio
https://github.com                 # Complex SPA
```

## 🛠️ Advanced Features

### Asset Detection
ProCloner automatically detects and downloads:
- **3D Models**: .glb, .gltf files
- **Textures**: Environment maps, normal maps, diffuse textures
- **Media**: Videos (.mp4, .webm), Audio (.mp3, .wav)
- **Fonts**: Web fonts (.woff, .woff2, .ttf)
- **Images**: All formats including optimized versions

### Export Options
- **ZIP Archive**: Complete website package
- **VS Code Project**: Ready-to-edit development environment
- **Docker Container**: Containerized deployment
- **Netlify Deploy**: One-click hosting setup

### Real-time Features
- Live progress tracking
- Asset discovery notifications
- Error handling and recovery
- Session management

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3001
NODE_ENV=development
PUPPETEER_HEADLESS=true
MAX_CONCURRENT_CRAWLS=3
```

### Advanced Options
Edit `server/config.js` for advanced settings:
- Crawl timeouts
- Asset size limits
- Browser configurations
- Export templates

## 🐛 Troubleshooting

### Common Issues

**1. Puppeteer Installation Issues**
```bash
# macOS with Homebrew
brew install chromium
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=`which chromium`
```

**2. Memory Issues with Large Sites**
```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 server/index.js
```

**3. CORS Issues**
- Some sites block automated access
- Try using different user agents
- Consider using proxy settings

### Debug Mode
```bash
# Enable debug logging
DEBUG=procloner:* npm run dev
```

## 📊 Performance Tips

### For Large Websites
- Reduce crawl depth to 2-3 levels
- Disable image optimization for faster processing
- Use selective asset types
- Enable concurrent processing

### For 3D Sites
- Ensure sufficient memory (4GB+ recommended)
- Enable texture optimization
- Use environment map detection
- Monitor asset file sizes

## 🤝 Contributing

### Development Setup
```bash
# Clone repository
git clone https://github.com/your-username/procloner.git
cd procloner

# Install dependencies
npm run setup

# Start development
npm run dev
```

### Adding New Features
1. Backend crawlers: `server/crawlers/`
2. Frontend components: `client/src/components/`
3. Asset processors: `server/utils/`
4. Export formats: `server/utils/PackageBuilder.js`

## 📝 API Documentation

### REST Endpoints
- `POST /api/clone` - Start cloning process
- `GET /api/session/:id` - Get session status
- `GET /api/download/:id` - Download results

### WebSocket Events
- `status_update` - Progress updates
- `asset_found` - New asset discovered
- `error` - Error notifications

## 🌟 What's Next?

ProCloner is ready for production use! Key advantages over traditional tools:

- **Modern Web Support**: Handles SPAs and dynamic content
- **3D Asset Intelligence**: Specialized detection for WebGL/Three.js
- **Real-time Feedback**: Live progress and asset discovery
- **Multiple Export Formats**: Ready for any deployment scenario
- **Open Source**: Fully customizable and extensible

Ready to clone the modern web! 🚀
