import { CONFIG } from './config.js';
import { fetchElevationData, calculateSlopes, getCriticalPoints, displayCriticalPoints, getElevationStats, clearElevationMarkers } from './elevation-engine.js';

let routingLayers = [];
let currentCriticalPoints = [];

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

export async function displaySpecificJourney(journey, mapInstance) {
    routingLayers.forEach(l => mapInstance.removeLayer(l));
    routingLayers = [];
    
    // Collect all coordinates from all sections
    const allCoordinates = [];
    
    journey.sections.forEach(section => {
        if (section.geojson?.coordinates) {
            const coords = section.geojson.coordinates.map(c => [c[1], c[0]]);
            const poly = L.polyline(coords, getSectionStyle(section)).addTo(mapInstance);
            routingLayers.push(poly);
            
            // Collect coordinates for elevation analysis (only for pedestrian sections)
            if (section.type === 'street_network') {
                allCoordinates.push(...coords);
            }
        }
    });

    // Calculate elevation and slopes if we have pedestrian sections
    if (allCoordinates.length > 1) {
        try {
            const elevationData = await fetchElevationData(allCoordinates);
            const slopesData = calculateSlopes(elevationData);
            currentCriticalPoints = getCriticalPoints(slopesData);
            
            // Display critical points on map
            displayCriticalPoints(currentCriticalPoints, mapInstance);
            
            // Log elevation stats to console
            const stats = getElevationStats(slopesData);
            console.log(`Élévation - Montée: ${stats.totalUphill}m | Descente: ${stats.totalDownhill}m | Points critiques: ${stats.criticalPointsCount} | Pente max: ${stats.steepestSlope}%`);
        } catch (err) {
            console.error('Erreur analyse élévation:', err);
        }
    }

    if (routingLayers.length > 0) {
        mapInstance.fitBounds(L.featureGroup(routingLayers).getBounds().pad(0.2));
    }
}

export function clearRoute(mapInstance) {
    routingLayers.forEach(layer => mapInstance.removeLayer(layer));
    routingLayers = [];
    clearElevationMarkers(mapInstance);
    currentCriticalPoints = [];
}