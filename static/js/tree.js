// ==================== CSALÁDFA VIZUALIZÁCIÓ D3.js ====================

let svg, g, zoom;
let treeData = { nodes: [], links: [] };
let currentLayout = 'vertical';
let rootPersonId = null;

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
    
    document.getElementById('tree-layout').addEventListener('change', (e) => {
        currentLayout = e.target.value;
        updateTree();
    });
    
    document.getElementById('root-person').addEventListener('change', (e) => {
        rootPersonId = e.target.value ? parseInt(e.target.value) : null;
        updateTree();
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
        renderTree();
    } catch (error) {
        console.error('Fa adatok betöltési hiba:', error);
    }
}

// ==================== FA RAJZOLÁS ====================
function renderTree() {
    // Törlés
    g.selectAll('*').remove();
    
    if (treeData.nodes.length === 0) {
        renderEmptyState();
        return;
    }
    
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
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
        
        if (parentPositions.length === 0 || childIds.length === 0) return;
        
        // Gyerekek pozíciói
        const childPositions = childIds
            .map(id => positionedNodes.find(n => n.id === id))
            .filter(Boolean);
        
        if (childPositions.length === 0) return;
        
        // Szülőpár középpontja
        const parentCenterX = parentPositions.reduce((sum, p) => sum + p.x, 0) / parentPositions.length;
        const parentBottomY = Math.max(...parentPositions.map(p => p.y)) + cardHeight / 2;
        
        // Gyerekek teteje - kis offset-tel feljebb
        const childTopY = Math.min(...childPositions.map(c => c.y)) - cardHeight / 2;
        
        // Vízszintes vonal Y pozíciója - a gyerekek kártyái FÖLÖTT 20px-el
        const childrenLineY = childTopY - 20;
        
        // Középső Y (ahol a szülőktől jövő vonalak találkoznak) - a két szint között félúton
        const junctionY = (parentBottomY + childrenLineY) / 2;
        
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
        
        // A középpontból lefelé a gyerekek vízszintes vonalának szintjéig
        linksGroup.append('path')
            .attr('class', 'tree-link junction-down')
            .attr('d', `M${parentCenterX},${junctionY} L${parentCenterX},${childrenLineY}`)
            .style('stroke', color)
            .style('stroke-width', width)
            .style('fill', 'none');
        
        // Ha több gyerek van, vízszintes vonal a gyerekek között
        if (childPositions.length > 1) {
            const leftX = Math.min(...childPositions.map(c => c.x));
            const rightX = Math.max(...childPositions.map(c => c.x));
            
            linksGroup.append('path')
                .attr('class', 'tree-link children-horizontal')
                .attr('d', `M${leftX},${childrenLineY} L${rightX},${childrenLineY}`)
                .style('stroke', color)
                .style('stroke-width', width)
                .style('fill', 'none');
        }
        
        // Minden gyerekhez függőleges vonal a vízszintes vonaltól a kártya tetejéig
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
    g.append('g')
        .attr('class', 'marriage-links')
        .selectAll('line')
        .data(layoutLinks.filter(l => l.type === 'marriage'))
        .enter()
        .append('line')
        .attr('class', 'tree-link marriage')
        .attr('x1', d => {
            const source = positionedNodes.find(n => n.id === d.source);
            return source ? source.x + cardWidth/2 : 0;
        })
        .attr('y1', d => {
            const source = positionedNodes.find(n => n.id === d.source);
            return source ? source.y : 0;
        })
        .attr('x2', d => {
            const target = positionedNodes.find(n => n.id === d.target);
            return target ? target.x - cardWidth/2 : 0;
        })
        .attr('y2', d => {
            const target = positionedNodes.find(n => n.id === d.target);
            return target ? target.y : 0;
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
    
    // Csomópontok (személyek) rajzolása
    const nodes = g.append('g')
        .attr('class', 'nodes')
        .selectAll('g')
        .data(positionedNodes)
        .enter()
        .append('g')
        .attr('class', 'tree-node')
        .attr('transform', d => `translate(${d.x},${d.y})`)
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
        .style('stroke', d => d3.color(getNodeColor(d)).darker(0.3))
        .style('stroke-width', 2)
        .style('opacity', d => d.is_alive ? 1 : (settings.deceased_opacity || 0.7));
    
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
    
    // ============ 3. GENERÁCIÓNKÉNTI CSOPORTOSÍTÁS ============
    const genGroups = new Map();  // gen -> [person_ids]
    generations.forEach((gen, id) => {
        if (!genGroups.has(gen)) genGroups.set(gen, []);
        genGroups.get(gen).push(id);
    });
    
    const sortedGens = Array.from(genGroups.keys()).sort((a, b) => a - b);
    
    // ============ 4. VIRTUÁLIS HÁZASSÁGI CSOMÓPONTOK (M-Node) ============
    const marriageNodes = new Map();  // marriageId -> { x, y, person1_id, person2_id }
    
    // ============ 5. NUCLEAR FAMILY BLOKKOK LÉTREHOZÁSA ============
    // Minden család-egység: [ex-partnerek] [fő személy] [aktív partner]
    
    const buildFamilyBlock = (personId, gen) => {
        const person = treeData.nodes.find(n => n.id === personId);
        const allPartners = partnersOf.get(personId) || [];
        
        // Szétválasztás: ex és aktív partnerek
        const exPartners = [];
        const activePartners = [];
        
        allPartners.forEach(p => {
            // Csak azokat a partnereket vesszük, akik ugyanabban a generációban vannak
            if (generations.get(p.partnerId) !== gen) return;
            
            if (p.status === 'divorced' || p.status === 'ended' || p.status === 'separated') {
                exPartners.push(p);
            } else {
                activePartners.push(p);
            }
        });
        
        // Sorrend: ex-partnerek | fő személy | aktív partnerek
        return {
            mainPerson: personId,
            exPartners: exPartners.map(p => p.partnerId),
            activePartners: activePartners.map(p => p.partnerId),
            marriages: allPartners.filter(p => generations.get(p.partnerId) === gen)
        };
    };
    
    // ============ 6. SZÉLESSÉG SZÁMÍTÁSA (BOTTOM-UP) ============
    const subtreeWidths = new Map();  // familyId -> width
    
    const calculateFamilyWidth = (familyId) => {
        if (subtreeWidths.has(familyId)) return subtreeWidths.get(familyId);
        
        const family = familyMap.get(familyId);
        if (!family) return horizontalSpacing;
        
        const children = family.children || [];
        if (children.length === 0) {
            // Nincs gyerek - csak a szülők szélessége
            subtreeWidths.set(familyId, horizontalSpacing * 2);
            return horizontalSpacing * 2;
        }
        
        // Gyerekek szélességének összege
        let childrenWidth = 0;
        children.forEach(childId => {
            // A gyerek saját családjainak szélessége
            const childPartners = partnersOf.get(childId) || [];
            const childFamilyIds = childPartners
                .filter(p => {
                    // Csak azok a családok, ahol ő szülő (van közös gyerek)
                    const m = treeData.marriages?.find(m => m.id === p.marriageId);
                    return m && familyMap.get(p.marriageId)?.children?.length > 0;
                })
                .map(p => p.marriageId);
            
            if (childFamilyIds.length > 0) {
                childFamilyIds.forEach(fId => {
                    childrenWidth += calculateFamilyWidth(fId);
                });
            } else {
                // Gyereknek nincs saját családja - alap szélesség
                const partnerCount = childPartners.length;
                childrenWidth += horizontalSpacing * (1 + partnerCount);
            }
        });
        
        // A minimum szélesség a szülők szélessége
        const parentsWidth = horizontalSpacing * 2;
        const width = Math.max(parentsWidth, childrenWidth);
        
        subtreeWidths.set(familyId, width);
        return width;
    };
    
    // Számítsuk ki minden család szélességét
    familyMap.forEach((family, familyId) => {
        calculateFamilyWidth(familyId);
    });
    
    // ============ 7. POZÍCIONÁLÁS (TOP-DOWN) ============
    const positionedNodes = [];
    const nodePositions = new Map();  // person_id -> { x, y }
    const layoutLinks = [];
    const occupiedSlots = new Map();  // gen -> Set of occupied X positions
    
    const getOccupiedForGen = (gen) => {
        if (!occupiedSlots.has(gen)) occupiedSlots.set(gen, new Set());
        return occupiedSlots.get(gen);
    };
    
    const findFreeSlot = (preferredX, gen) => {
        const occupied = getOccupiedForGen(gen);
        let x = preferredX;
        let attempts = 0;
        const step = horizontalSpacing;
        
        while (occupied.has(Math.round(x / 10) * 10) && attempts < 100) {
            // Alternáló keresés: jobbra, balra, jobbra+1, balra+1, ...
            attempts++;
            if (attempts % 2 === 1) {
                x = preferredX + Math.ceil(attempts / 2) * step;
            } else {
                x = preferredX - Math.ceil(attempts / 2) * step;
            }
        }
        
        occupied.add(Math.round(x / 10) * 10);
        return x;
    };
    
    const positionPerson = (personId, x, gen) => {
        if (nodePositions.has(personId)) return nodePositions.get(personId);
        
        const person = treeData.nodes.find(n => n.id === personId);
        if (!person) return null;
        
        const y = gen * verticalSpacing;
        const finalX = findFreeSlot(x, gen);
        
        positionedNodes.push({ ...person, x: finalX, y });
        nodePositions.set(personId, { x: finalX, y });
        
        return { x: finalX, y };
    };
    
    // Pozícionálás generációnként
    sortedGens.forEach((gen, genIndex) => {
        const personsInGen = genGroups.get(gen) || [];
        const processed = new Set();
        
        // Csoportosítás családi egységekbe
        // A családi egység: a fő személy + az ő partnerei (ex és aktív)
        // Ha valakinek több partnere van, mindegyik partner a fő személy körül helyezkedik el
        const familyUnits = [];
        
        // Először a gyökérszemélyt dolgozzuk fel, ha ebben a generációban van
        const rootInThisGen = rootPersonId && generations.get(rootPersonId) === gen;
        const processingOrder = rootInThisGen 
            ? [rootPersonId, ...personsInGen.filter(id => id !== rootPersonId)]
            : personsInGen;
        
        processingOrder.forEach(personId => {
            if (processed.has(personId)) return;
            
            const person = treeData.nodes.find(n => n.id === personId);
            
            // LÉPÉS 1: Meghatározzuk ki a "központi" személy
            // Ha a gyökér ebben a generációban van, ő a központ
            // Ha a gyökér partnere itt van, a partner a központ
            // Egyébként aki parent_family_id-val rendelkezik
            let centralPerson = personId;
            
            // Gyűjtsük össze az összes személyt, akik össze vannak kötve házasságokkal
            const collectConnectedPersons = (startId, collected = new Set()) => {
                if (collected.has(startId)) return collected;
                if (generations.get(startId) !== gen) return collected;
                collected.add(startId);
                
                const partners = partnersOf.get(startId) || [];
                partners.forEach(p => {
                    if (!collected.has(p.partnerId) && generations.get(p.partnerId) === gen) {
                        collectConnectedPersons(p.partnerId, collected);
                    }
                });
                return collected;
            };
            
            const connectedGroup = collectConnectedPersons(personId);
            
            // Már feldolgozott személyek kiszűrése
            const unprocessedInGroup = [...connectedGroup].filter(id => !processed.has(id));
            if (unprocessedInGroup.length === 0) return;
            
            // Meghatározzuk a központi személyt
            // Prioritás: 1. gyökérszemély, 2. parent_family_id-val rendelkező, 3. első
            if (rootInThisGen && connectedGroup.has(rootPersonId)) {
                centralPerson = rootPersonId;
            } else {
                for (const id of unprocessedInGroup) {
                    const p = treeData.nodes.find(n => n.id === id);
                    if (p && p.parent_family_id) {
                        centralPerson = id;
                        break;
                    }
                }
            }
            
            // LÉPÉS 2: Elrendezzük a személyeket a központi személy köré
            // 
            // SZABÁLY: A központi személy (gyökér) a bal oldalon
            // Az aktív partner mellette jobbra
            // Az aktív partner ex-partnerei még jobbra
            // A központ ex-partnerei a központtól balra
            //
            // Példa: Ha Lajos a gyökér, Ildikó az aktív partnere, András Ildikó exe:
            // Sorrend: [Lajos] - [Ildikó] - [András]
            //
            // A házassági vonalak a valódi párok között lesznek:
            // Lajos ❤️ Ildikó, Ildikó 💔 András
            // András és Lajos NINCSENEK összekötve!
            
            const centralPartners = (partnersOf.get(centralPerson) || [])
                .filter(p => generations.get(p.partnerId) === gen);
            
            const exPartnersOfCentral = [];
            const activePartnersOfCentral = [];
            
            centralPartners.forEach(p => {
                if (p.status === 'divorced' || p.status === 'ended' || p.status === 'separated') {
                    exPartnersOfCentral.push(p.partnerId);
                } else {
                    activePartnersOfCentral.push(p.partnerId);
                }
            });
            
            // SORREND FELÉPÍTÉSE:
            // [központ ex-ek] - [központ] - [aktív partnerek] - [aktív partnerek ex-ei]
            
            const leftSide = [];   // Központ ex-partnerei (balra a központtól)
            const rightSide = [];  // Aktív partnerek és azok ex-ei (jobbra)
            
            // Központ ex-partnerei balra
            exPartnersOfCentral.forEach(exId => {
                if (!processed.has(exId)) {
                    leftSide.push(exId);
                }
            });
            
            // Aktív partnerek jobbra, és utánuk az ő ex-partnereik
            activePartnersOfCentral.forEach(activeId => {
                if (!processed.has(activeId)) {
                    rightSide.push(activeId);
                    
                    // Az aktív partner ex-partnerei az aktív partner UTÁN (még jobbrább)
                    const activePersonPartners = partnersOf.get(activeId) || [];
                    activePersonPartners.forEach(p => {
                        if (p.partnerId !== centralPerson && 
                            generations.get(p.partnerId) === gen && 
                            !processed.has(p.partnerId) &&
                            !leftSide.includes(p.partnerId) &&
                            !rightSide.includes(p.partnerId)) {
                            // Ez az aktív partner ex-partnere - jobbra kerül (az aktív partner után)
                            rightSide.push(p.partnerId);
                        }
                    });
                }
            });
            
            // Végső sorrend: [bal oldal (központ ex-ei)] - [központ] - [jobb oldal (aktív + azok ex-ei)]
            const orderedMembers = [...leftSide, centralPerson, ...rightSide];
            
            // Jelöljük feldolgozottnak
            orderedMembers.forEach(id => processed.add(id));
            
            // Megkeressük a szülő családot a középpont számításához
            const centralPersonData = treeData.nodes.find(n => n.id === centralPerson);
            const parentFamilyId = centralPersonData?.parent_family_id;
            
            familyUnits.push({
                members: orderedMembers,
                parentFamilyId,
                mainPerson: centralPerson
            });
        });
        
        // Pozícionálás
        // Az első generációt (genIndex === 0) középre igazítjuk
        // A többi generációnál a szülők alá rendezés történik
        // FONTOS: A gyökér generációja NEM feltétlenül az első, de ha van szülője,
        // akkor a szülők alá kell kerüljön, nem középre!
        
        if (genIndex === 0) {
            // Első generáció (legfelső) - középre igazítás
            // A gyökér és partnerei az első unit
            // A testvérek (akiknek ugyanaz a parentFamilyId) mellettük
            
            // Először a gyökeret tartalmazó unitot keressük meg (ha ebben a generációban van)
            const rootUnitIndex = familyUnits.findIndex(u => 
                u.members.includes(rootPersonId) || u.mainPerson === rootPersonId);
            
            // Rendezzük át: gyökér unit középre, testvérek mellé
            let orderedUnits = [...familyUnits];
            if (rootUnitIndex > 0) {
                const rootUnit = orderedUnits.splice(rootUnitIndex, 1)[0];
                // Testvérek (ugyanaz a parentFamilyId mint a gyökér partnerének)
                // A gyökér partnere a "családba tartozó" tag
                const rootPartnerWithFamily = rootUnit.members.find(id => {
                    const p = treeData.nodes.find(n => n.id === id);
                    return p && p.parent_family_id && id !== rootPersonId;
                });
                
                if (rootPartnerWithFamily) {
                    const siblingParentFamily = treeData.nodes.find(n => n.id === rootPartnerWithFamily)?.parent_family_id;
                    // Testvérek elé beszúrjuk a gyökér unitot
                    const siblingIdx = orderedUnits.findIndex(u => u.parentFamilyId === siblingParentFamily);
                    if (siblingIdx >= 0) {
                        orderedUnits.splice(siblingIdx, 0, rootUnit);
                    } else {
                        orderedUnits.unshift(rootUnit);
                    }
                } else {
                    orderedUnits.unshift(rootUnit);
                }
            }
            
            const totalWidth = orderedUnits.reduce((sum, unit) => 
                sum + unit.members.length * horizontalSpacing, 0);
            let currentX = -totalWidth / 2 + horizontalSpacing / 2;
            
            orderedUnits.forEach(unit => {
                unit.members.forEach((id, idx) => {
                    positionPerson(id, currentX + idx * horizontalSpacing, gen);
                });
                currentX += unit.members.length * horizontalSpacing;
            });
        } else {
            // Következő generációk - a szülők alá igazítás
            // Csoportosítás szülő család szerint
            const byParentFamily = new Map();  // parentFamilyId -> units[]
            const orphans = [];
            
            familyUnits.forEach(unit => {
                if (unit.parentFamilyId && familyMap.has(unit.parentFamilyId)) {
                    if (!byParentFamily.has(unit.parentFamilyId)) {
                        byParentFamily.set(unit.parentFamilyId, []);
                    }
                    byParentFamily.get(unit.parentFamilyId).push(unit);
                } else {
                    orphans.push(unit);
                }
            });
            
            // Pozícionálás a szülők középpontja alá
            byParentFamily.forEach((units, parentFamilyId) => {
                const family = familyMap.get(parentFamilyId);
                if (!family) return;
                
                // Szülők pozíciói
                const p1Pos = nodePositions.get(family.person1_id);
                const p2Pos = nodePositions.get(family.person2_id);
                
                let centerX = 0;
                if (p1Pos && p2Pos) {
                    centerX = (p1Pos.x + p2Pos.x) / 2;
                } else if (p1Pos) {
                    centerX = p1Pos.x;
                } else if (p2Pos) {
                    centerX = p2Pos.x;
                }
                
                // Összes gyerek szélessége
                const totalWidth = units.reduce((sum, unit) => 
                    sum + unit.members.length * horizontalSpacing, 0);
                
                let currentX = centerX - totalWidth / 2 + horizontalSpacing / 2;
                
                units.forEach(unit => {
                    unit.members.forEach((id, idx) => {
                        positionPerson(id, currentX + idx * horizontalSpacing, gen);
                    });
                    currentX += unit.members.length * horizontalSpacing;
                });
            });
            
            // Árvák - a partnerük mellé
            orphans.forEach(unit => {
                unit.members.forEach(id => {
                    if (nodePositions.has(id)) return;
                    
                    // Keressük a már pozícionált partnert
                    const partners = partnersOf.get(id) || [];
                    let x = 0;
                    
                    for (const p of partners) {
                        const partnerPos = nodePositions.get(p.partnerId);
                        if (partnerPos) {
                            x = partnerPos.x + horizontalSpacing;
                            break;
                        }
                    }
                    
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
    familyMap.forEach((family, familyId) => {
        if (family.children.length === 0) return;
        
        const p1Pos = nodePositions.get(family.person1_id);
        const p2Pos = nodePositions.get(family.person2_id);
        
        if (!p1Pos && !p2Pos) return;
        
        const parentIds = [family.person1_id, family.person2_id]
            .filter(id => id && nodePositions.has(id));
        
        family.children.forEach(childId => {
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
function getLinkPath(d) {
    if (currentLayout === 'horizontal') {
        return `M${d.source.x},${d.source.y}
                C${(d.source.x + d.target.x) / 2},${d.source.y}
                 ${(d.source.x + d.target.x) / 2},${d.target.y}
                 ${d.target.x},${d.target.y}`;
    } else if (currentLayout === 'radial') {
        return d3.linkRadial()
            .angle(d => d.x)
            .radius(d => d.y)(d);
    } else {
        return `M${d.source.x},${d.source.y}
                C${d.source.x},${(d.source.y + d.target.y) / 2}
                 ${d.target.x},${(d.source.y + d.target.y) / 2}
                 ${d.target.x},${d.target.y}`;
    }
}

// ==================== CSOMÓPONT SZÍN ====================
function getNodeColor(data) {
    // Elhunyt személyek szürkébb színt kapnak
    if (!data.is_alive) {
        if (data.gender === 'male') {
            return '#6a8cad'; // Szürkés kék
        } else if (data.gender === 'female') {
            return '#a06a8c'; // Szürkés rózsaszín
        }
        return '#707070'; // Szürke
    }
    
    // Élő személyek eredeti színei
    if (data.gender === 'male') {
        return settings.male_color || '#4A90D9';
    } else if (data.gender === 'female') {
        return settings.female_color || '#D94A8C';
    }
    return settings.unknown_color || '#808080';
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

// ==================== FA KÖZÉPRE IGAZÍTÁS ====================
function centerTree() {
    const container = document.getElementById('tree-container');
    const bounds = g.node().getBBox();
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const scale = Math.min(
        width / (bounds.width + 100),
        height / (bounds.height + 100),
        1
    );
    
    const translateX = (width - bounds.width * scale) / 2 - bounds.x * scale;
    const translateY = (height - bounds.height * scale) / 2 - bounds.y * scale;
    
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
    const width = container.clientWidth;
    const height = container.clientHeight;
    
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
    const svgElement = document.getElementById('family-tree');
    const mainGroup = svgElement.querySelector('g');
    if (!mainGroup) return;

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
        ctx.fillStyle = settings.background_color || '#F5F5F5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((pngBlob) => {
            const pngUrl = URL.createObjectURL(pngBlob);
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = 'family_tree.png';
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
