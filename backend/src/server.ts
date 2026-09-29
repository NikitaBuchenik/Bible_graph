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

type PositionedNode = GraphNode & {
  x: number;
  y: number;
  layer: number;
};

function buildPositions(rawNodes: GraphNode[], rawLinks: GraphLink[]): PositionedNode[] {
  const CENTER = 'Ин 3:16';
  const graph = new Map<string, Set<string>>();
  rawNodes.forEach(n => graph.set(n.id, new Set()));
  rawLinks.forEach(l => graph.get(l.source)?.add(l.target));

  const layers = new Map<string, number>();
  const visited = new Set<string>();
  const queue: string[] = [];
  let head = 0;
  let maxLayer = 0;

  if (graph.has(CENTER)) {
    layers.set(CENTER, 0);
    visited.add(CENTER);
    queue.push(CENTER);
  }

  while (head < queue.length) {
    const id = queue[head++];
    const layer = layers.get(id) ?? 0;
    for (const next of graph.get(id) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      layers.set(next, layer + 1);
      maxLayer = Math.max(maxLayer, layer + 1);
      queue.push(next);
    }
  }

  for (const n of rawNodes) {
    if (!visited.has(n.id)) layers.set(n.id, -1);
  }

  const groups = new Map<number, GraphNode[]>();
  for (const n of rawNodes) {
    const layer = layers.get(n.id) ?? -1;
    const group = groups.get(layer) ?? [];
    group.push(n);
    groups.set(layer, group);
  }

  const positioned: PositionedNode[] = [];
  const center = rawNodes.find(n => n.id === CENTER);
  if (center) positioned.push({ ...center, x: 0, y: 0, layer: 0 });

  const radiusStep = 500;
  const sorted = [...groups.keys()].filter(x => x !== 0).sort((a, b) => a - b);

  for (const layer of sorted) {
    const group = groups.get(layer)!;
    let radius = layer === -1
      ? radiusStep * (maxLayer + 5)
      : radiusStep * (layer + 1);

    const minDist = layer === -1 ? 150 : 80;
    if (group.length > 1) {
      radius = Math.max(radius, (group.length * (minDist + 20)) / (2 * Math.PI));
    }

    const step = (2 * Math.PI) / group.length;
    const offset = layer === -1 ? 0.25 : layer * 0.2;

    group.forEach((node, i) => {
      const angle = i * step + offset;
      const jitter = layer === -1 ? ((i * 0.754877666) % 1 - 0.5) * 200 : ((i * 0.618033988) % 1 - 0.5) * 60;
      positioned.push({
        ...node,
        x: Math.cos(angle) * (radius + jitter),
        y: Math.sin(angle) * (radius + jitter),
        layer
      });
    });
  }

  // Same five collision passes as the original layout, but only compare
  // nodes that can actually be within 150 world units of each other.
  const index = new Map(positioned.map((n, i) => [n.id, i]));
  const cellSize = 150;

  for (let pass = 0; pass < 5; pass++) {
    const grid = new Map<string, PositionedNode[]>();
    for (const node of positioned) {
      const key = `${Math.floor(node.x / cellSize)},${Math.floor(node.y / cellSize)}`;
      const bucket = grid.get(key) ?? [];
      bucket.push(node);
      grid.set(key, bucket);
    }

    for (let i = 0; i < positioned.length; i++) {
      const a = positioned[i];
      const cx = Math.floor(a.x / cellSize);
      const cy = Math.floor(a.y / cellSize);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get(`${cx + dx},${cy + dy}`);
          if (!bucket) continue;

          for (const b of bucket) {
            if ((index.get(b.id) ?? -1) <= i) continue;
            const minDist = a.layer === -1 || b.layer === -1 ? 150 : 80;
            const vx = a.x - b.x;
            const vy = a.y - b.y;
            const distSq = vx * vx + vy * vy;
            if (distSq === 0 || distSq >= minDist * minDist) continue;

            const dist = Math.sqrt(distSq);
            const force = (minDist - dist) / 2;
            a.x += (vx / dist) * force;
            a.y += (vy / dist) * force;
            b.x -= (vx / dist) * force;
            b.y -= (vy / dist) * force;
          }
        }
      }
    }
  }

  return positioned;
}

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

  graphCache = { nodes: buildPositions(nodes, links), links };
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
