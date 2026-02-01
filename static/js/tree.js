// ==================== CSALÁDFA VIZUALIZÁCIÓ D3.js ====================

let svg, g, zoom;
let treeData = { nodes: [], links: [] };
let currentLayout = 'vertical';
let rootPersonId = null;

// Elmentett egyedi pozíciók (drag & drop után)
let savedPositions = {}; // { personId: { x, y } }
let isDragging = false;
let positionedNodesCache = []; // Aktuális pozícionált node-ok cache-elése újrarajzoláshoz
let currentFanChartPersonId = null; // Track current fan chart person for refresh

// ==================== FAN CHART INTEGRÁCIÓ ====================
async function showFanChart(personId) {
    if (!personId) return;
    currentFanChartPersonId = personId; // Store for refresh
    
    // Hide tree, show fan chart container
    document.getElementById('tree-container').style.display = 'none';
    const fanContainer = document.getElementById('fan-chart-container');
    fanContainer.style.display = 'block';
    fanContainer.innerHTML = ''; // Clear previous
    
    // Fetch ancestor data
    try {
        const response = await fetch(`/fan-chart/${personId}`);
        const data = await response.json();
        renderFanChartIntegrated(data, fanContainer);
    } catch (error) {
        console.error('Fan chart betöltési hiba:', error);
        fanContainer.innerHTML = '<p style="padding:20px;color:#c00;">Hiba a legyező diagram betöltésekor.</p>';
    }
}

// Refresh fan chart (called when theme changes)
function refreshFanChart() {
    if (currentFanChartPersonId) {
        showFanChart(currentFanChartPersonId);
    }
}

function renderFanChartIntegrated(data, container) {
    const width = container.clientWidth || 900;
    const height = container.clientHeight || 600;
    const radius = Math.min(width, height) / 2 - 40;

    const colorByGender = d => {
        if (d.depth === 0) return '#f7b731';
        if (d.data.gender === 'male') return '#4a90e2';
        if (d.data.gender === 'female') return '#e94e77';
        return '#bbb';
    };

    // Pedigree partition
    function pedigreePartition(root) {
        const maxDepth = root.height || 5;
        function setAngles(node, startAngle, endAngle, depth) {
            node.x0 = startAngle;
            node.x1 = endAngle;
            node.y0 = depth * radius / (maxDepth + 1);
            node.y1 = (depth + 1) * radius / (maxDepth + 1);
            if (node.children && node.children.length > 0) {
                const angleStep = (endAngle - startAngle) / node.children.length;
                let angle = startAngle;
                for (let child of node.children) {
                    setAngles(child, angle, angle + angleStep, depth + 1);
                    angle += angleStep;
                }
            }
        }
        setAngles(root, 0, 2 * Math.PI, 0);
        return root;
    }

    const root = d3.hierarchy(data, d => d.children).sum(d => 1);
    pedigreePartition(root);

    // Dark mode detection
    const darkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgColor = darkMode ? '#1a1a2e' : '#f8f8f8';
    const textColor = darkMode ? '#e0e0e0' : '#222';
    const textMuted = darkMode ? '#9e9e9e' : '#444';
    const strokeColor = darkMode ? '#2d3a5c' : '#fff';
    const tooltipBg = darkMode ? '#16213e' : '#fff';
    const tooltipBorder = darkMode ? '#2d3a5c' : '#aaa';

    // Also set container background
    container.style.background = bgColor;

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .style('background', bgColor);

    const g = svg.append('g');

    // Zoom - same as tree chart
    const fanZoom = d3.zoom()
        .scaleExtent([0.3, 5])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });
    
    svg.call(fanZoom);
    
    // Set initial position to center
    svg.call(fanZoom.transform, d3.zoomIdentity.translate(width/2, height/2));

    const arc = d3.arc()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .innerRadius(d => d.y0)
        .outerRadius(d => d.y1);

    // Tooltip
    let tooltip = d3.select('.fan-tooltip');
    if (tooltip.empty()) {
        tooltip = d3.select('body').append('div')
            .attr('class', 'fan-tooltip')
            .style('position', 'absolute')
            .style('background', tooltipBg)
            .style('border', `1px solid ${tooltipBorder}`)
            .style('padding', '6px 10px')
            .style('border-radius', '4px')
            .style('pointer-events', 'none')
            .style('font-size', '14px')
            .style('color', textColor)
            .style('box-shadow', '0 2px 8px rgba(0,0,0,0.15)')
            .style('opacity', 0);
    } else {
        // Update tooltip colors for current theme
        tooltip
            .style('background', tooltipBg)
            .style('border', `1px solid ${tooltipBorder}`)
            .style('color', textColor);
    }

    // Draw arcs
    g.selectAll('path.fan-arc')
        .data(root.descendants())
        .join('path')
        .attr('class', d => 'fan-arc ' + (d.depth === 0 ? 'fan-arc-root' : d.data.gender ? 'fan-arc-' + d.data.gender : 'fan-arc-unknown'))
        .attr('d', arc)
        .style('fill', colorByGender)
        .style('stroke', strokeColor)
        .style('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('click', function(event, d) {
            event.stopPropagation();
            if (d.data.id) {
                openPersonModal(d.data.id);
            }
        })
        .on('mouseover', function(event, d) {
            tooltip.transition().duration(150).style('opacity', 1);
            tooltip.html(`<b>${d.data.name}</b><br>${d.data.birth_year ? 'Született: ' + d.data.birth_year : ''}`)
                .style('left', (event.pageX + 12) + 'px')
                .style('top', (event.pageY - 18) + 'px');
            d3.select(this).style('stroke', textColor).style('stroke-width', 2.5);
        })
        .on('mousemove', function(event) {
            tooltip.style('left', (event.pageX + 12) + 'px').style('top', (event.pageY - 18) + 'px');
        })
        .on('mouseout', function() {
            tooltip.transition().duration(200).style('opacity', 0);
            d3.select(this).style('stroke', strokeColor).style('stroke-width', 1.5);
        });

    // Labels: tangent to arc (perpendicular to radius)
    const labelData = root.descendants().filter(d => d.depth > 0);

    g.selectAll('g.fan-label-group')
        .data(labelData)
        .join('g')
        .attr('class', 'fan-label-group')
        .attr('pointer-events', 'none')
        .each(function(d) {
            const group = d3.select(this);
            const midAngle = (d.x0 + d.x1) / 2;
            const midRadius = (d.y0 + d.y1) / 2;
            const arcLen = (d.x1 - d.x0) * midRadius;
            const bandHeight = d.y1 - d.y0;

            const x = Math.cos(midAngle - Math.PI/2) * midRadius;
            const y = Math.sin(midAngle - Math.PI/2) * midRadius;

            // Tangent rotation (text follows the arc)
            let angleDeg = (midAngle * 180 / Math.PI);
            let flip = angleDeg > 90 && angleDeg < 270;
            if (flip) angleDeg += 180;

            group.attr('transform', `translate(${x},${y}) rotate(${angleDeg})`);

            const name = d.data.name || '';
            // Build year string: birth-death or just birth
            let yearStr = '';
            if (d.data.birth_year) {
                yearStr = d.data.death_year 
                    ? `${d.data.birth_year}-${d.data.death_year}`
                    : `${d.data.birth_year}`;
            } else if (d.data.death_year) {
                yearStr = `†${d.data.death_year}`;
            }

            // Calculate available space
            const availableWidth = bandHeight * 0.92;
            const availableHeight = arcLen * 0.9;
            
            // Character width estimates (lower = more characters fit)
            const nameCharWidth = 0.48;
            const yearCharWidth = 0.48;
            
            // Calculate font sizes to fit
            let nameFontSize = Math.min(
                availableWidth / Math.max(name.length * nameCharWidth, 1),
                availableHeight * (yearStr ? 0.42 : 0.6),
                14
            );
            let yearFontSize = Math.min(
                availableWidth / Math.max(yearStr.length * yearCharWidth, 1),
                availableHeight * 0.32,
                11
            );
            
            // Ensure minimum readable sizes
            nameFontSize = Math.max(nameFontSize, 4);
            yearFontSize = Math.max(yearFontSize, 3);
            
            // Truncate name only if really necessary
            let displayName = name;
            const maxNameChars = Math.floor(availableWidth / (nameFontSize * nameCharWidth)) + 2;
            if (name.length > maxNameChars && maxNameChars > 4) {
                displayName = name.substring(0, maxNameChars - 1) + '…';
            } else if (maxNameChars <= 4 && name.length > maxNameChars) {
                displayName = name.substring(0, maxNameChars);
            }

            // Always show name
            group.append('text')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('dy', yearStr ? '-0.4em' : '0em')
                .attr('font-size', nameFontSize + 'px')
                .attr('font-weight', 600)
                .attr('fill', textColor)
                .text(displayName);

            // Always show years if available
            if (yearStr) {
                group.append('text')
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'central')
                    .attr('dy', '0.7em')
                    .attr('font-size', yearFontSize + 'px')
                    .attr('fill', textMuted)
                    .text(yearStr);
            }
        });

    // Center label (root person) - with dynamic sizing
    const rootRadius = root.y1; // inner circle radius
    const maxRootWidth = rootRadius * 1.6; // available width for text
    const rootName = data.name || '';
    
    // Build year string for root
    let rootYearStr = '';
    if (data.birth_year) {
        rootYearStr = data.death_year 
            ? `${data.birth_year}-${data.death_year}`
            : `${data.birth_year}`;
    }
    
    // Calculate font size to fit
    let rootNameFontSize = Math.min(maxRootWidth / (rootName.length * 0.55), 16);
    rootNameFontSize = Math.max(rootNameFontSize, 8);
    
    let rootYearFontSize = Math.min(maxRootWidth / (rootYearStr.length * 0.5), 12);
    rootYearFontSize = Math.max(rootYearFontSize, 7);
    
    // Truncate if needed
    let displayRootName = rootName;
    const maxRootChars = Math.floor(maxRootWidth / (rootNameFontSize * 0.55)) + 1;
    if (rootName.length > maxRootChars && maxRootChars > 3) {
        displayRootName = rootName.substring(0, maxRootChars - 1) + '…';
    }
    
    const rootG = g.append('g').attr('class', 'fan-root-label');
    rootG.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', rootYearStr ? '-0.2em' : '0.1em')
        .attr('font-size', rootNameFontSize + 'px')
        .attr('font-weight', 700)
        .attr('fill', textColor)
        .text(displayRootName);
    if (rootYearStr) {
        rootG.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '1.1em')
            .attr('font-size', rootYearFontSize + 'px')
            .attr('fill', textMuted)
            .text(rootYearStr);
    }
}

// ==================== INICIALIZÁLÁS ====================
function initTree() {
    const container = document.getElementById('tree-container');
    svg = d3.select('#family-tree');
    
    // Zoom és pan kezelés
    zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });
    
    svg.call(zoom);
    
    // Fő csoport a transzformációkhoz
    g = svg.append('g');
    
    // Nyíl marker házasságokhoz
    svg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .append('path')
        .attr('d', 'M 0,-5 L 10,0 L 0,5')
        .attr('fill', '#666');
    
    // Eszköztár kezelés
    document.getElementById('zoom-in').addEventListener('click', () => {
        svg.transition().call(zoom.scaleBy, 1.3);
    });
    
    document.getElementById('zoom-out').addEventListener('click', () => {
        svg.transition().call(zoom.scaleBy, 0.7);
    });
    
    document.getElementById('zoom-reset').addEventListener('click', () => {
        svg.transition().call(zoom.transform, d3.zoomIdentity);
    });
    
    document.getElementById('center-tree').addEventListener('click', centerTree);
    
    // Pozíciók visszaállítása gomb
    const resetPositionsBtn = document.getElementById('reset-positions');
    if (resetPositionsBtn) {
        resetPositionsBtn.addEventListener('click', async () => {
            if (confirm('Biztosan visszaállítod az összes pozíciót az automatikus elrendezésre?')) {
                await resetAllPositions();
            }
        });
    }
    
    document.getElementById('tree-layout').addEventListener('change', (e) => {
        currentLayout = e.target.value;
        if (currentLayout === 'fan') {
            // Fan chart: show fan chart container, hide tree container
            const rootId = document.getElementById('root-person').value;
            if (rootId) {
                showFanChart(rootId);
            } else {
                alert('Válassz ki egy gyökér személyt a legyező nézethez!');
                document.getElementById('tree-layout').value = 'vertical';
            }
        } else {
            // Show tree, hide fan chart
            document.getElementById('tree-container').style.display = '';
            document.getElementById('fan-chart-container').style.display = 'none';
            updateTree();
        }
    });
    
    document.getElementById('root-person').addEventListener('change', (e) => {
        rootPersonId = e.target.value ? parseInt(e.target.value) : null;
        if (currentLayout === 'fan') {
            showFanChart(rootPersonId);
        } else {
            updateTree();
        }
    });
    
    document.getElementById('export-image').addEventListener('click', exportTreeImage);
    
    // Ablakméret változás kezelése
    window.addEventListener('resize', () => {
        updateTree();
    });
    
    // Kezdeti betöltés
    updateTree();
}

// ==================== FA ADATOK BETÖLTÉSE ====================
async function updateTree() {
    try {
        treeData = await API.get('/tree/data');
        
        // Elmentett pozíciók betöltése ha van root person
        if (rootPersonId) {
            await loadSavedPositions(rootPersonId);
        } else {
            savedPositions = {};
        }
        
        renderTree();
    } catch (error) {
        console.error('Fa adatok betöltési hiba:', error);
    }
}

// ==================== POZÍCIÓK MENTÉSE/BETÖLTÉSE ====================
async function loadSavedPositions(rootId) {
    try {
        const response = await API.get(`/node-positions/${rootId}`);
        savedPositions = response.positions || {};
        console.log(`Betöltve ${Object.keys(savedPositions).length} elmentett pozíció`);
    } catch (error) {
        console.warn('Pozíciók betöltési hiba (lehet, hogy még nincs):', error);
        savedPositions = {};
    }
}

async function saveNodePosition(personId, x, y) {
    if (!rootPersonId) return;
    
    try {
        await API.post('/node-position', {
            person_id: personId,
            root_person_id: rootPersonId,
            x: x,
            y: y
        });
        // Lokálisan is frissítjük
        savedPositions[personId] = { x, y };
        console.log(`Pozíció mentve: személy ${personId} -> (${x}, ${y})`);
    } catch (error) {
        console.error('Pozíció mentési hiba:', error);
    }
}

async function resetAllPositions() {
    if (!rootPersonId) return;
    
    try {
        await API.delete(`/node-positions/${rootPersonId}/reset`);
        savedPositions = {};
        console.log('Összes pozíció visszaállítva');
        updateTree(); // Újrarajzolás automatikus elhelyezéssel
    } catch (error) {
        console.error('Pozíciók visszaállítási hiba:', error);
    }
}

// ==================== FA RAJZOLÁS ====================
function renderTree() {
    // Ha nincs g elem, ne csináljunk semmit
    if (!g) return;
    
    // Törlés
    g.selectAll('*').remove();
    
    if (treeData.nodes.length === 0) {
        renderEmptyState();
        return;
    }
    
    const container = document.getElementById('tree-container');
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Ha a container nem látható (0 méret), ne rajzoljunk
    if (width <= 0 || height <= 0) return;
    
    // Beállítások
    const cardWidth = settings.card_width || 200;
    const cardHeight = settings.card_height || 100;
    const horizontalSpacing = cardWidth + 60;
    const verticalSpacing = cardHeight + 100;
    
    // === ÚJ GENERÁCIÓ-ALAPÚ LAYOUT ===
    const layoutResult = buildGenerationLayout({
        cardWidth,
        cardHeight,
        horizontalSpacing,
        verticalSpacing
    });
    
    if (!layoutResult || layoutResult.nodes.length === 0) {
        renderEmptyState();
        return;
    }
    
    const { nodes: positionedNodes, links: layoutLinks } = layoutResult;

    // === SZÜLŐ-GYERMEK VONALAK RAJZOLÁSA (családonként) ===
    // Családok összegyűjtése
    const familyChildLinks = new Map(); // familyId -> { parents: [], children: [] }
    
    // Debug info összegyűjtése
    const debugInfo = {
        disconnectedFamilies: [],
        missingParents: [],
        missingChildren: []
    };
    
    layoutLinks.filter(l => l.type === 'parent-child').forEach(link => {
        const familyId = link.familyId;
        if (!familyId) return;
        
        if (!familyChildLinks.has(familyId)) {
            familyChildLinks.set(familyId, { parents: new Set(), children: [] });
        }
        
        familyChildLinks.get(familyId).parents.add(link.source);
        if (!familyChildLinks.get(familyId).children.includes(link.target)) {
            familyChildLinks.get(familyId).children.push(link.target);
        }
    });
    
    // Családonként rajzoljuk a vonalakat
    const linksGroup = g.append('g').attr('class', 'links');
    
    familyChildLinks.forEach((family, familyId) => {
        const parentIds = Array.from(family.parents);
        const childIds = family.children;
        
        // Szülők pozíciói
        const parentPositions = parentIds
            .map(id => positionedNodes.find(n => n.id === id))
            .filter(Boolean);
        
        // Debug: hiányzó szülők
        if (parentPositions.length === 0) {
            const parentNames = parentIds.map(id => {
                const p = treeData.nodes.find(n => n.id === id);
                return p ? p.name : `ID:${id}`;
            });
            debugInfo.missingParents.push({
                familyId,
                parentIds,
                parentNames,
                reason: 'Szülők nem pozícionáltak'
            });
            console.warn(`⚠️ Családfa hiba [Family ${familyId}]: Szülők (${parentNames.join(', ')}) nincsenek pozícionálva`);
            return;
        }
        
        if (childIds.length === 0) return;
        
        // Gyerekek pozíciói
        const childPositions = childIds
            .map(id => positionedNodes.find(n => n.id === id))
            .filter(Boolean);
        
        // Debug: hiányzó gyerekek
        if (childPositions.length === 0) {
            const childNames = childIds.map(id => {
                const c = treeData.nodes.find(n => n.id === id);
                return c ? c.name : `ID:${id}`;
            });
            debugInfo.missingChildren.push({
                familyId,
                childIds,
                childNames,
                reason: 'Gyerekek nem pozícionáltak'
            });
            console.warn(`⚠️ Családfa hiba [Family ${familyId}]: Gyerekek (${childNames.join(', ')}) nincsenek pozícionálva`);
            return;
        }
        
        // Szülőpár középpontja
        const parentCenterX = parentPositions.reduce((sum, p) => sum + p.x, 0) / parentPositions.length;
        const parentBottomY = Math.max(...parentPositions.map(p => p.y)) + cardHeight / 2;
        
        // Gyerekek teteje - kis offset-tel feljebb
        const childTopY = Math.min(...childPositions.map(c => c.y)) - cardHeight / 2;
        
        // === ROUTING: Minden családnak SAJÁT vízszintes vonal magassága ===
        // A familyId alapján kis offset-et adunk, hogy a vonalak ne fedjenek át
        // Alap pozíció: 20px a gyerekek kártyái fölött
        const baseChildrenLineY = childTopY - 20;
        // Minden családnak saját offset a familyId hash alapján
        const familyOffset = (familyId % 5) * 8; // 0, 8, 16, 24, 32 px offset
        const childrenLineY = baseChildrenLineY - familyOffset;
        
        // ROUTING: Minden családnak SAJÁT junctionY magassága
        // A szülők középpontjának X pozíciója alapján kis offset-et adunk
        // Így a vonalak nem futnak egymáson át
        const baseJunctionY = (parentBottomY + childrenLineY) / 2;
        // A családok X pozíciója alapján kis vertikális eltolás (max ±30px)
        const xNormalized = parentCenterX / 1000; // Normalizálás
        const junctionOffset = xNormalized * 15; // ±15px offset
        const junctionY = baseJunctionY + junctionOffset;
        
        const color = settings.line_color || '#666';
        const width = settings.line_width || 2;
        
        // Mindkét szülőtől vonal lefelé a junction pontig
        parentPositions.forEach(parent => {
            linksGroup.append('path')
                .attr('class', 'tree-link parent-to-junction')
                .attr('d', `M${parent.x},${parent.y + cardHeight/2} L${parent.x},${junctionY}`)
                .style('stroke', color)
                .style('stroke-width', width)
                .style('fill', 'none');
        });
        
        // Ha két szülő van, vízszintes vonal köztük a junction szinten
        if (parentPositions.length === 2) {
            const leftX = Math.min(parentPositions[0].x, parentPositions[1].x);
            const rightX = Math.max(parentPositions[0].x, parentPositions[1].x);
            
            linksGroup.append('path')
                .attr('class', 'tree-link parents-horizontal')
                .attr('d', `M${leftX},${junctionY} L${rightX},${junctionY}`)
                .style('stroke', color)
                .style('stroke-width', width)
                .style('fill', 'none');
        }
        
        // Gyerekek X pozícióinak szélső értékei és középpontja
        const childLeftX = Math.min(...childPositions.map(c => c.x));
        const childRightX = Math.max(...childPositions.map(c => c.x));
        const childCenterX = childPositions.reduce((sum, c) => sum + c.x, 0) / childPositions.length;
        
        // === ÚJ ROUTING LOGIKA ===
        // A vonal NEM nyúlik át más családok területére!
        // Ehelyett: szülők középpontjából lefelé, majd KÖZVETLENÜL a gyerekek középpontjához
        // (nem a teljes gyerek-tartományra)
        
        // 1. Szülők középpontjából lefelé a junctionY-ig (már megrajzolva fent)
        // 2. Szülők középpontjából lefelé a childrenLineY-ig
        linksGroup.append('path')
            .attr('class', 'tree-link junction-down')
            .attr('d', `M${parentCenterX},${junctionY} L${parentCenterX},${childrenLineY}`)
            .style('stroke', color)
            .style('stroke-width', width)
            .style('fill', 'none');
        
        // 3. Vízszintes vonal a szülők középpontjától a gyerekek középpontjáig
        //    (NEM a szélső gyerekekig - csak a középpontig!)
        if (Math.abs(parentCenterX - childCenterX) > 1) {
            linksGroup.append('path')
                .attr('class', 'tree-link parent-to-child-center')
                .attr('d', `M${parentCenterX},${childrenLineY} L${childCenterX},${childrenLineY}`)
                .style('stroke', color)
                .style('stroke-width', width)
                .style('fill', 'none');
        }
        
        // 4. Vízszintes vonal a gyerekek között (gyerekek X tartományán belül)
        if (childPositions.length > 1) {
            linksGroup.append('path')
                .attr('class', 'tree-link children-horizontal')
                .attr('d', `M${childLeftX},${childrenLineY} L${childRightX},${childrenLineY}`)
                .style('stroke', color)
                .style('stroke-width', width)
                .style('fill', 'none');
        }
        
        // 5. Minden gyerekhez függőleges vonal a vízszintes vonaltól a kártya tetejéig
        childPositions.forEach(child => {
            linksGroup.append('path')
                .attr('class', 'tree-link child-vertical')
                .attr('d', `M${child.x},${childrenLineY} L${child.x},${child.y - cardHeight/2}`)
                .style('stroke', color)
                .style('stroke-width', width)
                .style('fill', 'none');
        });
    });
    
    // Házassági vonalak rajzolása
    // A vonalak a kártya szélétől kis távolságra kezdődnek, hogy ne látszódjanak át a transzparens kártyán
    const marriageLineGap = 5; // Kis rés a kártya széle és a vonal között
    
    g.append('g')
        .attr('class', 'marriage-links')
        .selectAll('line')
        .data(layoutLinks.filter(l => l.type === 'marriage'))
        .enter()
        .append('line')
        .attr('class', 'tree-link marriage')
        .attr('x1', d => {
            const source = positionedNodes.find(n => n.id === d.source);
            const target = positionedNodes.find(n => n.id === d.target);
            if (!source || !target) return 0;
            // Mindig a bal oldali kártya jobb szélétől indul
            const leftNode = source.x < target.x ? source : target;
            return leftNode.x + cardWidth/2 + marriageLineGap;
        })
        .attr('y1', d => {
            const source = positionedNodes.find(n => n.id === d.source);
            const target = positionedNodes.find(n => n.id === d.target);
            if (!source || !target) return 0;
            const leftNode = source.x < target.x ? source : target;
            return leftNode.y;
        })
        .attr('x2', d => {
            const source = positionedNodes.find(n => n.id === d.source);
            const target = positionedNodes.find(n => n.id === d.target);
            if (!source || !target) return 0;
            // Mindig a jobb oldali kártya bal széléig megy
            const rightNode = source.x > target.x ? source : target;
            return rightNode.x - cardWidth/2 - marriageLineGap;
        })
        .attr('y2', d => {
            const source = positionedNodes.find(n => n.id === d.source);
            const target = positionedNodes.find(n => n.id === d.target);
            if (!source || !target) return 0;
            const rightNode = source.x > target.x ? source : target;
            return rightNode.y;
        })
        .style('stroke', settings.line_color || '#666')
        .style('stroke-width', settings.line_width || 2);
    
    // Házassági szimbólumok (szív)
    layoutLinks.filter(l => l.type === 'marriage').forEach(link => {
        const source = positionedNodes.find(n => n.id === link.source);
        const target = positionedNodes.find(n => n.id === link.target);
        if (!source || !target) return;
        
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        
        g.append('text')
            .attr('x', midX)
            .attr('y', midY + 5)
            .attr('text-anchor', 'middle')
            .style('font-size', '14px')
            .style('fill', link.status === 'divorced' ? '#999' : '#e74c3c')
            .text(link.status === 'divorced' ? '💔' : '❤️');
    });
    
    // Cache-eljük a pozícionált node-okat az újrarajzoláshoz
    positionedNodesCache = positionedNodes;
    
    // Generációs szintek kiszámítása (egyedi Y értékek)
    const generationLevels = [...new Set(positionedNodes.map(n => n.y))].sort((a, b) => a - b);
    // Vertikális vonalak - egyedi X értékek (személyek pozíciói)
    const verticalLevels = [...new Set(positionedNodes.map(n => n.x))].sort((a, b) => a - b);
    const SNAP_THRESHOLD = 15; // Pixelek - ennyi közelségben snap-el
    
    // Segédvonalak csoportja
    let guidesGroup = null;
    let currentDraggedId = null;
    
    // Drag behavior létrehozása
    let dragStartX = null, dragStartY = null;
    let hasMoved = false;
    
    const dragBehavior = d3.drag()
        .on('start', function(event, d) {
            isDragging = true;
            currentDraggedId = d.id;
            dragStartX = d.x;
            dragStartY = d.y;
            hasMoved = false;
            d3.select(this).raise().classed('dragging', true);
            // Zoom kikapcsolása drag közben
            svg.on('.zoom', null);
            
            // Segédvonalak csoport létrehozása
            guidesGroup = g.append('g').attr('class', 'guides');
            
            // Összes generációs szint megjelenítése halványan (vízszintes vonalak)
            generationLevels.forEach(levelY => {
                if (Math.abs(levelY - d.y) > 5) { // Saját szintjét nem mutatjuk
                    guidesGroup.append('line')
                        .attr('class', 'guide-line guide-horizontal')
                        .attr('x1', -5000)
                        .attr('x2', 5000)
                        .attr('y1', levelY)
                        .attr('y2', levelY)
                        .attr('data-level', levelY)
                        .style('stroke', 'rgba(74, 144, 226, 0.3)')
                        .style('stroke-width', 1)
                        .style('stroke-dasharray', '5,5')
                        .style('pointer-events', 'none');
                }
            });
            
            // Vertikális vonalak - más személyek X pozícióinál
            verticalLevels.forEach(levelX => {
                if (Math.abs(levelX - d.x) > 5) { // Saját pozícióját nem mutatjuk
                    guidesGroup.append('line')
                        .attr('class', 'guide-line guide-vertical')
                        .attr('x1', levelX)
                        .attr('x2', levelX)
                        .attr('y1', -5000)
                        .attr('y2', 5000)
                        .attr('data-level', levelX)
                        .style('stroke', 'rgba(226, 144, 74, 0.3)')  // Narancs szín
                        .style('stroke-width', 1)
                        .style('stroke-dasharray', '5,5')
                        .style('pointer-events', 'none');
                }
            });
        })
        .on('drag', function(event, d) {
            let newX = event.x;
            let newY = event.y;
            
            // Check if actually moved (more than 3px threshold)
            if (Math.abs(newX - dragStartX) > 3 || Math.abs(newY - dragStartY) > 3) {
                hasMoved = true;
            }
            
            // Snap logika - Y tengelyen (generációs szintek)
            let snappedY = null;
            for (const levelY of generationLevels) {
                if (Math.abs(newY - levelY) < SNAP_THRESHOLD) {
                    snappedY = levelY;
                    break;
                }
            }
            
            // Snap logika - X tengelyen (vertikális igazítás)
            let snappedX = null;
            for (const levelX of verticalLevels) {
                if (Math.abs(newX - levelX) < SNAP_THRESHOLD) {
                    snappedX = levelX;
                    break;
                }
            }
            
            // Ha van snap, használjuk azt
            if (snappedY !== null) {
                newY = snappedY;
            }
            if (snappedX !== null) {
                newX = snappedX;
            }
            
            // Pozíció frissítése
            d.x = newX;
            d.y = newY;
            d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
            
            // Segédvonalak frissítése - aktív snap kiemelése
            if (guidesGroup) {
                // Vízszintes vonalak (Y snap)
                guidesGroup.selectAll('.guide-horizontal')
                    .style('stroke', function() {
                        const lineY = parseFloat(d3.select(this).attr('data-level'));
                        if (Math.abs(lineY - newY) < 1) {
                            return 'rgba(74, 144, 226, 1)'; // Aktív snap - erős kék
                        }
                        return 'rgba(74, 144, 226, 0.3)'; // Inaktív - halvány
                    })
                    .style('stroke-width', function() {
                        const lineY = parseFloat(d3.select(this).attr('data-level'));
                        return Math.abs(lineY - newY) < 1 ? 2 : 1;
                    })
                    .style('stroke-dasharray', function() {
                        const lineY = parseFloat(d3.select(this).attr('data-level'));
                        return Math.abs(lineY - newY) < 1 ? 'none' : '5,5';
                    });
                
                // Vertikális vonalak (X snap)
                guidesGroup.selectAll('.guide-vertical')
                    .style('stroke', function() {
                        const lineX = parseFloat(d3.select(this).attr('data-level'));
                        if (Math.abs(lineX - newX) < 1) {
                            return 'rgba(226, 144, 74, 1)'; // Aktív snap - erős narancs
                        }
                        return 'rgba(226, 144, 74, 0.3)'; // Inaktív - halvány
                    })
                    .style('stroke-width', function() {
                        const lineX = parseFloat(d3.select(this).attr('data-level'));
                        return Math.abs(lineX - newX) < 1 ? 2 : 1;
                    })
                    .style('stroke-dasharray', function() {
                        const lineX = parseFloat(d3.select(this).attr('data-level'));
                        return Math.abs(lineX - newX) < 1 ? 'none' : '5,5';
                    });
                
                // Aktív snap jelző szöveg
                guidesGroup.selectAll('.snap-indicator').remove();
                
                // Y snap jelző
                if (snappedY !== null) {
                    const genIndex = generationLevels.indexOf(snappedY);
                    const genLabel = genIndex >= 0 ? `Gen ${genIndex}` : '';
                    
                    guidesGroup.append('text')
                        .attr('class', 'snap-indicator')
                        .attr('x', newX + 100)
                        .attr('y', snappedY - 5)
                        .style('fill', '#4A90D9')
                        .style('font-size', '12px')
                        .style('font-weight', 'bold')
                        .text(`📍 ${genLabel}`);
                }
                
                // X snap jelző
                if (snappedX !== null) {
                    // Ki van ezen az X pozíción?
                    const alignedPerson = positionedNodes.find(n => n.id !== currentDraggedId && Math.abs(n.x - snappedX) < 1);
                    const alignLabel = alignedPerson ? alignedPerson.name.split(' ')[0] : '';
                    
                    guidesGroup.append('text')
                        .attr('class', 'snap-indicator')
                        .attr('x', snappedX + 5)
                        .attr('y', newY - 50)
                        .attr('transform', `rotate(-90, ${snappedX + 5}, ${newY - 50})`)
                        .style('fill', '#E29048')
                        .style('font-size', '11px')
                        .style('font-weight', 'bold')
                        .text(`⬆ ${alignLabel}`);
                }
            }
            
            // Vonalak azonnali újrarajzolása (csak a módosított node vonalai)
            redrawLinksForNode(d.id, positionedNodes, layoutLinks);
        })
        .on('end', function(event, d) {
            isDragging = false;
            currentDraggedId = null;
            d3.select(this).classed('dragging', false);
            
            // Segédvonalak eltávolítása
            if (guidesGroup) {
                guidesGroup.remove();
                guidesGroup = null;
            }
            
            // Zoom visszakapcsolása
            svg.call(zoom);
            
            // Pozíció mentése CSAK ha ténylegesen mozgattuk
            if (hasMoved) {
                saveNodePosition(d.id, d.x, d.y);
            }
            
            // Reset tracking
            dragStartX = null;
            dragStartY = null;
            hasMoved = false;
            
            // Teljes vonal újrarajzolás
            redrawAllLinks(positionedNodes, layoutLinks);
        });
    
    // Csomópontok (személyek) rajzolása
    const nodes = g.append('g')
        .attr('class', 'nodes')
        .selectAll('g')
        .data(positionedNodes)
        .enter()
        .append('g')
        .attr('class', 'tree-node')
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .call(dragBehavior)  // Drag behavior hozzáadása
        .on('click', (event, d) => {
            event.stopPropagation();
            openPersonModal(d.id);
        })
        .on('mouseenter', (event, d) => showTooltip(event, { data: d }))
        .on('mouseleave', hideTooltip);
    
    // Kártya háttér
    nodes.append('rect')
        .attr('x', -cardWidth / 2)
        .attr('y', -cardHeight / 2)
        .attr('width', cardWidth)
        .attr('height', cardHeight)
        .attr('rx', settings.card_border_radius || 8)
        .attr('ry', settings.card_border_radius || 8)
        .style('fill', d => getNodeColor(d))
        .style('stroke', d => {
            // Egyenesági személyek kiemelése a beállított színnel
            if (d.isDirectLine) {
                return settings.direct_lineage_color || '#E8B84A';
            }
            return d3.color(getNodeColor(d)).darker(0.3);
        })
        .style('stroke-width', d => d.isDirectLine ? 3 : 2)
        .style('opacity', d => d.is_alive ? 1 : (settings.deceased_opacity || 0.7));
    
    // Rokonsági fok címke (bal felső sarokban)
    nodes.append('text')
        .attr('x', -cardWidth / 2 + 5)
        .attr('y', -cardHeight / 2 + 12)
        .attr('text-anchor', 'start')
        .style('font-family', settings.font_family || 'Arial, sans-serif')
        .style('font-size', '9px')
        .style('font-weight', '500')
        .style('fill', d => d.isDirectLine ? (settings.direct_lineage_color || '#E8B84A') : 'rgba(255,255,255,0.7)')
        .text(d => d.relationLabel || '');
    
    // Profilkép (opcionális)
    if (settings.show_photos !== false) {
        nodes.append('clipPath')
            .attr('id', d => `clip-${d.id}`)
            .append('circle')
            .attr('cx', -cardWidth / 2 + 30)
            .attr('cy', 0)
            .attr('r', 25);
        
        nodes.append('image')
            .attr('xlink:href', d => d.photo || '/static/img/placeholder-avatar.svg')
            .attr('x', -cardWidth / 2 + 5)
            .attr('y', -25)
            .attr('width', 50)
            .attr('height', 50)
            .attr('clip-path', d => `url(#clip-${d.id})`)
            .style('opacity', d => d.is_alive ? 1 : (settings.deceased_opacity || 0.7));
    }
    
    // Név
    const textXOffset = settings.show_photos !== false ? -cardWidth / 2 + 65 : -cardWidth / 2 + 10;
    
    nodes.append('text')
        .attr('x', textXOffset)
        .attr('y', settings.show_photos !== false ? -15 : -5)
        .attr('text-anchor', 'start')
        .style('font-family', settings.font_family || 'Arial, sans-serif')
        .style('font-size', `${settings.font_size || 14}px`)
        .style('font-weight', '600')
        .style('fill', '#fff')
        .text(d => truncateText(d.name, cardWidth - (settings.show_photos !== false ? 80 : 20)));
    
    // Dátumok (opcionális)
    if (settings.show_dates !== false) {
        nodes.append('text')
            .attr('x', textXOffset)
            .attr('y', settings.show_photos !== false ? 5 : 15)
            .attr('text-anchor', 'start')
            .style('font-family', settings.font_family || 'Arial, sans-serif')
            .style('font-size', `${(settings.font_size || 14) - 2}px`)
            .style('fill', 'rgba(255,255,255,0.9)')
            .text(d => {
                let dates = '';
                if (d.birth_date) {
                    dates = formatShortDate(d.birth_date);
                }
                if (d.death_date) {
                    dates += ` - ${formatShortDate(d.death_date)}`;
                } else if (d.birth_date && d.is_alive !== false) {
                    dates += ' -';
                }
                return dates;
            });
    }
    
    // Foglalkozás (opcionális)
    if (settings.show_occupation) {
        nodes.append('text')
            .attr('x', textXOffset)
            .attr('y', 25)
            .attr('text-anchor', 'start')
            .style('font-family', settings.font_family || 'Arial, sans-serif')
            .style('font-size', `${(settings.font_size || 14) - 3}px`)
            .style('fill', 'rgba(255,255,255,0.8)')
            .text(d => truncateText(d.occupation || '', cardWidth - 80));
    }
    
    // Elhunyt jelző
    nodes.filter(d => !d.is_alive)
        .append('text')
        .attr('x', cardWidth / 2 - 15)
        .attr('y', -cardHeight / 2 + 20)
        .style('font-family', 'Font Awesome 6 Free')
        .style('font-weight', '900')
        .style('font-size', '14px')
        .style('fill', 'rgba(255,255,255,0.8)')
        .text('\uf654'); // cross icon
    
    // ==================== INTERAKTÍV + GOMBOK ====================
    // Szülő hozzáadása gomb (felül)
    const addButtons = nodes.append('g')
        .attr('class', 'add-buttons')
        .style('opacity', 0);
    
    // Szülő hozzáadása (felül - középen)
    addButtons.append('g')
        .attr('class', 'add-parent-btn')
        .attr('transform', `translate(0, ${-cardHeight/2 - 25})`)
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
            event.stopPropagation();
            openAddRelativeModal(d.id, 'parent');
        })
        .call(g => {
            g.append('circle')
                .attr('r', 14)
                .style('fill', '#27ae60')
                .style('stroke', '#fff')
                .style('stroke-width', 2);
            g.append('text')
                .attr('text-anchor', 'middle')
                .attr('dy', '0.35em')
                .style('fill', '#fff')
                .style('font-size', '16px')
                .style('font-weight', 'bold')
                .text('+');
        })
        .append('title').text('Szülő hozzáadása');
    
    // Partner hozzáadása (jobbra)
    addButtons.append('g')
        .attr('class', 'add-partner-btn')
        .attr('transform', `translate(${cardWidth/2 + 25}, 0)`)
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
            event.stopPropagation();
            openAddRelativeModal(d.id, 'partner');
        })
        .call(g => {
            g.append('circle')
                .attr('r', 14)
                .style('fill', '#e74c3c')
                .style('stroke', '#fff')
                .style('stroke-width', 2);
            g.append('text')
                .attr('text-anchor', 'middle')
                .attr('dy', '0.35em')
                .style('fill', '#fff')
                .style('font-size', '16px')
                .style('font-weight', 'bold')
                .text('+');
        })
        .append('title').text('Partner hozzáadása');
    
    // Gyermek hozzáadása (alul - csak ha van partnere)
    addButtons.append('g')
        .attr('class', 'add-child-btn')
        .attr('transform', `translate(0, ${cardHeight/2 + 25})`)
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
            event.stopPropagation();
            openAddRelativeModal(d.id, 'child');
        })
        .call(g => {
            g.append('circle')
                .attr('r', 14)
                .style('fill', '#3498db')
                .style('stroke', '#fff')
                .style('stroke-width', 2);
            g.append('text')
                .attr('text-anchor', 'middle')
                .attr('dy', '0.35em')
                .style('fill', '#fff')
                .style('font-size', '16px')
                .style('font-weight', 'bold')
                .text('+');
        })
        .append('title').text('Gyermek hozzáadása');
    
    // Testvér hozzáadása (balra - csak ha vannak szülei)
    addButtons.append('g')
        .attr('class', 'add-sibling-btn')
        .attr('transform', `translate(${-cardWidth/2 - 25}, 0)`)
        .style('cursor', 'pointer')
        .style('display', d => {
            // Csak akkor jelenjen meg, ha van parent_family_id
            const person = treeData.nodes.find(n => n.id === d.id);
            return person?.parent_family_id ? 'block' : 'none';
        })
        .on('click', (event, d) => {
            event.stopPropagation();
            openAddRelativeModal(d.id, 'sibling');
        })
        .call(g => {
            g.append('circle')
                .attr('r', 14)
                .style('fill', '#9b59b6')
                .style('stroke', '#fff')
                .style('stroke-width', 2);
            g.append('text')
                .attr('text-anchor', 'middle')
                .attr('dy', '0.35em')
                .style('fill', '#fff')
                .style('font-size', '16px')
                .style('font-weight', 'bold')
                .text('+');
        })
        .append('title').text('Testvér hozzáadása');
    
    // Gombok megjelenítése hover-re
    nodes.on('mouseenter', function(event, d) {
        d3.select(this).select('.add-buttons')
            .transition()
            .duration(200)
            .style('opacity', 1);
        showTooltip(event, { data: d });
    })
    .on('mouseleave', function() {
        d3.select(this).select('.add-buttons')
            .transition()
            .duration(200)
            .style('opacity', 0);
        hideTooltip();
    });

    // Debug információk összefoglalása
    if (debugInfo.missingParents.length > 0 || debugInfo.missingChildren.length > 0) {
        console.group('🔍 Családfa debug információk');
        
        if (debugInfo.missingParents.length > 0) {
            console.warn('Hiányzó/nem pozícionált szülők:');
            debugInfo.missingParents.forEach(info => {
                console.warn(`  - Family ${info.familyId}: ${info.parentNames.join(', ')} - ${info.reason}`);
            });
        }
        
        if (debugInfo.missingChildren.length > 0) {
            console.warn('Hiányzó/nem pozícionált gyerekek:');
            debugInfo.missingChildren.forEach(info => {
                console.warn(`  - Family ${info.familyId}: ${info.childNames.join(', ')} - ${info.reason}`);
            });
        }
        
        console.groupEnd();
        
        // Vizuális figyelmeztetés ikon a fán (bal felső sarokban)
        g.append('g')
            .attr('class', 'debug-warning')
            .attr('transform', `translate(${-width/2 + 20}, ${-height/2 + 20})`)
            .append('text')
            .attr('x', 0)
            .attr('y', 0)
            .style('font-size', '24px')
            .style('cursor', 'pointer')
            .text('⚠️')
            .on('click', () => {
                alert(`Családfa figyelmeztetés:\n\n` +
                    `Néhány vonal nem rajzolható meg, mert a szülők vagy gyerekek nincsenek megfelelően pozícionálva.\n\n` +
                    `Részletek a böngésző konzoljában (F12 -> Console).`);
            });
    }
    
    // Középre igazítás
    centerTree();
}

// ==================== LAYOUT ENGINE ====================
// Determinisztikus, generációs réteg-alapú elrendezés
// Virtuális házassági csomópontokkal és Manhattan vonalvezetéssel

function buildGenerationLayout(sizes) {
    if (!treeData.nodes || treeData.nodes.length === 0) {
        return { nodes: [], links: [] };
    }
    
    const { cardWidth, cardHeight, horizontalSpacing, verticalSpacing } = sizes;
    const PERSON_WIDTH = cardWidth;
    const MARGIN = 30;
    
    // ============ 1. KAPCSOLATOK FELÉPÍTÉSE ============
    const familyMap = new Map();     // family_id -> { person1_id, person2_id, children: [], status }
    const parentsOf = new Map();     // person_id -> [parent_ids]
    const childrenOf = new Map();    // person_id -> [child_ids]
    const partnersOf = new Map();    // person_id -> [{ partnerId, marriageId, status }]
    const siblingFamilyOf = new Map(); // person_id -> family_id (ahol ő gyerek)
    
    // Inicializálás
    treeData.nodes.forEach(n => {
        parentsOf.set(n.id, []);
        childrenOf.set(n.id, []);
        partnersOf.set(n.id, []);
        if (n.parent_family_id) {
            siblingFamilyOf.set(n.id, n.parent_family_id);
        }
    });
    
    // Családok feldolgozása
    if (treeData.marriages) {
        treeData.marriages.forEach(m => {
            familyMap.set(m.id, {
                person1_id: m.person1_id,
                person2_id: m.person2_id,
                children: [],
                status: m.status || 'active'
            });
            
            // Partner kapcsolatok mindkét irányban
            if (m.person1_id && m.person2_id) {
                if (partnersOf.has(m.person1_id)) {
                    partnersOf.get(m.person1_id).push({
                        partnerId: m.person2_id,
                        marriageId: m.id,
                        status: m.status || 'active'
                    });
                }
                if (partnersOf.has(m.person2_id)) {
                    partnersOf.get(m.person2_id).push({
                        partnerId: m.person1_id,
                        marriageId: m.id,
                        status: m.status || 'active'
                    });
                }
            }
        });
    }
    
    // Szülő-gyerek kapcsolatok
    treeData.nodes.forEach(node => {
        if (node.parent_family_id && familyMap.has(node.parent_family_id)) {
            const family = familyMap.get(node.parent_family_id);
            family.children.push(node.id);
            
            const parents = [family.person1_id, family.person2_id].filter(Boolean);
            parentsOf.set(node.id, parents);
            
            parents.forEach(parentId => {
                if (childrenOf.has(parentId)) {
                    const ch = childrenOf.get(parentId);
                    if (!ch.includes(node.id)) ch.push(node.id);
                }
            });
        }
    });
    
    // ============ 2. GENERÁCIÓK MEGHATÁROZÁSA (BFS a kiválasztott gyökérből) ============
    let startId = rootPersonId || treeData.nodes[0]?.id;
    
    // Ha van rootPersonId, az legyen a 0. generáció
    // Ha nincs, keressük meg a legfelső őst
    if (!rootPersonId) {
        const findTopAncestor = (id, visited = new Set()) => {
            if (visited.has(id)) return id;
            visited.add(id);
            const parents = parentsOf.get(id) || [];
            if (parents.length === 0) return id;
            return findTopAncestor(parents[0], visited);
        };
        startId = findTopAncestor(startId);
    }
    
    const generations = new Map();  // person_id -> generation (relatív a gyökérhez)
    const visited = new Set();
    
    // BFS a generációk kiosztásához
    const assignGenerationsFromRoot = (rootId) => {
        const queue = [{ id: rootId, gen: 0 }];
        visited.add(rootId);
        generations.set(rootId, 0);
        
        while (queue.length > 0) {
            const { id, gen } = queue.shift();
            
            // Szülők - 1 generációval feljebb (negatív)
            const parents = parentsOf.get(id) || [];
            parents.forEach(parentId => {
                if (!visited.has(parentId)) {
                    visited.add(parentId);
                    generations.set(parentId, gen - 1);
                    queue.push({ id: parentId, gen: gen - 1 });
                }
            });
            
            // Partnerek - ugyanaz a generáció
            const partners = partnersOf.get(id) || [];
            partners.forEach(p => {
                if (!visited.has(p.partnerId)) {
                    visited.add(p.partnerId);
                    generations.set(p.partnerId, gen);
                    queue.push({ id: p.partnerId, gen });
                }
            });
            
            // Gyerekek - 1 generációval lejjebb (pozitív)
            const children = childrenOf.get(id) || [];
            children.forEach(childId => {
                if (!visited.has(childId)) {
                    visited.add(childId);
                    generations.set(childId, gen + 1);
                    queue.push({ id: childId, gen: gen + 1 });
                }
            });
        }
    };
    
    assignGenerationsFromRoot(startId);
    
    // Nem látogatott személyek (szigetek)
    treeData.nodes.forEach(n => {
        if (!visited.has(n.id)) {
            assignGenerationsFromRoot(n.id);
        }
    });
    
    // Generációk normalizálása: a legkisebb legyen 0
    const minGen = Math.min(...generations.values());
    generations.forEach((gen, id) => {
        generations.set(id, gen - minGen);
    });
    
    // ============ 2b. EGYENESÁGI ÉS ROKONSÁGI FOK SZÁMÍTÁSA ============
    // A gyökérszemélyhez képest számoljuk az egyenesági leszármazást és a rokonsági fokot
    const directLineage = new Set(); // egyenesági ősök és leszármazottak
    const relationshipLabels = new Map(); // person_id -> rokonsági megnevezés
    
    // Segédfüggvény: közös ős megtalálása és a távolság meghatározása
    const findCommonAncestorDistance = (personId) => {
        // Megkeressük a gyökérszemélytől való legközelebbi közös őst
        // és visszaadjuk, hány generációra van a közös ős a gyökértől
        
        // Gyűjtsük össze a gyökér őseit szintenként
        const rootAncestors = new Map(); // ancestorId -> distance from root
        const collectAncestors = (id, distance, ancestors) => {
            ancestors.set(id, distance);
            const parents = parentsOf.get(id) || [];
            parents.forEach(pid => {
                if (!ancestors.has(pid)) {
                    collectAncestors(pid, distance + 1, ancestors);
                }
            });
        };
        collectAncestors(rootActualId, 0, rootAncestors);
        
        // Keressük meg a person őseit és a közös őst
        const personAncestors = new Map();
        collectAncestors(personId, 0, personAncestors);
        
        // Találjuk meg a legközelebbi közös őst
        let minCommonDistance = Infinity;
        personAncestors.forEach((personDist, ancestorId) => {
            if (rootAncestors.has(ancestorId)) {
                const rootDist = rootAncestors.get(ancestorId);
                // Az unokatestvér fokozata = közös ős távolsága - 1
                // pl. nagyszülő közös ős (2 gen) -> 1. fokú unokatestvér
                if (rootDist < minCommonDistance) {
                    minCommonDistance = rootDist;
                }
            }
        });
        
        return minCommonDistance === Infinity ? 0 : minCommonDistance;
    };
    
    // Segédfüggvény: magyar rokonsági megnevezések
    const getRelationshipLabel = (genDiff, isDirectLine, gender, isSibling = false, siblingLineGenDiff = 0, cousinDegree = 0) => {
        // FONTOS: Az "Én" címke csak a gyökérszemélynél jelenjen meg, 
        // nem itt adjuk hozzá, hanem külön a findDirectLineage-ben
        
        const isMale = gender === 'male';
        
        // Egyenesági ősök (negatív generáció = felmenők)
        if (isDirectLine && genDiff < 0) {
            const absGen = Math.abs(genDiff);
            if (absGen === 1) return isMale ? 'Apa' : 'Anya';
            if (absGen === 2) return isMale ? 'Nagyapa' : 'Nagymama';
            if (absGen === 3) return isMale ? 'Dédapa' : 'Dédmama';
            if (absGen === 4) return isMale ? 'Ükapa' : 'Ükmama';
            if (absGen === 5) return isMale ? 'Szépapa' : 'Szépmama';
            return `${absGen}. ős (${isMale ? 'férfi' : 'nő'})`;
        }
        
        // Egyenesági leszármazottak (pozitív generáció = lemenők)
        if (isDirectLine && genDiff > 0) {
            if (genDiff === 1) return isMale ? 'Fiú' : 'Lány';
            if (genDiff === 2) return isMale ? 'Unoka (fiú)' : 'Unoka (lány)';
            if (genDiff === 3) return isMale ? 'Dédunoka (fiú)' : 'Dédunoka (lány)';
            if (genDiff === 4) return isMale ? 'Ükunoka (fiú)' : 'Ükunoka (lány)';
            return `${genDiff}. leszármazott`;
        }
        
        // Testvérek és oldalági rokonok
        if (isSibling && siblingLineGenDiff === 0) {
            return isMale ? 'Fivér' : 'Nővér';
        }
        
        // Oldalági rokonok - nagybácsi/nagynéni vonal
        if (genDiff < 0) {
            const absGen = Math.abs(genDiff);
            if (absGen === 1) return isMale ? 'Nagybácsi' : 'Nagynéni';
            if (absGen === 2) return isMale ? 'Nagybácsi (nagy-)' : 'Nagynéni (nagy-)';
            return `Oldalági felmenő (${absGen}. gen)`;
        }
        
        // Oldalági leszármazottak - unokaöcs/unokahúg vonal
        if (genDiff > 0) {
            if (genDiff === 1) return isMale ? 'Unokaöcs' : 'Unokahúg';
            if (genDiff === 2) return isMale ? 'Unokaöcs gyereke' : 'Unokahúg gyereke';
            return `Oldalági leszármazott (${genDiff}. gen)`;
        }
        
        // Ugyanaz a generáció (unokatestvérek) - fokozat megkülönböztetése
        // cousinDegree: 2 = nagyszülő közös ős (1. fokú), 3 = dédszülő közös ős (2. fokú), stb.
        if (cousinDegree >= 2) {
            const degree = cousinDegree - 1; // 1. fokú, 2. fokú, stb.
            if (degree === 1) {
                return isMale ? 'Unokatestvér (fiú)' : 'Unokatestvér (lány)';
            } else if (degree === 2) {
                return isMale ? 'Másodunokatestvér (fiú)' : 'Másodunokatestvér (lány)';
            } else if (degree === 3) {
                return isMale ? 'Harmadunokatestvér (fiú)' : 'Harmadunokatestvér (lány)';
            } else {
                return `${degree}. unokatestvér (${isMale ? 'fiú' : 'lány'})`;
            }
        }
        
        return isMale ? 'Unokatestvér (fiú)' : 'Unokatestvér (lány)';
    };
    
    // Egyenesági vonal meghatározása a gyökértől
    const rootGen = rootPersonId ? 0 : (generations.get(startId) || 0);
    const rootActualId = rootPersonId || startId;
    
    // BFS az egyenesági vonal meghatározásához
    const findDirectLineage = () => {
        directLineage.add(rootActualId);
        relationshipLabels.set(rootActualId, 'Én');
        
        // Felmenők bejárása (csak egyenes ág)
        let currentId = rootActualId;
        let genDiff = 0;
        
        const traverseAncestors = (personId, depth) => {
            const parents = parentsOf.get(personId) || [];
            parents.forEach(parentId => {
                directLineage.add(parentId);
                const parent = treeData.nodes.find(n => n.id === parentId);
                relationshipLabels.set(parentId, getRelationshipLabel(-depth, true, parent?.gender));
                traverseAncestors(parentId, depth + 1);
            });
        };
        traverseAncestors(rootActualId, 1);
        
        // Leszármazottak bejárása (csak egyenes ág)
        const traverseDescendants = (personId, depth) => {
            const children = childrenOf.get(personId) || [];
            children.forEach(childId => {
                directLineage.add(childId);
                const child = treeData.nodes.find(n => n.id === childId);
                relationshipLabels.set(childId, getRelationshipLabel(depth, true, child?.gender));
                traverseDescendants(childId, depth + 1);
            });
        };
        traverseDescendants(rootActualId, 1);
        
        // Partnerek megjelölése
        const partners = partnersOf.get(rootActualId) || [];
        partners.forEach(p => {
            const partner = treeData.nodes.find(n => n.id === p.partnerId);
            const status = p.status === 'divorced' ? ' (elvált)' : '';
            relationshipLabels.set(p.partnerId, (partner?.gender === 'male' ? 'Férj' : 'Feleség') + status);
        });
        
        // Testvérek megjelölése
        const myParentFamily = treeData.nodes.find(n => n.id === rootActualId)?.parent_family_id;
        if (myParentFamily && familyMap.has(myParentFamily)) {
            const siblings = familyMap.get(myParentFamily).children.filter(id => id !== rootActualId);
            siblings.forEach(sibId => {
                const sib = treeData.nodes.find(n => n.id === sibId);
                if (!relationshipLabels.has(sibId)) {
                    relationshipLabels.set(sibId, getRelationshipLabel(0, false, sib?.gender, true, 0));
                }
            });
        }
        
        // Mostoha szülők megjelölése (szülő jelenlegi/volt partnerei, akik NEM a másik szülő)
        const myParents = parentsOf.get(rootActualId) || [];
        myParents.forEach(parentId => {
            const parentPartners = partnersOf.get(parentId) || [];
            parentPartners.forEach(pp => {
                // Ha a partner NEM a másik szülő, akkor mostoha szülő
                if (!myParents.includes(pp.partnerId) && !relationshipLabels.has(pp.partnerId)) {
                    const stepParent = treeData.nodes.find(n => n.id === pp.partnerId);
                    const status = pp.status === 'divorced' ? ' (volt)' : '';
                    const label = stepParent?.gender === 'male' ? 'Mostohaapa' : 'Mostohaanya';
                    relationshipLabels.set(pp.partnerId, label + status);
                }
            });
        });
        
        // Nagybácsik/Nagynénik megjelölése (szülők testvérei)
        myParents.forEach(parentId => {
            const parentNode = treeData.nodes.find(n => n.id === parentId);
            const parentParentFamily = parentNode?.parent_family_id;
            if (parentParentFamily && familyMap.has(parentParentFamily)) {
                const parentSiblings = familyMap.get(parentParentFamily).children.filter(id => id !== parentId);
                parentSiblings.forEach(sibId => {
                    if (!relationshipLabels.has(sibId)) {
                        const sib = treeData.nodes.find(n => n.id === sibId);
                        relationshipLabels.set(sibId, sib?.gender === 'male' ? 'Nagybácsi' : 'Nagynéni');
                    }
                    // A nagybácsi/nagynéni partnerei is jelölve legyenek
                    const sibPartners = partnersOf.get(sibId) || [];
                    sibPartners.forEach(sp => {
                        if (!relationshipLabels.has(sp.partnerId)) {
                            const sibPartner = treeData.nodes.find(n => n.id === sp.partnerId);
                            const status = sp.status === 'divorced' ? ' (volt)' : '';
                            relationshipLabels.set(sp.partnerId, (sibPartner?.gender === 'male' ? 'Nagybácsi' : 'Nagynéni') + ' (házastárs)' + status);
                        }
                    });
                });
            }
        });
        
        // Oldalági rokonok megjelölése (akik nem egyenesági és nincs még címkéjük)
        treeData.nodes.forEach(node => {
            if (!relationshipLabels.has(node.id)) {
                const nodeGen = generations.get(node.id) || 0;
                const rootNormalizedGen = generations.get(rootActualId) || 0;
                const genDiff = nodeGen - rootNormalizedGen;
                
                // Unokatestvérek esetén (genDiff === 0) meghatározzuk a fokozatot
                let cousinDegree = 0;
                if (genDiff === 0) {
                    cousinDegree = findCommonAncestorDistance(node.id);
                }
                
                relationshipLabels.set(node.id, getRelationshipLabel(genDiff, false, node.gender, false, 0, cousinDegree));
            }
        });
    };
    
    findDirectLineage();

    // ============ 3. GENERÁCIÓNKÉNTI CSOPORTOSÍTÁS ============
    const genGroups = new Map();  // gen -> [person_ids]
    generations.forEach((gen, id) => {
        if (!genGroups.has(gen)) genGroups.set(gen, []);
        genGroups.get(gen).push(id);
    });
    
    const sortedGens = Array.from(genGroups.keys()).sort((a, b) => a - b);
    
    // ============ 4. CROSSING-FREE LAYOUT ALGORITHM ============
    // 
    // A vonalak kereszteződésének elkerülése érdekében a következő elveket alkalmazzuk:
    // 1. Minden családi egység (szülők + gyerekek) összefüggő X-tartományban helyezkedik el
    // 2. A szülők a gyerekeik középpontja fölé kerülnek
    // 3. A testvérek egymás mellett vannak, a házastársak a külső széleken
    // 4. Az X-sorrend konzisztens minden generációban
    //
    // ALGORITMUS:
    // 1. BOTTOM-UP: Számítsuk ki minden személy/család szélességét a leszármazottak alapján
    // 2. TOP-DOWN: Pozícionáljuk a személyeket a szülők alapján
    
    const positionedNodes = [];
    const nodePositions = new Map();  // person_id -> { x, y }
    const layoutLinks = [];
    const marriageNodes = new Map();
    
    // Személy szélességének kiszámítása (a teljes leszármazott-fa alapján)
    const personSubtreeWidth = new Map();
    
    // Rekurzív szélesség-számítás (bottom-up)
    const calculatePersonWidth = (personId, visited = new Set()) => {
        if (visited.has(personId)) return horizontalSpacing;
        visited.add(personId);
        
        if (personSubtreeWidth.has(personId)) {
            return personSubtreeWidth.get(personId);
        }
        
        const person = treeData.nodes.find(n => n.id === personId);
        if (!person) {
            personSubtreeWidth.set(personId, horizontalSpacing);
            return horizontalSpacing;
        }
        
        // A személy saját szélessége (1 hely) + házastársak
        const partners = partnersOf.get(personId) || [];
        let ownWidth = horizontalSpacing;
        
        // Gyerekek szélességének összege
        const children = childrenOf.get(personId) || [];
        let childrenTotalWidth = 0;
        
        children.forEach(childId => {
            const childWidth = calculatePersonWidth(childId, new Set(visited));
            // A gyerek házastársainak szélessége is számít
            const childPartners = partnersOf.get(childId) || [];
            const childWithPartnersWidth = childWidth + (childPartners.length * horizontalSpacing);
            childrenTotalWidth += childWithPartnersWidth;
        });
        
        // A szélesség a nagyobb: saját méret vagy gyerekek összmérete
        const totalWidth = Math.max(ownWidth, childrenTotalWidth);
        personSubtreeWidth.set(personId, totalWidth);
        
        return totalWidth;
    };
    
    // Számítsuk ki minden személy szélességét
    treeData.nodes.forEach(n => calculatePersonWidth(n.id));
    
    // ============ 5. POZÍCIONÁLÁS - CROSSING-FREE ALGORITHM ============
    //
    // KULCS ELVE: A vonalkereszteződések elkerülése érdekében:
    // 1. Minden család X-tartománya összefüggő és nem átfedő más családokkal
    // 2. A gyerekek mindig a szüleik alatt helyezkednek el
    // 3. Az X-sorrend konzisztens generációkon keresztül
    //
    // ALGORITMUS:
    // 1. Fázis: Számítsuk ki minden családnak a szükséges szélességét (bottom-up)
    // 2. Fázis: Rendeljünk X-tartományokat a családoknak (top-down)
    // 3. Fázis: Pozícionáljuk a személyeket a tartományokon belül
    
    const occupiedRanges = new Map();  // gen -> [{left, right, familyId}] - foglalt X tartományok
    
    // Segédfüggvény: ellenőrizzük hogy egy tartomány szabad-e
    const isRangeFree = (gen, left, right) => {
        if (!occupiedRanges.has(gen)) return true;
        const ranges = occupiedRanges.get(gen);
        for (const r of ranges) {
            // Átfedés ellenőrzése
            if (!(right <= r.left || left >= r.right)) {
                return false;
            }
        }
        return true;
    };
    
    // Segédfüggvény: foglaljunk egy tartományt
    const reserveRange = (gen, left, right, familyId) => {
        if (!occupiedRanges.has(gen)) occupiedRanges.set(gen, []);
        occupiedRanges.get(gen).push({ left, right, familyId });
    };
    
    // Segédfüggvény: találjunk szabad helyet egy adott szélesség számára
    const findFreeRange = (gen, preferredCenter, width) => {
        const halfWidth = width / 2;
        let left = preferredCenter - halfWidth;
        let right = preferredCenter + halfWidth;
        
        if (isRangeFree(gen, left, right)) {
            return { left, right };
        }
        
        // Ha nincs szabad hely, keressünk jobbra és balra
        const step = horizontalSpacing;
        for (let offset = step; offset < 5000; offset += step) {
            // Próbáljuk jobbra
            if (isRangeFree(gen, preferredCenter + offset - halfWidth, preferredCenter + offset + halfWidth)) {
                return { left: preferredCenter + offset - halfWidth, right: preferredCenter + offset + halfWidth };
            }
            // Próbáljuk balra
            if (isRangeFree(gen, preferredCenter - offset - halfWidth, preferredCenter - offset + halfWidth)) {
                return { left: preferredCenter - offset - halfWidth, right: preferredCenter - offset + halfWidth };
            }
        }
        
        // Fallback: toljuk a tartomány jobb szélére
        const ranges = occupiedRanges.get(gen) || [];
        if (ranges.length === 0) return { left, right };
        const maxRight = Math.max(...ranges.map(r => r.right));
        return { left: maxRight + horizontalSpacing/2, right: maxRight + horizontalSpacing/2 + width };
    };
    
    // Személy pozícionálása
    const positionPerson = (personId, x, gen) => {
        if (nodePositions.has(personId)) return nodePositions.get(personId);
        
        const person = treeData.nodes.find(n => n.id === personId);
        if (!person) return null;
        
        // Elmentett pozíció használata, ha van
        let finalX = x;
        let finalY = gen * verticalSpacing;
        
        if (savedPositions[personId]) {
            finalX = savedPositions[personId].x;
            finalY = savedPositions[personId].y;
            console.log(`Elmentett pozíció használata: ${person.name} (${personId}) -> (${finalX}, ${finalY})`);
        }
        
        // Egyenesági és rokonsági fok hozzáadása
        const isDirectLine = directLineage.has(personId);
        const relationLabel = relationshipLabels.get(personId) || '';
        
        positionedNodes.push({ 
            ...person, 
            x: finalX, 
            y: finalY,
            isDirectLine,
            relationLabel,
            generation: gen
        });
        nodePositions.set(personId, { x: finalX, y: finalY });
        
        return { x: finalX, y: finalY };
    };
    
    // ============ FÁZIS 1: Családok szélességének kiszámítása (bottom-up) ============
    const familyWidths = new Map();  // familyId -> width (összes gyerek + házastársaik)
    
    // Segédfüggvény: egy szülőpár és összes leszármazottjának eltolása X irányban
    // FONTOS: Csak a vér szerinti leszármazottakat toljuk, NEM a házastársakat!
    // Különben a házastársak szülei nem mozdulnak és vonalkereszteződés lesz.
    const shiftFamilyAndDescendants = (marriageId, deltaX) => {
        if (Math.abs(deltaX) < 0.1) return;
        
        const family = familyMap.get(marriageId);
        if (!family) return;
        
        console.log(`  Cascade shift: házasság ${marriageId}, deltaX=${deltaX}`);
        
        // Csak a vér szerinti gyerekeket és AZOK leszármazottait toljuk
        const shiftBloodDescendants = (personId, visited = new Set()) => {
            if (visited.has(personId)) return;
            visited.add(personId);
            
            const pos = nodePositions.get(personId);
            if (pos) {
                pos.x += deltaX;
                console.log(`    Eltolva: ${treeData.nodes.find(n => n.id === personId)?.name} x += ${deltaX}`);
            }
            
            // A személy saját házasságai - csak a GYEREKEKET toljuk, a házastársat NEM!
            const partners = partnersOf.get(personId) || [];
            partners.forEach(p => {
                // A házastársat NEM toljuk - az ő családja külön marad
                // Csak a közös gyerekeket toljuk
                const partnerFamily = familyMap.get(p.marriageId);
                if (partnerFamily && partnerFamily.children) {
                    partnerFamily.children.forEach(childId => {
                        shiftBloodDescendants(childId, visited);
                    });
                }
            });
        };
        
        // Minden gyereket és azok vér szerinti leszármazottait eltoljuk
        if (family.children) {
            const visited = new Set();
            family.children.forEach(childId => shiftBloodDescendants(childId, visited));
        }
    };
    
    // Rekurzív szélesség-számítás
    const calculateFamilyChildrenWidth = (familyId, visited = new Set()) => {
        if (visited.has(familyId)) return 0;
        visited.add(familyId);
        
        if (familyWidths.has(familyId)) return familyWidths.get(familyId);
        
        const family = familyMap.get(familyId);
        if (!family) {
            familyWidths.set(familyId, 0);
            return 0;
        }
        
        const children = family.children || [];
        if (children.length === 0) {
            familyWidths.set(familyId, 0);
            return 0;
        }
        
        // Számítsuk ki minden gyerek szélességét (ő + házastársai + leszármazottai)
        let totalWidth = 0;
        children.forEach(childId => {
            // A gyerek maga
            let childWidth = horizontalSpacing;
            
            // A gyerek házastársai
            const childPartners = (partnersOf.get(childId) || [])
                .filter(p => generations.get(p.partnerId) === generations.get(childId));
            childWidth += childPartners.length * horizontalSpacing;
            
            // A gyerek saját családjainak leszármazott-szélessége
            childPartners.forEach(p => {
                if (familyMap.has(p.marriageId)) {
                    const descendantWidth = calculateFamilyChildrenWidth(p.marriageId, new Set(visited));
                    childWidth = Math.max(childWidth, descendantWidth);
                }
            });
            
            totalWidth += childWidth;
        });
        
        familyWidths.set(familyId, totalWidth);
        return totalWidth;
    };
    
    // Számítsuk ki minden család szélességét
    familyMap.forEach((family, familyId) => {
        calculateFamilyChildrenWidth(familyId);
    });
    
    // ============ FÁZIS 2: X-tartományok hozzárendelése családoknak ============
    const familyXRanges = new Map();  // familyId -> { left, right, centerX }
    
    // ============ FÁZIS 3: Pozícionálás generációnként ============
    // CROSSING-FREE ELRENDEZÉS - BOTTOM-UP:
    // - Generációk ALULRÓL FELFELE feldolgozása
    // - Először a legalsó generáció (legnagyobb szám)
    // - Majd minden szülőt a gyerekek X-pozíciója FÖLÉ helyezünk
    
    // Rendezzük a generációkat CSÖKKENŐ sorrendbe (legalsó először)
    const sortedGensBottomUp = [...sortedGens].sort((a, b) => b - a);
    
    console.log("=== BOTTOM-UP POZÍCIONÁLÁS ===");
    console.log("sortedGensBottomUp:", sortedGensBottomUp);
    
    // Segédfüggvény: családi egységek összegyűjtése egy generációban
    const collectFamilyUnitsForGen = (gen) => {
        const personsInGen = genGroups.get(gen) || [];
        const processed = new Set();
        const familyUnits = [];
        
        personsInGen.forEach(personId => {
            if (processed.has(personId)) return;
            
            const members = [];
            const queue = [personId];
            
            while (queue.length > 0) {
                const id = queue.shift();
                if (processed.has(id)) continue;
                if (generations.get(id) !== gen) continue;
                
                processed.add(id);
                members.push(id);
                
                const partners = partnersOf.get(id) || [];
                partners.forEach(p => {
                    if (!processed.has(p.partnerId) && generations.get(p.partnerId) === gen) {
                        queue.push(p.partnerId);
                    }
                });
            }
            
            if (members.length > 0) {
                let parentFamilyId = null;
                for (const id of members) {
                    const person = treeData.nodes.find(n => n.id === id);
                    if (person?.parent_family_id) {
                        parentFamilyId = person.parent_family_id;
                        break;
                    }
                }
                familyUnits.push({ members, parentFamilyId });
            }
        });
        
        return familyUnits;
    };
    
    // Rendezési segédfüggvény: testvérek születési dátum szerint, házastársak mellettük
    const orderMembersWithinUnit = (members, parentFamilyId) => {
        const actualSiblings = members.filter(id => {
            const person = treeData.nodes.find(n => n.id === id);
            return person?.parent_family_id === parentFamilyId;
        });
        
        actualSiblings.sort((a, b) => {
            const personA = treeData.nodes.find(n => n.id === a);
            const personB = treeData.nodes.find(n => n.id === b);
            if (personA?.birth_date && personB?.birth_date) {
                return personA.birth_date.localeCompare(personB.birth_date);
            }
            return a - b;
        });
        
        const siblingSpouses = new Map();
        actualSiblings.forEach(sibId => siblingSpouses.set(sibId, []));
        
        members.forEach(id => {
            if (actualSiblings.includes(id)) return;
            const partners = partnersOf.get(id) || [];
            for (const p of partners) {
                if (actualSiblings.includes(p.partnerId)) {
                    siblingSpouses.get(p.partnerId).push(id);
                    break;
                }
            }
        });
        
        const orderedPositioning = [];
        actualSiblings.forEach((sibId, idx) => {
            const spouses = siblingSpouses.get(sibId) || [];
            if (idx === 0 && spouses.length > 0) {
                spouses.forEach(sp => orderedPositioning.push(sp));
            }
            orderedPositioning.push(sibId);
            if (idx > 0 && spouses.length > 0) {
                spouses.forEach(sp => {
                    if (!orderedPositioning.includes(sp)) orderedPositioning.push(sp);
                });
            }
        });
        
        members.forEach(id => {
            if (!orderedPositioning.includes(id)) orderedPositioning.push(id);
        });
        
        return orderedPositioning;
    };
    
    // === BOTTOM-UP POZÍCIONÁLÁS ===
    // Minden generációt alulról felfele dolgozunk fel
    // Először a legalsó generáció, majd minden szülőt a gyerekek X-pozíciója fölé helyezünk
    
    sortedGensBottomUp.forEach((gen, genIndex) => {
        console.log(`\n--- Generáció ${gen} feldolgozása (index: ${genIndex}) ---`);
        const familyUnits = collectFamilyUnitsForGen(gen);
        
        if (genIndex === 0) {
            // LEGALSÓ generáció - középre igazítás
            console.log("Legalsó generáció - középre igazítás");
            let totalWidth = 0;
            familyUnits.forEach(unit => totalWidth += unit.members.length * horizontalSpacing);
            let currentX = -totalWidth / 2 + horizontalSpacing / 2;
            
            familyUnits.forEach(unit => {
                const ordered = orderMembersWithinUnit(unit.members, unit.parentFamilyId);
                const unitWidth = ordered.length * horizontalSpacing;
                const unitLeft = currentX - horizontalSpacing / 2;
                
                reserveRange(gen, unitLeft, unitLeft + unitWidth, unit.parentFamilyId);
                
                ordered.forEach((id, idx) => {
                    positionPerson(id, currentX + idx * horizontalSpacing, gen);
                });
                
                currentX += unitWidth;
            });
        } else {
            // FELSŐBB generációk - gyerekek X-pozíciója FÖLÉ
            // Minden személyt a saját gyerekei X-középpontja fölé kell tenni!
            
            const processedInThisGen = new Set();
            
            // Csoportosítás: szülőpárok az alapján, hogy melyik házassághoz tartoznak
            // és hol vannak a gyerekek
            const parentPlacements = []; // { members: [], childCenterX }
            
            familyUnits.forEach(unit => {
                // Minden tag házasságait vizsgáljuk
                unit.members.forEach(personId => {
                    if (processedInThisGen.has(personId)) return;
                    
                    const marriages = partnersOf.get(personId) || [];
                    
                    marriages.forEach(m => {
                        const family = familyMap.get(m.marriageId);
                        if (!family) return;
                        
                        // Van-e már pozícionált gyerek?
                        const positionedChildren = (family.children || []).filter(cid => nodePositions.has(cid));
                        
                        if (positionedChildren.length > 0) {
                            // Gyerekek X-pozíciójának középpontja
                            const childXs = positionedChildren.map(cid => nodePositions.get(cid).x);
                            const childCenterX = childXs.reduce((a, b) => a + b, 0) / childXs.length;
                            
                            // A házasság mindkét tagja
                            const parents = [family.person1_id, family.person2_id].filter(id => 
                                id && unit.members.includes(id) && !processedInThisGen.has(id)
                            );
                            
                            if (parents.length > 0) {
                                console.log(`Házasság ${m.marriageId}: szülők pozícionálása gyerekek fölé (childCenterX=${childCenterX})`);
                                console.log("  Szülők:", parents.map(id => treeData.nodes.find(n => n.id === id)?.name));
                                console.log("  Gyerekek:", positionedChildren.map(id => treeData.nodes.find(n => n.id === id)?.name));
                                
                                parentPlacements.push({
                                    members: [family.person1_id, family.person2_id].filter(id => id),
                                    childCenterX,
                                    marriageId: m.marriageId
                                });
                                
                                // Jelöljük meg ezeket a személyeket feldolgozottnak
                                if (family.person1_id) processedInThisGen.add(family.person1_id);
                                if (family.person2_id) processedInThisGen.add(family.person2_id);
                            }
                        }
                    });
                });
            });
            
            // Rendezzük a szülőpárokat a gyerekek X-pozíciója szerint (balról jobbra)
            parentPlacements.sort((a, b) => a.childCenterX - b.childCenterX);
            
            console.log("parentPlacements rendezve:", parentPlacements.map(pp => ({
                members: pp.members.map(id => treeData.nodes.find(n => n.id === id)?.name),
                childCenterX: pp.childCenterX
            })));
            
            // === ÚJ ALGORITMUS: KÖZVETLENÜL A GYEREKEK FÖLÉ ===
            // 1. Először minden szülőpárt a gyerekek X-középpontjára tesszük
            // 2. Ha átfedés van szomszédos párok között, széthúzzuk őket minimálisan
            // 3. ÚJ: A gyerekeket is eltoljuk, hogy pontosan a szülők alatt maradjanak!
            
            // Számítsuk ki az ideális pozíciókat
            const placements = parentPlacements.map(pp => {
                const width = pp.members.length * horizontalSpacing;
                return {
                    ...pp,
                    width,
                    idealLeft: pp.childCenterX - width / 2,
                    idealRight: pp.childCenterX + width / 2,
                    left: pp.childCenterX - width / 2,  // aktuális pozíció
                    right: pp.childCenterX + width / 2,
                    shiftApplied: 0  // mennyit toltuk el a szülőket
                };
            });
            
            // Oldjuk meg az átfedéseket balról jobbra haladva
            for (let i = 1; i < placements.length; i++) {
                const prev = placements[i - 1];
                const curr = placements[i];
                
                const gap = 20; // minimum távolság szülőpárok között
                const overlap = prev.right + gap - curr.left;
                
                if (overlap > 0) {
                    // Van átfedés - széthúzás
                    // A curr-t jobbra toljuk, de a gyerekeket NEM toljuk!
                    // A vonalak ortogonálisak lesznek és routing-gal kerüljük el a kereszteződést
                    const newLeft = prev.right + gap;
                    const shift = newLeft - curr.left;
                    
                    curr.left = newLeft;
                    curr.right = curr.left + curr.width;
                    curr.shiftApplied = shift;
                    
                    console.log(`Átfedés korrigálva: ${prev.members[0]} és ${curr.members[0]} között, overlap=${overlap}, shift=${shift}`);
                    // NEM hívjuk a shiftFamilyAndDescendants-et - a szülők eltolódnak, a gyerekek maradnak
                }
            }
            
            // Pozícionáljuk a szülőpárokat az új helyükre
            placements.forEach(({ members, left, width, marriageId, childCenterX }) => {
                const currentX = left + horizontalSpacing / 2;
                
                console.log(`Pozícionálás: childCenterX=${childCenterX}, left=${left}, currentX=${currentX}`);
                
                reserveRange(gen, left, left + width, marriageId);
                
                members.forEach((id, idx) => {
                    if (!nodePositions.has(id)) {
                        positionPerson(id, currentX + idx * horizontalSpacing, gen);
                    }
                });
            });
            
            // Maradék személyek (akiknek nincs pozícionált gyerekük)
            familyUnits.forEach(unit => {
                unit.members.forEach(id => {
                    if (nodePositions.has(id)) return;
                    
                    // Próbáljuk a házastárs mellé tenni
                    const partners = partnersOf.get(id) || [];
                    for (const p of partners) {
                        const partnerPos = nodePositions.get(p.partnerId);
                        if (partnerPos) {
                            const { left } = findFreeRange(gen, partnerPos.x + horizontalSpacing, horizontalSpacing);
                            const x = left + horizontalSpacing / 2;
                            reserveRange(gen, x - horizontalSpacing/2, x + horizontalSpacing/2, null);
                            positionPerson(id, x, gen);
                            return;
                        }
                    }
                    
                    // Fallback: bármilyen szabad hely
                    const { left } = findFreeRange(gen, 0, horizontalSpacing);
                    const x = left + horizontalSpacing / 2;
                    reserveRange(gen, x - horizontalSpacing/2, x + horizontalSpacing/2, null);
                    positionPerson(id, x, gen);
                });
            });
        }
    });
    
    // ============ 8. HÁZASSÁGI LINKEK ============
    if (treeData.marriages) {
        treeData.marriages.forEach(marriage => {
            const p1Pos = nodePositions.get(marriage.person1_id);
            const p2Pos = nodePositions.get(marriage.person2_id);
            
            if (p1Pos && p2Pos) {
                // Virtuális M-Node középen
                const mNodeX = (p1Pos.x + p2Pos.x) / 2;
                const mNodeY = p1Pos.y;  // Ugyanabban a sorban
                
                marriageNodes.set(marriage.id, {
                    x: mNodeX,
                    y: mNodeY,
                    person1_id: marriage.person1_id,
                    person2_id: marriage.person2_id
                });
                
                layoutLinks.push({
                    source: marriage.person1_id,
                    target: marriage.person2_id,
                    type: 'marriage',
                    status: marriage.status || 'active',
                    marriageId: marriage.id
                });
            }
        });
    }
    
    // ============ 9. SZÜLŐ-GYEREK LINKEK ============
    // A linkek a szülőktől a gyerekekhez mennek
    // A renderelés majd családonként csoportosítja és a házasság középpontjából rajzolja
    familyMap.forEach((family, familyId) => {
        if (family.children.length === 0) return;
        
        const p1Pos = nodePositions.get(family.person1_id);
        const p2Pos = nodePositions.get(family.person2_id);
        
        if (!p1Pos && !p2Pos) return;
        
        const parentIds = [family.person1_id, family.person2_id]
            .filter(id => id && nodePositions.has(id));
        
        family.children.forEach(childId => {
            if (!nodePositions.has(childId)) return;
            
            // Minden szülőtől külön link a gyerekhez
            // A renderelés majd családonként összevonja
            parentIds.forEach(parentId => {
                layoutLinks.push({
                    source: parentId,
                    target: childId,
                    type: 'parent-child',
                    familyId
                });
            });
        });
    });
    
    return { nodes: positionedNodes, links: layoutLinks, marriageNodes };
}

// ==================== KAPCSOLAT VONALAK ====================
// Routing: a szülő-gyerek vonalak a házasság középpontjából indulnak
function getLinkPath(d) {
    // Source és target pozíciók meghatározása
    let sourceX, sourceY, targetX, targetY;
    
    if (d.source.isMNode) {
        // A source egy házasság középpont (M-node)
        sourceX = d.source.x;
        sourceY = d.source.y;
    } else if (typeof d.source === 'object' && d.source.x !== undefined) {
        sourceX = d.source.x;
        sourceY = d.source.y;
    } else {
        // d.source egy node id - ez házassági linknél fordul elő
        return null; // Ezt a renderLink kezeli
    }
    
    if (typeof d.target === 'object' && d.target.x !== undefined) {
        targetX = d.target.x;
        targetY = d.target.y;
    } else {
        return null;
    }
    
    if (currentLayout === 'horizontal') {
        const midX = (sourceX + targetX) / 2;
        return `M${sourceX},${sourceY}
                L${midX},${sourceY}
                L${midX},${targetY}
                L${targetX},${targetY}`;
    } else if (currentLayout === 'radial') {
        return d3.linkRadial()
            .angle(d => d.x)
            .radius(d => d.y)(d);
    } else {
        // Vertikális nézet: OKOS ROUTING
        // 1. A házasság középpontjából (mNodeX) indul lefelé
        // 2. A gyerekek szintje FÖLÖTT (childY - offset) vízszintesen megy a gyerekek középpontjához
        // 3. Onnan lefelé megy minden gyerekhez
        
        // Használjuk a link mNodeX értékét ha van (házasság pozíció)
        const startX = d.mNodeX !== undefined ? d.mNodeX : sourceX;
        
        // A routing szint a gyerek szintje FÖLÖTT van, így a szülők sorából indul
        const routingY = sourceY + 40; // Kis offset a szülők alatt
        
        // A vonal: szülő -> le routing szintre -> vízszintesen -> le a gyerekhez
        return `M${startX},${sourceY}
                L${startX},${routingY}
                L${targetX},${routingY}
                L${targetX},${targetY}`;
    }
}

// ==================== CSOMÓPONT SZÍN ====================
function getNodeColor(data) {
    // Egyenesági személyek erősebb, oldalági rokonok halványabb színt kapnak
    const isDirectLine = data.isDirectLine === true;
    const opacityMultiplier = isDirectLine ? 1.0 : 0.7;
    
    // Elhunyt személyek szürkébb színt kapnak
    if (!data.is_alive) {
        if (data.gender === 'male') {
            return isDirectLine ? '#5a7a9d' : '#4a6a8d'; // Szürkés kék (egyenesági erősebb)
        } else if (data.gender === 'female') {
            return isDirectLine ? '#905a7c' : '#804a6c'; // Szürkés rózsaszín
        }
        return isDirectLine ? '#606060' : '#505050'; // Szürke
    }
    
    // Élő személyek - egyenesági erősebb, oldalági halványabb
    if (data.gender === 'male') {
        const baseColor = settings.male_color || '#4A90D9';
        return isDirectLine ? baseColor : d3.color(baseColor).darker(0.3).toString();
    } else if (data.gender === 'female') {
        const baseColor = settings.female_color || '#D94A8C';
        return isDirectLine ? baseColor : d3.color(baseColor).darker(0.3).toString();
    }
    const baseColor = settings.unknown_color || '#808080';
    return isDirectLine ? baseColor : d3.color(baseColor).darker(0.3).toString();
}

// ==================== TOOLTIP ====================
function showTooltip(event, d) {
    const data = d.data || d;
    const tooltip = d3.select('body').append('div')
        .attr('class', 'node-tooltip')
        .style('left', (event.pageX + 15) + 'px')
        .style('top', (event.pageY - 10) + 'px');
    
    let content = `<h4>${data.display_name || data.name}</h4>`;
    
    if (data.birth_date) {
        content += `<p><strong>Született:</strong> ${formatDate(data.birth_date)}`;
        if (data.birth_place) content += ` - ${data.birth_place}`;
        content += '</p>';
    }
    
    if (data.death_date) {
        content += `<p><strong>Elhunyt:</strong> ${formatDate(data.death_date)}`;
        if (data.death_place) content += ` - ${data.death_place}`;
        content += '</p>';
    }
    
    if (data.age) {
        content += `<p><strong>Kor:</strong> ${data.age} év</p>`;
    }
    
    if (data.occupation) {
        content += `<p><strong>Foglalkozás:</strong> ${data.occupation}</p>`;
    }
    
    tooltip.html(content);
}

function hideTooltip() {
    d3.selectAll('.node-tooltip').remove();
}

// ==================== VONALAK ÚJRARAJZOLÁSA DRAG UTÁN ====================
function redrawLinksForNode(nodeId, positionedNodes, layoutLinks) {
    // Gyors újrarajzolás drag közben - csak a házassági vonalakat frissítjük
    // A teljes újrarajzolás a drag end-nél történik
    
    // Házassági vonalak frissítése
    g.selectAll('.marriage-links line').each(function() {
        const line = d3.select(this);
        const sourceId = +line.attr('data-source');
        const targetId = +line.attr('data-target');
        
        if (sourceId === nodeId || targetId === nodeId) {
            const source = positionedNodes.find(n => n.id === sourceId);
            const target = positionedNodes.find(n => n.id === targetId);
            
            if (source && target) {
                const cardWidth = settings.card_width || 180;
                const marriageLineGap = 5;
                
                if (source.x < target.x) {
                    line.attr('x1', source.x + cardWidth/2 + marriageLineGap);
                    line.attr('x2', target.x - cardWidth/2 - marriageLineGap);
                } else {
                    line.attr('x1', source.x - cardWidth/2 - marriageLineGap);
                    line.attr('x2', target.x + cardWidth/2 + marriageLineGap);
                }
                line.attr('y1', source.y);
                line.attr('y2', target.y);
            }
        }
    });
}

function redrawAllLinks(positionedNodes, layoutLinks) {
    // Teljes újrarajzolás - töröljük a meglévő vonalakat és újrarajzoljuk
    g.selectAll('.links').remove();
    g.selectAll('.marriage-links').remove();
    g.selectAll('text').filter(function() {
        // Házassági szívek törlése
        const text = d3.select(this).text();
        return text === '❤️' || text === '💔';
    }).remove();
    
    const cardWidth = settings.card_width || 180;
    const cardHeight = settings.card_height || 80;
    
    // Családi linkek újraszámítása
    const familyChildLinks = new Map();
    layoutLinks.filter(l => l.type === 'parent-child').forEach(link => {
        const familyId = link.familyId;
        if (!familyId) return;
        
        if (!familyChildLinks.has(familyId)) {
            familyChildLinks.set(familyId, { parents: new Set(), children: [] });
        }
        
        familyChildLinks.get(familyId).parents.add(link.source);
        if (!familyChildLinks.get(familyId).children.includes(link.target)) {
            familyChildLinks.get(familyId).children.push(link.target);
        }
    });
    
    const linksGroup = g.insert('g', '.nodes').attr('class', 'links');
    const color = settings.line_color || '#666';
    const width = settings.line_width || 2;
    
    familyChildLinks.forEach((family, familyId) => {
        const parentIds = Array.from(family.parents);
        const childIds = family.children;
        
        const parentPositions = parentIds
            .map(id => positionedNodes.find(n => n.id === id))
            .filter(Boolean);
        
        const childPositions = childIds
            .map(id => positionedNodes.find(n => n.id === id))
            .filter(Boolean);
        
        if (parentPositions.length === 0 || childPositions.length === 0) return;
        
        const parentCenterX = parentPositions.reduce((sum, p) => sum + p.x, 0) / parentPositions.length;
        const parentBottomY = Math.max(...parentPositions.map(p => p.y)) + cardHeight / 2;
        const childTopY = Math.min(...childPositions.map(c => c.y)) - cardHeight / 2;
        
        const baseChildrenLineY = childTopY - 20;
        const familyOffset = (familyId % 5) * 8;
        const childrenLineY = baseChildrenLineY - familyOffset;
        
        const baseJunctionY = (parentBottomY + childrenLineY) / 2;
        const xNormalized = parentCenterX / 1000;
        const junctionOffset = xNormalized * 15;
        const junctionY = baseJunctionY + junctionOffset;
        
        // Szülőktől lefelé
        parentPositions.forEach(parent => {
            linksGroup.append('path')
                .attr('class', 'tree-link parent-to-junction')
                .attr('d', `M${parent.x},${parent.y + cardHeight/2} L${parent.x},${junctionY}`)
                .style('stroke', color)
                .style('stroke-width', width)
                .style('fill', 'none');
        });
        
        // Szülők közötti vízszintes
        if (parentPositions.length === 2) {
            const leftX = Math.min(parentPositions[0].x, parentPositions[1].x);
            const rightX = Math.max(parentPositions[0].x, parentPositions[1].x);
            
            linksGroup.append('path')
                .attr('d', `M${leftX},${junctionY} L${rightX},${junctionY}`)
                .style('stroke', color)
                .style('stroke-width', width)
                .style('fill', 'none');
        }
        
        // Lefelé a gyerekek szintjéig
        linksGroup.append('path')
            .attr('d', `M${parentCenterX},${junctionY} L${parentCenterX},${childrenLineY}`)
            .style('stroke', color)
            .style('stroke-width', width)
            .style('fill', 'none');
        
        // Gyerekek közötti/felé vízszintes
        const childLeftX = Math.min(...childPositions.map(c => c.x));
        const childRightX = Math.max(...childPositions.map(c => c.x));
        const childCenterX = childPositions.reduce((sum, c) => sum + c.x, 0) / childPositions.length;
        
        if (Math.abs(parentCenterX - childCenterX) > 1) {
            linksGroup.append('path')
                .attr('d', `M${parentCenterX},${childrenLineY} L${childCenterX},${childrenLineY}`)
                .style('stroke', color)
                .style('stroke-width', width)
                .style('fill', 'none');
        }
        
        if (childPositions.length > 1) {
            linksGroup.append('path')
                .attr('d', `M${childLeftX},${childrenLineY} L${childRightX},${childrenLineY}`)
                .style('stroke', color)
                .style('stroke-width', width)
                .style('fill', 'none');
        }
        
        // Gyerekekhez lefelé
        childPositions.forEach(child => {
            linksGroup.append('path')
                .attr('d', `M${child.x},${childrenLineY} L${child.x},${child.y - cardHeight/2}`)
                .style('stroke', color)
                .style('stroke-width', width)
                .style('fill', 'none');
        });
    });
    
    // Házassági vonalak újrarajzolása
    const marriageLineGap = 5;
    const marriageLinksGroup = g.insert('g', '.nodes').attr('class', 'marriage-links');
    
    layoutLinks.filter(l => l.type === 'marriage').forEach(link => {
        const source = positionedNodes.find(n => n.id === link.source);
        const target = positionedNodes.find(n => n.id === link.target);
        if (!source || !target) return;
        
        let x1, x2;
        if (source.x < target.x) {
            x1 = source.x + cardWidth/2 + marriageLineGap;
            x2 = target.x - cardWidth/2 - marriageLineGap;
        } else {
            x1 = source.x - cardWidth/2 - marriageLineGap;
            x2 = target.x + cardWidth/2 + marriageLineGap;
        }
        
        marriageLinksGroup.append('line')
            .attr('x1', x1)
            .attr('y1', source.y)
            .attr('x2', x2)
            .attr('y2', target.y)
            .attr('data-source', link.source)
            .attr('data-target', link.target)
            .style('stroke', color)
            .style('stroke-width', width)
            .style('stroke-dasharray', link.status === 'divorced' ? '5,5' : 'none');
        
        // Szív szimbólum
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        
        g.append('text')
            .attr('x', midX)
            .attr('y', midY + 5)
            .attr('text-anchor', 'middle')
            .style('font-size', '14px')
            .style('fill', link.status === 'divorced' ? '#999' : '#e74c3c')
            .text(link.status === 'divorced' ? '💔' : '❤️');
    });
}

// ==================== FA KÖZÉPRE IGAZÍTÁS ====================
function centerTree() {
    const container = document.getElementById('tree-container');
    if (!container || !g || !g.node()) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Ha a container nem látható (0 méret), ne csináljunk semmit
    if (width <= 0 || height <= 0) return;
    
    const bounds = g.node().getBBox();
    
    // Ha nincs tartalom a fában
    if (bounds.width <= 0 || bounds.height <= 0) return;
    
    const scale = Math.min(
        width / (bounds.width + 100),
        height / (bounds.height + 100),
        1
    );
    
    // NaN ellenőrzés
    if (isNaN(scale) || scale <= 0) return;
    
    const translateX = (width - bounds.width * scale) / 2 - bounds.x * scale;
    const translateY = (height - bounds.height * scale) / 2 - bounds.y * scale;
    
    // NaN ellenőrzés
    if (isNaN(translateX) || isNaN(translateY)) return;
    
    svg.transition()
        .duration(500)
        .call(
            zoom.transform,
            d3.zoomIdentity.translate(translateX, translateY).scale(scale)
        );
}

// ==================== ÜRES ÁLLAPOT ====================
function renderEmptyState() {
    const container = document.getElementById('tree-container');
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Ha a container nem látható, ne rajzoljunk
    if (width <= 0 || height <= 0) return;
    
    g.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2 - 30)
        .attr('text-anchor', 'middle')
        .style('font-size', '48px')
        .style('fill', '#ccc')
        .text('\uf1ae'); // Font Awesome tree icon
    
    g.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2 + 20)
        .attr('text-anchor', 'middle')
        .style('font-size', '18px')
        .style('fill', '#999')
        .text('Nincs még családtag a családfában');
    
    g.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2 + 50)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#bbb')
        .text('Kattintson az "Új személy" gombra a kezdéshez');
}

// ==================== KÉP EXPORTÁLÁS ====================
function exportTreeImage() {
    // Ellenőrizzük, melyik nézet aktív
    const fanContainer = document.getElementById('fan-chart-container');
    const isFanChartVisible = fanContainer && fanContainer.style.display !== 'none';
    
    let svgElement;
    let fileName;
    
    if (isFanChartVisible) {
        // Fan chart exportálása
        svgElement = fanContainer.querySelector('svg');
        fileName = 'family_fan_chart.png';
    } else {
        // Függőleges fa exportálása
        svgElement = document.getElementById('family-tree');
        fileName = 'family_tree.png';
    }
    
    if (!svgElement) {
        showNotification('Nincs exportálható diagram', 'warning');
        return;
    }
    
    const mainGroup = svgElement.querySelector('g');
    if (!mainGroup) {
        showNotification('Nincs exportálható tartalom', 'warning');
        return;
    }

    // Határoló doboz és padding a teljes fa köré
    const bounds = mainGroup.getBBox();
    const padding = 40;
    const exportWidth = Math.max(1, bounds.width + padding * 2);
    const exportHeight = Math.max(1, bounds.height + padding * 2);

    // Klón készítése, hogy az eredeti DOM-ot ne módosítsuk
    const clonedSvg = svgElement.cloneNode(true);
    const clonedGroup = clonedSvg.querySelector('g');
    if (clonedGroup) {
        // Eltoljuk, hogy pozitív koordinátákban legyen a tartalom
        clonedGroup.setAttribute('transform', `translate(${padding - bounds.x}, ${padding - bounds.y})`);
    }

    // Méret és viewBox beállítása
    clonedSvg.setAttribute('width', exportWidth);
    clonedSvg.setAttribute('height', exportHeight);
    clonedSvg.setAttribute('viewBox', `0 0 ${exportWidth} ${exportHeight}`);
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Stílusok összegyűjtése (amik elérhetők)
    let styles = '';
    for (const sheet of Array.from(document.styleSheets)) {
        try {
            for (const rule of Array.from(sheet.cssRules || [])) {
                styles += rule.cssText;
            }
        } catch (e) {
            // Cross-origin stílusok ignorálása
        }
    }

    const styleNode = document.createElement('style');
    styleNode.innerHTML = styles;
    clonedSvg.insertBefore(styleNode, clonedSvg.firstChild);

    // SVG stringgé alakítás
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    // Canvas konvertálás PNG-hez
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
        // 2x scale a jobb minőségért
        canvas.width = exportWidth * 2;
        canvas.height = exportHeight * 2;
        
        // Háttérszín: fan chart-nál dark mode figyelembevétele
        const darkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        let bgColor;
        if (isFanChartVisible) {
            bgColor = darkMode ? '#1a1a2e' : '#f8f8f8';
        } else {
            bgColor = settings.background_color || '#F5F5F5';
        }
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((pngBlob) => {
            const pngUrl = URL.createObjectURL(pngBlob);
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(pngUrl);
        }, 'image/png');

        URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
}

// ==================== SEGÉDFÜGGVÉNYEK ====================
function truncateText(text, maxWidth) {
    if (!text) return '';
    
    // Becsült karakter szám a szélesség alapján
    const avgCharWidth = (settings.font_size || 14) * 0.5;
    const maxChars = Math.floor(maxWidth / avgCharWidth);
    
    if (text.length <= maxChars) return text;
    return text.substring(0, maxChars - 3) + '...';
}

function formatShortDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.getFullYear().toString();
}

function formatDate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('hu-HU', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

// ==================== ROKON HOZZÁADÁSA MODAL ====================
function openAddRelativeModal(personId, relationType) {
    const person = persons.find(p => p.id === personId);
    if (!person) {
        showNotification('Személy nem található', 'error');
        return;
    }
    
    const personName = `${person.first_name} ${person.last_name}`;
    
    // Típus szövegek
    const typeLabels = {
        parent: { title: 'Szülő hozzáadása', desc: `${personName} szülője` },
        partner: { title: 'Partner hozzáadása', desc: `${personName} partnere` },
        child: { title: 'Gyermek hozzáadása', desc: `${personName} gyermeke` },
        sibling: { title: 'Testvér hozzáadása', desc: `${personName} testvére` }
    };
    
    const label = typeLabels[relationType] || { title: 'Rokon hozzáadása', desc: '' };
    
    // Modal HTML
    const modalHtml = `
        <div class="modal-overlay add-relative-modal" id="add-relative-modal">
            <div class="modal" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>${label.title}</h2>
                    <button class="modal-close" onclick="closeAddRelativeModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-content">
                    <p style="margin-bottom: 20px; color: var(--text-secondary);">${label.desc}</p>
                    
                    <div class="form-group">
                        <label>Vezetéknév *</label>
                        <input type="text" id="add-rel-lastname" placeholder="Vezetéknév" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Keresztnév *</label>
                        <input type="text" id="add-rel-firstname" placeholder="Keresztnév" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Nem *</label>
                        <select id="add-rel-gender">
                            <option value="">Válassz...</option>
                            <option value="male">Férfi</option>
                            <option value="female">Nő</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>Születési dátum</label>
                        <input type="date" id="add-rel-birthdate">
                    </div>
                    
                    ${relationType === 'parent' ? `
                    <div class="form-group">
                        <label>Szülő típusa</label>
                        <div class="radio-group" style="display: flex; gap: 20px; margin-top: 8px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="radio" name="parent-type" value="father" id="parent-type-father">
                                <span>Apa</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="radio" name="parent-type" value="mother" id="parent-type-mother">
                                <span>Anya</span>
                            </label>
                        </div>
                        <p style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">
                            A szülő típusa automatikusan beállítja a nemet és létrehozza a szülői kapcsolatot.
                        </p>
                    </div>
                    ` : ''}
                    
                    ${relationType === 'partner' ? `
                    <div class="form-group">
                        <label>Kapcsolat státusza</label>
                        <select id="add-rel-marriage-status">
                            <option value="married">Házas</option>
                            <option value="engaged">Jegyes</option>
                            <option value="partner">Élettárs</option>
                            <option value="divorced">Elvált</option>
                        </select>
                    </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeAddRelativeModal()">Mégse</button>
                    <button class="btn btn-primary" onclick="saveNewRelative(${personId}, '${relationType}')">
                        <i class="fas fa-plus"></i> Hozzáadás
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Modal hozzáadása a DOM-hoz
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Szülő típus radio gombok kezelése
    if (relationType === 'parent') {
        document.getElementById('parent-type-father')?.addEventListener('change', () => {
            document.getElementById('add-rel-gender').value = 'male';
        });
        document.getElementById('parent-type-mother')?.addEventListener('change', () => {
            document.getElementById('add-rel-gender').value = 'female';
        });
    }
    
    // Focus az első mezőre
    document.getElementById('add-rel-lastname').focus();
}

function closeAddRelativeModal() {
    const modal = document.getElementById('add-relative-modal');
    if (modal) {
        modal.remove();
    }
}

async function saveNewRelative(personId, relationType) {
    const lastName = document.getElementById('add-rel-lastname').value.trim();
    const firstName = document.getElementById('add-rel-firstname').value.trim();
    const gender = document.getElementById('add-rel-gender').value;
    const birthDate = document.getElementById('add-rel-birthdate').value;
    
    if (!lastName || !firstName) {
        showNotification('Név megadása kötelező!', 'error');
        return;
    }
    
    if (!gender) {
        showNotification('Nem megadása kötelező!', 'error');
        return;
    }
    
    try {
        // 1. Új személy létrehozása
        const newPersonData = {
            last_name: lastName,
            first_name: firstName,
            gender: gender,
            birth_date: birthDate || null,
            is_alive: true
        };
        
        const newPerson = await API.post('/persons', newPersonData);
        
        // 2. Kapcsolat létrehozása a típus szerint
        if (relationType === 'parent') {
            await createParentRelation(personId, newPerson.id, gender);
        } else if (relationType === 'partner') {
            const status = document.getElementById('add-rel-marriage-status')?.value || 'married';
            await createPartnerRelation(personId, newPerson.id, status);
        } else if (relationType === 'child') {
            await createChildRelation(personId, newPerson.id);
        } else if (relationType === 'sibling') {
            await createSiblingRelation(personId, newPerson.id);
        }
        
        showNotification(`${firstName} ${lastName} sikeresen hozzáadva!`, 'success');
        closeAddRelativeModal();
        
        // Adatok frissítése
        persons = await API.get('/persons');
        updateRootPersonSelector();
        await updateTree();
        
    } catch (error) {
        console.error('Hiba a rokon hozzáadásakor:', error);
        showNotification('Hiba történt: ' + (error.message || 'Ismeretlen hiba'), 'error');
    }
}

async function createParentRelation(childId, parentId, parentGender) {
    const child = persons.find(p => p.id === childId);
    
    // Ellenőrizzük, van-e már a gyereknek parent_family_id-ja
    if (child.parent_family_id) {
        // Van már családja, hozzáadjuk az új szülőt
        const marriages = await API.get('/marriages');
        const family = marriages.find(m => m.id === child.parent_family_id);
        
        if (family) {
            // Frissítjük a családot az új szülővel
            const updateData = {};
            if (!family.person1_id) {
                updateData.person1_id = parentId;
            } else if (!family.person2_id) {
                updateData.person2_id = parentId;
            } else {
                // Mindkét szülő pozíció foglalt
                showNotification('A gyereknek már két szülője van!', 'warning');
                return;
            }
            
            await API.put(`/marriages/${family.id}`, updateData);
        }
    } else {
        // Nincs még családja, létrehozunk egyet
        const marriageData = {
            person1_id: parentId,
            person2_id: null,
            relationship_type: 'marriage',
            status: 'active'
        };
        
        const newMarriage = await API.post('/marriages', marriageData);
        
        // Gyerek hozzárendelése a családhoz
        await API.put(`/persons/${childId}`, {
            parent_family_id: newMarriage.id
        });
    }
}

async function createPartnerRelation(personId, partnerId, status) {
    // Házasság/kapcsolat létrehozása
    // A status értéket átalakítjuk a megfelelő relationship_type-ra
    let relationshipType = 'marriage';
    let marriageStatus = 'active';
    
    switch (status) {
        case 'married':
            relationshipType = 'marriage';
            marriageStatus = 'active';
            break;
        case 'engaged':
            relationshipType = 'engagement';
            marriageStatus = 'active';
            break;
        case 'partner':
            relationshipType = 'partner';
            marriageStatus = 'active';
            break;
        case 'divorced':
            relationshipType = 'marriage';
            marriageStatus = 'divorced';
            break;
        default:
            relationshipType = 'marriage';
            marriageStatus = 'active';
    }
    
    const marriageData = {
        person1_id: personId,
        person2_id: partnerId,
        relationship_type: relationshipType,
        status: marriageStatus
    };
    
    await API.post('/marriages', marriageData);
}

async function createChildRelation(parentId, childId) {
    // Keressük meg a szülő házasságát
    const marriages = await API.get('/marriages');
    const parentMarriage = marriages.find(m => 
        m.person1_id === parentId || m.person2_id === parentId
    );
    
    if (parentMarriage) {
        // Van már házasság, hozzáadjuk a gyereket
        await API.put(`/persons/${childId}`, {
            parent_family_id: parentMarriage.id
        });
    } else {
        // Nincs házasság, létrehozunk egy "egyedülálló szülő" családot
        const marriageData = {
            person1_id: parentId,
            person2_id: null,
            status: 'single_parent'
        };
        
        const newMarriage = await API.post('/marriages', marriageData);
        
        await API.put(`/persons/${childId}`, {
            parent_family_id: newMarriage.id
        });
    }
}

async function createSiblingRelation(siblingId, newSiblingId) {
    const sibling = persons.find(p => p.id === siblingId);
    
    if (!sibling.parent_family_id) {
        showNotification('A testvérnek nincs szülői családja!', 'error');
        return;
    }
    
    // Az új testvért ugyanahhoz a családhoz rendeljük
    await API.put(`/persons/${newSiblingId}`, {
        parent_family_id: sibling.parent_family_id
    });
}

