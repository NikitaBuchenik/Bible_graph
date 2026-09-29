import express from 'express';
import cors from 'cors';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type GraphNode = {
  id: string;
  links_count: number;
};

type GraphLink = {
  source: string;
  target: string;
};

type Verse = {
  ref: string;
  text: string;
  bookId: number;
  chapter: number;
  verse: number;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

let graphCache: { nodes: GraphNode[]; links: GraphLink[] } | null = null;
let versesCache: Verse[] | null = null;

const bookNames: Record<number, string> = {
  1:'Быт',2:'Исх',3:'Лев',4:'Чис',5:'Втор',6:'Нав',7:'Суд',8:'Руф',
  9:'1Цар',10:'2Цар',11:'3Цар',12:'4Цар',13:'1Пар',14:'2Пар',15:'Езд',
  16:'Неем',17:'Есф',18:'Иов',19:'Пс',20:'Прит',21:'Еккл',22:'Песн',
  23:'Ис',24:'Иер',25:'Плач',26:'Иез',27:'Дан',28:'Ос',29:'Иоил',
  30:'Ам',31:'Авд',32:'Ион',33:'Мих',34:'Наум',35:'Авв',36:'Соф',
  37:'Агг',38:'Зах',39:'Мал',40:'Мф',41:'Мк',42:'Лк',43:'Ин',
  44:'Деян',45:'Рим',46:'1Кор',47:'2Кор',48:'Гал',49:'Еф',50:'Флп',
  51:'Кол',52:'1Фес',53:'2Фес',54:'1Тим',55:'2Тим',56:'Тит',57:'Флм',
  58:'Евр',59:'Иак',60:'1Пет',61:'2Пет',62:'1Ин',63:'2Ин',64:'3Ин',
  65:'Иуд',66:'Откр'
};

async function loadGraph() {
  if (graphCache) return graphCache;

  const raw = JSON.parse(
    await readFile(path.join(root, 'bible_gece_graph.json'), 'utf8')
  ) as Record<string, string[]>;

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const linkSet = new Set<string>();

  for (const [id, targets] of Object.entries(raw)) {
    nodes.push({ id, links_count: targets?.length ?? 0 });

    for (const target of targets ?? []) {
      if (raw[target] === undefined) continue;
      const key = id + '→' + target;
      if (linkSet.has(key)) continue;
      linkSet.add(key);
      links.push({ source: id, target });
    }
  }

  graphCache = { nodes, links };
  return graphCache;
}

async function loadVerses() {
  if (versesCache) return versesCache;

  const raw = JSON.parse(
    await readFile(path.join(root, 'rst_fixed.json'), 'utf8')
  ) as {
    Books: Array<{
      BookId: number;
      Chapters: Array<{
        ChapterId: number;
        Verses: Array<{ VerseId: number; Text: string }>;
      }>;
    }>;
  };

  const verses: Verse[] = [];

  for (const book of raw.Books) {
    const bookName = bookNames[book.BookId] ?? `Кн.${book.BookId}`;
    for (const chapter of book.Chapters) {
      for (const verse of chapter.Verses) {
        verses.push({
          ref: `${bookName} ${chapter.ChapterId}:${verse.VerseId}`,
          text: verse.Text,
          bookId: book.BookId,
          chapter: chapter.ChapterId,
          verse: verse.VerseId
        });
      }
    }
  }

  versesCache = verses;
  return verses;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/graph', async (_req, res) => {
  try {
    res.json(await loadGraph());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Не удалось загрузить граф' });
  }
});

app.get('/api/verses', async (_req, res) => {
  try {
    res.json(await loadVerses());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Не удалось загрузить Библию' });
  }
});

app.get('/api/verse/:ref', async (req, res) => {
  try {
    const verses = await loadVerses();
    const verse = verses.find(v => v.ref.toLowerCase() === req.params.ref.toLowerCase());

    if (!verse) {
      res.status(404).json({ error: 'Стих не найден' });
      return;
    }

    const graph = await loadGraph();
    const related = graph.links
      .filter(link => link.source === verse.ref)
      .map(link => link.target);

    res.json({ ...verse, related });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

const port = Number(process.env.PORT ?? 3000);

app.listen(port, '0.0.0.0', () => {
  console.log(`Bible Graph API: http://0.0.0.0:${port}`);
});
