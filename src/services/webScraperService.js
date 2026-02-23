const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');

const TIMEOUT = 120000;
const VIEWPORT = { width: 1366, height: 900 };
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const EVENT_KEYWORDS = ['evento', 'eventos', 'ingresso', 'show', 'festival', 'curso', 'palestra', 'teatro'];
let lastWebScrapeStats = { rawCount: 0, dedupCount: 0 };

// Lista parametrizavel de fontes para scraping.
const SCRAPER_SOURCES = [
    {
        key: 'sympla',
        label: 'Sympla',
        url: 'https://www.sympla.com.br/eventos/recife-pe',
        hostHints: ['sympla.com.br'],
        fallbackUrls: [
            'https://www.sympla.com.br/eventos?s=recife',
            'https://www.sympla.com.br/'
        ]
    }
    ,
    {
        key: 'ingresso',
        label: 'Ingresso.com',
        url: 'https://www.ingresso.com/eventos?city=recife',
        hostHints: ['ingresso.com'],
        fallbackUrls: [
            'https://www.ingresso.com/',
            'https://www.ingresso.com/eventos'
        ]
    }
    ,
    {
        key: 'recifeingressos',
        label: 'Recife Ingressos',
        url: 'https://www.recifeingressos.com/eventos',
        hostHints: ['recifeingressos.com'],
        fallbackUrls: [
            'https://www.recifeingressos.com/',
            'https://www.recifeingressos.com/eventos/'
        ]
    }
    ,
    {
        key: 'conecta-recife',
        label: 'Conecta Recife',
        url: 'https://conecta.recife.pe.gov.br/eventos',
        hostHints: ['conecta.recife.pe.gov.br'],
        fallbackUrls: [
            'https://conecta.recife.pe.gov.br/eventos/',
            'https://conecta.recife.pe.gov.br/'
        ]
    }
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchHtml = (url) => new Promise((resolve, reject) => {
    https.get(url, (res) => {
        let html = '';
        res.on('data', (chunk) => { html += chunk.toString(); });
        res.on('end', () => resolve(html));
    }).on('error', reject);
});

const launchBrowser = async () => puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

const resolveFinalUrl = async (initialUrl, maxRedirects = 8) => {
    let current = initialUrl;
    for (let i = 0; i < maxRedirects; i++) {
        const urlObj = new URL(current);
        const client = urlObj.protocol === 'http:' ? http : https;
        const response = await new Promise((resolve, reject) => {
            const req = client.request(
                current,
                { method: 'GET', headers: { 'User-Agent': USER_AGENT } },
                (res) => {
                    res.resume();
                    resolve(res);
                }
            );
            req.on('error', reject);
            req.end();
        });

        const status = response.statusCode || 0;
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location) {
            current = new URL(location, current).href;
            continue;
        }
        return current;
    }
    return current;
};

const extractEventsFromPage = async (page, hostHints = []) => {
    return page.evaluate((keywords, hints) => {
        const isLikelyEvent = (href, text) => {
            const haystack = `${href || ''} ${text || ''}`.toLowerCase();
            return keywords.some((k) => haystack.includes(k));
        };

        const hasHint = (href) => {
            if (!hints || hints.length === 0) return true;
            return hints.some((hint) => (href || '').toLowerCase().includes(hint.toLowerCase()));
        };

        const isLikelyEventLink = (href) => {
            const h = (href || '').toLowerCase();
            if (h.includes('/evento/') || h.includes('/event/')) return true;

            if (h.includes('recifeingressos.com')) {
                try {
                    const url = new URL(href);
                    const path = (url.pathname || '').replace(/^\/+|\/+$/g, '').toLowerCase();
                    if (!path || path.includes('/')) return false;
                    const blocked = new Set(['eventos', 'contato', 'login', 'cadastro', 'trocas-e-cancelamentos', 'politica-privacidade']);
                    return !blocked.has(path);
                } catch {
                    return false;
                }
            }
            return false;
        };

        const dateRegex = /(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{1,2}\s+de\s+[a-z.]+(?:\s+de\s+\d{4})?)/i;
        const locationRegex = /(recife[^|,.;\n]{0,80}|boa viagem[^|,.;\n]{0,80}|olinda[^|,.;\n]{0,80}|pe[^|,.;\n]{0,80})/i;

        const seen = new Set();
        const events = [];
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        anchors.forEach((a) => {
            const href = a.href || a.getAttribute('href') || '';
            if (!href || !href.startsWith('http')) return;
            if (!hasHint(href)) return;
            if (!isLikelyEventLink(href)) return;

            const ownText = (a.textContent || '').replace(/\s+/g, ' ').trim();
            const card = a.closest('article, li, .card, .event, .event-card, [class*="event"], [class*="card"], section, div') || a;
            const cardText = (card.innerText || '').replace(/\s+/g, ' ').trim();
            if (!isLikelyEvent(href, `${ownText} ${cardText}`)) return;

            const titleFromHeading = card.querySelector('h1, h2, h3, h4, [class*="title"]')?.textContent || '';
            const title = (titleFromHeading || ownText).replace(/\s+/g, ' ').trim();
            if (!title || title.length < 4) return;

            const key = `${title.toLowerCase()}|${href}`;
            if (seen.has(key)) return;
            seen.add(key);

            const date = (cardText.match(dateRegex) || [])[0] || '';
            const location = (cardText.match(locationRegex) || [])[0] || '';
            events.push({ name: title, date, location, link: href });
        });

        return events.slice(0, 300);
    }, EVENT_KEYWORDS, hostHints);
};

const expandDynamicContent = async (page, label) => {
    const maxRounds = 50;
    let stableRounds = 0;
    let previousAnchors = 0;

    for (let round = 1; round <= maxRounds; round++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(1200);
        await page.evaluate(() => {
            const targets = Array.from(document.querySelectorAll('button, a[role="button"], .btn, [class*="load"], [class*="more"]'));
            const wanted = ['carregar mais', 'ver mais', 'mostrar mais', 'mais eventos', 'load more', 'show more'];
            for (const el of targets) {
                const text = (el.textContent || '').toLowerCase().trim();
                if (wanted.some((w) => text.includes(w))) el.click();
            }
        }).catch(() => null);
        await delay(900);

        const anchorsCount = await page.evaluate(() => document.querySelectorAll('a[href]').length);
        console.log(`[SCRAPER] ${label}: round ${round}/${maxRounds}, anchors=${anchorsCount}`);

        stableRounds = anchorsCount === previousAnchors ? stableRounds + 1 : 0;
        previousAnchors = anchorsCount;
        if (stableRounds >= 3) {
            console.log(`[SCRAPER] ${label}: conteudo estabilizado, encerrando em ${round}/${maxRounds}.`);
            break;
        }
    }
};

const collectFromUrl = async (label, url, hostHints = []) => {
    const events = [];
    let browser = null;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage();
        page.setDefaultTimeout(TIMEOUT);
        page.setViewport(VIEWPORT);
        await page.setUserAgent(USER_AGENT);

        console.log(`[SCRAPER] Buscando em ${label}: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('a[href]', { timeout: 10000 }).catch(() => null);
        await expandDynamicContent(page, label);

        const extracted = await extractEventsFromPage(page, hostHints);
        console.log(`[SCRAPER] ${label}: ${extracted.length} itens brutos`);
        events.push(...extracted);
    } catch (error) {
        console.error(`[SCRAPER] Erro em ${label}:`, error.message);
    } finally {
        if (browser) await browser.close().catch(() => null);
    }
    return events;
};

const collectConectaPaginated = async (source) => {
    const urls = new Set([source.url]);
    try {
        const html = await fetchHtml(source.url);
        const matches = [...html.matchAll(/href=["']([^"']*\/eventos\?p=\d+[^"']*)["']/gi)].map((m) => m[1]);
        matches.forEach((href) => {
            const decoded = href.replace(/&amp;/g, '&');
            try {
                urls.add(new URL(decoded, source.url).href);
            } catch {}
        });
    } catch (error) {
        console.error('[SCRAPER] Erro ao descobrir paginacao do Conecta:', error.message);
    }

    const sortedUrls = Array.from(urls).sort((a, b) => {
        const pa = Number((new URL(a)).searchParams.get('p') || 1);
        const pb = Number((new URL(b)).searchParams.get('p') || 1);
        return pa - pb;
    });

    const merged = [];
    for (const pageUrl of sortedUrls) {
        const pageIndex = Number((new URL(pageUrl)).searchParams.get('p') || 1);
        const label = `${source.label} p=${pageIndex}`;
        const pageEvents = await collectFromUrl(label, pageUrl, source.hostHints);
        merged.push(...pageEvents);
    }

    return merged;
};

const extractEventStructuredData = async (page) => {
    return page.evaluate(() => {
        const normalize = (value) => (value || '').toString().replace(/\s+/g, ' ').trim();

        const pickLocation = (locationObj) => {
            if (!locationObj) return '';
            if (typeof locationObj === 'string') return normalize(locationObj);
            const name = normalize(locationObj.name);
            const address = locationObj.address || {};
            const city = normalize(address.addressLocality || address.addressRegion || '');
            const street = normalize(address.streetAddress || '');
            return normalize([name, street, city].filter(Boolean).join(' - '));
        };

        const candidates = [];
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        for (const script of scripts) {
            try {
                const raw = script.textContent || '';
                if (!raw.trim()) continue;
                candidates.push(JSON.parse(raw));
            } catch {}
        }

        const flatten = (node) => {
            if (!node) return [];
            if (Array.isArray(node)) return node.flatMap(flatten);
            if (typeof node === 'object' && Array.isArray(node['@graph'])) return flatten(node['@graph']);
            return [node];
        };

        const nodes = candidates.flatMap(flatten);
        const eventNode = nodes.find((node) => {
            const type = node?.['@type'];
            if (!type) return false;
            if (Array.isArray(type)) return type.some((t) => String(t).toLowerCase() === 'event');
            return String(type).toLowerCase() === 'event';
        });

        const titleCandidates = [
            normalize(document.querySelector('h1')?.textContent),
            normalize(document.querySelector('h2')?.textContent),
            normalize(document.querySelector('h3[title]')?.getAttribute('title')),
            normalize(document.querySelector('h3')?.textContent),
            normalize(document.querySelector('.breadcrumb-item.active')?.textContent),
            normalize(document.querySelector('a.botao[title]')?.getAttribute('title')),
            normalize(document.querySelector('meta[property="og:title"]')?.getAttribute('content')),
            normalize(document.title)
        ].filter(Boolean);

        const titleFallback = titleCandidates.find((title) => !title.toLowerCase().includes('portal de servicos')) || titleCandidates[0] || '';
        const pageText = normalize(document.body?.innerText || '');
        const dateTextMatch =
            pageText.match(/\b\d{1,2}\s*[a-zç]{3}\s*[-–—]\s*\d{2}:\d{2}h[\s\S]{0,40}?\d{1,2}\s*[a-zç]{3}\s*[-–—]\s*\d{2}:\d{2}h\b/i) ||
            pageText.match(/\b\d{1,2}\s*[a-zç]{3}\b/i) ||
            pageText.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/) ||
            pageText.match(/\b\d{1,2}\s+de\s+[a-zç.]+(?:\s+de\s+\d{4})?\b/i);
        const extractedDate = normalize(dateTextMatch ? dateTextMatch[0] : '');
        const outboundLink = normalize(document.querySelector('a.botao.btn.btn-primary[href]')?.getAttribute('href'));

        if (!eventNode) {
            return { title: titleFallback, startDate: extractedDate, location: '', outboundLink };
        }

        return {
            title: normalize(eventNode.name || titleFallback),
            startDate: normalize(eventNode.startDate || extractedDate),
            location: pickLocation(eventNode.location),
            outboundLink
        };
    });
};

const enrichEventsWithDetails = async (events) => {
    if (!events || events.length === 0) return events;

    let browser = null;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage();
        page.setDefaultTimeout(TIMEOUT);
        page.setViewport(VIEWPORT);
        await page.setUserAgent(USER_AGENT);

        for (const item of events) {
            if (!item?.link || !item.link.startsWith('http')) continue;
            if (item.skipEnrich) continue;
            if (!item.originalLink) item.originalLink = item.link;

            try {
                await page.goto(item.link, { waitUntil: 'domcontentloaded' });
                const detail = await extractEventStructuredData(page);

                if (detail?.title && detail.title.length >= 4) item.name = detail.title;
                if (detail?.startDate) item.date = detail.startDate;
                if (detail?.location) item.location = detail.location;

                if (item.originalLink.includes('conecta.recife.pe.gov.br') && detail?.outboundLink) {
                    const outboundUrl = new URL(detail.outboundLink, item.originalLink).href;
                    try {
                        item.link = await resolveFinalUrl(outboundUrl);
                    } catch {
                        item.link = outboundUrl;
                    }
                } else {
                    item.link = item.originalLink;
                }
            } catch (error) {
                console.error(`[SCRAPER] Falha ao enriquecer ${item.link}:`, error.message);
            }
        }
    } catch (error) {
        console.error('[SCRAPER] Erro ao iniciar enriquecimento de detalhes:', error.message);
    } finally {
        if (browser) await browser.close().catch(() => null);
    }

    return events;
};

const collectSource = async (source) => {
    const primary = source.key === 'conecta-recife'
        ? await collectConectaPaginated(source)
        : await collectFromUrl(source.label, source.url, source.hostHints);

    if (primary.length > 0) return primary;

    if (!source.fallbackUrls || source.fallbackUrls.length === 0) return primary;
    for (const fallbackUrl of source.fallbackUrls) {
        const fallbackLabel = `${source.label} (fallback)`;
        const fallbackEvents = await collectFromUrl(fallbackLabel, fallbackUrl, source.hostHints);
        if (fallbackEvents.length > 0) return fallbackEvents;
    }

    return [];
};

const scrapeAllWebsites = async () => {
    console.log('[SCRAPER] Iniciando busca em plataformas web...');

    const merged = [];
    for (const source of SCRAPER_SOURCES) {
        try {
            const result = await collectSource(source);
            merged.push(...(result || []));
        } catch (error) {
            console.error(`[SCRAPER] Falha em ${source.label}:`, error?.message || String(error));
        }
    }

    const dedupByLink = new Map();
    merged.forEach((event) => {
        if (!event || !event.link) return;
        if (!dedupByLink.has(event.link)) dedupByLink.set(event.link, event);
    });

    const finalEvents = Array.from(dedupByLink.values());
    await enrichEventsWithDetails(finalEvents);
    lastWebScrapeStats = { rawCount: merged.length, dedupCount: finalEvents.length };

    console.log(`[SCRAPER] Total bruto coletado: ${lastWebScrapeStats.rawCount}`);
    console.log(`[SCRAPER] Total coletado (deduplicado por link): ${finalEvents.length}`);
    return finalEvents;
};

const getLastWebScrapeStats = () => lastWebScrapeStats;

module.exports = {
    SCRAPER_SOURCES,
    scrapeAllWebsites,
    getLastWebScrapeStats
};
