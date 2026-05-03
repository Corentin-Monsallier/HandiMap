let elevationMarkers = [];

const CORS_PROXY = 'https://corsproxy.io/?';
const ELEVATION_API_BASE = 'https://api.opentopodata.org/v1/srtm30m';

/**
 * Fetch elevation data for coordinates from OpenTopoData API
 * @param {Array<[lat, lng]>} coordinates - Array of [latitude, longitude] pairs
 * @returns {Promise<Array>} Array of {lat, lng, elevation} objects
 */
export async function fetchElevationData(coordinates) {
    if (coordinates.length === 0) return [];

    try {
        // Sample coordinates based on distance (~10 meters or less between samples)
        const sampledCoordinates = sampleCoordinatesByDistance(coordinates, 15);
        
        if (sampledCoordinates.length === 0) return [];

        // Format coordinates for OpenTopoData API: lat,lng|lat,lng|...
        const locationsParam = sampledCoordinates
            .map(coord => `${coord[0]},${coord[1]}`)
            .join('|');
        
        const apiUrl = `${ELEVATION_API_BASE}?locations=${locationsParam}`;
        const url = CORS_PROXY + encodeURIComponent(apiUrl);
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`Elevation API error (${response.status})`);
            return [];
        }
        
        const data = await response.json();
        
        if (data.results) {
            return data.results.map(result => ({
                lat: result.location.lat,
                lng: result.location.lng,
                elevation: result.elevation
            }));
        }
        return [];
    } catch (err) {
        console.error('Error retrieving elevation:', err);
        return [];
    }
}

/**
 * Sample coordinates based on distance intervals
 * @param {Array<[lat, lng]>} coordinates - All coordinates
 * @param {number} distanceInterval - Distance in meters between samples
 * @returns {Array<[lat, lng]>} Sampled coordinates
 */
function sampleCoordinatesByDistance(coordinates, distanceInterval) {
    if (coordinates.length < 2) return coordinates;

    const sampledCoordinates = [coordinates[0]]; // Always include first point
    let cumulativeDistance = 0;

    for (let i = 1; i < coordinates.length; i++) {
        const distance = calculateDistance(
            { lat: coordinates[i - 1][0], lng: coordinates[i - 1][1] },
            { lat: coordinates[i][0], lng: coordinates[i][1] }
        );
        
        cumulativeDistance += distance;

        // Sample if cumulative distance >= interval or if it's the last point
        if (cumulativeDistance >= distanceInterval || i === coordinates.length - 1) {
            sampledCoordinates.push(coordinates[i]);
            cumulativeDistance = 0; // Reset cumulative distance
        }
    }

    return sampledCoordinates;
}

/**
 * Calculate slopes between consecutive points
 * @param {Array} elevationData - Array of {lat, lng, elevation} objects
 * @returns {Array} Array of {lat, lng, elevation, slope} objects with slope percentages
 */
export function calculateSlopes(elevationData) {
    if (elevationData.length < 2) return elevationData;

    const slopesData = elevationData.map((point, i) => {
        if (i === 0) {
            return { ...point, slope: 0 };
        }

        const prevPoint = elevationData[i - 1];
        const elevationDiff = point.elevation - prevPoint.elevation; // in meters
        const distance = calculateDistance(prevPoint, point); // in meters
        
        // Slope = (elevation difference / horizontal distance) * 100
        const slope = distance > 0 ? (elevationDiff / distance) * 100 : 0;

        return { ...point, slope, elevationDiff, distance };
    });

    return slopesData;
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * @param {Object} point1 - {lat, lng}
 * @param {Object} point2 - {lat, lng}
 * @returns {number} Distance in meters
 */
function calculateDistance(point1, point2) {
    const R = 6371000; // Earth radius in meters
    const rad = Math.PI / 180;
    const dLat = (point2.lat - point1.lat) * rad;
    const dLng = (point2.lng - point1.lng) * rad;
    
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(point1.lat * rad) * Math.cos(point2.lat * rad) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Filter critical points (slope > 9%)
 * @param {Array} slopesData - Array with slope data
 * @returns {Array} Critical points with slope > 8%
 */
export function getCriticalPoints(slopesData) {
    return slopesData.filter(point => Math.abs(point.slope) > 9);
}

/**
 * Display critical points on the map
 * @param {Array} criticalPoints - Critical points to display
 * @param {Object} mapInstance - Leaflet map instance
 */
export function displayCriticalPoints(criticalPoints, mapInstance) {
    // Clear previous markers
    elevationMarkers.forEach(marker => mapInstance.removeLayer(marker));
    elevationMarkers = [];

    criticalPoints.forEach(point => {
        const isUphill = point.slope > 0;
        const icon = L.icon({
            iconUrl: isUphill 
                ? 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png'
                : 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            shadowSize: [41, 41]
        });

        const marker = L.marker([point.lat, point.lng], { icon })
            .bindPopup(`
                <strong>${isUphill ? '⬆️ Montée' : '⬇️ Descente'}</strong><br>
                Pente: ${point.slope.toFixed(1)}%<br>
                Élévation: ${point.elevation.toFixed(0)}m<br>
                Dénivelé: ${point.elevationDiff.toFixed(1)}m<br>
                Distance: ${point.distance.toFixed(0)}m
            `)
            .addTo(mapInstance);
        
        elevationMarkers.push(marker);
    });
}

/**
 * Clear all elevation markers from map
 * @param {Object} mapInstance - Leaflet map instance
 */
export function clearElevationMarkers(mapInstance) {
    elevationMarkers.forEach(marker => mapInstance.removeLayer(marker));
    elevationMarkers = [];
}

/**
 * Generate elevation profile visualization data
 * @param {Array} slopesData - Array with slope data
 * @returns {Object} Statistics about the route elevation
 */
export function getElevationStats(slopesData) {
    const criticalPoints = getCriticalPoints(slopesData);
    const totalUphill = slopesData.reduce((sum, p) => sum + (p.elevationDiff > 0 ? p.elevationDiff : 0), 0);
    const totalDownhill = Math.abs(slopesData.reduce((sum, p) => sum + (p.elevationDiff < 0 ? p.elevationDiff : 0), 0));
    const minElev = Math.min(...slopesData.map(p => p.elevation));
    const maxElev = Math.max(...slopesData.map(p => p.elevation));

    return {
        totalUphill: totalUphill.toFixed(0),
        totalDownhill: totalDownhill.toFixed(0),
        minElevation: minElev.toFixed(0),
        maxElevation: maxElev.toFixed(0),
        criticalPointsCount: criticalPoints.length,
        steepestSlope: Math.max(...slopesData.map(p => p.slope)).toFixed(1)
    };
}

/**
 * Extract pedestrian coordinates from a journey (only street_network sections)
 * @param {Object} journey - Journey object from Navitia
 * @returns {Array<[lat, lng]>} Array of pedestrian coordinates
 */
export function extractPedestrianCoordinates(journey) {
    const pedestrianCoords = [];
    
    journey.sections.forEach(section => {
        if (section.type === 'street_network' && section.geojson?.coordinates) {
            const coords = section.geojson.coordinates.map(c => [c[1], c[0]]);
            pedestrianCoords.push(...coords);
        }
    });
    
    return pedestrianCoords;
}

/**
 * Evaluate elevation for a complete journey (pedestrian sections only)
 * @param {Object} journey - Journey object from Navitia
 * @returns {Promise<Object>} Object with elevation stats and critical points
 */
export async function evaluateRouteElevation(journey) {
    const pedestrianCoords = extractPedestrianCoordinates(journey);
    
    if (pedestrianCoords.length < 2) {
        return {
            stats: {
                totalUphill: '0',
                totalDownhill: '0',
                criticalPointsCount: 0,
                steepestSlope: '0',
                minElevation: '0',
                maxElevation: '0'
            },
            criticalPoints: []
        };
    }
    
    const elevationData = await fetchElevationData(pedestrianCoords);
    
    if (elevationData.length === 0) {
        return {
            stats: {
                totalUphill: '0',
                totalDownhill: '0',
                criticalPointsCount: 0,
                steepestSlope: '0',
                minElevation: '0',
                maxElevation: '0'
            },
            criticalPoints: []
        };
    }
    
    const slopesData = calculateSlopes(elevationData);
    const criticalPoints = getCriticalPoints(slopesData);
    const stats = getElevationStats(slopesData);
    
    return { stats, criticalPoints };
}

/**
 * Score a route based on elevation difficulty (lower score = better/easier)
 * @param {Object} elevationData - Object with stats and critical points from evaluateRouteElevation
 * @returns {number} Score (lower is better)
 */
export function scoreRoute(elevationData) {
    const { stats, criticalPoints } = elevationData;
    
    // Weighted scoring: prioritize avoiding steep sections
    // Critical points are the PRIMARY factor - heavily penalize any steep sections
    const criticalPointsScore = parseInt(stats.criticalPointsCount) * 10000; // VERY heavy weight
    const uphillScore = parseInt(stats.totalUphill) * 1; // Secondary: total uphill
    const maxSlopeScore = Math.abs(parseFloat(stats.steepestSlope)) * 100; // Tertiary: max slope
    
    const totalScore = criticalPointsScore + uphillScore + maxSlopeScore;
    console.log(`[Score] CriticalPts=${stats.criticalPointsCount} (${criticalPointsScore}) + Uphill=${stats.totalUphill}m (${uphillScore}) + MaxSlope=${stats.steepestSlope}% (${maxSlopeScore}) = ${totalScore}`);
    
    return totalScore;
}
