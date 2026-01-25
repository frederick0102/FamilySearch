from flask import Blueprint, render_template, request, jsonify, current_app, redirect, url_for, session
from werkzeug.utils import secure_filename
from app import db
from app.models import Person, Marriage, Event, Document, TreeSettings, DeletedRecord, AppSettings, BackupLog
from app.auth import (
    login_required, api_login_required, is_authenticated, 
    login_user, logout_user, verify_password, change_password
)
from app.backup import backup_manager, auto_backup_on_change
from sqlalchemy import exists
import os
import json
from datetime import datetime

# Blueprint-ek létrehozása
main_bp = Blueprint('main', __name__)
api_bp = Blueprint('api', __name__)

# Megengedett fájltípusok
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx'}

# Soft delete helper
def not_deleted_filter(model, entity_type):
    return ~exists().where((DeletedRecord.entity_type == entity_type) & (DeletedRecord.entity_id == model.id))

def mark_deleted(entity_type, entity_id):
    # Ha már jelölve, ne duplikáljuk
    existing = DeletedRecord.query.filter_by(entity_type=entity_type, entity_id=entity_id).first()
    if existing:
        return existing
    rec = DeletedRecord(entity_type=entity_type, entity_id=entity_id)
    db.session.add(rec)
    return rec

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ==================== AUTENTIKÁCIÓ ====================

@main_bp.route('/login', methods=['GET', 'POST'])
def login():
    """Bejelentkezési oldal"""
    error = None
    
    if request.method == 'POST':
        password = request.form.get('password', '')
        
        if verify_password(password):
            login_user()
            return redirect(url_for('main.index'))
        else:
            error = 'Hibás jelszó'
    
    # Ha már be van jelentkezve, irányítsuk át
    if is_authenticated():
        return redirect(url_for('main.index'))
    
    return render_template('login.html', error=error)


@main_bp.route('/logout')
def logout():
    """Kijelentkezés"""
    logout_user()
    return redirect(url_for('main.login'))


@api_bp.route('/auth/check', methods=['GET'])
def check_auth():
    """Bejelentkezési állapot ellenőrzése"""
    return jsonify({'authenticated': is_authenticated()})


@api_bp.route('/auth/change-password', methods=['POST'])
@api_login_required
def api_change_password():
    """Jelszó megváltoztatása"""
    data = request.get_json()
    current = data.get('current_password', '')
    new = data.get('new_password', '')
    
    result = change_password(current, new)
    
    if 'error' in result:
        return jsonify(result), 400
    
    return jsonify(result)


# ==================== BACKUP API ====================

@api_bp.route('/backups', methods=['GET'])
@api_login_required
def list_backups():
    """Összes backup listázása"""
    return jsonify(backup_manager.list_backups())


@api_bp.route('/backups', methods=['POST'])
@api_login_required
def create_backup():
    """Új backup létrehozása"""
    data = request.get_json() or {}
    description = data.get('description', 'Manuális mentés')
    
    result = backup_manager.create_backup(trigger='manual', description=description)
    
    if 'error' in result:
        return jsonify(result), 500
    
    return jsonify(result)


@api_bp.route('/backups/<int:backup_id>/restore', methods=['POST'])
@api_login_required
def restore_backup(backup_id):
    """Backup visszaállítása"""
    result = backup_manager.restore_backup(backup_id)
    
    if 'error' in result:
        return jsonify(result), 400
    
    return jsonify(result)


@api_bp.route('/backups/<int:backup_id>', methods=['DELETE'])
@api_login_required
def delete_backup(backup_id):
    """Backup törlése"""
    result = backup_manager.delete_backup(backup_id)
    
    if 'error' in result:
        return jsonify(result), 400
    
    return jsonify(result)


@api_bp.route('/backups/stats', methods=['GET'])
@api_login_required
def backup_stats():
    """Backup statisztikák"""
    return jsonify(backup_manager.get_backup_stats())


# ==================== FŐOLDAL ====================

@main_bp.route('/')
@login_required
def index():
    return render_template('index.html')


# ==================== SZEMÉLYEK API ====================

@api_bp.route('/persons', methods=['GET'])
@api_login_required
def get_persons():
    """Összes személy lekérdezése"""
    persons = Person.query.filter(not_deleted_filter(Person, 'person')).all()
    return jsonify([p.to_dict() for p in persons])


@api_bp.route('/persons/<int:person_id>', methods=['GET'])
def get_person(person_id):
    """Egy személy lekérdezése"""
    person = Person.query.filter(not_deleted_filter(Person, 'person'), Person.id == person_id).first_or_404()
    return jsonify(person.to_dict())


@api_bp.route('/persons', methods=['POST'])
def create_person():
    """Új személy létrehozása
    
    GRÁF-ALAPÚ MODELL: A szülő kapcsolatot a parent_family_id-n keresztül kell beállítani,
    nem a father_id/mother_id mezőkkel. Használd a /families/<id>/children végpontot!
    """
    data = request.get_json()
    
    person = Person(
        first_name=data.get('first_name'),
        middle_name=data.get('middle_name'),
        last_name=data.get('last_name'),
        maiden_name=data.get('maiden_name'),
        nickname=data.get('nickname'),
        gender=data.get('gender', 'unknown'),
        birth_place=data.get('birth_place'),
        birth_country=data.get('birth_country'),
        birth_date_approximate=data.get('birth_date_approximate', False),
        death_place=data.get('death_place'),
        death_country=data.get('death_country'),
        death_date_approximate=data.get('death_date_approximate', False),
        death_date_unknown=data.get('death_date_unknown', False),
        death_cause=data.get('death_cause'),
        burial_place=data.get('burial_place'),
        occupation=data.get('occupation'),
        education=data.get('education'),
        religion=data.get('religion'),
        nationality=data.get('nationality'),
        email=data.get('email'),
        phone=data.get('phone'),
        address=data.get('address'),
        biography=data.get('biography'),
        notes=data.get('notes'),
        # Gráf-alapú mezők
        parent_family_id=data.get('parent_family_id'),
        adoptive_family_id=data.get('adoptive_family_id'),
        is_twin=data.get('is_twin', False),
        birth_order=data.get('birth_order'),
        custom_fields=json.dumps(data.get('custom_fields', {}))
    )
    
    # Dátumok feldolgozása
    if data.get('birth_date'):
        person.birth_date = datetime.strptime(data['birth_date'], '%Y-%m-%d').date()
    if data.get('death_date'):
        person.death_date = datetime.strptime(data['death_date'], '%Y-%m-%d').date()
    
    db.session.add(person)
    db.session.commit()
    
    return jsonify(person.to_dict()), 201


@api_bp.route('/persons/<int:person_id>', methods=['PUT'])
def update_person(person_id):
    """Személy frissítése
    
    GRÁF-ALAPÚ MODELL: A szülő kapcsolatot a parent_family_id-n keresztül kell beállítani.
    Használd a /families/<id>/children végpontot gyerek hozzáadásához!
    """
    person = Person.query.filter(not_deleted_filter(Person, 'person'), Person.id == person_id).first_or_404()
    data = request.get_json()
    
    # Mezők frissítése
    for field in ['first_name', 'middle_name', 'last_name', 'maiden_name', 'nickname',
                  'gender', 'birth_place', 'birth_country', 'birth_date_approximate',
                  'death_place', 'death_country', 'death_date_approximate', 'death_date_unknown', 'death_cause',
                  'burial_place', 'occupation', 'education', 'religion', 'nationality',
                  'email', 'phone', 'address', 'biography', 'notes',
                  'parent_family_id', 'adoptive_family_id', 'is_twin', 'birth_order']:
        if field in data:
            setattr(person, field, data[field])
    
    # Dátumok feldolgozása
    if 'birth_date' in data:
        person.birth_date = datetime.strptime(data['birth_date'], '%Y-%m-%d').date() if data['birth_date'] else None
    if 'death_date' in data:
        person.death_date = datetime.strptime(data['death_date'], '%Y-%m-%d').date() if data['death_date'] else None
    
    # Egyéni mezők
    if 'custom_fields' in data:
        person.custom_fields = json.dumps(data['custom_fields'])
    
    db.session.commit()
    
    return jsonify(person.to_dict())


@api_bp.route('/persons/<int:person_id>', methods=['DELETE'])
def delete_person(person_id):
    """Személy törlése"""
    person = Person.query.get_or_404(person_id)
    mark_deleted('person', person_id)
    db.session.commit()
    return '', 204


@api_bp.route('/persons/<int:person_id>/photo', methods=['POST'])
def upload_photo(person_id):
    """Profilkép feltöltése"""
    person = Person.query.get_or_404(person_id)
    
    if 'photo' not in request.files:
        return jsonify({'error': 'Nincs fájl'}), 400
    
    file = request.files['photo']
    if file.filename == '':
        return jsonify({'error': 'Nincs kiválasztott fájl'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(f"person_{person_id}_{file.filename}")
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        person.photo_path = f'/static/uploads/{filename}'
        db.session.commit()
        
        return jsonify({'photo_path': person.photo_path})
    
    return jsonify({'error': 'Nem megengedett fájltípus'}), 400


# ==================== HÁZASSÁGOK/FAMILIES API ====================
# A Marriage osztály a GEDCOM-szerű Family entitást reprezentálja.
# Az URL-ek /marriages és /families alatt is elérhetők (alias).

@api_bp.route('/marriages', methods=['GET'])
@api_bp.route('/families', methods=['GET'])
def get_marriages():
    """Összes család/házasság lekérdezése"""
    marriages = Marriage.query.filter(not_deleted_filter(Marriage, 'marriage')).all()
    return jsonify([m.to_dict() for m in marriages])


@api_bp.route('/families/<int:family_id>', methods=['GET'])
@api_bp.route('/marriages/<int:family_id>', methods=['GET'])
def get_family(family_id):
    """Egy család/házasság lekérdezése részletekkel"""
    family = Marriage.query.filter(
        not_deleted_filter(Marriage, 'marriage'),
        Marriage.id == family_id
    ).first_or_404()
    
    result = family.to_dict()
    # Gyerekek részletes adatai
    result['children_details'] = [{
        'id': c.id,
        'name': c.full_name,
        'birth_date': c.birth_date.isoformat() if c.birth_date else None,
        'is_twin': c.is_twin,
        'birth_order': c.birth_order
    } for c in family.children]
    return jsonify(result)


@api_bp.route('/marriages', methods=['POST'])
@api_bp.route('/families', methods=['POST'])
def create_marriage():
    """Új család/házasság létrehozása
    
    GEDCOM-stílusú Family: legalább egy partner kell, de mindkettő lehet NULL
    (pl. ismeretlen apa esete). Ha mindkét partner NULL, akkor "virtuális" család.
    """
    data = request.get_json() or {}

    # Partner ID-k (nullable!)
    try:
        person1_id = int(data.get('person1_id')) if data.get('person1_id') else None
        person2_id = int(data.get('person2_id')) if data.get('person2_id') else None
    except (TypeError, ValueError):
        return jsonify({'error': 'Érvénytelen partner azonosító'}), 400

    # Ugyanaz a személy nem lehet mindkét partner
    if person1_id and person2_id and person1_id == person2_id:
        return jsonify({'error': 'A két partner nem lehet azonos személy'}), 400

    # Partner létezés ellenőrzés (ha megadva)
    if person1_id and not Person.query.get(person1_id):
        return jsonify({'error': f'Partner1 (ID: {person1_id}) nem létezik'}), 400
    if person2_id and not Person.query.get(person2_id):
        return jsonify({'error': f'Partner2 (ID: {person2_id}) nem létezik'}), 400

    def parse_date(value):
        if not value:
            return None
        try:
            return datetime.strptime(value, '%Y-%m-%d').date()
        except ValueError:
            return None

    # Status meghatározása
    status = data.get('status', 'active')
    if data.get('end_date') and status == 'active':
        # Ha van end_date de nincs status, akkor az end_reason alapján
        end_reason = data.get('end_reason', '')
        if end_reason == 'divorce':
            status = 'divorced'
        elif end_reason == 'death':
            status = 'widowed'
        elif end_reason:
            status = 'ended'

    marriage = Marriage(
        person1_id=person1_id,
        person2_id=person2_id,
        relationship_type=data.get('relationship_type', 'marriage'),
        status=status,
        marriage_place=data.get('marriage_place'),
        end_reason=data.get('end_reason'),
        notes=data.get('notes'),
        start_date=parse_date(data.get('start_date')),
        end_date=parse_date(data.get('end_date'))
    )

    try:
        db.session.add(marriage)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': 'Házasság mentési hiba', 'details': str(exc)}), 500
    
    return jsonify(marriage.to_dict()), 201


@api_bp.route('/marriages/<int:marriage_id>', methods=['PUT'])
@api_bp.route('/families/<int:marriage_id>', methods=['PUT'])
def update_marriage(marriage_id):
    """Család/házasság frissítése"""
    marriage = Marriage.query.filter(not_deleted_filter(Marriage, 'marriage'), Marriage.id == marriage_id).first_or_404()
    data = request.get_json()
    
    def parse_date(value):
        if not value:
            return None
        try:
            return datetime.strptime(value, '%Y-%m-%d').date()
        except ValueError:
            return None

    # Partner validáció (nullable partnerek támogatása)
    if 'person1_id' in data or 'person2_id' in data:
        try:
            p1 = int(data['person1_id']) if data.get('person1_id') else None
            p2 = int(data['person2_id']) if data.get('person2_id') else None
        except (TypeError, ValueError):
            return jsonify({'error': 'Érvénytelen partner azonosító'}), 400

        if p1 and p2 and p1 == p2:
            return jsonify({'error': 'A két partner nem lehet azonos személy'}), 400
        if p1 and not Person.query.get(p1):
            return jsonify({'error': f'Partner1 (ID: {p1}) nem létezik'}), 400
        if p2 and not Person.query.get(p2):
            return jsonify({'error': f'Partner2 (ID: {p2}) nem létezik'}), 400
        
        if 'person1_id' in data:
            marriage.person1_id = p1
        if 'person2_id' in data:
            marriage.person2_id = p2

    for field in ['relationship_type', 'status', 'marriage_place', 'end_reason', 'notes']:
        if field in data:
            setattr(marriage, field, data[field])
    
    if 'start_date' in data:
        marriage.start_date = parse_date(data['start_date'])
    if 'end_date' in data:
        marriage.end_date = parse_date(data['end_date'])
    
    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': 'Házasság mentési hiba', 'details': str(exc)}), 500
    
    return jsonify(marriage.to_dict())


@api_bp.route('/marriages/<int:marriage_id>', methods=['DELETE'])
@api_bp.route('/families/<int:marriage_id>', methods=['DELETE'])
def delete_marriage(marriage_id):
    """Család/házasság törlése"""
    family = Marriage.query.get_or_404(marriage_id)
    
    # Gyerekek parent_family_id törlése (opcionális: vagy NULL-ra állítjuk)
    children = Person.query.filter_by(parent_family_id=marriage_id).all()
    for child in children:
        child.parent_family_id = None
    
    mark_deleted('marriage', marriage_id)
    db.session.commit()
    return '', 204


# ==================== FAMILY-CHILDREN API ====================
# Gyerekek hozzárendelése családhoz (GEDCOM-stílus)

@api_bp.route('/families/<int:family_id>/children', methods=['GET'])
def get_family_children(family_id):
    """Család gyerekeinek lekérdezése"""
    family = Marriage.query.filter(
        not_deleted_filter(Marriage, 'marriage'),
        Marriage.id == family_id
    ).first_or_404()
    
    children = Person.query.filter(
        not_deleted_filter(Person, 'person'),
        Person.parent_family_id == family_id
    ).order_by(Person.birth_order, Person.birth_date).all()
    
    return jsonify([{
        'id': c.id,
        'name': c.full_name,
        'birth_date': c.birth_date.isoformat() if c.birth_date else None,
        'is_twin': c.is_twin,
        'birth_order': c.birth_order
    } for c in children])


@api_bp.route('/families/<int:family_id>/children', methods=['POST'])
def add_child_to_family(family_id):
    """Gyerek hozzáadása családhoz
    
    Body: { "person_id": 123, "is_twin": false, "birth_order": 1 }
    vagy: { "person_ids": [123, 456], "is_twin": true }  -- ikrek esetén
    """
    family = Marriage.query.filter(
        not_deleted_filter(Marriage, 'marriage'),
        Marriage.id == family_id
    ).first_or_404()
    
    data = request.get_json() or {}
    
    # Több gyerek egyszerre (ikrek)
    person_ids = data.get('person_ids', [])
    if data.get('person_id'):
        person_ids.append(data['person_id'])
    
    if not person_ids:
        return jsonify({'error': 'person_id vagy person_ids kötelező'}), 400
    
    is_twin = data.get('is_twin', False)
    birth_order = data.get('birth_order')
    
    added = []
    for pid in person_ids:
        person = Person.query.filter(
            not_deleted_filter(Person, 'person'),
            Person.id == pid
        ).first()
        if not person:
            continue
        
        person.parent_family_id = family_id
        person.is_twin = is_twin
        if birth_order:
            person.birth_order = birth_order
        
        added.append({'id': person.id, 'name': person.full_name})
    
    db.session.commit()
    return jsonify({'added': added, 'family_id': family_id}), 201


@api_bp.route('/families/<int:family_id>/children/<int:person_id>', methods=['DELETE'])
def remove_child_from_family(family_id, person_id):
    """Gyerek eltávolítása családból (nem törli a személyt!)"""
    person = Person.query.filter(
        not_deleted_filter(Person, 'person'),
        Person.id == person_id,
        Person.parent_family_id == family_id
    ).first_or_404()
    
    person.parent_family_id = None
    person.is_twin = False
    person.birth_order = None
    
    db.session.commit()
    return '', 204


# ==================== ESEMÉNYEK API ====================

@api_bp.route('/events', methods=['GET'])
def get_events():
    """Összes esemény lekérdezése"""
    person_id = request.args.get('person_id')
    if person_id:
        events = Event.query.filter_by(person_id=person_id).filter(not_deleted_filter(Event, 'event')).all()
    else:
        events = Event.query.filter(not_deleted_filter(Event, 'event')).all()
    return jsonify([e.to_dict() for e in events])


@api_bp.route('/events', methods=['POST'])
def create_event():
    """Új esemény létrehozása"""
    data = request.get_json()
    
    event = Event(
        person_id=data.get('person_id'),
        event_type=data.get('event_type'),
        event_place=data.get('event_place'),
        description=data.get('description')
    )
    
    if data.get('event_date'):
        event.event_date = datetime.strptime(data['event_date'], '%Y-%m-%d').date()
    
    db.session.add(event)
    db.session.commit()
    
    return jsonify(event.to_dict()), 201


@api_bp.route('/events/<int:event_id>', methods=['DELETE'])
def delete_event(event_id):
    """Esemény törlése"""
    Event.query.get_or_404(event_id)
    mark_deleted('event', event_id)
    db.session.commit()
    return '', 204


# ==================== DOKUMENTUMOK API ====================

@api_bp.route('/documents', methods=['GET'])
def get_documents():
    """Összes dokumentum lekérdezése"""
    person_id = request.args.get('person_id')
    if person_id:
        documents = Document.query.filter_by(person_id=person_id).filter(not_deleted_filter(Document, 'document')).all()
    else:
        documents = Document.query.filter(not_deleted_filter(Document, 'document')).all()
    return jsonify([d.to_dict() for d in documents])


@api_bp.route('/documents', methods=['POST'])
def upload_document():
    """Dokumentum feltöltése"""
    if 'file' not in request.files:
        return jsonify({'error': 'Nincs fájl'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nincs kiválasztott fájl'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(f"doc_{datetime.now().strftime('%Y%m%d%H%M%S')}_{file.filename}")
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Fájl típus meghatározása
        ext = filename.rsplit('.', 1)[1].lower()
        file_type = 'image' if ext in {'png', 'jpg', 'jpeg', 'gif'} else 'document'
        
        document = Document(
            person_id=request.form.get('person_id'),
            document_type=request.form.get('document_type', 'other'),
            title=request.form.get('title', filename),
            description=request.form.get('description'),
            file_path=f'/static/uploads/{filename}',
            file_type=file_type
        )
        
        db.session.add(document)
        db.session.commit()
        
        return jsonify(document.to_dict()), 201
    
    return jsonify({'error': 'Nem megengedett fájltípus'}), 400


@api_bp.route('/documents/<int:document_id>', methods=['DELETE'])
def delete_document(document_id):
    """Dokumentum törlése"""
    Document.query.get_or_404(document_id)
    mark_deleted('document', document_id)
    db.session.commit()
    return '', 204


# ==================== CSALÁDFA API ====================

@api_bp.route('/tree/data', methods=['GET'])
def get_tree_data():
    """Családfa adatok lekérdezése vizualizációhoz
    
    GEDCOM-stílusú gráf-modell támogatása:
    - nodes: személyek (parent_family_id-vel)
    - links: kapcsolatok (szülő-gyerek, házasság)
    - marriages: család/házasság entitások (Family)
    """
    persons = Person.query.filter(not_deleted_filter(Person, 'person')).all()
    marriages = Marriage.query.filter(not_deleted_filter(Marriage, 'marriage')).all()
    
    nodes = []
    links = []
    
    for person in persons:
        nodes.append({
            'id': person.id,
            'name': person.full_name,
            'display_name': person.display_name,
            'gender': person.gender,
            'birth_date': person.birth_date.isoformat() if person.birth_date else None,
            'death_date': person.death_date.isoformat() if person.death_date else None,
            'birth_place': person.birth_place,
            'occupation': person.occupation,
            'photo': person.photo_path,
            'is_alive': person.is_alive,
            'age': person.age,
            # Gráf-alapú mezők
            'parent_family_id': person.parent_family_id,
            'adoptive_family_id': person.adoptive_family_id,
            'is_twin': person.is_twin,
            'birth_order': person.birth_order
        })
    
    # Házassági kapcsolatok és Family entitások
    person_ids = {p.id for p in persons}
    marriage_list = []
    
    for marriage in marriages:
        # Marriage/Family entitás adatai (GEDCOM-stílusú)
        marriage_list.append({
            'id': marriage.id,
            'person1_id': marriage.person1_id,
            'person2_id': marriage.person2_id,
            'relationship_type': marriage.relationship_type,
            'status': marriage.status,
            'start_date': marriage.start_date.isoformat() if marriage.start_date else None,
            'end_date': marriage.end_date.isoformat() if marriage.end_date else None,
            'end_reason': marriage.end_reason
        })
        
        # Házassági link a vizualizációhoz
        if marriage.person1_id in person_ids and marriage.person2_id in person_ids:
            links.append({
                'source': marriage.person1_id,
                'target': marriage.person2_id,
                'type': 'marriage',
                'marriage_id': marriage.id,
                'status': marriage.status,
                'relationship_type': marriage.relationship_type
            })
    
    return jsonify({
        'nodes': nodes,
        'links': links,
        'marriages': marriage_list
    })


@api_bp.route('/tree/ancestors/<int:person_id>', methods=['GET'])
def get_ancestors(person_id):
    """Ősök lekérdezése (felmenők)"""
    def get_ancestors_recursive(person, depth=0, max_depth=10):
        if not person or depth > max_depth:
            return []
        
        ancestors = [{'person': person.to_dict(), 'depth': depth}]
        
        # GRÁF-ALAPÚ MODELL: szülők a parent_family-n keresztül
        for parent in person.parents:
            ancestors.extend(get_ancestors_recursive(parent, depth + 1, max_depth))
        
        return ancestors
    
    person = Person.query.get_or_404(person_id)
    ancestors = get_ancestors_recursive(person)
    
    return jsonify(ancestors)


@api_bp.route('/tree/descendants/<int:person_id>', methods=['GET'])
def get_descendants(person_id):
    """Leszármazottak lekérdezése"""
    def get_descendants_recursive(person, depth=0, max_depth=10):
        if not person or depth > max_depth:
            return []
        
        descendants = [{'person': person.to_dict(), 'depth': depth}]
        
        for child in person.children:
            descendants.extend(get_descendants_recursive(child, depth + 1, max_depth))
        
        return descendants
    
    person = Person.query.get_or_404(person_id)
    descendants = get_descendants_recursive(person)
    
    return jsonify(descendants)


# ==================== BEÁLLÍTÁSOK API ====================

@api_bp.route('/settings', methods=['GET'])
def get_settings():
    """Beállítások lekérdezése"""
    settings = TreeSettings.query.first()
    if not settings:
        settings = TreeSettings()
        db.session.add(settings)
        db.session.commit()
    
    return jsonify(settings.to_dict())


@api_bp.route('/settings', methods=['PUT'])
def update_settings():
    """Beállítások frissítése"""
    settings = TreeSettings.query.first()
    if not settings:
        settings = TreeSettings()
        db.session.add(settings)
    
    data = request.get_json()
    
    for field in ['name', 'male_color', 'female_color', 'unknown_color', 'deceased_opacity',
                  'line_color', 'line_width', 'marriage_line_style', 'card_width', 'card_height',
                  'card_border_radius', 'show_photos', 'show_dates', 'show_places', 'show_occupation',
                  'background_color', 'background_image', 'font_family', 'font_size']:
        if field in data:
            setattr(settings, field, data[field])
    
    db.session.commit()
    
    return jsonify(settings.to_dict())


# ==================== EXPORT API ====================

@api_bp.route('/export/gedcom', methods=['GET'])
def export_gedcom():
    """Export GEDCOM formátumban (genealógiai standard)"""
    persons = Person.query.filter(not_deleted_filter(Person, 'person')).all()
    marriages = Marriage.query.filter(not_deleted_filter(Marriage, 'marriage')).all()
    
    gedcom = "0 HEAD\n"
    gedcom += "1 SOUR FamilySearch\n"
    gedcom += "1 GEDC\n"
    gedcom += "2 VERS 5.5.1\n"
    gedcom += "1 CHAR UTF-8\n"
    
    # Személyek
    for person in persons:
        gedcom += f"0 @I{person.id}@ INDI\n"
        gedcom += f"1 NAME {person.first_name} /{person.last_name}/\n"
        
        if person.gender == 'male':
            gedcom += "1 SEX M\n"
        elif person.gender == 'female':
            gedcom += "1 SEX F\n"
        
        if person.birth_date:
            gedcom += "1 BIRT\n"
            gedcom += f"2 DATE {person.birth_date.strftime('%d %b %Y').upper()}\n"
            if person.birth_place:
                gedcom += f"2 PLAC {person.birth_place}\n"
        
        if person.death_date:
            gedcom += "1 DEAT\n"
            gedcom += f"2 DATE {person.death_date.strftime('%d %b %Y').upper()}\n"
            if person.death_place:
                gedcom += f"2 PLAC {person.death_place}\n"
        
        if person.occupation:
            gedcom += f"1 OCCU {person.occupation}\n"
    
    # Családok (házasságok)
    for i, marriage in enumerate(marriages, 1):
        gedcom += f"0 @F{i}@ FAM\n"
        gedcom += f"1 HUSB @I{marriage.person1_id}@\n"
        gedcom += f"1 WIFE @I{marriage.person2_id}@\n"
        
        if marriage.start_date:
            gedcom += "1 MARR\n"
            gedcom += f"2 DATE {marriage.start_date.strftime('%d %b %Y').upper()}\n"
        
        # Gyerekek hozzáadása (parent_family_id alapján)
        children = Person.query.filter(
            Person.parent_family_id == marriage.id
        ).all()
        
        for child in children:
            gedcom += f"1 CHIL @I{child.id}@\n"
    
    gedcom += "0 TRLR\n"
    
    return gedcom, 200, {'Content-Type': 'text/plain; charset=utf-8', 
                         'Content-Disposition': 'attachment; filename=family_tree.ged'}


@api_bp.route('/export/json', methods=['GET'])
def export_json():
    """Export JSON formátumban"""
    persons = Person.query.filter(not_deleted_filter(Person, 'person')).all()
    marriages = Marriage.query.filter(not_deleted_filter(Marriage, 'marriage')).all()
    events = Event.query.filter(not_deleted_filter(Event, 'event')).all()
    
    data = {
        'persons': [p.to_dict() for p in persons],
        'marriages': [m.to_dict() for m in marriages],
        'events': [e.to_dict() for e in events],
        'export_date': datetime.utcnow().isoformat()
    }
    
    return jsonify(data)


@api_bp.route('/import/json', methods=['POST'])
def import_json():
    """Import JSON formátumból - teljes adatbázis csere"""
    import shutil
    from pathlib import Path
    
    data = request.get_json()
    
    # Adatbázis útvonal meghatározása
    db_path = Path(current_app.instance_path).parent / 'data' / 'familytree.db'
    backup_dir = Path(current_app.instance_path).parent / 'data' / 'backups'
    backup_dir.mkdir(parents=True, exist_ok=True)
    
    # Régi adatbázis mentése időbélyeggel
    if db_path.exists():
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_path = backup_dir / f'familytree_backup_{timestamp}.db'
        shutil.copy2(db_path, backup_path)
    
    # ÖSSZES meglévő adat törlése
    try:
        Marriage.query.delete()
        Event.query.delete()
        Document.query.delete()
        DeletedRecord.query.delete()
        Person.query.delete()
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Törlés hiba: {str(e)}'}), 500
    
    id_mapping = {}  # Régi ID -> Új ID mapping
    marriage_id_mapping = {}  # Régi marriage ID -> Új marriage ID mapping
    persons_with_parents = []  # (person, old_father_id, old_mother_id, old_parent_family_id)
    
    # 1. LÉPÉS: Személyek importálása szülők nélkül
    for person_data in data.get('persons', []):
        old_id = person_data.pop('id', None)
        
        # Számított mezők eltávolítása (ezeket a to_dict() generálja, de nem DB oszlopok)
        for field in ['full_name', 'display_name', 'age', 'is_alive', 'created_at', 'updated_at', 
                      'spouse_family_ids', 'parents']:
            person_data.pop(field, None)
        
        # Dátumok konvertálása
        if person_data.get('birth_date'):
            try:
                person_data['birth_date'] = datetime.fromisoformat(person_data['birth_date']).date()
            except:
                person_data['birth_date'] = None
        if person_data.get('death_date'):
            try:
                person_data['death_date'] = datetime.fromisoformat(person_data['death_date']).date()
            except:
                person_data['death_date'] = None
        
        # Egyéni mezők - MINDIG stringgé alakítjuk ha dict
        if 'custom_fields' in person_data:
            if isinstance(person_data['custom_fields'], dict):
                person_data['custom_fields'] = json.dumps(person_data['custom_fields'])
            elif person_data['custom_fields'] is None:
                person_data['custom_fields'] = '{}'
        
        # Szülő ID-k elmentése és eltávolítása (legacy és új modell)
        old_father_id = person_data.pop('father_id', None)
        old_mother_id = person_data.pop('mother_id', None)
        old_parent_family_id = person_data.pop('parent_family_id', None)
        person_data.pop('adoptive_family_id', None)  # Majd később állítjuk be
        
        try:
            person = Person(**person_data)
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': f'Person létrehozás hiba: {str(e)}', 'fields': list(person_data.keys())}), 500
        db.session.add(person)
        db.session.flush()
        
        if old_id:
            id_mapping[old_id] = person.id
        
        persons_with_parents.append((person, old_father_id, old_mother_id, old_parent_family_id))
    
    # 2. LÉPÉS: Házasságok importálása (ELŐBB, mert a parent_family_id-hez kellenek)
    for marriage_data in data.get('marriages', []):
        old_marriage_id = marriage_data.get('id')
        old_person1_id = marriage_data.get('person1_id')
        old_person2_id = marriage_data.get('person2_id')
        
        if old_person1_id in id_mapping and old_person2_id in id_mapping:
            # Dátumok konvertálása
            start_date = None
            end_date = None
            if marriage_data.get('start_date'):
                try:
                    start_date = datetime.fromisoformat(marriage_data['start_date']).date()
                except:
                    pass
            if marriage_data.get('end_date'):
                try:
                    end_date = datetime.fromisoformat(marriage_data['end_date']).date()
                except:
                    pass
            
            marriage = Marriage(
                person1_id=id_mapping[old_person1_id],
                person2_id=id_mapping[old_person2_id],
                relationship_type=marriage_data.get('relationship_type', 'marriage'),
                status=marriage_data.get('status', 'active'),
                start_date=start_date,
                end_date=end_date,
                end_reason=marriage_data.get('end_reason'),
                marriage_place=marriage_data.get('marriage_place'),
                notes=marriage_data.get('notes')
            )
            db.session.add(marriage)
            db.session.flush()
            
            # Marriage ID mapping mentése
            if old_marriage_id:
                marriage_id_mapping[old_marriage_id] = marriage.id
    
    # 3. LÉPÉS: Szülő kapcsolatok frissítése az új modell szerint
    # Segéd: Család keresése/létrehozása szülőpárhoz
    def find_or_create_family(father_id, mother_id):
        """Megkeresi vagy létrehozza a családot a szülőpár alapján"""
        if not father_id or not mother_id:
            return None
        
        # Keressük meg a meglévő családot
        existing = Marriage.query.filter(
            ((Marriage.person1_id == father_id) & (Marriage.person2_id == mother_id)) |
            ((Marriage.person1_id == mother_id) & (Marriage.person2_id == father_id))
        ).first()
        
        if existing:
            return existing.id
        
        # Hozzunk létre újat
        new_family = Marriage(
            person1_id=father_id,
            person2_id=mother_id,
            relationship_type='partnership',
            status='active'
        )
        db.session.add(new_family)
        db.session.flush()
        return new_family.id
    
    for person, old_father_id, old_mother_id, old_parent_family_id in persons_with_parents:
        # Ha van parent_family_id, használjuk azt
        if old_parent_family_id and old_parent_family_id in marriage_id_mapping:
            person.parent_family_id = marriage_id_mapping[old_parent_family_id]
        # Ha legacy father_id/mother_id van, konvertáljuk parent_family_id-re
        elif old_father_id and old_mother_id:
            new_father_id = id_mapping.get(old_father_id)
            new_mother_id = id_mapping.get(old_mother_id)
            if new_father_id and new_mother_id:
                person.parent_family_id = find_or_create_family(new_father_id, new_mother_id)
    
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Mentés hiba: {str(e)}'}), 500
    
    return jsonify({
        'message': 'Import sikeres',
        'imported_persons': len(data.get('persons', [])),
        'imported_marriages': len(data.get('marriages', [])),
        'backup_created': str(backup_path) if db_path.exists() else None
    })


# ==================== KERESÉS API ====================

@api_bp.route('/search', methods=['GET'])
def search():
    """Keresés személyek között"""
    query = request.args.get('q', '')
    
    if len(query) < 2:
        return jsonify([])
    
    persons = Person.query.filter(not_deleted_filter(Person, 'person')).filter(
        (Person.first_name.ilike(f'%{query}%')) |
        (Person.last_name.ilike(f'%{query}%')) |
        (Person.maiden_name.ilike(f'%{query}%')) |
        (Person.nickname.ilike(f'%{query}%'))
    ).limit(20).all()
    
    return jsonify([p.to_dict() for p in persons])


# ==================== STATISZTIKÁK API ====================

@api_bp.route('/stats', methods=['GET'])
def get_stats():
    """Statisztikák lekérdezése"""
    active_persons = Person.query.filter(not_deleted_filter(Person, 'person'))
    total_persons = active_persons.count()
    living_persons = active_persons.filter(Person.death_date.is_(None)).count()
    male_count = active_persons.filter_by(gender='male').count()
    female_count = active_persons.filter_by(gender='female').count()
    marriages_count = Marriage.query.filter(not_deleted_filter(Marriage, 'marriage')).count()
    
    # Legidősebb személy
    oldest_living = active_persons.filter(
        Person.death_date.is_(None),
        Person.birth_date.isnot(None)
    ).order_by(Person.birth_date).first()
    
    # Generációk száma (becsült)
    earliest_birth = active_persons.filter(Person.birth_date.isnot(None)).order_by(Person.birth_date).first()
    latest_birth = active_persons.filter(Person.birth_date.isnot(None)).order_by(Person.birth_date.desc()).first()
    
    generations = 1
    if earliest_birth and latest_birth and earliest_birth.birth_date and latest_birth.birth_date:
        years_span = (latest_birth.birth_date.year - earliest_birth.birth_date.year)
        generations = max(1, years_span // 25 + 1)
    
    return jsonify({
        'total_persons': total_persons,
        'living_persons': living_persons,
        'deceased_persons': total_persons - living_persons,
        'male_count': male_count,
        'female_count': female_count,
        'unknown_gender_count': total_persons - male_count - female_count,
        'marriages_count': marriages_count,
        'estimated_generations': generations,
        'oldest_living': oldest_living.to_dict() if oldest_living else None
    })


# ==================== LOMTÁR / VISSZAÁLLÍTÁS API ====================

def _entity_to_dict(entity_type, entity_id):
    """Segédfüggvény: visszaadja az entitás to_dict-jét, ha létezik."""
    model_map = {
        'person': Person,
        'marriage': Marriage,
        'event': Event,
        'document': Document
    }
    model = model_map.get(entity_type)
    if not model:
        return None
    instance = model.query.get(entity_id)
    return instance.to_dict() if instance else None


@api_bp.route('/trash', methods=['GET'])
def list_trash():
    """Lomtár tartalmának listázása"""
    deleted = DeletedRecord.query.order_by(DeletedRecord.deleted_at.desc()).all()
    result = []

    for rec in deleted:
        item = rec.to_dict()
        item['data'] = _entity_to_dict(rec.entity_type, rec.entity_id)
        result.append(item)

    return jsonify(result)


@api_bp.route('/trash/restore', methods=['POST'])
def restore_from_trash():
    """Entitás visszaállítása a lomtárból"""
    data = request.get_json() or {}
    entity_type = data.get('entity_type')
    entity_id = data.get('entity_id')

    if not entity_type or entity_id is None:
        return jsonify({'error': 'Hiányzó paraméter'}), 400

    record = DeletedRecord.query.filter_by(entity_type=entity_type, entity_id=entity_id).first()
    if not record:
        return jsonify({'error': 'Nem található a lomtárban'}), 404

    db.session.delete(record)
    db.session.commit()

    return jsonify({'status': 'restored', 'entity_type': entity_type, 'entity_id': entity_id})


@api_bp.route('/trash/delete', methods=['POST'])
def delete_permanently():
    """Entitás végleges törlése az adatbázisból"""
    data = request.get_json() or {}
    entity_type = data.get('entity_type')
    entity_id = data.get('entity_id')

    if not entity_type or entity_id is None:
        return jsonify({'error': 'Hiányzó paraméter'}), 400

    # Lomtár bejegyzés törlése
    record = DeletedRecord.query.filter_by(entity_type=entity_type, entity_id=entity_id).first()
    if record:
        db.session.delete(record)

    # Entitás törlése az adatbázisból
    model_map = {
        'person': Person,
        'marriage': Marriage,
        'event': Event,
        'document': Document
    }
    model = model_map.get(entity_type)
    if model:
        instance = model.query.get(entity_id)
        if instance:
            db.session.delete(instance)
    
    db.session.commit()

    return jsonify({'status': 'deleted', 'entity_type': entity_type, 'entity_id': entity_id})
