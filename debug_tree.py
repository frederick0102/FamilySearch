#!/usr/bin/env python3
"""
Családfa debug script - ASCII vizualizáció az adatbázisból
Használat: python debug_tree.py [adatbázis_útvonal]
"""

import sqlite3
import sys
from pathlib import Path

def get_db_path():
    """Adatbázis útvonal meghatározása"""
    if len(sys.argv) > 1:
        return sys.argv[1]
    
    # Alapértelmezett útvonalak
    paths = [
        Path(__file__).parent / "data" / "familytree.db",
        Path(__file__).parent / "familytree.db",
        Path.home() / "familySearch" / "data" / "familytree.db",
    ]
    
    for p in paths:
        if p.exists():
            return str(p)
    
    print("❌ Nem található adatbázis!")
    print("Használat: python debug_tree.py <adatbázis_útvonal>")
    sys.exit(1)

def load_data(db_path):
    """Adatok betöltése az adatbázisból"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Személyek
    cursor.execute("""
        SELECT id, first_name, last_name, gender, birth_date, death_date, 
               father_id, mother_id 
        FROM persons
    """)
    persons = {row['id']: dict(row) for row in cursor.fetchall()}
    
    # Házasságok
    cursor.execute("""
        SELECT person1_id, person2_id, relationship_type, start_date, end_date, end_reason
        FROM marriages
    """)
    marriages = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    return persons, marriages

def print_person(p, indent=0):
    """Személy kiírása"""
    prefix = "  " * indent
    gender_icon = "👨" if p['gender'] == 'male' else "👩" if p['gender'] == 'female' else "👤"
    alive = "✝" if p['death_date'] else ""
    name = f"{p['first_name']} {p['last_name']}"
    dates = ""
    if p['birth_date']:
        dates = f" ({p['birth_date'][:4]}"
        if p['death_date']:
            dates += f"-{p['death_date'][:4]}"
        dates += ")"
    return f"{prefix}{gender_icon} [{p['id']}] {name}{dates}{alive}"

def build_ascii_tree(persons, marriages):
    """ASCII családfa építése"""
    
    print("\n" + "="*60)
    print("📊 ADATBÁZIS TARTALOM")
    print("="*60)
    
    # Személyek listázása
    print("\n👥 SZEMÉLYEK:")
    print("-"*40)
    for pid, p in sorted(persons.items()):
        parent_info = ""
        if p['father_id'] or p['mother_id']:
            father = persons.get(p['father_id'], {}).get('first_name', '?') if p['father_id'] else '-'
            mother = persons.get(p['mother_id'], {}).get('first_name', '?') if p['mother_id'] else '-'
            parent_info = f"  [apa: {father}, anya: {mother}]"
        print(f"{print_person(p)}{parent_info}")
    
    # Házasságok listázása
    print("\n💒 HÁZASSÁGOK:")
    print("-"*40)
    for m in marriages:
        p1 = persons.get(m['person1_id'], {})
        p2 = persons.get(m['person2_id'], {})
        p1_name = f"{p1.get('first_name', '?')} {p1.get('last_name', '?')}"
        p2_name = f"{p2.get('first_name', '?')} {p2.get('last_name', '?')}"
        status = ""
        if m['end_reason']:
            status = f" ({m['end_reason']})"
        print(f"  [{m['person1_id']}] {p1_name} ❤️ [{m['person2_id']}] {p2_name}{status}")
    
    # Szülő-gyerek kapcsolatok
    print("\n👨‍👩‍👧 SZÜLŐ-GYEREK KAPCSOLATOK:")
    print("-"*40)
    
    # Szülőpárok összegyűjtése
    parent_pairs = {}  # (father_id, mother_id) -> [children]
    single_parents = {}  # parent_id -> [children]
    
    for pid, p in persons.items():
        if p['father_id'] and p['mother_id']:
            key = (p['father_id'], p['mother_id'])
            if key not in parent_pairs:
                parent_pairs[key] = []
            parent_pairs[key].append(p)
        elif p['father_id']:
            if p['father_id'] not in single_parents:
                single_parents[p['father_id']] = []
            single_parents[p['father_id']].append(p)
        elif p['mother_id']:
            if p['mother_id'] not in single_parents:
                single_parents[p['mother_id']] = []
            single_parents[p['mother_id']].append(p)
    
    for (fid, mid), children in parent_pairs.items():
        father = persons.get(fid, {})
        mother = persons.get(mid, {})
        f_name = f"{father.get('first_name', '?')} {father.get('last_name', '?')}"
        m_name = f"{mother.get('first_name', '?')} {mother.get('last_name', '?')}"
        print(f"\n  [{fid}] {f_name} + [{mid}] {m_name}")
        print(f"  {'─'*30}┬{'─'*10}")
        for child in children:
            c_name = f"{child['first_name']} {child['last_name']}"
            print(f"  {'':30}└─ [{child['id']}] {c_name}")
    
    for parent_id, children in single_parents.items():
        parent = persons.get(parent_id, {})
        p_name = f"{parent.get('first_name', '?')} {parent.get('last_name', '?')}"
        print(f"\n  [{parent_id}] {p_name} (egyedüli szülő)")
        for child in children:
            c_name = f"{child['first_name']} {child['last_name']}"
            print(f"  └─ [{child['id']}] {c_name}")
    
    # Elvárt megjelenítés
    print("\n" + "="*60)
    print("🎯 ELVÁRT CSALÁDFA MEGJELENÍTÉS:")
    print("="*60)
    
    # Házasság nélküli partnerek (akiknek nincs közös gyerekük)
    marriage_set = set()
    for m in marriages:
        marriage_set.add((min(m['person1_id'], m['person2_id']), max(m['person1_id'], m['person2_id'])))
    
    parent_pair_set = set()
    for (fid, mid) in parent_pairs.keys():
        parent_pair_set.add((min(fid, mid), max(fid, mid)))
    
    marriage_only = marriage_set - parent_pair_set
    
    print("\n")
    for (fid, mid), children in parent_pairs.items():
        father = persons.get(fid, {})
        mother = persons.get(mid, {})
        f_name = f"{father.get('first_name', '?')}"
        m_name = f"{mother.get('first_name', '?')}"
        
        # Van-e olyan házasság, ahol az egyik szülőnek másik partnere is van?
        other_partners = []
        for (p1, p2) in marriage_only:
            if p1 == fid or p2 == fid:
                other_id = p2 if p1 == fid else p1
                other = persons.get(other_id, {})
                other_partners.append(f"[{other_id}] {other.get('first_name', '?')} (apa másik partnere)")
            if p1 == mid or p2 == mid:
                other_id = p2 if p1 == mid else p1
                other = persons.get(other_id, {})
                other_partners.append(f"[{other_id}] {other.get('first_name', '?')} (anya másik partnere)")
        
        # Kirajzolás
        if other_partners:
            for op in other_partners:
                print(f"  {op}")
                print(f"       │")
                print(f"       ❤️")
                print(f"       │")
        
        # Fő szülőpár
        line_len = len(f_name) + len(m_name) + 10
        print(f"  [{fid}] {f_name} ───❤️─── [{mid}] {m_name}")
        mid_pos = (len(f_name) + 15) // 2
        print(f"  {' ' * mid_pos}│")
        
        for i, child in enumerate(children):
            c_name = f"{child['first_name']}"
            connector = "└" if i == len(children) - 1 else "├"
            print(f"  {' ' * mid_pos}{connector}── [{child['id']}] {c_name}")
    
    print("\n" + "="*60)

def main():
    db_path = get_db_path()
    print(f"📂 Adatbázis: {db_path}")
    
    persons, marriages = load_data(db_path)
    
    if not persons:
        print("❌ Nincsenek személyek az adatbázisban!")
        return
    
    build_ascii_tree(persons, marriages)

if __name__ == "__main__":
    main()
