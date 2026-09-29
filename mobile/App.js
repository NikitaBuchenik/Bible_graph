import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000';

const COLORS = {
  bg: '#0a0c10',
  panel: '#0c1018',
  border: '#2a303c',
  text: '#ececec',
  muted: '#78909c',
  accent: '#ffcc80',
  teal: '#4db6ac'
};

export default function App() {
  const { width, height } = useWindowDimensions();
  const [graph, setGraph] = useState(null);
  const [verses, setVerses] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedRef, setSelectedRef] = useState(null);
  const [highlighted, setHighlighted] = useState(new Set());
  const [depth, setDepth] = useState(0);
  const [statsOpen, setStatsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch(API_URL + '/api/graph').then(r => {
        if (!r.ok) throw new Error('Граф не найден');
        return r.json();
      }),
      fetch(API_URL + '/api/verses').then(r => {
        if (!r.ok) throw new Error('Библия не найдена');
        return r.json();
      })
    ])
      .then(([graphData, verseData]) => {
        setGraph(graphData);
        setVerses(verseData);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const verseMap = useMemo(() => {
    const map = new Map();
    verses.forEach(v => map.set(v.ref, v));
    return map;
  }, [verses]);

  const adjacency = useMemo(() => {
    const map = new Map();
    for (const link of graph?.links ?? []) {
      let set = map.get(link.source);
      if (!set) {
        set = new Set();
        map.set(link.source, set);
      }
      set.add(link.target);
    }
    return map;
  }, [graph]);

  const selectedVerse = selectedRef ? verseMap.get(selectedRef) : null;
  const related = selectedRef ? [...(adjacency.get(selectedRef) ?? [])] : [];

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const exact = verses.find(v => v.ref.toLowerCase() === q);
    if (exact) return [exact];

    return verses
      .filter(v =>
        v.ref.toLowerCase().includes(q) ||
        v.text.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [query, verses]);

  const selectVerse = ref => {
    setSelectedRef(ref);
    setDepth(1);

    const ids = new Set([ref]);
    const queue = [ref];
    let head = 0;

    while (head < queue.length) {
      const id = queue[head++];
      if (id !== ref) break;

      for (const next of adjacency.get(id) ?? []) {
        ids.add(next);
      }
    }

    setHighlighted(ids);
  };

  const selectRelated = ref => {
    selectVerse(ref);
    setQuery(ref);
  };

  const clearSelection = () => {
    setSelectedRef(null);
    setHighlighted(new Set());
    setDepth(0);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.muted}>Загрузка Библейского графа…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Ошибка подключения</Text>
        <Text style={styles.muted}>{error}</Text>
        <Text style={styles.muted}>
          Для телефона укажи EXPO_PUBLIC_API_URL с LAN-адресом компьютера.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <GraphView
        graph={graph}
        selectedRef={selectedRef}
        highlighted={highlighted}
        width={width}
        height={height}
        onSelect={selectVerse}
      />

      <View style={styles.searchPanel}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск стиха (например Ин 3:16)"
          placeholderTextColor={COLORS.muted}
          style={styles.search}
          autoCorrect={false}
        />
        {searchResults.length > 0 && (
          <View style={styles.results}>
            {searchResults.map(v => (
              <Pressable
                key={v.ref}
                style={styles.result}
                onPress={() => {
                  setQuery(v.ref);
                  selectVerse(v.ref);
                }}
              >
                <Text style={styles.ref}>{v.ref}</Text>
                <Text style={styles.resultText} numberOfLines={2}>
                  {v.text}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.countBadge}>
        <Text style={styles.count}>{graph?.nodes.length ?? 0} стихов</Text>
      </View>

      <Pressable style={styles.statsButton} onPress={() => setStatsOpen(v => !v)}>
        <Text style={styles.statsButtonText}>{statsOpen ? '×' : '📊'}</Text>
      </Pressable>

      {statsOpen && (
        <View style={styles.statsPanel}>
          <Text style={styles.panelTitle}>Статистика графа</Text>
          <Stat label="Всего стихов" value="31161" />
          <Stat label="Со связями" value="19614" />
          <Stat label="Без связей" value="11547" />
          <Stat label="Всего связей" value="54524" />
          <Stat label="Среднее ссылок на стих" value="1.75" />
          <Text style={styles.sectionTitle}>Самый цитируемый стих</Text>
          <Text style={styles.topVerse}>Пс 77:10 — 209 ссылок</Text>
        </View>
      )}

      {selectedVerse && (
        <View style={styles.verseCard}>
          <Pressable onPress={clearSelection} style={styles.close}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>

          <Text style={styles.ref}>{selectedVerse.ref}</Text>
          <Text style={styles.verseText}>{selectedVerse.text}</Text>

          <Text style={styles.sectionTitle}>Связанные стихи</Text>
          {related.length === 0 ? (
            <Text style={styles.muted}>Нет связанных стихов</Text>
          ) : (
            related.slice(0, 30).map(ref => (
              <Pressable key={ref} onPress={() => selectRelated(ref)}>
                <Text style={styles.related}>{ref}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function GraphView({ graph, selectedRef, highlighted, width, height, onSelect }) {
  const nodes = graph?.nodes ?? [];
  const links = graph?.links ?? [];
  const centerX = width / 2;
  const centerY = height / 2;

  const nodeMap = useMemo(() => {
    const map = new Map();
    for (const node of nodes) map.set(node.id, node);
    return map;
  }, [nodes]);

  const paths = useMemo(() => {
    const linksPath = Skia.PathBuilder.Make();
    for (const link of links) {
      const a = nodeMap.get(link.source);
      const b = nodeMap.get(link.target);
      if (!a || !b) continue;
      linksPath.moveTo(a.x, a.y);
      linksPath.lineTo(b.x, b.y);
    }

    const normalNodes = Skia.PathBuilder.Make();
    const layer1 = Skia.PathBuilder.Make();
    const layer2 = Skia.PathBuilder.Make();
    const layer3 = Skia.PathBuilder.Make();
    const isolated = Skia.PathBuilder.Make();
    const selected = Skia.PathBuilder.Make();
    const highlightedNodes = Skia.PathBuilder.Make();

    for (const node of nodes) {
      const isCenter = node.id === 'Ин 3:16';
      const radius = isCenter ? 24 : node.layer === -1
        ? 3
        : 4 + Math.min(node.links_count || 0, 10);

      if (node.id === selectedRef) {
        selected.addCircle(node.x, node.y, Math.max(radius, 7));
        continue;
      }

      if (highlighted.has(node.id)) {
        highlightedNodes.addCircle(node.x, node.y, Math.max(radius, 5));
        continue;
      }

      if (isCenter) normalNodes.addCircle(node.x, node.y, radius);
      else if (node.layer === -1) isolated.addCircle(node.x, node.y, radius);
      else if (node.layer === 1) layer1.addCircle(node.x, node.y, radius);
      else if (node.layer === 2) layer2.addCircle(node.x, node.y, radius);
      else layer3.addCircle(node.x, node.y, radius);
    }

    return {
      links: linksPath.build(),
      normal: normalNodes.build(),
      layer1: layer1.build(),
      layer2: layer2.build(),
      layer3: layer3.build(),
      isolated: isolated.build(),
      selected: selected.build(),
      highlighted: highlightedNodes.build()
    };
  }, [nodes, links, nodeMap, selectedRef, highlighted]);

  const transformRef = useRef({
    scale: 0.35,
    x: centerX,
    y: centerY
  });
  const [transform, setTransform] = useState(transformRef.current);
  const gestureStart = useRef(null);

  const findNode = (screenX, screenY) => {
    const t = transformRef.current;
    const worldX = (screenX - t.x) / t.scale;
    const worldY = (screenY - t.y) / t.scale;

    let best = null;
    let bestDistance = Math.max(25, 18 / t.scale);

    for (const node of nodes) {
      const dx = node.x - worldX;
      const dy = node.y - worldY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < bestDistance) {
        bestDistance = distance;
        best = node;
      }
    }

    return best;
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,

    onPanResponderGrant: event => {
      const touches = event.nativeEvent.touches;
      gestureStart.current = {
        transform: { ...transformRef.current },
        x: touches[0]?.pageX ?? 0,
        y: touches[0]?.pageY ?? 0,
        distance: touches.length >= 2 ? touchDistance(touches) : null
      };
    },

    onPanResponderMove: event => {
      const touches = event.nativeEvent.touches;
      const start = gestureStart.current;
      if (!start) return;

      let next = { ...start.transform };

      if (touches.length >= 2 && start.distance) {
        const distance = touchDistance(touches);
        const factor = Math.max(0.35, Math.min(2.5, distance / start.distance));
        next.scale = Math.max(0.01, Math.min(2, start.transform.scale * factor));
      } else if (touches.length === 1) {
        next.x = start.transform.x + (touches[0].pageX - start.x);
        next.y = start.transform.y + (touches[0].pageY - start.y);
      }

      transformRef.current = next;
      setTransform(next);
    },

    onPanResponderRelease: event => {
      const start = gestureStart.current;
      const touches = event.nativeEvent.touches;

      if (start && start.distance === null && touches.length === 0) {
        const moved = Math.hypot(
          event.nativeEvent.pageX - start.x,
          event.nativeEvent.pageY - start.y
        );

        if (moved < 12) {
          const node = findNode(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY
          );
          if (node) onSelect(node.id);
        }
      }

      gestureStart.current = null;
    }
  }), [nodes, onSelect, transform]);

  return (
    <Canvas style={StyleSheet.absoluteFill} {...responder.panHandlers}>
      <Group
        transform={[
          { translateX: transform.x },
          { translateY: transform.y },
          { scale: transform.scale }
        ]}
      >
        <Path path={paths.links} style="stroke" strokeWidth={0.8} color="rgba(42,48,60,0.2)" />
        <Path path={paths.isolated} color="#455a64" />
        <Path path={paths.layer1} color="#ffcc80" />
        <Path path={paths.layer2} color="#80cbc4" />
        <Path path={paths.layer3} color="#4db6ac" />
        <Path path={paths.normal} color="#ff6b6b" />
        <Path path={paths.highlighted} color="#ffcc80" />
        <Path path={paths.selected} color="#ffcc80" />
      </Group>
    </Canvas>
  );
}

function touchDistance(touches) {
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  muted: { color: COLORS.muted, fontSize: 13, marginTop: 8 },
  error: { color: '#ef5350', fontSize: 18, marginBottom: 8 },
  searchPanel: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(12,16,24,0.96)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 10,
    zIndex: 20
  },
  search: {
    height: 44,
    borderRadius: 9,
    backgroundColor: '#1a2028',
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: 14,
    fontSize: 14
  },
  results: { marginTop: 8, maxHeight: 300 },
  result: {
    padding: 9,
    backgroundColor: '#1a2028',
    borderRadius: 7,
    marginBottom: 4
  },
  ref: { color: COLORS.accent, fontWeight: '700', fontSize: 14 },
  resultText: { color: '#cfd8dc', fontSize: 12, marginTop: 3 },
  countBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(12,16,24,0.85)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  count: { color: COLORS.text, fontSize: 11, fontWeight: '600' },
  statsButton: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -28,
    width: 46,
    height: 56,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    backgroundColor: 'rgba(12,16,24,0.92)',
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statsButtonText: { color: COLORS.accent, fontSize: 22 },
  statsPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 330,
    backgroundColor: 'rgba(12,16,24,0.98)',
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    padding: 22,
    zIndex: 30
  },
  panelTitle: {
    color: COLORS.accent,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 18
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#202630'
  },
  statValue: { color: COLORS.text, fontWeight: '600' },
  sectionTitle: {
    color: COLORS.muted,
    fontSize: 12,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8
  },
  topVerse: { color: COLORS.accent, fontSize: 13 },
  verseCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: 300,
    backgroundColor: 'rgba(12,16,24,0.97)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    zIndex: 25
  },
  close: { position: 'absolute', right: 12, top: 8, padding: 4 },
  closeText: { color: COLORS.muted, fontSize: 22 },
  verseText: { color: COLORS.text, fontSize: 15, lineHeight: 23, marginTop: 8 },
  related: { color: '#b0bec5', fontSize: 13, paddingVertical: 4 }
});
