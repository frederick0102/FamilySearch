// ==================== GLOBÁLIS VÁLTOZÓK ====================
let persons = [];
let marriages = [];
let events = [];
let trash = [];
let settings = {};
let currentPersonId = null;

// Flatpickr példányok
let datePickers = {};

// ==================== API HÍVÁSOK ====================
const API = {
    async get(endpoint) {
        const response = await fetch(`/api${endpoint}`);
        if (!response.ok) throw new Error('API hiba');
        return response.json();
    },
    
    async post(endpoint, data) {
        const response = await fetch(`/api${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            let detail = 'API hiba';
            try {
                const err = await response.json();
                detail = err.error || JSON.stringify(err);
            } catch (e) {}
            throw new Error(detail);
        }
        return response.json();
    },
    
    async put(endpoint, data) {
        const response = await fetch(`/api${endpoint}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('API hiba');
        return response.json();
    },
    
    async delete(endpoint) {
        const response = await fetch(`/api${endpoint}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('API hiba');
        return response.status === 204 ? null : response.json();
    },
    
    async uploadFile(endpoint, formData) {
        const response = await fetch(`/api${endpoint}`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Feltöltési hiba');
        return response.json();
    }
};

// ==================== ÉRTESÍTÉSEK ====================
function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ==================== NÉZET VÁLTÁS ====================
function initNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');
    const navbarToggle = document.getElementById('navbar-toggle');
    const navbarMenu = document.getElementById('navbar-menu');
    
    console.log('Navigation init - found buttons:', navBtns.length, 'views:', views.length);
    
    // Mobil menü kapcsoló
    if (navbarToggle && navbarMenu) {
        navbarToggle.addEventListener('click', () => {
            navbarMenu.classList.toggle('show');
            // Ikon váltás
            const icon = navbarToggle.querySelector('i');
            if (navbarMenu.classList.contains('show')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
    }
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const viewId = btn.dataset.view;
            console.log('Navigating to:', viewId);
            
            navBtns.forEach(b => b.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            
            btn.classList.add('active');
            const targetView = document.getElementById(`${viewId}-view`);
            console.log('Target view:', targetView);
            
            if (targetView) {
                targetView.classList.add('active');
                console.log('View classes after:', targetView.classList.toString());
            } else {
                console.error('View not found:', `${viewId}-view`);
            }
            
            // Mobil menü bezárása nézet váltáskor
            if (navbarMenu && navbarMenu.classList.contains('show')) {
                navbarMenu.classList.remove('show');
                const icon = navbarToggle.querySelector('i');
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
            
            // Adatok frissítése nézet váltáskor
            try {
                if (viewId === 'persons') await loadPersonsList();
                if (viewId === 'trash') await loadTrash();
                if (viewId === 'stats') await loadStats();
                if (viewId === 'tree') updateTree();
                if (viewId === 'settings') await loadSettings();
            } catch (error) {
                console.error('Nézet betöltési hiba:', error);
            }
        });
    });
}

// ==================== SZEMÉLYEK LISTA ====================
async function loadPersonsList() {
    try {
        persons = await API.get('/persons');
        marriages = await API.get('/marriages');  // Kell a kapcsolódás szűréshez
        renderPersonsList();
    } catch (error) {
        showNotification('Hiba az adatok betöltésekor', 'error');
    }
}

function renderPersonsList() {
    const grid = document.getElementById('persons-grid');
    
    if (persons.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <h3>Nincs még családtag</h3>
                <p>Kattintson az "Új személy" gombra az első családtag hozzáadásához.</p>
                <button class="btn btn-primary" onclick="openPersonModal()">
                    <i class="fas fa-plus"></i> Új személy
                </button>
            </div>
        `;
        return;
    }
    
    // Szűrés
    const genderFilter = document.getElementById('filter-gender').value;
    const statusFilter = document.getElementById('filter-status').value;
    const connectionFilter = document.getElementById('filter-connection')?.value || '';
    const searchQuery = document.getElementById('persons-search')?.value?.toLowerCase() || '';
    const sortBy = document.getElementById('sort-by').value;
    
    let filtered = [...persons];
    
    // Szöveges keresés
    if (searchQuery.length >= 2) {
        filtered = filtered.filter(p => {
            const fullName = (p.full_name || '').toLowerCase();
            const displayName = (p.display_name || '').toLowerCase();
            const maidenName = (p.maiden_name || '').toLowerCase();
            const nickname = (p.nickname || '').toLowerCase();
            return fullName.includes(searchQuery) || 
                   displayName.includes(searchQuery) ||
                   maidenName.includes(searchQuery) ||
                   nickname.includes(searchQuery);
        });
    }
    
    if (genderFilter) {
        filtered = filtered.filter(p => p.gender === genderFilter);
    }
    
    if (statusFilter === 'alive') {
        filtered = filtered.filter(p => p.is_alive);
    } else if (statusFilter === 'deceased') {
        filtered = filtered.filter(p => !p.is_alive);
    }
    
    // Kapcsolódás szűrés
    if (connectionFilter === 'connected') {
        // Van szülője (parent_family_id) VAGY van házassága
        const personsWithMarriage = new Set();
        marriages.forEach(m => {
            personsWithMarriage.add(m.person1_id);
            personsWithMarriage.add(m.person2_id);
        });
        filtered = filtered.filter(p => p.parent_family_id || personsWithMarriage.has(p.id));
    } else if (connectionFilter === 'unconnected') {
        // Nincs szülője ÉS nincs házassága
        const personsWithMarriage = new Set();
        marriages.forEach(m => {
            personsWithMarriage.add(m.person1_id);
            personsWithMarriage.add(m.person2_id);
        });
        filtered = filtered.filter(p => !p.parent_family_id && !personsWithMarriage.has(p.id));
    }
    
    // Rendezés
    if (sortBy === 'name') {
        filtered.sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '', 'hu'));
    } else if (sortBy === 'name-desc') {
        filtered.sort((a, b) => (b.last_name || '').localeCompare(a.last_name || '', 'hu'));
    } else if (sortBy === 'birth') {
        filtered.sort((a, b) => {
            if (!a.birth_date) return 1;
            if (!b.birth_date) return -1;
            return a.birth_date.localeCompare(b.birth_date);
        });
    } else if (sortBy === 'birth-desc') {
        filtered.sort((a, b) => {
            if (!a.birth_date) return 1;
            if (!b.birth_date) return -1;
            return b.birth_date.localeCompare(a.birth_date);
        });
    } else if (sortBy === 'recent') {
        filtered.sort((a, b) => b.id - a.id);
    }
    
    // Üres keresési eredmény
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>Nincs találat</h3>
                <p>A keresési feltételeknek megfelelő személy nem található.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filtered.map(person => `
        <div class="person-card ${person.gender} ${!person.is_alive ? 'deceased' : ''}" 
             onclick="openPersonModal(${person.id})">
              <img src="${person.photo_path || '/static/img/placeholder-avatar.svg'}" 
                 alt="${person.full_name}" class="person-photo">
            <div class="person-info">
                <h3>${person.display_name}</h3>
                <div class="person-dates">
                    <i class="fas fa-birthday-cake"></i>
                    <span>${formatDate(person.birth_date) || 'Ismeretlen'}</span>
                    ${!person.is_alive ? `
                        <i class="fas fa-cross" style="margin-left: 10px;"></i>
                        <span>${formatDate(person.death_date)}</span>
                    ` : ''}
                </div>
                ${person.occupation ? `<p><i class="fas fa-briefcase"></i> ${person.occupation}</p>` : ''}
                ${person.birth_place ? `<p><i class="fas fa-map-marker-alt"></i> ${person.birth_place}</p>` : ''}
            </div>
        </div>
    `).join('');
}

// ==================== LOMTÁR ====================
async function loadTrash() {
    try {
        trash = await API.get('/trash');
        renderTrash();
        // Backup-ok betöltése is
        await loadBackups();
    } catch (error) {
        showNotification('Hiba a lomtár betöltésekor', 'error');
    }
}

function renderTrash() {
    const container = document.getElementById('trash-list');
    if (!container) return;

    if (!trash.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-trash-restore"></i>
                <h3>A lomtár üres</h3>
                <p>A törölt elemek itt jelennek meg, és innen állíthatók vissza.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = trash.map(item => {
        const label = getEntityLabel(item.entity_type);
        const title = getTrashTitle(item);
        const deletedAt = item.deleted_at ? new Date(item.deleted_at + 'Z').toLocaleString('hu-HU') : 'Ismeretlen időpont';
        return `
            <div class="trash-card">
                <div class="trash-info">
                    <div class="trash-entity">
                        <span class="badge">${label}</span>
                        <span>#${item.entity_id}</span>
                    </div>
                    <div class="trash-title">${title}</div>
                    <div class="trash-meta">Törölve: ${deletedAt}</div>
                </div>
                <div class="trash-actions">
                    <button class="btn btn-secondary" onclick="restoreItem('${item.entity_type}', ${item.entity_id})">
                        <i class="fas fa-undo"></i> Visszaállítás
                    </button>
                    <button class="btn btn-danger" onclick="deletePermanently('${item.entity_type}', ${item.entity_id})">
                        <i class="fas fa-trash"></i> Végleges törlés
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function getTrashTitle(item) {
    const data = item.data || {};
    switch (item.entity_type) {
        case 'person':
            return data.display_name || data.full_name || 'Ismeretlen személy';
        case 'marriage':
            return `${data.person1_name || 'Partner 1'} – ${data.person2_name || 'Partner 2'}`;
        case 'event':
            return `${getEventTypeName(data.event_type) || 'Esemény'}${data.event_date ? ' • ' + formatDate(data.event_date) : ''}`;
        case 'document':
            return data.title || 'Dokumentum';
        default:
            return `${item.entity_type} #${item.entity_id}`;
    }
}

function getEntityLabel(type) {
    const labels = {
        'person': 'Személy',
        'marriage': 'Kapcsolat',
        'event': 'Esemény',
        'document': 'Dokumentum'
    };
    return labels[type] || type;
}

async function restoreItem(entityType, entityId) {
    showConfirm('Biztosan visszaállítod ezt az elemet?', async () => {
        try {
            await API.post('/trash/restore', { entity_type: entityType, entity_id: entityId });
            showNotification('Elem visszaállítva', 'success');
            await loadTrash();
            persons = await API.get('/persons');
            renderPersonsList();
            updateRootPersonSelector();
            updateTree();
            await loadStats();
        } catch (error) {
            showNotification('Hiba a visszaállítás során', 'error');
        }
    }, { text: 'Visszaállítás', className: 'btn-success' });
}

async function deletePermanently(entityType, entityId) {
    showConfirm('⚠️ FIGYELEM: Ez véglegesen törli az elemet az adatbázisból! Ez a művelet NEM visszavonható. Biztosan folytatod?', async () => {
        try {
            await API.post('/trash/delete', { entity_type: entityType, entity_id: entityId });
            showNotification('Elem véglegesen törölve', 'success');
            await loadTrash();
            persons = await API.get('/persons');
            renderPersonsList();
            updateRootPersonSelector();
            updateTree();
            await loadStats();
        } catch (error) {
            showNotification('Hiba a törlés során', 'error');
        }
    });
}

// ==================== ADATBÁZIS MENTÉSEK ====================
async function loadBackups() {
    try {
        const backups = await API.get('/backups');
        renderBackups(backups);
    } catch (error) {
        console.error('Backup lista betöltési hiba:', error);
    }
}

function renderBackups(backups) {
    const container = document.getElementById('backup-list');
    if (!container) return;

    if (!backups || !backups.length) {
        container.innerHTML = `
            <div class="backup-empty">
                <i class="fas fa-database"></i>
                <p>Nincs elérhető adatbázis mentés</p>
                <small>Import után automatikusan készül mentés a korábbi adatokról.</small>
            </div>
        `;
        return;
    }

    container.innerHTML = backups.map(backup => `
        <div class="backup-card">
            <div class="backup-info">
                <div class="backup-name">
                    <i class="fas fa-file-archive"></i>
                    ${backup.filename}
                </div>
                <div class="backup-meta">
                    <span><i class="fas fa-calendar"></i> ${backup.created_at}</span>
                    <span><i class="fas fa-weight"></i> ${backup.size_kb} KB</span>
                </div>
            </div>
            <div class="backup-actions">
                <button class="btn btn-success" onclick="restoreBackup('${backup.filename}')">
                    <i class="fas fa-undo"></i> Visszaállítás
                </button>
                <button class="btn btn-danger" onclick="deleteBackup('${backup.filename}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function restoreBackup(filename) {
    showConfirm(
        `⚠️ FIGYELEM!\n\nEz visszaállítja az adatbázist a "${filename}" mentésből.\n\nA jelenlegi adatokról automatikusan mentés készül.\n\nBiztosan folytatod?`,
        async () => {
            try {
                const result = await API.post('/backups/restore', { filename });
                showNotification(result.message || 'Adatbázis visszaállítva', 'success');
                // Oldal újratöltése az új adatok megjelenítéséhez
                setTimeout(() => location.reload(), 1000);
            } catch (error) {
                showNotification('Visszaállítási hiba: ' + (error.message || 'Ismeretlen hiba'), 'error');
            }
        },
        { text: 'Visszaállítás', className: 'btn-success' }
    );
}

async function deleteBackup(filename) {
    showConfirm(
        `Biztosan törölni szeretnéd a "${filename}" mentést?\n\nEz a művelet nem visszavonható!`,
        async () => {
            try {
                await API.post('/backups/delete', { filename });
                showNotification('Mentés törölve', 'success');
                await loadBackups();
            } catch (error) {
                showNotification('Törlési hiba', 'error');
            }
        }
    );
}

// ==================== SZEMÉLY MODAL ====================
async function openPersonModal(personId = null) {
    currentPersonId = personId;
    const modal = document.getElementById('person-modal');
    const form = document.getElementById('person-form');
    const title = document.getElementById('modal-title');
    const deleteBtn = document.getElementById('delete-person-btn');
    
    // Form reset
    form.reset();
    
    // Szülő választók feltöltése
    await populateParentSelectors();
    
    if (personId) {
        title.textContent = 'Személy szerkesztése';
        deleteBtn.style.display = 'block';
        
        try {
            const person = await API.get(`/persons/${personId}`);
            await fillPersonForm(person);
            await loadPersonRelations(personId);
        } catch (error) {
            showNotification('Hiba az adatok betöltésekor', 'error');
            return;
        }
    } else {
        title.textContent = 'Új személy hozzáadása';
        deleteBtn.style.display = 'none';
        document.getElementById('preview-photo').src = '/static/img/placeholder-avatar.svg';
        document.getElementById('marriages-list').innerHTML = '';
        document.getElementById('events-list').innerHTML = '';
        document.getElementById('documents-list').innerHTML = '';
        
        // FONTOS: Flatpickr értékek explicit törlése új személy esetén
        // A form.reset() nem törli a flatpickr értékeket!
        if (datePickers.birthDate) {
            datePickers.birthDate.clear();
        }
        if (datePickers.deathDate) {
            datePickers.deathDate.clear();
        }
        
        // Checkboxok és disabled állapotok visszaállítása
        const deathDateUnknown = document.getElementById('death_date_unknown');
        const deathDateInput = document.getElementById('death_date');
        if (deathDateUnknown) {
            deathDateUnknown.checked = false;
        }
        if (deathDateInput) {
            deathDateInput.disabled = false;
        }
        document.getElementById('birth_date_approximate').checked = false;
        document.getElementById('death_date_approximate').checked = false;
    }
    
    // Első tab aktiválása
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="basic"]').classList.add('active');
    document.getElementById('tab-basic').classList.add('active');
    
    modal.classList.add('show');
}

async function fillPersonForm(person) {
    document.getElementById('person-id').value = person.id;
    document.getElementById('first_name').value = person.first_name || '';
    document.getElementById('last_name').value = person.last_name || '';
    document.getElementById('maiden_name').value = person.maiden_name || '';
    document.getElementById('nickname').value = person.nickname || '';
    document.getElementById('gender').value = person.gender || 'unknown';
    
    // Dátumok beállítása flatpickr segítségével
    if (datePickers.birthDate) {
        datePickers.birthDate.setDate(person.birth_date || null);
    }
    if (datePickers.deathDate) {
        datePickers.deathDate.setDate(person.death_date || null);
    }
    
    document.getElementById('birth_date_approximate').checked = person.birth_date_approximate;
    document.getElementById('birth_place').value = person.birth_place || '';
    document.getElementById('birth_country').value = person.birth_country || '';
    document.getElementById('death_date_approximate').checked = person.death_date_approximate;
    
    // "Nem ismert" halálozási dátum kezelése
    const deathDateUnknown = document.getElementById('death_date_unknown');
    const deathDateInput = document.getElementById('death_date');
    if (deathDateUnknown) {
        deathDateUnknown.checked = person.death_date_unknown || false;
        if (deathDateInput) {
            deathDateInput.disabled = person.death_date_unknown || false;
        }
    }
    
    document.getElementById('death_place').value = person.death_place || '';
    document.getElementById('death_country').value = person.death_country || '';
    document.getElementById('death_cause').value = person.death_cause || '';
    document.getElementById('burial_place').value = person.burial_place || '';
    document.getElementById('occupation').value = person.occupation || '';
    document.getElementById('education').value = person.education || '';
    document.getElementById('religion').value = person.religion || '';
    document.getElementById('nationality').value = person.nationality || '';
    document.getElementById('email').value = person.email || '';
    document.getElementById('phone').value = person.phone || '';
    document.getElementById('address').value = person.address || '';
    document.getElementById('biography').value = person.biography || '';
    document.getElementById('notes').value = person.notes || '';
    
    // Szülők beállítása parent_family_id alapján (gráf modell)
    let fatherId = '';
    let motherId = '';
    
    if (person.parent_family_id) {
        // Keressük meg a családot és annak tagjait
        try {
            const families = await API.get('/families');
            const parentFamily = families.find(f => f.id === person.parent_family_id);
            if (parentFamily) {
                // A szülőket a nemük alapján azonosítjuk
                const p1 = persons.find(p => p.id === parentFamily.person1_id);
                const p2 = persons.find(p => p.id === parentFamily.person2_id);
                
                if (p1 && p1.gender === 'male') fatherId = p1.id;
                else if (p1 && p1.gender === 'female') motherId = p1.id;
                
                if (p2 && p2.gender === 'male') fatherId = p2.id;
                else if (p2 && p2.gender === 'female') motherId = p2.id;
            }
        } catch (error) {
            console.error('Szülő család lekérése sikertelen:', error);
        }
    }
    
    document.getElementById('father_id').value = fatherId;
    document.getElementById('mother_id').value = motherId;
    document.getElementById('preview-photo').src = person.photo_path || '/static/img/placeholder-avatar.svg';
}

async function populateParentSelectors() {
    const fatherSelect = document.getElementById('father_id');
    const motherSelect = document.getElementById('mother_id');
    const initialPartnerSelect = document.getElementById('initial_partner_id');

    // Mindig friss adatokat kérünk, hogy a legutóbb felvitt személyek is megjelenjenek
    persons = await API.get('/persons');

    // Segédfüggvény: születési év kinyerése
    const getBirthYear = (person) => {
        if (person.birth_date) {
            const year = new Date(person.birth_date).getFullYear();
            return isNaN(year) ? '' : ` (${year})`;
        }
        return '';
    };

    // Ne lehessen saját magát szülőnek kiválasztani
    const options = persons
        .filter(p => !currentPersonId || p.id !== currentPersonId)
        .map(p => {
            const genderLabel = p.gender === 'male' ? 'F' : p.gender === 'female' ? 'N' : '?';
            const birthYear = getBirthYear(p);
            return `<option value="${p.id}">${p.display_name || p.full_name} (${genderLabel})${birthYear}</option>`;
        })
        .join('');

    const defaultOption = '<option value="">-- Válasszon --</option>';
    fatherSelect.innerHTML = defaultOption + options;
    motherSelect.innerHTML = defaultOption + options;
    
    // Partner választó feltöltése (ha létezik)
    if (initialPartnerSelect) {
        const partnerDefaultOption = '<option value="">-- Nincs partner --</option>';
        initialPartnerSelect.innerHTML = partnerDefaultOption + options;
    }
}

async function loadPersonRelations(personId) {
    if (persons.length === 0) {
        persons = await API.get('/persons');
    }

    // Házasságok betöltése
    marriages = await API.get('/marriages');
    const personMarriages = marriages.filter(m => m.person1_id === personId || m.person2_id === personId);
    
    const marriagesList = document.getElementById('marriages-list');
    marriagesList.innerHTML = personMarriages.map(m => {
        const partnerId = m.person1_id === personId ? m.person2_id : m.person1_id;
        const partner = persons.find(p => p.id === partnerId);
        const partnerName = (partner && (partner.display_name || partner.full_name)) ||
            (m.person1_id === personId ? m.person2_name : m.person1_name) ||
            'Ismeretlen partner';
        return `
            <div class="relation-item">
                <div class="info">
                    <span class="name">${partnerName}</span>
                    <span class="details">
                        ${getRelationshipTypeName(m.relationship_type)}
                        ${m.start_date ? ` - ${formatDate(m.start_date)}` : ''}
                        ${m.end_date ? ` - ${formatDate(m.end_date)}` : ''}
                    </span>
                </div>
                <div class="actions">
                    <button type="button" onclick="editMarriage(${m.id}); return false;" title="Szerkesztés"><i class="fas fa-edit"></i></button>
                    <button type="button" class="delete" onclick="deleteMarriage(${m.id}); return false;" title="Törlés"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('') || '<p style="color: var(--text-muted);">Nincs rögzített kapcsolat</p>';
    
    // Események betöltése
    events = await API.get(`/events?person_id=${personId}`);
    
    const eventsList = document.getElementById('events-list');
    eventsList.innerHTML = events.map(e => `
        <div class="relation-item">
            <div class="info">
                <span class="name">${getEventTypeName(e.event_type)}</span>
                <span class="details">
                    ${e.event_date ? formatDate(e.event_date) : ''}
                    ${e.event_place ? ` - ${e.event_place}` : ''}
                </span>
            </div>
            <div class="actions">
                <button class="delete" onclick="deleteEvent(${e.id})" title="Törlés"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('') || '<p style="color: var(--text-muted);">Nincs rögzített esemény</p>';
    
    // Dokumentumok betöltése
    const documents = await API.get(`/documents?person_id=${personId}`);
    
    const documentsList = document.getElementById('documents-list');
    documentsList.innerHTML = documents.map(d => `
        <div class="document-item">
            <i class="fas fa-${d.file_type === 'image' ? 'image' : 'file-alt'}"></i>
            <div class="doc-info">
                <span class="doc-name">${d.title}</span>
                <span class="doc-type">${d.document_type}</span>
            </div>
            <div class="actions">
                <button onclick="window.open('${d.file_path}')" title="Megtekintés"><i class="fas fa-eye"></i></button>
                <button class="delete" onclick="deleteDocument(${d.id})" title="Törlés"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('') || '<p style="color: var(--text-muted);">Nincs feltöltött dokumentum</p>';
}

async function savePerson() {
    const form = document.getElementById('person-form');
    const formData = new FormData(form);
    
    // Szülő ID-k lekérése (még mindig az űrlapról jönnek)
    const fatherId = formData.get('father_id') ? parseInt(formData.get('father_id')) : null;
    const motherId = formData.get('mother_id') ? parseInt(formData.get('mother_id')) : null;
    
    // parent_family_id meghatározása a szülők alapján
    let parentFamilyId = null;
    
    if (fatherId && motherId) {
        // Mindkét szülő meg van adva - keressük vagy hozzuk létre a családot
        try {
            const families = await API.get('/families');
            // Keresünk létező családot ezzel a két szülővel
            const existingFamily = families.find(f => 
                (f.person1_id === fatherId && f.person2_id === motherId) ||
                (f.person1_id === motherId && f.person2_id === fatherId)
            );
            
            if (existingFamily) {
                parentFamilyId = existingFamily.id;
            } else {
                // Nincs ilyen család, létrehozzuk
                const newFamily = await API.post('/families', {
                    person1_id: fatherId,
                    person2_id: motherId,
                    relationship_type: 'partnership',
                    status: 'active'
                });
                parentFamilyId = newFamily.id;
            }
        } catch (error) {
            console.error('Család keresése/létrehozása sikertelen:', error);
        }
    } else if (fatherId || motherId) {
        // Csak egy szülő - egyelőre nem hozunk létre családot (egyedülálló szülő esete)
        // TODO: Lehetne kezelni egyszülős családokat is
        showNotification('Mindkét szülőt válaszd ki a családfa kapcsolathoz!', 'warning');
    }
    
    const data = {
        first_name: formData.get('first_name'),
        last_name: formData.get('last_name'),
        maiden_name: formData.get('maiden_name'),
        nickname: formData.get('nickname'),
        gender: formData.get('gender'),
        birth_date: formData.get('birth_date') || null,
        birth_date_approximate: formData.get('birth_date_approximate') === 'on',
        birth_place: formData.get('birth_place'),
        birth_country: formData.get('birth_country'),
        death_date: formData.get('death_date_unknown') === 'on' ? null : (formData.get('death_date') || null),
        death_date_approximate: formData.get('death_date_approximate') === 'on',
        death_date_unknown: formData.get('death_date_unknown') === 'on',
        death_place: formData.get('death_place'),
        death_country: formData.get('death_country'),
        death_cause: formData.get('death_cause'),
        burial_place: formData.get('burial_place'),
        occupation: formData.get('occupation'),
        education: formData.get('education'),
        religion: formData.get('religion'),
        nationality: formData.get('nationality'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        address: formData.get('address'),
        biography: formData.get('biography'),
        notes: formData.get('notes'),
        // Gráf-alapú modell: parent_family_id használata
        parent_family_id: parentFamilyId
    };

    if (!data.gender) {
        showNotification('Válaszd ki a nemet.', 'warning');
        return;
    }
    
    // Házastárs/partner hozzáadása (ha ki van választva és ez új személy)
    const initialPartnerId = formData.get('initial_partner_id') ? parseInt(formData.get('initial_partner_id')) : null;
    const initialPartnerStatus = formData.get('initial_partner_status') || 'married';
    
    try {
        let savedPersonId = currentPersonId;
        
        if (currentPersonId) {
            await API.put(`/persons/${currentPersonId}`, data);
            showNotification('Személy sikeresen frissítve', 'success');
        } else {
            const newPerson = await API.post('/persons', data);
            savedPersonId = newPerson.id;
            currentPersonId = newPerson.id;
            showNotification('Személy sikeresen létrehozva', 'success');
            
            // Ha van kiválasztott partner és ez új személy, hozzuk létre a kapcsolatot
            if (initialPartnerId && savedPersonId) {
                try {
                    await API.post('/marriages', {
                        person1_id: savedPersonId,
                        person2_id: initialPartnerId,
                        relationship_type: initialPartnerStatus,
                        status: initialPartnerStatus === 'divorced' ? 'ended' : 'active'
                    });
                    showNotification('Partner kapcsolat létrehozva', 'success');
                } catch (partnerError) {
                    console.error('Partner kapcsolat létrehozása sikertelen:', partnerError);
                }
            }
        }
        
        closeModal('person-modal');
        persons = await API.get('/persons');
        renderPersonsList();
        updateRootPersonSelector();
        updateTree();
    } catch (error) {
        showNotification('Hiba a mentés során', 'error');
    }
}

async function deletePerson() {
    if (!currentPersonId) return;
    
    showConfirm('Biztosan törölni szeretné ezt a személyt? Ez a művelet nem visszavonható.', async () => {
        try {
            await API.delete(`/persons/${currentPersonId}`);
            showNotification('Személy törölve', 'success');
            closeModal('person-modal');
            persons = await API.get('/persons');
            renderPersonsList();
            updateRootPersonSelector();
            updateTree();
            await loadTrash();
        } catch (error) {
            showNotification('Hiba a törlés során', 'error');
        }
    });
}

// ==================== HÁZASSÁG KEZELÉS ====================
function openMarriageModal(personId = null) {
    const modal = document.getElementById('marriage-modal');
    const form = document.getElementById('marriage-form');

    // Ha nincs elmentett aktuális személy, ne engedjük
    if (!currentPersonId) {
        showNotification('Először mentsd a személyt, utána adhatsz hozzá kapcsolatot.', 'warning');
        return;
    }

    // Ha még nincs másik személy az adatbázisban, jelezzük
    const otherPersons = persons.filter(p => p.id !== currentPersonId);
    if (otherPersons.length === 0) {
        showNotification('Nincs másik személy a rendszerben. Vidd fel a partnert, majd próbáld újra.', 'info');
        return;
    }

    form.reset();
    document.getElementById('marriage-person1-id').value = currentPersonId;
    document.getElementById('marriage-id').value = '';
    
    // Partner választó feltöltése (születési évvel)
    const partnerSelect = document.getElementById('marriage-person2');
    partnerSelect.innerHTML = '<option value="">-- Válasszon --</option>' +
        otherPersons.map(p => {
            const birthYear = p.birth_date ? ` (${new Date(p.birth_date).getFullYear()})` : '';
            return `<option value="${p.id}">${p.display_name || p.full_name}${birthYear}</option>`;
        }).join('');
    
    modal.classList.add('show');
}

async function saveMarriage() {
    const p1 = parseInt(document.getElementById('marriage-person1-id').value);
    const p2 = parseInt(document.getElementById('marriage-person2').value);

    if (!p1) {
        showNotification('Először mentsd a személyt, utána adhatsz hozzá kapcsolatot.', 'warning');
        return;
    }
    if (!p2) {
        showNotification('Válassz partnert a listából.', 'warning');
        return;
    }
    if (p1 === p2) {
        showNotification('A két partner nem lehet azonos személy.', 'warning');
        return;
    }

    const data = {
        person1_id: p1,
        person2_id: p2,
        relationship_type: document.getElementById('marriage-type').value,
        start_date: document.getElementById('marriage-start').value || null,
        end_date: document.getElementById('marriage-end').value || null,
        marriage_place: document.getElementById('marriage-place').value,
        end_reason: document.getElementById('marriage-end-reason').value || null,
        notes: document.getElementById('marriage-notes').value
    };
    
    try {
        const marriageId = document.getElementById('marriage-id').value;
        if (marriageId) {
            await API.put(`/marriages/${marriageId}`, data);
        } else {
            await API.post('/marriages', data);
        }
        
        showNotification('Kapcsolat mentve', 'success');
        closeModal('marriage-modal');
        await loadPersonRelations(currentPersonId);
        updateTree();
    } catch (error) {
        showNotification(`Hiba a mentés során: ${error.message}`, 'error');
    }
}

async function deleteMarriage(marriageId) {
    showConfirm('Biztosan törölni szeretné ezt a kapcsolatot?', async () => {
        try {
            await API.delete(`/marriages/${marriageId}`);
            showNotification('Kapcsolat törölve', 'success');
            await loadPersonRelations(currentPersonId);
            updateTree();
            await loadTrash();
        } catch (error) {
            showNotification('Hiba a törlés során', 'error');
        }
    });
}

async function editMarriage(marriageId) {
    // Házasságok újratöltése, ha szükséges
    if (!marriages || marriages.length === 0) {
        marriages = await API.get('/marriages');
    }
    
    // Házasság adatainak lekérése
    const marriage = marriages.find(m => m.id === marriageId);
    if (!marriage) {
        // Próbáljuk meg közvetlenül lekérni
        try {
            marriages = await API.get('/marriages');
            const m = marriages.find(m => m.id === marriageId);
            if (!m) {
                showNotification('Kapcsolat nem található', 'error');
                return;
            }
            await openMarriageEditModal(m);
        } catch (error) {
            showNotification('Hiba a kapcsolat betöltésekor', 'error');
        }
        return;
    }

    await openMarriageEditModal(marriage);
}

async function openMarriageEditModal(marriage) {
    const modal = document.getElementById('marriage-modal');
    const form = document.getElementById('marriage-form');
    
    form.reset();
    
    // Partner választó feltöltése
    const otherPersons = persons.filter(p => p.id !== currentPersonId);
    const partnerSelect = document.getElementById('marriage-person2');
    partnerSelect.innerHTML = '<option value="">-- Válasszon --</option>' +
        otherPersons.map(p => `<option value="${p.id}">${p.display_name || p.full_name}</option>`).join('');
    
    // Űrlap kitöltése a meglévő adatokkal
    document.getElementById('marriage-id').value = marriage.id;
    document.getElementById('marriage-person1-id').value = currentPersonId;
    
    // Partner kiválasztása (amelyik nem az aktuális személy)
    const partnerId = marriage.person1_id === currentPersonId ? marriage.person2_id : marriage.person1_id;
    partnerSelect.value = partnerId;
    
    document.getElementById('marriage-type').value = marriage.relationship_type || 'marriage';
    document.getElementById('marriage-place').value = marriage.marriage_place || '';
    document.getElementById('marriage-end-reason').value = marriage.end_reason || '';
    document.getElementById('marriage-notes').value = marriage.notes || '';
    
    // Dátumok beállítása flatpickr-rel
    if (datePickers.marriageStart) {
        datePickers.marriageStart.setDate(marriage.start_date || null);
    }
    if (datePickers.marriageEnd) {
        datePickers.marriageEnd.setDate(marriage.end_date || null);
    }
    
    modal.classList.add('show');
}

// ==================== ESEMÉNY KEZELÉS ====================
function openEventModal() {
    const modal = document.getElementById('event-modal');
    const form = document.getElementById('event-form');
    
    form.reset();
    document.getElementById('event-person-id').value = currentPersonId;
    
    modal.classList.add('show');
}

async function saveEvent() {
    const data = {
        person_id: parseInt(document.getElementById('event-person-id').value),
        event_type: document.getElementById('event-type').value,
        event_date: document.getElementById('event-date').value || null,
        event_place: document.getElementById('event-place').value,
        description: document.getElementById('event-description').value
    };
    
    try {
        await API.post('/events', data);
        showNotification('Esemény mentve', 'success');
        closeModal('event-modal');
        await loadPersonRelations(currentPersonId);
    } catch (error) {
        showNotification('Hiba a mentés során', 'error');
    }
}

async function deleteEvent(eventId) {
    showConfirm('Biztosan törölni szeretné ezt az eseményt?', async () => {
        try {
            await API.delete(`/events/${eventId}`);
            showNotification('Esemény törölve', 'success');
            await loadPersonRelations(currentPersonId);
            await loadTrash();
        } catch (error) {
            showNotification('Hiba a törlés során', 'error');
        }
    });
}

// ==================== DOKUMENTUM KEZELÉS ====================
async function uploadDocument(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('person_id', currentPersonId);
    formData.append('document_type', 'other');
    formData.append('title', file.name);
    
    try {
        await API.uploadFile('/documents', formData);
        showNotification('Dokumentum feltöltve', 'success');
        await loadPersonRelations(currentPersonId);
    } catch (error) {
        showNotification('Hiba a feltöltés során', 'error');
    }
}

async function deleteDocument(documentId) {
    showConfirm('Biztosan törölni szeretné ezt a dokumentumot?', async () => {
        try {
            await API.delete(`/documents/${documentId}`);
            showNotification('Dokumentum törölve', 'success');
            await loadPersonRelations(currentPersonId);
            await loadTrash();
        } catch (error) {
            showNotification('Hiba a törlés során', 'error');
        }
    });
}

// ==================== FÉNYKÉP KEZELÉS ====================
async function uploadPhoto(file) {
    if (!currentPersonId) {
        showNotification('Először mentse el a személyt', 'warning');
        return;
    }
    
    const formData = new FormData();
    formData.append('photo', file);
    
    try {
        const result = await API.uploadFile(`/persons/${currentPersonId}/photo`, formData);
        document.getElementById('preview-photo').src = result.photo_path;
        showNotification('Fénykép feltöltve', 'success');
        persons = await API.get('/persons');
    } catch (error) {
        showNotification('Hiba a feltöltés során', 'error');
    }
}

// ==================== STATISZTIKÁK ====================
async function loadStats() {
    try {
        const stats = await API.get('/stats');
        
        document.getElementById('stat-total').textContent = stats.total_persons;
        document.getElementById('stat-living').textContent = stats.living_persons;
        document.getElementById('stat-deceased').textContent = stats.deceased_persons;
        document.getElementById('stat-marriages').textContent = stats.marriages_count;
        document.getElementById('stat-generations').textContent = stats.estimated_generations;
        
        // Diagramok
        renderGenderChart(stats);
        renderBirthsChart();
    } catch (error) {
        showNotification('Hiba a statisztikák betöltésekor', 'error');
    }
}

function renderGenderChart(stats) {
    const ctx = document.getElementById('gender-chart').getContext('2d');
    
    // Korábbi chart törlése
    if (window.genderChart) {
        window.genderChart.destroy();
    }
    
    window.genderChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Férfi', 'Nő', 'Ismeretlen'],
            datasets: [{
                data: [stats.male_count, stats.female_count, stats.unknown_gender_count],
                backgroundColor: ['#4A90D9', '#D94A8C', '#808080']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function renderBirthsChart() {
    const ctx = document.getElementById('births-chart').getContext('2d');
    
    // Korábbi chart törlése
    if (window.birthsChart) {
        window.birthsChart.destroy();
    }
    
    // Évtizedek szerinti bontás
    const decades = {};
    persons.forEach(p => {
        if (p.birth_date) {
            const year = parseInt(p.birth_date.substring(0, 4));
            const decade = Math.floor(year / 10) * 10;
            decades[decade] = (decades[decade] || 0) + 1;
        }
    });
    
    const sortedDecades = Object.keys(decades).sort();
    
    window.birthsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedDecades.map(d => `${d}-es évek`),
            datasets: [{
                label: 'Születések',
                data: sortedDecades.map(d => decades[d]),
                backgroundColor: '#4A90D9'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// ==================== BEÁLLÍTÁSOK ====================
async function loadSettings() {
    try {
        settings = await API.get('/settings');
        applySettings();
    } catch (error) {
        console.error('Beállítások betöltési hiba:', error);
    }
}

function applySettings() {
    try {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        const setChecked = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = val;
        };
        
        setVal('setting-male-color', settings.male_color || '#4A90D9');
        setVal('setting-female-color', settings.female_color || '#D94A8C');
        setVal('setting-unknown-color', settings.unknown_color || '#808080');
        setVal('setting-line-color', settings.line_color || '#666666');
        setVal('setting-bg-color', settings.background_color || '#F5F5F5');
        setVal('setting-deceased-opacity', settings.deceased_opacity || 0.7);
        setVal('setting-card-width', settings.card_width || 200);
        setVal('setting-card-height', settings.card_height || 100);
        setVal('setting-border-radius', settings.card_border_radius || 8);
        setVal('setting-line-width', settings.line_width || 2);
        setChecked('setting-show-photos', settings.show_photos !== false);
        setChecked('setting-show-dates', settings.show_dates !== false);
        setChecked('setting-show-places', settings.show_places || false);
        setChecked('setting-show-occupation', settings.show_occupation || false);
        setVal('setting-font-family', settings.font_family || 'Arial, sans-serif');
        setVal('setting-font-size', settings.font_size || 14);
        
        // Alapértelmezett gyökérszemély beállítása - a szelector feltöltése után történik
        // (lásd: updateDefaultRootPersonSelector)
        
        // CSS változók frissítése
        document.documentElement.style.setProperty('--male-color', settings.male_color || '#4A90D9');
        document.documentElement.style.setProperty('--female-color', settings.female_color || '#D94A8C');
        document.documentElement.style.setProperty('--unknown-color', settings.unknown_color || '#808080');
    } catch (error) {
        console.error('Beállítások alkalmazási hiba:', error);
    }
}

async function saveSettings() {
    const newSettings = {
        male_color: document.getElementById('setting-male-color').value,
        female_color: document.getElementById('setting-female-color').value,
        unknown_color: document.getElementById('setting-unknown-color').value,
        line_color: document.getElementById('setting-line-color').value,
        background_color: document.getElementById('setting-bg-color').value,
        deceased_opacity: parseFloat(document.getElementById('setting-deceased-opacity').value),
        card_width: parseInt(document.getElementById('setting-card-width').value),
        card_height: parseInt(document.getElementById('setting-card-height').value),
        card_border_radius: parseInt(document.getElementById('setting-border-radius').value),
        line_width: parseInt(document.getElementById('setting-line-width').value),
        show_photos: document.getElementById('setting-show-photos').checked,
        show_dates: document.getElementById('setting-show-dates').checked,
        show_places: document.getElementById('setting-show-places').checked,
        show_occupation: document.getElementById('setting-show-occupation').checked,
        font_family: document.getElementById('setting-font-family').value,
        font_size: parseInt(document.getElementById('setting-font-size').value),
        default_root_person_id: document.getElementById('setting-default-root-person').value ? parseInt(document.getElementById('setting-default-root-person').value) : null
    };
    
    try {
        settings = await API.put('/settings', newSettings);
        applySettings();
        updateTree();
        showNotification('Beállítások mentve', 'success');
    } catch (error) {
        showNotification('Hiba a mentés során', 'error');
    }
}

// ==================== EXPORT/IMPORT ====================
async function exportJSON() {
    try {
        const data = await API.get('/export/json');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        downloadFile(blob, 'family_tree.json');
        showNotification('JSON exportálva', 'success');
    } catch (error) {
        showNotification('Export hiba', 'error');
    }
}

async function exportGEDCOM() {
    try {
        const response = await fetch('/api/export/gedcom');
        const text = await response.text();
        const blob = new Blob([text], { type: 'text/plain' });
        downloadFile(blob, 'family_tree.ged');
        showNotification('GEDCOM exportálva', 'success');
    } catch (error) {
        showNotification('Export hiba', 'error');
    }
}

async function importJSON(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Számoljuk meg hány személy és házasság van az importálandó fájlban
        const personCount = data.persons?.length || 0;
        const marriageCount = data.marriages?.length || 0;
        
        // Megerősítő kérdés
        const confirmed = confirm(
            `⚠️ FIGYELEM!\n\n` +
            `Az import FELÜLÍRJA az összes meglévő adatot!\n\n` +
            `Importálandó:\n` +
            `  • ${personCount} személy\n` +
            `  • ${marriageCount} házasság\n\n` +
            `A régi adatbázisról automatikusan mentés készül.\n\n` +
            `Biztosan folytatod?`
        );
        
        if (!confirmed) {
            showNotification('Import megszakítva', 'info');
            return;
        }
        
        const result = await API.post('/import/json', data);
        showNotification(
            `Import sikeres! ${result.imported_persons || 0} személy, ${result.imported_marriages || 0} házasság`,
            'success'
        );
        location.reload();
    } catch (error) {
        showNotification('Import hiba: ' + (error.message || 'Ismeretlen hiba'), 'error');
    }
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ==================== KERESÉS ====================
let searchTimeout;

function initSearch() {
    const searchInput = document.getElementById('global-search');
    const searchResults = document.getElementById('search-results');
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            searchResults.classList.remove('show');
            return;
        }
        
        searchTimeout = setTimeout(async () => {
            try {
                const results = await API.get(`/search?q=${encodeURIComponent(query)}`);
                
                if (results.length === 0) {
                    searchResults.innerHTML = '<div class="search-result-item">Nincs találat</div>';
                } else {
                    searchResults.innerHTML = results.map(p => `
                        <div class="search-result-item" onclick="openPersonModal(${p.id}); document.getElementById('search-results').classList.remove('show');">
                            <img src="${p.photo_path || '/static/img/default-avatar.png'}" alt="">
                            <div>
                                <strong>${p.full_name}</strong>
                                <br><small>${formatDate(p.birth_date) || ''}</small>
                            </div>
                        </div>
                    `).join('');
                }
                
                searchResults.classList.add('show');
            } catch (error) {
                console.error('Keresési hiba:', error);
            }
        }, 300);
    });
    
    // Keresés bezárása kattintáskor
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) {
            searchResults.classList.remove('show');
        }
    });
}

// ==================== MODAL KEZELÉS ====================
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
    // Flatpickr bezárása a modal bezárásakor
    closeFlatpickrs();
}

function showConfirm(message, onConfirm, buttonConfig = null) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-message').textContent = message;
    
    const confirmBtn = document.getElementById('confirm-btn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    // Gomb testreszabása
    if (buttonConfig) {
        newConfirmBtn.textContent = buttonConfig.text || 'Megerősítés';
        newConfirmBtn.className = `btn ${buttonConfig.className || 'btn-primary'}`;
    } else {
        newConfirmBtn.textContent = 'Törlés';
        newConfirmBtn.className = 'btn btn-danger';
    }
    
    newConfirmBtn.addEventListener('click', () => {
        closeModal('confirm-modal');
        onConfirm();
    });
    
    modal.classList.add('show');
}

function initModals() {
    // Close gomb kezelés
    document.querySelectorAll('.close-btn, .close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            modal.classList.remove('show');
            // Flatpickr bezárása a modal bezárásakor
            closeFlatpickrs();
        });
    });
    
    // Modal háttér kattintás
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
                // Flatpickr bezárása a modal bezárásakor
                closeFlatpickrs();
            }
        });
    });
}

// Flatpickr példányok bezárása
function closeFlatpickrs() {
    Object.values(datePickers).forEach(picker => {
        if (picker && picker.close) {
            picker.close();
        }
    });
}

// ==================== TAB KEZELÉS ====================
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
}

// ==================== SZŰRŐK ====================
function initFilters() {
    // Dropdown szűrők
    ['filter-gender', 'filter-status', 'filter-connection', 'sort-by'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', renderPersonsList);
    });
    
    // Keresőmező valós időben
    const searchInput = document.getElementById('persons-search');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(renderPersonsList, 300);
        });
    }
}

// ==================== SEGÉDFÜGGVÉNYEK ====================
function formatDate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getRelationshipTypeName(type) {
    const types = {
        'marriage': 'Házasság',
        'partnership': 'Élettársi kapcsolat',
        'engagement': 'Eljegyzés'
    };
    return types[type] || type;
}

function getEventTypeName(type) {
    const types = {
        'baptism': 'Keresztelő',
        'confirmation': 'Konfirmáció/Bérmálás',
        'graduation': 'Diplomázás',
        'military': 'Katonai szolgálat',
        'immigration': 'Kivándorlás',
        'emigration': 'Bevándorlás',
        'retirement': 'Nyugdíjazás',
        'award': 'Kitüntetés',
        'other': 'Egyéb'
    };
    return types[type] || type;
}

// ==================== ROOT PERSON SELECTOR ====================
function updateRootPersonSelector() {
    const selector = document.getElementById('root-person');
    
    // Születési év formázása
    const formatBirthYear = (person) => {
        if (person.birth_date) {
            const year = person.birth_date.split('-')[0];
            return ` (${year})`;
        }
        return '';
    };
    
    selector.innerHTML = '<option value="">-- Gyökér személy --</option>' +
        persons.map(p => `<option value="${p.id}">${p.full_name}${formatBirthYear(p)}</option>`).join('');
    
    // Beállítások oldali gyökér selector frissítése is
    updateDefaultRootPersonSelector();
}

// Alapértelmezett gyökérszemély választó frissítése a beállításokban
let defaultRootSelectorInitialized = false;

function updateDefaultRootPersonSelector() {
    const selector = document.getElementById('setting-default-root-person');
    if (!selector) return;
    
    const formatBirthYear = (person) => {
        if (person.birth_date) {
            const year = person.birth_date.split('-')[0];
            return ` (${year})`;
        }
        return '';
    };
    
    // Mentés az aktuális értékről, ha már inicializálva volt
    const currentValue = defaultRootSelectorInitialized ? selector.value : null;
    
    selector.innerHTML = '<option value="">-- Nincs beállítva --</option>' +
        persons.map(p => `<option value="${p.id}">${p.full_name}${formatBirthYear(p)}</option>`).join('');
    
    // Érték beállítása: először a korábbi érték, különben a mentett
    if (currentValue) {
        selector.value = currentValue;
    } else if (settings.default_root_person_id) {
        selector.value = String(settings.default_root_person_id);
    }
    
    defaultRootSelectorInitialized = true;
}

// Alapértelmezett gyökérszemély mentése
async function saveDefaultRootPerson() {
    const selector = document.getElementById('setting-default-root-person');
    const value = selector.value ? parseInt(selector.value) : null;
    
    try {
        const response = await API.put('/settings', { default_root_person_id: value });
        settings.default_root_person_id = value;
        showNotification('Alapértelmezett gyökérszemély mentve!', 'success');
    } catch (error) {
        console.error('Mentési hiba:', error);
        showNotification('Hiba a mentés során', 'error');
    }
}

// ==================== INICIALIZÁLÁS ====================
function initDatePickers() {
    // Flatpickr beállítások magyar lokalizációval
    const dateConfig = {
        locale: 'hu',
        dateFormat: 'Y-m-d',
        allowInput: true,
        altInput: true,
        altFormat: 'Y. m. d.',
        prevArrow: '<i class="fas fa-chevron-left"></i>',
        nextArrow: '<i class="fas fa-chevron-right"></i>',
        showMonths: 1,
        static: false,
        disableMobile: true,
        // Év és hónap választó engedélyezése
        plugins: [],
        onOpen: function(selectedDates, dateStr, instance) {
            // Év választó hozzáadása a fejléchez
            const yearInput = instance.calendarContainer.querySelector('.cur-year');
            if (yearInput) {
                yearInput.removeAttribute('disabled');
                yearInput.setAttribute('min', '1800');
                yearInput.setAttribute('max', '2100');
            }
        }
    };

    // Személy űrlap dátumok - példányok mentése
    datePickers.birthDate = flatpickr('#birth_date', dateConfig);
    datePickers.deathDate = flatpickr('#death_date', dateConfig);
    
    // Házasság űrlap dátumok
    datePickers.marriageStart = flatpickr('#marriage-start', dateConfig);
    datePickers.marriageEnd = flatpickr('#marriage-end', dateConfig);
    
    // Esemény űrlap dátum
    datePickers.eventDate = flatpickr('#event-date', dateConfig);
}

// ==================== SÖTÉT MÓD KEZELÉSE ====================
function initThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    
    // Mentett téma betöltése
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    toggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
}

// ==================== JELSZÓ VÁLTOZTATÁS ====================
async function changePassword() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (!currentPassword) {
        showNotification('Adja meg a jelenlegi jelszót!', 'error');
        return;
    }
    
    if (!newPassword || newPassword.length < 4) {
        showNotification('Az új jelszónak legalább 4 karakter hosszúnak kell lennie!', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showNotification('Az új jelszavak nem egyeznek!', 'error');
        return;
    }
    
    try {
        const result = await API.post('/auth/change-password', {
            current_password: currentPassword,
            new_password: newPassword
        });
        
        showNotification('Jelszó sikeresen megváltoztatva!', 'success');
        
        // Mezők ürítése
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        
    } catch (error) {
        showNotification(error.message || 'Hiba történt a jelszó változtatásakor', 'error');
    }
}

// ==================== BACKUP KEZELÉS ====================
async function loadBackups() {
    const statsContainer = document.getElementById('backup-stats');
    const listContainer = document.getElementById('backup-list');
    
    try {
        // Statisztikák betöltése
        const stats = await API.get('/backups/stats');
        
        statsContainer.innerHTML = `
            <div class="stats-row">
                <span class="stat-item">
                    <i class="fas fa-archive"></i>
                    <strong>${stats.total_backups}</strong> mentés
                </span>
                <span class="stat-item">
                    <i class="fas fa-hdd"></i>
                    <strong>${stats.total_size_mb}</strong> MB
                </span>
                ${stats.last_backup ? `
                <span class="stat-item">
                    <i class="fas fa-clock"></i>
                    Utolsó: ${formatBackupDate(stats.last_backup.created_at)}
                </span>
                ` : ''}
            </div>
        `;
        
        // Backup lista betöltése
        const backups = await API.get('/backups');
        
        if (backups.length === 0) {
            listContainer.innerHTML = `
                <div class="backup-empty">
                    <i class="fas fa-archive"></i>
                    <p>Még nincs biztonsági mentés</p>
                </div>
            `;
            return;
        }
        
        listContainer.innerHTML = backups.slice(0, 20).map(backup => `
            <div class="backup-item" data-id="${backup.id}">
                <div class="backup-item-info">
                    <div class="backup-item-name">
                        <i class="fas fa-database"></i>
                        ${backup.description || 'Biztonsági mentés'}
                    </div>
                    <div class="backup-item-meta">
                        ${formatBackupDate(backup.created_at)} • 
                        ${backup.file_size_mb} MB • 
                        ${backup.trigger === 'auto' ? 'Automatikus' : 'Manuális'}
                        ${!backup.exists ? ' • <span style="color: var(--danger-color)">Fájl hiányzik</span>' : ''}
                    </div>
                </div>
                <div class="backup-item-actions">
                    ${backup.exists ? `
                    <button class="btn btn-restore btn-sm" onclick="restoreBackup(${backup.id})" title="Visszaállítás">
                        <i class="fas fa-undo"></i>
                    </button>
                    ` : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteBackup(${backup.id})" title="Törlés">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Backup betöltési hiba:', error);
        statsContainer.innerHTML = '<p>Hiba a mentések betöltésekor</p>';
    }
}

async function createBackup() {
    const btn = document.getElementById('create-backup-btn');
    const originalHtml = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mentés...';
    btn.disabled = true;
    
    try {
        const result = await API.post('/backups', {
            description: 'Manuális mentés - ' + new Date().toLocaleString('hu-HU')
        });
        
        showNotification('Biztonsági mentés sikeresen létrehozva!', 'success');
        loadBackups();
        
    } catch (error) {
        showNotification('Hiba a mentés létrehozásakor: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

async function restoreBackup(backupId) {
    if (!confirm('Biztosan visszaállítja ezt a mentést?\n\nA jelenlegi adatok mentésre kerülnek a visszaállítás előtt.')) {
        return;
    }
    
    try {
        const result = await API.post(`/backups/${backupId}/restore`);
        
        showNotification('Visszaállítás sikeres! Az oldal újratöltődik...', 'success');
        
        // Oldal újratöltése az új adatokkal
        setTimeout(() => {
            window.location.reload();
        }, 1500);
        
    } catch (error) {
        showNotification('Hiba a visszaállításkor: ' + error.message, 'error');
    }
}

async function deleteBackup(backupId) {
    if (!confirm('Biztosan törli ezt a mentést?')) {
        return;
    }
    
    try {
        await API.delete(`/backups/${backupId}`);
        showNotification('Mentés törölve', 'success');
        loadBackups();
        
    } catch (error) {
        showNotification('Hiba a törléskor: ' + error.message, 'error');
    }
}

function formatBackupDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('hu-HU', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // Alapvető UI inicializálás - ezeknek mindig működniük kell
    initNavigation();
    initModals();
    initTabs();
    initFilters();
    initSearch();
    initDatePickers();
    initThemeToggle();
    
    // "Nem ismert" halálozási dátum checkbox kezelése
    const deathDateUnknown = document.getElementById('death_date_unknown');
    const deathDateInput = document.getElementById('death_date');
    if (deathDateUnknown && deathDateInput) {
        deathDateUnknown.addEventListener('change', () => {
            if (deathDateUnknown.checked) {
                deathDateInput.value = '';
                deathDateInput.disabled = true;
            } else {
                deathDateInput.disabled = false;
            }
        });
    }
    
    // Eseménykezelők - MINDIG regisztráljuk, még ha az adatok nem is töltődnek be
    document.getElementById('add-person-btn').addEventListener('click', () => openPersonModal());
    document.getElementById('save-person-btn').addEventListener('click', savePerson);
    document.getElementById('delete-person-btn').addEventListener('click', deletePerson);
    document.getElementById('add-marriage-btn').addEventListener('click', () => openMarriageModal());
    document.getElementById('save-marriage-btn').addEventListener('click', saveMarriage);
    document.getElementById('add-event-btn').addEventListener('click', openEventModal);
    document.getElementById('save-event-btn').addEventListener('click', saveEvent);
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    
    // Jelszó változtatás
    document.getElementById('change-password-btn').addEventListener('click', changePassword);
    
    // Backup kezelés
    document.getElementById('create-backup-btn').addEventListener('click', createBackup);
    loadBackups();
    
    // Export/Import - KRITIKUS, mindig működjön!
    document.getElementById('export-json').addEventListener('click', exportJSON);
    document.getElementById('export-gedcom-btn').addEventListener('click', exportGEDCOM);
    document.getElementById('export-gedcom').addEventListener('click', exportGEDCOM);
    
    document.getElementById('import-json').addEventListener('click', () => {
        document.getElementById('import-file').click();
    });
    
    document.getElementById('import-file').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            importJSON(e.target.files[0]);
        }
    });
    
    // Fájl feltöltések
    document.getElementById('upload-photo-btn').addEventListener('click', () => {
        document.getElementById('photo-input').click();
    });
    
    document.getElementById('photo-input').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            uploadPhoto(e.target.files[0]);
        }
    });
    
    document.getElementById('upload-document-btn').addEventListener('click', () => {
        document.getElementById('document-input').click();
    });
    
    document.getElementById('document-input').addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(file => uploadDocument(file));
    });
    
    // Teljes képernyő
    document.getElementById('fullscreen').addEventListener('click', () => {
        const treeContainer = document.getElementById('tree-container');
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            treeContainer.requestFullscreen();
        }
    });
    
    // Adatok betöltése - hibakezeléssel, hogy ne álljon le az app
    try {
        await loadSettings();
    } catch (error) {
        console.error('Beállítások betöltési hiba:', error);
    }
    
    try {
        persons = await API.get('/persons');
        updateRootPersonSelector();
        
        // Alapértelmezett gyökérszemély beállítása, ha van mentett érték
        if (settings.default_root_person_id) {
            const rootSelector = document.getElementById('root-person');
            if (rootSelector && persons.some(p => p.id === settings.default_root_person_id)) {
                rootSelector.value = String(settings.default_root_person_id);
                // FONTOS: A tree.js rootPersonId változóját is be kell állítani!
                rootPersonId = settings.default_root_person_id;
                console.log('Root person beállítva:', settings.default_root_person_id);
            }
        }
    } catch (error) {
        console.error('Személyek betöltési hiba:', error);
        persons = [];
    }
    
    // Fa inicializálás
    try {
        initTree();
    } catch (error) {
        console.error('Fa inicializálási hiba:', error);
    }
});
