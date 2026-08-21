// graph.js
let svg = null;
let canvas = null;
let canvasCtx = null;
let g = null;
let nodeGroup = null;
let labelGroup = null;
let graph = {};
let nodes = [];
let links = [];
let zoom = null;
let currentTransform = null;
let allNodes = [];
let allLinks = [];
let isHighlightActive = false;
let selectedNodeId = null;
let clickCount = 0;
let highlightConnectedIds = new Set();
let hoveredNodeId = null;
let hoverTimeout = null;
let isHovering = false;
let currentDepth = 0; // 0 - нет, 1 - соседи, Infinity - все достижимые

// Для throttle
let renderTimeout = null;

// Кеш
let nodeMap = {};
let linkData = [];

function buildLayeredGraph(data) {
    const { nodes: rawNodes, links: rawLinks } = data;
    const CENTER = 'Ин 3:16';

    const graph = {};
    rawNodes.forEach(n => graph[n.id] = { node: n, neighbors: new Set() });
    rawLinks.forEach(l => {
        if (graph[l.source] && graph[l.target]) {
            graph[l.source].neighbors.add(l.target);
            graph[l.target].neighbors.add(l.source);
        }
    });

    const layers = {};
    const visited = new Set();
    const queue = [];
    let maxLayer = 0;

    if (graph[CENTER]) {
        layers[CENTER] = 0;
        visited.add(CENTER);
        queue.push(CENTER);
    }

    let head = 0;
    while (head < queue.length) {
        const current = queue[head++];
        const curLayer = layers[current];
        for (const nb of graph[current].neighbors) {
            if (!visited.has(nb) && graph[nb]) {
                visited.add(nb);
                layers[nb] = curLayer + 1;
                if (curLayer + 1 > maxLayer) maxLayer = curLayer + 1;
                queue.push(nb);
            }
        }
    }

    rawNodes.forEach(n => {
        if (!visited.has(n.id)) layers[n.id] = -1;
    });

    const groups = {};
    rawNodes.forEach(n => {
        const layer = layers[n.id] ?? -1;
        if (!groups[layer]) groups[layer] = [];
        groups[layer].push(n);
    });

    const RADIUS_STEP = 500;
    const positioned = [];
    const centerNode = rawNodes.find(n => n.id === CENTER);
    if (centerNode) {
        positioned.push({ ...centerNode, x: 0, y: 0, layer: 0 });
    }

    const sortedLayers = Object.keys(groups).map(Number).filter(l => l !== 0).sort((a, b) => a - b);

    for (const layerNum of sortedLayers) {
        const group = groups[layerNum];
        const radius = RADIUS_STEP * (layerNum + 1);
        const actualRadius = layerNum === -1 ? RADIUS_STEP * (maxLayer + 3) : radius;
        const count = group.length;
        const angleStep = (2 * Math.PI) / count;

        group.forEach((node, i) => {
            const angle = i * angleStep + layerNum * 0.2;
            const jitter = (Math.random() - 0.5) * 60;
            positioned.push({
                ...node,
                x: Math.cos(angle) * (actualRadius + jitter),
                y: Math.sin(angle) * (actualRadius + jitter),
                layer: layerNum
            });
        });
    }

    for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < positioned.length; i++) {
            for (let j = i + 1; j < positioned.length; j++) {
                const a = positioned[i];
                const b = positioned[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = 80;
                if (dist < minDist && dist > 0) {
                    const force = (minDist - dist) / 2;
                    const angle = Math.atan2(dy, dx);
                    a.x += Math.cos(angle) * force;
                    a.y += Math.sin(angle) * force;
                    b.x -= Math.cos(angle) * force;
                    b.y -= Math.sin(angle) * force;
                }
            }
        }
    }

    return { nodes: positioned, links: rawLinks };
}

function initGraph(data, onNodeClick) {
    allNodes = data.nodes;
    allLinks = data.links;

    document.getElementById('nodeCount').textContent = allNodes.length;

    const container = document.getElementById('container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Создаем Canvas
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '1';
    container.appendChild(canvas);
    canvasCtx = canvas.getContext('2d');

    // SVG для интерактивных элементов
    svg = d3.select('#container')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .style('position', 'absolute')
        .style('top', '0')
        .style('left', '0')
        .style('pointer-events', 'all')
        .style('background', 'transparent')
        .style('zIndex', '2');

    g = svg.append('g');

    // Строим граф
    nodeMap = {};
    allNodes.forEach(n => nodeMap[n.id] = n);

    linkData = allLinks.map(l => ({
        source: nodeMap[l.source],
        target: nodeMap[l.target]
    })).filter(l => l.source && l.target);

    graph = {};
    allNodes.forEach(n => graph[n.id] = { neighbors: new Set() });
    linkData.forEach(l => {
        graph[l.source.id].neighbors.add(l.target.id);
        graph[l.target.id].neighbors.add(l.source.id);
    });

    // Создаем группы
    nodeGroup = g.append('g').attr('class', 'nodes');
    labelGroup = g.append('g').attr('class', 'labels');

    // Создаем интерактивные элементы
    createInteractiveElements(onNodeClick);

    zoom = d3.zoom()
        .scaleExtent([0.01, 2])
        .on('zoom', (event) => {
            currentTransform = event.transform;
            g.attr('transform', event.transform);
            throttleRender();
        });

    svg.call(zoom);

    const centerX = width / 2;
    const centerY = height / 2;
    const initialScale = 0.35;
    const initialTransform = d3.zoomIdentity.translate(centerX, centerY).scale(initialScale);
    currentTransform = initialTransform;
    svg.call(zoom.transform, initialTransform);

    // Первоначальная отрисовка
    setTimeout(() => {
        renderCanvas();
    }, 100);

    window.addEventListener('resize', () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        canvas.width = w;
        canvas.height = h;
        svg.attr('width', w).attr('height', h);
        if (currentTransform) {
            renderCanvas();
        }
    });
}

function throttleRender() {
    if (renderTimeout) {
        cancelAnimationFrame(renderTimeout);
    }
    renderTimeout = requestAnimationFrame(() => {
        renderCanvas();
        renderTimeout = null;
    });
}

function createInteractiveElements(onNodeClick) {
    // Интерактивные узлы (прозрачные, только для кликов)
    nodeGroup.selectAll('circle')
        .data(allNodes)
        .enter()
        .append('circle')
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('r', d => {
            const isCenter = d.id === 'Ин 3:16';
            return isCenter ? 30 : 15;
        })
        .attr('fill', 'transparent')
        .attr('stroke', 'transparent')
        .attr('cursor', 'pointer')
        .attr('data-id', d => d.id)
        .on('mouseover', function(event) {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }
            
            const d = d3.select(this).datum();
            hoveredNodeId = d.id;
            isHovering = true;
            
            const rect = document.getElementById('container').getBoundingClientRect();
            const tooltip = document.getElementById('tooltip');
            tooltip.textContent = d.id;
            tooltip.style.left = (event.clientX - rect.left + 12) + 'px';
            tooltip.style.top = (event.clientY - rect.top - 10) + 'px';
            tooltip.classList.add('visible');
            
            renderCanvas();
        })
        .on('mousemove', function(event) {
            const rect = document.getElementById('container').getBoundingClientRect();
            const tooltip = document.getElementById('tooltip');
            tooltip.style.left = (event.clientX - rect.left + 12) + 'px';
            tooltip.style.top = (event.clientY - rect.top - 10) + 'px';
        })
        .on('mouseout', function() {
            hoverTimeout = setTimeout(() => {
                hoveredNodeId = null;
                isHovering = false;
                document.getElementById('tooltip').classList.remove('visible');
                renderCanvas();
            }, 150);
        })
        .on('click', function() {
            const d = d3.select(this).datum();
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }
            onNodeClick(d.id);
        });

    // Подписи
    labelGroup.selectAll('text')
        .data(allNodes)
        .enter()
        .append('text')
        .attr('x', d => d.x)
        .attr('y', d => {
            const isCenter = d.id === 'Ин 3:16';
            const radius = isCenter ? 24 : 4 + Math.min(d.links_count || 0, 10) * 1;
            return d.y - radius - 10;
        })
        .attr('text-anchor', 'middle')
        .attr('font-size', d => {
            const isCenter = d.id === 'Ин 3:16';
            return isCenter ? 14 : 7 + Math.min(d.links_count || 0, 6) * 0.3;
        })
        .attr('fill', '#cfd8dc')
        .attr('font-family', 'Segoe UI, sans-serif')
        .attr('font-weight', d => d.id === 'Ин 3:16' ? 'bold' : '400')
        .attr('pointer-events', 'none')
        .attr('data-id', d => d.id)
        .style('text-shadow', '0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)')
        .text(d => d.id);
}

function renderCanvas() {
    if (!canvasCtx || !currentTransform) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    canvasCtx.clearRect(0, 0, width, height);
    
    const scale = currentTransform.k;
    const tx = currentTransform.x;
    const ty = currentTransform.y;
    
    // Вычисляем видимую область с отступом
    const padding = 200 / scale;
    const viewLeft = -tx / scale - padding;
    const viewRight = (width - tx) / scale + padding;
    const viewTop = -ty / scale - padding;
    const viewBottom = (height - ty) / scale + padding;

    // Определяем режим подсветки
    let highlightId = selectedNodeId || hoveredNodeId;
    let connectedIds = highlightConnectedIds;
    const isAllMode = currentDepth === Infinity;
    const hasHighlight = highlightId && connectedIds.size > 0 && !isAllMode;

    // Рисуем связи
    if (isAllMode) {
        // Режим "все достижимые" - показываем только связи между достижимыми узлами
        canvasCtx.beginPath();
        let hasLinks = false;
        for (const link of linkData) {
            const source = link.source;
            const target = link.target;
            const sourceVisible = source.x >= viewLeft && source.x <= viewRight && 
                                 source.y >= viewTop && source.y <= viewBottom;
            const targetVisible = target.x >= viewLeft && target.x <= viewRight && 
                                 target.y >= viewTop && target.y <= viewBottom;
            
            // Показываем только связи, где оба узла достижимы
            const isReachable = connectedIds.has(source.id) && connectedIds.has(target.id);
            
            if ((sourceVisible || targetVisible) && isReachable) {
                const sx = source.x * scale + tx;
                const sy = source.y * scale + ty;
                const tx2 = target.x * scale + tx;
                const ty2 = target.y * scale + ty;
                
                canvasCtx.moveTo(sx, sy);
                canvasCtx.lineTo(tx2, ty2);
                hasLinks = true;
            }
        }
        if (hasLinks) {
            canvasCtx.strokeStyle = 'rgba(255, 204, 128, 0.4)';
            canvasCtx.lineWidth = 1;
            canvasCtx.stroke();
        }
    } else if (hasHighlight) {
        // Режим подсветки соседей
        // Тусклые связи (неподсвеченные)
        canvasCtx.beginPath();
        for (const link of linkData) {
            const source = link.source;
            const target = link.target;
            const sourceVisible = source.x >= viewLeft && source.x <= viewRight && 
                                 source.y >= viewTop && source.y <= viewBottom;
            const targetVisible = target.x >= viewLeft && target.x <= viewRight && 
                                 target.y >= viewTop && target.y <= viewBottom;
            
            if (sourceVisible || targetVisible) {
                const isRelated = connectedIds.has(source.id) && connectedIds.has(target.id);
                if (isRelated) continue;
                
                const sx = source.x * scale + tx;
                const sy = source.y * scale + ty;
                const tx2 = target.x * scale + tx;
                const ty2 = target.y * scale + ty;
                
                canvasCtx.moveTo(sx, sy);
                canvasCtx.lineTo(tx2, ty2);
            }
        }
        canvasCtx.strokeStyle = 'rgba(42, 48, 60, 0.05)';
        canvasCtx.lineWidth = 0.5;
        canvasCtx.stroke();

        // Подсвеченные связи
        canvasCtx.beginPath();
        let hasHighlightedLinks = false;
        for (const link of linkData) {
            const source = link.source;
            const target = link.target;
            const sourceVisible = source.x >= viewLeft && source.x <= viewRight && 
                                 source.y >= viewTop && source.y <= viewBottom;
            const targetVisible = target.x >= viewLeft && target.x <= viewRight && 
                                 target.y >= viewTop && target.y <= viewBottom;
            
            if (sourceVisible || targetVisible) {
                const isRelated = connectedIds.has(source.id) && connectedIds.has(target.id);
                if (isRelated) {
                    const sx = source.x * scale + tx;
                    const sy = source.y * scale + ty;
                    const tx2 = target.x * scale + tx;
                    const ty2 = target.y * scale + ty;
                    
                    canvasCtx.moveTo(sx, sy);
                    canvasCtx.lineTo(tx2, ty2);
                    hasHighlightedLinks = true;
                }
            }
        }
        if (hasHighlightedLinks) {
            canvasCtx.strokeStyle = 'rgba(255, 204, 128, 0.6)';
            canvasCtx.lineWidth = 1.2;
            canvasCtx.stroke();
        }
    } else {
        // Обычный режим
        canvasCtx.beginPath();
        for (const link of linkData) {
            const source = link.source;
            const target = link.target;
            const sourceVisible = source.x >= viewLeft && source.x <= viewRight && 
                                 source.y >= viewTop && source.y <= viewBottom;
            const targetVisible = target.x >= viewLeft && target.x <= viewRight && 
                                 target.y >= viewTop && target.y <= viewBottom;
            
            if (sourceVisible || targetVisible) {
                const sx = source.x * scale + tx;
                const sy = source.y * scale + ty;
                const tx2 = target.x * scale + tx;
                const ty2 = target.y * scale + ty;
                
                canvasCtx.moveTo(sx, sy);
                canvasCtx.lineTo(tx2, ty2);
            }
        }
        canvasCtx.strokeStyle = 'rgba(42, 48, 60, 0.2)';
        canvasCtx.lineWidth = 0.8;
        canvasCtx.stroke();
    }

    // Рисуем узлы
    for (const node of allNodes) {
        const isVisible = node.x >= viewLeft && node.x <= viewRight && 
                         node.y >= viewTop && node.y <= viewBottom;
        
        if (!isVisible) continue;
        
        const x = node.x * scale + tx;
        const y = node.y * scale + ty;
        const isCenter = node.id === 'Ин 3:16';
        const radius = isCenter ? 24 : 4 + Math.min(node.links_count || 0, 10) * 1;
        const scaledRadius = Math.max(radius * Math.min(scale * 1.5, 1), 2);
        
        let color;
        if (isCenter) color = '#ff6b6b';
        else if (node.layer === 1) color = '#ffcc80';
        else if (node.layer === 2) color = '#80cbc4';
        else if (node.layer >= 3) color = '#4db6ac';
        else if (node.layer === -1) color = '#78909c';
        else color = '#4db6ac';
        
        const isHighlighted = hasHighlight && connectedIds.has(node.id);
        const isSelected = highlightId === node.id;
        const isReachable = isAllMode && connectedIds.has(node.id);
        
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, scaledRadius, 0, Math.PI * 2);
        
        if (isAllMode) {
            if (isReachable) {
                // Достижимый узел - яркий
                canvasCtx.fillStyle = color;
                canvasCtx.shadowColor = '#ffcc80';
                canvasCtx.shadowBlur = 5;
                canvasCtx.fill();
                canvasCtx.shadowColor = 'transparent';
                canvasCtx.shadowBlur = 0;
                canvasCtx.strokeStyle = '#ffcc80';
                canvasCtx.lineWidth = 1.5;
                canvasCtx.stroke();
            } else {
                // Недостижимый узел - почти невидимый
                canvasCtx.fillStyle = color;
                canvasCtx.globalAlpha = 0.05;
                canvasCtx.shadowColor = 'transparent';
                canvasCtx.shadowBlur = 0;
                canvasCtx.fill();
                canvasCtx.globalAlpha = 1;
                // Нет обводки
            }
        } else if (isSelected) {
            // Выбранный узел
            canvasCtx.fillStyle = '#ffcc80';
            canvasCtx.shadowColor = '#ffcc80';
            canvasCtx.shadowBlur = 15;
            canvasCtx.fill();
            canvasCtx.shadowColor = 'transparent';
            canvasCtx.shadowBlur = 0;
            canvasCtx.strokeStyle = '#ffcc80';
            canvasCtx.lineWidth = 3;
            canvasCtx.stroke();
        } else if (isHighlighted && hasHighlight) {
            // Подсвеченный узел
            canvasCtx.fillStyle = color;
            canvasCtx.shadowColor = '#ffcc80';
            canvasCtx.shadowBlur = 8;
            canvasCtx.fill();
            canvasCtx.shadowColor = 'transparent';
            canvasCtx.shadowBlur = 0;
            canvasCtx.strokeStyle = '#ffcc80';
            canvasCtx.lineWidth = 1.5;
            canvasCtx.stroke();
        } else if (hasHighlight) {
            // Затемненный узел
            canvasCtx.fillStyle = color;
            canvasCtx.globalAlpha = 0.08;
            canvasCtx.shadowColor = 'transparent';
            canvasCtx.shadowBlur = 0;
            canvasCtx.fill();
            canvasCtx.globalAlpha = 1;
            // Нет обводки
        } else {
            // Обычный узел
            canvasCtx.fillStyle = color;
            canvasCtx.shadowColor = 'transparent';
            canvasCtx.shadowBlur = 0;
            canvasCtx.fill();
            if (isCenter || node.links_count > 5) {
                canvasCtx.strokeStyle = '#1e2430';
                canvasCtx.lineWidth = isCenter ? 2 : 0.8;
                canvasCtx.stroke();
            }
        }
    }
}

function highlightNode(id, depth) {
    isHighlightActive = true;
    selectedNodeId = id;
    highlightConnectedIds = new Set();
    currentDepth = depth;
    
    // Находим все достижимые узлы через BFS
    const visited = new Set();
    const queue = [{ id: id, dist: 0 }];
    const connectedIds = new Set([id]);
    
    while (queue.length > 0) {
        const current = queue.shift();
        // Если глубина Infinity - идем до конца
        if (depth !== Infinity && current.dist >= depth) continue;
        
        const neighbors = graph[current.id]?.neighbors || new Set();
        for (const nb of neighbors) {
            if (!visited.has(nb)) {
                visited.add(nb);
                connectedIds.add(nb);
                queue.push({ id: nb, dist: current.dist + 1 });
            }
        }
    }
    highlightConnectedIds = connectedIds;
    
    document.getElementById('clearBtn').classList.remove('hidden');
    renderCanvas();
}

function clearHighlight() {
    isHighlightActive = false;
    selectedNodeId = null;
    clickCount = 0;
    highlightConnectedIds = new Set();
    hoveredNodeId = null;
    currentDepth = 0;
    document.getElementById('clearBtn').classList.add('hidden');
    document.getElementById('tooltip').classList.remove('visible');
    renderCanvas();
}

function focusNode(id) {
    const node = allNodes.find(n => n.id === id);
    if (!node || !svg || !zoom) return;

    const container = document.getElementById('container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scale = 0.35;
    const tx = width / 2 - node.x * scale;
    const ty = height / 2 - node.y * scale;

    const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

    svg.transition()
        .duration(750)
        .call(zoom.transform, transform)
        .on('end', () => {
            renderCanvas();
        });
}

function highlightSearchResults(refs) {
    if (!refs || refs.length === 0) return;
    
    // Собираем все уникальные узлы из результатов поиска
    const connectedIds = new Set(refs);
    
    // Находим связи между найденными стихами
    // Проверяем каждую связь: если оба конца есть в refs - добавляем
    const searchLinks = [];
    for (const link of linkData) {
        if (connectedIds.has(link.source.id) && connectedIds.has(link.target.id)) {
            searchLinks.push(link);
        }
    }
    
    // Сохраняем состояние подсветки
    isHighlightActive = true;
    selectedNodeId = null; // Не выделяем конкретный узел
    highlightConnectedIds = connectedIds;
    currentDepth = 0;
    isSearchMode = true;
    searchLinkData = searchLinks;
    
    document.getElementById('clearBtn').classList.remove('hidden');
    renderCanvas();
}

// Модифицируем renderCanvas для поддержки режима поиска
// Добавляем в начало файла переменные
let isSearchMode = false;
let searchLinkData = [];

// Модифицируем renderCanvas (добавляем проверку isSearchMode)
// В функции renderCanvas после определения режимов добавляем:

function renderCanvas() {
    if (!canvasCtx || !currentTransform) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    canvasCtx.clearRect(0, 0, width, height);
    
    const scale = currentTransform.k;
    const tx = currentTransform.x;
    const ty = currentTransform.y;
    
    // Вычисляем видимую область с отступом
    const padding = 200 / scale;
    const viewLeft = -tx / scale - padding;
    const viewRight = (width - tx) / scale + padding;
    const viewTop = -ty / scale - padding;
    const viewBottom = (height - ty) / scale + padding;

    // Определяем режим подсветки
    let highlightId = selectedNodeId || hoveredNodeId;
    let connectedIds = highlightConnectedIds;
    const isAllMode = currentDepth === Infinity;
    const isSearchModeActive = isSearchMode && connectedIds.size > 0;
    const hasHighlight = (highlightId && connectedIds.size > 0 && !isAllMode) || isSearchModeActive;

    // Рисуем связи
    if (isSearchModeActive) {
        // Режим поиска - показываем только связи между найденными стихами
        canvasCtx.beginPath();
        let hasLinks = false;
        for (const link of linkData) {
            const source = link.source;
            const target = link.target;
            const sourceVisible = source.x >= viewLeft && source.x <= viewRight && 
                                 source.y >= viewTop && source.y <= viewBottom;
            const targetVisible = target.x >= viewLeft && target.x <= viewRight && 
                                 target.y >= viewTop && target.y <= viewBottom;
            
            // Показываем только связи, где оба узла в результатах поиска
            const isInSearch = connectedIds.has(source.id) && connectedIds.has(target.id);
            
            if ((sourceVisible || targetVisible) && isInSearch) {
                const sx = source.x * scale + tx;
                const sy = source.y * scale + ty;
                const tx2 = target.x * scale + tx;
                const ty2 = target.y * scale + ty;
                
                canvasCtx.moveTo(sx, sy);
                canvasCtx.lineTo(tx2, ty2);
                hasLinks = true;
            }
        }
        if (hasLinks) {
            canvasCtx.strokeStyle = 'rgba(255, 204, 128, 0.5)';
            canvasCtx.lineWidth = 1.2;
            canvasCtx.stroke();
        }
    } else if (isAllMode) {
        // Режим "все достижимые" - показываем только связи между достижимыми узлами
        canvasCtx.beginPath();
        let hasLinks = false;
        for (const link of linkData) {
            const source = link.source;
            const target = link.target;
            const sourceVisible = source.x >= viewLeft && source.x <= viewRight && 
                                 source.y >= viewTop && source.y <= viewBottom;
            const targetVisible = target.x >= viewLeft && target.x <= viewRight && 
                                 target.y >= viewTop && target.y <= viewBottom;
            
            const isReachable = connectedIds.has(source.id) && connectedIds.has(target.id);
            
            if ((sourceVisible || targetVisible) && isReachable) {
                const sx = source.x * scale + tx;
                const sy = source.y * scale + ty;
                const tx2 = target.x * scale + tx;
                const ty2 = target.y * scale + ty;
                
                canvasCtx.moveTo(sx, sy);
                canvasCtx.lineTo(tx2, ty2);
                hasLinks = true;
            }
        }
        if (hasLinks) {
            canvasCtx.strokeStyle = 'rgba(255, 204, 128, 0.4)';
            canvasCtx.lineWidth = 1;
            canvasCtx.stroke();
        }
    } else if (hasHighlight && !isSearchModeActive) {
        // Режим подсветки соседей
        // Тусклые связи
        canvasCtx.beginPath();
        for (const link of linkData) {
            const source = link.source;
            const target = link.target;
            const sourceVisible = source.x >= viewLeft && source.x <= viewRight && 
                                 source.y >= viewTop && source.y <= viewBottom;
            const targetVisible = target.x >= viewLeft && target.x <= viewRight && 
                                 target.y >= viewTop && target.y <= viewBottom;
            
            if (sourceVisible || targetVisible) {
                const isRelated = connectedIds.has(source.id) && connectedIds.has(target.id);
                if (isRelated) continue;
                
                const sx = source.x * scale + tx;
                const sy = source.y * scale + ty;
                const tx2 = target.x * scale + tx;
                const ty2 = target.y * scale + ty;
                
                canvasCtx.moveTo(sx, sy);
                canvasCtx.lineTo(tx2, ty2);
            }
        }
        canvasCtx.strokeStyle = 'rgba(42, 48, 60, 0.05)';
        canvasCtx.lineWidth = 0.5;
        canvasCtx.stroke();

        // Подсвеченные связи
        canvasCtx.beginPath();
        let hasHighlightedLinks = false;
        for (const link of linkData) {
            const source = link.source;
            const target = link.target;
            const sourceVisible = source.x >= viewLeft && source.x <= viewRight && 
                                 source.y >= viewTop && source.y <= viewBottom;
            const targetVisible = target.x >= viewLeft && target.x <= viewRight && 
                                 target.y >= viewTop && target.y <= viewBottom;
            
            if (sourceVisible || targetVisible) {
                const isRelated = connectedIds.has(source.id) && connectedIds.has(target.id);
                if (isRelated) {
                    const sx = source.x * scale + tx;
                    const sy = source.y * scale + ty;
                    const tx2 = target.x * scale + tx;
                    const ty2 = target.y * scale + ty;
                    
                    canvasCtx.moveTo(sx, sy);
                    canvasCtx.lineTo(tx2, ty2);
                    hasHighlightedLinks = true;
                }
            }
        }
        if (hasHighlightedLinks) {
            canvasCtx.strokeStyle = 'rgba(255, 204, 128, 0.6)';
            canvasCtx.lineWidth = 1.2;
            canvasCtx.stroke();
        }
    } else {
        // Обычный режим
        canvasCtx.beginPath();
        for (const link of linkData) {
            const source = link.source;
            const target = link.target;
            const sourceVisible = source.x >= viewLeft && source.x <= viewRight && 
                                 source.y >= viewTop && source.y <= viewBottom;
            const targetVisible = target.x >= viewLeft && target.x <= viewRight && 
                                 target.y >= viewTop && target.y <= viewBottom;
            
            if (sourceVisible || targetVisible) {
                const sx = source.x * scale + tx;
                const sy = source.y * scale + ty;
                const tx2 = target.x * scale + tx;
                const ty2 = target.y * scale + ty;
                
                canvasCtx.moveTo(sx, sy);
                canvasCtx.lineTo(tx2, ty2);
            }
        }
        canvasCtx.strokeStyle = 'rgba(42, 48, 60, 0.2)';
        canvasCtx.lineWidth = 0.8;
        canvasCtx.stroke();
    }

    // Рисуем узлы
    for (const node of allNodes) {
        const isVisible = node.x >= viewLeft && node.x <= viewRight && 
                         node.y >= viewTop && node.y <= viewBottom;
        
        if (!isVisible) continue;
        
        const x = node.x * scale + tx;
        const y = node.y * scale + ty;
        const isCenter = node.id === 'Ин 3:16';
        const radius = isCenter ? 24 : 4 + Math.min(node.links_count || 0, 10) * 1;
        const scaledRadius = Math.max(radius * Math.min(scale * 1.5, 1), 2);
        
        let color;
        if (isCenter) color = '#ff6b6b';
        else if (node.layer === 1) color = '#ffcc80';
        else if (node.layer === 2) color = '#80cbc4';
        else if (node.layer >= 3) color = '#4db6ac';
        else if (node.layer === -1) color = '#78909c';
        else color = '#4db6ac';
        
        const isHighlighted = hasHighlight && connectedIds.has(node.id);
        const isSelected = highlightId === node.id;
        const isReachable = isAllMode && connectedIds.has(node.id);
        const isInSearch = isSearchModeActive && connectedIds.has(node.id);
        
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, scaledRadius, 0, Math.PI * 2);
        
        if (isSearchModeActive) {
            if (isInSearch) {
                // Найденный стих - яркий с обводкой
                canvasCtx.fillStyle = '#ffcc80';
                canvasCtx.shadowColor = '#ffcc80';
                canvasCtx.shadowBlur = 10;
                canvasCtx.fill();
                canvasCtx.shadowColor = 'transparent';
                canvasCtx.shadowBlur = 0;
                canvasCtx.strokeStyle = '#ffcc80';
                canvasCtx.lineWidth = 2;
                canvasCtx.stroke();
            } else {
                // Не найденный стих - почти невидимый
                canvasCtx.fillStyle = color;
                canvasCtx.globalAlpha = 0.03;
                canvasCtx.shadowColor = 'transparent';
                canvasCtx.shadowBlur = 0;
                canvasCtx.fill();
                canvasCtx.globalAlpha = 1;
                // Нет обводки
            }
        } else if (isAllMode) {
            if (isReachable) {
                canvasCtx.fillStyle = color;
                canvasCtx.shadowColor = '#ffcc80';
                canvasCtx.shadowBlur = 5;
                canvasCtx.fill();
                canvasCtx.shadowColor = 'transparent';
                canvasCtx.shadowBlur = 0;
                canvasCtx.strokeStyle = '#ffcc80';
                canvasCtx.lineWidth = 1.5;
                canvasCtx.stroke();
            } else {
                canvasCtx.fillStyle = color;
                canvasCtx.globalAlpha = 0.05;
                canvasCtx.shadowColor = 'transparent';
                canvasCtx.shadowBlur = 0;
                canvasCtx.fill();
                canvasCtx.globalAlpha = 1;
            }
        } else if (isSelected) {
            canvasCtx.fillStyle = '#ffcc80';
            canvasCtx.shadowColor = '#ffcc80';
            canvasCtx.shadowBlur = 15;
            canvasCtx.fill();
            canvasCtx.shadowColor = 'transparent';
            canvasCtx.shadowBlur = 0;
            canvasCtx.strokeStyle = '#ffcc80';
            canvasCtx.lineWidth = 3;
            canvasCtx.stroke();
        } else if (isHighlighted && hasHighlight && !isSearchModeActive) {
            canvasCtx.fillStyle = color;
            canvasCtx.shadowColor = '#ffcc80';
            canvasCtx.shadowBlur = 8;
            canvasCtx.fill();
            canvasCtx.shadowColor = 'transparent';
            canvasCtx.shadowBlur = 0;
            canvasCtx.strokeStyle = '#ffcc80';
            canvasCtx.lineWidth = 1.5;
            canvasCtx.stroke();
        } else if (hasHighlight && !isSearchModeActive) {
            canvasCtx.fillStyle = color;
            canvasCtx.globalAlpha = 0.08;
            canvasCtx.shadowColor = 'transparent';
            canvasCtx.shadowBlur = 0;
            canvasCtx.fill();
            canvasCtx.globalAlpha = 1;
        } else {
            canvasCtx.fillStyle = color;
            canvasCtx.shadowColor = 'transparent';
            canvasCtx.shadowBlur = 0;
            canvasCtx.fill();
            if (isCenter || node.links_count > 5) {
                canvasCtx.strokeStyle = '#1e2430';
                canvasCtx.lineWidth = isCenter ? 2 : 0.8;
                canvasCtx.stroke();
            }
        }
    }
}

// Обновляем clearHighlight для сброса режима поиска
function clearHighlight() {
    isHighlightActive = false;
    selectedNodeId = null;
    clickCount = 0;
    highlightConnectedIds = new Set();
    hoveredNodeId = null;
    currentDepth = 0;
    isSearchMode = false;
    searchLinkData = [];
    document.getElementById('clearBtn').classList.add('hidden');
    document.getElementById('tooltip').classList.remove('visible');
    renderCanvas();
}