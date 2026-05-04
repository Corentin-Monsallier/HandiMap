import { CONFIG } from './config.js';
import { map, initTileLayers } from './map-engine.js';
import { fetchSuggestions, searchAddress } from './search-logic.js';
import { fetchAllRoutes, displaySpecificJourney, displayBestRoute } from './routing-engine.js';

initTileLayers(CONFIG.JAWG_API_KEY);

const startInput = document.getElementById('start-input');
const endInput = document.getElementById('end-input');
const journeyList = document.getElementById('journey-list');
const itinerarySelector = document.getElementById('itinerary-selector');

document.getElementById('search-container').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (startInput.value && endInput.value) {
        const start = await searchAddress(startInput.value, 'start', CONFIG.JAWG_API_KEY, map);
        const end = await searchAddress(endInput.value, 'end', CONFIG.JAWG_API_KEY, map);
        
        if (start && end) {
            const journeys = await fetchAllRoutes(start, end);
            const scores = await displayBestRoute(journeys, map);
            renderOptions(journeys, scores);
        }
    }
});

function renderOptions(journeys, orderedScores) {
    journeyList.innerHTML = '';
    itinerarySelector.style.display = journeys.length ? 'block' : 'none';

    // Use provided scores order if available, otherwise use original order
    const displayOrder = orderedScores ? orderedScores.map(s => s.index) : journeys.map((_, i) => i);

    displayOrder.forEach((journeyIndex, displayIndex) => {
        const j = journeys[journeyIndex];
        const item = document.createElement('div');
        item.className = `journey-item ${displayIndex === 0 ? 'active' : ''}`;

        const logos = j.sections
            .filter(s => s.type === 'public_transport')
            .map(s => `<span class="line-badge" style="background:#${s.display_informations.color}">${s.display_informations.code}</span>`)
            .join(' → ');

        const duration = Math.round(j.duration / 60);

        // Add recommendation badge for best route
        const recommendBadge = displayIndex === 0 ? '<span class="recommend-badge">⭐ Recommended <br></span>' : '';

        // Add score info if available
        const scoreInfo = orderedScores ?
            `<div class="score-info">Score: ${orderedScores[displayIndex].score.toFixed(0)}</div>` : '';

        item.innerHTML = `${recommendBadge}<strong>Option ${displayIndex+1}</strong> - ${duration} min<br>${logos || '🚶 Marche'}${scoreInfo}`;

        item.onclick = () => {
            document.querySelectorAll('.journey-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            displaySpecificJourney(j, map);
        };
        journeyList.appendChild(item);
    });

    if (journeys.length) displaySpecificJourney(journeys[displayOrder[0]], map);
}

// Autocomplétion
let typingTimer;
[startInput, endInput].forEach(input => {
    input.addEventListener('input', () => {
        clearTimeout(typingTimer);
        const listId = input.getAttribute('list');
        typingTimer = setTimeout(async () => {
            if (input.value.length > 3) {
                const suggestions = await fetchSuggestions(input.value, CONFIG.JAWG_API_KEY);
                document.getElementById(listId).innerHTML = suggestions
                    .map(f => `<option value="${f.properties.label}">`).join('');
            }
        }, 400);
    });
});