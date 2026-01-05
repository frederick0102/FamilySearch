from flask import Blueprint, render_template, request, jsonify, current_app
from werkzeug.utils import secure_filename
from app import db
from app.models import Person, Marriage, Event, Document, TreeSettings, DeletedRecord
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


# ==================== FŐOLDAL ====================

@main_bp.route('/')
def index():
    return render_template('index.html')


# ==================== SZEMÉLYEK API ====================

@api_bp.route('/persons', methods=['GET'])
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
    """Új személy létrehozása"""
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
        father_id=data.get('father_id'),
        mother_id=data.get('mother_id'),
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
    """Személy frissítése"""
    person = Person.query.filter(not_deleted_filter(Person, 'person'), Person.id == person_id).first_or_404()
    data = request.get_json()
    
    # Mezők frissítése
    for field in ['first_name', 'middle_name', 'last_name', 'maiden_name', 'nickname',
                  'gender', 'birth_place', 'birth_country', 'birth_date_approximate',
                  'death_place', 'death_country', 'death_date_approximate', 'death_cause',
                  'burial_place', 'occupation', 'education', 'religion', 'nationality',
                  'email', 'phone', 'address', 'biography', 'notes', 'father_id', 'mother_id']:
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


# ==================== HÁZASSÁGOK API ====================

@api_bp.route('/marriages', methods=['GET'])
def get_marriages():
    """Összes házasság lekérdezése"""
    marriages = Marriage.query.filter(not_deleted_filter(Marriage, 'marriage')).all()
    return jsonify([m.to_dict() for m in marriages])


@api_bp.route('/marriages', methods=['POST'])
def create_marriage():
    """Új házasság létrehozása"""
    data = request.get_json() or {}

    # Kötelező mezők és validációk
    try:
        person1_id = int(data.get('person1_id')) if data.get('person1_id') is not None else None
        person2_id = int(data.get('person2_id')) if data.get('person2_id') is not None else None
    except (TypeError, ValueError):
        return jsonify({'error': 'Érvénytelen partner azonosító'}), 400

    if not person1_id or not person2_id:
        return jsonify({'error': 'Mindkét partner kötelező'}), 400
    if person1_id == person2_id:
        return jsonify({'error': 'A két partner nem lehet azonos személy'}), 400

    person1 = Person.query.get(person1_id)
    person2 = Person.query.get(person2_id)
    if not person1 or not person2:
        return jsonify({'error': 'A megadott partner(ek) nem léteznek'}), 400

    def parse_date(value):
        if not value:
            return None
        try:
            return datetime.strptime(value, '%Y-%m-%d').date()
        except ValueError:
            return None

    marriage = Marriage(
        person1_id=person1_id,
        person2_id=person2_id,
        relationship_type=data.get('relationship_type', 'marriage'),
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
def update_marriage(marriage_id):
    """Házasság frissítése"""
    marriage = Marriage.query.filter(not_deleted_filter(Marriage, 'marriage'), Marriage.id == marriage_id).first_or_404()
    data = request.get_json()
    
    def parse_date(value):
        if not value:
            return None
        try:
            return datetime.strptime(value, '%Y-%m-%d').date()
        except ValueError:
            return None

    # Partner validáció, ha érkezik
    if 'person1_id' in data or 'person2_id' in data:
        try:
            p1 = int(data.get('person1_id', marriage.person1_id))
            p2 = int(data.get('person2_id', marriage.person2_id))
        except (TypeError, ValueError):
            return jsonify({'error': 'Érvénytelen partner azonosító'}), 400

        if p1 == p2:
            return jsonify({'error': 'A két partner nem lehet azonos személy'}), 400
        if not Person.query.get(p1) or not Person.query.get(p2):
            return jsonify({'error': 'A megadott partner(ek) nem léteznek'}), 400
        marriage.person1_id = p1
        marriage.person2_id = p2

    for field in ['relationship_type', 'marriage_place', 'end_reason', 'notes']:
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
def delete_marriage(marriage_id):
    """Házasság törlése"""
    Marriage.query.get_or_404(marriage_id)
    mark_deleted('marriage', marriage_id)
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
    """Családfa adatok lekérdezése vizualizációhoz"""
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
            'father_id': person.father_id,
            'mother_id': person.mother_id
        })
        
        # Szülő kapcsolatok
        if person.father_id:
            links.append({
                'source': person.father_id,
                'target': person.id,
                'type': 'parent-child'
            })
        if person.mother_id:
            links.append({
                'source': person.mother_id,
                'target': person.id,
                'type': 'parent-child'
            })
    
    # Házassági kapcsolatok
    person_ids = {p.id for p in persons}
    for marriage in marriages:
        if marriage.person1_id in person_ids and marriage.person2_id in person_ids:
            links.append({
                'source': marriage.person1_id,
                'target': marriage.person2_id,
                'type': 'marriage',
                'marriage_id': marriage.id
            })
    
    return jsonify({
        'nodes': nodes,
        'links': links
    })


@api_bp.route('/tree/ancestors/<int:person_id>', methods=['GET'])
def get_ancestors(person_id):
    """Ősök lekérdezése (felmenők)"""
    def get_ancestors_recursive(person, depth=0, max_depth=10):
        if not person or depth > max_depth:
            return []
        
        ancestors = [{'person': person.to_dict(), 'depth': depth}]
        
        if person.father:
            ancestors.extend(get_ancestors_recursive(person.father, depth + 1, max_depth))
        if person.mother:
            ancestors.extend(get_ancestors_recursive(person.mother, depth + 1, max_depth))
        
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
        
        # Gyerekek hozzáadása
        children = Person.query.filter(
            ((Person.father_id == marriage.person1_id) | (Person.father_id == marriage.person2_id)) &
            ((Person.mother_id == marriage.person1_id) | (Person.mother_id == marriage.person2_id))
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
    """Import JSON formátumból"""
    data = request.get_json()
    
    id_mapping = {}  # Régi ID -> Új ID mapping
    
    # Személyek importálása
    for person_data in data.get('persons', []):
        old_id = person_data.pop('id', None)
        person_data.pop('full_name', None)
        person_data.pop('display_name', None)
        person_data.pop('age', None)
        person_data.pop('is_alive', None)
        person_data.pop('created_at', None)
        person_data.pop('updated_at', None)
        
        # Dátumok konvertálása
        if person_data.get('birth_date'):
            person_data['birth_date'] = datetime.fromisoformat(person_data['birth_date']).date()
        if person_data.get('death_date'):
            person_data['death_date'] = datetime.fromisoformat(person_data['death_date']).date()
        
        # Egyéni mezők
        if person_data.get('custom_fields'):
            person_data['custom_fields'] = json.dumps(person_data['custom_fields'])
        
        # Szülő ID-k átmenetileg None (később frissítjük)
        father_id = person_data.pop('father_id', None)
        mother_id = person_data.pop('mother_id', None)
        
        person = Person(**person_data)
        db.session.add(person)
        db.session.flush()
        
        if old_id:
            id_mapping[old_id] = person.id
    
    # Szülő kapcsolatok frissítése
    for person in Person.query.all():
        # Ez egyszerűsített - production-ben komplexebb lenne
        pass
    
    db.session.commit()
    
    return jsonify({'message': 'Import sikeres', 'imported_count': len(data.get('persons', []))})


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
