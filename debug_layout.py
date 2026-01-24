#!/usr/bin/env python3
import requests
import json

# Fetch data
resp = requests.get('http://localhost:8991/api/tree/data')
data = resp.json()

print('=== MARRIAGES ===')
for m in data.get('marriages', []):
    print(f"Marriage {m['id']}: person1={m['person1_id']}, person2={m['person2_id']}")

print()
print('=== NODES ===')
for n in data.get('nodes', []):
    print(f"Person {n['id']}: {n['name']}, parent_family_id={n.get('parent_family_id')}")

print()
print('=== SIMULATING LAYOUT ===')

# Build familyMap
familyMap = {}
for m in data.get('marriages', []):
    familyMap[m['id']] = {'person1_id': m['person1_id'], 'person2_id': m['person2_id'], 'children': []}

# Build parentsOf and childrenOf
parentsOf = {n['id']: [] for n in data['nodes']}
childrenOf = {n['id']: [] for n in data['nodes']}
partnersOf = {n['id']: [] for n in data['nodes']}

# Partners
for m in data.get('marriages', []):
    if m['person1_id'] and m['person2_id']:
        partnersOf[m['person1_id']].append(m['person2_id'])
        partnersOf[m['person2_id']].append(m['person1_id'])

# Parent-child relationships
for n in data['nodes']:
    pfid = n.get('parent_family_id')
    if pfid and pfid in familyMap:
        family = familyMap[pfid]
        parents = [family['person1_id'], family['person2_id']]
        parents = [p for p in parents if p]
        parentsOf[n['id']] = parents
        for pid in parents:
            if n['id'] not in childrenOf[pid]:
                childrenOf[pid].append(n['id'])

print('childrenOf:', childrenOf)
print('parentsOf:', parentsOf)

# Find root
def find_root(pid, visited=None):
    if visited is None:
        visited = set()
    if pid in visited:
        return pid
    visited.add(pid)
    parents = parentsOf.get(pid, [])
    if not parents:
        return pid
    return find_root(parents[0], visited)

root_id = find_root(1)
print(f'root_id: {root_id}')

# BFS for generations
generations = {}
visited = set()
queue = [(root_id, 0)]
visited.add(root_id)
generations[root_id] = 0

while queue:
    pid, gen = queue.pop(0)
    # Partners
    for partner in partnersOf.get(pid, []):
        if partner not in visited:
            visited.add(partner)
            generations[partner] = gen
            queue.append((partner, gen))
    # Children
    for child in childrenOf.get(pid, []):
        if child not in visited:
            visited.add(child)
            generations[child] = gen + 1
            queue.append((child, gen + 1))

print('generations:', generations)

# Group by generation
gen_groups = {}
for pid, gen in generations.items():
    if gen not in gen_groups:
        gen_groups[gen] = []
    gen_groups[gen].append(pid)

print('gen_groups:', gen_groups)
