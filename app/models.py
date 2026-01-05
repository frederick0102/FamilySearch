from app import db
from datetime import datetime

class Person(db.Model):
    """Személy adatmodell - minden családtag"""
    __tablename__ = 'persons'
    
    id = db.Column(db.Integer, primary_key=True)
    
    # Alapadatok
    first_name = db.Column(db.String(100), nullable=False)
    middle_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100), nullable=False)
    maiden_name = db.Column(db.String(100))  # Leánykori név
    nickname = db.Column(db.String(100))  # Becenév
    
    # Nem
    gender = db.Column(db.String(20), default='unknown')  # male, female, unknown
    
    # Születési adatok
    birth_date = db.Column(db.Date)
    birth_date_approximate = db.Column(db.Boolean, default=False)  # Becsült dátum
    birth_place = db.Column(db.String(200))
    birth_country = db.Column(db.String(100))
    
    # Halálozási adatok
    death_date = db.Column(db.Date)
    death_date_approximate = db.Column(db.Boolean, default=False)
    death_place = db.Column(db.String(200))
    death_country = db.Column(db.String(100))
    death_cause = db.Column(db.String(500))  # Halál oka
    burial_place = db.Column(db.String(200))  # Temetkezési hely
    
    # Életrajzi adatok
    occupation = db.Column(db.String(200))  # Foglalkozás
    education = db.Column(db.String(300))  # Iskolai végzettség
    religion = db.Column(db.String(100))  # Vallás
    nationality = db.Column(db.String(100))  # Nemzetiség
    
    # Elérhetőségek (élő személyeknél)
    email = db.Column(db.String(200))
    phone = db.Column(db.String(50))
    address = db.Column(db.String(300))
    
    # Megjegyzések és egyéb
    biography = db.Column(db.Text)  # Életrajz
    notes = db.Column(db.Text)  # Megjegyzések
    
    # Média
    photo_path = db.Column(db.String(500))  # Profilkép útvonal
    
    # Metaadatok
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Egyéni mezők (JSON formátumban)
    custom_fields = db.Column(db.Text)  # JSON string egyéni mezőkhöz
    
    # Kapcsolatok - szülők
    father_id = db.Column(db.Integer, db.ForeignKey('persons.id'))
    mother_id = db.Column(db.Integer, db.ForeignKey('persons.id'))
    
    # Kapcsolatok definiálása
    father = db.relationship('Person', foreign_keys=[father_id], remote_side=[id], backref='children_as_father')
    mother = db.relationship('Person', foreign_keys=[mother_id], remote_side=[id], backref='children_as_mother')
    
    @property
    def full_name(self):
        # Magyar sorrend: vezetéknév + keresztnév (+ középső név)
        parts = [self.last_name, self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        return ' '.join(parts)
    
    @property
    def display_name(self):
        # Alap a magyar sorrendű teljes név
        name = self.full_name
        if self.maiden_name:
            name += f' (szül. {self.maiden_name})'
        return name
    
    @property
    def age(self):
        if not self.birth_date:
            return None
        end_date = self.death_date if self.death_date else datetime.now().date()
        age = end_date.year - self.birth_date.year
        if end_date.month < self.birth_date.month or (end_date.month == self.birth_date.month and end_date.day < self.birth_date.day):
            age -= 1
        return age
    
    @property
    def is_alive(self):
        return self.death_date is None
    
    @property
    def children(self):
        """Visszaadja a személy összes gyermekét"""
        if self.gender == 'male':
            return self.children_as_father
        elif self.gender == 'female':
            return self.children_as_mother
        else:
            return list(set(self.children_as_father + self.children_as_mother))
    
    def to_dict(self):
        import json
        return {
            'id': self.id,
            'first_name': self.first_name,
            'middle_name': self.middle_name,
            'last_name': self.last_name,
            'maiden_name': self.maiden_name,
            'nickname': self.nickname,
            'full_name': self.full_name,
            'display_name': self.display_name,
            'gender': self.gender,
            'birth_date': self.birth_date.isoformat() if self.birth_date else None,
            'birth_date_approximate': self.birth_date_approximate,
            'birth_place': self.birth_place,
            'birth_country': self.birth_country,
            'death_date': self.death_date.isoformat() if self.death_date else None,
            'death_date_approximate': self.death_date_approximate,
            'death_place': self.death_place,
            'death_country': self.death_country,
            'death_cause': self.death_cause,
            'burial_place': self.burial_place,
            'occupation': self.occupation,
            'education': self.education,
            'religion': self.religion,
            'nationality': self.nationality,
            'email': self.email,
            'phone': self.phone,
            'address': self.address,
            'biography': self.biography,
            'notes': self.notes,
            'photo_path': self.photo_path,
            'father_id': self.father_id,
            'mother_id': self.mother_id,
            'age': self.age,
            'is_alive': self.is_alive,
            'custom_fields': json.loads(self.custom_fields) if self.custom_fields else {},
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Marriage(db.Model):
    """Házasságok és partnerkapcsolatok"""
    __tablename__ = 'marriages'
    
    id = db.Column(db.Integer, primary_key=True)
    
    # Partnerek
    person1_id = db.Column(db.Integer, db.ForeignKey('persons.id'), nullable=False)
    person2_id = db.Column(db.Integer, db.ForeignKey('persons.id'), nullable=False)
    
    # Kapcsolat típusa
    relationship_type = db.Column(db.String(50), default='marriage')  # marriage, partnership, engagement
    
    # Dátumok
    start_date = db.Column(db.Date)  # Házasságkötés dátuma
    end_date = db.Column(db.Date)  # Válás/özvegység dátuma
    end_reason = db.Column(db.String(50))  # divorce, death, annulment
    
    # Helyszín
    marriage_place = db.Column(db.String(200))
    
    # Megjegyzések
    notes = db.Column(db.Text)
    
    # Kapcsolatok
    person1 = db.relationship('Person', foreign_keys=[person1_id], backref='marriages_as_person1')
    person2 = db.relationship('Person', foreign_keys=[person2_id], backref='marriages_as_person2')
    
    def to_dict(self):
        return {
            'id': self.id,
            'person1_id': self.person1_id,
            'person2_id': self.person2_id,
            'person1_name': self.person1.full_name if self.person1 else None,
            'person2_name': self.person2.full_name if self.person2 else None,
            'relationship_type': self.relationship_type,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'end_reason': self.end_reason,
            'marriage_place': self.marriage_place,
            'notes': self.notes
        }


class Event(db.Model):
    """Életesemények (keresztelő, konfirmáció, diplomázás, stb.)"""
    __tablename__ = 'events'
    
    id = db.Column(db.Integer, primary_key=True)
    person_id = db.Column(db.Integer, db.ForeignKey('persons.id'), nullable=False)
    
    event_type = db.Column(db.String(100), nullable=False)  # baptism, confirmation, graduation, military, immigration, etc.
    event_date = db.Column(db.Date)
    event_place = db.Column(db.String(200))
    description = db.Column(db.Text)
    
    # Kapcsolat
    person = db.relationship('Person', backref='events')
    
    def to_dict(self):
        return {
            'id': self.id,
            'person_id': self.person_id,
            'event_type': self.event_type,
            'event_date': self.event_date.isoformat() if self.event_date else None,
            'event_place': self.event_place,
            'description': self.description
        }


class Document(db.Model):
    """Dokumentumok és média (fényképek, iratok, stb.)"""
    __tablename__ = 'documents'
    
    id = db.Column(db.Integer, primary_key=True)
    person_id = db.Column(db.Integer, db.ForeignKey('persons.id'))
    
    document_type = db.Column(db.String(50))  # photo, certificate, letter, etc.
    title = db.Column(db.String(200))
    description = db.Column(db.Text)
    file_path = db.Column(db.String(500), nullable=False)
    file_type = db.Column(db.String(50))  # image, pdf, etc.
    upload_date = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Kapcsolat
    person = db.relationship('Person', backref='documents')
    
    def to_dict(self):
        return {
            'id': self.id,
            'person_id': self.person_id,
            'document_type': self.document_type,
            'title': self.title,
            'description': self.description,
            'file_path': self.file_path,
            'file_type': self.file_type,
            'upload_date': self.upload_date.isoformat() if self.upload_date else None
        }


class TreeSettings(db.Model):
    """Családfa megjelenítési beállítások"""
    __tablename__ = 'tree_settings'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), default='default')
    
    # Színek
    male_color = db.Column(db.String(20), default='#4A90D9')
    female_color = db.Column(db.String(20), default='#D94A8C')
    unknown_color = db.Column(db.String(20), default='#808080')
    deceased_opacity = db.Column(db.Float, default=0.7)
    
    # Kapcsolat vonalak
    line_color = db.Column(db.String(20), default='#666666')
    line_width = db.Column(db.Integer, default=2)
    marriage_line_style = db.Column(db.String(20), default='solid')  # solid, dashed
    
    # Kártyák
    card_width = db.Column(db.Integer, default=200)
    card_height = db.Column(db.Integer, default=100)
    card_border_radius = db.Column(db.Integer, default=8)
    show_photos = db.Column(db.Boolean, default=True)
    show_dates = db.Column(db.Boolean, default=True)
    show_places = db.Column(db.Boolean, default=False)
    show_occupation = db.Column(db.Boolean, default=False)
    
    # Háttér
    background_color = db.Column(db.String(20), default='#F5F5F5')
    background_image = db.Column(db.String(500))
    
    # Betűtípus
    font_family = db.Column(db.String(100), default='Arial, sans-serif')
    font_size = db.Column(db.Integer, default=14)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'male_color': self.male_color,
            'female_color': self.female_color,
            'unknown_color': self.unknown_color,
            'deceased_opacity': self.deceased_opacity,
            'line_color': self.line_color,
            'line_width': self.line_width,
            'marriage_line_style': self.marriage_line_style,
            'card_width': self.card_width,
            'card_height': self.card_height,
            'card_border_radius': self.card_border_radius,
            'show_photos': self.show_photos,
            'show_dates': self.show_dates,
            'show_places': self.show_places,
            'show_occupation': self.show_occupation,
            'background_color': self.background_color,
            'background_image': self.background_image,
            'font_family': self.font_family,
            'font_size': self.font_size
        }


class DeletedRecord(db.Model):
    """Soft delete jelölések: entitás típus + azonosító + törlés ideje"""
    __tablename__ = 'deleted_records'

    id = db.Column(db.Integer, primary_key=True)
    entity_type = db.Column(db.String(50), nullable=False)
    entity_id = db.Column(db.Integer, nullable=False)
    deleted_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None
        }
