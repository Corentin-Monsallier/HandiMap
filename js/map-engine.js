export const map = L.map('map').setView([48.8566, 2.3522], 13);

const styleMap = {
    'jawg-streets': 'Plan Urbain',
    'jawg-sunny': 'Ensoleillé',
    'jawg-terrain': 'Relief',
    'jawg-dark': 'Mode Sombre',
    'jawg-light': 'Mode Clair',
};

export function initTileLayers(apiKey) {
    const baselayers = {};
    Object.keys(styleMap).forEach((id) => {
        baselayers[styleMap[id]] = L.tileLayer(
            `https://tile.jawg.io/${id}/{z}/{x}/{y}{r}.png?access-token=${apiKey}`, {
                attribution: '&copy; JawgMaps &copy; OpenStreetMap'
            }
        );
    });
    baselayers['Plan Urbain'].addTo(map);
    L.control.layers(baselayers).addTo(map);
}