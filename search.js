// search.js
function setupSearch(onVerseSelected, onSearchResults) {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');

    searchInput.addEventListener('input', function() {
        const query = this.value.trim();
        if (!query) {
            searchResults.innerHTML = '';
            return;
        }

        const results = searchVerses(query);

        if (results.length === 0) {
            searchResults.innerHTML = '<div style="color:#78909c;font-size:13px;padding:8px;">Ничего не найдено</div>';
            return;
        }

        searchResults.innerHTML = '';
        results.slice(0, 20).forEach(v => {
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

            // Ищем точное совпадение по ссылке
            const exact = allVerses.find(v => v.ref.toLowerCase() === query.toLowerCase());
            if (exact) {
                searchResults.innerHTML = '';
                onVerseSelected(exact.ref);
                return;
            }

            // Ищем все совпадения
            const results = searchVerses(query);

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

            if (typeof onSearchResults === 'function') {
                onSearchResults(refs);
            }
        }
    });
}

// Функция поиска — по словам в тексте
function searchVerses(query) {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];
    
    const queryLower = normalizedQuery.toLowerCase();
    
    // Словарь книг (сокращения)
    const bookMap = {
        'быт': 'Быт', 'исх': 'Исх', 'лев': 'Лев', 'чис': 'Чис', 'втор': 'Втор',
        'нав': 'Нав', 'суд': 'Суд', 'руф': 'Руф', '1цар': '1Цар', '2цар': '2Цар',
        '3цар': '3Цар', '4цар': '4Цар', '1пар': '1Пар', '2пар': '2Пар', 'езд': 'Езд',
        'неем': 'Неем', 'есф': 'Есф', 'иов': 'Иов', 'пс': 'Пс', 'прит': 'Прит',
        'еккл': 'Еккл', 'песн': 'Песн', 'ис': 'Ис', 'иер': 'Иер', 'плач': 'Плач',
        'иез': 'Иез', 'дан': 'Дан', 'ос': 'Ос', 'иоил': 'Иоил', 'ам': 'Ам',
        'авд': 'Авд', 'ион': 'Ион', 'мих': 'Мих', 'наум': 'Наум', 'авв': 'Авв',
        'соф': 'Соф', 'агг': 'Агг', 'зах': 'Зах', 'мал': 'Мал',
        'мф': 'Мф', 'мк': 'Мк', 'лк': 'Лк', 'ин': 'Ин', 'деян': 'Деян',
        'рим': 'Рим', '1кор': '1Кор', '2кор': '2Кор', 'гал': 'Гал', 'еф': 'Еф',
        'флп': 'Флп', 'кол': 'Кол', '1фес': '1Фес', '2фес': '2Фес', '1тим': '1Тим',
        '2тим': '2Тим', 'тит': 'Тит', 'флм': 'Флм', 'евр': 'Евр', 'иак': 'Иак',
        '1пет': '1Пет', '2пет': '2Пет', '1ин': '1Ин', '2ин': '2Ин', '3ин': '3Ин',
        'иуд': 'Иуд', 'откр': 'Откр'
    };
    
    // 1. Поиск по книге (например "Рим" или "Ин")
    if (bookMap[queryLower]) {
        const bookFull = bookMap[queryLower];
        return allVerses.filter(v => v.ref.startsWith(bookFull + ' '));
    }
    
    // 2. Поиск по книге + главе/стиху (например "Ин 3:16")
    for (const [short, full] of Object.entries(bookMap)) {
        if (queryLower.startsWith(short + ' ')) {
            const rest = queryLower.substring(short.length + 1);
            return allVerses.filter(v => {
                if (!v.ref.startsWith(full + ' ')) return false;
                if (!rest) return true;
                return v.ref.toLowerCase().includes(rest);
            });
        }
    }
    
    // 3. Поиск по номеру главы и стиха (например "3:16")
    const refMatch = normalizedQuery.match(/^(\d+)[:\s]*(\d*)$/);
    if (refMatch) {
        const chapter = parseInt(refMatch[1]);
        const verse = refMatch[2] ? parseInt(refMatch[2]) : null;
        
        return allVerses.filter(v => {
            const vRef = v.ref;
            const chapterPattern = new RegExp(`\\b${chapter}:`);
            if (!chapterPattern.test(vRef)) return false;
            if (verse !== null) {
                return vRef.includes(`:${verse}`) || vRef.includes(`.${verse}`);
            }
            return true;
        });
    }
    
    // 4. Поиск по словам в тексте (с учетом разных окончаний)
    const words = normalizedQuery.split(/\s+/).filter(w => w.length > 0);
    
    // Если это одно слово — ищем его в тексте (как часть слова, но вхождение всего слова)
    if (words.length === 1) {
        const word = words[0].toLowerCase();
        // Ищем слово в тексте (как отдельное слово)
        // Используем пробелы, знаки препинания для границ
        return allVerses.filter(v => {
            const text = v.text.toLowerCase();
            // Проверяем, что слово есть в тексте как отдельное слово
            // Смотрим по пробелам и знакам препинания
            const wordPattern = new RegExp(`(^|\\s|[.,!?;:])${word}(\\s|[.,!?;:]|$)`, 'i');
            return wordPattern.test(text);
        });
    }
    
    // Если несколько слов — все должны быть в тексте
    return allVerses.filter(v => {
        const text = v.text.toLowerCase();
        
        return words.every(word => {
            const wordPattern = new RegExp(`(^|\\s|[.,!?;:])${word}(\\s|[.,!?;:]|$)`, 'i');
            return wordPattern.test(text);
        });
    });
}

function showVerseInfo(ref, onRelatedClick) {
    const verse = verseMap[ref];
    if (!verse) {
        const verseInfo = document.getElementById('verseInfo');
        document.getElementById('verseRef').textContent = ref;
        document.getElementById('verseText').textContent = '❌ Текст стиха не найден';
        document.getElementById('relatedVerses').innerHTML = '';
        verseInfo.style.display = 'block';
        return;
    }

    const verseInfo = document.getElementById('verseInfo');
    document.getElementById('verseRef').textContent = ref;
    document.getElementById('verseText').textContent = verse.text;

    // Получаем ТОЛЬКО исходящие связи (на кого ссылается этот стих)
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