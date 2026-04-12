let startMarker = null;
let endMarker = null;
let routingLine = null;

const startIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41]
});

const endIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41]
});

export async function fetchSuggestions(text, apiKey) {
    const url = `https://api.jawg.io/places/v1/autocomplete?text=${encodeURIComponent(text)}&access-token=${apiKey}&boundary.country=FR&size=5`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data.features || [];
    } catch (err) { return []; }
}

export async function searchAddress(query, type, apiKey, mapInstance) {
    const url = `https://api.jawg.io/places/v1/search?text=${encodeURIComponent(query)}&access-token=${apiKey}&boundary.country=FR&size=1`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.features && data.features.length > 0) {
            const [lng, lat] = data.features[0].geometry.coordinates;
            const coords = [lat, lng];

            console.log(`Coordonnées ${type.toUpperCase()} :`, coords);

            if (type === 'start') {
                if (startMarker) mapInstance.removeLayer(startMarker);
                startMarker = L.marker(coords, { icon: startIcon }).addTo(mapInstance);
            } else {
                if (endMarker) mapInstance.removeLayer(endMarker);
                endMarker = L.marker(coords, { icon: endIcon }).addTo(mapInstance);
            }

            // On ne fait le zoom (updateView) que si les deux points existent
            if (startMarker && endMarker) {
                updateView(mapInstance);
            }
            
            return coords;
        }
    } catch (e) { console.error(e); }
}

function updateView(mapInstance) {
    const points = [startMarker.getLatLng(), endMarker.getLatLng()];
    
    // Mise à jour de la ligne
    if (routingLine) mapInstance.removeLayer(routingLine);
    routingLine = L.polyline(points, { color: '#2ecc71', weight: 4, dashArray: '5, 10' }).addTo(mapInstance);
    
    // Zoom final sur l'ensemble du tracé
    mapInstance.fitBounds(L.featureGroup([startMarker, endMarker]).getBounds().pad(0.3));
}