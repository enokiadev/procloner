# 🚀 ProCloner

**Advanced Website Cloning Tool with Authentication & Analytics**

ProCloner is a next-generation website cloning tool that goes beyond traditional crawlers. It features Google OAuth authentication, admin analytics, and intelligently discovers modern web applications including SPAs, 3D sites, and dynamic content.

## ✨ Features

- **🔐 Google OAuth Authentication**: Secure user login and session management
- **📊 Admin Dashboard**: Usage analytics and monitoring for administrators
- **🧠 Smart Asset Discovery**: Automatically detects 3D models, textures, videos, and dynamic assets
- **⚡ SPA Support**: Handles React, Vue, Angular applications with client-side routing
- **🎮 3D Content**: Full support for WebGL, Three.js, and glTF assets
- **📱 Modern UI**: Beautiful, responsive interface with real-time progress
- **🔄 Session Recovery**: Resume interrupted cloning sessions
- **📦 Multiple Exports**: ZIP downloads with proper asset organization

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development
- **Tailwind CSS** for styling
- **Framer Motion** for animations
- **React Query** for state management
- **Lucide React** for icons

### Backend
- **Node.js** with Express
- **Puppeteer** for browser automation
- **Playwright** for cross-browser support
- **Crawlee** for intelligent crawling
- **Sharp** for image processing
- **WebSocket** for real-time updates

### Core Engine
- **Smart Crawler**: Executes JavaScript to discover dynamic assets
- **Asset Hunter**: Specialized detection for 3D models, textures, media
- **Dependency Resolver**: Rebuilds import maps and module dependencies
- **Package Builder**: Generates deployable projects

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/your-username/procloner.git
cd procloner

# Install dependencies
npm run setup

# Start development server
npm run dev
```

## 📖 Usage

1. **Enter URL**: Paste the website URL you want to clone
2. **Configure Options**: Select crawling depth, asset types, export format
3. **Start Cloning**: Watch real-time progress as assets are discovered
4. **Preview & Download**: Preview the cloned site and download as ZIP or deploy

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│           React Frontend                │
│     (Modern UI + Real-time Updates)     │
└─────────────────┬───────────────────────┘
                  │ WebSocket + REST API
┌─────────────────▼───────────────────────┐
│         Express Backend                 │
│     (Orchestration + File Handling)     │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│        Crawling Engine                  │
│                                         │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │  Puppeteer  │  │   Playwright    │   │
│  │ (Chrome)    │  │ (Multi-browser) │   │
│  └─────────────┘  └─────────────────┘   │
│                                         │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │Asset Hunter │  │ Dependency      │   │
│  │(3D/Media)   │  │ Resolver        │   │
│  └─────────────┘  └─────────────────┘   │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│        Output Generator                 │
│  ZIP │ GitHub │ VS Code │ Docker        │
└─────────────────────────────────────────┘
```

## 🎯 Key Innovations

- **Runtime Asset Discovery**: Executes JavaScript to find dynamically loaded content
- **3D Asset Intelligence**: Specialized detection for glTF, textures, shaders
- **Modern Web App Support**: Handles SPAs with client-side routing
- **Smart Dependency Resolution**: Rebuilds module imports and asset references
- **Multiple Deployment Options**: Ready-to-use project formats

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

---

**Built with ❤️ for the modern web**
