const puppeteer = require('puppeteer');

/**
 * Web Scraper para plataformas de eventos usando Puppeteer
 */

// Configuração de timeout
const TIMEOUT = 30000;
const VIEWPORT = { width: 1280, height: 720 };

/**
 * Busca eventos no Sympla em Recife
 */
const scrapeSymplaEvents = async () => {
    console.log('🎟️  Buscando eventos no Sympla...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);
    page.setViewport(VIEWPORT);

    const events = [];
    try {
        // Url com filtro para Recife
        const url = 'https://www.sympla.com.br/s?q=recife&category=all';
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Extrai dados dos eventos
        const eventData = await page.evaluate(() => {
            const items = document.querySelectorAll('[data-testid="event-card"]');
            const events = [];
            
            items.forEach(item => {
                const name = item.querySelector('[data-testid="event-card-title"]')?.textContent || '';
                const date = item.querySelector('[data-testid="event-card-date"]')?.textContent || '';
                const location = item.querySelector('[data-testid="event-card-location"]')?.textContent || '';
                const link = item.querySelector('a')?.href || '';
                const image = item.querySelector('img')?.src || '';
                
                if (name && link) {
                    events.push({ name, date, location, link, image });
                }
            });
            
            return events;
        });

        console.log(`   ✓ Encontrados ${eventData.length} eventos no Sympla`);
        events.push(...eventData);

    } catch (error) {
        console.error('❌ Erro ao buscar Sympla:', error.message);
    } finally {
        await browser.close();
    }

    return events;
};

/**
 * Busca eventos no Ticket em Recife
 */
const scrapeTicketEvents = async () => {
    console.log('🎟️  Buscando eventos no Ticket...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);
    page.setViewport(VIEWPORT);

    const events = [];
    try {
        const url = 'https://www.ticketsbr.com.br/busca?q=recife';
        await page.goto(url, { waitUntil: 'networkidle2' });

        const eventData = await page.evaluate(() => {
            const items = document.querySelectorAll('.event-item, .event-card, [class*="event"]');
            const events = [];
            
            items.forEach(item => {
                const name = item.querySelector('h2, h3, [class*="title"]')?.textContent || '';
                const date = item.querySelector('[class*="date"], [class*="when"]')?.textContent || '';
                const location = item.querySelector('[class*="location"], [class*="local"]')?.textContent || '';
                const link = item.querySelector('a')?.href || '';
                
                if (name && link) {
                    events.push({ name, date, location, link });
                }
            });
            
            return events;
        });

        console.log(`   ✓ Encontrados ${eventData.length} eventos no Ticket`);
        events.push(...eventData);

    } catch (error) {
        console.error('❌ Erro ao buscar Ticket:', error.message);
    } finally {
        await browser.close();
    }

    return events;
};

/**
 * Busca eventos no Ingresso.com em Recife
 */
const scrapeIngressoEvents = async () => {
    console.log('🎟️  Buscando eventos no Ingresso...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);
    page.setViewport(VIEWPORT);

    const events = [];
    try {
        const url = 'https://www.ingresso.com/busca?q=recife';
        await page.goto(url, { waitUntil: 'networkidle2' });

        const eventData = await page.evaluate(() => {
            const items = document.querySelectorAll('.event, [class*="event-item"]');
            const events = [];
            
            items.forEach(item => {
                const name = item.querySelector('h2, h3, span[class*="title"]')?.textContent || '';
                const date = item.querySelector('[class*="date"], [class*="when"]')?.textContent || '';
                const location = item.querySelector('[class*="location"], [class*="place"]')?.textContent || '';
                const link = item.querySelector('a')?.href || '';
                
                if (name && link) {
                    events.push({ name, date, location, link });
                }
            });
            
            return events;
        });

        console.log(`   ✓ Encontrados ${eventData.length} eventos no Ingresso`);
        events.push(...eventData);

    } catch (error) {
        console.error('❌ Erro ao buscar Ingresso:', error.message);
    } finally {
        await browser.close();
    }

    return events;
};

/**
 * Executa todos os scrapers e consolida resultados
 */
const scrapeAllWebsites = async () => {
    console.log('🌐 Iniciando busca em plataformas de eventos...\n');
    
    const allEvents = [];
    
    try {
        // Executa scrapers em paralelo para ser mais rápido
        const [symplaEvents, ticketEvents, ingressoEvents] = await Promise.allSettled([
            scrapeSymplaEvents(),
            scrapeTicketEvents(),
            scrapeIngressoEvents()
        ]).then(results => 
            results.map(r => r.status === 'fulfilled' ? r.value : [])
        );

        allEvents.push(...symplaEvents, ...ticketEvents, ...ingressoEvents);
        
        console.log(`\n✅ Total de eventos coletados das plataformas: ${allEvents.length}`);
        
    } catch (error) {
        console.error('Erro geral ao buscar websites:', error.message);
    }

    return allEvents;
};

module.exports = {
    scrapeSymplaEvents,
    scrapeTicketEvents,
    scrapeIngressoEvents,
    scrapeAllWebsites
};
