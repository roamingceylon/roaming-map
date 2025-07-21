// ===========================================================
// 1. Global Variables & Initialization
// ===========================================================
let map;
let allData = [];
let filteredData = [];
let categories = new Set();
let cities = new Set();
let markerCluster = null;
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

        populateCategoryFilters();
        populateCityFilters();
        renderList();
        initMap();
    } catch (error) {
        document.getElementById('list').innerHTML = '<p>Error loading data</p>';
    }
}

function updateMapMarkers() {
    // Remove old cluster
    if (markerCluster) {
        markerCluster.clearLayers();
        map.removeLayer(markerCluster);
    }
    markerCluster = L.markerClusterGroup();
    filteredData.forEach(venue => {
        if (venue.latitude && venue.longitude) {
            const marker = L.marker([venue.latitude, venue.longitude])
                .bindPopup(`
                    <div style="min-width: 200px;">
                        <h4 style="margin: 0 0 8px 0;">${venue.name}</h4>
                        <p style="margin: 4px 0; color: #666;">${venue.description}</p>
                        <div style="margin: 8px 0;">
                            <span style="background: #1976d2; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${venue.category}</span>
                        </div>
                        <a href="venue.html?id=${venue.id}" class="button" style="margin-top: 10px; display: inline-block; background-color: #0E718C; color: white; padding: 6px 12px; border-radius: 4px; font-size: 12px; text-decoration: none;">View Details</a>
                    </div>
                `);
            marker.on('click', () => highlightListItem(venue.id));
            markerCluster.addLayer(marker);
        }
    });
    map.addLayer(markerCluster);
}

// ===========================================================
// 3. UI Rendering Functions
// ===========================================================
function renderList() {
    const listContainer = document.getElementById('list');

    if (filteredData.length === 0) {
        listContainer.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No results found</p>';
        return;
    }

    const listHTML = filteredData.map(venue => {
        const hasEvents = venue.events && venue.events.length > 0;
        const upcomingEvents = hasEvents ? venue.events.filter(e => isEventUpcoming(e.date)) : [];

        const hasHighlights = venue.highlights && venue.highlights.length > 0;
        console.log(venue)
        return `
                    <div class="event" data-id="${venue.id}" onclick="focusOnMap(${venue.latitude}, ${venue.longitude}, '${venue.id}')">
                        <div class="category-badge">${venue.category}</div>
                        <h3>${venue.name}</h3>
                        <p>${venue.description}</p>
                        ${upcomingEvents.length > 0 ? `
                            <div style="background: #f0f8ff; padding: 8px; border-radius: 4px; margin: 8px 0;">
                                <strong style="color: #1976d2;">Upcoming Event:</strong><br>
                                ${upcomingEvents.map(e => `
                                <small>${e.title} - ${e.date}</small>
                                `).join('<br>')}
                            </div>
                        ` : ''}
                        ${hasHighlights ? `
                            <div style="background: #f0f8ff; padding: 8px; border-radius: 4px; margin: 8px 0;">
                                <strong style="color: #1976d2;">Highlights:</strong>
                                <div class="highlight-badges" id="highlights-${venue.id}">
                                ${venue.highlights.slice(0, 5).map(h => {
            if (h.venueId) {
                const subVenue = allData.find(v => v.id === h.venueId);
                if (subVenue) {
                    return `
                                        <a href="venue.html?id=${subVenue.id}" class="highlight-badge" title="${subVenue.description || ''}">
                                            <span style="color:#1766ac;">${subVenue.name}</span>
                                        </a>
                                        `;
                }
            }
            return `
                                    <span class="highlight-badge" title="${h.description || ''}">${h.name}</span>
                                    `;
        }).join('')}
                                </div>
                                ${venue.highlights.length > 5 ? `
                                <button class="show-more-btn" onclick="toggleHighlights('${venue.id}')">Show More</button>
                                ` : ''}
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
    map = L.map('map').setView([7.8731, 80.7718], 8);
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
document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('searchInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') applyFilters();
});

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
    if (value === 'EventVenue') {
        eventFilters.classList.remove('hidden');
    } else {
        eventFilters.classList.add('hidden');
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
        // Type filter
        const matchesType = !typeFilter || venue.type === typeFilter;
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
        const matchesType = !selectedType || venue.type === selectedType;
        const matchesEventDate = typeof filterByEventDate === "function"
            ? filterByEventDate(venue, selectedEventType,
                document.getElementById('dateRangeFrom')?.value || "",
                document.getElementById('dateRangeTo')?.value || "")
            : true;

        return matchesSearch && matchesCategory && matchesCity && matchesType && matchesEventDate;
    });

    renderList();
    updateMapMarkers();
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
        map.setView([lat, lng], 15);

        // Find and open the popup for this marker
        const marker = markers.find(m => {
            const markerLatLng = m.getLatLng();
            return Math.abs(markerLatLng.lat - lat) < 0.0001 && Math.abs(markerLatLng.lng - lng) < 0.0001;
        });

        if (marker) {
            marker.openPopup();
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

// Event listeners
document.getElementById('searchInput').addEventListener('input', syncSearchInputs);
document.getElementById('mobileSearchInput').addEventListener('input', syncSearchInputs);
document.getElementById('dateRangeFrom').addEventListener('change', applyFilters);
document.getElementById('dateRangeTo').addEventListener('change', applyFilters);
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
    if (!venue) return;
    const el = document.getElementById('highlights-' + venueId);
    if (!el) return;
    // Toggle all highlights
    const showingAll = el.classList.toggle('expanded');
    const highlightsToShow = showingAll ? venue.highlights : venue.highlights.slice(0, 5);
    el.innerHTML = highlightsToShow
        .map(h => {
            if (h.venueId) {
                const subVenue = allData.find(v => v.id === h.venueId);
                if (subVenue) {
                    return `
                        <a href="venue.html?id=${subVenue.id}" class="highlight-badge" title="${subVenue.description || ''}">
                            <span style="color:#1766ac;">${subVenue.name}</span>
                        </a>
                    `;
                }
            }
            return `<span class="highlight-badge" title="${h.description || ''}">${h.name}</span>`;
        })
        .join('');
    // Change button text
    const btn = el.parentElement.querySelector('.show-more-btn');
    if (btn) btn.textContent = showingAll ? 'Show Less' : 'Show More';
}

// ===========================================================
// 8. DOMContentLoaded / Event Bindings
// ===========================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize
    loadData();
    handleResize();
// Desktop search input
document.getElementById('searchInput').addEventListener('input', function () {
    showSuggestionsUniversal(
        document.getElementById('searchInput'),
        document.getElementById('searchSuggestions')
    );
});
// Mobile search input
document.getElementById('mobileSearchInput').addEventListener('input', function () {
    showSuggestionsUniversal(
        document.getElementById('mobileSearchInput'),
        document.getElementById('mobileSearchSuggestions')
    );
});

// Hide suggestions if clicking outside
document.addEventListener('click', function (e) {
    const desktopInput = document.getElementById('searchInput');
    const desktopBox = document.getElementById('searchSuggestions');
    const mobileInput = document.getElementById('mobileSearchInput');
    const mobileBox = document.getElementById('mobileSearchSuggestions');

    if (!desktopInput.contains(e.target) && !desktopBox.contains(e.target)) {
        desktopBox.style.display = "none";
    }
    if (!mobileInput.contains(e.target) && !mobileBox.contains(e.target)) {
        mobileBox.style.display = "none";
    }
});

window.addEventListener('resize', handleResize);

});