import { CONFIG } from './config.js';
import { map, initTileLayers } from './map-engine.js';
import { fetchSuggestions, searchAddress } from './search-logic.js';
import { calculateAndDisplayRoute, clearRoute } from './routing-engine.js';

initTileLayers(CONFIG.JAWG_API_KEY);

const startInput = document.getElementById('start-input');
const endInput = document.getElementById('end-input');
const searchForm = document.getElementById('search-container');

searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (startInput.value && endInput.value) {
        const startCoords = await searchAddress(startInput.value, 'start', CONFIG.JAWG_API_KEY, map);
        const endCoords = await searchAddress(endInput.value, 'end', CONFIG.JAWG_API_KEY, map);
        
        if (startCoords && endCoords) {
            const routeInfo = await calculateAndDisplayRoute(startCoords, endCoords, map);
            if (routeInfo) {
                console.log(`Itinéraire trouvé : ${routeInfo.distance}, environ ${routeInfo.time}`);
            }
        }
    } else {
        alert("Veuillez remplir le départ et l'arrivée.");
    }
});

let typingTimer;
[startInput, endInput].forEach(input => {
    input.addEventListener('input', () => {
        clearTimeout(typingTimer);
        const listId = input.getAttribute('list');
        const listElement = document.getElementById(listId);
        
        typingTimer = setTimeout(async () => {
            if (input.value.length > 3) {
                const suggestions = await fetchSuggestions(input.value, CONFIG.JAWG_API_KEY);
                listElement.innerHTML = suggestions
                    .map(f => `<option value="${f.properties.label}">`)
                    .join('');
            }
        }, 400);
    });
});