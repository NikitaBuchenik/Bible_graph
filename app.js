// app.js
const loading = document.getElementById('loading');

async function init() {
    try {
        const graphData = await loadData();
        loading.classList.add('hidden');

        const positioned = buildLayeredGraph(graphData);
        
        initGraph(positioned, onNodeClick);
        setupSearch(onVerseSelected, onSearchResults);

        document.getElementById('clearBtn').addEventListener('click', () => {
            clearHighlight();
            closeVerseInfo();
        });

        document.getElementById('closeVerseInfo').addEventListener('click', () => {
            closeVerseInfo();
            clearHighlight();
        });

        // Логика для ушка статистики
        const statsToggle = document.getElementById('statsToggle');
        const statsPanel = document.getElementById('statsPanel');
        let isOpen = false;

        statsToggle.addEventListener('click', () => {
            isOpen = !isOpen;
            statsPanel.classList.toggle('open', isOpen);
            statsToggle.textContent = isOpen ? '✕' : '📊';
        });

        // Закрытие по клику вне панели
        document.addEventListener('click', (e) => {
            if (isOpen && 
                !statsPanel.contains(e.target) && 
                e.target !== statsToggle) {
                isOpen = false;
                statsPanel.classList.remove('open');
                statsToggle.textContent = '📊';
            }
        });

    } catch (err) {
        loading.innerHTML = `
            <p style="color:#ef5350;">Ошибка</p>
            <p style="font-size:13px;color:#78909c;">${err.message}</p>
            <p style="font-size:13px;color:#78909c;margin-top:8px;">
                Нужны файлы: bible_gece_graph.json и rst.json
            </p>
        `;
        console.error(err);
    }
}

function onNodeClick(id) {
    if (selectedNodeId === id) {
        clickCount++;
        if (clickCount === 1) {
            highlightNode(id, Infinity);
        } else if (clickCount >= 2) {
            clearHighlight();
            closeVerseInfo();
            clickCount = 0;
        }
    } else {
        selectedNodeId = id;
        clickCount = 0;
        highlightNode(id, 1);
    }
    showVerseInfo(id, onRelatedClick);
}

function onVerseSelected(ref) {
    if (selectedNodeId !== ref) {
        selectedNodeId = ref;
        clickCount = 0;
        highlightNode(ref, 1);
        focusNode(ref);
    }
    showVerseInfo(ref, onRelatedClick);
}

function onRelatedClick(ref) {
    if (selectedNodeId !== ref) {
        selectedNodeId = ref;
        clickCount = 0;
        highlightNode(ref, 1);
        focusNode(ref);
    }
    showVerseInfo(ref, onRelatedClick);
}

function onSearchResults(refs) {
    if (!refs || refs.length === 0) return;
    
    clearHighlight();
    highlightSearchResults(refs);
    
    let sumX = 0, sumY = 0, count = 0;
    for (const ref of refs) {
        const node = allNodes.find(n => n.id === ref);
        if (node) {
            sumX += node.x;
            sumY += node.y;
            count++;
        }
    }
    
    if (count > 0) {
        const centerX = sumX / count;
        const centerY = sumY / count;
        focusOnPoint({ x: centerX, y: centerY });
    }
}

function focusOnPoint(point) {
    if (!point || !svg || !zoom) return;

    const container = document.getElementById('container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scale = 0.35;
    const tx = width / 2 - point.x * scale;
    const ty = height / 2 - point.y * scale;

    const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

    svg.transition()
        .duration(750)
        .call(zoom.transform, transform)
        .on('end', () => {
            renderCanvas();
        });
}

init();