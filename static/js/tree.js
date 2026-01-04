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
    
    // Kapcsolat vonalak rajzolása
    const links = g.append('g')
        .attr('class', 'links')
        .selectAll('path')
        .data(root.links())
        .enter()
        .append('path')
        .attr('class', 'tree-link')
        .attr('d', getLinkPath)
        .style('stroke', settings.line_color || '#666')
        .style('stroke-width', settings.line_width || 2);
    
    // Házassági kapcsolatok rajzolása
    renderMarriageLinks(root);
    
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
            .attr('xlink:href', d => d.data.photo || '/static/img/default-avatar.png')
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
            // Ha nincs megfelelő gyökér, az első személyt használjuk
            rootId = treeData.nodes[0].id;
        }
    }
    
    if (!rootId) return null;
    
    // Node map létrehozása
    const nodeMap = new Map(treeData.nodes.map(n => [n.id, { ...n, children: [] }]));
    
    // Szülő-gyermek kapcsolatok felépítése
    treeData.nodes.forEach(node => {
        if (node.father_id && nodeMap.has(node.father_id)) {
            nodeMap.get(node.father_id).children.push(nodeMap.get(node.id));
        } else if (node.mother_id && nodeMap.has(node.mother_id)) {
            nodeMap.get(node.mother_id).children.push(nodeMap.get(node.id));
        }
    });
    
    const rootNode = nodeMap.get(rootId);
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

// ==================== HÁZASSÁGI KAPCSOLATOK ====================
function renderMarriageLinks(root) {
    const marriageLinks = treeData.links.filter(l => l.type === 'marriage');
    const nodePositions = new Map();
    
    root.descendants().forEach(d => {
        nodePositions.set(d.data.id, { x: d.x, y: d.y });
    });
    
    marriageLinks.forEach(link => {
        const source = nodePositions.get(link.source);
        const target = nodePositions.get(link.target);
        
        if (source && target) {
            g.append('line')
                .attr('class', 'tree-link marriage')
                .attr('x1', source.x)
                .attr('y1', source.y)
                .attr('x2', target.x)
                .attr('y2', target.y)
                .style('stroke', settings.line_color || '#666')
                .style('stroke-width', settings.line_width || 2)
                .style('stroke-dasharray', settings.marriage_line_style === 'dashed' ? '5,5' : 'none');
            
            // Szív ikon a házasság közepén
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            
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
    const svgData = new XMLSerializer().serializeToString(svgElement);
    
    // Stílusok beágyazása
    const styleSheet = document.styleSheets[0];
    let styles = '';
    try {
        for (let rule of styleSheet.cssRules) {
            styles += rule.cssText;
        }
    } catch (e) {
        console.warn('CSS szabályok nem olvashatók:', e);
    }
    
    const svgWithStyles = svgData.replace(
        '<svg',
        `<svg xmlns="http://www.w3.org/2000/svg"><style>${styles}</style>`
    );
    
    // Blob létrehozása
    const blob = new Blob([svgWithStyles], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    // Canvas konvertálás PNG-hez
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
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
