import json
import os
import gzip
import networkx as nx
import time
import sys
from datetime import datetime

def log_progress(current, total, message=""):
    percent = (current / total) * 100 if total else 0
    sys.stdout.write(f'\r[{int(percent)}%] {message}')
    sys.stdout.flush()

def build_full_graph():
    # Ищем файл
    input_file = 'bible_gece_graph.json'
    if not os.path.exists(input_file):
        input_file = 'data/bible_gece_graph.json'
    if not os.path.exists(input_file):
        print("❌ Файл bible_gece_graph.json не найден!")
        return

    print(f"📖 Загрузка {input_file}...")
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    total = len(data)
    print(f"📊 Всего стихов: {total}")
    
    # Фильтруем только те, у которых есть ссылки
    filtered = {k: v for k, v in data.items() if v}
    print(f"📊 Стихов со связями: {len(filtered)}")
    
    # Строим граф
    G = nx.Graph()
    refs = list(filtered.keys())
    ref_set = set(refs)
    
    print("🏗️ Добавление узлов...")
    for i, ref in enumerate(refs):
        G.add_node(ref)
        if i % 1000 == 0:
            log_progress(i, len(refs), "Узлы")
    print()
    
    print("🔗 Добавление ребер...")
    edges = 0
    for i, ref in enumerate(refs):
        for target in filtered[ref]:
            if target in ref_set and target != ref and not G.has_edge(ref, target):
                G.add_edge(ref, target)
                edges += 1
        if i % 500 == 0:
            log_progress(i, len(refs), f"Рёбер: {edges}")
    print()
    
    nodes_count = G.number_of_nodes()
    edges_count = G.number_of_edges()
    print(f"📊 Узлов: {nodes_count}, Рёбер: {edges_count}")
    
    # Layout
    print("🧮 Расчет позиций (spring_layout)...")
    start = time.time()
    try:
        pos = nx.spring_layout(G, k=0.08, iterations=30, seed=42)
        print(f"✅ Расчет за {time.time() - start:.2f} сек")
    except Exception as e:
        print(f"❌ Ошибка layout: {e}")
        print("🔄 Использую случайные позиции...")
        import random
        pos = {node: (random.random()*100, random.random()*100) for node in G.nodes()}
    
    # Формируем данные
    nodes = []
    for ref in G.nodes():
        x, y = pos[ref]
        nodes.append({
            'id': ref,
            'x': float(x * 1000),
            'y': float(y * 1000),
            'links_count': len(filtered.get(ref, []))
        })
    
    links = []
    for u, v in G.edges():
        links.append({'source': u, 'target': v})
    
    result = {
        'nodes': nodes,
        'links': links,
        'total': total,
        'displayed_nodes': len(nodes)
    }
    
    # Сохраняем как JSON
    os.makedirs('data', exist_ok=True)
    json_file = 'data/bible_graph_full.json'
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    # Сжимаем в gzip
    gz_file = 'data/bible_graph_full.json.gz'
    with open(json_file, 'rb') as f_in:
        with gzip.open(gz_file, 'wb', compresslevel=9) as f_out:
            f_out.write(f_in.read())
    
    json_size = os.path.getsize(json_file) / 1024 / 1024
    gz_size = os.path.getsize(gz_file) / 1024 / 1024
    print(f"✅ JSON: {json_size:.2f} MB, GZIP: {gz_size:.2f} MB")
    print(f"💾 Сохранено в {gz_file}")

if __name__ == "__main__":
    print("=" * 60)
    print("📖 ПОСТРОЕНИЕ ПОЛНОГО ГРАФА ВСЕХ СТИХОВ")
    print("=" * 60)
    build_full_graph()