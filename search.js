// search.js
function setupSearch(onVerseSelected, onSearchResults) {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');

    searchInput.addEventListener('input', function() {
        const query = this.value.trim().toLowerCase();
        if (!query) {
            searchResults.innerHTML = '';
            return;
        }

        const results = allVerses.filter(v =>
            v.ref.toLowerCase().includes(query) ||
            v.text.toLowerCase().includes(query)
        ).slice(0, 20);

        if (results.length === 0) {
            searchResults.innerHTML = '<div style="color:#78909c;font-size:13px;padding:8px;">Ничего не найдено</div>';
            return;
        }

        searchResults.innerHTML = '';
        results.forEach(v => {
            const div = document.createElement('div');
            div.className = 'result-item';
            div.innerHTML = `
                <span class="ref">${v.ref}</span>
                <span class="text">${v.text.substring(0, 60)}${v.text.length > 60 ? '...' : ''}</span>
            `;
            div.onclick = () => {
                searchInput.value = v.ref;
                searchResults.innerHTML = '';
                onVerseSelected(v.ref);
            };
            searchResults.appendChild(div);
        });
    });

    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const query = this.value.trim();
            if (!query) return;

            // Ищем точное совпадение
            const exact = allVerses.find(v => v.ref.toLowerCase() === query.toLowerCase());
            if (exact) {
                searchResults.innerHTML = '';
                onVerseSelected(exact.ref);
                return;
            }

            // Ищем все совпадения
            const results = allVerses.filter(v =>
                v.ref.toLowerCase().includes(query.toLowerCase()) ||
                v.text.toLowerCase().includes(query.toLowerCase())
            );

            if (results.length === 0) {
                searchResults.innerHTML = '<div style="color:#78909c;font-size:13px;padding:8px;">Ничего не найдено</div>';
                return;
            }

            if (results.length === 1) {
                searchResults.innerHTML = '';
                onVerseSelected(results[0].ref);
                return;
            }

            // Если найдено несколько стихов - показываем их все
            searchResults.innerHTML = '';
            const refs = results.map(v => v.ref);
            
            // Показываем найденные стихи в результатах поиска
            results.slice(0, 10).forEach(v => {
                const div = document.createElement('div');
                div.className = 'result-item';
                div.innerHTML = `
                    <span class="ref">${v.ref}</span>
                    <span class="text">${v.text.substring(0, 60)}${v.text.length > 60 ? '...' : ''}</span>
                `;
                div.onclick = () => {
                    searchInput.value = v.ref;
                    searchResults.innerHTML = '';
                    onVerseSelected(v.ref);
                };
                searchResults.appendChild(div);
            });

            // Вызываем функцию для подсветки всех найденных стихов
            if (typeof onSearchResults === 'function') {
                onSearchResults(refs);
            }
        }
    });
}

function showVerseInfo(ref, onRelatedClick) {
    const verse = verseMap[ref];
    if (!verse) return;

    const verseInfo = document.getElementById('verseInfo');
    document.getElementById('verseRef').textContent = ref;
    document.getElementById('verseText').textContent = verse.text;

    const neighbors = graph[ref]?.neighbors || new Set();
    const neighborList = Array.from(neighbors);
    const relatedVerses = document.getElementById('relatedVerses');
    relatedVerses.innerHTML = '';

    if (neighborList.length === 0) {
        relatedVerses.innerHTML = '<div style="color:#78909c;font-size:13px;">Нет связанных стихов</div>';
    } else {
        neighborList.forEach(nb => {
            const div = document.createElement('div');
            div.className = 'related-item';
            div.textContent = nb;
            div.onclick = () => {
                onRelatedClick(nb);
            };
            relatedVerses.appendChild(div);
        });
    }

    verseInfo.style.display = 'block';
}

function closeVerseInfo() {
    document.getElementById('verseInfo').style.display = 'none';
}