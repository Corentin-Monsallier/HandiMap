import { CONFIG } from './config.js';

let routingLayers = [];

function getSectionStyle(section) {
    if (section.type === 'street_network' || section.type === 'transfer' || section.type === 'waiting') {
        return { color: '#808080', weight: 5, opacity: 0.6, dashArray: '5, 10' };
    }
    const color = section.display_informations?.color;
    return { color: color ? `#${color}` : '#0078d4', weight: 7, opacity: 0.9 };
}

export async function fetchAllRoutes(startCoords, endCoords) {
    const from = `${startCoords[1]};${startCoords[0]}`;
    const to = `${endCoords[1]};${endCoords[0]}`;
    const url = `https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys?from=${from}&to=${to}`;

    try {
        const response = await fetch(url, { headers: { 'apikey': CONFIG.NAVITIA_TOKEN } });
        const data = await response.json();
        return data.journeys || [];
    } catch (err) {
        console.error('Erreur Navitia:', err);
        return [];
    }
}

export function displaySpecificJourney(journey, mapInstance) {
    routingLayers.forEach(l => mapInstance.removeLayer(l));
    routingLayers = [];
    
    journey.sections.forEach(section => {
        if (section.geojson?.coordinates) {
            const coords = section.geojson.coordinates.map(c => [c[1], c[0]]);
            const poly = L.polyline(coords, getSectionStyle(section)).addTo(mapInstance);
            routingLayers.push(poly);
        }
    });

    if (routingLayers.length > 0) {
        mapInstance.fitBounds(L.featureGroup(routingLayers).getBounds().pad(0.2));
    }
}

export function clearRoute(mapInstance) {
    routingLayers.forEach(layer => mapInstance.removeLayer(layer));
    routingLayers = [];
}