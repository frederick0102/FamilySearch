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

// ==================== ÚJ GENERÁCIÓ-ALAPÚ LAYOUT ====================
// Minden személy generációja alapján kerül egy sorba
// Házastársak egymás mellett, gyerekek a szülőpár alatt középen
function buildGenerationLayout(sizes) {
    if (!treeData.nodes || treeData.nodes.length === 0) {
        return { nodes: [], links: [] };
    }
    
    const { cardWidth, cardHeight, horizontalSpacing, verticalSpacing } = sizes;
    
    // === 1. LÉPÉS: Kapcsolatok felépítése ===
    const familyMap = new Map(); // family_id -> { person1_id, person2_id, children: [] }
    const parentsOf = new Map(); // person_id -> [parent_ids]
    const childrenOf = new Map(); // person_id -> [child_ids]
    const partnersOf = new Map(); // person_id -> [partner_ids]
    
    // Inicializálás
    treeData.nodes.forEach(n => {
        parentsOf.set(n.id, []);
        childrenOf.set(n.id, []);
        partnersOf.set(n.id, []);
    });
    
    // Családok feldolgozása
    if (treeData.marriages) {
        treeData.marriages.forEach(m => {
            familyMap.set(m.id, {
                person1_id: m.person1_id,
                person2_id: m.person2_id,
                children: [],
                status: m.status
            });
            
            // Partner kapcsolatok
            if (m.person1_id && m.person2_id) {
                if (partnersOf.has(m.person1_id)) {
                    partnersOf.get(m.person1_id).push(m.person2_id);
                }
                if (partnersOf.has(m.person2_id)) {
                    partnersOf.get(m.person2_id).push(m.person1_id);
                }
            }
        });
    }
    
    // Szülő-gyerek kapcsolatok (parent_family_id alapján)
    treeData.nodes.forEach(node => {
        if (node.parent_family_id && familyMap.has(node.parent_family_id)) {
            const family = familyMap.get(node.parent_family_id);
            family.children.push(node.id);
            
            const parents = [family.person1_id, family.person2_id].filter(Boolean);
            parentsOf.set(node.id, parents);
            
            parents.forEach(parentId => {
                if (childrenOf.has(parentId)) {
                    const children = childrenOf.get(parentId);
                    if (!children.includes(node.id)) {
                        children.push(node.id);
                    }
                }
            });
        }
    });
    
    // DEBUG: Ellenőrizzük a kapcsolatokat
    console.log('=== DEBUG: Kapcsolatok ===');
    console.log('familyMap:', [...familyMap.entries()]);
    console.log('childrenOf:', [...childrenOf.entries()]);
    console.log('parentsOf:', [...parentsOf.entries()]);
    console.log('partnersOf:', [...partnersOf.entries()]);
    
    // === 2. LÉPÉS: Generációk meghatározása ===
    // A gyökér személy keresése (legfelső ős)
    let rootId = rootPersonId;
    
    if (!rootId) {
        rootId = treeData.nodes[0]?.id;
    }
    
    // Felfelé keresés a legfelső ősig
    const findRootAncestor = (personId, visited = new Set()) => {
        if (visited.has(personId)) return personId;
        visited.add(personId);
        
        const parents = parentsOf.get(personId) || [];
        if (parents.length === 0) return personId;
        
        return findRootAncestor(parents[0], visited);
    };
    
    rootId = findRootAncestor(rootId);
    
    console.log('=== DEBUG: Root és generációk ===');
    console.log('rootId:', rootId);
    
    // Generációk kiosztása (BFS)
    const generations = new Map(); // person_id -> generation (0 = legfelső)
    const visited = new Set();
    
    const assignGenerations = (startId) => {
        const queue = [{ id: startId, gen: 0 }];
        visited.add(startId);
        generations.set(startId, 0);
        
        while (queue.length > 0) {
            const { id, gen } = queue.shift();
            
            // Partnerek ugyanazon a generáción
            const partners = partnersOf.get(id) || [];
            partners.forEach(partnerId => {
                if (!visited.has(partnerId)) {
                    visited.add(partnerId);
                    generations.set(partnerId, gen);
                    queue.push({ id: partnerId, gen });
                }
            });
            
            // Gyerekek egy generációval lejjebb
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
    
    assignGenerations(rootId);
    
    // Nem látogatott személyek hozzáadása (szigetek)
    treeData.nodes.forEach(n => {
        if (!visited.has(n.id)) {
            assignGenerations(n.id);
        }
    });
    
    // === 3. LÉPÉS: Generációnkénti csoportosítás ===
    const genGroups = new Map(); // generation -> [person_ids]
    
    generations.forEach((gen, personId) => {
        if (!genGroups.has(gen)) {
            genGroups.set(gen, []);
        }
        genGroups.get(gen).push(personId);
    });
    
    console.log('=== DEBUG: Generációk ===');
    console.log('generations:', [...generations.entries()]);
    console.log('genGroups:', [...genGroups.entries()]);
    
    // === 4. LÉPÉS: Pozícionálás - Szülő-központú elrendezés ===
    const positionedNodes = [];
    const layoutLinks = [];
    const nodePositions = new Map(); // person_id -> { x, y }
    
    // Generációk rendezése
    const sortedGens = Array.from(genGroups.keys()).sort((a, b) => a - b);
    
    // Első generáció (gyökér) pozícionálása
    const firstGen = sortedGens[0];
    const firstGenPersons = genGroups.get(firstGen) || [];
    
    // Csoportosítás: házaspárok együtt, helyes sorrendben
    // Sorrend: ex-partnerek (bal) | főszereplő (közép) | jelenlegi partner (jobb)
    const groupIntoUnits = (personIds, gen) => {
        const processed = new Set();
        const units = [];
        
        personIds.forEach(personId => {
            if (processed.has(personId)) return;
            
            const partners = (partnersOf.get(personId) || []).filter(p => 
                generations.get(p) === gen && !processed.has(p)
            );
            
            if (partners.length > 0) {
                // Meghatározzuk ki a "főszereplő" - akinek van parent_family_id
                let mainPerson = personId;
                const allMembers = [personId, ...partners];
                
                // Keressük meg aki a család gyereke (parent_family_id van)
                for (const memberId of allMembers) {
                    const person = treeData.nodes.find(n => n.id === memberId);
                    if (person && person.parent_family_id) {
                        mainPerson = memberId;
                        break;
                    }
                }
                
                // Partnerek rendezése: ex-partnerek (bal) | főszereplő | aktív partner (jobb)
                const exPartners = []; // divorced, ended, separated
                const activePartners = []; // active, married
                
                allMembers.forEach(memberId => {
                    if (memberId === mainPerson) return;
                    
                    // Keressük meg a házasság státuszát a főszereplővel
                    const marriage = treeData.marriages?.find(m => 
                        (m.person1_id === mainPerson && m.person2_id === memberId) ||
                        (m.person2_id === mainPerson && m.person1_id === memberId)
                    );
                    
                    const status = marriage?.status || 'active';
                    if (status === 'divorced' || status === 'ended' || status === 'separated' || status === 'widowed') {
                        exPartners.push(memberId);
                    } else {
                        activePartners.push(memberId);
                    }
                });
                
                // Sorrend: ex-partnerek | főszereplő | aktív partnerek
                const orderedUnit = [...exPartners, mainPerson, ...activePartners];
                orderedUnit.forEach(id => processed.add(id));
                units.push({ members: orderedUnit, familyId: null });
            } else {
                processed.add(personId);
                units.push({ members: [personId], familyId: null });
            }
        });
        
        return units;
    };
    
    // Rekurzívan pozícionáljuk a családokat fentről lefelé
    const positionGeneration = (gen, genIndex, parentCenters = null) => {
        const personIds = genGroups.get(gen) || [];
        console.log(`positionGeneration: gen=${gen}, genIndex=${genIndex}, personIds=`, personIds);
        if (personIds.length === 0) return;
        
        const y = genIndex * verticalSpacing;
        const units = groupIntoUnits(personIds, gen);
        
        // Ha ez az első generáció, egyszerűen középre igazítjuk
        if (parentCenters === null) {
            let totalWidth = 0;
            units.forEach(unit => {
                totalWidth += unit.members.length * horizontalSpacing;
            });
            
            let currentX = -totalWidth / 2 + horizontalSpacing / 2;
            
            units.forEach(unit => {
                unit.members.forEach((personId, idx) => {
                    const person = treeData.nodes.find(n => n.id === personId);
                    if (!person) return;
                    
                    const x = currentX + idx * horizontalSpacing;
                    positionedNodes.push({ ...person, x, y });
                    nodePositions.set(personId, { x, y });
                });
                
                // Házassági linkek a tényleges házasságok alapján (lásd lentebb)
                
                currentX += unit.members.length * horizontalSpacing;
            });
        } else {
            // Gyerek generáció: a szülők alá igazítjuk
            // Csoportosítjuk a unitokat a szülő család szerint
            const familyUnits = new Map(); // familyId -> units[]
            const orphanUnits = []; // Nincs szülő család (beházasodottak)
            
            console.log(`Gen ${gen}: units=`, units);
            console.log(`Gen ${gen}: parentCenters=`, [...parentCenters.entries()]);
            
            units.forEach(unit => {
                // Keressük meg, hogy ennek az unitnak melyik családhoz tartozik a "fő" tagja
                // (amelyik a szülők gyereke)
                let foundFamilyId = null;
                
                for (const memberId of unit.members) {
                    const person = treeData.nodes.find(n => n.id === memberId);
                    if (person && person.parent_family_id) {
                        foundFamilyId = person.parent_family_id;
                        break;
                    }
                }
                
                if (foundFamilyId && parentCenters.has(foundFamilyId)) {
                    console.log(`  Unit with members ${unit.members} -> familyUnits[${foundFamilyId}]`);
                    if (!familyUnits.has(foundFamilyId)) {
                        familyUnits.set(foundFamilyId, []);
                    }
                    familyUnits.get(foundFamilyId).push(unit);
                } else {
                    console.log(`  Unit with members ${unit.members} -> orphanUnits (foundFamilyId=${foundFamilyId}, parentCenters.has=${parentCenters.has(foundFamilyId)})`);
                    orphanUnits.push(unit);
                }
            });
            
            console.log(`Gen ${gen}: familyUnits=`, [...familyUnits.entries()]);
            console.log(`Gen ${gen}: orphanUnits=`, orphanUnits);
            
            // Pozícionálás a szülők középpontja alá
            const positionedX = new Set();
            
            console.log(`Gen ${gen}: Processing familyUnits, count=${familyUnits.size}`);
            familyUnits.forEach((familyUnitsList, familyId) => {
                const parentCenter = parentCenters.get(familyId);
                console.log(`  familyId=${familyId}, parentCenter=${parentCenter}, unitCount=${familyUnitsList.length}`);
                if (parentCenter === undefined || parentCenter === null) return;
                
                // Számítsuk ki a teljes szélességet
                let totalWidth = 0;
                familyUnitsList.forEach(unit => {
                    totalWidth += unit.members.length * horizontalSpacing;
                });
                
                // Kezdő X pozíció (középre igazítva a szülők alá)
                let currentX = parentCenter - totalWidth / 2 + horizontalSpacing / 2;
                
                familyUnitsList.forEach(unit => {
                    unit.members.forEach((personId, idx) => {
                        const person = treeData.nodes.find(n => n.id === personId);
                        if (!person) return;
                        
                        let x = currentX + idx * horizontalSpacing;
                        
                        // Ütközés elkerülése
                        while (positionedX.has(Math.round(x))) {
                            x += horizontalSpacing;
                        }
                        
                        positionedNodes.push({ ...person, x, y });
                        nodePositions.set(personId, { x, y });
                        positionedX.add(Math.round(x));
                    });
                    
                    // Házassági linkek - a tényleges házasságok alapján
                    // (nem a szomszédok alapján, mert pl. Ildikó-András-Lajos esetén András és Lajos nincs házasságban)
                    
                    currentX += unit.members.length * horizontalSpacing;
                });
            });
            
            // Árva unitok (beházasodottak akiknek nincs szülő családja itt)
            // A már pozícionált személyek mellé helyezzük
            orphanUnits.forEach(unit => {
                unit.members.forEach((personId, idx) => {
                    // Csak akkor pozícionáljuk, ha még nincs
                    if (nodePositions.has(personId)) return;
                    
                    const person = treeData.nodes.find(n => n.id === personId);
                    if (!person) return;
                    
                    // Keressük a partnert aki már pozícionálva van
                    const partners = partnersOf.get(personId) || [];
                    let x = 0;
                    
                    for (const partnerId of partners) {
                        const partnerPos = nodePositions.get(partnerId);
                        if (partnerPos) {
                            x = partnerPos.x + horizontalSpacing;
                            break;
                        }
                    }
                    
                    // Ütközés elkerülése
                    while (positionedX.has(Math.round(x))) {
                        x += horizontalSpacing;
                    }
                    
                    positionedNodes.push({ ...person, x, y });
                    nodePositions.set(personId, { x, y });
                    positionedX.add(Math.round(x));
                    
                    // Házassági linkek a tényleges házasságok alapján (lásd lentebb - 4b lépés)
                });
            });
        }
    };
    
    // Pozícionálás generációnként fentről lefelé
    console.log('=== DEBUG: sortedGens ===', sortedGens);
    sortedGens.forEach((gen, genIndex) => {
        console.log(`Pozícionálás: gen=${gen}, genIndex=${genIndex}`);
        if (genIndex === 0) {
            // Első generáció
            positionGeneration(gen, genIndex, null);
        } else {
            // Gyerek generációk - szülők középpontjai alapján
            const parentCenters = new Map(); // familyId -> centerX
            
            familyMap.forEach((family, familyId) => {
                const p1Pos = nodePositions.get(family.person1_id);
                const p2Pos = nodePositions.get(family.person2_id);
                
                if (p1Pos && p2Pos) {
                    parentCenters.set(familyId, (p1Pos.x + p2Pos.x) / 2);
                } else if (p1Pos) {
                    parentCenters.set(familyId, p1Pos.x);
                } else if (p2Pos) {
                    parentCenters.set(familyId, p2Pos.x);
                }
            });
            
            positionGeneration(gen, genIndex, parentCenters);
            console.log(`After positionGeneration gen=${gen}: positionedNodes count=`, positionedNodes.length);
        }
    });
    
    // === 4b. LÉPÉS: Házassági linkek a tényleges házasságok alapján ===
    if (treeData.marriages) {
        treeData.marriages.forEach(marriage => {
            const p1Pos = nodePositions.get(marriage.person1_id);
            const p2Pos = nodePositions.get(marriage.person2_id);
            
            // Csak akkor adjuk hozzá, ha mindkét személy pozícionálva van
            if (p1Pos && p2Pos) {
                // Ellenőrizzük, hogy nincs-e már ilyen link
                const exists = layoutLinks.some(l => 
                    l.type === 'marriage' && 
                    ((l.source === marriage.person1_id && l.target === marriage.person2_id) ||
                     (l.source === marriage.person2_id && l.target === marriage.person1_id))
                );
                if (!exists) {
                    layoutLinks.push({
                        source: marriage.person1_id,
                        target: marriage.person2_id,
                        type: 'marriage',
                        status: marriage.status || 'active',
                        marriageId: marriage.id
                    });
                }
            }
        });
    }
    
    // === 5. LÉPÉS: Szülő-gyerek vonalak ===
    // Minden családhoz (ahol van közös gyerek)
    familyMap.forEach((family, familyId) => {
        if (family.children.length === 0) return;
        
        const p1Pos = nodePositions.get(family.person1_id);
        const p2Pos = nodePositions.get(family.person2_id);
        
        // Legalább egy szülő kell
        if (!p1Pos && !p2Pos) return;
        
        // Mindkét szülőt hozzáadjuk a linkekhez
        const parentIds = [family.person1_id, family.person2_id].filter(id => 
            id && nodePositions.has(id)
        );
        
        family.children.forEach(childId => {
            // Link mindkét szülővel (a familyId alapján csoportosítjuk majd)
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
    
    return { nodes: positionedNodes, links: layoutLinks };
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
