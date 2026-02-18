const dbService = require('../services/databaseService');
const scraperService = require('../services/scraperService');

// Get all events
const getEvents = async (req, res) => {
    try {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] 📖 Fetching all events...`);
        const events = await dbService.readEvents();
        console.log(`[${timestamp}] ✅ Retrieved ${events.length} events`);
        res.json(events);
    } catch (error) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ❌ Error retrieving events:`, error.message);
        res.status(500).json({ error: 'Failed to retrieve events.' });
    }
};

// Trigger manual scrape
const triggerScrape = async (req, res) => {
    try {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] 🚀 Scrape triggered by user`);
        const events = await scraperService.scrapeEvents();
        console.log(`[${timestamp}] ✅ Scrape completed with ${events.length} total events`);
        // Removed redundant dbService.readEvents() call to avoid file lock issues
        res.json({ message: 'Scrape successful', data: events });
    } catch (error) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ❌ Scrape failed:`, error.message);
        res.status(500).json({ error: 'Scraping failed.' });
    }
};

// Toggle "Saved" status
const toggleSave = async (req, res) => {
    const { id } = req.params;
    const timestamp = new Date().toISOString();
    try {
        console.log(`[${timestamp}] 💾 Toggling save status for event ${id}`);
        const events = await dbService.readEvents();
        const eventIndex = events.findIndex(e => e.id === id);

        if (eventIndex !== -1) {
            // Toggle boolean
            events[eventIndex].saved = !events[eventIndex].saved;
            await dbService.saveEvents(events);
            const newState = events[eventIndex].saved ? 'SAVED' : 'UNSAVED';
            console.log(`[${timestamp}] ✅ Event ${id} toggled to ${newState}`);
            res.json(events[eventIndex]);
        } else {
            console.warn(`[${timestamp}] ⚠️  Event not found: ${id}`);
            res.status(404).json({ error: 'Event not found' });
        }
    } catch (error) {
        const timestamp2 = new Date().toISOString();
        console.error(`[${timestamp2}] ❌ Toggle save failed:`, error.message);
        res.status(500).json({ error: 'Update failed' });
    }
};

module.exports = { getEvents, triggerScrape, toggleSave };