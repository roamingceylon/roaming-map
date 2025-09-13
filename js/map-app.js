// ===========================================================
// 1. Global Variables & Initialization
// ===========================================================
const MAX_ZOOM_LEVEL = 16; // Maximum zoom level for map and auto-zoom functions
const CLUSTER_MAX_ZOOM = MAX_ZOOM_LEVEL - 1; // Markers should decluster before max zoom
const CLUSTER_RADIUS = 100; // Cluster radius in pixels (adjust this to change clustering behavior)

let map;
let allData = [];
let filteredData = [];
let categories = new Set();
let cities = new Set();
let markerCluster = null;
let markersMap = new Map(); // Store markers by venue ID
let searchHistory = [];
const MAX_HISTORY = 8;
let selectedCategory = '';
let selectedCity = '';

// ===========================================================
// 2. Data Loading & Map Initialization
// ===========================================================
async function loadData() {
    try {
        const response = await fetch('./data/map-data.json');
        const data = await response.json();
        allData = data;
        filteredData = [...data];

        data.forEach(item => {
            if (item.category) categories.add(item.category);
            if (item.city) cities.add(item.city);
        });

        // Only run main page functions if on main page
        if (document.getElementById('list')) {
            populateCategoryFilters();
            populateCityFilters();
            renderList();
            initMap();
        }
    } catch (error) {
        const listElement = document.getElementById('list');
        if (listElement) {
            listElement.innerHTML = '<p>Error loading data</p>';
        }
    }
}

function updateMapMarkers() {
    // Remove old cluster
    if (markerCluster) {
        markerCluster.clearLayers();
        map.removeLayer(markerCluster);
    }
    markerCluster = L.markerClusterGroup({
        maxClusterRadius: CLUSTER_RADIUS, // Configurable cluster radius
        disableClusteringAtZoom: CLUSTER_MAX_ZOOM, // Disable clustering at max zoom - 1
        spiderfyOnMaxZoom: true, // Show individual markers when max cluster zoom reached
        showCoverageOnHover: false, // Don't show cluster coverage area on hover
        zoomToBoundsOnClick: true // Zoom to show all cluster markers when clicked
    });
    markersMap.clear(); // Clear markers map
    filteredData.forEach(venue => {
        if (venue.latitude && venue.longitude) {
            const hasPhotos = venue.photos && venue.photos.length > 0;
            const marker = L.marker([venue.latitude, venue.longitude])
                .bindPopup(`
                    <div style="min-width: 250px; max-width: 300px;">
                        ${hasPhotos ? `
                            <div style="margin-bottom: 10px;">
                                <img src="${venue.photos[0]}" 
                                     alt="${venue.name}" 
                                     style="width: 100%; height: 120px; object-fit: cover; border-radius: 6px; display: block;"
                                     onerror="this.style.display='none'">
                                ${venue.photos.length > 1 ? `
                                    <div style="margin-top: 4px; font-size: 10px; color: #888; text-align: center;">
                                        +${venue.photos.length - 1} more photo${venue.photos.length > 2 ? 's' : ''}
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                        <h4 style="margin: 0 0 8px 0; color: #333; font-size: 14px;">${venue.name}</h4>
                        <p style="margin: 4px 0 8px 0; color: #666; font-size: 12px; line-height: 1.4;">${venue.description}</p>
                        <div style="margin: 8px 0;">
                            <span style="background: #1976d2; color: white; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">${venue.category}</span>
                        </div>
                        <div style="display: flex; gap: 8px; margin-top: 8px;">
                            <a href="venue.html?id=${venue.id}" class="button" style="display: inline-block; background-color: #0E718C; color: white; padding: 5px 10px; border-radius: 4px; font-size: 11px; text-decoration: none; transition: background-color 0.2s;">View Details</a>
                            <a onclick="getDirections(${venue.latitude}, ${venue.longitude})" style="
                                display: inline-flex;
                                align-items: center;
                                gap: 4px;
                                padding: 5px 10px;
                                background: #28a745;
                                color: white;
                                text-decoration: none;
                                border-radius: 4px;
                                font-size: 11px;
                                cursor: pointer;
                                transition: background-color 0.2s;
                            " onmouseover="this.style.background='#218838'" onmouseout="this.style.background='#28a745'">
                                <i class="material-icons" style="font-size: 14px;">directions</i>
                                Directions
                            </a>
                        </div>
                    </div>
                `);
            marker.on('click', () => highlightListItem(venue.id));
            markersMap.set(venue.id, marker); // Store marker reference
            markerCluster.addLayer(marker);
        }
    });
    map.addLayer(markerCluster);
}

function zoomToFitFilteredMarkers() {
    if (!map || !markerCluster || filteredData.length === 0) return;
    
    // If only one marker, center on it with a reasonable zoom
    if (filteredData.length === 1) {
        const venue = filteredData[0];
        if (venue.latitude && venue.longitude) {
            map.setView([venue.latitude, venue.longitude], MAX_ZOOM_LEVEL - 2);
        }
        return;
    }
    
    // If multiple markers, fit bounds to show all
    const coordinates = filteredData
        .filter(venue => venue.latitude && venue.longitude)
        .map(venue => [parseFloat(venue.latitude), parseFloat(venue.longitude)]);
    
    if (coordinates.length > 0) {
        const bounds = L.latLngBounds(coordinates);
        // Add some padding around the markers
        map.fitBounds(bounds, { 
            padding: [20, 20],
            maxZoom: MAX_ZOOM_LEVEL - 2 // Don't zoom in too much
        });
    }
}

// ===========================================================
// 3. UI Rendering Functions
// ===========================================================
function renderList() {
    const listContainer = document.getElementById('list');
    
    // Return early if not on main page
    if (!listContainer) return;

    if (filteredData.length === 0) {
        listContainer.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No results found</p>';
        return;
    }

    const listHTML = filteredData.map(venue => {
        const hasEvents = venue.events && venue.events.length > 0;
        const upcomingEvents = hasEvents ? venue.events.filter(e => isEventUpcoming(e.date)) : [];
        const hasHighlights = venue.highlights && venue.highlights.length > 0;
        
        return `
            <div class="event" data-id="${venue.id}" onclick="focusOnMap(${venue.latitude}, ${venue.longitude}, '${venue.id}')">
                <div class="category-badge">${venue.category}</div>
                <h3>${venue.name}</h3>
                <p>${venue.description}</p>
                
                ${hasHighlights ? `
                    <div style="margin: 6px 0;">
                        <div style="color: #0E718C; font-weight: 600; font-size: 11px; margin-bottom: 4px;">
                            Highlights: ${venue.highlights.length > 3 ? `<button class="show-more-btn" onclick="event.stopPropagation(); toggleHighlights('${venue.id}')">show more</button>` : ''}
                        </div>
                        <div id="highlights-${venue.id}" class="highlight-badges" style="gap: 4px;">
                            ${venue.highlights.slice(0, 3).map(h => {
                                if (h.venueId) {
                                    const subVenue = allData.find(v => v.id === h.venueId);
                                    if (subVenue) {
                                        return `<a href="venue.html?id=${subVenue.id}" class="highlight-badge" onclick="event.stopPropagation()" style="text-decoration: none; font-size: 10px; padding: 2px 6px;" title="${subVenue.description || ''}">${subVenue.name}</a>`;
                                    }
                                }
                                return `<span class="highlight-badge" style="font-size: 10px; padding: 2px 6px;" title="${h.description || ''}">${h.name}</span>`;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${upcomingEvents.length > 0 ? `
                    <div style="margin: 6px 0;">
                        <div style="color: #0E718C; font-weight: 600; font-size: 11px; margin-bottom: 4px;">
                            Upcoming Events: ${upcomingEvents.length > 1 ? `<button class="show-more-btn" onclick="event.stopPropagation(); toggleEvents('${venue.id}')">show more</button>` : ''}
                        </div>
                        <div id="events-${venue.id}" style="background: #f0f8ff; padding: 6px 8px; border-radius: 4px; font-size: 11px;">
                            <div style="color: #1976d2; font-weight: 500;">📅 ${upcomingEvents[0].title}</div>
                            <div style="color: #666; font-size: 10px; margin-top: 2px;">${upcomingEvents[0].date} ${upcomingEvents[0].startTime ? `at ${upcomingEvents[0].startTime}` : ''}</div>
                        </div>
                    </div>
                ` : ''}
                
                <small><strong>Location:</strong> ${venue.city} | <strong>Type:</strong> ${venue.type}</small>
                <div><a href="venue.html?id=${venue.id}" class="button" onclick="event.stopPropagation()">View Details</a></div>
            </div>
        `;
    }).join('');

    listContainer.innerHTML = listHTML;
}

function populateCategoryFilters() {
    const categoryFilterBadges = document.getElementById('categoryFilterBadges');

    // Clear old buttons (if needed)
    categoryFilterBadges.innerHTML = '';

    // Add default "All" button
    const allBtn = document.createElement('button');
    allBtn.className = 'primary-button filter-btn';
    allBtn.textContent = 'All Categories';
    allBtn.dataset.value = '';
    allBtn.classList.add('active'); // for select
    categoryFilterBadges.appendChild(allBtn);

    allBtn.addEventListener('click', () => {
        setActiveCategory('');
    });

    // Loop through and create a button for each category
    categories.forEach(category => {
        const btn = document.createElement('button');
        btn.className = 'primary-button filter-btn';
        btn.textContent = category;
        btn.dataset.value = category;

        btn.addEventListener('click', () => {
            setActiveCategory(category);
        });

        categoryFilterBadges.appendChild(btn);
    });
}

function populateCityFilters() {
    const cityFilterBadges = document.getElementById('cityFilterBadges');

    // Clear old buttons (if needed)
    cityFilterBadges.innerHTML = '';

    // Add default "All" button
    const defaultCityBtn = document.createElement('button');
    defaultCityBtn.className = 'primary-button filter-btn';
    defaultCityBtn.textContent = 'All Cities';
    defaultCityBtn.dataset.value = '';
    defaultCityBtn.classList.add('active'); // for select
    cityFilterBadges.appendChild(defaultCityBtn);

    defaultCityBtn.addEventListener('click', () => {
        setActiveCity('');
    });
    console.log('Cities:', cities);
    // Loop through and create a button for each category
    cities.forEach(city => {
        const btn = document.createElement('button');
        btn.className = 'primary-button filter-btn';
        btn.textContent = city;
        btn.dataset.value = city;

        btn.addEventListener('click', () => {
            setActiveCity(city);
        });

        cityFilterBadges.appendChild(btn);
    });

}

function initMap() {
    map = L.map('map', {
        maxZoom: MAX_ZOOM_LEVEL // Limit maximum zoom level
    }).setView([7.8731, 80.7718], 8);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap & CartoDB',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);
    updateMapMarkers();
}

// ===========================================================
// 4. Search & Filtering
// ===========================================================

// --- Search History chips ---
function addSearchHistory(term) {
    if (!term) return;
    if (searchHistory.includes(term)) {
        searchHistory = searchHistory.filter(t => t !== term); // Remove and re-add to front
    }
    searchHistory.unshift(term);
    if (searchHistory.length > MAX_HISTORY) searchHistory.pop();
    // renderHistory();
}

function renderHistory() {
    const container = document.getElementById('searchHistory');
    if (!container) return;
    container.innerHTML = '';
    searchHistory.forEach(term => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = term;
        chip.onclick = () => {
            document.getElementById('searchInput').value = term;
            applyFilters();
        };
        container.appendChild(chip);
    });
}

// --- Input events for search, including pressing Enter ---
const mainSearchInput = document.getElementById('searchInput');
if (mainSearchInput) {
    mainSearchInput.addEventListener('input', applyFilters);
    mainSearchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') applyFilters();
    });
}

function isEventUpcoming(dateStr) {
    if (!dateStr) return false;
    const eventDate = new Date(dateStr);
    const today = new Date();
    return eventDate >= today;
}


function setActiveCategory(value) {
    selectedCategory = value;
    document.querySelectorAll('#categoryFilterBadges button').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = [...document.querySelectorAll('#categoryFilterBadges button')].find(b => b.dataset.value === value);
    if (activeBtn) activeBtn.classList.add('active');

    applyFilters(); // reapply filters
}


function setActiveCity(value) {
    selectedCity = value;
    document.querySelectorAll('#cityFilterBadges button').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = [...document.querySelectorAll('#cityFilterBadges button')].find(b => b.dataset.value === value);
    if (activeBtn) activeBtn.classList.add('active');

    applyFilters(); // reapply filters
}

let selectedType = '';
let selectedEventType = '';
function setActiveType(value) {
    console.log('Setting active type:--', value);
    selectedType = value;
    document.querySelectorAll('#typeFilterBadges button').forEach(btn => {
        console.log('Removing active class from:', btn);
        btn.classList.remove('active');
    });

    document.querySelectorAll('#typeFilterBadges button').forEach(btn => {
        if (value) {
            if (btn.dataset.value.trim().toLowerCase() === value.trim().toLowerCase()) {
                btn.classList.add('active');
            }
        } else {
            if (btn.dataset.value.trim().toLowerCase() === 'All') {
                btn.classList.add('active');
            }
        }
    });

    // Toggle event time filter visibility
    const eventFilters = document.querySelector('.event-filters');
    const eventDateRangeFilters = document.querySelector('.event-filter-date');
    
    if (value === 'EventVenue') {
        eventFilters.classList.remove('hidden');
        // Keep date range hidden unless Custom Range is selected
        if (selectedEventType !== 'Custom Range') {
            eventDateRangeFilters.classList.add('hidden');
        }
    } else {
        // Hide both event time filters and date range for All and Attraction
        eventFilters.classList.add('hidden');
        eventDateRangeFilters.classList.add('hidden');
        // Reset event type selection when switching away from EventVenue
        selectedEventType = '';
    }

    applyFilters(); // reapply filters
}


function setActiveEventType(value) {
    selectedEventType = value;
    document.querySelectorAll('#eventTypeFilterBadges button').forEach(btn => {
        btn.classList.remove('active');
    });

    document.querySelectorAll('#eventTypeFilterBadges button').forEach(btn => {
        if (value) {
            if (btn.dataset.value.trim().toLowerCase() === value.trim().toLowerCase()) {
                btn.classList.add('active');
            }
        } else {
            if (btn.dataset.value.trim().toLowerCase() === 'All Upcoming') {
                btn.classList.add('active');
            }
        }
    });

    // Toggle event date ranger filter visibility
    const eventDateRangeFilters = document.querySelector('.event-filter-date');
    if (value === 'Custom Range') {
        eventDateRangeFilters.classList.remove('hidden');
    } else {
        eventDateRangeFilters.classList.add('hidden');
    }

    applyFilters(); // reapply filters
}

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    // Add to history (only if not from sync call)
    if (event && event.target && event.target.id === 'searchInput' && searchTerm) {
        addSearchHistory(searchTerm);
    }
    const categoryFilter = selectedCategory; //document.getElementById('categoryFilter').value;
    const typeFilter = selectedType; //document.getElementById('typeFilter').value;
    const eventDateFilter = selectedEventType; //document.getElementById('eventDateFilter').value;
    const cityFilter = selectedCity; //document.getElementById('cityFilter').value;

    const from = document.getElementById('dateRangeFrom').value;
    const to = document.getElementById('dateRangeTo').value;

    console.log('Applying filters with values:', { from, to, eventDateFilter, typeFilter });

    console.log('Applying filters:', {
        categoryFilter, typeFilter, eventDateFilter, cityFilter
    });
    filteredData = allData.filter(venue => {
        console.log('Checking venue:', venue);
        // Search filter
        const matchesSearch = venue.name.toLowerCase().includes(searchTerm) ||
            venue.description.toLowerCase().includes(searchTerm) ||
            venue.city.toLowerCase().includes(searchTerm);

        // Category filter
        const matchesCategory = !categoryFilter || venue.category === categoryFilter;
        console.log('Match date matchesCategory:', matchesCategory);
        // Type filter (case-insensitive)
        // For EventVenue: show venues that are EventVenue type OR have events (attractions with events)
        const matchesType = !typeFilter || 
            venue.type.toLowerCase() === typeFilter.toLowerCase() ||
            (typeFilter.toLowerCase() === 'eventvenue' && venue.hasEvent === true);
        console.log('Match date matchesType:', matchesType);
        // City filter
        const matchesCity = !cityFilter || venue.city === cityFilter;
        console.log('Match date matchesCity:', matchesCity);
        // Event date filter
        const matchesEventDate = filterByEventDate(venue, eventDateFilter, from, to);
        console.log('Match date range:', matchesEventDate);

        return matchesSearch && matchesCategory && matchesType && matchesCity && matchesEventDate;
    });

    // This part is *different* — supports tags, category, and name
    filteredData = allData.filter(venue => {
        const name = venue.name?.toLowerCase() || '';
        const desc = venue.description?.toLowerCase() || '';
        const city = venue.city?.toLowerCase() || '';
        const category = venue.category?.toLowerCase() || '';
        const tags = (venue.tags || []).map(t => t.toLowerCase()).join(' ');
        const highlights = (venue.highlights || []).map(h => h.name?.toLowerCase() || '').join(' ');

        const matchesSearch =
            !searchTerm ||
            name.includes(searchTerm) ||
            desc.includes(searchTerm) ||
            city.includes(searchTerm) ||
            category.includes(searchTerm) ||
            tags.includes(searchTerm) ||
            highlights.includes(searchTerm);

        const matchesCategory = !selectedCategory || venue.category === selectedCategory;
        const matchesCity = !selectedCity || venue.city === selectedCity;
        // For EventVenue: show venues that are EventVenue type OR have events (attractions with events)
        const matchesType = !selectedType || 
            venue.type.toLowerCase() === selectedType.toLowerCase() ||
            (selectedType.toLowerCase() === 'eventvenue' && venue.hasEvent === true);
        const matchesEventDate = typeof filterByEventDate === "function"
            ? filterByEventDate(venue, selectedEventType,
                document.getElementById('dateRangeFrom')?.value || "",
                document.getElementById('dateRangeTo')?.value || "")
            : true;

        return matchesSearch && matchesCategory && matchesCity && matchesType && matchesEventDate;
    });

    renderList();
    updateMapMarkers();
    zoomToFitFilteredMarkers(); // Zoom to fit all visible markers
    renderHistory();
}

function filterByEventDate(venue, filter, from, to) {
    if (!filter) return true;
    if (!venue.events || venue.events.length === 0) return true;

    const today = new Date();
    const hasMatchingEvent = venue.events.some(event => {
        const eventDate = new Date(event.date);

        switch (filter) {
            case 'Today':
                return eventDate.toDateString() === today.toDateString();
            case 'This Week':
                const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
                return eventDate >= today && eventDate <= weekFromNow;
            case 'This Month':
                const monthFromNow = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
                return eventDate >= today && eventDate <= monthFromNow;
            case 'Custom Range':
                if (!from || !to) return false; // If no custom range is set
                const fromDate = new Date(from);
                const toDate = new Date(to);
                return eventDate >= fromDate && eventDate <= toDate;
            default:
                return true;
        }
    });

    return hasMatchingEvent;
}

function focusOnMap(lat, lng, venueId) {
    if (map && lat && lng) {
        map.setView([lat, lng], MAX_ZOOM_LEVEL - 2);

        // Find and open the popup for this marker using venue ID
        const marker = markersMap.get(venueId);
        
        if (marker) {
            // If marker is in a cluster, we need to zoom to show it individually
            const markerLatLng = marker.getLatLng();
            if (markerCluster.hasLayer(marker)) {
                // Check if marker is currently visible (not clustered)
                const visibleMarkers = markerCluster.getVisibleParent(marker);
                if (visibleMarkers === marker) {
                    // Marker is visible, open popup
                    marker.openPopup();
                } else {
                    // Marker is clustered, zoom in more to show it
                    map.setView([markerLatLng.lat, markerLatLng.lng], MAX_ZOOM_LEVEL);
                    setTimeout(() => {
                        marker.openPopup();
                    }, 300); // Small delay to allow map to finish zooming
                }
            }
        }
    }
}

function highlightListItem(venueId) {
    // Remove previous highlights
    document.querySelectorAll('.event').forEach(el => el.classList.remove('highlighted'));

    // Highlight the selected item
    const listItem = document.querySelector(`[data-id="${venueId}"]`);
    if (listItem) {
        listItem.classList.add('highlighted');
        listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function toggleFilters() {
    const filters = document.getElementById('filters');
    const overlay = document.getElementById('mobileOverlay');

    filters.classList.toggle('hidden');

    // Handle mobile overlay
    if (window.innerWidth <= 768) {
        overlay.classList.toggle('active');
    }
}



function closeMobileFilters() {
    const filters = document.getElementById('filters');
    const overlay = document.getElementById('mobileOverlay');

    filters.classList.add('hidden');
    overlay.classList.remove('active');
}

// Handle responsive design
function switchMobileTab(view) {
    const sidebar = document.getElementById('sidebar');
    const mapContainer = document.querySelector('.map-container');
    const tabs = document.querySelectorAll('.mobile-tab');
    const filterToggleBtn = document.getElementById('filterToggleBtn');

    // Update tab active states
    tabs.forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');

    if (view === 'list') {
        sidebar.classList.add('show-mobile');
        mapContainer.classList.remove('show-mobile');
        filterToggleBtn.style.display = 'none';
    } else {
        sidebar.classList.remove('show-mobile');
        mapContainer.classList.add('show-mobile');
        filterToggleBtn.style.display = 'none'; // Keep hidden on mobile map view
        if (map) {
            setTimeout(() => map.invalidateSize(), 300);
        }
    }
}

function toggleMobileFilters() {
    toggleFilters();
}

function handleResize() {
    const mobileTabs = document.getElementById('mobileTabs');
    const mobileSearchBar = document.getElementById('mobileSearchBar');
    const sidebar = document.getElementById('sidebar');
    const mapContainer = document.querySelector('.map-container');
    const filterToggleBtn = document.getElementById('filterToggleBtn');

    if (window.innerWidth <= 768) {
        mobileTabs.style.display = 'flex';
        mobileSearchBar.style.display = 'block';
        filterToggleBtn.style.display = 'none';
        // Default to list view on mobile
        sidebar.classList.add('show-mobile');
        mapContainer.classList.remove('show-mobile');
    } else {
        mobileTabs.style.display = 'none';
        mobileSearchBar.style.display = 'none';
        filterToggleBtn.style.display = 'flex';
        sidebar.classList.remove('hidden-mobile', 'show-mobile');
        mapContainer.classList.remove('show-mobile');
        mapContainer.style.display = 'block';
        closeMobileFilters();
    }

    if (map) {
        setTimeout(() => map.invalidateSize(), 100);
    }
}

// Sync mobile and desktop search inputs
function syncSearchInputs() {
    const desktopSearch = document.getElementById('searchInput').value;
    const mobileSearch = document.getElementById('mobileSearchInput').value;

    if (event.target.id === 'searchInput') {
        document.getElementById('mobileSearchInput').value = desktopSearch;
    } else {
        document.getElementById('searchInput').value = mobileSearch;
    }
    applyFilters();
}

// Event listeners (with null checks)
const syncSearchInput = document.getElementById('searchInput');
const syncMobileSearchInput = document.getElementById('mobileSearchInput');
const dateFromInput = document.getElementById('dateRangeFrom');
const dateToInput = document.getElementById('dateRangeTo');

if (syncSearchInput) syncSearchInput.addEventListener('input', syncSearchInputs);
if (syncMobileSearchInput) syncMobileSearchInput.addEventListener('input', syncSearchInputs);
if (dateFromInput) dateFromInput.addEventListener('change', applyFilters);
if (dateToInput) dateToInput.addEventListener('change', applyFilters);
// document.getElementById('categoryFilter').addEventListener('change', applyFilters);
// document.getElementById('typeFilter').addEventListener('change', applyFilters);
// document.getElementById('eventDateFilter').addEventListener('change', applyFilters);
// document.getElementById('cityFilter').addEventListener('change', applyFilters);

// ===========================================================
// 6. Universal Search Suggestions (Desktop & Mobile)
// ===========================================================
function showSuggestionsUniversal(inputEl, suggestionBoxEl) {
    const input = inputEl.value.toLowerCase().trim();
    if (!input) {
        suggestionBoxEl.style.display = "none";
        suggestionBoxEl.innerHTML = "";
        return;
    }

    let suggestions = [];
    allData.forEach(v => {
        if (v.name && v.name.toLowerCase().includes(input))
            suggestions.push({ label: v.name, type: "venue", category: v.category || "" });
    });
    allData.forEach(v => (v.tags || []).forEach(t => {
        if (t.toLowerCase().includes(input))
            suggestions.push({ label: t, type: "tag", category: v.category || "" });
    }));
    allData.forEach(v => {
        if (v.city && v.city.toLowerCase().includes(input))
            suggestions.push({ label: v.city, type: "city", category: "" });
    });
    allData.forEach(v => {
        if (v.category && v.category.toLowerCase().includes(input))
            suggestions.push({ label: v.category, type: "category", category: "" });
    });
    allData.forEach(v => (v.highlights || []).forEach(h => {
        if (h.name && h.name.toLowerCase().includes(input))
            suggestions.push({ label: h.name, type: "highlight", category: v.category || "" });
    }));

    let unique = {};
    suggestions.forEach(s => {
        unique[s.type + "|" + s.label] = s;
    });
    let uniqueSuggestions = Object.values(unique).slice(0, 8);

    if (uniqueSuggestions.length === 0) {
        suggestionBoxEl.style.display = "none";
        suggestionBoxEl.innerHTML = "";
        return;
    }

    suggestionBoxEl.innerHTML = uniqueSuggestions.map(s => `
                <div class="search-suggestion-item" data-type="${s.type}" data-label="${s.label}">
                    <span>${s.label}</span>
                    ${s.type === 'venue' && s.category ? `<span class="cat-badge">${s.category}</span>` : ''}
                    ${s.type === 'category' ? `<span class="cat-badge category">${s.label}</span>` : ''}
                    ${s.type === 'tag' ? `<span class="cat-badge tag">Tag</span>` : ''}
                    ${s.type === 'city' ? `<span class="cat-badge city">City</span>` : ''}
                    ${s.type === 'highlight' ? `<span class="cat-badge highlight">Highlight</span>` : ''}
                </div>
            `).join('');
    suggestionBoxEl.style.display = "block";

    suggestionBoxEl.querySelectorAll('.search-suggestion-item').forEach(item => {
        item.onclick = () => {
            inputEl.value = item.getAttribute('data-label');
            // Sync both inputs
            if (inputEl.id === "searchInput") {
                document.getElementById('mobileSearchInput').value = item.getAttribute('data-label');
            } else if (inputEl.id === "mobileSearchInput") {
                document.getElementById('searchInput').value = item.getAttribute('data-label');
            }
            suggestionBoxEl.style.display = "none";
            applyFilters();
        };
    });
}

function isRunningStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
}


// ===========================================================
// 7. PWA Service Worker Support
// ===========================================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').then(registration => {
            console.log('✅ Service Worker registered:', registration);

            // Wait for a controller to be active before checking for updates
            if (!navigator.serviceWorker.controller) {
                console.log('ℹ️ No SW controller yet — likely first install. Skipping update check.');
                return;
            }

            registration.onupdatefound = () => {
                const newWorker = registration.installing;

                newWorker.onstatechange = () => {
                    if (newWorker.state === 'installed') {
                        if (isRunningStandalone()) {
                            console.log('📣 New version found — showing update banner');
                            const banner = document.getElementById('updateBanner');
                            if (banner) banner.style.display = 'flex';

                            const reloadBtn = document.getElementById('reloadBtn');
                            if (reloadBtn) {
                                reloadBtn.addEventListener('click', () => {
                                    newWorker.postMessage({ action: 'skipWaiting' });
                                });
                            }
                        } else {
                            console.log('🔕 New version available but not showing banner (not standalone)');
                        }
                    }
                };
            };

            // Reload the app when the new service worker takes control
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
            });
        }).catch(err => {
            console.error('❌ Service Worker registration failed:', err);
        });
    });
}

function toggleHighlights(venueId) {
    const venue = filteredData.find(v => v.id === venueId);
    if (!venue || !venue.highlights) return;
    
    const el = document.getElementById('highlights-' + venueId);
    if (!el) return;
    
    // Toggle all highlights
    const showingAll = el.classList.toggle('expanded');
    const highlightsToShow = showingAll ? venue.highlights : venue.highlights.slice(0, 3);
    
    el.innerHTML = highlightsToShow
        .map(h => {
            if (h.venueId) {
                const subVenue = allData.find(v => v.id === h.venueId);
                if (subVenue) {
                    return `<a href="venue.html?id=${subVenue.id}" class="highlight-badge" onclick="event.stopPropagation()" style="text-decoration: none; font-size: 10px; padding: 2px 6px;" title="${subVenue.description || ''}">${subVenue.name}</a>`;
                }
            }
            return `<span class="highlight-badge" style="font-size: 10px; padding: 2px 6px;" title="${h.description || ''}">${h.name}</span>`;
        })
        .join('');
    
    // Change button text
    const btn = el.parentElement.querySelector('.show-more-btn');
    if (btn) btn.textContent = showingAll ? 'show less' : 'show more';
}

function toggleEvents(venueId) {
    const venue = filteredData.find(v => v.id === venueId);
    if (!venue || !venue.events) return;
    
    const upcomingEvents = venue.events.filter(e => isEventUpcoming(e.date));
    if (upcomingEvents.length <= 1) return;
    
    const el = document.getElementById('events-' + venueId);
    if (!el) return;
    
    // Toggle all events
    const showingAll = el.classList.toggle('expanded');
    const eventsToShow = showingAll ? upcomingEvents : upcomingEvents.slice(0, 1);
    
    el.innerHTML = eventsToShow
        .map(event => `
            <div style="margin-bottom: ${eventsToShow.length > 1 ? '8px' : '0'};">
                <div style="color: #1976d2; font-weight: 500;">📅 ${event.title}</div>
                <div style="color: #666; font-size: 10px; margin-top: 2px;">${event.date} ${event.startTime ? `at ${event.startTime}` : ''}</div>
                ${event.description ? `<div style="color: #555; font-size: 10px; margin-top: 1px;">${event.description}</div>` : ''}
            </div>
        `)
        .join('');
    
    // Change button text
    const btn = el.parentElement.querySelector('.show-more-btn');
    if (btn) btn.textContent = showingAll ? 'show less' : 'show more';
}

// ===========================================================
// 8. Directions Function
// ===========================================================
function getDirections(lat, lng) {
    // Check if we're on mobile
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        // Show clickable options for mobile users
        showDirectionsModal(lat, lng);
    } else {
        // Desktop - open Google Maps in new tab
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
    }
}

function showDirectionsModal(lat, lng) {
    const options = [
        { name: 'Google Maps', url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` },
        { name: 'Apple Maps', url: `maps://maps.google.com/maps?daddr=${lat},${lng}&ll=` },
        { name: 'Waze', url: `waze://ul?ll=${lat},${lng}&navigate=yes` },
        { name: 'Maps.me', url: `mapsme://route?sll=${lat},${lng}&saddr=My+Location&daddr=Destination` }
    ];
    
    // Create modal HTML
    const modalHTML = `
        <div id="directionsModal" style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            font-family: 'Roboto', Arial, sans-serif;
        " onclick="closeDirectionsModal()">
            <div style="
                background: #FDFDFD;
                border-radius: 8px;
                padding: 12px;
                width: 260px;
                box-shadow: 0 4px 16px rgba(14, 113, 140, 0.12);
                border: 1px solid #e0e0e0;
            " onclick="event.stopPropagation()">
                <h3 style="
                    margin: 0 0 12px 0;
                    color: #0E718C;
                    font-size: 15px;
                    font-weight: 600;
                ">Choose Maps App</h3>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${options.map(option => `
                        <button onclick="openMapApp('${option.url}')" style="
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 8px 12px;
                            border: 1px solid #e0e0e0;
                            border-radius: 6px;
                            background: white;
                            cursor: pointer;
                            font-size: 13px;
                            font-weight: 500;
                            transition: all 0.2s ease;
                            color: #333;
                        " onmouseover="this.style.borderColor='#0E718C'; this.style.background='#f8f9fa'" 
                           onmouseout="this.style.borderColor='#e0e0e0'; this.style.background='white'">
                            ${option.name}
                        </button>
                    `).join('')}
                </div>
                <button onclick="closeDirectionsModal()" style="
                    width: 100%;
                    margin-top: 8px;
                    padding: 6px;
                    border: 1px solid #e0e0e0;
                    border-radius: 6px;
                    background: #f5f5f5;
                    cursor: pointer;
                    font-size: 11px;
                    color: #666;
                ">Cancel</button>
            </div>
        </div>
    `;
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function openMapApp(url) {
    window.open(url);
    closeDirectionsModal();
}

function closeDirectionsModal() {
    const modal = document.getElementById('directionsModal');
    if (modal) {
        modal.remove();
    }
}

// ===========================================================
// 9. Cache and Update Management
// ===========================================================

function showUpdateBanner() {
    const banner = document.getElementById('updateBanner');
    if (banner) {
        banner.style.display = 'flex';
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            banner.style.display = 'none';
        }, 10000);
        
        // Handle refresh button
        const reloadBtn = document.getElementById('reloadBtn');
        if (reloadBtn) {
            reloadBtn.onclick = () => {
                // Clear all caches and reload
                if ('caches' in window) {
                    caches.keys().then(names => {
                        names.forEach(name => {
                            if (name.includes('data-cache')) {
                                caches.delete(name);
                            }
                        });
                        window.location.reload();
                    });
                } else {
                    window.location.reload();
                }
            };
        }
    }
}

// Manual cache refresh function
function refreshData() {
    if ('caches' in window) {
        caches.keys().then(names => {
            const dataCache = names.find(name => name.includes('data-cache'));
            if (dataCache) {
                caches.delete(dataCache).then(() => {
                    loadData(); // Reload fresh data
                });
            }
        });
    }
}

// ===========================================================
// 10. DOMContentLoaded / Event Bindings
// ===========================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize
    loadData();
    handleResize();
    
    // Register service worker and handle updates
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => {
                console.log('Service Worker registered');
                
                // Listen for data updates from service worker
                navigator.serviceWorker.addEventListener('message', event => {
                    if (event.data.type === 'DATA_UPDATED') {
                        showUpdateBanner();
                    }
                });
            })
            .catch(error => console.log('Service Worker registration failed'));
    }
// Desktop search input (only if element exists)
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', function () {
        showSuggestionsUniversal(
            document.getElementById('searchInput'),
            document.getElementById('searchSuggestions')
        );
    });
}

// Mobile search input (only if element exists)
const mobileSearchInput = document.getElementById('mobileSearchInput');
if (mobileSearchInput) {
    mobileSearchInput.addEventListener('input', function () {
        showSuggestionsUniversal(
            document.getElementById('mobileSearchInput'),
            document.getElementById('mobileSearchSuggestions')
        );
    });
}

// Hide suggestions if clicking outside (only if elements exist)
document.addEventListener('click', function (e) {
    const desktopInput = document.getElementById('searchInput');
    const desktopBox = document.getElementById('searchSuggestions');
    const mobileInput = document.getElementById('mobileSearchInput');
    const mobileBox = document.getElementById('mobileSearchSuggestions');

    if (desktopInput && desktopBox && !desktopInput.contains(e.target) && !desktopBox.contains(e.target)) {
        desktopBox.style.display = "none";
    }
    if (mobileInput && mobileBox && !mobileInput.contains(e.target) && !mobileBox.contains(e.target)) {
        mobileBox.style.display = "none";
    }
});

window.addEventListener('resize', handleResize);

});