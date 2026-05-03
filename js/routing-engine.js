import { CONFIG } from './config.js';
import { fetchElevationData, calculateSlopes, getCriticalPoints, displayCriticalPoints, getElevationStats, clearElevationMarkers, extractPedestrianCoordinates, evaluateRouteElevation, scoreRoute } from './elevation-engine.js';

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

/**
 * Find the best route based on elevation difficulty
 * @param {Array} journeys - Array of journey objects
 * @returns {Promise<Object>} Object with bestRoute, bestIndex, and all route scores
 */
async function findBestRoute(journeys) {
    if (journeys.length === 0) return { bestRoute: null, bestIndex: -1, scores: [] };
    
    console.log(`[Routes] Evaluating ${journeys.length} routes for elevation difficulty...`);
    
    // Evaluate all routes in parallel
    const evaluations = await Promise.all(
        journeys.map(journey => evaluateRouteElevation(journey))
    );
    
    // Score each route
    const scores = evaluations.map((evaluation, index) => ({
        index,
        score: scoreRoute(evaluation),
        stats: evaluation.stats,
        criticalPoints: evaluation.criticalPoints
    }));
    
    // Sort by score (lower = better)
    scores.sort((a, b) => a.score - b.score);
    
    const bestScore = scores[0];
    console.log(`[Routes] Best route (index ${bestScore.index}): Score=${bestScore.score.toFixed(0)}, CriticalPoints=${bestScore.stats.criticalPointsCount}, Uphill=${bestScore.stats.totalUphill}m`);
    
    // Log alternatives
    if (scores.length > 1) {
        console.log(`[Routes] Alternatives:`, scores.slice(1, 3).map(s => `Index ${s.index} (Score: ${s.score.toFixed(0)})`));
    }
    
    return {
        bestRoute: journeys[bestScore.index],
        bestIndex: bestScore.index,
        scores: scores,
        bestElevation: {
            stats: bestScore.stats,
            criticalPoints: bestScore.criticalPoints
        }
    };
}

export async function displaySpecificJourney(journey, mapInstance) {
    routingLayers.forEach(l => mapInstance.removeLayer(l));
    routingLayers = [];
    
    // Collect all coordinates from all sections (for display)
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

/**
 * Display the best route (lowest elevation difficulty) from a list of journeys
 * @param {Array} journeys - Array of journey objects from Navitia
 * @param {Object} mapInstance - Leaflet map instance
 */
export async function displayBestRoute(journeys, mapInstance) {
    const result = await findBestRoute(journeys);
    
    if (!result.bestRoute) {
        console.warn('No routes available');
        return;
    }
    
    // Display the best route
    await displaySpecificJourney(result.bestRoute, mapInstance);
    
    // Update markers with the best route's elevation data
    if (result.bestElevation.criticalPoints.length > 0) {
        clearElevationMarkers(mapInstance);
        displayCriticalPoints(result.bestElevation.criticalPoints, mapInstance);
    }
}

export function clearRoute(mapInstance) {
    routingLayers.forEach(layer => mapInstance.removeLayer(layer));
    routingLayers = [];
    clearElevationMarkers(mapInstance);
    currentCriticalPoints = [];
}