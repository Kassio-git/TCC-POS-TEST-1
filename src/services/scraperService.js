// Cliente da SerpApi para consultar Google Events.
const SerpApi = require('google-search-results-nodejs');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
// Operacoes de leitura e escrita no CSV local.
const { readEvents, saveEvents } = require('./databaseService');
// Scrapers via Puppeteer (Sympla, Ticket e Ingresso).
const { scrapeAllWebsites, getLastWebScrapeStats } = require('./webScraperService');

// API Key utilizada para autenticar chamadas na SerpApi.
const API_KEY = "81bc9cb3c616192119614b3443dec5d664a906e1f4244cd713521feb42678e11";
// Instancia unica do cliente de busca.
const search = new SerpApi.GoogleSearch(API_KEY);
const AUDIT_CSV_PATH = path.join(__dirname, '../../data/auditoria.csv');
const SCRAPE_LOG_PATH = path.join(__dirname, '../../data/scrape_execucoes.log');

// Corrige textos com possivel mojibake (UTF-8 lido como Latin1).
const fixMojibake = (value) => {
    if (typeof value !== 'string' || value.length === 0) return value;

    const hasCorruptionHint = /�|Ã|Â|â[\u0080-\u00BF]/.test(value);
    if (!hasCorruptionHint) return value;

    try {
        const repaired = Buffer.from(value, 'latin1').toString('utf8');
        const replacementCountOriginal = (value.match(/�/g) || []).length;
        const replacementCountRepaired = (repaired.match(/�/g) || []).length;
        return replacementCountRepaired <= replacementCountOriginal ? repaired : value;
    } catch {
        return value;
    }
};

// Mapa de meses em portugues para conversao de texto para data.
const PT_MONTHS = {
    janeiro: 1,
    jan: 1,
    fevereiro: 2,
    fev: 2,
    marco: 3,
    mar: 3,
    abril: 4,
    abr: 4,
    maio: 5,
    mai: 5,
    junho: 6,
    jun: 6,
    julho: 7,
    jul: 7,
    agosto: 8,
    ago: 8,
    setembro: 9,
    set: 9,
    outubro: 10,
    out: 10,
    novembro: 11,
    nov: 11,
    dezembro: 12,
    dez: 12
};

// Normaliza uma data para 00:00:00 no fuso local.
const toStartOfDay = (value) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
};

// Formata Date para dd-mm-yyyy (formato usado no CSV).
const formatDdMmYyyy = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
};

// Remove acentos e normaliza texto para comparacoes robustas.
const normalizeText = (value) => {
    if (!value) return '';
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
};

// Filtra titulos que nao representam um evento especifico.
const isGenericTitle = (title) => {
    const normalized = normalizeText(title || '');
    if (!normalized) return true;

    const blockedPatterns = [
        'sympla - ingressos para eventos',
        'portal de servicos - evento'
    ];

    return blockedPatterns.some((pattern) => normalized.includes(pattern));
};

// Converte datas textuais em portugues (ex.: "21 de marco de 2026") para Date.
const parsePtMonthDate = (text, fallbackYear = new Date().getFullYear()) => {
    if (!text) return null;
    const normalized = normalizeText(text);
    const match = normalized.match(/(\d{1,2})\s+de\s+([a-z.]+)(?:\s+de\s+(\d{4}))?/);
    if (!match) return null;

    const day = Number(match[1]);
    const monthToken = match[2].replace(/\./g, '');
    const month = PT_MONTHS[monthToken];
    const year = match[3] ? Number(match[3]) : fallbackYear;

    if (!month) return null;
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : toStartOfDay(parsed);
};

// Converte formatos abreviados como "fev. 21" para Date.
const parsePtAbbrevMonthDay = (text, fallbackYear = new Date().getFullYear()) => {
    if (!text) return null;
    const normalized = normalizeText(text);
    const match = normalized.match(/([a-z.]+)\s+(\d{1,2})/);
    if (!match) return null;

    const monthToken = match[1].replace(/\./g, '');
    const month = PT_MONTHS[monthToken];
    const day = Number(match[2]);
    if (!month) return null;

    const parsed = new Date(fallbackYear, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : toStartOfDay(parsed);
};

// Converte formatos como "21 FEV" / "21 fev" para Date.
const parsePtDayMonthAbbrev = (text, fallbackYear = new Date().getFullYear()) => {
    if (!text) return null;
    const normalized = normalizeText(text);
    const match = normalized.match(/(\d{1,2})\s+([a-z.]{3,9})/);
    if (!match) return null;

    const day = Number(match[1]);
    const monthToken = match[2].replace(/\./g, '');
    const month = PT_MONTHS[monthToken];
    if (!month) return null;

    const parsed = new Date(fallbackYear, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : toStartOfDay(parsed);
};

// Converte formatos estruturados com validacao de ano para evitar parse incorreto (ex.: ano 2001).
const parseStructuredDate = (value, today) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const parsedIso = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`);
        if (!Number.isNaN(parsedIso.getTime())) return toStartOfDay(parsedIso);
    }

    const brMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (brMatch) {
        const parsedBr = new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
        if (!Number.isNaN(parsedBr.getTime())) return toStartOfDay(parsedBr);
    }

    const ptAbbrev = parsePtAbbrevMonthDay(raw, today.getFullYear());
    if (ptAbbrev) return ptAbbrev;

    const ptLong = parsePtMonthDate(raw, today.getFullYear());
    if (ptLong) return ptLong;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;

    const year = parsed.getFullYear();
    const minYear = today.getFullYear() - 1;
    const maxYear = today.getFullYear() + 2;
    if (year < minYear || year > maxYear) return null;

    return toStartOfDay(parsed);
};

// Extrai data a partir de um texto livre de data (usado nos scrapers web).
const parseDateFromText = (text, today, options = {}) => {
    const { assumeCurrentYearIfMissing = false } = options;
    if (!text || typeof text !== 'string') return null;
    const raw = text.trim();
    if (!raw) return null;

    const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const parsedIso = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`);
        if (!Number.isNaN(parsedIso.getTime())) return toStartOfDay(parsedIso);
    }

    const brMatch = raw.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (brMatch) {
        const parsedBr = new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
        if (!Number.isNaN(parsedBr.getTime())) return toStartOfDay(parsedBr);
    }

    // Fallback para formatos sem ano (ex.: 21/02), usado para fontes que publicam eventos do ano atual.
    if (assumeCurrentYearIfMissing) {
        const brNoYear = raw.match(/(\d{1,2})[\/-](\d{1,2})/);
        if (brNoYear) {
            const parsedBrNoYear = new Date(today.getFullYear(), Number(brNoYear[2]) - 1, Number(brNoYear[1]));
            if (!Number.isNaN(parsedBrNoYear.getTime())) return toStartOfDay(parsedBrNoYear);
        }
    }

    const ptMatch = parsePtMonthDate(raw, today.getFullYear());
    if (ptMatch) return ptMatch;

    const ptAbbrev = parsePtAbbrevMonthDay(raw, today.getFullYear());
    if (ptAbbrev) return ptAbbrev;

    const ptDayMonth = parsePtDayMonthAbbrev(raw, today.getFullYear());
    if (ptDayMonth) return ptDayMonth;

    return null;
};

// Formata horario para exibicao amigavel no card.
const formatHorarioForDisplay = (rawDateText) => {
    const raw = (rawDateText || '').trim();
    if (!raw) return 'Horario a confirmar';

    const isoLike = /^\d{4}-\d{2}-\d{2}T/.test(raw);
    if (!isoLike) return raw;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;

    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
};

// Extrai dominio do link para facilitar auditoria por origem.
const getHostFromLink = (link) => {
    try {
        return new URL(link).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return '';
    }
};

// Persiste todos os itens brutos + diagnostico de filtros no CSV de auditoria.
const writeAuditCsv = async (records) => {
    const auditWriter = createCsvWriter({
        path: AUDIT_CSV_PATH,
        header: [
            { id: 'coletado_em', title: 'ColetadoEm' },
            { id: 'origem_site', title: 'OrigemSite' },
            { id: 'nome_bruto', title: 'NomeBruto' },
            { id: 'data_bruta', title: 'DataBruta' },
            { id: 'local_bruto', title: 'LocalBruto' },
            { id: 'link_origem_conecta', title: 'LinkOrigemConecta' },
            { id: 'link_final', title: 'LinkFinal' },
            { id: 'link', title: 'Link' },
            { id: 'data_parseada', title: 'DataParseada' },
            { id: 'in_range', title: 'InRange' },
            { id: 'duplicado_csv', title: 'DuplicadoCSV' },
            { id: 'duplicado_lote', title: 'DuplicadoLote' },
            { id: 'aprovado', title: 'Aprovado' },
            { id: 'motivo_exclusao', title: 'MotivoExclusao' }
        ]
    });

    const dir = path.dirname(AUDIT_CSV_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    await auditWriter.writeRecords(records);
    console.log(`Auditoria salva em ${AUDIT_CSV_PATH} com ${records.length} registros.`);
};

// Escreve um resumo por execucao no arquivo de log em data/.
const appendRunSummaryLog = async ({ intervalStart, intervalEnd, rawCount, dedupCount, savedCount }) => {
    const dir = path.dirname(SCRAPE_LOG_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] intervalo=${intervalStart}..${intervalEnd} brutos=${rawCount} deduplicados=${dedupCount} salvos_events_csv=${savedCount}\n`;
    await fs.promises.appendFile(SCRAPE_LOG_PATH, line, 'utf8');
    console.log(`Resumo da execucao registrado em ${SCRAPE_LOG_PATH}`);
};

// Tenta extrair a data do evento usando os campos mais comuns da API.
const parseEventDate = (item, today) => {
    // Prioriza campo estruturado quando existir.
    if (item?.date?.start_date) {
        const parsed = parseStructuredDate(item.date.start_date, today);
        if (parsed) return parsed;
    }

    // Fallback para outra variante de campo estruturado.
    if (item?.start_date) {
        const parsed = parseStructuredDate(item.start_date, today);
        if (parsed) return parsed;
    }

    // Fallback para campo textual livre vindo da API.
    const when = item?.date?.when || '';
    if (!when) return null;

    // Tenta formato ISO (yyyy-mm-dd).
    const isoMatch = when.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const parsed = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) return toStartOfDay(parsed);
    }

    // Tenta formato brasileiro (dd/mm/yyyy ou dd-mm-yyyy).
    const brMatch = when.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (brMatch) {
        const parsed = new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
        if (!Number.isNaN(parsed.getTime())) return toStartOfDay(parsed);
    }

    // Tenta datas textuais em portugues.
    const ptDate = parsePtMonthDate(when, today.getFullYear());
    if (ptDate) return ptDate;

    return null;
};

/**
 * Helper para buscar uma unica pagina de eventos
 */
const fetchEventsPage = (offset) => {
    return new Promise((resolve, reject) => {
        // Parametros da busca no Google Events.
        const params = {
            engine: "google_events",
            q: "eventos em recife",
            hl: "pt",
            gl: "br",
            start: offset // Paginacao (0, 10, 20...)
        };

        // Executa a chamada HTTP na API externa.
        search.json(params, (data) => {
            if (data.error) return reject(data.error);
            // Retorna apenas a lista de eventos, com fallback para array vazio.
            resolve(data.events_results || []);
        });
    });
};

/**
 * Busca eventos em Recife usando a Google Events API via SerpApi.
 * Busca todas as paginas disponiveis ate o fim dos resultados.
 * Mantem apenas eventos entre hoje e o ultimo dia do proximo mes.
 */
const scrapeEvents = async () => {
    console.log('Iniciando busca via scrapers web (Puppeteer)...');

    // Define janela de busca dinamica: hoje ate o ultimo dia do mes que vem.
    const today = toStartOfDay(new Date());
    const endOfCurrentMonth = toStartOfDay(new Date(today.getFullYear(), today.getMonth() + 2, 0));
    console.log(`Intervalo alvo: ${formatDdMmYyyy(today)} ate ${formatDdMmYyyy(endOfCurrentMonth)}.`);

    // 1. Carrega estado atual do CSV para deduplicacao e continuidade de IDs.
    let currentDb = [];
    try {
        // Le eventos existentes para evitar inserir repetidos.
        currentDb = await readEvents();
    } catch (err) {
        // Se nao conseguir ler, continua com base vazia.
        currentDb = [];
    }

    // 2. Calcula o proximo ID sequencial.
    let nextId = 1;
    if (currentDb.length > 0) {
        // Extrai IDs numericos validos.
        const ids = currentDb.map(e => parseInt(e.id, 10)).filter(n => !isNaN(n));
        // Define o proximo ID como max + 1.
        if (ids.length > 0) nextId = Math.max(...ids) + 1;
    }

    // Index de nomes ja existentes no CSV.
    const existingNames = new Set(
        currentDb
            .map(event => (event?.nome || '').trim().toLowerCase())
            .filter(Boolean)
    );
    // Index de nomes adicionados no lote atual.
    const newNames = new Set();

    // Lista acumulada de eventos novos aprovados.
    let allNewEvents = [];
    const auditRecords = [];
    const collectedAt = new Date().toISOString();

    // Busca via Google Events API sera executada apos a varredura web.

    // Busca ativa via Puppeteer nas plataformas web.
    let webScrapeStats = { rawCount: 0, dedupCount: 0 };
    try {
        const webEvents = await scrapeAllWebsites();
        webScrapeStats = getLastWebScrapeStats();

        webEvents.forEach((event) => {
            const rawTitle = fixMojibake((event.name || '').trim());
            const rawDate = fixMojibake(event.date || '');
            const rawLocation = fixMojibake(event.location || '');
            const originalLink = event.originalLink || event.link || '#';
            const rawLink = event.link || '#';
            const host = getHostFromLink(rawLink);

            const reasons = [];
            const title = rawTitle;
            if (!title) {
                reasons.push('sem_titulo');
            }
            if (isGenericTitle(title)) {
                reasons.push('titulo_generico');
            }

            const normalizedTitle = title.toLowerCase();
            const duplicateInCsv = existingNames.has(normalizedTitle);
            const duplicateInBatch = newNames.has(normalizedTitle);
            if (duplicateInCsv) reasons.push('duplicado_csv');
            if (duplicateInBatch) reasons.push('duplicado_lote');

            // Tenta inferir data a partir do campo textual extraido pelo scraper.
            const assumeCurrentYearIfMissing = host.includes('conecta.recife.pe.gov.br');
            let parsedDate = parseDateFromText(rawDate, today, { assumeCurrentYearIfMissing });
            const minPlausibleYear = today.getFullYear() - 1;

            // Conecta pode trazer data antiga/ruidosa na pagina; tenta recuperar do contexto textual.
            if (
                host.includes('conecta.recife.pe.gov.br') &&
                (!parsedDate || parsedDate.getFullYear() < minPlausibleYear)
            ) {
                parsedDate =
                    parseDateFromText(rawLocation, today, { assumeCurrentYearIfMissing: true }) ||
                    parseDateFromText(`${rawTitle} ${rawLocation}`, today, { assumeCurrentYearIfMissing: true }) ||
                    parsedDate;
            }
            if (!parsedDate) reasons.push('data_nao_parseada');
            const inRange = parsedDate ? !(parsedDate < today || parsedDate > endOfCurrentMonth) : false;
            if (parsedDate && !inRange) reasons.push('fora_intervalo');

            const approved = reasons.length === 0;
            auditRecords.push({
                coletado_em: collectedAt,
                origem_site: host,
                nome_bruto: rawTitle,
                data_bruta: rawDate,
                local_bruto: rawLocation,
                link_origem_conecta: originalLink.includes('conecta.recife.pe.gov.br') ? originalLink : '',
                link_final: rawLink,
                link: rawLink,
                data_parseada: parsedDate ? formatDdMmYyyy(parsedDate) : '',
                in_range: inRange,
                duplicado_csv: duplicateInCsv,
                duplicado_lote: duplicateInBatch,
                aprovado: approved,
                motivo_exclusao: approved ? '' : reasons.join('|')
            });

            if (!approved) return;

            allNewEvents.push({
                id: String(nextId++).padStart(3, '0'),
                nome: title,
                descricao: fixMojibake((rawLocation || 'Sem descricao disponivel.')).substring(0, 150),
                data: formatDdMmYyyy(parsedDate),
                local: fixMojibake(rawLocation || 'Recife'),
                horario: formatHorarioForDisplay(fixMojibake(rawDate)),
                // gratuito: false, // Desabilitado temporariamente (nao marcar pago/gratuito)
                tipo: "Plataforma Web",
                link: rawLink,
                saved: false
            });

            newNames.add(normalizedTitle);
        });
    } catch (error) {
        console.error('Erro ao buscar eventos via Puppeteer:', error.message);
    }

    // Busca complementar via Google Events API (executada apos concluir/falhar os scrapers web).
    let offset = 0;
    let page = 1;
    while (true) {
        console.log(`Buscando pagina ${page} (offset ${offset})...`);
        try {
            const eventsResults = await fetchEventsPage(offset);
            if (!eventsResults || eventsResults.length === 0) {
                console.log('Fim dos resultados na API.');
                break;
            }

            eventsResults.forEach((item) => {
                const rawTitle = fixMojibake((item.title || '').trim());
                const rawDate = fixMojibake(item.date ? item.date.when : '');
                const rawLocation = fixMojibake(item.address ? item.address[0] : 'Recife');
                const rawLink = item.link || '#';
                const host = 'google_events_api';

                const reasons = [];
                const title = rawTitle;
                if (!title) reasons.push('sem_titulo');
                if (isGenericTitle(title)) reasons.push('titulo_generico');

                const normalizedTitle = title.toLowerCase();
                const duplicateInCsv = existingNames.has(normalizedTitle);
                const duplicateInBatch = newNames.has(normalizedTitle);
                if (duplicateInCsv) reasons.push('duplicado_csv');
                if (duplicateInBatch) reasons.push('duplicado_lote');

                const parsedDate = parseEventDate(item, today);
                if (!parsedDate) reasons.push('data_nao_parseada');
                const inRange = parsedDate ? !(parsedDate < today || parsedDate > endOfCurrentMonth) : false;
                if (parsedDate && !inRange) reasons.push('fora_intervalo');

                const approved = reasons.length === 0;
                auditRecords.push({
                    coletado_em: collectedAt,
                    origem_site: host,
                    nome_bruto: rawTitle,
                    data_bruta: rawDate,
                    local_bruto: rawLocation,
                    link_origem_conecta: '',
                    link_final: rawLink,
                    link: rawLink,
                    data_parseada: parsedDate ? formatDdMmYyyy(parsedDate) : '',
                    in_range: inRange,
                    duplicado_csv: duplicateInCsv,
                    duplicado_lote: duplicateInBatch,
                    aprovado: approved,
                    motivo_exclusao: approved ? '' : reasons.join('|')
                });

                if (!approved) return;

                const description = fixMojibake(item.description || "Sem descricao disponivel.");
                const dateInfo = fixMojibake(item.date ? item.date.when : "Data a confirmar");
                allNewEvents.push({
                    id: String(nextId++).padStart(3, '0'),
                    nome: title,
                    descricao: description.substring(0, 150) + (description.length > 150 ? '...' : ''),
                    data: formatDdMmYyyy(parsedDate),
                    local: rawLocation || 'Recife',
                    horario: dateInfo,
                    // gratuito: false, // Desabilitado temporariamente (nao marcar pago/gratuito)
                    tipo: "Eventos Google",
                    link: rawLink,
                    saved: false
                });

                newNames.add(normalizedTitle);
            });

            offset += 10;
            page += 1;
        } catch (error) {
            console.error('Erro ao buscar pagina:', error);
            break;
        }
    }

    try {
        await writeAuditCsv(auditRecords);
    } catch (error) {
        console.error('Erro ao salvar auditoria CSV:', error.message);
    }

    if (allNewEvents.length > 0) {
        // Junta base atual com novos eventos.
        const updatedList = [...currentDb, ...allNewEvents];
        // Persiste lista final no CSV, mantendo regras de validacao ja existentes.
        await saveEvents(updatedList);
        await appendRunSummaryLog({
            intervalStart: formatDdMmYyyy(today),
            intervalEnd: formatDdMmYyyy(endOfCurrentMonth),
            rawCount: webScrapeStats.rawCount,
            dedupCount: webScrapeStats.dedupCount,
            savedCount: allNewEvents.length
        });
        console.log(`SUCESSO: ${allNewEvents.length} novos eventos salvos no total.`);
        return updatedList;
    }

    await appendRunSummaryLog({
        intervalStart: formatDdMmYyyy(today),
        intervalEnd: formatDdMmYyyy(endOfCurrentMonth),
        rawCount: webScrapeStats.rawCount,
        dedupCount: webScrapeStats.dedupCount,
        savedCount: 0
    });
    console.log('Nenhum evento novo encontrado na varredura dos scrapers web.');
    return currentDb;
};

module.exports = { scrapeEvents };
