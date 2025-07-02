const SmartCrawler = require('./server/crawlers/SmartCrawler');
const path = require('path');
const fs = require('fs-extra');

async function testSimpleClone() {
    console.log('🧪 Testing simple clone functionality...');
    
    const outputDir = path.join(__dirname, 'test-output');
    await fs.ensureDir(outputDir);
    
    const crawler = new SmartCrawler({
        outputDir,
        timeout: 60000, // 1 minute timeout for testing
        onProgress: (progress) => {
            console.log(`📊 Progress: ${Math.round(progress)}%`);
        },
        onAssetFound: (asset) => {
            console.log(`🔍 Found: ${asset.type} - ${asset.url}`);
        }
    });
    
    try {
        // Test with a simple, fast website
        const result = await crawler.crawl('https://example.com');
        
        console.log('✅ Test Results:');
        console.log(`   Success: ${result.success}`);
        console.log(`   Assets Found: ${result.assetsFound}`);
        console.log(`   Pages Visited: ${result.pagesVisited}`);
        
        if (result.downloadStats) {
            console.log(`   Downloaded: ${result.downloadStats.downloaded}/${result.downloadStats.total}`);
            console.log(`   Failed: ${result.downloadStats.failed}`);
        }
        
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        // Cleanup
        await fs.remove(outputDir);
        console.log('🧹 Test cleanup completed');
    }
}

// Run the test
testSimpleClone().catch(console.error);
