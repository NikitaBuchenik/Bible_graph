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
let currentDepth = 0;
let isSearchMode = false;
let searchLinkData = [];

let renderTimeout = null;
let nodeMap = {};
let lastRenderTransform = null;
let linkData = [];
let nodeSpatialGrid = new Map();
const NODE_GRID_SIZE = 500;
let zoomFrame = null;
let zoomRenderPending = false;

window.nodeMap = nodeMap;

function buildLayeredGraph(data) {
    const { nodes: rawNodes, links: rawLinks } = data;
    const CENTER = 'Ин 3:16';

    const graph = {};
    rawNodes.forEach(n => graph[n.id] = { node: n, neighbors: new Set() });
    
    rawLinks.forEach(l => {
        if (graph[l.source] && graph[l.target]) {
            graph[l.source].neighbors.add(l.target);
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
        if (!visited.has(n.id)) {
            layers[n.id] = -1;
        }
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

    const sortedLayers = Object.keys(groups)
        .map(Number)
        .filter(l => l !== 0)
        .sort((a, b) => a - b);

    for (const layerNum of sortedLayers) {
        const group = groups[layerNum];
        
        let radius;
        if (layerNum === -1) {
            radius = RADIUS_STEP * (maxLayer + 5);
        } else {
            radius = RADIUS_STEP * (layerNum + 1);
        }
        
        const count = group.length;
        const angleStep = (2 * Math.PI) / count;
        const offset = layerNum === -1 ? Math.random() * 0.5 : layerNum * 0.2;

        group.forEach((node, i) => {
            const angle = i * angleStep + offset;
            const jitter = layerNum === -1 ? (Math.random() - 0.5) * 200 : (Math.random() - 0.5) * 60;
            const x = Math.cos(angle) * (radius + jitter);
            const y = Math.sin(angle) * (radius + jitter);
            positioned.push({
                ...node,
                x: x,
                y: y,
                layer: layerNum
            });
        });
    }

    for (let iter = 0; iter < 5; iter++) {
        for (let i = 0; i < positioned.length; i++) {
            for (let j = i + 1; j < positioned.length; j++) {
                const a = positioned[i];
                const b = positioned[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                let minDist;
                if (a.layer === -1 || b.layer === -1) {
                    minDist = 150;
                } else {
                    minDist = 80;
                }
                
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

    nodeMap = {};
    allNodes.forEach(n => nodeMap[n.id] = n);
    window.nodeMap = nodeMap;

    document.getElementById('nodeCount').textContent = allNodes.length;

    const container = document.getElementById('container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '1';
    canvas.style.transformOrigin = '0 0';
    canvas.style.willChange = 'transform';
    container.appendChild(canvas);
    canvasCtx = canvas.getContext('2d', { alpha: true, desynchronized: true });

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

    linkData = allLinks.map(l => ({
        source: nodeMap[l.source],
        target: nodeMap[l.target]
    })).filter(l => l.source && l.target);

    buildNodeSpatialGrid();

    graph = {};
    allNodes.forEach(n => graph[n.id] = { neighbors: new Set() });
    linkData.forEach(l => {
        graph[l.source.id].neighbors.add(l.target.id);
    });

    nodeGroup = g.append('g').attr('class', 'nodes');
    labelGroup = g.append('g').attr('class', 'labels');

    createInteractiveElements(onNodeClick);

    zoom = d3.zoom()
        .scaleExtent([0.01, 2])
        .on('zoom', (event) => {
            currentTransform = event.transform;
            g.attr('transform', event.transform);
            scheduleCanvasTransform();
        })
        .on('end', () => {
            zoomRenderPending = false;
            if (zoomFrame !== null) {
                cancelAnimationFrame(zoomFrame);
                zoomFrame = null;
            }
            renderCanvas();
        });

    svg.call(zoom);

    const centerX = width / 2;
    const centerY = height / 2;
    const initialScale = 0.35;
    const initialTransform = d3.zoomIdentity.translate(centerX, centerY).scale(initialScale);
    currentTransform = initialTransform;
    svg.call(zoom.transform, initialTransform);

    setTimeout(() => {
        renderCanvas();
    }, 100);

    window.addEventListener('resize', () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        canvas.width = w;
        canvas.height = h;
        canvas.style.transform = 'none';
        lastRenderTransform = null;
        svg.attr('width', w).attr('height', h);
        if (currentTransform) {
            renderCanvas();
        }
    });
}

function scheduleCanvasTransform() {
    if (!canvas || !currentTransform || !lastRenderTransform) return;

    if (zoomFrame !== null) return;

    zoomFrame = requestAnimationFrame(() => {
        zoomFrame = null;

        if (!canvas || !currentTransform || !lastRenderTransform) return;

        // The graph bitmap was rendered at lastRenderTransform.
        // Instead of redrawing ~85k primitives on every wheel event,
        // move/scale that already-rendered bitmap on the compositor.
        const scale = currentTransform.k / lastRenderTransform.k;
        const x = currentTransform.x - scale * lastRenderTransform.x;
        const y = currentTransform.y - scale * lastRenderTransform.y;

        canvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    });
}

function throttleRender() {
    scheduleCanvasTransform();
}

function createInteractiveElements(onNodeClick) {
    // Keep SVG only as a lightweight interaction/zoom surface.
    // The old implementation created ~31k circles + ~31k text nodes.
    // Their geometry was transformed on every zoom event even though the
    // actual graph is rendered on canvas. Hit testing is now done against
    // a spatial index instead, preserving hover/click behavior without
    // maintaining tens of thousands of DOM elements.

    svg
        .on('pointermove.graph', function(event) {
            const node = getNodeAtPointer(event);

            if (node) {
                if (hoverTimeout) {
                    clearTimeout(hoverTimeout);
                    hoverTimeout = null;
                }

                if (hoveredNodeId !== node.id) {
                    hoveredNodeId = node.id;
                    isHovering = true;
                    renderCanvas();
                }

                const rect = document.getElementById('container').getBoundingClientRect();
                const tooltip = document.getElementById('tooltip');
                tooltip.textContent = node.id;
                tooltip.style.left = (event.clientX - rect.left + 12) + 'px';
                tooltip.style.top = (event.clientY - rect.top - 10) + 'px';
                tooltip.classList.add('visible');
            } else if (hoveredNodeId !== null) {
                if (hoverTimeout) clearTimeout(hoverTimeout);

                hoverTimeout = setTimeout(() => {
                    hoveredNodeId = null;
                    isHovering = false;
                    document.getElementById('tooltip').classList.remove('visible');
                    renderCanvas();
                }, 150);
            }
        })
        .on('pointerleave.graph', function() {
            if (hoverTimeout) clearTimeout(hoverTimeout);

            hoverTimeout = setTimeout(() => {
                hoveredNodeId = null;
                isHovering = false;
                document.getElementById('tooltip').classList.remove('visible');
                renderCanvas();
            }, 150);
        })
        .on('click.graph', function(event) {
            const node = getNodeAtPointer(event);
            if (!node) return;

            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
                hoverTimeout = null;
            }

            onNodeClick(node.id);
        });
}

function buildNodeSpatialGrid() {
    nodeSpatialGrid.clear();

    for (const node of allNodes) {
        const gx = Math.floor(node.x / NODE_GRID_SIZE);
        const gy = Math.floor(node.y / NODE_GRID_SIZE);
        const key = gx + ':' + gy;

        let bucket = nodeSpatialGrid.get(key);
        if (!bucket) {
            bucket = [];
            nodeSpatialGrid.set(key, bucket);
        }
        bucket.push(node);
    }
}

function getNodeAtPointer(event) {
    if (!currentTransform || !svg || !allNodes.length) return null;

    const point = d3.pointer(event, svg.node());
    const world = currentTransform.invert(point);
    const scale = currentTransform.k;

    // Preserve the old SVG hit-area semantics while avoiding a DOM element
    // for every node. A small screen-space tolerance also makes nodes usable
    // when zoomed far out.
    const screenTolerance = Math.max(4, 8);
    const worldTolerance = screenTolerance / Math.max(scale, 0.0001);

    const minX = world[0] - worldTolerance;
    const maxX = world[0] + worldTolerance;
    const minY = world[1] - worldTolerance;
    const maxY = world[1] + worldTolerance;

    const minGX = Math.floor(minX / NODE_GRID_SIZE);
    const maxGX = Math.floor(maxX / NODE_GRID_SIZE);
    const minGY = Math.floor(minY / NODE_GRID_SIZE);
    const maxGY = Math.floor(maxY / NODE_GRID_SIZE);

    let closest = null;
    let closestDistance = Infinity;

    for (let gx = minGX; gx <= maxGX; gx++) {
        for (let gy = minGY; gy <= maxGY; gy++) {
            const bucket = nodeSpatialGrid.get(gx + ':' + gy);
            if (!bucket) continue;

            for (const node of bucket) {
                const dx = node.x - world[0];
                const dy = node.y - world[1];
                const distance = Math.sqrt(dx * dx + dy * dy);

                const isCenter = node.id === 'Ин 3:16';
                const nodeRadius = isCenter ? 30 : 15;
                const hitRadius = Math.max(nodeRadius, worldTolerance);

                if (distance <= hitRadius && distance < closestDistance) {
                    closest = node;
                    closestDistance = distance;
                }
            }
        }
    }

    return closest;
}

function renderCanvas() {
    if (!canvasCtx || !currentTransform) return;
    // A fresh render becomes the new bitmap baseline.
    // Reset the temporary compositor transform before drawing.
    canvas.style.transform = 'none';

    lastRenderTransform = {
        k: currentTransform.k,
        x: currentTransform.x,
        y: currentTransform.y
    };
    
    const width = canvas.width;
    const height = canvas.height;
    
    canvasCtx.clearRect(0, 0, width, height);
    
    const scale = currentTransform.k;
    const tx = currentTransform.x;
    const ty = currentTransform.y;
    
    const padding = 200 / scale;
    const viewLeft = -tx / scale - padding;
    const viewRight = (width - tx) / scale + padding;
    const viewTop = -ty / scale - padding;
    const viewBottom = (height - ty) / scale + padding;

    let highlightId = selectedNodeId || hoveredNodeId;
    let connectedIds = highlightConnectedIds;
    const isAllMode = currentDepth === Infinity;
    const isSearchModeActive = isSearchMode && connectedIds.size > 0;
    const hasHighlight = (highlightId && connectedIds.size > 0 && !isAllMode) || isSearchModeActive;

    // Рисуем связи
    if (isSearchModeActive) {
        canvasCtx.beginPath();
        let hasLinks = false;
        for (const link of linkData) {
            const source = link.source;
            const target = link.target;
            const sourceVisible = source.x >= viewLeft && source.x <= viewRight && 
                                 source.y >= viewTop && source.y <= viewBottom;
            const targetVisible = target.x >= viewLeft && target.x <= viewRight && 
                                 target.y >= viewTop && target.y <= viewBottom;
            
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
                const isFromHighlighted = connectedIds.has(source.id) && connectedIds.has(target.id);
                if (isFromHighlighted) continue;
                
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

        // Подсвеченные связи (только исходящие)
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
                const isFromHighlighted = connectedIds.has(source.id) && connectedIds.has(target.id);
                if (isFromHighlighted) {
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
        const isIsolated = node.layer === -1;
        const radius = isCenter ? 24 : (isIsolated ? 3 : 4 + Math.min(node.links_count || 0, 10) * 1);
        const scaledRadius = Math.max(radius * Math.min(scale * 1.5, 1), 2);
        
        let color;
        if (isCenter) color = '#ff6b6b';
        else if (isIsolated) color = '#455a64';
        else if (node.layer === 1) color = '#ffcc80';
        else if (node.layer === 2) color = '#80cbc4';
        else if (node.layer >= 3) color = '#4db6ac';
        else color = '#4db6ac';
        
        const isHighlighted = hasHighlight && connectedIds.has(node.id);
        const isSelected = highlightId === node.id;
        const isReachable = isAllMode && connectedIds.has(node.id);
        const isInSearch = isSearchModeActive && connectedIds.has(node.id);
        
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, scaledRadius, 0, Math.PI * 2);
        
        if (isSearchModeActive) {
            if (isInSearch) {
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
                canvasCtx.fillStyle = color;
                canvasCtx.globalAlpha = 0.03;
                canvasCtx.shadowColor = 'transparent';
                canvasCtx.shadowBlur = 0;
                canvasCtx.fill();
                canvasCtx.globalAlpha = 1;
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
            if (isCenter || (!isIsolated && node.links_count > 5)) {
                canvasCtx.strokeStyle = '#1e2430';
                canvasCtx.lineWidth = isCenter ? 2 : 0.8;
                canvasCtx.stroke();
            }
        }
    }
}

    // Labels are part of the cached canvas bitmap now, so the browser does
    // not need to keep ~31k SVG text nodes alive during zoom.
    canvasCtx.save();
    canvasCtx.textAlign = 'center';
    canvasCtx.textBaseline = 'alphabetic';
    canvasCtx.fillStyle = '#cfd8dc';
    canvasCtx.shadowColor = 'rgba(0,0,0,0.85)';
    canvasCtx.shadowBlur = 4;

    for (const node of allNodes) {
        const isVisible = node.x >= viewLeft && node.x <= viewRight &&
                         node.y >= viewTop && node.y <= viewBottom;
        if (!isVisible) continue;

        const x = node.x * scale + tx;
        const y = node.y * scale + ty;
        const isCenter = node.id === 'Ин 3:16';
        const radius = isCenter ? 24 : 4 + Math.min(node.links_count || 0, 10) * 1;
        const fontSize = (isCenter ? 14 : 7 + Math.min(node.links_count || 0, 6) * 0.3) * scale;

        // At sub-pixel sizes the old SVG labels were effectively unreadable.
        // Skipping them here avoids spending CPU on text that cannot be seen.
        if (fontSize < 2) continue;

        canvasCtx.font = `${isCenter ? 'bold ' : ''}${Math.max(fontSize, 2)}px Segoe UI, sans-serif`;
        canvasCtx.fillText(node.id, x, y - (radius + 10) * scale);
    }

    canvasCtx.restore();

function highlightNode(id, depth) {
    isHighlightActive = true;
    selectedNodeId = id;
    highlightConnectedIds = new Set();
    currentDepth = depth;
    
    const visited = new Set();
    const queue = [{ id: id, dist: 0 }];
    const connectedIds = new Set([id]);
    
    while (queue.length > 0) {
        const current = queue.shift();
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
    isSearchMode = false;
    searchLinkData = [];
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
    
    const connectedIds = new Set(refs);
    
    isHighlightActive = true;
    selectedNodeId = null;
    highlightConnectedIds = connectedIds;
    currentDepth = 0;
    isSearchMode = true;
    searchLinkData = [];
    
    document.getElementById('clearBtn').classList.remove('hidden');
    renderCanvas();
}