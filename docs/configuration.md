# ProCloner Configuration Guide

## Dynamic Port Configuration

ProCloner now automatically detects and configures the correct API and WebSocket URLs based on the current environment, eliminating the need for hardcoded ports.

## How It Works

### 1. Automatic Detection
The client automatically detects the correct server port based on:
- Current client port (e.g., 5173 for Vite dev server)
- Environment variables
- Fallback logic for production deployments

### 2. Environment Variables

#### Client-side (Vite)
```bash
# .env.development
VITE_API_PORT=3002
VITE_DEV_MODE=true

# .env.production  
VITE_API_BASE_URL=/api
VITE_WS_URL=wss://your-domain.com
VITE_DEV_MODE=false
```

#### Server-side
```bash
# .env
API_PORT=3002
NODE_ENV=development
CLIENT_PORT=5173
```

### 3. Port Detection Logic

| Client Port | Detected API Port | Use Case |
|-------------|------------------|----------|
| 5173        | 3002            | Vite dev server |
| 3000        | 3001            | Create React App |
| 80/443      | Same port       | Production |
| Other       | Port + 1        | Custom setup |

## Configuration Files

### Root Level
- `.env` - Main environment configuration
- `.env.local` - Local overrides (git-ignored)

### Client Level  
- `client/.env` - Default client config
- `client/.env.development` - Development overrides
- `client/.env.production` - Production overrides

### Server Level
- Uses root `.env` file
- Supports `PORT` and `API_PORT` environment variables

## Usage Examples

### Development
```bash
# Start with default ports (client: 5173, server: 3002)
npm run dev

# Start with custom ports
API_PORT=4000 CLIENT_PORT=3000 npm run dev
```

### Production
```bash
# Set production environment variables
export VITE_API_BASE_URL=https://api.yoursite.com
export VITE_WS_URL=wss://api.yoursite.com
npm run build
```

### Docker
```dockerfile
ENV API_PORT=3002
ENV CLIENT_PORT=5173
ENV NODE_ENV=production
```

## Benefits

1. **No More Hardcoded URLs**: Automatically adapts to any port configuration
2. **Environment Aware**: Different configs for dev/staging/production
3. **Easy Deployment**: Works out-of-the-box in most hosting environments
4. **Flexible**: Override any setting with environment variables
5. **Future Proof**: Easily add new environments or configurations

## Troubleshooting

### WebSocket Connection Issues
1. Check browser console for configuration logs
2. Verify API server is running on expected port
3. Check firewall/proxy settings for WebSocket support

### API Connection Issues  
1. Verify `/api/health` endpoint responds
2. Check CORS configuration
3. Ensure proxy settings in vite.config.ts match server port

### Environment Variables Not Loading
1. Ensure variables are prefixed with `VITE_` for client-side access
2. Restart development server after changing .env files
3. Check that .env files are in correct locations
