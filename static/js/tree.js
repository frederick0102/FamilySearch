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
    const horizontalSpacing = cardWidth + 50;
    const verticalSpacing = cardHeight + 80;
    
    // Hierarchia építése
    const hierarchy = buildHierarchy();
    
    if (!hierarchy) {
        renderEmptyState();
        return;
    }
    
    let root;
    let treeLayout;
    
    switch (currentLayout) {
        case 'horizontal':
            treeLayout = d3.tree()
                .nodeSize([verticalSpacing, horizontalSpacing]);
            root = treeLayout(hierarchy);
            
            // Koordináták cseréje vízszintes elrendezéshez
            root.each(d => {
                const temp = d.x;
                d.x = d.y;
                d.y = temp;
            });
            break;
            
        case 'radial':
            const radius = Math.min(width, height) / 2 - 100;
            treeLayout = d3.tree()
                .size([2 * Math.PI, radius])
                .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth);
            root = treeLayout(hierarchy);
            
            // Polár koordináták konvertálása
            root.each(d => {
                const angle = d.x;
                const r = d.y;
                d.x = r * Math.cos(angle - Math.PI / 2);
                d.y = r * Math.sin(angle - Math.PI / 2);
            });
            break;
            
        default: // vertical
            treeLayout = d3.tree()
                .nodeSize([horizontalSpacing, verticalSpacing]);
            root = treeLayout(hierarchy);
    }

    // Partner-only csomópontok pozicionálása, hogy a házastársak egy szinten maradjanak
    positionPartners(root, {
        horizontalSpacing,
        verticalSpacing,
        cardWidth,
        cardHeight
    });

    // Közös gyerekek pozicionálása a házassági pont alá/közé
    alignMarriageChildren(root, {
        horizontalSpacing,
        verticalSpacing
    });
    
    // Szülő-gyermek vonalak rajzolása (kihagyjuk, ha a gyereknek mindkét szülője jelen van és T elágazást rajzolunk)
    const bothParents = new Set(
        treeData.nodes
            .filter(n => n.father_id && n.mother_id)
            .map(n => n.id)
    );

    const links = g.append('g')
        .attr('class', 'links')
        .selectAll('path')
        .data(root.links().filter(l => !bothParents.has(l.target.data.id)))
        .enter()
        .append('path')
        .attr('class', 'tree-link')
        .attr('d', getLinkPath)
        .style('stroke', settings.line_color || '#666')
        .style('stroke-width', settings.line_width || 2);
    
    // Házassági kapcsolatok rajzolása + gyerekek összekötése
    const marriageRender = renderMarriageLinks(root);
    renderMarriageChildren(root, marriageRender);
    
    // Csomópontok (személyek) rajzolása
    const nodes = g.append('g')
        .attr('class', 'nodes')
        .selectAll('g')
        .data(root.descendants())
        .enter()
        .append('g')
        .attr('class', 'tree-node')
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .on('click', (event, d) => {
            event.stopPropagation();
            openPersonModal(d.data.id);
        })
        .on('mouseenter', showTooltip)
        .on('mouseleave', hideTooltip);
    
    // Kártya háttér
    nodes.append('rect')
        .attr('x', -cardWidth / 2)
        .attr('y', -cardHeight / 2)
        .attr('width', cardWidth)
        .attr('height', cardHeight)
        .attr('rx', settings.card_border_radius || 8)
        .attr('ry', settings.card_border_radius || 8)
        .style('fill', d => getNodeColor(d.data))
        .style('stroke', d => d3.color(getNodeColor(d.data)).darker(0.3))
        .style('stroke-width', 2)
        .style('opacity', d => d.data.is_alive ? 1 : (settings.deceased_opacity || 0.7));
    
    // Profilkép (opcionális)
    if (settings.show_photos !== false) {
        nodes.append('clipPath')
            .attr('id', d => `clip-${d.data.id}`)
            .append('circle')
            .attr('cx', -cardWidth / 2 + 30)
            .attr('cy', 0)
            .attr('r', 25);
        
        nodes.append('image')
            .attr('xlink:href', d => d.data.photo || '/static/img/placeholder-avatar.svg')
            .attr('x', -cardWidth / 2 + 5)
            .attr('y', -25)
            .attr('width', 50)
            .attr('height', 50)
            .attr('clip-path', d => `url(#clip-${d.data.id})`)
            .style('opacity', d => d.data.is_alive ? 1 : (settings.deceased_opacity || 0.7));
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
        .text(d => truncateText(d.data.name, cardWidth - (settings.show_photos !== false ? 80 : 20)));
    
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
                if (d.data.birth_date) {
                    dates = formatShortDate(d.data.birth_date);
                }
                if (d.data.death_date) {
                    dates += ` - ${formatShortDate(d.data.death_date)}`;
                } else if (d.data.birth_date && !d.data.is_alive === false) {
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
            .text(d => truncateText(d.data.occupation || '', cardWidth - 80));
    }
    
    // Elhunyt jelző
    nodes.filter(d => !d.data.is_alive)
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

// Partner-only csomópontok igazítása elrendezés szerint
// Többszörös partnerek kezelése (pl. válás után új házasság)
function positionPartners(root, sizes) {
    const offsetX = (sizes.cardWidth || 200) + 80;
    const offsetY = (sizes.cardHeight || 100) + 80;
    
    // Szülőpárok - akiknek VAN közös gyerekük
    const parentPairSet = new Set();
    treeData.nodes.forEach(node => {
        if (node.father_id && node.mother_id) {
            const key = node.father_id < node.mother_id 
                ? `${node.father_id}-${node.mother_id}` 
                : `${node.mother_id}-${node.father_id}`;
            parentPairSet.add(key);
        }
    });
    
    // Összegyűjtjük, hogy melyik személynek hány partnere van
    // És megkülönböztetjük a "szülőpárokat" (közös gyerek) a "csak házastársaktól"
    const partnerInfo = new Map(); // parentId -> { realPartners: [], otherPartners: [] }
    
    root.each(d => {
        if (!d.data.partnerOnly || !d.parent) return;
        
        const parentId = d.parent.data.id;
        const partnerId = d.data.id;
        
        if (!partnerInfo.has(parentId)) {
            partnerInfo.set(parentId, { realPartners: [], otherPartners: [] });
        }
        
        // Ellenőrizzük, hogy van-e közös gyerekük
        const pairKey = parentId < partnerId 
            ? `${parentId}-${partnerId}` 
            : `${partnerId}-${parentId}`;
        
        if (parentPairSet.has(pairKey)) {
            partnerInfo.get(parentId).realPartners.push(d);
        } else {
            partnerInfo.get(parentId).otherPartners.push(d);
        }
    });
    
    // Pozícionálás: szülőpárok közel (jobbra), "csak házastársak" távolabb (balra vagy még jobbra)
    partnerInfo.forEach((info, parentId) => {
        const parentNode = root.descendants().find(n => n.data.id === parentId);
        if (!parentNode) return;
        
        // Szülőpárok (közös gyerekkel) - közvetlenül jobbra
        info.realPartners.forEach((d, idx) => {
            if (currentLayout === 'vertical') {
                d.y = parentNode.y;
                d.x = parentNode.x + offsetX * (idx + 1);
            } else if (currentLayout === 'horizontal') {
                d.x = parentNode.x;
                d.y = parentNode.y + offsetY * (idx + 1);
            }
        });
        
        // "Csak házastársak" (nincs közös gyerek) - balra, elkülönítve
        const realCount = info.realPartners.length;
        info.otherPartners.forEach((d, idx) => {
            if (currentLayout === 'vertical') {
                d.y = parentNode.y;
                // Balra kerülnek, hogy elkülönüljenek
                d.x = parentNode.x - offsetX * (idx + 1);
            } else if (currentLayout === 'horizontal') {
                d.x = parentNode.x;
                d.y = parentNode.y - offsetY * (idx + 1);
            }
        });
    });
}
// Közös gyerekek pozicionálása a szülőpár körül (házasságtól függetlenül)
function alignMarriageChildren(root, sizes) {
    const idToNode = new Map();
    root.descendants().forEach(n => idToNode.set(n.data.id, n));

    // Szülőpárok összegyűjtése a gyerekek alapján
    const parentPairsMap = new Map(); // "id1-id2" -> [gyerek node-ok]
    
    treeData.nodes.forEach(node => {
        if (!node.father_id || !node.mother_id) return;
        
        const key = node.father_id < node.mother_id 
            ? `${node.father_id}-${node.mother_id}` 
            : `${node.mother_id}-${node.father_id}`;
        
        if (!parentPairsMap.has(key)) {
            parentPairsMap.set(key, { 
                parent1Id: node.father_id, 
                parent2Id: node.mother_id, 
                children: [] 
            });
        }
        parentPairsMap.get(key).children.push(node);
    });
    
    // Minden szülőpárhoz pozícionáljuk a gyerekeket
    parentPairsMap.forEach(({ parent1Id, parent2Id, children }) => {
        const p1 = idToNode.get(parent1Id);
        const p2 = idToNode.get(parent2Id);
        if (!p1 || !p2) return;

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        if (!children.length) return;

        const childNodes = children
            .map(c => idToNode.get(c.id))
            .filter(Boolean)
            .sort((a, b) => {
                // Születési dátum szerinti sorrend, ha van
                const dateA = a.data.birth_date || '';
                const dateB = b.data.birth_date || '';
                return dateA.localeCompare(dateB) || a.data.id - b.data.id;
            });

        const count = childNodes.length;
        const hGap = sizes.horizontalSpacing || 250;
        const vGap = sizes.verticalSpacing || 180;

        if (currentLayout === 'vertical') {
            // Egy szintre tesszük őket, a midX körül egyenletesen elosztva
            const baseY = Math.max(...childNodes.map(n => n.y), midY + vGap / 2);
            childNodes.forEach((n, idx) => {
                const offset = (idx - (count - 1) / 2) * hGap;
                n.x = midX + offset;
                n.y = baseY;
            });
        } else if (currentLayout === 'horizontal') {
            // Egy szintre tesszük őket, a midY körül elosztva
            const baseX = Math.max(...childNodes.map(n => n.x), midX + hGap / 2);
            childNodes.forEach((n, idx) => {
                const offset = (idx - (count - 1) / 2) * vGap;
                n.y = midY + offset;
                n.x = baseX;
            });
        }
    });
}

// ==================== HIERARCHIA ÉPÍTÉS ====================
function buildHierarchy() {
    if (treeData.nodes.length === 0) return null;
    
    // Gyökér kiválasztása
    let rootId = rootPersonId;
    
    if (!rootId) {
        // Automatikus gyökér keresés - legidősebb személy akinek van gyermeke
        const nodesWithChildren = new Set();
        treeData.links.filter(l => l.type === 'parent-child').forEach(l => {
            nodesWithChildren.add(l.source);
        });
        
        const candidates = treeData.nodes
            .filter(n => nodesWithChildren.has(n.id))
            .filter(n => !n.father_id && !n.mother_id);
        
        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                if (!a.birth_date) return 1;
                if (!b.birth_date) return -1;
                return a.birth_date.localeCompare(b.birth_date);
            });
            rootId = candidates[0].id;
        } else if (treeData.nodes.length > 0) {
            rootId = treeData.nodes[0].id;
        }
    }
    
    if (!rootId) return null;
    
    // Node map létrehozása - FONTOS: minden node csak EGYSZER szerepel
    const nodeMap = new Map(treeData.nodes.map(n => [n.id, { ...n, children: [], partnerOnly: false }]));
    
    // Már hozzáadott partnerek nyilvántartása (duplikáció elkerülése)
    const addedAsPartner = new Set(); // "parentId-partnerId" formátumban
    
    // Partner kapcsolatok: ki kinek a partnere (a pozícionáláshoz)
    const partnerOf = new Map(); // partnerId -> parentId (akihez hozzá van adva)

    // Segédfüggvény: gyermek hozzáadása duplikáció nélkül
    const addChild = (parentId, childId, options = {}) => {
        if (!nodeMap.has(parentId) || !nodeMap.has(childId)) return false;
        if (parentId === childId) return false; // önmagát ne adja hozzá
        
        const parent = nodeMap.get(parentId);
        const child = nodeMap.get(childId);
        
        // Már hozzá van adva ehhez a szülőhöz?
        if (parent.children.some(c => c.id === child.id)) return false;
        
        // Partnerként duplikáció ellenőrzés
        if (options.partnerOnly) {
            const key = `${parentId}-${childId}`;
            if (addedAsPartner.has(key)) return false;
            addedAsPartner.add(key);
            // Az EREDETI node-ot adjuk hozzá, csak megjelöljük partnerként
            child.partnerOnly = true;
            partnerOf.set(childId, parentId);
        }
        
        parent.children.push(child);
        return true;
    };

    // 1. LÉPÉS: Szülő-gyermek kapcsolatok (egy szülő mentén)
    // Ha van apa, a gyerek az apához tartozik; különben az anyához
    treeData.nodes.forEach(node => {
        if (node.father_id) {
            addChild(node.father_id, node.id);
        } else if (node.mother_id) {
            addChild(node.mother_id, node.id);
        }
    });

    // 2. LÉPÉS: Szülőpárok összegyűjtése (apa + anya akiknek közös gyerekük van)
    const parentPairs = new Map(); // "id1-id2" -> { fatherId, motherId }
    treeData.nodes.forEach(node => {
        if (node.father_id && node.mother_id) {
            const key = node.father_id < node.mother_id 
                ? `${node.father_id}-${node.mother_id}` 
                : `${node.mother_id}-${node.father_id}`;
            if (!parentPairs.has(key)) {
                parentPairs.set(key, { fatherId: node.father_id, motherId: node.mother_id });
            }
        }
    });

    // 3. LÉPÉS: Az anyát partnerként hozzáadjuk az apához (ha van közös gyerekük)
    parentPairs.forEach(({ fatherId, motherId }) => {
        addChild(fatherId, motherId, { partnerOnly: true });
    });

    // Gyökér node
    const rootNode = nodeMap.get(rootId);
    if (!rootNode) return null;

    // Visited set a bejárt csomópontokhoz
    const visited = new Set();
    const dfs = (node) => {
        if (!node || visited.has(node.id)) return;
        visited.add(node.id);
        // Partnerek gyerekeit NE járjuk be (ők egy másik ágon vannak)
        node.children.forEach(child => {
            if (!child.partnerOnly) {
                dfs(child);
            } else {
                visited.add(child.id); // De a partnert magát jelöljük meglátogatottnak
            }
        });
    };
    dfs(rootNode);

    // 4. LÉPÉS: Házasságok hozzáadása (ahol NINCS közös gyerek)
    // Ezek a "csak házastársak" - pl. új férj
    // Az új partner ahhoz a személyhez kerül, aki már a fában van
    treeData.links
        .filter(l => l.type === 'marriage')
        .forEach(link => {
            const key = link.source < link.target 
                ? `${link.source}-${link.target}` 
                : `${link.target}-${link.source}`;
            
            // Ha már szülőpárként hozzáadtuk, kihagyjuk
            if (parentPairs.has(key)) return;
            
            const sourceId = link.source;
            const targetId = link.target;
            
            // Ha az egyik már a fában van, a másikat partnerként hozzáadjuk HOZZÁ
            // Fontos: ahhoz adjuk hozzá, aki MÁR a fában van
            if (visited.has(sourceId) && !visited.has(targetId)) {
                // source a fában van, target-et hozzáadjuk source-hoz
                // DE! A source lehet, hogy partnerként van a fában, nem közvetlenül
                // Meg kell keresni, hol van a source, és oda adjuk hozzá a target-et
                
                // Keressük meg a source-ot a fában és adjuk hozzá neki a target-et
                const sourceNode = nodeMap.get(sourceId);
                if (sourceNode && addChild(sourceId, targetId, { partnerOnly: true })) {
                    visited.add(targetId);
                }
            } else if (visited.has(targetId) && !visited.has(sourceId)) {
                const targetNode = nodeMap.get(targetId);
                if (targetNode && addChild(targetId, sourceId, { partnerOnly: true })) {
                    visited.add(sourceId);
                }
            }
        });

    return d3.hierarchy(rootNode);
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

// ==================== HÁZASSÁGI ÉS SZÜLŐPÁR KAPCSOLATOK ====================
function renderMarriageLinks(root) {
    const marriageLinks = treeData.links.filter(l => l.type === 'marriage');
    const nodePositions = new Map();
    
    root.descendants().forEach(d => {
        nodePositions.set(d.data.id, { x: d.x, y: d.y });
    });
    
    // Szülőpárok összegyűjtése a gyerekek alapján (házasságtól függetlenül)
    // CSAK ezekből a párokból indulnak gyerek-vonalak!
    const parentPairs = new Map(); // "id1-id2" -> { source, target, hasChildren: true }
    treeData.nodes.forEach(node => {
        if (node.father_id && node.mother_id) {
            const key = node.father_id < node.mother_id 
                ? `${node.father_id}-${node.mother_id}` 
                : `${node.mother_id}-${node.father_id}`;
            if (!parentPairs.has(key)) {
                parentPairs.set(key, { 
                    source: node.father_id, 
                    target: node.mother_id,
                    hasChildren: true
                });
            }
        }
    });
    
    // Házasságok halmazának létrehozása
    const marriageSet = new Set();
    marriageLinks.forEach(link => {
        const key = link.source < link.target 
            ? `${link.source}-${link.target}` 
            : `${link.target}-${link.source}`;
        marriageSet.add(key);
    });
    
    // Midpointok CSAK a szülőpárokhoz (közös gyerekek miatt)
    const midpoints = [];
    
    // Házasságok rajzolása (MINDEN házasság, de midpoint csak ha van közös gyerek)
    marriageLinks.forEach(link => {
        const source = nodePositions.get(link.source);
        const target = nodePositions.get(link.target);
        
        if (source && target) {
            // Házassági vonal
            g.append('line')
                .attr('class', 'tree-link marriage')
                .attr('x1', source.x)
                .attr('y1', source.y)
                .attr('x2', target.x)
                .attr('y2', target.y)
                .style('stroke', settings.line_color || '#666')
                .style('stroke-width', settings.line_width || 2)
                .style('stroke-dasharray', settings.marriage_line_style === 'dashed' ? '5,5' : 'none');
            
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            
            // Szív ikon a házasság közepén
            g.append('text')
                .attr('x', midX)
                .attr('y', midY)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .style('font-family', 'Font Awesome 6 Free')
                .style('font-weight', '900')
                .style('font-size', '16px')
                .style('fill', '#e74c3c')
                .text('\uf004'); // heart icon
            
            // Midpoint CSAK ha közös gyerekük van (szülőpár)
            const pairKey = link.source < link.target 
                ? `${link.source}-${link.target}` 
                : `${link.target}-${link.source}`;
            if (parentPairs.has(pairKey)) {
                midpoints.push({ marriageId: link.marriage_id, x: midX, y: midY, source: link.source, target: link.target });
                parentPairs.delete(pairKey); // Ne rajzoljuk duplán
            }
        }
    });
    
    // Szülőpárok rajzolása (ha NINCS házasság köztük, de VAN közös gyerekük)
    parentPairs.forEach((pair, key) => {
        const source = nodePositions.get(pair.source);
        const target = nodePositions.get(pair.target);
        
        if (source && target) {
            // Szaggatott vonal házasság nélküli szülőpároknak
            g.append('line')
                .attr('class', 'tree-link parent-pair')
                .attr('x1', source.x)
                .attr('y1', source.y)
                .attr('x2', target.x)
                .attr('y2', target.y)
                .style('stroke', settings.line_color || '#666')
                .style('stroke-width', settings.line_width || 2)
                .style('stroke-dasharray', '5,5');
            
            // Midpoint a gyerekek összekötéséhez
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            midpoints.push({ marriageId: null, x: midX, y: midY, source: pair.source, target: pair.target });
        }
    });

    return { midpoints, nodePositions };
}

// Közös gyerekek vizuális összekötése a házassági vonalról leágazóan
function renderMarriageChildren(root, marriageRender) {
    if (!marriageRender || !marriageRender.midpoints) return;
    if (currentLayout === 'radial') return; // radiálisnál nem rajzoljuk

    const { midpoints, nodePositions } = marriageRender;
    const cardW = settings.card_width || 200;
    const cardH = settings.card_height || 100;

    midpoints.forEach(mp => {
        const children = treeData.nodes.filter(n => {
            if (!n.father_id || !n.mother_id) return false;
            const parents = [n.father_id, n.mother_id];
            return parents.includes(mp.source) && parents.includes(mp.target);
        });

        if (children.length === 0) return;

        const childPositions = children
            .map(c => ({
                node: c,
                pos: nodePositions.get(c.id),
                topY: nodePositions.get(c.id) ? nodePositions.get(c.id).y - cardH / 2 : null,
                leftX: nodePositions.get(c.id) ? nodePositions.get(c.id).x - cardW / 2 : null
            }))
            .filter(cp => cp.pos);
        if (childPositions.length === 0) return;

        const color = settings.line_color || '#666';
        const width = settings.line_width || 2;

        if (currentLayout === 'vertical') {
            if (childPositions.length === 1) {
                const cp = childPositions[0];
                // függőleges leágazás a gyermek kártya tetejéig, majd rövid vízszintes a közepéig
                g.append('line')
                    .attr('class', 'tree-link marriage-child')
                    .attr('x1', mp.x)
                    .attr('y1', mp.y)
                    .attr('x2', mp.x)
                    .attr('y2', cp.topY)
                    .style('stroke', color)
                    .style('stroke-width', width);
                g.append('line')
                    .attr('class', 'tree-link marriage-child')
                    .attr('x1', mp.x)
                    .attr('y1', cp.topY)
                    .attr('x2', cp.pos.x)
                    .attr('y2', cp.topY)
                    .style('stroke', color)
                    .style('stroke-width', width);
            } else {
                const targetY = Math.min(...childPositions.map(cp => cp.topY));
                const junctionY = (mp.y + targetY) / 2;

                g.append('line')
                    .attr('class', 'tree-link marriage-child')
                    .attr('x1', mp.x)
                    .attr('y1', mp.y)
                    .attr('x2', mp.x)
                    .attr('y2', junctionY)
                    .style('stroke', color)
                    .style('stroke-width', width);

                childPositions.forEach(cp => {
                    // leágazás a gyermek tetejéig, majd rövid vízszintes a kártya közepéig
                    g.append('line')
                        .attr('class', 'tree-link marriage-child')
                        .attr('x1', mp.x)
                        .attr('y1', junctionY)
                        .attr('x2', mp.x)
                        .attr('y2', cp.topY)
                        .style('stroke', color)
                        .style('stroke-width', width);
                    g.append('line')
                        .attr('class', 'tree-link marriage-child')
                        .attr('x1', mp.x)
                        .attr('y1', cp.topY)
                        .attr('x2', cp.pos.x)
                        .attr('y2', cp.topY)
                        .style('stroke', color)
                        .style('stroke-width', width);
                });
            }
        } else if (currentLayout === 'horizontal') {
            if (childPositions.length === 1) {
                const cp = childPositions[0];
                // vízszintes leágazás a gyermek kártya bal széléig, majd rövid függőleges a közepéig
                g.append('line')
                    .attr('class', 'tree-link marriage-child')
                    .attr('x1', mp.x)
                    .attr('y1', mp.y)
                    .attr('x2', cp.leftX)
                    .attr('y2', mp.y)
                    .style('stroke', color)
                    .style('stroke-width', width);
                g.append('line')
                    .attr('class', 'tree-link marriage-child')
                    .attr('x1', cp.leftX)
                    .attr('y1', mp.y)
                    .attr('x2', cp.leftX)
                    .attr('y2', cp.pos.y)
                    .style('stroke', color)
                    .style('stroke-width', width);
            } else {
                const targetX = Math.min(...childPositions.map(cp => cp.leftX));
                const junctionX = (mp.x + targetX) / 2;

                g.append('line')
                    .attr('class', 'tree-link marriage-child')
                    .attr('x1', mp.x)
                    .attr('y1', mp.y)
                    .attr('x2', junctionX)
                    .attr('y2', mp.y)
                    .style('stroke', color)
                    .style('stroke-width', width);

                childPositions.forEach(cp => {
                    g.append('line')
                        .attr('class', 'tree-link marriage-child')
                        .attr('x1', junctionX)
                        .attr('y1', mp.y)
                        .attr('x2', cp.leftX)
                        .attr('y2', mp.y)
                        .style('stroke', color)
                        .style('stroke-width', width);
                    g.append('line')
                        .attr('class', 'tree-link marriage-child')
                        .attr('x1', cp.leftX)
                        .attr('y1', mp.y)
                        .attr('x2', cp.leftX)
                        .attr('y2', cp.pos.y)
                        .style('stroke', color)
                        .style('stroke-width', width);
                });
            }
        }
    });
}

// ==================== CSOMÓPONT SZÍN ====================
function getNodeColor(data) {
    if (data.gender === 'male') {
        return settings.male_color || '#4A90D9';
    } else if (data.gender === 'female') {
        return settings.female_color || '#D94A8C';
    }
    return settings.unknown_color || '#808080';
}

// ==================== TOOLTIP ====================
function showTooltip(event, d) {
    const tooltip = d3.select('body').append('div')
        .attr('class', 'node-tooltip')
        .style('left', (event.pageX + 15) + 'px')
        .style('top', (event.pageY - 10) + 'px');
    
    let content = `<h4>${d.data.display_name || d.data.name}</h4>`;
    
    if (d.data.birth_date) {
        content += `<p><strong>Született:</strong> ${formatDate(d.data.birth_date)}`;
        if (d.data.birth_place) content += ` - ${d.data.birth_place}`;
        content += '</p>';
    }
    
    if (d.data.death_date) {
        content += `<p><strong>Elhunyt:</strong> ${formatDate(d.data.death_date)}`;
        if (d.data.death_place) content += ` - ${d.data.death_place}`;
        content += '</p>';
    }
    
    if (d.data.age) {
        content += `<p><strong>Kor:</strong> ${d.data.age} év</p>`;
    }
    
    if (d.data.occupation) {
        content += `<p><strong>Foglalkozás:</strong> ${d.data.occupation}</p>`;
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
