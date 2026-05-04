import { CONFIG } from './config.js';
import { fetchElevationData, calculateSlopes, getCriticalPoints, displayCriticalPoints, getElevationStats, clearElevationMarkers, extractPedestrianCoordinates, evaluateRouteElevation, scoreRoute } from './elevation-engine.js';

let routingLayers = [];
let currentCriticalPoints = [];

/**
 * Fonction utilitaire pour interroger l'accessibilité d'un arrêt via l'API IDFM
 */
async function getStopAccessibility(stopId) {
    const cleanId = stopId.includes(':') ? stopId.split(':').pop() : stopId;
    const url = `https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/arrets/records?where=arrid%3D%22${cleanId}%22&limit=1`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const stop = data.results[0];
            let type = stop.arrtype || "Transport";
            
            const rawAccess = stop.arraccessibility; 
            let isAccessible = (rawAccess === "true" || rawAccess === true);
            
            if (type.toLowerCase().includes("bus")) {
                isAccessible = true;
            }

            return {
                accessible: isAccessible,
                rawStatus: rawAccess, 
                name: stop.arrname,
                type: type === "rail" ? "RER" : type
            };
        }
    } catch (e) {
        console.error("Erreur accessibilité pour l'arrêt " + stopId, e);
    }
    return null;
}

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

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours === 0 ? `${minutes} min` : `${hours}h ${minutes} min`;
}

async function isJourneyInvalid(journey) {
    const processedStops = new Set();
    for (const section of journey.sections) {
        if (section.type === 'public_transport') {
            const transportMode = section.display_informations?.physical_mode?.toLowerCase() || "";
            if (transportMode.includes("bus")) continue; 

            const stopsToChecks = [section.from.id, section.to.id];
            for (const stopId of stopsToChecks) {
                if (!processedStops.has(stopId)) {
                    const access = await getStopAccessibility(stopId);
                    if (access && (access.rawStatus === "false" || access.rawStatus === false)) {
                        return true;
                    }
                    processedStops.add(stopId);
                }
            }
        }
    }
    return false;
}

async function findBestRoute(journeys) {
    if (journeys.length === 0) return { bestRoute: null, bestIndex: -1, scores: [] };
    const validScores = [];

    for (let i = 0; i < journeys.length; i++) {
        const journey = journeys[i];
        const invalid = await isJourneyInvalid(journey);
        if (invalid) continue;

        const elevationEval = await evaluateRouteElevation(journey);
        const score = scoreRoute(elevationEval);

        if (score != 0){
            validScores.push({
                index: i,
                score: score,
                stats: elevationEval.stats,
                criticalPoints: elevationEval.criticalPoints,
                duration: journey.duration,
                durationFormatted: formatDuration(journey.duration)
            });
        }
        
    }
    
    if (validScores.length === 0) return { bestRoute: null, bestIndex: -1, scores: [] };

    validScores.sort((a, b) => (a.score !== b.score ? a.score - b.score : a.duration - b.duration));
    const bestScore = validScores[0];
    return {
        bestRoute: journeys[bestScore.index],
        bestIndex: bestScore.index,
        scores: validScores,
        bestElevation: { stats: bestScore.stats, criticalPoints: bestScore.criticalPoints }
    };
}

export async function displaySpecificJourney(journey, mapInstance) {
    routingLayers.forEach(l => mapInstance.removeLayer(l));
    routingLayers = [];
    const allCoordinates = [];
    for (const section of journey.sections) {
        if (section.geojson?.coordinates) {
            const coords = section.geojson.coordinates.map(c => [c[1], c[0]]);
            const poly = L.polyline(coords, getSectionStyle(section)).addTo(mapInstance);
            routingLayers.push(poly);
            if (section.type === 'street_network') allCoordinates.push(...coords);
        }

        if (section.type === 'public_transport') {
            const stops = [
                { data: section.from, label: "Montée / Correspondance" },
                { data: section.to, label: "Descente / Correspondance" }
            ];

            for (const stop of stops) {
                const coords = [stop.data.stop_point.coord.lat, stop.data.stop_point.coord.lon];
                const accessInfo = await getStopAccessibility(stop.data.id);

                // --- NOUVELLE LOGIQUE DE COULEURS ---
                let color = "#808080"; // Par défaut : Gris (Inconnu)[cite: 3]
                let statusEmoji = "❓";
                let statusText = "Inconnu";

                if (accessInfo?.accessible) {
                    color = "#27ae60"; // Vert (Accessible)[cite: 3]
                    statusEmoji = "♿";
                    statusText = "Accessible";
                } else if (accessInfo?.rawStatus === "partial") {
                    color = "#f1c40f"; // Jaune (Partiel)[cite: 3]
                    statusEmoji = "⚠️";
                    statusText = "Partiellement Accessible";
                }
                // ------------------------------------

                const stopMarker = L.circleMarker(coords, {
                    radius: 6,
                    fillColor: color,
                    color: "#fff",
                    weight: 2,
                    fillOpacity: 1
                }).addTo(mapInstance);

                stopMarker.bindPopup(`
                    <div style="font-family: sans-serif;">
                        <strong style="color: #2c3e50;">${stop.label}</strong><br>
                        <span style="font-size: 1.1em; font-weight: bold;">${stop.data.name}</span><br>
                        <hr style="margin: 5px 0; border: 0; border-top: 1px solid #eee;">
                        Type : ${accessInfo?.type || 'Transport'}<br>
                        Accessibilité : <strong>${statusEmoji} ${statusText}</strong>
                    </div>
                `);
                routingLayers.push(stopMarker);
            }
        }
    }

    if (allCoordinates.length > 1) {
        try {
            const elevationData = await fetchElevationData(allCoordinates);
            const slopesData = calculateSlopes(elevationData);
            currentCriticalPoints = getCriticalPoints(slopesData);
            displayCriticalPoints(currentCriticalPoints, mapInstance);
        } catch (err) {}
    }

    if (routingLayers.length > 0) {
        mapInstance.fitBounds(L.featureGroup(routingLayers).getBounds().pad(0.2));
    }
}

export async function displayBestRoute(journeys, mapInstance) {
    const result = await findBestRoute(journeys);
    if (!result || !result.bestRoute) {
        alert("Désolé, aucun trajet accessible n'a été trouvé.");
        return [];
    }
    await displaySpecificJourney(result.bestRoute, mapInstance);
    if (result.bestElevation.criticalPoints.length > 0) {
        clearElevationMarkers(mapInstance);
        displayCriticalPoints(result.bestElevation.criticalPoints, mapInstance);
    }
    return result.scores;
}

export function clearRoute(mapInstance) {
    routingLayers.forEach(layer => mapInstance.removeLayer(layer));
    routingLayers = [];
    clearElevationMarkers(mapInstance);
    currentCriticalPoints = [];
}