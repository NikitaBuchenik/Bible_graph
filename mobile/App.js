import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  Line,
  Paint,
  useTouchHandler,
  vec
} from '@shopify/react-native-skia';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000';

export default function App() {
  const [graph, setGraph] = useState(null);
  const [verses, setVerses] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch(API_URL + '/api/graph').then(r => r.json()),
      fetch(API_URL + '/api/verses').then(r => r.json())
    ])
      .then(([graphData, verseData]) => {
        setGraph(graphData);
        setVerses(verseData);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return verses
      .filter(v => v.ref.toLowerCase().includes(q) || v.text.toLowerCase().includes(q))
      .slice(0, 10);
  }, [query, verses]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ffcc80" />
        <Text style={styles.muted}>Загрузка Библии…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Ошибка подключения</Text>
        <Text style={styles.muted}>{error}</Text>
        <Text style={styles.muted}>Проверь EXPO_PUBLIC_API_URL.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск стиха, например Ин 3:16"
          placeholderTextColor="#78909c"
          style={styles.search}
        />
        <Text style={styles.count}>{graph?.nodes.length ?? 0} стихов</Text>
      </View>

      <GraphView graph={graph} selected={selected} onSelect={setSelected} />

      {searchResults.length > 0 && (
        <View style={styles.results}>
          {searchResults.map(v => (
            <Pressable key={v.ref} style={styles.result} onPress={() => {
              setSelected(v);
              setQuery(v.ref);
            }}>
              <Text style={styles.ref}>{v.ref}</Text>
              <Text style={styles.resultText} numberOfLines={2}>{v.text}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {selected && (
        <View style={styles.verseCard}>
          <Pressable onPress={() => setSelected(null)} style={styles.close}>
            <Text style={styles.muted}>✕</Text>
          </Pressable>
          <Text style={styles.ref}>{selected.ref}</Text>
          <Text style={styles.verseText}>{selected.text}</Text>
          <Text style={styles.muted}>Связанные стихи будут показаны здесь.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function GraphView({ graph, selected, onSelect }) {
  const width = 1000;
  const height = 1000;

  const nodes = graph?.nodes ?? [];
  const links = graph?.links ?? [];

  const nodeMap = useMemo(() => {
    const map = new Map();
    nodes.forEach((n, i) => {
      const angle = i * 0.015;
      const radius = 80 + Math.sqrt(i + 1) * 25;
      map.set(n.id, {
        ...n,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius
      });
    });
    return map;
  }, [nodes]);

  const touchHandler = useTouchHandler({
    onEnd: event => {
      const x = event.x;
      const y = event.y;
      let nearest = null;
      let distance = 28;

      for (const node of nodeMap.values()) {
        const d = Math.hypot(node.x - x, node.y - y);
        if (d < distance) {
          nearest = node;
          distance = d;
        }
      }

      if (nearest) onSelect({ ref: nearest.id });
    }
  });

  return (
    <Canvas style={StyleSheet.absoluteFill} onTouch={touchHandler}>
      <Paint color="rgba(42,48,60,0.2)" />
      {links.slice(0, 15000).map((link, i) => {
        const a = nodeMap.get(link.source);
        const b = nodeMap.get(link.target);
        if (!a || !b) return null;
        return <Line key={i} p1={vec(a.x, a.y)} p2={vec(b.x, b.y)} color="rgba(42,48,60,0.2)" strokeWidth={1} />;
      })}
      {[...nodeMap.values()].map(node => (
        <Circle
          key={node.id}
          cx={node.x}
          cy={node.y}
          r={node.id === 'Ин 3:16' ? 12 : 4}
          color={node.id === selected?.ref ? '#ffcc80' : '#4db6ac'}
        />
      ))}
    </Canvas>
  );
}
