/**
 * OSRM (Open Source Routing Machine) Routing Service
 * Handles route calculation, display, and route information management
 * Uses free public OSRM servers - no API key required
 */

let routingLine = null;
let routeInfo = null;

const routeLineStyle = {
    color: '#2ecc71',
    weight: 5,
    opacity: 0.8,
    dashArray: null // Solid line for actual route
};

// OSRM public server - free and no authentication needed
const OSRM_SERVER = 'https://router.project-osrm.org/route/v1';

/**
 * Test OSRM API connectivity
 * @returns {Promise<boolean>} True if API is reachable
 */
export async function testOSRMConnection() {
    try {
        // Test with a simple Paris to nearby point request (foot profile for pedestrians)
        const url = `${OSRM_SERVER}/foot/2.3522,48.8566;2.2936,48.8606?overview=false`;
        const response = await fetch(url);
        console.log(`OSRM API test response: ${response.status}`);
        return response.ok;
    } catch (err) {
        console.error('OSRM connection test failed:', err.message);
        return false;
    }
}

/**
 * Fetches a pedestrian route from OSRM API
 * @param {[number, number]} startCoords - [latitude, longitude]
 * @param {[number, number]} endCoords - [latitude, longitude]
 * @returns {Promise<Object>} Route data or null if request fails
 */
export async function fetchRoute(startCoords, endCoords) {
    const [startLat, startLng] = startCoords;
    const [endLat, endLng] = endCoords;
    
    // OSRM expects lng,lat format (reversed from Leaflet)
    const coordinates = `${startLng},${startLat};${endLng},${endLat}`;
    
    // Always use 'foot' profile for pedestrian routing
    const profile = 'foot';
    
    const url = `${OSRM_SERVER}/${profile}/${coordinates}?overview=full&geometries=geojson`;

    console.log(`OSRM request: ${url}`);

    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`OSRM API error (${response.status}):`, errorText);
            return null;
        }
        
        const data = await response.json();
        
        if (!data.routes || data.routes.length === 0) {
            console.warn('No route found in OSRM response');
            return null;
        }
        
        const route = data.routes[0]; // Take the first (best) route
        
        // Convert GeoJSON coordinates [lng, lat] to [lat, lng] for Leaflet
        const points = route.geometry.coordinates.map(coord => ({
            lat: coord[1],
            lng: coord[0]
        }));
        
        routeInfo = {
            distance: route.distance, // meters
            time: route.duration, // seconds
            profile: 'foot',
            points: points // Array of {lat, lng} objects
        };
        
        console.log(`Pedestrian route found: ${(route.distance / 1000).toFixed(2)} km, ${Math.round(route.duration / 60)} min`);
        return routeInfo;
    } catch (err) {
        console.error('OSRM fetch error:', err.message);
        console.error('Error type:', err.name);
        return null;
    }
}

/**
 * Displays the route on the Leaflet map
 * @param {Object} mapInstance - Leaflet map instance
 * @param {Object} routeData - Route data from fetchRoute
 * @returns {L.Polyline} The polyline layer
 */
export function displayRoute(mapInstance, routeData) {
    if (!routeData || !routeData.points) return null;
    
    // Remove existing route line if present
    if (routingLine) {
        mapInstance.removeLayer(routingLine);
    }
    
    // Convert point array to Leaflet-compatible format [lat, lng]
    const coordinates = routeData.points.map(point => [point.lat, point.lng]);
    
    // Create and add the polyline
    routingLine = L.polyline(coordinates, routeLineStyle).addTo(mapInstance);
    
    // Optional: Animate the map bounds to fit the route
    mapInstance.fitBounds(routingLine.getBounds().pad(0.1));
    
    return routingLine;
}

/**
 * Formats route information for display
 * @param {Object} routeData - Route data from fetchRoute
 * @returns {Object} Formatted data with distance (km), time (min), and profile
 */
export function formatRouteInfo(routeData) {
    if (!routeData) return null;
    
    return {
        distance: `${(routeData.distance / 1000).toFixed(2)} km`,
        time: `${Math.round(routeData.time / 60000)} min`,
        profile: routeData.profile,
        raw: routeData // Keep raw data for further processing
    };
}

/**
 * Clears the routing line from the map
 * @param {Object} mapInstance - Leaflet map instance
 */
export function clearRoute(mapInstance) {
    if (routingLine) {
        mapInstance.removeLayer(routingLine);
        routingLine = null;
    }
    routeInfo = null;
}

/**
 * Gets the current route information
 * @returns {Object|null} Current route data or null
 */
export function getRouteInfo() {
    return routeInfo;
}

/**
 * Complete routing workflow: fetch and display pedestrian route
 * @param {[number, number]} startCoords - [latitude, longitude]
 * @param {[number, number]} endCoords - [latitude, longitude]
 * @param {Object} mapInstance - Leaflet map instance
 * @returns {Promise<Object>} Route info or null if failed
 */
export async function calculateAndDisplayRoute(startCoords, endCoords, mapInstance) {
    const routeData = await fetchRoute(startCoords, endCoords);
    
    if (routeData) {
        displayRoute(mapInstance, routeData);
        return formatRouteInfo(routeData);
    } else {
        console.warn('Failed to calculate route');
        return null;
    }
}
