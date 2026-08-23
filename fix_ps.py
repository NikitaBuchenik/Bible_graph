import json
import re

def fix_psalms(rst_file_path, output_file_path):
    # Загружаем файл
    with open(rst_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Находим книгу Псалмов
    psalms_book = None
    for book in data['Books']:
        if book.get('BookName') == 'Пс.' or book.get('BookId') == 19:
            psalms_book = book
            break
    
    if not psalms_book:
        print("Книга Псалмов не найдена!")
        return
    
    # Собираем все стихи в один словарь: {глава: {стих: текст}}
    all_verses = {}
    
    for chapter in psalms_book['Chapters']:
        chapter_id = chapter['ChapterId']
        verses = chapter['Verses']
        
        for verse in verses:
            text = verse['Text']
            verse_id = verse['VerseId']
            
            # Ищем ссылку на другой стих в скобках
            # Например: (17:1) или (9:22)
            match = re.match(r'^\((\d+):(\d+)\)\s*(.*)$', text)
            
            if match:
                target_chapter = int(match.group(1))
                target_verse = int(match.group(2))
                clean_text = match.group(3).strip()
                
                # Если это 10-я глава со ссылками на 9-ю — переносим в 9-ю
                # Если это 11-я со ссылками на 10-ю — переносим в 10-ю и т.д.
                if target_chapter != chapter_id:
                    # Переносим в целевую главу
                    if target_chapter not in all_verses:
                        all_verses[target_chapter] = {}
                    if clean_text:
                        all_verses[target_chapter][target_verse] = clean_text
                else:
                    # Оставляем в текущей главе
                    if chapter_id not in all_verses:
                        all_verses[chapter_id] = {}
                    if clean_text:
                        all_verses[chapter_id][target_verse] = clean_text
            else:
                # Текст без скобок в начале
                # Проверяем, есть ли внутри текста скобки с номером
                inner_match = re.search(r'\((\d+):(\d+)\)', text)
                if inner_match:
                    target_chapter = int(inner_match.group(1))
                    target_verse = int(inner_match.group(2))
                    
                    # Разделяем текст на части
                    parts = re.split(r'\(\d+:\d+\)\s*', text)
                    
                    # Первая часть — заголовок для текущего стиха
                    if parts[0].strip():
                        if chapter_id not in all_verses:
                            all_verses[chapter_id] = {}
                        all_verses[chapter_id][verse_id] = parts[0].strip()
                    
                    # Вторая часть — текст для целевого стиха
                    if len(parts) > 1 and parts[1].strip():
                        if target_chapter not in all_verses:
                            all_verses[target_chapter] = {}
                        all_verses[target_chapter][target_verse] = parts[1].strip()
                else:
                    # Обычный текст без скобок
                    if chapter_id not in all_verses:
                        all_verses[chapter_id] = {}
                    all_verses[chapter_id][verse_id] = text
    
    # Создаём новые главы
    new_chapters = []
    for chapter_id in sorted(all_verses.keys()):
        verses_dict = all_verses[chapter_id]
        sorted_verses = sorted(verses_dict.items())
        
        new_chapter = {
            'ChapterId': chapter_id,
            'Verses': []
        }
        
        for verse_num, verse_text in sorted_verses:
            new_chapter['Verses'].append({
                'VerseId': verse_num,
                'Text': verse_text
            })
        
        new_chapters.append(new_chapter)
    
    # Обновляем книгу Псалмов
    psalms_book['Chapters'] = new_chapters
    
    # Сохраняем результат
    with open(output_file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    
    print(f"✅ Файл исправлен! Сохранён как {output_file_path}")
    print(f"📊 Всего глав: {len(new_chapters)}")
    
    # Выводим информацию о том, что изменилось
    print("\n🔍 Изменения:")
    for ch in new_chapters[:5]:
        print(f"  Глава {ch['ChapterId']}: {len(ch['Verses'])} стихов")

# Использование
fix_psalms('rst.json', 'rst_fixed.json')