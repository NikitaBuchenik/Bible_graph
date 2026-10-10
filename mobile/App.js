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
  const [searchMode, setSearchMode] = useState(false);
  const [searchRefs, setSearchRefs] = useState(new Set());
  const [focusRequest, setFocusRequest] = useState(null);
  const focusSequence = useRef(0);
  const clickState = useRef({ ref: null, count: 0 });
  const [statsOpen, setStatsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    // Fetch both resources in parallel, but don't make the graph wait for
    // the entire Bible text. The graph is the expensive first screen; show it
    // as soon as its response is ready and let search data arrive afterwards.
    fetch(API_URL + '/api/verses')
      .then(r => {
        if (!r.ok) throw new Error('Библия не найдена');
        return r.json();
      })
      .then(verseData => {
        if (active) setVerses(verseData);
      })
      .catch(err => {
        // Keep the graph usable if only the search/verse endpoint fails.
        console.warn('Не удалось загрузить тексты стихов:', err.message);
      });

    fetch(API_URL + '/api/graph')
      .then(r => {
        if (!r.ok) throw new Error('Граф не найден');
        return r.json();
      })
      .then(graphData => {
        if (active) setGraph(graphData);
      })
      .catch(err => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
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

    return verses.filter(v =>
      v.ref.toLowerCase().includes(q) ||
      v.text.toLowerCase().includes(q)
    );
  }, [query, verses]);

  const selectVerse = ref => {
    setSearchMode(false);

    // Повторное нажатие на тот же стих: 1) прямые связи, 2) все достижимые,
    // 3) сброс — так же, как в рабочей веб-версии.
    if (clickState.current.ref === ref) {
      clickState.current.count += 1;
      if (clickState.current.count === 1) {
        setSelectedRef(ref);
        setDepth(Infinity);
        setHighlighted(getReachable(ref, adjacency));
        return;
      }
      if (clickState.current.count >= 2) {
        clickState.current = { ref: null, count: 0 };
        setSelectedRef(null);
        setHighlighted(new Set());
        setDepth(0);
        return;
      }
    } else {
      clickState.current = { ref, count: 0 };
    }

    setSelectedRef(ref);
    setFocusRequest({ refs: [ref], sequence: ++focusSequence.current });
    setSearchRefs(new Set());
    setDepth(1);
    const ids = new Set([ref]);
    for (const next of adjacency.get(ref) ?? []) ids.add(next);
    setHighlighted(ids);
  };

  const runSearch = () => {
    const refs = searchResults.map(v => v.ref);
    if (!refs.length) {
      setSearchMode(false);
      setSearchRefs(new Set());
      setHighlighted(new Set());
      return;
    }
    const refSet = new Set(refs);
    clickState.current = { ref: null, count: 0 };
    setSelectedRef(null);
    setDepth(0);
    setSearchMode(true);
    setSearchRefs(new Set(refs));
    setFocusRequest({ refs, sequence: ++focusSequence.current });
    // Подсвечиваем только найденные стихи и вершины, до которых можно
    // дойти по направленным связям от результатов поиска.
    const ids = new Set(refs);
    const queue = [...refs];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      for (const next of adjacency.get(current) ?? []) {
        if (!ids.has(next)) {
          ids.add(next);
          queue.push(next);
        }
      }
    }
    setHighlighted(ids);
  };

  const selectRelated = ref => {
    clickState.current = { ref: null, count: 0 };
    selectVerse(ref);
    setQuery(ref);
  };

  const clearSelection = () => {
    clickState.current = { ref: null, count: 0 };
    setSelectedRef(null);
    setHighlighted(new Set());
    setDepth(0);
    setSearchMode(false);
    setSearchRefs(new Set());
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
        searchMode={searchMode}
        searchRefs={searchRefs}
        focusRequest={focusRequest}
        width={width}
        height={height}
        onSelect={selectVerse}
      />

      <View style={[styles.searchPanel, { top: 62 }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск стиха (например Ин 3:16)"
          placeholderTextColor={COLORS.muted}
          style={styles.search}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={runSearch}
        />
        <Pressable style={styles.searchButton} onPress={runSearch}>
          <Text style={styles.searchButtonText}>Поиск</Text>
        </Pressable>
        {searchResults.length > 0 && (
          <View style={styles.results}>
            {searchResults.slice(0, 20).map(v => (
              <Pressable
                key={v.ref}
                style={styles.result}
                onPress={() => {
                  setQuery(v.ref);
                  clickState.current = { ref: null, count: 0 };
                  setSearchMode(false);
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

      <Pressable
        style={[styles.statsButton, statsOpen && styles.statsButtonOpen]}
        onPress={() => setStatsOpen(v => !v)}
      >
        <Text style={styles.statsButtonText}>{statsOpen ? '×' : '📊'}</Text>
      </Pressable>

      {statsOpen && (
        <View style={styles.statsPanel}>
          <Pressable style={styles.statsClose} onPress={() => setStatsOpen(false)}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
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

function getReachable(start, adjacency) {
  const visited = new Set([start]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

function GraphView({ graph, selectedRef, highlighted, searchMode, searchRefs, focusRequest, width, height, onSelect }) {
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
    const highlightedLinksPath = Skia.PathBuilder.Make();
    for (const link of links) {
      const a = nodeMap.get(link.source);
      const b = nodeMap.get(link.target);
      if (!a || !b) continue;
      const isHighlighted = searchMode
        ? highlighted.has(link.source) && highlighted.has(link.target)
        : selectedRef && highlighted.has(link.source) && highlighted.has(link.target);
      const path = isHighlighted ? highlightedLinksPath : linksPath;
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
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
      highlightedLinks: highlightedLinksPath.build(),
      normal: normalNodes.build(),
      layer1: layer1.build(),
      layer2: layer2.build(),
      layer3: layer3.build(),
      isolated: isolated.build(),
      selected: selected.build(),
      highlighted: highlightedNodes.build()
    };
  }, [nodes, links, nodeMap, selectedRef, highlighted, searchMode, searchRefs]);

  const transformRef = useRef({
    scale: 0.35,
    x: centerX,
    y: centerY
  });
  const [transform, setTransform] = useState(transformRef.current);
  const gestureStart = useRef(null);
  const pinchStart = useRef(null);
  const animationFrame = useRef(null);
  const bounds = useMemo(() => {
    if (!nodes.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }
    return { minX, maxX, minY, maxY };
  }, [nodes]);

  const clampTransform = (value) => {
    const scale = Math.max(0.008, Math.min(3, value.scale));
    const left = -bounds.minX * scale + 36;
    const right = width - bounds.maxX * scale - 36;
    const top = -bounds.minY * scale + 80;
    const bottom = height - bounds.maxY * scale - 80;
    const clampAxis = (v, low, high, center) => low > high ? center : Math.max(low, Math.min(high, v));
    return {
      scale,
      x: clampAxis(value.x, right, left, width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale),
      y: clampAxis(value.y, bottom, top, height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale)
    };
  };

  useEffect(() => {
    if (!focusRequest?.refs?.length || !nodes.length || width <= 0 || height <= 0) return;
    // Iterate rather than spreading into Math.min/max: text searches can return
    // thousands of refs and exceed the JS argument limit.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let count = 0;
    for (const ref of focusRequest.refs) {
      const n = nodeMap.get(ref);
      if (!n) continue;
      count++;
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    }
    if (!count) return;

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const spanX = Math.max(180, maxX - minX + 140);
    const spanY = Math.max(180, maxY - minY + 200);
    const availableWidth = Math.max(140, width - 56);
    const availableHeight = Math.max(180, height - 230);
    // No hard minimum: if a query matches many distant verses, fit every match.
    const targetScale = Math.min(0.9, availableWidth / spanX, availableHeight / spanY);
    const target = clampTransform({
      scale: targetScale,
      x: width / 2 - midX * targetScale,
      y: height / 2 - midY * targetScale
    });
    const start = { ...transformRef.current };
    const zoomOutScale = Math.max(0.008, Math.min(start.scale, target.scale, 0.07));
    const zoomOut = {
      scale: zoomOutScale,
      x: width / 2 - midX * zoomOutScale,
      y: height / 2 - midY * zoomOutScale
    };
    const startedAt = Date.now();
    const duration = 1550;

    if (animationFrame.current != null) cancelAnimationFrame(animationFrame.current);
    const ease = t => t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const animate = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      let next;
      if (progress < 0.34) {
        const t = ease(progress / 0.34);
        next = {
          scale: start.scale + (zoomOut.scale - start.scale) * t,
          x: start.x + (zoomOut.x - start.x) * t,
          y: start.y + (zoomOut.y - start.y) * t
        };
      } else if (progress < 0.68) {
        const t = ease((progress - 0.34) / 0.34);
        next = {
          scale: zoomOut.scale,
          x: zoomOut.x + (target.x - zoomOut.x) * t,
          y: zoomOut.y + (target.y - zoomOut.y) * t
        };
      } else {
        const t = ease((progress - 0.68) / 0.32);
        next = {
          scale: zoomOut.scale + (target.scale - zoomOut.scale) * t,
          x: zoomOut.x + (target.x - zoomOut.x) * t,
          y: zoomOut.y + (target.y - zoomOut.y) * t
        };
      }
      next = clampTransform(next);
      transformRef.current = next;
      setTransform(next);
      if (progress < 1) animationFrame.current = requestAnimationFrame(animate);
      else animationFrame.current = null;
    };
    animationFrame.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrame.current != null) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    };
  }, [focusRequest, nodes, nodeMap, width, height, bounds]);

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

      if (touches.length >= 2) {
        const distance = touchDistance(touches);
        const midpoint = touchMidpoint(touches);
        if (!pinchStart.current) {
          const current = transformRef.current;
          pinchStart.current = {
            distance,
            scale: current.scale,
            worldX: (midpoint.x - current.x) / current.scale,
            worldY: (midpoint.y - current.y) / current.scale
          };
        }
        const factor = distance / Math.max(1, pinchStart.current.distance);
        const scale = Math.max(0.008, Math.min(3, pinchStart.current.scale * factor));
        next = clampTransform({
          scale,
          x: midpoint.x - pinchStart.current.worldX * scale,
          y: midpoint.y - pinchStart.current.worldY * scale
        });
      } else if (touches.length === 1) {
        pinchStart.current = null;
        next.x = start.transform.x + (touches[0].pageX - start.x);
        next.y = start.transform.y + (touches[0].pageY - start.y);
        next = clampTransform(next);
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
      pinchStart.current = null;
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
        <Path path={paths.highlightedLinks} style="stroke" strokeWidth={searchMode ? 1.8 : 2.2} color="#ffcc80" />
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

function touchMidpoint(touches) {
  const a = touches[0];
  const b = touches[1];
  return { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 };
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
  searchButton: {
    marginTop: 7,
    height: 36,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  searchButtonText: { color: '#171717', fontSize: 14, fontWeight: '700' },
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
    zIndex: 40,
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
  statsButtonOpen: { backgroundColor: '#202630' },
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
    paddingTop: 58,
    zIndex: 30
  },
  statsClose: {
    position: 'absolute',
    right: 14,
    top: 12,
    zIndex: 2,
    padding: 8,
    backgroundColor: '#1a2028',
    borderRadius: 20
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
