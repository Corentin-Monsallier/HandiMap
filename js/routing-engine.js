/**
 * Routing Service utilisant Navitia (PRIM Île-de-France Mobilités)
 */
import { CONFIG } from './config.js';

let routingLayers = []; // Tableau pour stocker les différents segments (polylines)
let routeInfo = null;

/**
 * Définit le style visuel en fonction du type de section (marche ou transport)
 */
function getSectionStyle(section) {
    // Si c'est de la marche à pied ou une attente
    if (section.type === 'street_network' || section.type === 'waiting' || section.type === 'transfer') {
        return {
            color: '#808080', // Gris
            weight: 5,
            opacity: 0.6,
            dashArray: '5, 10' // Effet pointillé pour la marche
        };
    }
    
    // Pour les transports en commun, on utilise la couleur officielle de la ligne renvoyée par PRIM
    // Le format Navitia est une couleur hexa sans le '#' (ex: "0078d4")
    const lineCol = section.display_informations?.color;
    
    return {
        color: lineCol ? `#${lineCol}` : '#0078d4', // Couleur de ligne ou bleu par défaut
        weight: 8,
        opacity: 0.9,
        lineJoin: 'round'
    };
}

/**
 * Récupère un itinéraire via l'API Navitia de PRIM
 */
export async function fetchRoute(startCoords, endCoords) {
    const [startLat, startLng] = startCoords;
    const [endLat, endLng] = endCoords;
    
    const from = `${startLng};${startLat}`;
    const to = `${endLng};${endLat}`;
    
    const url = `https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys?from=${from}&to=${to}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.NAVITIA_TOKEN,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error(`Erreur Navitia: ${response.status}`);
        
        const data = await response.json();
        if (!data.journeys || data.journeys.length === 0) return null;
        
        const journey = data.journeys[0];
        
        routeInfo = {
            distance: journey.distances?.walking || 0,
            duration: journey.duration,
            sections: journey.sections // On stocke les sections pour le rendu segmenté
        };
        
        return routeInfo;
    } catch (err) {
        console.error('Erreur Navitia:', err);
        return null;
    }
}

/**
 * Affiche le tracé segmenté sur la carte
 */
export function displayRoute(mapInstance, routeData) {
    if (!routeData || !routeData.sections) return;
    
    // Nettoyage des tracés précédents
    clearRoute(mapInstance);

    routeData.sections.forEach(section => {
        // On ne trace que les sections possédant une géométrie
        if (section.geojson && section.geojson.coordinates) {
            const coords = section.geojson.coordinates.map(c => [c[1], c[0]]);
            const style = getSectionStyle(section);
            
            const polyline = L.polyline(coords, style).addTo(mapInstance);
            
            // Ajout d'une info-bulle au survol/clic sur un tronçon de transport
            if (section.display_informations) {
                const info = section.display_informations;
                polyline.bindPopup(`<strong>${info.network} ${info.code}</strong><br>Direction: ${info.direction}`);
            }

            routingLayers.push(polyline);
        }
    });

    // Ajustement de la vue pour englober tout l'itinéraire
    if (routingLayers.length > 0) {
        const featureGroup = L.featureGroup(routingLayers);
        mapInstance.fitBounds(featureGroup.getBounds().pad(0.2));
    }
}

/**
 * Workflow complet
 */
export async function calculateAndDisplayRoute(startCoords, endCoords, mapInstance) {
    const routeData = await fetchRoute(startCoords, endCoords);
    if (routeData) {
        displayRoute(mapInstance, routeData);
        return {
            distance: `${(routeData.distance / 1000).toFixed(2)} km à pied`,
            time: `${Math.round(routeData.duration / 60)} min`
        };
    }
    return null;
}

/**
 * Supprime tous les segments de la carte
 */
export function clearRoute(mapInstance) {
    routingLayers.forEach(layer => mapInstance.removeLayer(layer));
    routingLayers = [];
}