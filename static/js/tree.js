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
    // parent_family_id alapján: ha van family_id és abban két szülő van
    const bothParentsSet = new Set();
    
    if (treeData.marriages) {
        treeData.nodes.forEach(n => {
            if (n.parent_family_id) {
                const family = treeData.marriages.find(m => m.id === n.parent_family_id);
                if (family && family.person1_id && family.person2_id) {
                    bothParentsSet.add(n.id);
                }
            }
        });
    }

    const links = g.append('g')
        .attr('class', 'links')
        .selectAll('path')
        .data(root.links().filter(l => !bothParentsSet.has(l.target.data.id)))
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
    
    // Szülőpárok - akiknek VAN közös gyerekük (parent_family_id alapján)
    const parentPairSet = new Set();
    
    if (treeData.marriages) {
        treeData.marriages.forEach(m => {
            // Van-e gyerekük ezzel a family_id-val?
            const hasChildren = treeData.nodes.some(n => n.parent_family_id === m.id);
            if (hasChildren && m.person1_id && m.person2_id) {
                const key = m.person1_id < m.person2_id 
                    ? `${m.person1_id}-${m.person2_id}` 
                    : `${m.person2_id}-${m.person1_id}`;
                parentPairSet.add(key);
            }
        });
    }
    
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
        
        // Ellenőrizzük, hogy van-e közös gyerekük (family-n keresztül)
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
// Közös gyerekek pozicionálása a szülőpár közepén (parent_family_id alapján)
// Dinamikus elhelyezés: 1 gyerek = középen, több gyerek = egyenletesen elosztva
function alignMarriageChildren(root, sizes) {
    const idToNode = new Map();
    root.descendants().forEach(n => idToNode.set(n.data.id, n));

    // Szülőpárok összegyűjtése parent_family_id alapján (marriages/families)
    const parentPairsMap = new Map(); // "family_id" -> { parent1Id, parent2Id, children: [] }
    
    // Családok (marriage) feldolgozása
    if (treeData.marriages) {
        treeData.marriages.forEach(m => {
            if (!m.person1_id || !m.person2_id) return;
            parentPairsMap.set(m.id, {
                parent1Id: m.person1_id,
                parent2Id: m.person2_id,
                children: []
            });
        });
    }
    
    // Gyerekek hozzárendelése családokhoz parent_family_id alapján
    treeData.nodes.forEach(node => {
        if (node.parent_family_id && parentPairsMap.has(node.parent_family_id)) {
            parentPairsMap.get(node.parent_family_id).children.push(node);
        }
    });
    
    // Minden szülőpárhoz pozícionáljuk a gyerekeket
    parentPairsMap.forEach(({ parent1Id, parent2Id, children }) => {
        const p1 = idToNode.get(parent1Id);
        const p2 = idToNode.get(parent2Id);
        
        // Ha csak az egyik szülő van a fában, használjuk azt
        const parentNode = p1 || p2;
        if (!parentNode) return;
        if (!children.length) return;

        // Középpont meghatározása
        let midX, midY;
        if (p1 && p2) {
            midX = (p1.x + p2.x) / 2;
            midY = (p1.y + p2.y) / 2;
        } else {
            midX = parentNode.x;
            midY = parentNode.y;
        }

        const childNodes = children
            .map(c => idToNode.get(c.id))
            .filter(Boolean)
            .sort((a, b) => {
                // Születési dátum szerinti sorrend, ha van (vagy birth_order)
                const orderA = a.data.birth_order || 999;
                const orderB = b.data.birth_order || 999;
                if (orderA !== orderB) return orderA - orderB;
                
                const dateA = a.data.birth_date || '';
                const dateB = b.data.birth_date || '';
                return dateA.localeCompare(dateB) || a.data.id - b.data.id;
            });

        const count = childNodes.length;
        
        // Dinamikus térköz: több gyereknél kisebb, de minimum 150px
        const baseGap = sizes.horizontalSpacing || 250;
        const hGap = count <= 2 ? baseGap : Math.max(150, baseGap * 0.7);
        const vGap = sizes.verticalSpacing || 180;

        if (currentLayout === 'vertical') {
            // Gyerekek egy szinten, a szülők alatt
            const baseY = (p1 && p2 ? Math.max(p1.y, p2.y) : parentNode.y) + vGap;
            
            if (count === 1) {
                // Egy gyerek: pontosan középen
                childNodes[0].x = midX;
                childNodes[0].y = baseY;
            } else {
                // Több gyerek: egyenletesen elosztva a középpont körül
                const totalWidth = (count - 1) * hGap;
                const startX = midX - totalWidth / 2;
                
                childNodes.forEach((n, idx) => {
                    n.x = startX + idx * hGap;
                    n.y = baseY;
                });
            }
        } else if (currentLayout === 'horizontal') {
            // Vízszintes elrendezés: gyerekek jobbra a szülőktől
            const baseX = (p1 && p2 ? Math.max(p1.x, p2.x) : parentNode.x) + hGap;
            
            if (count === 1) {
                // Egy gyerek: pontosan középen (Y tengelyen)
                childNodes[0].y = midY;
                childNodes[0].x = baseX;
            } else {
                // Több gyerek: egyenletesen elosztva
                const totalHeight = (count - 1) * vGap * 0.7;
                const startY = midY - totalHeight / 2;
                
                childNodes.forEach((n, idx) => {
                    n.y = startY + idx * vGap * 0.7;
                    n.x = baseX;
                });
            }
        }
    });
}

// ==================== HIERARCHIA ÉPÍTÉS ====================
// KÉTIRÁNYÚ GRÁF BEJÁRÁS: A kiválasztott személytől felfelé (szülők) és lefelé (gyerekek) is épít
// GEDCOM-stílusú gráf-alapú modell: Family központú megközelítés
function buildHierarchy() {
    if (treeData.nodes.length === 0) return null;
    
    // Gyökér kiválasztása (ez lesz a vizualizáció középpontja)
    let focusPersonId = rootPersonId;
    
    if (!focusPersonId) {
        // Automatikus: első személy ha nincs kiválasztva
        focusPersonId = treeData.nodes[0]?.id;
    }
    
    if (!focusPersonId) return null;
    
    // === CSALÁDOK (Family) FELDOLGOZÁSA ===
    const familyMap = new Map(); // family_id -> { person1_id, person2_id, children: [] }
    
    if (treeData.marriages) {
        treeData.marriages.forEach(m => {
            familyMap.set(m.id, {
                person1_id: m.person1_id,
                person2_id: m.person2_id,
                children: [],
                status: m.status,
                relationship_type: m.relationship_type
            });
        });
    }
    
    // Gyerekek hozzárendelése családokhoz (parent_family_id alapján)
    treeData.nodes.forEach(node => {
        if (node.parent_family_id && familyMap.has(node.parent_family_id)) {
            familyMap.get(node.parent_family_id).children.push(node.id);
        }
    });
    
    // === GRÁF KAPCSOLATOK ELŐKÉSZÍTÉSE ===
    // Szülők: person -> [szülő id-k]
    const parentsOf = new Map();
    // Gyerekek: person -> [gyerek id-k]
    const childrenOf = new Map();
    // Házastársak: person -> [házastárs id-k]
    const partnersOf = new Map();
    
    // Inicializálás
    treeData.nodes.forEach(n => {
        parentsOf.set(n.id, []);
        childrenOf.set(n.id, []);
        partnersOf.set(n.id, []);
    });
    
    // parent_family_id alapján szülő-gyerek kapcsolatok
    treeData.nodes.forEach(node => {
        if (node.parent_family_id && familyMap.has(node.parent_family_id)) {
            const family = familyMap.get(node.parent_family_id);
            const parents = [family.person1_id, family.person2_id].filter(Boolean);
            
            parents.forEach(parentId => {
                if (parentsOf.has(node.id)) {
                    parentsOf.get(node.id).push(parentId);
                }
                if (childrenOf.has(parentId)) {
                    childrenOf.get(parentId).push(node.id);
                }
            });
        }
    });
    
    // Házassági kapcsolatok (links-ből)
    treeData.links.filter(l => l.type === 'marriage').forEach(link => {
        if (partnersOf.has(link.source) && !partnersOf.get(link.source).includes(link.target)) {
            partnersOf.get(link.source).push(link.target);
        }
        if (partnersOf.has(link.target) && !partnersOf.get(link.target).includes(link.source)) {
            partnersOf.get(link.target).push(link.source);
        }
    });
    
    // === MEGKERESSÜK A LEGFELSŐ ŐST ===
    // A focus személytől felfelé megyünk amíg van szülő
    const findRootAncestor = (personId, visited = new Set()) => {
        if (visited.has(personId)) return personId;
        visited.add(personId);
        
        const parents = parentsOf.get(personId) || [];
        if (parents.length === 0) {
            return personId; // Nincs szülője, ő a gyökér
        }
        
        // Első szülőn keresztül megyünk felfelé
        return findRootAncestor(parents[0], visited);
    };
    
    const rootId = findRootAncestor(focusPersonId);
    
    // === FA ÉPÍTÉS ===
    // Minden node-ról másolatot készítünk a fa struktúrához
    const createTreeNode = (id) => {
        const original = treeData.nodes.find(n => n.id === id);
        if (!original) return null;
        return { ...original, children: [], partnerOnly: false };
    };
    
    const visited = new Set();
    const treeNodeMap = new Map(); // id -> fa node
    
    // Rekurzív fa építés lefelé
    const buildTreeDown = (personId) => {
        if (visited.has(personId)) {
            return treeNodeMap.get(personId);
        }
        visited.add(personId);
        
        const treeNode = createTreeNode(personId);
        if (!treeNode) return null;
        
        treeNodeMap.set(personId, treeNode);
        
        // Házastársak hozzáadása (partnerként)
        const partners = partnersOf.get(personId) || [];
        partners.forEach(partnerId => {
            if (!visited.has(partnerId)) {
                visited.add(partnerId);
                const partnerNode = createTreeNode(partnerId);
                if (partnerNode) {
                    partnerNode.partnerOnly = true;
                    treeNode.children.push(partnerNode);
                    treeNodeMap.set(partnerId, partnerNode);
                }
            }
        });
        
        // Gyerekek hozzáadása
        const children = childrenOf.get(personId) || [];
        children.forEach(childId => {
            if (!visited.has(childId)) {
                const childNode = buildTreeDown(childId);
                if (childNode) {
                    treeNode.children.push(childNode);
                }
            }
        });
        
        return treeNode;
    };
    
    const rootNode = buildTreeDown(rootId);
    if (!rootNode) return null;

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
// GEDCOM-stílusú: Family entitás alapján is működik (parent_family_id)
function renderMarriageLinks(root) {
    const marriageLinks = treeData.links.filter(l => l.type === 'marriage');
    const nodePositions = new Map();
    
    root.descendants().forEach(d => {
        nodePositions.set(d.data.id, { x: d.x, y: d.y });
    });
    
    // === SZÜLŐPÁROK ÖSSZEGYŰJTÉSE ===
    // 1. Új modell: parent_family_id + marriages alapján
    const parentPairs = new Map(); // "id1-id2" -> { source, target, familyId, hasChildren }
    
    if (treeData.marriages) {
        treeData.marriages.forEach(m => {
            if (!m.person1_id || !m.person2_id) return;
            
            // Van-e közös gyerekük ezen a családon keresztül?
            const hasChildren = treeData.nodes.some(n => n.parent_family_id === m.id);
            
            if (hasChildren) {
                const key = m.person1_id < m.person2_id 
                    ? `${m.person1_id}-${m.person2_id}` 
                    : `${m.person2_id}-${m.person1_id}`;
                
                if (!parentPairs.has(key)) {
                    parentPairs.set(key, { 
                        source: m.person1_id, 
                        target: m.person2_id,
                        familyId: m.id,
                        hasChildren: true,
                        status: m.status,
                        relationshipType: m.relationship_type
                    });
                }
            }
        });
    }
    
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
            // Házassági kapcsolat adatai (ha elérhető)
            const marriage = treeData.marriages?.find(m => 
                (m.person1_id === link.source && m.person2_id === link.target) ||
                (m.person2_id === link.source && m.person1_id === link.target)
            );
            
            const isDivorced = marriage?.status === 'divorced';
            const isWidowed = marriage?.status === 'widowed';
            
            // Házassági vonal - szaggatott ha elvált
            g.append('line')
                .attr('class', `tree-link marriage ${isDivorced ? 'divorced' : ''} ${isWidowed ? 'widowed' : ''}`)
                .attr('x1', source.x)
                .attr('y1', source.y)
                .attr('x2', target.x)
                .attr('y2', target.y)
                .style('stroke', isDivorced ? '#999' : (settings.line_color || '#666'))
                .style('stroke-width', settings.line_width || 2)
                .style('stroke-dasharray', isDivorced ? '10,5' : (settings.marriage_line_style === 'dashed' ? '5,5' : 'none'));
            
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            
            // Ikon a házasság közepén - szív vagy törött szív
            g.append('text')
                .attr('x', midX)
                .attr('y', midY)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .style('font-family', 'Font Awesome 6 Free')
                .style('font-weight', '900')
                .style('font-size', '16px')
                .style('fill', isDivorced ? '#999' : '#e74c3c')
                .text(isDivorced ? '\uf7a9' : '\uf004'); // heart-crack vagy heart
            
            // Midpoint CSAK ha közös gyerekük van (szülőpár)
            const pairKey = link.source < link.target 
                ? `${link.source}-${link.target}` 
                : `${link.target}-${link.source}`;
            if (parentPairs.has(pairKey)) {
                const pairData = parentPairs.get(pairKey);
                midpoints.push({ 
                    marriageId: link.marriage_id, 
                    familyId: pairData.familyId,
                    x: midX, 
                    y: midY, 
                    source: link.source, 
                    target: link.target 
                });
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
            midpoints.push({ 
                marriageId: null, 
                familyId: pair.familyId,
                x: midX, 
                y: midY, 
                source: pair.source, 
                target: pair.target 
            });
        }
    });

    return { midpoints, nodePositions };
}

// Közös gyerekek vizuális összekötése a házassági vonalról leágazóan
// GRÁF-ALAPÚ MODELL: csak parent_family_id alapján
function renderMarriageChildren(root, marriageRender) {
    if (!marriageRender || !marriageRender.midpoints) return;
    if (currentLayout === 'radial') return; // radiálisnál nem rajzoljuk

    const { midpoints, nodePositions } = marriageRender;
    const cardW = settings.card_width || 200;
    const cardH = settings.card_height || 100;

    midpoints.forEach(mp => {
        // Gyerekek keresése - CSAK parent_family_id alapján
        const children = treeData.nodes.filter(n => {
            if (n.parent_family_id && mp.familyId) {
                return n.parent_family_id === mp.familyId;
            }
            return false;
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
