const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { isBefore, startOfDay } = require('date-fns');

const CSV_PATH = path.join(__dirname, '../../data/events.csv');

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

// Aplica reparo de encoding nos campos textuais de um evento.
const repairEventTextFields = (event) => {
    if (!event || typeof event !== 'object') return event;
    const repaired = { ...event };

    Object.keys(repaired).forEach((key) => {
        if (typeof repaired[key] === 'string') {
            repaired[key] = fixMojibake(repaired[key]);
        }
    });

    return repaired;
};

// Normaliza texto para gerar chave de deduplicacao consistente.
const normalizeForKey = (value) => {
    if (typeof value !== 'string') return '';
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

// Garante que a pasta data existe.
if (!fs.existsSync(path.dirname(CSV_PATH))) {
    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
}

// Configuracao dos cabecalhos do CSV.
const csvWriter = createCsvWriter({
    path: CSV_PATH,
    header: [
        { id: 'id', title: 'Id' },
        { id: 'nome', title: 'Nome' },
        { id: 'descricao', title: 'Descricao' },
        { id: 'data', title: 'Data' },
        { id: 'local', title: 'Local' },
        { id: 'horario', title: 'Horario' },
        { id: 'gratuito', title: 'Gratuito' },
        { id: 'tipo', title: 'Tipo' },
        { id: 'link', title: 'Link' },
        { id: 'saved', title: 'Saved' }
    ]
});

/**
 * Le todos os eventos do CSV.
 */
const readEvents = () => {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toISOString();
        const results = [];

        if (!fs.existsSync(CSV_PATH)) {
            console.log(`[${timestamp}] CSV file doesn't exist, creating empty one...`);
            csvWriter.writeRecords([]).then(() => resolve([]));
            return;
        }

        fs.createReadStream(CSV_PATH)
            .pipe(csv({ mapHeaders: ({ header }) => header.toLowerCase() }))
            .on('data', (data) => {
                const repairedData = repairEventTextFields(data);
                repairedData.saved = repairedData.saved === 'true';
                repairedData.gratuito = repairedData.gratuito === 'true';
                results.push(repairedData);
            })
            .on('end', () => {
                const t = new Date().toISOString();
                console.log(`[${t}] Read ${results.length} events from CSV`);
                resolve(results);
            })
            .on('error', (error) => {
                const t = new Date().toISOString();
                console.error(`[${t}] Error reading CSV:`, error.message);
                reject(error);
            });
    });
};

/**
 * Salva a lista de eventos sobrescrevendo o CSV.
 * Inclui validacao de data e deduplicacao canonica.
 */
const saveEvents = async (events) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Saving ${events.length} events to CSV...`);
    const today = startOfDay(new Date());

    const normalizedEvents = events.map(repairEventTextFields);
    const seenKeys = new Set();
    let duplicateFilteredCount = 0;

    const validEvents = normalizedEvents.filter((event) => {
        if (!event || !event.data || typeof event.data !== 'string') {
            return false;
        }

        try {
            const parts = event.data.split('-');
            if (parts.length !== 3) return false;

            const [day, month, year] = parts;
            const eventDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
            if (Number.isNaN(eventDate.getTime())) return false;
            if (isBefore(eventDate, today)) return false;

            // Ultima barreira de deduplicacao antes de persistir.
            const keyNome = normalizeForKey(event.nome || '');
            const keyData = normalizeForKey(event.data || '');
            const keyLocal = normalizeForKey(event.local || '');
            const keyLink = normalizeForKey(event.link || '');
            const dedupKey = `${keyNome}|${keyData}|${keyLocal}|${keyLink}`;

            if (seenKeys.has(dedupKey)) {
                duplicateFilteredCount += 1;
                return false;
            }
            seenKeys.add(dedupKey);
            return true;
        } catch {
            return false;
        }
    });

    await csvWriter.writeRecords(validEvents);
    const timestamp2 = new Date().toISOString();
    console.log(
        `[${timestamp2}] Saved ${validEvents.length} valid events (filtered ${events.length - validEvents.length} invalid; ${duplicateFilteredCount} duplicates)`
    );
};

module.exports = { readEvents, saveEvents };
