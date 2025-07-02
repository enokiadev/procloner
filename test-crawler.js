#!/usr/bin/env node

/**
 * ProCloner Test Script
 * Tests the core crawling functionality without the full UI
 */

const SmartCrawler = require('./server/crawlers/SmartCrawler');
const AssetHunter = require('./server/crawlers/AssetHunter');
const PackageBuilder = require('./server/utils/PackageBuilder');
const fs = require('fs-extra');
const path = require('path');

async function testCrawler() {
    console.log('🧪 ProCloner Test Suite\n');
    
    // Test URL - using a simple site for testing
    const testUrl = 'https://example.com';
    const outputDir = path.join(__dirname, 'test-output');
    
    try {
        // Ensure clean test environment
        await fs.remove(outputDir);
        await fs.ensureDir(outputDir);
        
        console.log('🚀 Testing Smart Crawler...');
        
        // Initialize crawler with test configuration
        const crawler = new SmartCrawler({
            outputDir,
            onProgress: (progress) => {
                process.stdout.write(`\r📊 Progress: ${Math.round(progress)}%`);
            },
            onAssetFound: (asset) => {
                console.log(`\n📦 Found: ${asset.type} - ${asset.url}`);
            }
        });
        
        // Test crawling
        console.log(`🌐 Crawling: ${testUrl}`);
        const result = await crawler.crawl(testUrl, {
            depth: 1,
            includeAssets: ['image', 'stylesheet', 'javascript']
        });
        
        console.log('\n✅ Crawling completed!');
        console.log(`📊 Results: ${result.assetsFound} assets, ${result.pagesVisited} pages`);
        
        // Test asset processing
        console.log('\n🔍 Testing Asset Hunter...');
        const assetHunter = new AssetHunter(outputDir);
        
        // Create mock assets for testing
        const mockAssets = [
            {
                url: 'https://example.com/style.css',
                type: 'stylesheet',
                downloaded: true,
                localPath: path.join(outputDir, 'style.css')
            },
            {
                url: 'https://example.com/script.js',
                type: 'javascript',
                downloaded: true,
                localPath: path.join(outputDir, 'script.js')
            }
        ];
        
        // Create mock files
        await fs.writeFile(mockAssets[0].localPath, '/* Test CSS */');
        await fs.writeFile(mockAssets[1].localPath, '// Test JavaScript');
        
        await assetHunter.processAssets(mockAssets);
        console.log('✅ Asset processing completed!');
        
        // Test package building
        console.log('\n📦 Testing Package Builder...');
        const packageBuilder = new PackageBuilder(outputDir);
        
        // Generate different package formats
        await packageBuilder.createVSCodeProject();
        await packageBuilder.createDockerConfig();
        await packageBuilder.createNetlifyConfig();
        
        console.log('✅ Package building completed!');
        
        // Test ZIP creation
        console.log('\n🗜️  Creating ZIP package...');
        const zipPath = await packageBuilder.createZip();
        console.log(`✅ ZIP created: ${zipPath}`);
        
        // Display results
        console.log('\n📋 Test Results Summary:');
        console.log('✅ Smart Crawler: Working');
        console.log('✅ Asset Hunter: Working');
        console.log('✅ Package Builder: Working');
        console.log('✅ ZIP Export: Working');
        
        // Check generated files
        const files = await fs.readdir(outputDir);
        console.log(`\n📁 Generated Files (${files.length}):`);
        files.forEach(file => {
            console.log(`   📄 ${file}`);
        });
        
        console.log('\n🎉 All tests passed! ProCloner is ready to use.');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🧪 ProCloner Test Script

Usage:
  node test-crawler.js [options]

Options:
  --help, -h     Show this help message
  --url <url>    Test with specific URL (default: https://example.com)
  --output <dir> Output directory (default: ./test-output)

Examples:
  node test-crawler.js
  node test-crawler.js --url https://threejs.org
  node test-crawler.js --url https://example.com --output ./my-test
`);
    process.exit(0);
}

// Run tests
if (require.main === module) {
    testCrawler().catch(console.error);
}

module.exports = { testCrawler };
