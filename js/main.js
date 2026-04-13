import { CONFIG } from './config.js';
import { map, initTileLayers } from './map-engine.js';
import { fetchSuggestions, searchAddress } from './search-logic.js';
import { fetchAllRoutes, displaySpecificJourney } from './routing-engine.js';

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
            renderOptions(journeys);
        }
    }
});

function renderOptions(journeys) {
    journeyList.innerHTML = '';
    itinerarySelector.style.display = journeys.length ? 'block' : 'none';

    journeys.forEach((j, i) => {
        const item = document.createElement('div');
        item.className = `journey-item ${i === 0 ? 'active' : ''}`;
        
        const logos = j.sections
            .filter(s => s.type === 'public_transport')
            .map(s => `<span class="line-badge" style="background:#${s.display_informations.color}">${s.display_informations.code}</span>`)
            .join(' → ');

        const duration = Math.round(j.duration / 60);
        item.innerHTML = `<strong>Option ${i+1}</strong> - ${duration} min<br>${logos || '🚶 Marche'}`;
        
        item.onclick = () => {
            document.querySelectorAll('.journey-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            displaySpecificJourney(j, map);
        };
        journeyList.appendChild(item);
    });

    if (journeys.length) displaySpecificJourney(journeys[0], map);
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