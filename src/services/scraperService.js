const SerpApi = require('google-search-results-nodejs');
const { readEvents, saveEvents } = require('./databaseService');
const { scrapeAllWebsites } = require('./webScraperService');

// API Key fornecida pelo usuário
const API_KEY = "81bc9cb3c616192119614b3443dec5d664a906e1f4244cd713521feb42678e11";
const search = new SerpApi.GoogleSearch(API_KEY);

/**
 * Busca eventos em Recife usando a Google Events API via SerpApi.
 */
/**
 * Helper para buscar uma única página de eventos
 */
const fetchEventsPage = (offset) => {
    return new Promise((resolve, reject) => {
        const params = {
            engine: "google_events",
            q: "eventos em recife",
            hl: "pt",
            gl: "br",
            start: offset // Paginação (0, 10, 20...)
        };

        search.json(params, (data) => {
            if (data.error) return reject(data.error);
            resolve(data.events_results || []);
        });
    });
};

/**
 * Busca eventos em Recife usando a Google Events API via SerpApi.
 * Tenta buscar múltiplas páginas se não encontrar novos eventos de imediato.
 */
const scrapeEvents = async () => {
    console.log('🔄 Iniciando busca inteligente via Google Events API...');

    // 1. Carregar banco atual
    let currentDb = [];
    try {
        currentDb = await readEvents();
    } catch (err) {
        currentDb = [];
    }

    // 2. Calcular próximo ID
    let nextId = 1;
    if (currentDb.length > 0) {
        const ids = currentDb.map(e => parseInt(e.id, 10)).filter(n => !isNaN(n));
        if (ids.length > 0) nextId = Math.max(...ids) + 1;
    }

    let allNewEvents = [];
    let offset = 0;
    const MAX_PAGES = 3; // Limite de segurança para não gastar toda a API
    const TARGET_NEW_EVENTS = 5; // Tenta buscar até achar pelo menos 5 novos

    console.log(`🎯 Meta: Encontrar pelo menos ${TARGET_NEW_EVENTS} novos eventos.`);

    for (let page = 0; page < MAX_PAGES; page++) {
        if (allNewEvents.length >= TARGET_NEW_EVENTS) break;

        console.log(`🔎 Buscando página ${page + 1} (offset ${offset})...`);

        try {
            const eventsResults = await fetchEventsPage(offset);

            if (!eventsResults || eventsResults.length === 0) {
                console.log('⚠️ Fim dos resultados na API.');
                break;
            }

            // Processar resultados da página
            const pageEvents = [];
            eventsResults.forEach(item => {
                // Checa duplicidade com o banco JÁ EXISTENTE
                const isDuplicateInDb = currentDb.some(curr =>
                    curr.nome && item.title && curr.nome.toLowerCase() === item.title.toLowerCase()
                );

                // Checa duplicidade com o que JÁ ACHAMOS nesta execução
                const isDuplicateInCurrentBatch = allNewEvents.some(ne =>
                    ne.nome && item.title && ne.nome.toLowerCase() === item.title.toLowerCase()
                );

                if (!isDuplicateInDb && !isDuplicateInCurrentBatch) {
                    // Extração segura dos dados
                    const dateInfo = item.date ? item.date.when : "Data a confirmar";
                    const address = item.address ? item.address[0] : "Recife";
                    const link = item.link || "#";
                    const title = item.title || "Evento sem nome";
                    const description = item.description || "Sem descrição disponível.";

                    const today = new Date();
                    const day = String(today.getDate()).padStart(2, '0');
                    const month = String(today.getMonth() + 1).padStart(2, '0');
                    const year = today.getFullYear();
                    const fallbackDate = `${day}-${month}-${year}`;

                    pageEvents.push({
                        id: String(nextId++).padStart(3, '0'),
                        nome: title,
                        descricao: description.substring(0, 150) + (description.length > 150 ? '...' : ''),
                        data: fallbackDate,
                        local: address,
                        horario: dateInfo,
                        gratuito: false,
                        tipo: "Eventos Google",
                        link: link,
                        saved: false
                    });
                }
            });

            console.log(`   -> Encontrados ${pageEvents.length} eventos INÉDITOS nesta página.`);
            allNewEvents = [...allNewEvents, ...pageEvents];

            // Prepara para próxima página
            offset += 10;

        } catch (error) {
            console.error('Erro ao buscar página:', error);
            break; // Para se der erro
        }
    }

    // 4. Salvar tudo
    if (allNewEvents.length > 0) {
        const updatedList = [...currentDb, ...allNewEvents];
        await saveEvents(updatedList);
        console.log(`✅ SUCESSO: ${allNewEvents.length} novos eventos salvos no total.`);
    } else {
        console.log('zzz Nenhum evento novo encontrado após varredura do Google.');
    }

    // 5. Buscar também das plataformas de eventos (Sympla, Ticket, Ingresso)
    console.log('\n🌍 Agora buscando eventos das plataformas web...\n');
    try {
        const webEvents = await scrapeAllWebsites();
        
        // Converte eventos web para o mesmo formato
        const formattedWebEvents = webEvents.map((event, index) => {
            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const year = today.getFullYear();
            const fallbackDate = `${day}-${month}-${year}`;

            return {
                id: String(nextId++).padStart(3, '0'),
                nome: event.name || 'Evento sem nome',
                descricao: (event.location || 'Local não especificado'),
                data: event.date || fallbackDate,
                local: event.location || 'Recife',
                horario: event.date || 'Horário a confirmar',
                gratuito: false,
                tipo: "Plataforma Web",
                link: event.link || "#",
                saved: false
            };
        });

        // Deduplicar com eventos já salvos
        const uniqueWebEvents = formattedWebEvents.filter(webEvent =>
            !updatedList.some(existing =>
                existing.nome && webEvent.nome && 
                existing.nome.toLowerCase() === webEvent.nome.toLowerCase()
            )
        );

        if (uniqueWebEvents.length > 0) {
            const finalList = [...updatedList, ...uniqueWebEvents];
            await saveEvents(finalList);
            console.log(`✅ Adicionados ${uniqueWebEvents.length} eventos das plataformas web.`);
            return finalList;
        }

    } catch (error) {
        console.error('⚠️  Erro ao buscar das plataformas web:', error.message);
        console.log('Continuando com eventos do Google apenas...');
    }

    return allNewEvents.length > 0 ? [...currentDb, ...allNewEvents] : currentDb;
};

module.exports = { scrapeEvents };