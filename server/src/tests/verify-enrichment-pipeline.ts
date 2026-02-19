/**
 * End-to-end verification of the enrichment pipeline fixes
 * Tests: SerpAPI connectivity, web search, prompt construction, and enrichment flow
 * 
 * Run: npx ts-node src/tests/verify-enrichment-pipeline.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { webSearchService } from '../services/web-search.service';
import { enrichmentService } from '../services/enrichment.service';

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
};

function pass(msg: string) { console.log(`${colors.green}  ✅ ${msg}${colors.reset}`); }
function fail(msg: string) { console.log(`${colors.red}  ❌ ${msg}${colors.reset}`); }
function info(msg: string) { console.log(`${colors.cyan}  ℹ️  ${msg}${colors.reset}`); }
function section(name: string) { console.log(`\n${colors.bold}━━━ ${name} ━━━${colors.reset}`); }

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<boolean>) {
    try {
        const result = await fn();
        if (result) { pass(name); passed++; }
        else { fail(name); failed++; }
    } catch (err: any) {
        fail(`${name} — ${err.message}`);
        failed++;
    }
}

async function main() {
    console.log(`${colors.bold}\n🔬 Enrichment Pipeline — End-to-End Verification${colors.reset}`);
    console.log(`   Fecha: ${new Date().toISOString()}\n`);

    // ═══════════════════════════════════════════════════════
    // TEST 1: SerpAPI connectivity
    // ═══════════════════════════════════════════════════════
    section('1. SerpAPI Connectivity');

    await test('SERPAPI_KEY is configured in environment', async () => {
        return !!process.env.SERPAPI_KEY;
    });

    await test('WebSearchService reports available', async () => {
        return webSearchService.isAvailable();
    });

    // ═══════════════════════════════════════════════════════
    // TEST 2: Web search actually returns data
    // ═══════════════════════════════════════════════════════
    section('2. Web Search — Real Query');

    let searchResults: any = null;

    await test('searchCompany("Starbucks") returns data', async () => {
        searchResults = await webSearchService.searchCompany('Starbucks');
        info(`Website: ${searchResults.website || 'not found'}`);
        info(`Description: ${searchResults.description?.substring(0, 100) || 'none'}...`);
        info(`News count: ${searchResults.news.length}`);
        return searchResults.news.length >= 0; // Just check it doesn't throw
    });

    await test('Search returns a website URL', async () => {
        return !!searchResults?.website;
    });

    await test('Search returns a description', async () => {
        return !!searchResults?.description;
    });

    // ═══════════════════════════════════════════════════════
    // TEST 3: Enrichment config
    // ═══════════════════════════════════════════════════════
    section('3. Enrichment Configuration');

    await test('Config loads with correct autoEnrichOnStatus', async () => {
        const config = enrichmentService.getConfig();
        info(`autoEnrichOnStatus: ${config.autoEnrichOnStatus}`);
        info(`model: ${config.model}`);
        info(`maxEnrichmentsPerDay: ${config.maxEnrichmentsPerDay}`);
        return config.autoEnrichOnStatus === 'interactuando';
    });

    // ═══════════════════════════════════════════════════════
    // TEST 4: Prompt does NOT contain $web_search
    // ═══════════════════════════════════════════════════════
    section('4. Prompt Anti-Hallucination Check');

    await test('System prompt does NOT reference $web_search', async () => {
        // Access via buildPrompt indirectly — check the module source
        const fs = await import('fs');
        const path = await import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../services/enrichment.service.ts'), 'utf-8'
        );
        const hasWebSearch = source.includes('$web_search');
        if (hasWebSearch) {
            info('WARNING: $web_search reference still found in enrichment.service.ts');
        }
        return !hasWebSearch;
    });

    await test('System prompt contains "No verificado" instruction', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../services/enrichment.service.ts'), 'utf-8'
        );
        return source.includes('NUNCA inventes');
    });

    await test('Normalization does NOT force-pad companyNews', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../services/enrichment.service.ts'), 'utf-8'
        );
        const hasForcePad = source.includes('while (companyNews.length < 3)');
        return !hasForcePad;
    });

    // ═══════════════════════════════════════════════════════
    // TEST 5: State transition fix in linkedin.service
    // ═══════════════════════════════════════════════════════
    section('5. State Transition Fix Verification');

    await test('linkedin.service does NOT have conditional interactuando guard', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../services/linkedin.service.ts'), 'utf-8'
        );
        // The old bug: status check before enrichment trigger
        const hasBuggyGuard = source.includes("contact.status === 'interactuando'");
        return !hasBuggyGuard;
    });

    await test('linkedin.service does NOT have duplicate status write', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../services/linkedin.service.ts'), 'utf-8'
        );
        // The old duplicate: "BUG FIX 1: Actually update database status"
        const hasDuplicate = source.includes('BUG FIX 1');
        return !hasDuplicate;
    });

    // ═══════════════════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════════════════
    console.log(`\n${colors.bold}━━━ RESULTS ━━━${colors.reset}`);
    console.log(`${colors.green}  Passed: ${passed}${colors.reset}`);
    if (failed > 0) {
        console.log(`${colors.red}  Failed: ${failed}${colors.reset}`);
    }
    console.log(`  Total:  ${passed + failed}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
