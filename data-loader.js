// data-loader.js
let allVerses = [];
let verseMap = {};
let graphData = null;

function getBookName(bookId) {
    const names = {
        1: 'Быт', 2: 'Исх', 3: 'Лев', 4: 'Чис', 5: 'Втор',
        6: 'Нав', 7: 'Суд', 8: 'Руф', 9: '1Цар', 10: '2Цар',
        11: '3Цар', 12: '4Цар', 13: '1Пар', 14: '2Пар', 15: 'Езд',
        16: 'Неем', 17: 'Есф', 18: 'Иов', 19: 'Пс', 20: 'Прит',
        21: 'Еккл', 22: 'Песн', 23: 'Ис', 24: 'Иер', 25: 'Плач',
        26: 'Иез', 27: 'Дан', 28: 'Ос', 29: 'Иоил', 30: 'Ам',
        31: 'Авд', 32: 'Ион', 33: 'Мих', 34: 'Наум', 35: 'Авв',
        36: 'Соф', 37: 'Агг', 38: 'Зах', 39: 'Мал',
        40: 'Мф', 41: 'Мк', 42: 'Лк', 43: 'Ин', 44: 'Деян',
        45: 'Рим', 46: '1Кор', 47: '2Кор', 48: 'Гал', 49: 'Еф',
        50: 'Флп', 51: 'Кол', 52: '1Фес', 53: '2Фес', 54: '1Тим',
        55: '2Тим', 56: 'Тит', 57: 'Флм', 58: 'Евр', 59: 'Иак',
        60: '1Пет', 61: '2Пет', 62: '1Ин', 63: '2Ин', 64: '3Ин',
        65: 'Иуд', 66: 'Откр'
    };
    return names[bookId] || `Кн.${bookId}`;
}

async function loadData() {
    try {
        const graphResponse = await fetch('bible_gece_graph.json');
        if (!graphResponse.ok) throw new Error('Граф не найден');
        const graphDataRaw = await graphResponse.json();

        const rstResponse = await fetch('rst.json');
        if (!rstResponse.ok) throw new Error('RST не найден');
        const rstData = await rstResponse.json();

        allVerses = [];
        verseMap = {};
        rstData.Books.forEach(book => {
            const bookName = getBookName(book.BookId);
            book.Chapters.forEach(chapter => {
                chapter.Verses.forEach(verse => {
                    const ref = `${bookName} ${chapter.ChapterId}:${verse.VerseId}`;
                    allVerses.push({
                        ref: ref,
                        text: verse.Text,
                        bookId: book.BookId,
                        chapter: chapter.ChapterId,
                        verse: verse.VerseId
                    });
                    verseMap[ref] = {
                        text: verse.Text,
                        bookId: book.BookId,
                        chapter: chapter.ChapterId,
                        verse: verse.VerseId
                    };
                });
            });
        });

        const nodes = [];
        const links = [];
        const linkSet = new Set();
        
        for (const nodeId of Object.keys(graphDataRaw)) {
            nodes.push({
                id: nodeId,
                links_count: graphDataRaw[nodeId] ? graphDataRaw[nodeId].length : 0
            });
            
            if (graphDataRaw[nodeId] && graphDataRaw[nodeId].length > 0) {
                for (const targetId of graphDataRaw[nodeId]) {
                    if (graphDataRaw[targetId] !== undefined) {
                        const key = nodeId + '→' + targetId;
                        if (!linkSet.has(key)) {
                            linkSet.add(key);
                            links.push({
                                source: nodeId,
                                target: targetId
                            });
                        }
                    }
                }
            }
        }

        graphData = { nodes, links };
        return graphData;

    } catch (err) {
        throw err;
    }
}